import * as THREE from 'three';
import { makeGlowTexture, rng } from './textures';

/**
 * Shared street-level textures and materials (one material per look, so the static bake merges
 * every shopfront, sign and decal in a map cell into a single draw call):
 * - shop interiors: an atlas of back walls (shelves, racks, mannequins, slush machines…) drawn
 *   through a fake-depth "interior mapping" shader, so display windows show a lit room behind the glass;
 * - signs + posters: one atlas of shop fascia strips, blade signs and ad posters;
 * - ground decals: warm light pools (additive), litter/gum/flyer specks, wet sheen.
 */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}
function finish(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}
const hsl = (h: number, s: number, l: number) => `hsl(${((h % 360) + 360) % 360},${s}%,${l}%)`;

// ------------------------------------------------------------------------------------------------
// Shop interiors
// ------------------------------------------------------------------------------------------------

/** Interior kinds painted into the atlas (each kind gets a few colour variants). */
export type InteriorKind =
  | 'shirts'
  | 'trinkets'
  | 'pharmacy'
  | 'liquor'
  | 'mannequins'
  | 'racks'
  | 'daiquiri'
  | 'coffee'
  | 'foodcourt'
  | 'chapel'
  | 'sneakers'
  | 'jewelry'
  | 'candy'
  | 'smoke'
  | 'gallery'
  | 'slots';

const KINDS: InteriorKind[] = ['shirts', 'trinkets', 'pharmacy', 'liquor', 'mannequins', 'racks', 'daiquiri', 'coffee', 'foodcourt', 'chapel', 'sneakers', 'jewelry', 'candy', 'smoke', 'gallery', 'slots'];
export const INTERIOR_GRID = { cols: 8, rows: 4 };
const CELL = 256;

/** Atlas cell index for a kind and variant (0 or 1). */
export function interiorCell(kind: InteriorKind, variant = 0): number {
  return KINDS.indexOf(kind) + (variant % 2) * 16;
}

