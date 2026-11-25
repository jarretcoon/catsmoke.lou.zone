import * as THREE from 'three';
import { makeSignTexture } from './textures';

// ---------- shared material cache (identical looks share one material) ----------
const matCache = new Map<string, THREE.Material>();
export function mat(color: number, roughness = 0.7, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const key = `s|${color}|${roughness}|${metalness}|${JSON.stringify(extra)}`;
  let m = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
    matCache.set(key, m);
  }
  return m;
}
export function basic(color: number, extra: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial {
  const key = `b|${color}|${JSON.stringify(extra)}`;
  let m = matCache.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, ...extra });
    matCache.set(key, m);
  }
  return m;
}

export function mesh(geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, cast = false): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

export function neonSign(text: string, bg: string, fg: string, width = 8, height = 1.9, subtext?: string, depth = 0.28): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshBasicMaterial({ map: makeSignTexture(text, bg, fg, subtext) }));
}

// ---------- vegetation ----------
export function palmTree(height = 7.5, pinkNeon = false, seed = 0): THREE.Group {
  const g = new THREE.Group();
  const trunkMat = mat(0x6b5038, 0.95);
  const lean = ((seed % 5) - 2) * 0.035;
  const segs = 7;
  for (let i = 0; i < segs; i++) {
    const h = height / segs;
    const r = 0.26 - (i / segs) * 0.1;
    const seg = mesh(new THREE.CylinderGeometry(r * 0.92, r, h * 1.02, 8), trunkMat, Math.sin(lean) * i * h, h * (i + 0.5), 0, true);
    seg.rotation.z = -lean;
    g.add(seg);
  }
  const topX = Math.sin(lean) * height;
  const frondMat = pinkNeon
    ? mat(0xff5eb8, 0.55, 0, { emissive: 0xff2b9e, emissiveIntensity: 0.8 })
    : mat(0x2f7a3a, 0.8, 0, { side: THREE.DoubleSide });
  const frondGeo = new THREE.ConeGeometry(0.42, 3.2, 4, 1);
  frondGeo.scale(1, 1, 0.18);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + seed;
    const droop = 1.05 + (i % 3) * 0.18;
    const frond = new THREE.Mesh(frondGeo, frondMat);
    frond.position.set(topX + Math.cos(a) * 1.25, height - 0.2 - (i % 2) * 0.15, Math.sin(a) * 1.25);
    frond.rotation.order = 'YXZ';
    frond.rotation.y = -a + Math.PI / 2;
    frond.rotation.x = droop;
    g.add(frond);
  }
  const nutMat = mat(0x4a3a20, 0.8);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    g.add(mesh(new THREE.SphereGeometry(0.12, 6, 5), nutMat, topX + Math.cos(a) * 0.22, height - 0.4, Math.sin(a) * 0.22));
  }
  return g;
}

export function cypressTree(h = 5.4): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.2, 6), mat(0x453020, 0.9), 0, 0.6, 0));
  g.add(mesh(new THREE.ConeGeometry(0.72, h, 8), mat(0x1d4529, 0.88), 0, 0.9 + h / 2, 0, true));
  return g;
}

export function planter(w: number, d: number, flowers = 0xff5e8e): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(w, 0.6, d), mat(0xcbbca6, 0.8), 0, 0.3, 0));
  g.add(mesh(new THREE.BoxGeometry(w - 0.2, 0.25, d - 0.2), mat(0x2f6b34, 0.9), 0, 0.68, 0));
  for (let i = 0; i < Math.floor(w * d * 1.5); i++) {
    g.add(mesh(new THREE.SphereGeometry(0.12, 6, 5), mat(i % 3 ? flowers : 0xffe066, 0.7), ((i * 0.37) % 1 - 0.5) * (w - 0.5), 0.84, ((i * 0.61) % 1 - 0.5) * (d - 0.5)));
  }
  return g;
}

