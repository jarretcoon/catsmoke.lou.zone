import * as THREE from 'three';
import type { WorldBuilder } from './builder';

/**
 * Tower glass with rooms behind it: parallax interior mapping patched into the standard facade material,
 * plus a crown up-light wash after dark.
 *
 * Every facade pixel that is glass (the roughness map marks glass as very glossy) casts its view ray into a
 * box room the size of one window bay (3.6 m wide, one floor tall, `depth` m deep): back wall, side walls,
 * carpet and ceiling, a bed/sofa card, a floor lamp, half-drawn curtains. The room's light comes from the
 * facade's own emissive map sampled at that window, so the lit/dark pattern, warm/cool/TV colours and the
 * far-away look all agree. Far away (a bay under ~6 px) the rooms fade back to the flat emissive windows.
 *
 * The tangent frame comes from screen-space derivatives, so it works on merged world-space geometry with
 * only position/normal/uv (the static batcher drops anything else) and on any UV layout.
 * One program for every facade (same patch function, per-material values are uniforms), no extra draw calls.
 */

const shared = {
  uFacNight: { value: 0 },
  uFacTime: { value: 0 },
};

const hooked = new WeakSet<WorldBuilder>();
function hookUpdates(b: WorldBuilder): void {
  if (hooked.has(b)) return;
  hooked.add(b);
  b.every((_dt, t, night) => {
    shared.uFacNight.value = night;
    shared.uFacTime.value = t % 3600;
  });
}

export interface InteriorOpts {
  /** Facade tile size in window bays (FacadeSpec cols/rows). */
  cols: number;
  rows: number;
  /** Room depth in metres. */
  depth?: number;
  /** UV v is measured from the tower roof down (towerWalls): enables the crown wash. */
  topRef?: boolean;
  /** Crown wash colour (linear-ish multiplier) and how far down the facade it reaches, in metres. */
  wash?: THREE.ColorRepresentation;
  washStrength?: number;
  washZone?: number;
}

interface FacUniforms {
  uCells: { value: THREE.Vector2 };
  uRoomDepth: { value: number };
  uTopRef: { value: number };
  uWash: { value: THREE.Color };
  uWashZone: { value: number };
}

const HEAD = /* glsl */ `
uniform vec2 uCells;
uniform float uRoomDepth;
uniform float uTopRef;
uniform vec3 uWash;
uniform float uWashZone;
uniform float uFacNight;
uniform float uFacTime;
float facHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
`;