function paintInterior(ctx: CanvasRenderingContext2D, kind: InteriorKind, v: number, R: () => number): void {
  const W = CELL;
  const H = CELL;
  const hue = v ? 200 : 20;
  // back wall
  const wallCol: Record<InteriorKind, string> = {
    shirts: '#e9e1d2', trinkets: '#f1e6cf', pharmacy: '#f4f5f2', liquor: '#3a2618', mannequins: '#d9d2c8', racks: '#efe9df', daiquiri: '#1d1430', coffee: '#4a3324',
    foodcourt: '#2a1d16', chapel: '#f7f1ec', sneakers: '#1f2228', jewelry: '#141018', candy: '#fbe8f2', smoke: '#1a1512', gallery: '#f6f4f0', slots: '#1a0c22',
  };
  ctx.fillStyle = wallCol[kind];
  ctx.fillRect(0, 0, W, H);
  const shelfRow = (y: number, h: number, item: (x: number, y: number, i: number) => void, step = 18, x0 = 8, x1 = W - 8) => {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x0, y + h, x1 - x0, 4);
    let i = 0;
    for (let x = x0 + 2; x < x1 - step / 2; x += step) item(x, y, i++);
  };
  switch (kind) {
    case 'shirts': {
      ctx.fillStyle = '#c9bca8';
      for (let y = 10; y < H; y += 10) ctx.fillRect(0, y, W, 1); // slatwall
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 5; c++) {
          const x = 14 + c * 47;
          const y = 18 + r * 64;
          ctx.fillStyle = hsl(hue + R() * 300, 70, 35 + R() * 35);
          ctx.beginPath();
          ctx.moveTo(x, y + 8);
          ctx.lineTo(x + 10, y);
          ctx.lineTo(x + 30, y);
          ctx.lineTo(x + 40, y + 8);
          ctx.lineTo(x + 34, y + 16);
          ctx.lineTo(x + 32, y + 50);
          ctx.lineTo(x + 8, y + 50);
          ctx.lineTo(x + 6, y + 16);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = R() < 0.5 ? '#ffffff' : '#ffd24d';
          ctx.font = 'bold 8px sans-serif';
          ctx.fillText('VEGAS', x + 7, y + 28);
        }
      ctx.fillStyle = '#d8352b';
      ctx.fillRect(0, H - 40, W, 40);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('ALL SHIRTS 3/$20', 22, H - 13);
      break;
    }
    case 'trinkets':
    case 'candy':
    case 'pharmacy':
    case 'liquor':
    case 'smoke': {
      const rows = kind === 'pharmacy' ? 6 : 5;
      const rh = (H - 30) / rows;
      for (let r = 0; r < rows; r++) {
        const y = 22 + r * rh;
        ctx.fillStyle = kind === 'liquor' || kind === 'smoke' ? '#2a1a10' : '#cfcac0';
        ctx.fillRect(4, y + rh - 6, W - 8, 6);
        shelfRow(y, rh - 6, (x, yy) => {
          if (kind === 'liquor') {
            ctx.fillStyle = ['#3b6b2a', '#7a4a14', '#c9b58a', '#1e3a6b', '#8a1c1c', '#d9d2b0'][Math.floor(R() * 6)];
            const bh = rh * (0.55 + R() * 0.3);
            ctx.fillRect(x + 3, yy + rh - 6 - bh, 9, bh);
            ctx.fillRect(x + 6, yy + rh - 6 - bh - 7, 3, 8);
            ctx.fillStyle = 'rgba(255,240,200,0.7)';
            ctx.fillRect(x + 4, yy + rh - 6 - bh * 0.6, 7, 5);
          } else if (kind === 'smoke') {
            ctx.fillStyle = ['#c9a36a', '#7a4a24', '#e2d6b8', '#3a2414', '#d8352b'][Math.floor(R() * 5)];
            ctx.fillRect(x + 1, yy + rh - 22, 14, 16);
            ctx.fillStyle = '#f4e2b0';
            ctx.fillRect(x + 3, yy + rh - 18, 10, 3);
          } else if (kind === 'candy') {
            ctx.fillStyle = hsl(R() * 360, 85, 60);
            ctx.beginPath();
            ctx.arc(x + 8, yy + rh - 14, 7, 0, Math.PI * 2);
            ctx.fill();
          } else {
            const bw = 10 + R() * 6;
            const bh = rh * (0.35 + R() * 0.45);
            ctx.fillStyle = kind === 'pharmacy' ? hsl(R() * 360, 55, 45 + R() * 30) : hsl(hue + R() * 280, 60, 50);
            ctx.fillRect(x + 1, yy + rh - 6 - bh, bw, bh);
          }
        }, kind === 'liquor' ? 15 : 17);
      }
      if (kind === 'pharmacy') {
        ctx.fillStyle = '#1e5fb8';
        ctx.fillRect(70, 2, 116, 18);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText('AISLE 4 • SUN CARE', 76, 16);
      } else if (kind === 'smoke') {
        ctx.fillStyle = '#ffb347';
        ctx.font = 'bold 15px sans-serif';
        ctx.fillText('CIGARS • VAPES • LIGHTERS', 16, 15);
      } else if (kind === 'liquor') {
        ctx.fillStyle = '#ffd24d';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText('SPIRITS • ICE COLD BEER', 34, 15);
      } else {
        ctx.fillStyle = kind === 'candy' ? '#ff3fa4' : '#2b2b33';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(kind === 'candy' ? 'PICK & MIX' : 'SHOT GLASSES • MAGNETS • MUGS', kind === 'candy' ? 88 : 8, 15);
      }
      break;
    }
    case 'mannequins':
    case 'racks': {
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      for (let x = 0; x < W; x += 32) ctx.fillRect(x, 0, 1, H);
      if (kind === 'racks') {
        for (let r = 0; r < 2; r++) {
          const y = 40 + r * 100;
          ctx.fillStyle = '#9a9a9a';
          ctx.fillRect(10, y, W - 20, 3);
          for (let x = 14; x < W - 18; x += 9) {
            ctx.fillStyle = hsl(hue + R() * 120, 40 + R() * 40, 25 + R() * 45);
            ctx.fillRect(x, y + 3, 8, 60 + R() * 20);
          }
        }
      } else {
        for (let i = 0; i < 3; i++) {
          const x = 44 + i * 84;
          ctx.fillStyle = '#efe6dc';
          ctx.beginPath();
          ctx.arc(x, 52, 11, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillRect(x - 3, 62, 6, 8);
          ctx.fillStyle = [hsl(hue + 330, 70, 45), '#141414', hsl(hue + 40, 60, 60)][i];
          ctx.beginPath();
          ctx.moveTo(x - 22, 72);
          ctx.lineTo(x + 22, 72);
          ctx.lineTo(x + (i === 1 ? 16 : 34), 190);
          ctx.lineTo(x - (i === 1 ? 16 : 34), 190);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#efe6dc';
          if (i === 1) {
            ctx.fillRect(x - 12, 190, 7, 40);
            ctx.fillRect(x + 5, 190, 7, 40);
          }
          ctx.fillStyle = '#6a5a4a';
          ctx.fillRect(x - 18, 234, 36, 6);
          // spotlight cone
          const g = ctx.createRadialGradient(x, 40, 5, x, 120, 110);
          g.addColorStop(0, 'rgba(255,245,220,0.35)');
          g.addColorStop(1, 'rgba(255,245,220,0)');
          ctx.fillStyle = g;
          ctx.fillRect(x - 60, 0, 120, H);
        }
      }
      break;
    }
    case 'daiquiri': {
      for (let i = 0; i < 6; i++) {
        const x = 10 + i * 40;
        ctx.fillStyle = '#c8c8cc';
        ctx.fillRect(x, 70, 36, 120);
        const col = ['#ff2c8a', '#2de2ff', '#7aff47', '#ffb000', '#b874ff', '#ff5a3a'][(i + v) % 6];
        ctx.fillStyle = col;
        ctx.fillRect(x + 4, 76, 28, 70);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 3;
        for (let k = 0; k < 5; k++) {
          ctx.beginPath();
          ctx.arc(x + 18, 80 + k * 14, 10, 0.2 + k, 2.4 + k);
          ctx.stroke();
        }
        ctx.fillStyle = '#2b2b33';
        ctx.fillRect(x + 12, 150, 12, 10);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 8px sans-serif';
        ctx.fillText(['MAI TAI', 'BLUE', 'MARG', 'PINA', 'GRAPE', '190 OCT'][(i + v) % 6], x + 3, 182);
      }
      ctx.fillStyle = '#ffd24d';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('FROZEN DAIQUIRIS', 40, 36);
      ctx.fillStyle = '#ff2c8a';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('TO GO • 32 OZ • REFILLS', 52, 58);
      ctx.fillStyle = '#3a2a48';
      ctx.fillRect(0, 196, W, 60);
      break;
    }
    case 'coffee': {
      ctx.fillStyle = '#1a1210';
      ctx.fillRect(20, 14, 216, 74);
      ctx.fillStyle = '#f4ead8';
      ctx.font = 'bold 13px sans-serif';
      ['LATTE ........ 6.50', 'COLD BREW .... 5.75', 'ESPRESSO ..... 3.95', 'FRAPPE ....... 7.25'].forEach((t, i) => ctx.fillText(t, 34, 32 + i * 16));
      ctx.fillStyle = '#9a9ea6';
      ctx.fillRect(40, 110, 70, 50);
      ctx.fillStyle = '#c8ccd4';
      ctx.fillRect(46, 116, 58, 18);
      ctx.fillStyle = '#6a4a30';
      ctx.fillRect(0, 168, W, 88);
      ctx.fillStyle = 'rgba(255,240,210,0.65)';
      ctx.fillRect(140, 118, 96, 48);
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = ['#c8843a', '#8a4a1a', '#f0d080', '#d86a8a'][i % 4];
        ctx.beginPath();
        ctx.arc(150 + (i % 4) * 22, 134 + Math.floor(i / 4) * 18, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'foodcourt': {
      for (let i = 0; i < 3; i++) {
        const x = 6 + i * 83;
        ctx.fillStyle = ['#d81e2a', '#ffb000', '#1e8c5a'][(i + v) % 3];
        ctx.fillRect(x, 10, 78, 24);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(['PIZZA', 'TACOS', 'WOK', 'BURGERS', 'GYRO', 'SUSHI'][(i + v * 3) % 6], x + 8, 27);
        ctx.fillStyle = '#111';
        ctx.fillRect(x, 36, 78, 60);
        for (let k = 0; k < 4; k++) {
          ctx.fillStyle = hsl(20 + R() * 40, 70, 45 + R() * 20);
          ctx.fillRect(x + 6 + (k % 2) * 36, 42 + Math.floor(k / 2) * 27, 30, 20);
        }
      }
      ctx.fillStyle = '#8a8d93';
      ctx.fillRect(0, 150, W, 14);
      ctx.fillStyle = '#4a3a2a';
      ctx.fillRect(0, 164, W, 92);
      break;
    }
    case 'chapel': {
      ctx.fillStyle = '#e8d8e0';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(64, H);
      ctx.lineTo(64, 90);
      ctx.quadraticCurveTo(128, 10, 192, 90);
      ctx.lineTo(192, H);
      ctx.lineTo(176, H);
      ctx.lineTo(176, 96);
      ctx.quadraticCurveTo(128, 34, 80, 96);
      ctx.lineTo(80, H);
      ctx.closePath();
      ctx.fill();
      for (let i = 0; i < 40; i++) {
        const a = Math.PI + (i / 39) * Math.PI;
        ctx.fillStyle = ['#ff8ab8', '#ffffff', '#ffd0e0', '#d8364a'][i % 4];
        ctx.beginPath();
        ctx.arc(128 + Math.cos(a) * 60, 92 + Math.sin(a) * 52, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#c8303a';
      ctx.fillRect(110, 150, 36, 106);
      ctx.fillStyle = '#ffe9a0';
      for (const x of [40, 216]) {
        ctx.fillRect(x - 3, 150, 6, 40);
        ctx.beginPath();
        ctx.arc(x, 146, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#7a2a4a';
      ctx.font = 'italic bold 16px Georgia, serif';
      ctx.fillText('Walk-ins Welcome', 62, 30);
      break;
    }
    case 'sneakers': {
      for (let r = 0; r < 5; r++)
        for (let c = 0; c < 6; c++) {
          const x = 12 + c * 40;
          const y = 22 + r * 44;
          ctx.fillStyle = '#ffffff22';
          ctx.fillRect(x - 4, y + 22, 38, 3);
          ctx.fillStyle = hsl(R() * 360, 60 + R() * 30, 40 + R() * 40);
          ctx.beginPath();
          ctx.moveTo(x, y + 22);
          ctx.lineTo(x + 2, y + 8);
          ctx.lineTo(x + 14, y + 8);
          ctx.lineTo(x + 30, y + 16);
          ctx.lineTo(x + 30, y + 22);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#f4f4f0';
          ctx.fillRect(x, y + 19, 30, 3);
        }
      break;
    }
    case 'jewelry': {
      for (let i = 0; i < 3; i++) {
        const x = 10 + i * 82;
        ctx.fillStyle = '#2a2230';
        ctx.fillRect(x, 140, 74, 116);
        const g = ctx.createLinearGradient(0, 100, 0, 140);
        g.addColorStop(0, 'rgba(200,230,255,0.25)');
        g.addColorStop(1, 'rgba(255,250,230,0.8)');
        ctx.fillStyle = g;
        ctx.fillRect(x, 100, 74, 40);
        for (let k = 0; k < 6; k++) {
          ctx.fillStyle = ['#ffd24d', '#e8e8f0', '#ff5a7a', '#7ad0ff'][k % 4];
          ctx.beginPath();
          ctx.arc(x + 10 + (k % 3) * 26, 116 + Math.floor(k / 3) * 14, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.fillStyle = '#d8c07a';
      ctx.font = 'bold 18px Georgia, serif';
      ctx.fillText('FINE WATCHES & JEWELRY', 16, 50);
      break;
    }
    case 'gallery': {
      for (let i = 0; i < 4; i++) {
        const x = 16 + (i % 2) * 120;
        const y = 30 + Math.floor(i / 2) * 110;
        ctx.fillStyle = '#2a2018';
        ctx.fillRect(x - 4, y - 4, 100, 82);
        const g = ctx.createLinearGradient(x, y, x + 92, y + 74);
        g.addColorStop(0, hsl(R() * 360, 70, 50));
        g.addColorStop(1, hsl(R() * 360, 70, 35));
        ctx.fillStyle = g;
        ctx.fillRect(x, y, 92, 74);
        ctx.fillStyle = hsl(R() * 360, 80, 70);
        ctx.beginPath();
        ctx.arc(x + 30 + R() * 30, y + 30 + R() * 20, 14, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'slots': {
      for (let i = 0; i < 5; i++) {
        const x = 8 + i * 49;
        ctx.fillStyle = '#2a2a30';
        ctx.fillRect(x, 70, 44, 150);
        ctx.fillStyle = hsl(300 + i * 30 + v * 90, 80, 55);
        ctx.fillRect(x + 4, 56, 36, 20);
        ctx.fillStyle = '#0a1a3a';
        ctx.fillRect(x + 6, 84, 32, 40);
        ctx.fillStyle = '#ffd24d';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('7 7 7', x + 6, 108);
        ctx.fillStyle = '#c83030';
        ctx.fillRect(x + 6, 132, 32, 8);
      }
      ctx.fillStyle = '#ffd24d';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('LOOSEST SLOTS ON THE STRIP', 4, 36);
      break;
    }
  }
  // soft ceiling light falloff + floor shadow
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,250,235,0.12)');
  g.addColorStop(0.7, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

let interiorTex: THREE.CanvasTexture | null = null;
function interiorAtlas(): THREE.CanvasTexture {
  if (interiorTex) return interiorTex;
  const [c, ctx] = canvas(CELL * INTERIOR_GRID.cols, CELL * INTERIOR_GRID.rows);
  const R = rng(4242);
  for (let i = 0; i < INTERIOR_GRID.cols * INTERIOR_GRID.rows; i++) {
    const col = i % INTERIOR_GRID.cols;
    const row = Math.floor(i / INTERIOR_GRID.cols);
    ctx.save();
    ctx.translate(col * CELL, row * CELL);
    ctx.beginPath();
    ctx.rect(0, 0, CELL, CELL);
    ctx.clip();
    paintInterior(ctx, KINDS[i % 16], i >= 16 ? 1 : 0, R);
    ctx.restore();
  }
  interiorTex = finish(c);
  interiorTex.generateMipmaps = true;
  interiorTex.minFilter = THREE.LinearMipmapLinearFilter;
  return interiorTex;
}

/** Standard display-window pane (metres): every pane uses this size so one shader fits them all. */
export const PANE = { w: 2.4, h: 2.8, depth: 3.4 };

let interiorMat: THREE.ShaderMaterial | null = null;
/**
 * Interior-mapped glass: a fake room (back wall from the atlas, side walls, tiled floor, ceiling light
 * panels) seen through the window, with a sky reflection by day and a warm glow at night.
 * Panes are vertical planes; the uv picks the atlas cell (see `interiorPane`).
 */
export function interiorMaterial(): THREE.ShaderMaterial {
  if (interiorMat) return interiorMat;
  interiorMat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uAtlas: { value: null },
        uNight: { value: 0 },
        uGrid: { value: new THREE.Vector2(INTERIOR_GRID.cols, INTERIOR_GRID.rows) },
        uPane: { value: new THREE.Vector3(PANE.w, PANE.h, PANE.depth) },
        uSky: { value: new THREE.Color(0xbcd8f0) },
      },
    ]),
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vNrm;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNrm = normalize(mat3(modelMatrix) * normal);
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uAtlas;
      uniform float uNight;
      uniform vec2 uGrid;
      uniform vec3 uPane;
      uniform vec3 uSky;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vNrm;
      #include <fog_pars_fragment>
      float safeDiv(float a, float b) { return a / (abs(b) < 1e-4 ? (b < 0.0 ? -1e-4 : 1e-4) : b); }
      void main() {
        vec2 cell = floor(vUv * uGrid);
        vec2 f = clamp(fract(vUv * uGrid), 0.002, 0.998);
        vec3 N = normalize(vNrm);
        vec3 UP = vec3(0.0, 1.0, 0.0);
        vec3 T = normalize(cross(UP, N) + vec3(1e-5, 0.0, 0.0));
        vec3 V = normalize(vWorld - cameraPosition);
        vec3 d = vec3(dot(V, T) / uPane.x, dot(V, UP) / uPane.y, max(0.02, -dot(V, N)) / uPane.z);
        vec3 p = vec3(f, 0.0);
        float tx = safeDiv(d.x > 0.0 ? 1.0 - p.x : -p.x, d.x);
        float ty = safeDiv(d.y > 0.0 ? 1.0 - p.y : -p.y, d.y);
        float tz = 1.0 / d.z;
        float t = min(min(tx, ty), tz);
        vec3 h = p + d * t;
        vec3 col;
        float depthShade = 1.0 - 0.45 * clamp(h.z, 0.0, 1.0);
        if (t == tz) {
          vec2 auv = (cell + mix(vec2(0.01), vec2(0.99), clamp(h.xy, 0.0, 1.0))) / uGrid;
          col = texture2D(uAtlas, auv).rgb * 0.92;
        } else if (t == tx) {
          float u = h.x < 0.5 ? 0.02 + h.z * 0.12 : 0.98 - h.z * 0.12;
          vec2 auv = (cell + vec2(clamp(u, 0.01, 0.99), clamp(h.y, 0.01, 0.99))) / uGrid;
          col = texture2D(uAtlas, auv).rgb * 0.7 * depthShade;
        } else if (h.y < 0.5) {
          float k = mod(floor(h.x * 4.0) + floor(h.z * 5.0), 2.0);
          col = mix(vec3(0.42, 0.40, 0.37), vec3(0.62, 0.60, 0.56), k) * depthShade;
        } else {
          float panel = step(0.35, fract(h.z * 2.5)) * step(fract(h.z * 2.5), 0.65) * step(0.2, h.x) * step(h.x, 0.8);
          col = mix(vec3(0.55, 0.54, 0.52), vec3(1.4, 1.34, 1.2), panel);
        }
        // interior is lit from inside: dimmer than the street by day, glowing at night
        col *= mix(0.62, 1.05, uNight);
        // mullion shadow / frame vignette
        float edge = smoothstep(0.0, 0.035, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
        col *= 0.55 + 0.45 * edge;
        float fres = pow(clamp(1.0 - abs(dot(V, N)), 0.0, 1.0), 3.0);
        col = mix(col, uSky * mix(1.0, 0.25, uNight), (0.12 + 0.55 * fres) * mix(1.0, 0.35, uNight));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  interiorMat.uniforms.uAtlas.value = interiorAtlas();
  return interiorMat;
}

/** Call every frame (night 0..1, sky/fog colour) so the shop glass follows the time of day. */
export function updateInteriorMaterial(night: number, sky: THREE.Color): void {
  if (!interiorMat) return;
  interiorMat.uniforms.uNight.value = night;
  interiorMat.uniforms.uSky.value.copy(sky);
}

const paneGeos = new Map<number, THREE.BufferGeometry>();
/** A display-window pane facing +z (rotate the mesh), uv mapped onto one atlas cell. */
export function interiorPaneGeometry(cell: number): THREE.BufferGeometry {
  let g = paneGeos.get(cell);
  if (g) return g;
  g = new THREE.PlaneGeometry(PANE.w, PANE.h);
  const col = cell % INTERIOR_GRID.cols;
  const row = Math.floor(cell / INTERIOR_GRID.cols) % INTERIOR_GRID.rows;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    // canvas row 0 is the TOP of the texture (flipY), so atlas row r spans v = 1-(r+1)/rows .. 1-r/rows
    const u = (col + 0.001 + uv.getX(i) * 0.998) / INTERIOR_GRID.cols;
    const v = (INTERIOR_GRID.rows - 1 - row + 0.001 + uv.getY(i) * 0.998) / INTERIOR_GRID.rows;
    uv.setXY(i, u, v);
  }
  paneGeos.set(cell, g);
  return g;
}

// ------------------------------------------------------------------------------------------------
// Sign + poster atlas
// ------------------------------------------------------------------------------------------------

export interface SignSpec {
  text: string;
  sub?: string;
  bg: string;
  fg: string;
  font?: string;
}
/** Fascia strips (1024×128) in a 2×12 grid, then 8 posters (256×512) along the bottom. */
const SIGN_W = 1024;
const SIGN_H = 120;
const SIGN_ROWS = 14;
const POSTER_W = 256;
const POSTER_H = 368;
const ATLAS = 2048;

export const SIGNS: Record<string, SignSpec> = {
  souvenirs: { text: 'LAS VEGAS SOUVENIRS', sub: 'T-SHIRTS • HATS • GIFTS • 3/$20', bg: '#0c1a3a', fg: '#ffd24d' },
  pharmacy: { text: 'PHARMACY & LIQUOR', sub: 'OPEN 24 HOURS • PHOTO • SNACKS', bg: '#c8102e', fg: '#ffffff' },
  daiquiri: { text: 'FROZEN DAIQUIRIS', sub: 'FAT CUP FRIDAY • 32 OZ TO GO', bg: '#2a0f3a', fg: '#ff5fd2' },
  coffee: { text: 'STRIP COFFEE CO.', sub: 'ESPRESSO • COLD BREW • PASTRY', bg: '#1e3a2a', fg: '#f4ead8', font: 'Georgia, serif' },
  foodcourt: { text: 'FOOD COURT', sub: 'PIZZA • TACOS • WOK • BURGERS', bg: '#1a1a22', fg: '#ffb000' },
  chapel: { text: 'Vegas Wedding Chapel', sub: 'WALK-INS WELCOME • ELVIS ON REQUEST', bg: '#fff4f8', fg: '#c8306a', font: 'italic bold Georgia, serif' },
  miracle: { text: 'MIRACLE MILE SHOPS', sub: '170 SHOPS • DINING • SHOWS', bg: '#120c22', fg: '#7ad0ff' },
  bazaar: { text: 'GRAND BAZAAR SHOPS', sub: 'OPEN-AIR MARKET • 24/7', bg: '#3a1408', fg: '#ffcc66' },
  linq: { text: 'THE LINQ PROMENADE', sub: 'SHOPS • BARS • HIGH ROLLER', bg: '#0a1a1e', fg: '#5ef2d0' },
  sneakers: { text: 'KICKS & CO.', sub: 'SNEAKERS • STREETWEAR', bg: '#101014', fg: '#ff7a1a' },
  jewelry: { text: 'DIAMOND ROW', sub: 'FINE WATCHES & JEWELRY', bg: '#0a0a0e', fg: '#e8d08a', font: 'Georgia, serif' },
  candy: { text: 'SUGAR RUSH CANDY', sub: 'PICK & MIX • FUDGE • GIANT POPS', bg: '#ff6fb0', fg: '#ffffff' },
  smoke: { text: 'SMOKE SHOP', sub: 'CIGARS • VAPES • HOOKAH', bg: '#140c08', fg: '#ff9a3a' },
  gallery: { text: 'STRIP ART GALLERY', sub: 'ORIGINALS • PRINTS', bg: '#f6f4f0', fg: '#1a1a1a', font: 'Georgia, serif' },
  slots: { text: 'SLOTS • VIDEO POKER', sub: 'FREE PULL • $1 BEER', bg: '#2a0838', fg: '#ffd24d' },
  boutique: { text: 'BOUTIQUE', sub: 'RESORT WEAR • SWIM', bg: '#f2ece2', fg: '#3a2a1a', font: 'Georgia, serif' },
  employees: { text: 'TEAM MEMBER ENTRANCE', sub: 'ID REQUIRED • CLOCK IN HERE', bg: '#1e2a3a', fg: '#ffffff' },
  dock: { text: 'RECEIVING • DOCKS 1–6', sub: 'DELIVERIES 5AM–2PM • NO PARKING', bg: '#f2c230', fg: '#111111' },
  garage: { text: 'SELF PARKING', sub: 'ALL LEVELS • EV CHARGING ↑', bg: '#12306a', fg: '#ffffff' },
  fireLane: { text: 'FIRE LANE', sub: 'NO PARKING • TOW AWAY ZONE', bg: '#c8102e', fg: '#ffffff' },
  koval: { text: 'KOVAL LN', bg: '#0e6a3a', fg: '#ffffff' },
  sinatra: { text: 'FRANK SINATRA DR', bg: '#0e6a3a', fg: '#ffffff' },
  linqLn: { text: 'LINQ LN', bg: '#0e6a3a', fg: '#ffffff' },
  water: { text: 'ICE COLD WATER $1', sub: 'GATORADE $3', bg: '#1e5fb8', fg: '#ffffff' },
  smoking: { text: 'DESIGNATED SMOKING AREA', sub: 'TEAM MEMBERS ONLY • 10 MIN BREAKS', bg: '#2a2a2e', fg: '#ffcc55' },
  valet: { text: 'VALET', sub: 'ARRIVALS • RIDESHARE PICKUP →', bg: '#101820', fg: '#f4d58d', font: 'Georgia, serif' },
  taxi: { text: 'TAXI • RIDESHARE', sub: 'LINE FORMS HERE', bg: '#f4c430', fg: '#111111' },
  audrie: { text: 'AUDRIE ST', bg: '#0e6a3a', fg: '#ffffff' },
};
const SIGN_ORDER = Object.keys(SIGNS);

const POSTERS: Array<{ title: string; sub: string; bg: [string, string]; fg: string }> = [
  { title: 'MAGIC', sub: 'NIGHTLY 7 & 9', bg: ['#1a0838', '#5a1a8a'], fg: '#ffd24d' },
  { title: 'CIRQUE', sub: 'AQUATIC SPECTACLE', bg: ['#04283a', '#0a7aa0'], fg: '#ffffff' },
  { title: 'COMEDY', sub: 'LATE SHOW 10:30', bg: ['#3a0a0a', '#c8302a'], fg: '#ffe9a0' },
  { title: 'RESIDENCY', sub: 'ON SALE NOW', bg: ['#0a0a0a', '#3a3a4a'], fg: '#ff5fd2' },
  { title: 'BUFFET', sub: '$39.99 ALL DAY', bg: ['#3a2a08', '#c89a2a'], fg: '#ffffff' },
  { title: 'FIGHT NIGHT', sub: 'SAT • ARENA', bg: ['#111111', '#8a1010'], fg: '#ffffff' },
  { title: 'POOL PARTY', sub: 'DAYCLUB • SAT/SUN', bg: ['#0a5a8a', '#2de2ff'], fg: '#ffffff' },
  { title: 'LOU THE CAT', sub: 'MISSING? NO. LEGEND.', bg: ['#2a2018', '#8a6a4a'], fg: '#ffe9c0' },
];

let signTex: THREE.CanvasTexture | null = null;
function signAtlas(): THREE.CanvasTexture {
  if (signTex) return signTex;
  const [c, ctx] = canvas(ATLAS, ATLAS);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, ATLAS, ATLAS);
  SIGN_ORDER.forEach((key, i) => {
    const s = SIGNS[key];
    const x = (i % 2) * SIGN_W;
    const y = Math.floor(i / 2) * SIGN_H;
    ctx.fillStyle = s.bg;
    ctx.fillRect(x, y, SIGN_W, SIGN_H);
    ctx.strokeStyle = s.fg;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 4;
    ctx.strokeRect(x + 8, y + 8, SIGN_W - 16, SIGN_H - 16);
    ctx.globalAlpha = 1;
    ctx.fillStyle = s.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = s.fg;
    ctx.shadowBlur = 12;
    const fam = s.font ?? 'bold system-ui, sans-serif';
    const [style, ...rest] = fam.includes('serif') || fam.includes('sans') ? [fam.includes('italic') ? 'italic bold' : 'bold', fam.replace(/italic|bold/g, '').trim()] : ['bold', fam];
    ctx.font = `${style} ${s.sub ? 62 : 80}px ${rest.join(' ') || 'sans-serif'}`;
    let tw = ctx.measureText(s.text).width;
    if (tw > SIGN_W - 60) ctx.font = `${style} ${Math.floor((s.sub ? 62 : 80) * ((SIGN_W - 60) / tw))}px ${rest.join(' ') || 'sans-serif'}`;
    ctx.fillText(s.text, x + SIGN_W / 2, y + (s.sub ? 46 : 62));
    if (s.sub) {
      ctx.shadowBlur = 0;
      ctx.font = 'bold 28px system-ui, sans-serif';
      tw = ctx.measureText(s.sub).width;
      if (tw > SIGN_W - 60) ctx.font = `bold ${Math.floor(28 * ((SIGN_W - 60) / tw))}px system-ui, sans-serif`;
      ctx.globalAlpha = 0.85;
      ctx.fillText(s.sub, x + SIGN_W / 2, y + 96);
      ctx.globalAlpha = 1;
    }
    ctx.shadowBlur = 0;
  });
  // posters
  POSTERS.forEach((p, i) => {
    const x = i * POSTER_W;
    const y = ATLAS - POSTER_H;
    const g = ctx.createLinearGradient(x, y, x, y + POSTER_H);
    g.addColorStop(0, p.bg[0]);
    g.addColorStop(1, p.bg[1]);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, POSTER_W, POSTER_H);
    // a hero shape
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(x + POSTER_W / 2, y + 150, 72, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.fg;
    if (i === 7) {
      // Lou silhouette: chunky cat
      ctx.fillStyle = '#4a4038';
      ctx.beginPath();
      ctx.ellipse(x + 128, y + 170, 70, 52, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 128, y + 98, 42, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 92, y + 80);
      ctx.lineTo(x + 100, y + 42);
      ctx.lineTo(x + 116, y + 66);
      ctx.moveTo(x + 164, y + 80);
      ctx.lineTo(x + 156, y + 42);
      ctx.lineTo(x + 140, y + 66);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 150, y + 110, 34, 5);
      ctx.fillStyle = '#ff5a1f';
      ctx.fillRect(x + 182, y + 110, 5, 5);
      ctx.fillStyle = p.fg;
    }
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px system-ui, sans-serif';
    let tw = ctx.measureText(p.title).width;
    if (tw > POSTER_W - 20) ctx.font = `bold ${Math.floor(44 * ((POSTER_W - 20) / tw))}px system-ui, sans-serif`;
    ctx.fillText(p.title, x + POSTER_W / 2, y + 292);
    ctx.font = 'bold 20px system-ui, sans-serif';
    tw = ctx.measureText(p.sub).width;
    if (tw > POSTER_W - 16) ctx.font = `bold ${Math.floor(20 * ((POSTER_W - 16) / tw))}px system-ui, sans-serif`;
    ctx.fillText(p.sub, x + POSTER_W / 2, y + 330);
    ctx.strokeStyle = p.fg;
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 10, y + 10, POSTER_W - 20, POSTER_H - 20);
  });
  // Flyer/litter area: small cards at (0..1536, 1536..1536)? (posters fill the bottom row fully; flyers live in the litter atlas)
  signTex = finish(c);
  return signTex;
}

let signMat: THREE.MeshStandardMaterial | null = null;
/** One lit + self-glowing material for every shop fascia, blade sign and poster (register with nightGlow). */
export function signMaterial(): THREE.MeshStandardMaterial {
  if (signMat) return signMat;
  const t = signAtlas();
  signMat = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.55 });
  return signMat;
}

function remapUv(g: THREE.BufferGeometry, u0: number, v0: number, u1: number, v1: number, faces?: 'front'): THREE.BufferGeometry {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    // box sides other than ±z get a sliver of the sign edge colour
    if (faces === 'front' && Math.abs(nrm.getZ(i)) < 0.5) {
      uv.setXY(i, u0 + 0.002, v0 + 0.002);
      continue;
    }
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  return g;
}

const signGeos = new Map<string, THREE.BufferGeometry>();
/** A w×h sign box (depth d) showing atlas sign `key` on both ±z faces. */
export function signGeometry(key: keyof typeof SIGNS | string, w: number, h: number, d = 0.12): THREE.BufferGeometry {
  const k = `${key}|${w}|${h}|${d}`;
  let g = signGeos.get(k);
  if (g) return g;
  const i = SIGN_ORDER.indexOf(key);
  const x = (i % 2) * SIGN_W;
  const y = Math.floor(i / 2) * SIGN_H;
  g = new THREE.BoxGeometry(w, h, d);
  // canvas y down → texture v up
  remapUv(g, x / ATLAS, 1 - (y + SIGN_H) / ATLAS, (x + SIGN_W) / ATLAS, 1 - y / ATLAS, 'front');
  signGeos.set(k, g);
  return g;
}

const posterGeos = new Map<string, THREE.BufferGeometry>();
/** A w×h poster plane facing +z showing poster `i` (0..7). */
export function posterGeometry(i: number, w: number, h: number): THREE.BufferGeometry {
  const k = `${i}|${w}|${h}`;
  let g = posterGeos.get(k);
  if (g) return g;
  g = new THREE.PlaneGeometry(w, h);
  const x = (i % 8) * POSTER_W;
  remapUv(g, x / ATLAS, 0, (x + POSTER_W) / ATLAS, POSTER_H / ATLAS);
  posterGeos.set(k, g);
  return g;
}
export const POSTER_COUNT = POSTERS.length;

// ------------------------------------------------------------------------------------------------
// Ground decals
// ------------------------------------------------------------------------------------------------

let poolMat: THREE.MeshBasicMaterial | null = null;
/** Warm additive light pool for sidewalks (opacity follows night — see `updateStreetDecals`). */
export function lightPoolMaterial(): THREE.MeshBasicMaterial {
  if (poolMat) return poolMat;
  poolMat = new THREE.MeshBasicMaterial({ map: makeGlowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  return poolMat;
}

let litterTex: THREE.CanvasTexture | null = null;
/** 4×4 atlas of litter decals: gum spots, flyers, stains, cig butts, receipts. */
function litterAtlas(): THREE.CanvasTexture {
  if (litterTex) return litterTex;
  const [c, ctx] = canvas(512, 512);
  ctx.clearRect(0, 0, 512, 512);
  const R = rng(99);
  for (let i = 0; i < 16; i++) {
    const x = (i % 4) * 128;
    const y = Math.floor(i / 4) * 128;
    const kind = i % 4;
    if (kind === 0) {
      // gum spots
      for (let k = 0; k < 14; k++) {
        ctx.fillStyle = `rgba(${30 + R() * 20},${28 + R() * 20},${26 + R() * 20},${0.5 + R() * 0.4})`;
        ctx.beginPath();
        ctx.arc(x + 10 + R() * 108, y + 10 + R() * 108, 2 + R() * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (kind === 1) {
      // club flyers / "cards"
      for (let k = 0; k < 6; k++) {
        ctx.save();
        ctx.translate(x + 20 + R() * 88, y + 20 + R() * 88);
        ctx.rotate(R() * Math.PI);
        ctx.fillStyle = ['#ff3fa4', '#ffd24d', '#2de2ff', '#ffffff', '#b874ff'][Math.floor(R() * 5)];
        ctx.fillRect(-12, -8, 24, 16);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(-9, -4, 12, 3);
        ctx.fillRect(-9, 1, 16, 2);
        ctx.restore();
      }
    } else if (kind === 2) {
      // dark stains
      const g = ctx.createRadialGradient(x + 64, y + 64, 4, x + 64, y + 64, 58);
      g.addColorStop(0, 'rgba(20,16,12,0.45)');
      g.addColorStop(1, 'rgba(20,16,12,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x + 64, y + 64, 58, 40 + R() * 16, R() * 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // cig butts + receipts + bottle caps
      for (let k = 0; k < 8; k++) {
        ctx.save();
        ctx.translate(x + 12 + R() * 104, y + 12 + R() * 104);
        ctx.rotate(R() * Math.PI);
        if (k % 3 === 0) {
          ctx.fillStyle = '#f4f0e6';
          ctx.fillRect(-6, -10, 12, 20);
        } else {
          ctx.fillStyle = '#e8e4da';
          ctx.fillRect(-5, -1.5, 7, 3);
          ctx.fillStyle = '#d59a52';
          ctx.fillRect(2, -1.5, 4, 3);
        }
        ctx.restore();
      }
    }
  }
  litterTex = finish(c);
  return litterTex;
}

let litterMat: THREE.MeshStandardMaterial | null = null;
export function litterMaterial(): THREE.MeshStandardMaterial {
  if (litterMat) return litterMat;
  litterMat = new THREE.MeshStandardMaterial({ map: litterAtlas(), transparent: true, alphaTest: 0.08, depthWrite: false, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  return litterMat;
}
const litterGeos = new Map<number, THREE.BufferGeometry>();
/** Flat litter decal (size s metres) on the ground, showing atlas tile i (0..15: i%4 = gum/flyers/stain/butts). */
export function litterGeometry(i: number, s: number): THREE.BufferGeometry {
  const key = i * 1000 + Math.round(s * 10);
  let g = litterGeos.get(key);
  if (g) return g;
  g = new THREE.PlaneGeometry(s, s);
  g.rotateX(-Math.PI / 2);
  const x = (i % 4) / 4;
  const y = Math.floor(i / 4) / 4;
  remapUv(g, x, 1 - y - 0.25, x + 0.25, 1 - y);
  litterGeos.set(key, g);
  return g;
}

let wetMat: THREE.MeshStandardMaterial | null = null;
/** Glossy dark film for wet pavement under the misters (reflects the env map and neon). */
export function wetSheenMaterial(): THREE.MeshStandardMaterial {
  if (wetMat) return wetMat;
  wetMat = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.06, metalness: 0.0, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  return wetMat;
}

let mistTex: THREE.CanvasTexture | null = null;
let mistMat: THREE.MeshBasicMaterial | null = null;
/** Scrolling fine-mist streaks for the sidewalk misters (shared, animated by texture offset). */
export function mistMaterial(): THREE.MeshBasicMaterial {
  if (mistMat) return mistMat;
  const [c, ctx] = canvas(64, 256);
  const R = rng(7);
  ctx.clearRect(0, 0, 64, 256);
  for (let i = 0; i < 260; i++) {
    const a = 0.05 + R() * 0.2;
    ctx.fillStyle = `rgba(235,245,255,${a})`;
    ctx.fillRect(R() * 64, R() * 256, 1 + R() * 2, 4 + R() * 14);
  }
  const fade = ctx.createLinearGradient(0, 0, 0, 256);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 64, 256);
  mistTex = finish(c);
  mistTex.wrapS = mistTex.wrapT = THREE.RepeatWrapping;
  mistMat = new THREE.MeshBasicMaterial({ map: mistTex, transparent: true, depthWrite: false, opacity: 0.55, side: THREE.DoubleSide });
  return mistMat;
}

let tickOwner: unknown = null;
/** Register (once) the per-frame tick that drives decals, mist and shop glass from the time of day. */
export function registerStreetTick(b: { every: (fn: (dt: number, t: number, night: number) => void) => void; scene: THREE.Scene }): void {
  if (tickOwner === b) return;
  tickOwner = b;
  const fallback = new THREE.Color(0xbcd8f0);
  b.every((_dt, t, night) => {
    updateStreetDecals(t, night);
    const fog = b.scene.fog as THREE.FogExp2 | null;
    updateInteriorMaterial(night, fog ? fog.color : fallback);
  });
}

/** Shared per-frame tick for the decal materials. */
export function updateStreetDecals(t: number, night: number): void {
  if (poolMat) {
    poolMat.opacity = night * 0.5;
    poolMat.visible = night > 0.03; // no overdraw by day
  }
  if (mistTex) mistTex.offset.y = -t * 0.6;
}

// ------------------------------------------------------------------------------------------------
// Service-road asphalt with lane paint (world-uv tiled; one material)
// ------------------------------------------------------------------------------------------------

let serviceRoadTex: THREE.CanvasTexture | null = null;
/** 2-lane service road: 9 m across, 16 m along, double yellow centre line, white edge lines, cracks. */
export function serviceRoadMaterial(): THREE.MeshStandardMaterial {
  if (!serviceRoadTex) {
    const [c, ctx] = canvas(256, 512);
    const R = rng(31);
    ctx.fillStyle = '#3d3d42';
    ctx.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 2600; i++) {
      const v = 50 + R() * 40;
      ctx.fillStyle = `rgba(${v},${v},${v + 4},0.5)`;
      ctx.fillRect(R() * 256, R() * 512, 1 + R() * 2, 1 + R() * 2);
    }
    // patch + crack lines
    ctx.fillStyle = 'rgba(25,25,28,0.5)';
    ctx.fillRect(40, 120, 70, 60);
    ctx.strokeStyle = 'rgba(15,15,18,0.6)';
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 6; k++) {
      ctx.beginPath();
      let x = R() * 256;
      let y = R() * 512;
      ctx.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        x += (R() - 0.5) * 30;
        y += R() * 30;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // edge lines (white) at ±4.1 m of 9 m width, double yellow centre
    const px = 256 / 9;
    ctx.fillStyle = '#d8d6cf';
    ctx.fillRect(0.35 * px, 0, 0.15 * px, 512);
    ctx.fillRect(256 - 0.5 * px, 0, 0.15 * px, 512);
    ctx.fillStyle = '#d9a520';
    ctx.fillRect(128 - 0.28 * px, 0, 0.12 * px, 512);
    ctx.fillRect(128 + 0.16 * px, 0, 0.12 * px, 512);
    serviceRoadTex = finish(c);
    serviceRoadTex.wrapS = THREE.ClampToEdgeWrapping;
    serviceRoadTex.wrapT = THREE.RepeatWrapping;
  }
  return roadMatCache ??= new THREE.MeshStandardMaterial({ map: serviceRoadTex, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
}
let roadMatCache: THREE.MeshStandardMaterial | undefined;

let lotTex: THREE.CanvasTexture | null = null;
let lotMat: THREE.MeshStandardMaterial | null = null;
/** Parking-lot asphalt with white stall lines every 2.7 m (tile = 2 stall rows, 5.5 m deep, 10.8 m wide). */
export function parkingLotMaterial(): THREE.MeshStandardMaterial {
  if (lotMat) return lotMat;
  const [c, ctx] = canvas(256, 256);
  const R = rng(55);
  ctx.fillStyle = '#45454a';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) {
    const v = 55 + R() * 40;
    ctx.fillStyle = `rgba(${v},${v},${v + 3},0.45)`;
    ctx.fillRect(R() * 256, R() * 256, 1 + R() * 2, 1 + R() * 2);
  }
  ctx.fillStyle = 'rgba(20,18,16,0.35)';
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    ctx.ellipse(32 + k * 64, 80, 10, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#e8e6df';
  for (let k = 0; k <= 4; k++) ctx.fillRect(k * 64 - 2, 0, 4, 128);
  ctx.fillRect(0, 126, 256, 4);
  lotTex = finish(c);
  lotTex.wrapS = lotTex.wrapT = THREE.RepeatWrapping;
  lotMat = new THREE.MeshStandardMaterial({ map: lotTex, roughness: 0.88, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  return lotMat;
}

/** A 9 m service-road strip from (x0,z0) to (x1,z1) (axis-aligned), lane paint running along it. */
export function roadStripGeometry(x0: number, z0: number, x1: number, z1: number, y = 0.03, width = 9): THREE.BufferGeometry {
  const alongZ = Math.abs(z1 - z0) >= Math.abs(x1 - x0);
  const len = alongZ ? Math.abs(z1 - z0) : Math.abs(x1 - x0);
  const g = new THREE.PlaneGeometry(width, len);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * (len / 16));
  g.rotateX(-Math.PI / 2);
  if (!alongZ) g.rotateY(Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  return g;
}

let asphaltMat: THREE.MeshStandardMaterial | null = null;
/** Worn back-of-house asphalt (oil drips, patches, faded seams); tiles every 12 m with world uvs. */
export function asphaltMaterial(): THREE.MeshStandardMaterial {
  if (asphaltMat) return asphaltMat;
  const [c, ctx] = canvas(256, 256);
  const R = rng(77);
  ctx.fillStyle = '#56565a';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2400; i++) {
    const v = 60 + R() * 45;
    ctx.fillStyle = `rgba(${v},${v},${v + 3},0.45)`;
    ctx.fillRect(R() * 256, R() * 256, 1 + R() * 2, 1 + R() * 2);
  }
  for (let k = 0; k < 7; k++) {
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 14 + R() * 18);
    g.addColorStop(0, 'rgba(22,20,18,0.45)');
    g.addColorStop(1, 'rgba(22,20,18,0)');
    ctx.save();
    ctx.translate(R() * 256, R() * 256);
    ctx.scale(1, 0.6 + R() * 0.8);
    ctx.fillStyle = g;
    ctx.fillRect(-40, -40, 80, 80);
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(70,70,74,0.6)';
  ctx.fillRect(150, 30, 60, 44);
  ctx.strokeStyle = 'rgba(30,30,32,0.5)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, 128);
  ctx.lineTo(256, 128);
  ctx.stroke();
  const t = finish(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  asphaltMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: 1.5, polygonOffsetUnits: 1.5 });
  return asphaltMat;
}

/** Flat ground patch whose UVs are world metres / (sx, sz), so one shared material tiles seamlessly. */
export function worldPlane(w: number, d: number, x: number, y: number, z: number, sx: number, sz: number, ox = 0, oz = 0): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, d, 1, Math.max(1, Math.round(d / 40)));
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - ox) / sx, (p.getZ(i) - oz) / sz);
  return g;
}