// ---------- street furniture ----------
/** Strip-style decorative light pole: tall, dark bronze, twin acorn lanterns + banner arms. */
export function stripLightPole(bannerColor = 0xd4a640): { group: THREE.Group; bulbs: THREE.Mesh[] } {
  const g = new THREE.Group();
  const pole = mat(0x2a2622, 0.4, 0.7);
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.6, 10), pole, 0, 0.3, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.11, 0.16, 8.6, 10), pole, 0, 4.6, 0, true));
  const bulbMat = basic(0xffe9b8);
  const bulbs: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const arm = mesh(new THREE.BoxGeometry(1.7, 0.09, 0.09), pole, s * 0.85, 8.4, 0);
    g.add(arm);
    g.add(mesh(new THREE.CylinderGeometry(0.22, 0.12, 0.32, 8), pole, s * 1.65, 8.25, 0));
    const b = mesh(new THREE.SphereGeometry(0.2, 10, 8), bulbMat, s * 1.65, 7.95, 0);
    g.add(b);
    bulbs.push(b);
  }
  // Vertical street banners (the Strip hangs event banners on its poles)
  const banner = mat(bannerColor, 0.75, 0, { side: THREE.DoubleSide });
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.03, 1.6, 0.7), banner, s * 0.16, 6.2, s * 0.35));
  g.add(mesh(new THREE.SphereGeometry(0.16, 8, 6), pole, 0, 9.0, 0));
  return { group: g, bulbs };
}

export function bollard(): THREE.Mesh {
  return mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.95, 10), mat(0x3a3530, 0.4, 0.6), 0, 0.475, 0);
}

export function trashCan(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.32, 0.3, 0.95, 12), mat(0x2b3a2f, 0.6, 0.3), 0, 0.475, 0, true));
  g.add(mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.08, 12), mat(0x1c241e, 0.5, 0.4), 0, 0.99, 0));
  return g;
}

/** Sand-topped ash urn — Strip smokers' meeting point. */
export function ashUrn(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.8, 12), mat(0x8a8f99, 0.3, 0.85), 0, 0.4, 0, true));
  g.add(mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.03, 12), mat(0xe2d3b2, 0.95), 0, 0.81, 0));
  for (let i = 0; i < 4; i++) {
    const butt = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 5), mat(0xd59a52, 0.8), Math.cos(i * 1.7) * 0.1, 0.84, Math.sin(i * 1.7) * 0.1);
    butt.rotation.z = 1.3;
    butt.rotation.y = i;
    g.add(butt);
  }
  return g;
}

export function newsRack(colors: number[] = [0xd8352b, 0x2c6bd1, 0xf2c230, 0x2f9e57]): THREE.Group {
  const g = new THREE.Group();
  colors.forEach((c, i) => {
    g.add(mesh(new THREE.BoxGeometry(0.5, 1.05, 0.45), mat(c, 0.5, 0.2), (i - (colors.length - 1) / 2) * 0.55, 0.53, 0, true));
    g.add(mesh(new THREE.BoxGeometry(0.4, 0.3, 0.02), basic(0xf4f0e2), (i - (colors.length - 1) / 2) * 0.55, 0.82, 0.235));
  });
  return g;
}

export function fireHydrant(): THREE.Group {
  const g = new THREE.Group();
  const m = mat(0xd9b21e, 0.5, 0.2);
  g.add(mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.6, 10), m, 0, 0.3, 0));
  g.add(mesh(new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, 0.6, 0));
  const nozzle = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8), m, 0, 0.42, 0);
  nozzle.rotation.z = Math.PI / 2;
  g.add(nozzle);
  return g;
}

export function bench(): THREE.Group {
  const g = new THREE.Group();
  const metal = mat(0x23262c, 0.4, 0.7);
  g.add(mesh(new THREE.BoxGeometry(1.8, 0.08, 0.5), metal, 0, 0.45, 0));
  g.add(mesh(new THREE.BoxGeometry(1.8, 0.5, 0.06), metal, 0, 0.72, -0.22));
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.08, 0.45, 0.5), metal, s * 0.8, 0.22, 0));
  return g;
}