const BODY = /* glsl */ `
#if defined( USE_MAP ) && defined( USE_EMISSIVEMAP ) && defined( USE_ROUGHNESSMAP )
{
  vec2 cellUv = vMapUv * uCells;
  vec2 cellFw = fwidth(cellUv);
  // Fade the rooms out where a bay is only a few pixels wide (no shimmering, flat windows take over)
  float facLod = 1.0 - smoothstep(0.09, 0.2, max(cellFw.x, cellFw.y));
  vec3 facWN = inverseTransformDirection(normal, viewMatrix);
  float facWall = 1.0 - smoothstep(0.25, 0.45, abs(facWN.y)); // sloped/flat faces (pyramid, roofs) keep the flat look
  float facGlass = 1.0 - smoothstep(0.1, 0.3, texelRoughness.g);
  float facNear = facLod * facWall;
  float facK = facNear * facGlass;
  // Up close only the rooms glow: frames and mullions stop carrying the flat window light
  totalEmissiveRadiance *= 1.0 - facNear * (1.0 - facGlass);
  // Derivatives up front: they are undefined inside branches that differ across a pixel quad
  vec3 pV = -vViewPosition;
  vec3 dp1 = dFdx(pV);
  vec3 dp2 = dFdy(pV);
  vec2 du1 = dFdx(cellUv);
  vec2 du2 = dFdy(cellUv);

  if (facK > 0.002) {
    // ---------------- tangent frame from derivatives: gradients of the bay coordinates per metre
    vec3 N = normal;
    vec3 dp2perp = cross(dp2, N);
    vec3 dp1perp = cross(N, dp1);
    float det = dot(dp1, dp2perp);
    det = abs(det) < 1e-14 ? 1e-14 : det;
    vec3 gU = (dp2perp * du1.x + dp1perp * du2.x) / det;
    vec3 gV = (dp2perp * du1.y + dp1perp * du2.y) / det;
    vec3 rd = normalize(pV);
    vec3 d = vec3(dot(gU, rd), dot(gV, rd), max(-dot(N, rd), 0.02) / uRoomDepth);
    vec3 dS = (step(0.0, d) * 2.0 - 1.0) * max(abs(d), vec3(1e-5));
    vec3 o = vec3(fract(cellUv), 0.0);

    // ---------------- the room box [0,1]^3 (x along the bay, y floor->ceiling, z into the room)
    vec3 kk = (step(0.0, dS) - o) / dS;
    float t = min(min(kk.x, kk.y), kk.z);
    vec3 h = o + dS * t;

    vec2 cid = floor(cellUv);
    float h1 = facHash(cid);
    float h2 = facHash(cid + 17.31);
    float h3 = facHash(cid + 41.73);
    float h4 = facHash(cid + 73.19);

    // Room light = this window's colour in the emissive map (agrees with the far look and the night pattern)
    vec2 winUv = (cid + vec2(0.5, 0.42)) / uCells;
    vec3 L = textureLod(emissiveMap, winUv, 0.0).rgb;
    float Lmax = max(max(L.r, L.g), L.b);
    float tv = smoothstep(0.25, 0.5, L.b - max(L.r, L.g));
    float cool = smoothstep(0.02, 0.1, L.b - L.r) * (1.0 - tv);
    float flick = 0.55 + 0.45 * sin(uFacTime * 7.3 + h1 * 40.0) * sin(uFacTime * 2.9 + h2 * 23.0);

    // Surfaces
    vec3 wallA = mix(vec3(0.80, 0.73, 0.62), vec3(0.62, 0.66, 0.70), step(0.6, h2));
    wallA = mix(wallA, vec3(0.55, 0.36, 0.30), step(0.88, h2));
    vec3 floorA = mix(vec3(0.28, 0.20, 0.15), vec3(0.32, 0.31, 0.34), h3);
    vec3 alb;
    float shade;
    bool back = kk.z <= min(kk.x, kk.y);
    bool side = !back && kk.x <= kk.y;
    if (back) {
      alb = wallA;
      shade = 0.85;
      // headboard / framed art band on the back wall
      float art = step(0.45, h.y) * step(h.y, 0.62) * step(0.3, h.x) * step(h.x, 0.7);
      alb = mix(alb, vec3(0.25, 0.22, 0.2) + 0.4 * vec3(h3, h1, h4), art * step(0.4, h4));
      float head = step(h.y, 0.36) * step(0.18, h.x) * step(h.x, 0.82);
      alb = mix(alb, alb * 0.55, head);
    } else if (side) {
      alb = wallA * 0.95;
      shade = 0.6;
    } else if (h.y < 0.5) {
      alb = floorA;
      shade = 0.6;
    } else {
      alb = vec3(0.86, 0.85, 0.82);
      shade = 0.8;
    }

    // Lamp: warm rooms have a floor lamp in a back corner, cool rooms a ceiling downlight
    float lx = h1 < 0.5 ? 0.14 : 0.86;
    vec3 lampP = mix(vec3(lx, 0.55, 0.82), vec3(0.5, 0.97, 0.45), cool);
    vec3 dl = (h - lampP) * vec3(3.6, 3.2, uRoomDepth);
    float pool = 0.25 + 2.0 / (1.0 + dot(dl, dl) * 0.6);
    vec3 Lroom = L * emissive;
    Lroom *= mix(1.0, flick, tv);
    vec3 dayI = vec3(0.30, 0.31, 0.33) * (1.0 - uFacNight) * (1.15 - 0.8 * h.z);
    vec3 nightAmb = vec3(0.018, 0.015, 0.024) * uFacNight;
    vec3 col = alb * shade * (Lroom * pool + dayI + nightAmb);
    // TV on the back wall
    if (back) {
      float scr = step(0.36, h.x) * step(h.x, 0.64) * step(0.3, h.y) * step(h.y, 0.5);
      col = mix(col, vec3(0.6, 0.75, 1.0) * Lmax * flick * 2.2 * emissive + vec3(0.01), scr * tv);
    }

    // Bed or sofa card part way into the room
    float zf = 0.5 + 0.2 * h3;
    float tf = zf / dS.z;
    if (tf < t) {
      vec3 hf = o + dS * tf;
      float x0 = 0.1 + 0.25 * h4;
      float x1 = x0 + 0.42 + 0.2 * h2;
      float inX = step(x0, hf.x) * step(hf.x, x1);
      float sofa = step(0.5, h3);
      float topY = sofa > 0.5 ? (hf.x > x0 + 0.04 && hf.x < x1 - 0.04 ? 0.3 : 0.2) : 0.19;
      float body = inX * step(hf.y, topY);
      if (body > 0.5) {
        vec3 fA = sofa > 0.5 ? vec3(0.35, 0.3, 0.28) : vec3(0.85, 0.83, 0.8);
        vec3 dlf = (hf - lampP) * vec3(3.6, 3.2, uRoomDepth);
        float pf = 0.3 + 1.4 / (1.0 + dot(dlf, dlf) * 0.45);
        col = fA * (Lroom * pf * 0.8 + dayI * 0.7 + nightAmb);
        t = tf;
      }
    }
    // Floor lamp (pole + glowing shade) near the back wall
    float tl = 0.8 / dS.z;
    if (tl < t && cool < 0.5 && Lmax > 0.02) {
      vec3 hl = o + dS * tl;
      float ax = abs(hl.x - lx);
      float shadeM = step(0.42, hl.y) * step(hl.y, 0.56) * step(ax, 0.05 + (0.56 - hl.y) * 0.25);
      float pole = step(ax, 0.008) * step(hl.y, 0.44);
      col = mix(col, vec3(0.08, 0.07, 0.06) * (Lroom + dayI), pole);
      col = mix(col, Lroom * 2.6 + dayI * 0.6, shadeM);
    }

    // Curtains just behind the glass: half-drawn panels on some windows, a sheer on a few
    float tc = 0.05 / dS.z;
    vec2 hc = o.xy + dS.xy * tc;
    float cl = h4 < 0.3 ? 0.18 + 0.28 * h1 : (h4 < 0.5 ? 0.07 : 0.0);
    float cr = h4 < 0.3 ? 0.16 + 0.28 * h3 : (h4 < 0.5 ? 0.07 : 0.0);
    float panel = max(step(hc.x, cl), step(1.0 - cr, hc.x));
    float sheer = step(0.94, h4);
    float folds = 0.84 + 0.16 * sin(hc.x * 48.0 + h2 * 6.0);
    vec3 cA = mix(vec3(0.84, 0.79, 0.7), vec3(0.5, 0.46, 0.43), step(0.7, h3));
    vec3 cCol = cA * folds * (Lroom * 0.55 + dayI * 1.2 + nightAmb * 2.0);
    col = mix(col, cCol, max(panel, sheer * 0.65));

    // Glass: tinted, and the reflection takes over at grazing angles
    float NdV = clamp(dot(N, normalize(vViewPosition)), 0.0, 1.0);
    float fres = pow(1.0 - NdV, 4.0);
    vec3 tint = mix(vec3(1.0), diffuseColor.rgb / max(max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)), 0.04), 0.45);
    vec3 interior = clamp(col, 0.0, 12.0) * tint * (1.0 - fres) * 0.92;
    totalEmissiveRadiance = mix(totalEmissiveRadiance, interior, facK);
  }

  // ---------------- crown wash: fixtures at the foot of the crown zone throw cones up the facade
  if (uTopRef > 0.5 && uFacNight > 0.01) {
    float dTop = max(0.0, -vMapUv.y * uCells.y * 3.2);
    float above = uWashZone - dTop;
    if (above > 0.0) {
      float bx = abs(fract(cellUv.x) - 0.5) * 3.6;
      float cone = 1.0 - smoothstep(0.0, 0.5 + above * 0.32, bx);
      cone = mix(0.6, cone, facLod);
      float wash = smoothstep(0.0, 1.2, above) * (0.3 + 0.7 * cone) * (1.0 - 0.6 * above / max(uWashZone, 1.0));
      vec3 facAlb = diffuseColor.rgb * (1.0 - metalnessFactor) + 0.22 * metalnessFactor;
      totalEmissiveRadiance += uWash * (wash * uFacNight) * facAlb;
    }
  }
}
#endif
`;

