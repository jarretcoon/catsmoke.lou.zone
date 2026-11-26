/**
 * GLSL for the Sphere: the Exosphere LED skin (show cycle on ~1.2 M "pucks"), the bowl's wrap-around
 * screen running an original procedural Kansas-twister show, the screen-lit bowl materials, the 4D
 * wind particles and the atrium's LED ceiling. Everything is procedural; no footage, no images.
 * NaN-safety: every pow() base is clamped, every divide is guarded (one NaN pixel + bloom = black frame).
 */

export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise2(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i), b = hash12(i + vec2(1.0, 0.0)), c = hash12(i + vec2(0.0, 1.0)), d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i), n100 = hash13(i + vec3(1.0, 0.0, 0.0)), n010 = hash13(i + vec3(0.0, 1.0, 0.0)), n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0)), n101 = hash13(i + vec3(1.0, 0.0, 1.0)), n011 = hash13(i + vec3(0.0, 1.0, 1.0)), n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y), mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}
float fbm2(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise2(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s / 0.9375; }
float fbm3(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s / 0.9375; }
/** Jagged (linear) 1-D noise for lightning. */
float lnoise(float x) { float i = floor(x); return mix(hash12(vec2(i, 3.7)), hash12(vec2(i + 1.0, 3.7)), fract(x)); }
mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float box2(vec2 p, vec2 c, vec2 h) { vec2 d = abs(p - c) - h; return step(max(d.x, d.y), 0.0); }
float insideTri(vec2 p, vec2 a, vec2 b, vec2 c) {
  float s0 = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  float s1 = (c.x - b.x) * (p.y - b.y) - (c.y - b.y) * (p.x - b.x);
  float s2 = (a.x - c.x) * (p.y - c.y) - (a.y - c.y) * (p.x - c.x);
  return ((s0 >= 0.0 && s1 >= 0.0 && s2 >= 0.0) || (s0 <= 0.0 && s1 <= 0.0 && s2 <= 0.0)) ? 1.0 : 0.0;
}
float segDist(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0); return length(pa - ba * h); }
`;

// ------------------------------------------------------------------ Exosphere skin
export const SKIN_VERT = /* glsl */ `
varying vec3 vDir;
varying vec3 vWPos;
#include <fog_pars_vertex>
void main() {
  vDir = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

export const SKIN_FRAG = /* glsl */ `
uniform float uTime;
uniform int uShowA;
uniform int uShowB;
uniform float uMix;
uniform float uTA;
uniform float uTB;
uniform vec3 uLook;
uniform float uBlink;
uniform float uBright;
uniform float uDay;
uniform vec3 uCam;
uniform vec3 uFront;
uniform vec3 uRight;
uniform vec3 uUp;
uniform sampler2D uText;
varying vec3 vDir;
varying vec3 vWPos;
#include <fog_pars_fragment>
const float TAU = 6.28318530718;
${NOISE_GLSL}

vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z); }

/** Title atlas: 4 rows of white text (0 = THE WIZARD OF OZ, 1 = AT SPHERE, 2 = SMOKING CAT TAKEOVER, 3 = SPHERE). */
float textRow(vec2 p, float row, vec2 c, float w) {
  float h = w / 8.0;
  vec2 uv = vec2((p.x - c.x) / w + 0.5, (p.y - c.y) / h + 0.5);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return texture2D(uText, vec2(uv.x, (3.0 - row + uv.y) / 4.0)).r;
}

vec3 showEye(vec3 n, float t) {
  vec3 L = uLook;
  float ang = acos(clamp(dot(n, L), -1.0, 1.0));
  float vn = fbm3(n * 5.0 + vec3(3.1, 1.7, 0.4));
  float vn2 = vnoise3(n * 21.0);
  float vein = (1.0 - smoothstep(0.0, 0.03, abs(vn - 0.5))) * smoothstep(0.55, 1.5, ang);
  vein = max(vein, (1.0 - smoothstep(0.0, 0.05, abs(vn2 - 0.5))) * smoothstep(1.1, 2.2, ang) * 0.55);
  vec3 col = mix(vec3(0.97, 0.95, 0.91), vec3(0.84, 0.8, 0.78), smoothstep(0.9, 2.7, ang));
  col = mix(col, vec3(0.8, 0.1, 0.08), vein * 0.75);
  vec3 t1 = normalize(cross(L, vec3(0.0, 1.0, 0.0)) + vec3(1e-4));
  vec3 t2 = cross(t1, L);
  float a = atan(dot(n, t2), dot(n, t1));
  float irisR = 0.44;
  float pupR = 0.15 + 0.025 * sin(t * 0.9);
  float fib = vnoise2(vec2(a * 9.549, ang * 14.0)) * 0.6 + vnoise2(vec2(a * 30.0, ang * 40.0)) * 0.4;
  vec3 iris = mix(vec3(0.03, 0.2, 0.36), vec3(0.3, 0.64, 0.8), fib);
  iris = mix(iris, vec3(0.66, 0.48, 0.14), (1.0 - smoothstep(pupR, pupR + 0.13, ang)) * 0.85);
  iris *= 0.6 + 0.6 * fib;
  iris = mix(iris, vec3(0.01, 0.03, 0.05), smoothstep(irisR - 0.1, irisR, ang));
  col = mix(iris, col, smoothstep(irisR - 0.004, irisR + 0.02, ang));
  col = mix(vec3(0.003), col, smoothstep(pupR - 0.012, pupR + 0.008, ang));
  vec3 hl = normalize(L + uUp * 0.2 - uRight * 0.16);
  float ha = acos(clamp(dot(n, hl), -1.0, 1.0));
  col += vec3(1.3) * (1.0 - smoothstep(0.05, 0.08, ha));
  // Blink: the lids close toward the iris's latitude
  float open = 1.0 - uBlink;
  float top = mix(L.y, 1.15, open);
  float bot = mix(L.y, -1.15, open);
  float lid = max(smoothstep(top - 0.012, top + 0.012, n.y), 1.0 - smoothstep(bot - 0.012, bot + 0.012, n.y));
  float lash = (1.0 - smoothstep(0.0, 0.04, abs(n.y - top))) + (1.0 - smoothstep(0.0, 0.03, abs(n.y - bot)));
  vec3 skin = vec3(0.86, 0.6, 0.48) * (0.85 + 0.15 * vnoise3(n * 30.0));
  col = mix(col, skin, lid);
  col = mix(col, vec3(0.05, 0.03, 0.02), clamp(lash, 0.0, 1.0) * step(0.001, uBlink));
  return col;
}

vec3 showEarth(vec3 n, float t, float ndv) {
  vec3 p = rotY(n, t * 0.07 + 1.3);
  float h = fbm3(p * 1.8 + vec3(4.0)) * 0.75 + fbm3(p * 5.0) * 0.25;
  float land = smoothstep(0.5, 0.53, h);
  float ice = smoothstep(0.8, 0.88, abs(p.y) + 0.06 * vnoise3(p * 9.0));
  vec3 ocean = mix(vec3(0.004, 0.03, 0.12), vec3(0.01, 0.1, 0.28), smoothstep(0.3, 0.5, h));
  vec3 terr = mix(vec3(0.05, 0.2, 0.05), vec3(0.42, 0.33, 0.16), smoothstep(0.56, 0.66, h + 0.1 * abs(p.y)));
  terr = mix(terr, vec3(0.64, 0.5, 0.3), smoothstep(0.62, 0.7, h) * (1.0 - smoothstep(0.35, 0.6, abs(p.y))));
  vec3 surf = mix(ocean, terr, land);
  surf = mix(surf, vec3(0.9, 0.93, 0.97), ice);
  vec3 pc = rotY(n, t * 0.095 + 0.4);
  float cl = smoothstep(0.52, 0.78, fbm3(pc * 2.6 + vec3(0.0, t * 0.01, 7.0)));
  vec3 S = normalize(vec3(-0.55, 0.25, 0.8));
  float sd = dot(n, S);
  float lit = smoothstep(-0.12, 0.25, sd);
  vec3 day = mix(surf, vec3(1.0), cl * 0.92) * (0.35 + 0.9 * max(sd, 0.0));
  float glint = pow(clamp(dot(reflect(-S, n), normalize(uCam - vWPos)), 0.0, 1.0), 40.0) * (1.0 - land) * (1.0 - cl);
  day += vec3(0.8, 0.85, 0.9) * glint;
  float city = land * (1.0 - ice) * step(0.8, hash13(floor(p * 140.0))) * smoothstep(0.42, 0.62, vnoise3(p * 11.0));
  vec3 night = vec3(1.25, 0.74, 0.32) * city * (1.0 - cl) + vec3(0.002, 0.006, 0.02);
  vec3 col = mix(night, day, lit);
  float rim = pow(clamp(1.0 - ndv, 0.0, 1.0), 3.0);
  col += vec3(0.25, 0.5, 1.0) * rim * (0.3 + 0.9 * lit);
  return col;
}

vec3 showMoon(vec3 n, float t, float ndv) {
  vec3 p = rotY(n, t * 0.02 + 2.0);
  float m = fbm3(p * 1.4 + vec3(7.0, 1.0, 3.0));
  float maria = smoothstep(0.48, 0.58, m);
  vec3 col = mix(vec3(0.84, 0.83, 0.8), vec3(0.38, 0.38, 0.4), maria * 0.85);
  col *= 0.88 + 0.24 * vnoise3(p * 18.0);
  for (int s = 0; s < 2; s++) {
    float sc = s == 0 ? 5.0 : 13.0;
    vec3 q = p * sc;
    vec3 cid = floor(q);
    vec3 f = fract(q);
    vec3 cc = 0.3 + 0.4 * vec3(hash13(cid), hash13(cid + 11.3), hash13(cid + 27.1));
    float rad = 0.1 + 0.18 * hash13(cid + 5.7);
    float dd = length(f - cc) / rad;
    float has = step(0.45, hash13(cid + 3.3));
    float rim = (1.0 - smoothstep(0.0, 0.2, abs(dd - 1.0))) * has;
    float bowl = (1.0 - smoothstep(0.7, 1.0, dd)) * has;
    col *= 1.0 - bowl * 0.22;
    col += rim * 0.16;
  }
  // A bright rayed crater, like Tycho
  vec3 ty = normalize(vec3(-0.7, -0.05, 0.55));
  float ta = acos(clamp(dot(p, ty), -1.0, 1.0));
  vec3 tt1 = normalize(cross(ty, vec3(0.0, 1.0, 0.0)));
  float tr = atan(dot(p, cross(ty, tt1)), dot(p, tt1));
  col += 0.22 * (1.0 - smoothstep(0.0, 0.9, ta)) * pow(clamp(vnoise2(vec2(tr * 9.0, 0.5)), 0.0, 1.0), 3.0);
  col *= 0.55 + 0.45 * sqrt(clamp(ndv, 0.0, 1.0));
  return col;
}

vec3 showBall(vec3 n, float t) {
  vec3 p = rotY(n, t * 0.8);
  float ct = cos(0.35), st = sin(0.35);
  p = vec3(p.x, ct * p.y - st * p.z, st * p.y + ct * p.z);
  vec3 col = vec3(0.88, 0.36, 0.07);
  col *= 0.8 + 0.3 * vnoise3(p * 150.0);
  float s1 = abs(p.y);
  float s2 = abs(p.z);
  float s3 = abs(abs(p.x) - 0.6 - 0.25 * p.y * p.y) * 0.85;
  float s = min(min(s1, s2), s3);
  col = mix(vec3(0.03, 0.02, 0.015), col, smoothstep(0.009, 0.016, s));
  vec3 K = normalize(uFront * 0.9 + uUp * 0.6 - uRight * 0.5);
  float dif = 0.35 + 0.8 * max(dot(n, K), 0.0);
  float spec = pow(clamp(dot(n, normalize(K + uFront)), 0.0, 1.0), 24.0) * 0.35;
  return col * dif + spec;
}

vec3 showEmoji(vec3 n, vec2 p, float facing, float t) {
  vec2 q = p - vec2(0.0, 0.34);
  vec3 col = mix(vec3(1.0, 0.6, 0.04), vec3(1.0, 0.86, 0.26), clamp(q.y * 0.6 + 0.6, 0.0, 1.0));
  if (facing > 0.0) {
    float ph = mod(t, 6.5);
    float wink = (ph > 3.0 && ph < 3.9) ? 1.0 : 0.0;
    vec3 brown = vec3(0.28, 0.14, 0.04);
    // eyes
    vec2 eL = (q - vec2(-0.2, 0.14)) / vec2(0.075, 0.13);
    vec2 eR = (q - vec2(0.2, 0.14)) / vec2(0.075, 0.13);
    if (wink < 0.5 && length(eL) < 1.0) col = brown;
    if (wink > 0.5 && abs(length(q - vec2(-0.2, 0.06)) - 0.09) < 0.022 && q.y > 0.08) col = brown;
    if (length(eR) < 1.0) col = brown;
    if (length(eR - vec2(-0.3, 0.45)) < 0.32 || (wink < 0.5 && length(eL - vec2(-0.3, 0.45)) < 0.32)) col = vec3(1.0);
    // big open grin
    vec2 m = q - vec2(0.0, 0.05);
    if (length(m) < 0.36 && m.y < -0.07) {
      col = vec3(0.36, 0.1, 0.04);
      if (m.y > -0.15) col = vec3(0.98, 0.97, 0.94);
      if (length(m - vec2(0.0, -0.33)) < 0.14) col = vec3(0.95, 0.36, 0.38);
    }
    if (abs(length(m) - 0.36) < 0.018 && m.y < -0.06) col = brown;
    // blush
    col = mix(col, vec3(1.0, 0.45, 0.3), 0.35 * (1.0 - smoothstep(0.0, 0.09, length(q - vec2(0.33, -0.05)))));
    col = mix(col, vec3(1.0, 0.45, 0.3), 0.35 * (1.0 - smoothstep(0.0, 0.09, length(q - vec2(-0.33, -0.05)))));
  }
  vec3 K = normalize(uFront + uUp * 0.7 - uRight * 0.4);
  return col * (0.55 + 0.6 * max(dot(n, K), 0.0));
}

vec3 showFireworks(vec3 n, float t) {
  vec3 col = mix(vec3(0.0, 0.0, 0.025), vec3(0.03, 0.0, 0.07), n.y * 0.5 + 0.5);
  float fl = atan(uFront.z, uFront.x);
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float per = 2.2 + fi * 0.31;
    float tt = t + fi * 1.13;
    float k = floor(tt / per);
    float ph = fract(tt / per);
    vec3 h3 = vec3(hash12(vec2(fi, k)), hash12(vec2(k, fi + 3.0)), hash12(vec2(fi + 7.0, k + 1.0)));
    float lon = fl + (h3.x * 2.0 - 1.0) * 1.9;
    float lat = 0.05 + h3.y * 0.75 - ph * ph * 0.12;
    vec3 c = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
    float ang = acos(clamp(dot(n, c), -1.0, 1.0));
    float r = 0.48 * (1.0 - (1.0 - ph) * (1.0 - ph) * (1.0 - ph));
    vec3 t1 = normalize(cross(c, vec3(0.0, 1.0, 0.0)));
    vec3 t2 = cross(t1, c);
    float a = atan(dot(n, t2), dot(n, t1));
    float spokes = pow(max(0.0, cos(a * 12.0 + fi * 3.0)), 5.0);
    float ring = 1.0 - smoothstep(0.0, 0.09, abs(ang - r));
    float trail = smoothstep(r * 0.15, r, ang) * step(ang, r);
    float fade = (1.0 - ph) * (1.0 - ph);
    vec3 hue = 0.5 + 0.5 * cos(6.2832 * (h3.z + vec3(0.0, 0.33, 0.67)));
    float glitter = step(0.7, hash12(floor(vec2(a * 24.0, ang * 50.0)) + k * 3.1)) * step(ang, r + 0.04) * (0.5 + 0.5 * sin(t * 25.0 + a * 40.0 + fi));
    col += hue * ((ring * 2.6 + trail * 0.6) * spokes + glitter * 0.9 * smoothstep(0.2, 0.6, ph)) * fade * 2.6;
    col += mix(hue, vec3(1.0), 0.5) * (1.0 - smoothstep(0.0, 0.22, ang)) * (1.0 - smoothstep(0.0, 0.12, ph)) * 2.5;
  }
  return col;
}

vec3 showOz(vec3 n, vec2 p, float facing, float t) {
  vec3 col = mix(vec3(0.86, 0.72, 0.5), vec3(0.24, 0.17, 0.11), clamp(p.y * 0.8 + 0.25, 0.0, 1.0));
  float gy = -0.06 + 0.025 * sin(p.x * 4.0);
  col = mix(col, vec3(0.36, 0.27, 0.16) * (0.85 + 0.3 * vnoise2(vec2(p.x * 40.0 + t * 3.0, p.y * 6.0))), smoothstep(gy + 0.008, gy - 0.008, p.y));
  // Swirling storm deck over the funnel
  vec2 cc = p - vec2(0.45, 1.0);
  float cr = length(cc);
  float ca = atan(cc.y, cc.x);
  float sw = fbm2(vec2(ca * 2.0 + t * 0.7 - cr * 5.0, cr * 6.0));
  col = mix(col, vec3(0.14, 0.1, 0.07), (1.0 - smoothstep(0.25, 0.75, cr + (sw - 0.5) * 0.35)) * 0.92);
  // The twister
  float yy = clamp((p.y - gy) / 0.95, 0.0, 1.0);
  float fx = 0.45 + 0.07 * sin(yy * 5.0 - t * 1.3) * (1.0 - yy) + 0.05 * sin(t * 0.4);
  float fw = 0.025 + 0.24 * pow(yy, 1.6);
  float s = (p.x - fx) / fw;
  float ph = asin(clamp(s, -1.0, 1.0));
  float bands = fbm2(vec2(ph * 2.0 - t * 4.0, yy * 10.0 - t * 1.5));
  float funnel = (1.0 - smoothstep(0.75, 1.05, abs(s) + (bands - 0.5) * 0.3)) * step(gy - 0.02, p.y);
  vec3 fcol = mix(vec3(0.07, 0.05, 0.035), vec3(0.42, 0.32, 0.21), bands) * (0.65 + 0.35 * cos(ph - 0.5));
  col = mix(col, fcol, funnel);
  // Dust skirt and whirling boards
  vec2 dq = (p - vec2(fx, gy)) / vec2(0.16, 0.07);
  col = mix(col, vec3(0.3, 0.23, 0.15), (1.0 - smoothstep(0.6, 1.0, length(dq) + 0.3 * (vnoise2(dq * 3.0 + t) - 0.5))) * 0.85);
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float a = t * (1.4 + fi * 0.2) + fi * 1.3;
    float hy = 0.1 + fract(fi * 0.37 + t * 0.05) * 0.6;
    vec2 dp = vec2(fx + cos(a) * (fw + 0.06) * 0.0 + cos(a) * (0.05 + 0.25 * hy), gy + hy);
    vec2 lq = rot2(a * 2.0) * (p - dp);
    col = mix(col, vec3(0.1, 0.07, 0.05), box2(lq, vec2(0.0), vec2(0.03, 0.006)) * step(0.0, sin(a)) );
  }
  // Title
  float vis = smoothstep(0.1, 0.35, facing);
  float tx = textRow(p, 0.0, vec2(-0.08, 0.3), 1.2);
  float tx2 = textRow(p, 1.0, vec2(-0.08, 0.12), 0.78);
  float sh = max(textRow(p + vec2(-0.008, 0.008), 0.0, vec2(-0.08, 0.3), 1.2), textRow(p + vec2(-0.006, 0.006), 1.0, vec2(-0.08, 0.12), 0.78));
  col = mix(col, vec3(0.05, 0.03, 0.02), sh * vis * 0.85);
  col = mix(col, vec3(1.25, 0.95, 0.45), max(tx, tx2) * vis);
  return col;
}

vec3 showCat(vec3 n, vec2 p, float facing, float t) {
  vec2 q = p - vec2(0.0, 0.36);
  float ang = atan(q.y, q.x);
  float rays = step(0.5, fract(ang / TAU * 16.0 + t * 0.05));
  vec3 col = mix(vec3(0.9, 0.06, 0.55), vec3(0.42, 0.04, 0.62), rays);
  col = mix(col, vec3(0.05, 0.75, 0.85), smoothstep(0.9, 1.7, length(q)) * 0.7);
  if (facing > -0.2) {
    vec3 fur = vec3(0.47, 0.42, 0.36);
    vec3 dark = vec3(0.17, 0.14, 0.12);
    vec2 aq = vec2(abs(q.x), q.y);
    float ear = insideTri(aq, vec2(0.12, 0.27), vec2(0.42, 0.14), vec2(0.33, 0.56));
    float inner = insideTri(aq, vec2(0.18, 0.28), vec2(0.37, 0.2), vec2(0.32, 0.46));
    if (ear > 0.5) col = inner > 0.5 ? vec3(0.95, 0.6, 0.62) : fur * 0.85;
    vec2 hq = q / vec2(0.45, 0.38);
    if (length(hq) < 1.0) {
      col = fur * (0.88 + 0.2 * vnoise2(q * 60.0));
      float fore = smoothstep(0.08, 0.3, q.y) * step(abs(q.x), 0.24) * smoothstep(0.45, 0.8, sin(q.x * 52.0 + 1.6));
      float cheek = step(0.26, abs(q.x)) * smoothstep(0.4, 0.8, sin(q.y * 36.0 + abs(q.x) * 9.0));
      col = mix(col, dark, max(fore, cheek) * 0.85);
      // muzzle and chin
      if (length((q - vec2(0.0, -0.15)) / vec2(0.22, 0.14)) < 1.0) col = vec3(0.86, 0.8, 0.7);
      // eyes (green-gold, slit pupils, blinks)
      float bl = (mod(t, 5.0) > 4.75) ? 1.0 : 0.0;
      vec2 e = vec2(aq.x - 0.17, q.y - 0.06);
      float eye = length(e / vec2(0.09, 0.065 * (1.0 - bl * 0.92)));
      if (eye < 1.0) {
        col = mix(vec3(0.55, 0.75, 0.12), vec3(0.95, 0.82, 0.2), clamp(-e.y * 8.0 + 0.5, 0.0, 1.0));
        if (abs(e.x) < 0.014 + 0.006 * sin(t)) col = vec3(0.02);
        if (length(e - vec2(-0.025, 0.025)) < 0.014) col = vec3(1.2);
      }
      if (abs(eye - 1.0) < 0.12) col = dark;
      // nose, mouth
      if (insideTri(q, vec2(-0.045, -0.07), vec2(0.045, -0.07), vec2(0.0, -0.115)) > 0.5) col = vec3(0.92, 0.5, 0.55);
      if (abs(length(vec2(aq.x - 0.04, q.y + 0.16)) - 0.04) < 0.007 && q.y < -0.15) col = dark;
    }
    // whiskers
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      vec2 a0 = vec2(0.16, -0.13 - fi * 0.03);
      vec2 a1 = vec2(0.56, -0.08 - fi * 0.09);
      if (segDist(aq, a0, a1) < 0.005) col = vec3(0.95);
    }
    // the cigarette (filter, paper, glowing ember) and smoke rings
    vec2 c0 = vec2(0.07, -0.21);
    vec2 c1 = vec2(0.52, -0.13);
    float cd = segDist(q, c0, c1);
    if (cd < 0.024) {
      float along = dot(q - c0, normalize(c1 - c0)) / length(c1 - c0);
      col = along < 0.27 ? vec3(0.85, 0.6, 0.3) : vec3(0.97);
      if (along > 0.95) col = vec3(2.2, 0.6, 0.12) * (0.75 + 0.25 * sin(t * 7.0));
    }
    col += vec3(1.0, 0.35, 0.05) * 0.5 * (1.0 - smoothstep(0.0, 0.07, length(q - c1)));
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float ph = fract(t * 0.2 + fi * 0.25);
      vec2 rc = c1 + vec2(0.05 * ph + 0.04 * sin(ph * 6.0 + fi), ph * 0.8);
      float rr = 0.025 + 0.13 * ph;
      float ring = 1.0 - smoothstep(0.0, 0.016 + 0.01 * ph, abs(length((q - rc) * vec2(1.0, 1.7)) - rr));
      col = mix(col, vec3(0.92), ring * (1.0 - ph) * 0.85);
    }
  }
  float vis = smoothstep(0.1, 0.35, facing);
  float tx = textRow(p, 2.0, vec2(0.0, -0.1), 1.45);
  float sh = textRow(p + vec2(-0.008, 0.008), 2.0, vec2(0.0, -0.1), 1.45);
  col = mix(col, vec3(0.02), sh * vis);
  col = mix(col, vec3(1.3, 1.15, 0.3), tx * vis);
  return col;
}

vec3 showById(int id, vec3 n, float t, float ndv) {
  vec2 p = vec2(dot(n, uRight), dot(n, uUp));
  float facing = dot(n, uFront);
  if (id == 0) return showEye(n, t);
  if (id == 1) return showEarth(n, t, ndv);
  if (id == 2) return showOz(n, p, facing, t);
  if (id == 3) return showMoon(n, t, ndv);
  if (id == 4) return showBall(n, t);
  if (id == 5) return showCat(n, p, facing, t);
  if (id == 6) return showEmoji(n, p, facing, t);
  return showFireworks(n, t);
}

void main() {
  vec3 n = normalize(vDir);
  vec3 V = normalize(uCam - vWPos);
  float ndv = max(dot(n, V), 0.0);
  // LED pucks: rings of latitude, each ring holding as many pucks as fit (even spacing like the real skin)
  float lat = asin(clamp(n.y, -1.0, 1.0));
  float lon = atan(n.z, n.x);
  const float NL = 640.0;
  float rowF = lat * NL / TAU;
  float row = floor(rowF);
  float latc = (row + 0.5) * TAU / NL;
  float nr = max(8.0, floor(NL * cos(latc)));
  float uF = (lon / TAU + 0.5) * nr;
  float lon2 = atan(-n.z, -n.x);
  float dLon = min(fwidth(lon), fwidth(lon2));
  float px = max(dLon * nr / TAU, fwidth(rowF));
  float vis = clamp(0.5 / max(px, 1e-4) - 1.2, 0.0, 1.0);
  vec2 f = vec2(fract(uF) - 0.5, fract(rowF) - 0.5);
  float d = length(f);
  float aa = clamp(px * 1.2, 0.03, 0.3);
  float puck = 1.0 - smoothstep(0.3 - aa, 0.3 + aa, d);
  float lonc = ((floor(uF) + 0.5) / nr - 0.5) * TAU;
  vec3 nc = vec3(cos(latc) * cos(lonc), sin(latc), cos(latc) * sin(lonc));
  vec3 ns = normalize(mix(n, nc, vis));
  vec3 img = showById(uShowA, ns, uTA, ndv);
  if (uMix > 0.001) img = mix(img, showById(uShowB, ns, uTB, ndv), uMix);
  img = max(img, vec3(0.0));
  float fill = mix(1.0, puck * 1.9, vis);
  vec3 col = img * uBright * fill;
  // The lattice the pucks hang on: dark steel, catches daylight
  vec3 frame = vec3(0.15, 0.16, 0.18) * (0.15 + uDay);
  col += frame * mix(0.25, 1.0 - puck, vis) * (0.5 + 0.5 * max(n.y, 0.0));
  col = min(col, vec3(3.0));
  gl_FragColor = vec4(col, 1.0);
  #ifdef USE_FOG
  #ifdef FOG_EXP2
    float fd = vFogDepth * fogDensity * 0.45;
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, 1.0 - exp(-fd * fd));
  #endif
  #endif
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ------------------------------------------------------------------ The bowl show (original procedural Kansas twister)
export const SHOW_VERT = /* glsl */ `
varying vec3 vWPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const SHOW_FRAG = /* glsl */ `
uniform float uT;
uniform float uDark;
uniform float uWind;
uniform float uVortex;
uniform float uFade;
uniform float uCamH;
uniform vec4 uFunnel;
uniform vec4 uHouse;
uniform vec4 uBolt;
uniform vec3 uSweet;
varying vec3 vWPos;
${NOISE_GLSL}
float fbm1(float x) { return vnoise2(vec2(x, 0.37)) * 0.5 + vnoise2(vec2(x * 2.1, 1.7)) * 0.25 + vnoise2(vec2(x * 4.3, 3.1)) * 0.125; }

/** Farmhouse in house-local metres: origin at ground, facade centre. */
vec4 farmhouse(vec2 q) {
  vec4 o = vec4(0.0);
  if (box2(q, vec2(0.0, 3.6), vec2(6.5, 3.6)) > 0.5) {
    float siding = 0.9 + 0.1 * step(0.5, fract(q.y * 2.6));
    o = vec4(vec3(0.84, 0.8, 0.72) * siding, 1.0);
    vec2 w = vec2(abs(q.x), q.y);
    float win = box2(w, vec2(2.3, 5.2), vec2(0.7, 0.9)) + box2(w, vec2(5.0, 5.2), vec2(0.7, 0.9)) + box2(w, vec2(4.4, 1.6), vec2(0.8, 0.95));
    if (win > 0.5) o.rgb = vec3(0.13, 0.12, 0.1) + vec3(0.5, 0.42, 0.25) * step(fract(q.y * 1.1), 0.08);
    if (box2(q, vec2(-1.6, 1.25), vec2(0.6, 1.25)) > 0.5) o.rgb = vec3(0.3, 0.24, 0.18);
  }
  if (box2(q, vec2(0.0, 2.9), vec2(7.3, 0.18)) > 0.5) o = vec4(0.28, 0.25, 0.22, 1.0);
  vec2 pq = vec2(abs(q.x), q.y);
  if (box2(pq, vec2(6.9, 1.4), vec2(0.13, 1.45)) + box2(pq, vec2(3.4, 1.4), vec2(0.13, 1.45)) > 0.5) o = vec4(0.7, 0.66, 0.6, 1.0);
  if (insideTri(q, vec2(-7.4, 7.0), vec2(7.4, 7.0), vec2(0.0, 11.2)) > 0.5) o = vec4(vec3(0.26, 0.24, 0.22) * (0.85 + 0.15 * step(0.5, fract(q.x * 1.5))), 1.0);
  if (length(q - vec2(0.0, 8.6)) < 0.75) o = vec4(0.12, 0.11, 0.1, 1.0);
  if (box2(q, vec2(3.6, 10.0), vec2(0.5, 1.6)) > 0.5) o = vec4(0.36, 0.22, 0.18, 1.0);
  return o;
}

vec4 windmill(vec2 q, float spin) {
  vec4 o = vec4(0.0);
  float h = 16.0;
  vec3 c = vec3(0.21, 0.2, 0.19);
  if (q.y >= 0.0 && q.y < h) {
    float hw = mix(2.4, 0.5, q.y / h);
    float leg = 1.0 - step(0.15, abs(abs(q.x) - hw));
    float zz = hw * (1.0 - 2.0 * abs(fract(q.y / 2.6) - 0.5)) * 2.0 - hw;
    float br = 1.0 - step(0.08, abs(q.x - zz));
    if (abs(q.x) < hw + 0.15 && max(leg, br) > 0.5) o = vec4(c, 1.0);
  }
  vec2 w = q - vec2(0.0, h + 0.5);
  float r = length(w);
  if (r < 4.3) {
    float a = atan(w.y, w.x) + spin;
    float blade = step(0.5, fract(a / 6.28318 * 14.0));
    if ((r > 0.9 && blade > 0.5) || r < 0.55 || abs(r - 4.0) < 0.14) o = vec4(c * 1.1, 1.0);
  }
  if (box2(q, vec2(2.8, h + 0.5), vec2(2.4, 0.12)) > 0.5 || insideTri(q, vec2(4.6, h + 0.5), vec2(6.3, h + 1.9), vec2(6.3, h - 0.8)) > 0.5) o = vec4(c, 1.0);
  return o;
}

vec4 fence(vec2 q, float wind) {
  if (q.y < 0.0 || q.y > 1.6 || abs(q.x) > 90.0) return vec4(0.0);
  float zz = q.x + wind * 0.3 * q.y;
  float post = (1.0 - step(0.1, abs(fract(zz / 3.0 + 0.5) - 0.5) * 3.0)) * step(q.y, 1.4);
  float rail = (1.0 - step(0.05, abs(q.y - 0.55))) + (1.0 - step(0.05, abs(q.y - 1.1)));
  rail *= step(wind * 0.85, hash12(vec2(floor(zz / 3.0), floor(q.y * 1.8))));
  return vec4(vec3(0.3, 0.26, 0.2), max(post, rail));
}

vec4 trees(vec2 q, float wind, float t) {
  if (q.x < -250.0 || q.x > -95.0 || q.y < 0.0 || q.y > 28.0) return vec4(0.0);
  float z = q.x + wind * (0.25 + 0.12 * sin(t * 2.3 + q.x * 0.05)) * q.y;
  float id = floor(z / 14.0);
  float cz = (id + 0.5) * 14.0 + (hash12(vec2(id, 2.0)) - 0.5) * 5.0;
  float hh = 12.0 + 8.0 * hash12(vec2(id, 5.0));
  float trunk = step(abs(z - cz), 0.55) * step(q.y, hh * 0.55);
  vec2 cq = vec2((z - cz) / 6.5, (q.y - hh * 0.72) / (hh * 0.36));
  float crown = step(length(cq) + 0.3 * (vnoise2(vec2(z, q.y) * 0.35 + t * wind * 2.0) - 0.5), 1.0);
  return vec4(vec3(0.24, 0.23, 0.2), max(trunk, crown));
}

vec4 barn(vec2 q) {
  q.x -= 78.0;
  vec4 o = vec4(0.0);
  if (box2(q, vec2(0.0, 3.5), vec2(9.0, 3.5)) > 0.5) {
    o = vec4(0.42, 0.36, 0.3, 1.0);
    if (box2(q, vec2(0.0, 2.2), vec2(2.6, 2.2)) > 0.5) {
      o.rgb = vec3(0.3, 0.25, 0.2);
      vec2 dq = (q - vec2(0.0, 2.2)) / vec2(2.6, 2.2);
      if (abs(dq.x - dq.y) < 0.08 || abs(dq.x + dq.y) < 0.08) o.rgb = vec3(0.62, 0.58, 0.5);
    }
  }
  float hw = q.y < 10.0 ? 9.2 - (q.y - 7.0) * 0.7 : 7.1 - (q.y - 10.0) * 2.2;
  if (q.y >= 7.0 && q.y < 13.2 && abs(q.x) < hw) o = vec4(0.24, 0.22, 0.2, 1.0);
  return o;
}

vec2 planeQ(vec3 O, vec3 d, float X) {
  float t = (X - O.x) / max(d.x, 1e-3);
  return vec2(O.z + d.z * t, O.y + d.y * t);
}

vec4 debris(vec3 O, vec3 d, float t, vec3 C, float spread, float vort) {
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    float h1 = hash12(vec2(fi, 1.3)), h2 = hash12(vec2(fi, 7.1)), h3 = hash12(vec2(fi, 4.7));
    float yy = mod(h1 * 260.0 + t * (8.0 + 14.0 * h2), 260.0);
    float rad = spread * (1.0 + 0.8 * h3) + yy * 0.25 * (1.0 - vort);
    float ang = h2 * 6.283 + t * (0.7 + 0.5 * h1) * (1.0 + vort * 1.5);
    vec3 P = C + vec3(rad * sin(ang), yy * (1.0 - vort) + vort * (h1 - 0.3) * 160.0, rad * cos(ang));
    vec3 to = P - O;
    float dist = max(length(to), 1.0);
    vec3 u = to / dist;
    float cs = dot(d, u);
    if (cs < 0.985) continue;
    vec3 r = normalize(cross(u, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(r, u);
    vec2 sp = vec2(dot(d, r), dot(d, up)) / cs * dist;
    sp = rot2(t * (2.0 + 3.0 * h1) + fi) * sp;
    float a = 0.0;
    float kind = mod(fi, 4.0);
    if (kind < 1.0) a = box2(sp, vec2(0.0), vec2(2.6, 0.2));
    else if (kind < 2.0) a = step(length(sp) + 0.5 * (vnoise2(sp * 3.0 + fi) - 0.5), 1.1);
    else if (kind < 3.0) a = insideTri(sp, vec2(-2.2, -0.9), vec2(2.2, -0.9), vec2(0.0, 1.1));
    else a = box2(sp, vec2(0.0), vec2(1.3, 0.9));
    acc = max(acc, vec4(vec3(0.15, 0.13, 0.11), a));
  }
  return acc;
}

float bolt(vec3 O, vec3 d) {
  if (uBolt.x <= 0.001 || d.x <= 0.01) return 0.0;
  vec2 q = planeQ(O, d, uBolt.z);
  float y = q.y;
  if (y < 0.0 || y > 700.0) return 0.0;
  float seed = uBolt.w * 17.0;
  float zb = uBolt.y + (lnoise(y * 0.012 + seed) - 0.5) * 130.0 + (lnoise(y * 0.05 + seed * 2.0) - 0.5) * 40.0 + (lnoise(y * 0.2 + seed) - 0.5) * 9.0;
  float dz = abs(q.x - zb);
  float core = exp(-dz * 0.8);
  float glow = exp(-dz * 0.035) * 0.3;
  float br = 0.0;
  float yb = 420.0 - y;
  if (yb > 0.0 && yb < 260.0) {
    float zb2 = zb + yb * (hash12(vec2(seed, 2.0)) > 0.5 ? 0.45 : -0.45) + (lnoise(y * 0.08 + seed * 3.0) - 0.5) * 20.0;
    br = exp(-abs(q.x - zb2) * 1.1) * (1.0 - yb / 260.0);
  }
  return (core * 2.2 + glow + br) * uBolt.x;
}

vec3 prairie(vec3 d) {
  vec3 O = vec3(0.0, uCamH, 0.0);
  float dark = uDark;
  float h = d.y;
  vec3 skyTop = mix(vec3(0.5, 0.56, 0.66), vec3(0.1, 0.1, 0.105), dark);
  vec3 skyHor = mix(vec3(0.96, 0.92, 0.84), vec3(0.34, 0.31, 0.27), dark);
  vec3 dustC = vec3(0.55, 0.47, 0.36) * mix(1.0, 0.6, dark);
  vec3 col = mix(skyHor, skyTop, smoothstep(0.0, 0.55, h));
  float flash = uBolt.x;
  if (h > 0.0) {
    float tc = (700.0 - O.y) / max(h, 0.02);
    vec2 cp = O.xz + d.xz * tc;
    vec2 fc = uFunnel.xy;
    vec2 rel = cp - fc;
    float rr = length(rel);
    // Rigid rotation of the storm deck round the funnel plus a fixed spiral twist (never winds up)
    rel = rot2(uFunnel.w * (uT * 0.05 + 2.4 * exp(-rr / 650.0))) * rel;
    cp = fc + rel;
    float n = fbm2(cp * 0.0011 + vec2(uT * 0.004 * (1.0 + 4.0 * uWind), 0.0));
    float cov = mix(0.5, 0.2, dark);
    float cl = smoothstep(cov, cov + 0.22, n) * smoothstep(0.0, 0.12, h);
    vec3 cc = mix(vec3(0.98, 0.96, 0.92), vec3(0.2, 0.19, 0.18), clamp(dark * 0.9 + (n - 0.5) * 0.5, 0.0, 1.0));
    cc *= 1.0 - 0.55 * uFunnel.w * exp(-rr / 450.0);
    col = mix(col, cc, cl);
    col += vec3(0.85, 0.88, 1.0) * flash * (0.2 + 0.6 * cl);
  } else {
    float tg = -O.y / min(h, -1e-4);
    vec3 P = O + d * tg;
    vec2 g = P.xz;
    float near = 1.0 - smoothstep(30.0, 400.0, tg);
    float gn = mix(0.5, fbm2(g * 0.07), 1.0 - smoothstep(150.0, 900.0, tg));
    vec3 grass = mix(vec3(0.5, 0.45, 0.3), vec3(0.78, 0.7, 0.48), gn);
    float speed = 1.5 + 24.0 * uWind;
    float streak = vnoise2(vec2(g.x * 0.3, (g.y + uT * speed) * 0.06));
    grass *= 1.0 + (streak - 0.5) * (0.25 + 0.6 * uWind) * near;
    float zr = -9.0 * smoothstep(0.0, 110.0, g.x) + 2.5 * sin(g.x * 0.025);
    float road = (1.0 - smoothstep(2.2, 3.0, abs(g.y - zr))) * step(-5.0, g.x) * (1.0 - smoothstep(112.0, 118.0, g.x));
    grass = mix(grass, vec3(0.74, 0.64, 0.5) * (0.9 + 0.2 * vnoise2(g * 0.8)), road);
    grass *= mix(1.0, 0.42, dark);
    float haze = 1.0 - exp(-tg * mix(0.0012, 0.005, uWind));
    col = mix(grass, mix(skyHor, dustC, uWind), haze);
    col += vec3(0.6, 0.62, 0.7) * flash * 0.22;
  }
  if (d.x <= 0.0) return col;
  // Far hills
  vec2 hq = planeQ(O, d, 2800.0);
  float hh = 35.0 + 110.0 * fbm1(hq.x * 0.0012 + 3.0);
  if (hq.y > 0.0 && hq.y < hh) col = mix(col, mix(skyHor, vec3(0.45, 0.4, 0.34), 0.5) * mix(1.0, 0.6, dark) + flash * 0.15, 0.9);
  float X = uFunnel.x;
  if (X > 330.0) {
    // funnel behind the tree line (far away)
  }
  // Funnel + its dust skirt (composited at its own depth below)
  vec4 F = vec4(0.0);
  vec4 Dst = vec4(0.0);
  if (uFunnel.w > 0.0) {
    vec2 q = planeQ(O, d, X);
    float y = q.y;
    if (y > -5.0) {
      float yy = clamp(y / 700.0, 0.0, 1.0);
      float r = mix(9.0, 170.0, pow(yy, 1.8));
      float zc = uFunnel.y + 45.0 * sin(yy * 2.2 + uT * 0.3) * yy + 14.0 * sin(yy * 9.0 - uT * 1.1) * (1.0 - yy);
      float s = (q.x - zc) / r;
      float en = fbm2(vec2(y * 0.025, uT * 0.5));
      float body = 1.0 - smoothstep(0.72, 1.05, abs(s) + (en - 0.5) * 0.35);
      body *= smoothstep(uFunnel.z - 25.0, uFunnel.z + 40.0, y) * step(0.0, y);
      float ph = asin(clamp(s, -1.0, 1.0));
      float sw = fbm2(vec2(ph * 1.7 - uT * 2.6 + y * 0.006, y * 0.016 - uT * 0.8));
      vec3 fcol = mix(vec3(0.2, 0.18, 0.16), vec3(0.54, 0.5, 0.44), sw) * (0.7 + 0.35 * cos(ph - 0.7));
      fcol = fcol * mix(1.0, 0.6, dark) + vec3(0.5) * flash * 0.4;
      F = vec4(fcol, body * uFunnel.w);
      float touch = 1.0 - smoothstep(0.0, 30.0, uFunnel.z);
      vec2 dq = vec2((q.x - uFunnel.y) / 80.0, y / 40.0);
      float dl = length(dq);
      float da = atan(dq.y, dq.x);
      float dust = (1.0 - smoothstep(0.55, 1.0, dl + 0.35 * (fbm2(vec2(da * 2.0 - uT * 1.8, dl * 3.0 - uT)) - 0.5))) * touch * step(0.0, y);
      Dst = vec4(vec3(0.42, 0.35, 0.27) * mix(1.0, 0.62, dark), dust * 0.85 * uFunnel.w);
    }
  }
  float bl = bolt(O, d);
  col += vec3(0.95, 0.97, 1.1) * bl * step(uBolt.z, X);  // strikes behind the funnel
  if (X > 320.0) { col = mix(col, F.rgb, F.a); col = mix(col, Dst.rgb, Dst.a); }
  // Tree line and barn
  vec2 tq = planeQ(O, d, 330.0);
  vec4 tr = trees(tq, uWind, uT);
  col = mix(col, tr.rgb * mix(1.0, 0.55, dark), tr.a * 0.95);
  vec4 bn = barn(planeQ(O, d, 300.0));
  col = mix(col, bn.rgb * mix(1.0, 0.55, dark), bn.a);
  if (X <= 320.0) { col = mix(col, F.rgb, F.a); col = mix(col, Dst.rgb, Dst.a); }
  col += vec3(0.95, 0.97, 1.1) * bl * (1.0 - step(uBolt.z, X));
  // Debris whirling round the funnel
  if (uWind > 0.5) {
    vec4 db = debris(O, d, uT, vec3(X, 0.0, uFunnel.y), 45.0, 0.0);
    col = mix(col, db.rgb, db.a * smoothstep(0.5, 0.8, uWind));
  }
  // Windmill (its wheel spins up with the wind)
  vec2 wq = planeQ(O, d, 138.0) - vec2(24.0, 0.0);
  vec4 wm = windmill(wq, uT * (0.6 + 7.0 * uWind) + uWind * uWind * uT * 4.0);
  col = mix(col, wm.rgb * mix(1.0, 0.6, dark), wm.a);
  // The farmhouse: lifts and spins up into the funnel
  vec2 fq = planeQ(O, d, 118.0);
  vec2 hc = vec2(-9.0 + uHouse.z, 5.5 + uHouse.x);
  vec4 hs = farmhouse(rot2(-uHouse.y) * (fq - hc) + vec2(0.0, 5.5));
  if (uHouse.w < 0.01 && fq.y < 0.0) hs.a = 0.0;
  hs.a *= 1.0 - smoothstep(0.0, 0.35, uVortex);
  col = mix(col, hs.rgb * mix(1.0, 0.55, dark) + flash * 0.25, hs.a);
  // Chicken coop (its roof blows off)
  vec2 cq = planeQ(O, d, 100.0) - vec2(10.0, 0.0);
  float coop = box2(cq, vec2(0.0, 1.1), vec2(2.4, 1.1));
  if (uT < 47.0) coop = max(coop, insideTri(cq, vec2(-2.7, 2.2), vec2(2.7, 2.2), vec2(-2.7, 3.2)));
  if (cq.y >= 0.0) col = mix(col, vec3(0.34, 0.3, 0.25) * mix(1.0, 0.55, dark), coop);
  // Fence line
  vec4 fn = fence(planeQ(O, d, 26.0), uWind);
  col = mix(col, fn.rgb * mix(1.0, 0.55, dark), fn.a);
  // Dust streaming sideways through the air
  float airN = vnoise2(vec2(d.y * 38.0, (d.z / max(d.x, 0.2)) * 5.0 + uT * (0.4 + 5.5 * uWind)));
  col = mix(col, dustC, smoothstep(0.55, 1.0, airN) * uWind * 0.38 * (1.0 - smoothstep(0.0, 0.4, d.y)));
  return col;
}

vec3 vortex(vec3 d) {
  float hl = max(length(d.xz), 0.04);
  float y = d.y / hl;
  float ang = atan(d.z, d.x);
  float k = uT - 63.0;
  float n1 = fbm2(vec2(ang * 1.9 + k * 1.7 + y * 0.9, y * 1.3 - k * 1.1));
  float n2 = fbm2(vec2(ang * 5.7 - k * 2.4 + y * 2.0, y * 3.1 - k * 2.0));
  vec3 c = mix(vec3(0.16, 0.14, 0.12), vec3(0.68, 0.62, 0.52), clamp(n1 * 0.75 + n2 * 0.45 - 0.1, 0.0, 1.0));
  c *= 0.85 + 0.3 * vnoise2(vec2(ang * 20.0 + k * 6.0, y * 0.5));
  c = mix(c, vec3(1.12, 1.04, 0.9), smoothstep(0.35, 0.97, d.y));
  c *= mix(0.45, 1.0, smoothstep(-0.8, 0.1, d.y));
  vec4 db = debris(vec3(0.0), d, uT, vec3(0.0, 0.0, 0.0), 40.0, 1.0);
  c = mix(c, db.rgb, db.a);
  vec3 hd = normalize(vec3(1.0, 0.5 + 0.035 * k, 0.15 * sin(k * 0.6)));
  float cs = dot(d, hd);
  if (cs > 0.8) {
    vec3 r = normalize(cross(hd, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(r, hd);
    vec2 sp = vec2(dot(d, r), dot(d, up)) / cs * 34.0;
    vec4 h = farmhouse(rot2(-uHouse.y) * sp + vec2(0.0, 5.5));
    c = mix(c, h.rgb * 0.75, h.a * smoothstep(0.45, 0.9, uVortex));
  }
  return c;
}

void main() {
  vec3 d = normalize(vWPos - uSweet);
  vec3 c = uVortex < 0.999 ? prairie(d) : vec3(0.0);
  if (uVortex > 0.001) c = mix(c, vortex(d), uVortex);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 sep = l * vec3(1.08, 0.9, 0.68);
  c = mix(sep, c, 0.14);
  c *= 0.95 + 0.05 * hash12(floor(gl_FragCoord.xy * 0.5) + floor(uT * 24.0) * 7.0);
  c = mix(c, vec3(1.3, 1.2, 1.05), uFade);
  c *= 0.85;
  gl_FragColor = vec4(clamp(c, 0.0, 4.0), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ------------------------------------------------------------------ Bowl materials lit by the screen
export const LIT_VERT = /* glsl */ `
uniform vec3 uBase;
varying vec3 vN;
varying vec3 vW;
varying vec3 vC;
void main() {
  vec4 p = vec4(position, 1.0);
  vec3 nn = normal;
  vC = uBase;
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
    nn = mat3(instanceMatrix) * nn;
  #endif
  #ifdef USE_INSTANCING_COLOR
    vC *= instanceColor;
  #endif
  #ifdef USE_COLOR
    vC *= color;
  #endif
  vec4 w = modelMatrix * p;
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * nn);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const LIT_FRAG = /* glsl */ `
uniform vec3 uScreen;
uniform float uFlash;
uniform vec3 uScreenPos;
uniform float uAmb;
uniform vec3 uEmis;
varying vec3 vN;
varying vec3 vW;
varying vec3 vC;
void main() {
  vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 L = normalize(uScreenPos - vW);
  float lam = max(dot(n, L), 0.0);
  float up = max(n.y, 0.0);
  vec3 light = uScreen * (0.15 + 0.85 * lam + 0.35 * up) + vec3(uAmb) + vec3(0.9, 0.93, 1.0) * uFlash * (0.35 + 0.65 * lam);
  gl_FragColor = vec4(vC * light + uEmis, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ------------------------------------------------------------------ 4D wind: leaves and dust through the seating
export const WIND_VERT = /* glsl */ `
attribute vec4 seed;
uniform float uTime;
uniform float uWind;
uniform vec3 uBoxMin;
uniform vec3 uBoxSize;
uniform float uScale;
varying float vKind;
varying float vA;
varying float vSpin;
void main() {
  float sp = 2.0 + 14.0 * uWind;
  float z = fract(seed.z - uTime * sp * (0.6 + 0.6 * seed.w) / uBoxSize.z);
  float y = fract(seed.y + 0.03 * sin(uTime * 0.9 + seed.w * 20.0) - uTime * 0.012 * (1.0 + seed.w));
  float x = fract(seed.x + 0.015 * sin(uTime * 1.3 + seed.w * 30.0));
  vec3 p = uBoxMin + vec3(x, y, z) * uBoxSize;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vKind = seed.w;
  gl_PointSize = clamp(uScale * (seed.w < 0.45 ? 0.11 : 0.045) / max(-mv.z, 0.5), 1.0, 48.0);
  vA = smoothstep(0.05, 0.4, uWind) * smoothstep(0.0, 0.08, z) * (1.0 - smoothstep(0.92, 1.0, z));
  vSpin = uTime * (3.0 + 6.0 * seed.w) + seed.w * 40.0;
}
`;

export const WIND_FRAG = /* glsl */ `
uniform vec3 uScreen;
uniform float uFlash;
varying float vKind;
varying float vA;
varying float vSpin;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a;
  vec3 col;
  if (vKind < 0.45) {
    vec2 r = mat2(cos(vSpin), sin(vSpin), -sin(vSpin), cos(vSpin)) * c;
    a = 1.0 - smoothstep(0.85, 1.0, length(r / vec2(0.48, 0.2)));
    col = mix(vec3(0.42, 0.26, 0.1), vec3(0.62, 0.48, 0.18), fract(vKind * 7.3));
  } else {
    a = (1.0 - smoothstep(0.1, 0.5, length(c))) * 0.6;
    col = vec3(0.78, 0.7, 0.56);
  }
  col *= uScreen * 1.3 + 0.08 + uFlash * 0.8;
  gl_FragColor = vec4(col, a * vA);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ------------------------------------------------------------------ Atrium LED ceiling
export const CEIL_VERT = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const CEIL_FRAG = /* glsl */ `
uniform float uTime;
varying vec3 vW;
void main() {
  vec2 p = vW.xz * 0.09;
  float a = sin(p.x * 1.3 + uTime * 0.5) + sin(p.y * 1.7 - uTime * 0.35) + sin((p.x + p.y) * 0.9 + uTime * 0.25);
  vec3 c = 0.5 + 0.5 * cos(vec3(0.0, 2.1, 4.2) + a * 1.1 + uTime * 0.15);
  c = mix(c, vec3(0.92, 0.95, 1.0), 0.45);
  vec2 g = abs(fract(vW.xz / 1.4) - 0.5);
  c *= 1.0 - smoothstep(0.46, 0.5, max(g.x, g.y)) * 0.55;
  gl_FragColor = vec4(c * 0.95, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