export interface TrafficSignal {
  group: THREE.Group;
  setState: (state: 'green' | 'yellow' | 'red') => void;
}

/** Mast-arm traffic signal; arm points along local +x over `armLength` meters. */
export function trafficSignal(armLength: number): TrafficSignal {
  const g = new THREE.Group();
  const pole = mat(0x8c8f94, 0.45, 0.6);
  g.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 7.2, 10), pole, 0, 3.6, 0, true));
  g.add(mesh(new THREE.BoxGeometry(armLength, 0.18, 0.18), pole, armLength / 2, 6.9, 0));
  const housingMat = mat(0x1b1d22, 0.6);
  const lamps: Array<{ m: THREE.MeshBasicMaterial; on: number; off: number; key: 'green' | 'yellow' | 'red' }> = [];
  const heads: number[] = [armLength * 0.45, armLength * 0.75, armLength * 0.98];
  for (const hx of heads) {
    g.add(mesh(new THREE.BoxGeometry(0.42, 1.2, 0.38), housingMat, hx, 6.25, 0));
    const defs: Array<['red' | 'yellow' | 'green', number, number, number]> = [
      ['red', 0xff2a1a, 0x3a0d0a, 0.38],
      ['yellow', 0xffc21a, 0x3a2c0a, 0],
      ['green', 0x2bff7a, 0x0a3a1e, -0.38],
    ];
    for (const [key, on, off, dy] of defs) {
      const m = new THREE.MeshBasicMaterial({ color: off });
      g.add(mesh(new THREE.CircleGeometry(0.14, 12), m, hx, 6.25 + dy, 0.2));
      const back = mesh(new THREE.CircleGeometry(0.14, 12), m, hx, 6.25 + dy, -0.2);
      back.rotation.y = Math.PI;
      g.add(back);
      lamps.push({ m, on, off, key });
    }
  }
  return {
    group: g,
    setState: (state) => {
      for (const l of lamps) l.m.color.setHex(l.key === state ? l.on : l.off);
    },
  };
}

// ---------- casino furniture ----------
const slotScreens = new Map<string, THREE.CanvasTexture>();
function slotScreenTexture(accent: string): THREE.CanvasTexture {
  let t = slotScreens.get(accent);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0c1020';
  ctx.fillRect(0, 0, 128, 96);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.strokeRect(3, 3, 122, 90);
  ctx.fillStyle = '#ffffff';
  for (const x of [14, 50, 86]) ctx.fillRect(x, 24, 28, 48);
  ctx.fillStyle = accent;
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  for (const x of [28, 64, 100]) ctx.fillText('7', x, 57);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  slotScreens.set(accent, t);
  return t;
}

export function slotMachine(accentHex: string, topperHex: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(1.0, 1.75, 0.85), mat(0x222638, 0.32, 0.6), 0, 0.875, 0, true));
  g.add(mesh(new THREE.BoxGeometry(1.04, 0.08, 0.9), mat(0xf0be4d, 0.25, 0.85), 0, 0.82, 0));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.62), new THREE.MeshBasicMaterial({ map: slotScreenTexture(accentHex) }));
  screen.position.set(0, 1.25, 0.43);
  g.add(screen);
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.28, 16), basic(topperHex), 0, 1.9, 0));
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.22, 0.35), mat(0x30344a, 0.4, 0.5), 0, 0.85, 0.55));
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.6, 10), mat(0x8c1c28, 0.6), 0, 0.3, 1.05)); // stool
  g.add(mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.1, 12), mat(0x5a0f18, 0.55), 0, 0.64, 1.05));
  return g;
}