/** The patch: identical for every facade so they all share one compiled program. */
function patchFacade(this: THREE.Material, shader: THREE.WebGLProgramParametersWithUniforms): void {
  const u = this.userData.facU as FacUniforms;
  Object.assign(shader.uniforms, u, shared);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${HEAD}`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${BODY}`);
}

const HASH = /* glsl */ `
float facHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
`;

/** Adds a world-position varying to a basic material's vertex shader. */
function worldVarying(s: THREE.WebGLProgramParametersWithUniforms, name: string): void {
  s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\nvarying vec3 ${name};`).replace('#include <begin_vertex>', `#include <begin_vertex>\n${name} = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
}

/**
 * Red aviation-obstruction lights (FAA L-864): each tower flashes on its own clock, 20–40 times a minute,
 * with the soft rise and fall of an incandescent lamp. The phase comes from where the light stands, so the
 * merged beacons of the whole Strip stay one material and one draw call per map cell.
 */
export function beaconShader(b: WorldBuilder): THREE.MeshBasicMaterial {
  hookUpdates(b);
  const m = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, shared);
    worldVarying(s, 'vBW');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vBW;\nuniform float uFacNight;\nuniform float uFacTime;\n${HASH}`)
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        /* glsl */ `
        float bId = facHash(floor(vBW.xz / 48.0) + 3.7);
        float bPer = 1.5 + bId * 1.5;
        float bC = fract(uFacTime / bPer + bId);
        float bOn = smoothstep(0.0, 0.07, bC) * (1.0 - smoothstep(0.28, 0.5, bC));
        float bK = mix(0.14 + uFacNight * 0.05, 1.0 + uFacNight * 2.2, bOn);
        vec4 diffuseColor = vec4(bK, bK * 0.07, bK * 0.04, opacity);`,
      );
  };
  return m;
}

/**
 * A giant building-wrap LED screen (Resorts World): procedural shows that cycle (sweeping bands, rising
 * pulses, sparkle), a visible LED pitch up close, and the guest-room windows cut out of it so the rooms
 * behind still show. Content runs in world metres so it flows across the segments of a curved tower.
 * `dir` is the world xz direction the screen's horizontal axis follows.
 */
export function ledWrapMaterial(b: WorldBuilder, palette: number[], dir: [number, number]): THREE.MeshBasicMaterial {
  hookUpdates(b);
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const pal = [0, 1, 2].map((i) => new THREE.Color(palette[i % palette.length]));
  const u = { uLedDir: { value: new THREE.Vector2(dir[0], dir[1]).normalize() }, uLedPal: { value: pal } };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, shared, u);
    worldVarying(s, 'vLW');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLW;\nuniform float uFacNight;\nuniform float uFacTime;\nuniform vec2 uLedDir;\nuniform vec3 uLedPal[3];\n${HASH}`)
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        /* glsl */ `
        vec2 lp = vec2(dot(vLW.xz, uLedDir), vLW.y);
        vec2 lfw = fwidth(lp);
        // guest-room windows cut out of the screen
        vec2 wc = abs(fract(lp / vec2(3.6, 3.2)) - 0.5) * vec2(3.6, 3.2);
        if (wc.x < 0.55 && wc.y < 0.5) discard;
        float lt = uFacTime;
        float scene = mod(floor(lt / 11.0), 3.0);
        float xf = smoothstep(0.0, 1.5, mod(lt, 11.0)) * (1.0 - smoothstep(9.5, 11.0, mod(lt, 11.0)));
        vec3 c;
        if (scene < 0.5) {
          float s = fract(lp.x * 0.012 + lp.y * 0.02 - lt * 0.12);
          c = mix(uLedPal[0], uLedPal[1], smoothstep(0.35, 0.5, s)) * (0.25 + 0.75 * smoothstep(0.0, 0.2, s) * (1.0 - smoothstep(0.8, 1.0, s)));
        } else if (scene < 1.5) {
          float r = length(vec2(lp.x * 0.7, lp.y - 22.0));
          float w = sin(r * 0.32 - lt * 3.2) * 0.5 + 0.5;
          c = mix(uLedPal[0] * 0.15, uLedPal[2], w * w);
        } else {
          vec2 cell = floor(lp / 1.8);
          float tw = facHash(cell + floor(lt * 4.0));
          c = uLedPal[0] * 0.25 + uLedPal[1] * step(0.86, tw) * 1.6 + uLedPal[2] * 0.15 * sin(lp.y * 0.2 - lt);
        }
        c *= xf * 0.85 + 0.15;
        // LED pitch, faded out before it can alias
        vec2 pg = abs(fract(lp / 0.45) - 0.5);
        float pitch = mix(0.55 + 0.45 * (1.0 - smoothstep(0.3, 0.5, max(pg.x, pg.y))), 0.85, smoothstep(0.08, 0.25, max(lfw.x, lfw.y)));
        c = max(c, vec3(0.0)) * pitch * (0.85 + 0.75 * uFacNight);
        vec4 diffuseColor = vec4(c, opacity);`,
      );
  };
  return m;
}