export function rouletteTable(feltHex: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(3.6, 0.85, 1.7), mat(0x3b2116, 0.5), 0, 0.42, 0, true));
  g.add(mesh(new THREE.BoxGeometry(3.8, 0.12, 1.9), mat(0x4b1c12, 0.35), 0, 0.9, 0));
  g.add(mesh(new THREE.BoxGeometry(3.4, 0.05, 1.5), mat(feltHex, 0.9), 0, 0.97, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.14, 24), mat(0x1a1412, 0.3, 0.4), -1.3, 1.04, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.02, 24), mat(0xa82020, 0.4), -1.3, 1.12, 0));
  g.add(mesh(new THREE.ConeGeometry(0.1, 0.2, 10), mat(0xf4c44e, 0.2, 0.9), -1.3, 1.22, 0));
  for (let i = 0; i < 6; i++) g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08 + (i % 3) * 0.05, 10), mat([0xe83b4d, 0x3482f6, 0xf2c23a][i % 3], 0.4), 0.2 + i * 0.22, 1.03, (i % 2 ? 0.3 : -0.3)));
  return g;
}

export function blackjackTable(feltHex: number): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.CylinderGeometry(1.7, 1.7, 0.1, 28, 1, false, -Math.PI / 2, Math.PI);
  const rail = new THREE.CylinderGeometry(1.85, 1.85, 0.14, 28, 1, false, -Math.PI / 2, Math.PI);
  g.add(mesh(new THREE.BoxGeometry(2.6, 0.85, 1.1), mat(0x3b2116, 0.5), 0, 0.42, 0.35, true));
  g.add(mesh(rail, mat(0x3a1c10, 0.35), 0, 0.9, 0));
  g.add(mesh(top, mat(feltHex, 0.9), 0, 0.96, 0));
  g.add(mesh(new THREE.BoxGeometry(0.6, 0.2, 0.4), mat(0x15161c, 0.4), 0, 1.06, -0.15)); // shoe/rack
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + ((i + 0.5) / 5) * Math.PI;
    g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.7, 10), mat(0x8c1c28, 0.6), Math.sin(a) * 2.25, 0.35, Math.cos(a) * 2.25));
  }
  return g;
}

export function crapsTable(feltHex: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(4.6, 0.8, 2.0), mat(0x3b2116, 0.5), 0, 0.4, 0, true));
  g.add(mesh(new THREE.BoxGeometry(4.8, 0.35, 2.2), mat(0x2c140b, 0.35), 0, 0.98, 0));
  g.add(mesh(new THREE.BoxGeometry(4.3, 0.05, 1.7), mat(feltHex, 0.9), 0, 0.86, 0));
  g.add(mesh(new THREE.BoxGeometry(3.6, 0.02, 0.18), basic(0xf2efe6), 0, 0.89, 0.55));
  for (const dx of [-0.2, 0.15]) {
    const die = mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), mat(0xd8202e, 0.25), dx, 0.95, 0);
    die.rotation.set(0.3, dx * 4, 0.2);
    g.add(die);
  }
  return g;
}

export function barCounter(len: number, topHex = 0x1a1a22, frontHex = 0x6b3a1e): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(len, 1.05, 0.8), mat(frontHex, 0.5), 0, 0.525, 0, true));
  g.add(mesh(new THREE.BoxGeometry(len + 0.2, 0.08, 1.0), mat(topHex, 0.15, 0.4), 0, 1.09, 0));
  for (let x = -len / 2 + 0.6; x < len / 2; x += 1.1) {
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.75, 8), mat(0xb8bcc6, 0.3, 0.8), x, 0.375, 0.85));
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 12), mat(0x220d12, 0.6), x, 0.78, 0.85));
  }
  for (let x = -len / 2 + 0.4; x < len / 2; x += 0.5) {
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.3, 8), mat([0x2e8b57, 0x8b4513, 0x87ceeb, 0xd2b48c][Math.abs(Math.round(x * 2)) % 4], 0.1, 0.1, { transparent: false }), x, 1.28, -0.25));
  }
  return g;
}

export function cigPack(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.24, 0.34, 0.11), mat(0xd9362b, 0.35, 0, { emissive: 0xff6224, emissiveIntensity: 0.45 })));
  g.add(mesh(new THREE.BoxGeometry(0.25, 0.1, 0.115), mat(0xf7efe0, 0.4), 0, 0.08, 0));
  for (const ox of [-0.04, 0.04]) {
    g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 8), mat(0xffffff, 0.6), ox, 0.21, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.0185, 0.0185, 0.04, 8), mat(0xc97b32, 0.7), ox, 0.26, 0));
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.33, 20), basic(0xffb347, { side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.16;
  g.add(ring);
  return g;
}

export function flamingoBird(phase: number): THREE.Group {
  const g = new THREE.Group();
  const pink = mat(0xff7aa8, 0.45);
  g.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.7, 6), mat(0xff9b85, 0.6), 0, 0.35, 0));
  const body = mesh(new THREE.SphereGeometry(0.22, 12, 10), pink, 0, 0.74, 0);
  body.scale.set(0.85, 0.8, 1.35);
  g.add(body);
  const neck = mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.52, 8), pink, 0, 1.02, 0.16);
  neck.rotation.x = 0.28;
  g.add(neck);
  g.add(mesh(new THREE.SphereGeometry(0.075, 8, 8), pink, 0, 1.27, 0.24));
  const beak = mesh(new THREE.ConeGeometry(0.03, 0.12, 6), mat(0x18181f, 0.5), 0, 1.22, 0.32);
  beak.rotation.x = Math.PI * 0.72;
  g.add(beak);
  g.rotation.y = phase;
  return g;
}

// ---------- vehicles ----------
export type CarKind = 'taxi' | 'limo' | 'suv' | 'sedan' | 'sport';

export function car(kind: CarKind, color: number): { group: THREE.Group; length: number } {
  const g = new THREE.Group();
  const len = kind === 'limo' ? 7.6 : kind === 'suv' ? 5.0 : kind === 'sport' ? 4.4 : 4.7;
  const width = kind === 'suv' ? 2.0 : 1.85;
  const bodyH = kind === 'suv' ? 1.0 : kind === 'sport' ? 0.6 : 0.75;
  const paint = mat(color, 0.25, 0.7);
  const glass = mat(0x0f1420, 0.08, 0.9);
  g.add(mesh(new THREE.BoxGeometry(width, bodyH, len), paint, 0, 0.35 + bodyH / 2, 0, true));
  const cabinLen = kind === 'limo' ? 5.4 : kind === 'sport' ? 1.8 : kind === 'suv' ? 3.4 : 2.4;
  const cabinH = kind === 'suv' ? 0.85 : kind === 'sport' ? 0.45 : 0.62;
  g.add(mesh(new THREE.BoxGeometry(width - 0.18, cabinH, cabinLen), glass, 0, 0.35 + bodyH + cabinH / 2, kind === 'sport' ? -0.3 : -0.15));
  g.add(mesh(new THREE.BoxGeometry(width - 0.16, 0.06, cabinLen - 0.2), paint, 0, 0.35 + bodyH + cabinH + 0.03, -0.15));
  const tire = mat(0x111216, 0.85);
  for (const wz of [len * 0.32, -len * 0.32]) {
    for (const wx of [-width / 2, width / 2]) {
      const w = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12), tire, wx, 0.36, wz);
      w.rotation.z = Math.PI / 2;
      g.add(w);
    }
  }
  const hl = basic(0xfff5cc);
  const tl = basic(0xff2233);
  for (const hx of [-width * 0.33, width * 0.33]) {
    g.add(mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), hl, hx, 0.35 + bodyH * 0.6, len / 2 + 0.03));
    g.add(mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), tl, hx, 0.35 + bodyH * 0.6, -len / 2 - 0.03));
  }
  if (kind === 'taxi') {
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.28, 0.3), basic(0xfff3c4), 0, 0.35 + bodyH + cabinH + 0.2, -0.15));
    g.add(mesh(new THREE.BoxGeometry(width + 0.01, 0.12, len * 0.7), mat(0x111111, 0.5), 0, 0.35 + bodyH * 0.55, 0));
  }
  return { group: g, length: len };
}