/** Canopy soffit: dark coffered panel with a grid of warm downlights that glow after dark. UVs in 2.4 m panels. */
export function soffitMaterial(b: WorldBuilder): THREE.MeshStandardMaterial {
  let m = soffits.get(b);
  if (m) return m;
  const S = 64;
  const mk = (draw: (ctx: CanvasRenderingContext2D) => void, srgb: boolean) => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    draw(c.getContext('2d')!);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  };
  const map = mk((ctx) => {
    ctx.fillStyle = '#3a3530';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#2a2622';
    ctx.fillRect(0, 0, S, 2);
    ctx.fillRect(0, 0, 2, S);
    ctx.fillStyle = '#d8d2c8';
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, 5, 0, Math.PI * 2);
    ctx.fill();
  }, true);
  const em = mk((ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, S, S);
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, 22);
    g.addColorStop(0, '#fff4dc');
    g.addColorStop(0.22, '#ffe2b0');
    g.addColorStop(0.3, 'rgba(255,190,120,0.35)');
    g.addColorStop(1, 'rgba(120,80,40,0.08)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }, true);
  m = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffe0b0, emissiveIntensity: 0.05, roughness: 0.7, metalness: 0.1 });
  b.nightGlow(m, 0.05, 1.8);
  soffits.set(b, m);
  return m;
}
const soffits = new WeakMap<WorldBuilder, THREE.MeshStandardMaterial>();

/** Turn a facade material (map + emissiveMap + roughnessMap from makeFacadeTextures) into interior-mapped glass. */
export function installInteriors(b: WorldBuilder, m: THREE.MeshStandardMaterial, o: InteriorOpts): THREE.MeshStandardMaterial {
  hookUpdates(b);
  const wash = new THREE.Color(o.wash ?? 0xffe2b8).multiplyScalar(o.washStrength ?? 0.75);
  const u: FacUniforms = {
    uCells: { value: new THREE.Vector2(o.cols, o.rows) },
    uRoomDepth: { value: o.depth ?? 4.6 },
    uTopRef: { value: o.topRef ? 1 : 0 },
    uWash: { value: wash },
    uWashZone: { value: o.washZone ?? 12 },
  };
  m.userData.facU = u;
  m.onBeforeCompile = patchFacade;
  return m;
}