/**
 * RTC "The Deuce" double-decker (Alexander Dennis Enviro500-style).
 * Livery is passed in so it can match the current paint scheme.
 */
export function deuceBus(livery: { body: number; band: number; accent: number }): { group: THREE.Group; wheels: THREE.Mesh[]; deckOffset: THREE.Vector3 } {
  const g = new THREE.Group();
  const wheels: THREE.Mesh[] = [];
  const bodyMat = new THREE.MeshStandardMaterial({ color: livery.body, roughness: 0.3, metalness: 0.55 });
  const bandMat = new THREE.MeshStandardMaterial({ color: livery.band, roughness: 0.35, metalness: 0.4 });
  const dark = mat(0x191d28, 0.4);
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x18283c, roughness: 0.08, metalness: 0.7, transparent: true, opacity: 0.66 });

  g.add(mesh(new THREE.BoxGeometry(2.55, 1.9, 12.6), bodyMat, 0, 1.3, 0, true));
  g.add(mesh(new THREE.BoxGeometry(2.6, 0.95, 11.0), glassMat, 0, 1.62, 0.2));
  g.add(mesh(new THREE.BoxGeometry(2.58, 0.3, 12.62), bandMat, 0, 2.38, 0));
  g.add(mesh(new THREE.BoxGeometry(2.52, 0.2, 12.4), dark, 0, 2.45, 0));
  const seatMat = mat(0x1c458c, 0.7);
  for (let sz = -4.8; sz <= 4.8; sz += 1.2) for (const sx of [-0.68, 0.68]) g.add(mesh(new THREE.BoxGeometry(0.78, 0.55, 0.5), seatMat, sx, 2.82, sz));
  g.add(mesh(new THREE.BoxGeometry(2.56, 1.15, 12.3), glassMat, 0, 3.12, 0));
  g.add(mesh(new THREE.BoxGeometry(2.6, 0.24, 12.6), bodyMat, 0, 3.86, 0));
  g.add(mesh(new THREE.BoxGeometry(2.62, 0.12, 12.62), new THREE.MeshStandardMaterial({ color: livery.accent, roughness: 0.4 }), 0, 0.42, 0));

  const front = neonSign('THE DEUCE', '#0a1222', '#ffcb47', 2.2, 0.5, 'ON THE STRIP');
  front.position.set(0, 3.55, 6.31);
  g.add(front);
  for (const s of [-1, 1]) {
    const side = neonSign('THE DEUCE', '#111111', '#ffe066', 4.4, 0.55, 'RTC • ON THE STRIP', 0.05);
    side.rotation.y = (s * Math.PI) / 2;
    side.position.set(s * 1.31, 2.05, -1.5);
    g.add(side);
  }
  const tireMat = mat(0x111216, 0.85);
  const rimMat = mat(0xd8dce8, 0.25, 0.85);
  for (const wz of [4.2, -3.1, -4.6]) {
    for (const wx of [-1.24, 1.24]) {
      const tire = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.34, 14), tireMat, wx, 0.5, wz);
      tire.rotation.z = Math.PI / 2;
      tire.userData.keep = true;
      g.add(tire);
      const hub = mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.36, 10), rimMat, wx, 0.5, wz);
      hub.rotation.z = Math.PI / 2;
      g.add(hub);
      wheels.push(tire);
    }
  }
  for (const hx of [-0.85, 0.85]) {
    g.add(mesh(new THREE.BoxGeometry(0.38, 0.2, 0.08), basic(0xfff6cf), hx, 0.75, 6.32));
    g.add(mesh(new THREE.BoxGeometry(0.38, 0.24, 0.08), basic(0xff2233), hx, 0.9, -6.32));
  }
  // Cat rides at the front of the upper deck, the best seat on the Strip.
  return { group: g, wheels, deckOffset: new THREE.Vector3(0, 2.56, 5.6) };
}
