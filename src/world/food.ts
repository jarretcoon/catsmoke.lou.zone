import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { basic, car, mat, mesh, palmTree, planter } from './props';

export type RestaurantKind = 'innout' | 'whataburger';

export interface RestaurantTable {
  pos: THREE.Vector3;
  yaw: number;
  /** 'npc' id, 'cat', or null when free. */
  taken: string | null;
}

/** Everything the restaurant gameplay needs to know about one location. */
export interface RestaurantDef {
  kind: RestaurantKind;
  name: string;
  counter: THREE.Vector3;
  pickup: THREE.Vector3;
  tables: RestaurantTable[];
  queue: THREE.Vector3[];
  door: THREE.Vector3;
  workers: THREE.Vector3[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  busy: number; // 0..1 crowd level
  numberBoard?: { set: (n: number) => void };
}

/** Rotate local (lx, lz) by a quarter-turn-aligned yaw and offset to (ox, oz). */
function frame(ox: number, oz: number, rotY: number, y0 = 0) {
  const c = Math.round(Math.cos(rotY));
  const s = Math.round(Math.sin(rotY));
  return {
    p: (lx: number, lz: number) => new THREE.Vector3(ox + lx * c + lz * s, y0, oz - lx * s + lz * c),
    // axis-aligned box in local space → world AABB box via b.box
    box: (b: WorldBuilder, lx: number, y: number, lz: number, w: number, h: number, d: number, m: THREE.Material, wall = true, cast = true) => {
      const wx = ox + lx * c + lz * s;
      const wz = oz - lx * s + lz * c;
      const swap = Math.abs(s) === 1;
      return b.box(wx, y + y0, wz, swap ? d : w, h, swap ? w : d, m, wall, cast);
    },
    add: (b: WorldBuilder, obj: THREE.Object3D, lx: number, y: number, lz: number, localYaw = 0) => {
      obj.position.set(ox + lx * c + lz * s, y + y0, oz - lx * s + lz * c);
      obj.rotation.y = rotY + localYaw;
      b.add(obj);
      return obj;
    },
    yaw: (localYaw: number) => rotY + localYaw,
  };
}

function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function checkerTexture(a: string, b: string, n = 8): THREE.CanvasTexture {
  const t = canvasTex(256, 256, (ctx) => {
    const s = 256 / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      ctx.fillStyle = (x + y) % 2 ? a : b;
      ctx.fillRect(x * s, y * s, s, s);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function textPlate(text: string, w: number, h: number, bg: string, fg: string, font: string, sub?: string): THREE.Mesh {
  const tex = canvasTex(1024, Math.round((1024 * h) / w), (ctx) => {
    const H = ctx.canvas.height;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1024, H);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${font} ${Math.round(H * (sub ? 0.5 : 0.66))}px ${font.includes('italic') ? 'Georgia, serif' : 'system-ui, sans-serif'}`;
    ctx.fillText(text, 512, sub ? H * 0.4 : H * 0.52, 980);
    if (sub) {
      ctx.font = `bold ${Math.round(H * 0.22)}px system-ui, sans-serif`;
      ctx.fillText(sub, 512, H * 0.82, 980);
    }
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: bg === 'transparent' }));
}

function table(top: number, legs: number, seats: number, seatColor: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(1.2, 0.06, 0.8), mat(top, 0.3, 0.1), 0, 0.76, 0, true));
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.74, 8), mat(legs, 0.3, 0.8), 0, 0.37, 0));
  for (let i = 0; i < seats; i++) {
    const sz = i < 2 ? 0.75 : -0.75;
    const sx = i % 2 ? 0.3 : -0.3;
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 12), mat(seatColor, 0.5), sx, 0.46, sz));
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.44, 6), mat(legs, 0.3, 0.8), sx, 0.22, sz));
  }
  return g;
}

function burgerProp(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.04, 14), mat(0xd9a24a, 0.6), 0, 0.02, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 14), mat(0x5a2e16, 0.7), 0, 0.055, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.012, 14), mat(0xffc93a, 0.5), 0, 0.075, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 14), mat(0x5a2e16, 0.7), 0, 0.095, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.108, 0.108, 0.01, 14), mat(0x6abf3a, 0.7), 0, 0.115, 0));
  g.add(mesh(new THREE.SphereGeometry(0.1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xd9a24a, 0.6), 0, 0.12, 0));
  return g;
}

// In-N-Out, Las Vegas look (from free-licence photos of the Las Vegas stores): white stucco with a
// corniced parapet and red pinstripes, an entry tower and a back-corner tower under red clay-tile hip roofs,
// the yellow arrow logo with red IN-N-OUT letters, red awnings with the white palm-tree valance, and a
// red tile band low on the walls.
let tileTex: THREE.CanvasTexture | null = null;
function clayTileMat(): THREE.MeshStandardMaterial {
  tileTex ??= (() => {
    const t = canvasTex(128, 128, (ctx) => {
      ctx.fillStyle = '#a9472e';
      ctx.fillRect(0, 0, 128, 128);
      for (let r = 0; r < 8; r++) {
        ctx.fillStyle = r % 2 ? '#9a3f28' : '#b3533a';
        ctx.fillRect(0, r * 16, 128, 11);
        ctx.fillStyle = 'rgba(40,14,8,0.55)';
        ctx.fillRect(0, r * 16 + 12, 128, 4);
        for (let c = 0; c < 8; c++) {
          ctx.fillStyle = 'rgba(255,214,180,0.16)';
          ctx.fillRect(c * 16 + (r % 2) * 8 + 3, r * 16 + 1, 5, 9);
        }
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 2);
    return t;
  })();
  return new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.78 });
}

let logoTex: THREE.CanvasTexture | null = null;
function inNOutLogo(): THREE.CanvasTexture {
  logoTex ??= canvasTex(512, 384, (ctx) => {
    ctx.clearRect(0, 0, 512, 384);
    // The yellow arrow: a bar running right into an arrowhead, with the diagonal stroke dropping from its tail.
    ctx.fillStyle = '#ffc72c';
    ctx.strokeStyle = '#c99400';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(78, 70);
    ctx.lineTo(372, 70);
    ctx.lineTo(372, 36);
    ctx.lineTo(452, 104);
    ctx.lineTo(372, 172);
    ctx.lineTo(372, 136);
    ctx.lineTo(176, 136);
    ctx.lineTo(262, 330);
    ctx.lineTo(214, 352);
    ctx.lineTo(78, 136);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // IN-N-OUT in red with a white edge, across the arrow.
    let px = 104;
    const fit = () => (ctx.font = `italic 900 ${px}px "Arial Black", Impact, system-ui, sans-serif`);
    fit();
    while (ctx.measureText('IN-N-OUT').width > 440 && px > 40) {
      px -= 4;
      fit();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText('IN-N-OUT', 256, 236);
    ctx.fillStyle = '#d81e2a';
    ctx.fillText('IN-N-OUT', 256, 236);
  });
  return logoTex;
}

let valanceTex: THREE.CanvasTexture | null = null;
function palmValance(): THREE.CanvasTexture {
  valanceTex ??= (() => {
    const t = canvasTex(256, 64, (ctx) => {
      ctx.fillStyle = '#fbfaf6';
      ctx.fillRect(0, 0, 256, 64);
      ctx.fillStyle = '#d81e2a';
      ctx.strokeStyle = '#d81e2a';
      for (let i = 0; i < 4; i++) {
        const cx = 32 + i * 64;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - 3, 50);
        ctx.quadraticCurveTo(cx - 1, 32, cx + 3, 18);
        ctx.stroke();
        for (const [dx, dy] of [
          [-14, 6],
          [-10, -4],
          [0, -8],
          [10, -4],
          [14, 6],
        ]) {
          ctx.beginPath();
          ctx.moveTo(cx + 3, 18);
          ctx.quadraticCurveTo(cx + 3 + dx * 0.5, 18 + dy - 4, cx + 3 + dx, 18 + dy);
          ctx.lineWidth = 4;
          ctx.stroke();
        }
      }
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 0; x <= 256; x += 4) ctx.lineTo(x, 57 + Math.sin(x / 8) * 2.5);
      ctx.stroke();
    });
    t.wrapS = THREE.RepeatWrapping;
    return t;
  })();
  return valanceTex;
}

type Frame = ReturnType<typeof frame>;

function hipRoof(w: number, d: number, h: number): THREE.Mesh {
  const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
  g.rotateY(Math.PI / 4);
  g.scale(w, h, d);
  g.translate(0, h / 2, 0);
  const m = new THREE.Mesh(g, clayTileMat());
  m.castShadow = true;
  return m;
}

function awning(b: WorldBuilder, f: Frame, lx: number, lz: number, w: number, y: number, localYaw: number): void {
  const red = mat(0xd81e2a, 0.55);
  const g = new THREE.Group();
  const top = mesh(new THREE.BoxGeometry(w, 0.05, 1.25), red, 0, 0, 0, true);
  top.rotation.x = 0.52;
  top.position.set(0, 0.32, 0.55);
  g.add(top);
  const valMat = new THREE.MeshStandardMaterial({ map: palmValance().clone(), roughness: 0.7 });
  valMat.map!.repeat.set(Math.max(1, Math.round(w / 1.6)), 1);
  valMat.map!.needsUpdate = true;
  const val = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.42), valMat);
  val.position.set(0, -0.12, 1.1);
  g.add(val);
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.04, 0.5, 1.1), red, s * (w / 2), 0.08, 0.6));
  f.add(b, g, lx, y, lz, localYaw);
}

function vegasShell(b: WorldBuilder, f: Frame, W: number, D: number, H: number, address: string): void {
  const stucco = mat(0xf6f2ea, 0.8);
  const red = mat(0xd81e2a, 0.5);
  const tileRed = mat(0xc41a26, 0.35);
  // Parapet with a cornice and two red pinstripes, all the way round.
  for (const s of [-1, 1]) {
    f.add(b, mesh(new THREE.BoxGeometry(W + 0.5, 1.25, 0.36), stucco, 0, 0, 0, true), 0, H + 0.95, s * (D / 2 + 0.05));
    f.add(b, mesh(new THREE.BoxGeometry(0.36, 1.25, D + 0.5), stucco, 0, 0, 0, true), s * (W / 2 + 0.05), H + 0.95, 0);
    f.add(b, mesh(new THREE.BoxGeometry(W + 1.0, 0.2, 0.62), stucco), 0, H + 1.62, s * (D / 2 + 0.05));
    f.add(b, mesh(new THREE.BoxGeometry(0.62, 0.2, D + 1.0), stucco), s * (W / 2 + 0.05), H + 1.62, 0);
    for (const dy of [1.18, 1.32]) {
      f.add(b, mesh(new THREE.BoxGeometry(W + 0.54, 0.06, 0.38), red), 0, H + dy, s * (D / 2 + 0.05));
      f.add(b, mesh(new THREE.BoxGeometry(0.38, 0.06, D + 0.54), red), s * (W / 2 + 0.05), H + dy, 0);
    }
    // Red tile band low on the outside walls.
    f.add(b, mesh(new THREE.BoxGeometry(0.06, 0.34, D + 0.4), tileRed), s * (W / 2 + 0.22), 0.78, 0);
  }
  f.add(b, mesh(new THREE.BoxGeometry(W + 0.4, 0.34, 0.06), tileRed), 0, 0.78, -D / 2 - 0.22);
  for (const sx of [-1, 1]) f.add(b, mesh(new THREE.BoxGeometry(W / 2 - 2, 0.3, 0.06), tileRed), sx * (W / 4 + 1), 0.8, D / 2 + 0.17);

  // Entry tower over the doors: two stucco piers and a header standing proud of the glass, the tower box above
  // the roof, a clay-tile hip roof, the logo and the street number.
  const tz = D / 2 + 0.45;
  for (const s of [-1, 1]) f.box(b, s * 2.35, 0, tz, 0.6, H + 0.4, 0.9, stucco);
  f.add(b, mesh(new THREE.BoxGeometry(5.3, H - 3.0 + 0.4, 0.9), stucco, 0, 0, 0, true), 0, 3.0 + (H - 3.0 + 0.4) / 2, tz);
  f.add(b, mesh(new THREE.BoxGeometry(5.3, 3.0, 4.2), stucco, 0, 0, 0, true), 0, H + 1.9, D / 2 - 1.65);
  f.add(b, mesh(new THREE.BoxGeometry(5.8, 0.2, 4.7), stucco), 0, H + 3.45, D / 2 - 1.65);
  f.add(b, hipRoof(6.2, 5.1, 1.55), 0, H + 3.52, D / 2 - 1.65);
  const logoMat = new THREE.MeshStandardMaterial({ map: inNOutLogo(), transparent: true, roughness: 0.45, emissive: 0xffffff, emissiveMap: inNOutLogo(), emissiveIntensity: 0.1 });
  b.nightGlow(logoMat, 0.1, 1.1);
  f.add(b, new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3.15), logoMat), 0, H + 1.85, D / 2 + 0.47);
  if (address) f.add(b, textPlate(address, 1.4, 0.42, '#f6f2ea', '#b8141f', 'bold'), 0, 3.35, tz + 0.47);

  // Back-corner tower with its own tile roof and a second logo facing the side (the bridge, here).
  const bx = W / 2 - 2.2;
  const bz = -D / 2 + 2.2;
  f.add(b, mesh(new THREE.BoxGeometry(4.4, 2.5, 4.4), stucco, 0, 0, 0, true), bx, H + 1.6, bz);
  f.add(b, mesh(new THREE.BoxGeometry(4.9, 0.2, 4.9), stucco), bx, H + 2.92, bz);
  f.add(b, hipRoof(5.3, 5.3, 1.4), bx, H + 3.0, bz);
  f.add(b, new THREE.Mesh(new THREE.PlaneGeometry(3.7, 2.75), logoMat), bx + 2.21, H + 1.7, bz, Math.PI / 2);

  // Awnings over the front windows, and over two side windows facing the drive-thru.
  for (const sx of [-1, 1]) awning(b, f, sx * (W / 4 + 1), D / 2 + 0.1, W / 2 - 2.2, 3.55, 0);
  const sideGlass = new THREE.MeshStandardMaterial({ color: 0x1d2630, emissive: 0xffe2b0, emissiveIntensity: 0.06, roughness: 0.12, metalness: 0.4 });
  b.nightGlow(sideGlass, 0.06, 0.9);
  for (const lz of [-0.8, 3.2]) {
    f.add(b, mesh(new THREE.BoxGeometry(0.08, 2.1, 2.8), sideGlass), W / 2 + 0.22, 2.1, lz);
    awning(b, f, W / 2 + 0.2, lz, 3.0, 3.5, Math.PI / 2);
  }
}

// =====================================================================================
// In-N-Out: spotless, slammed busy, the good one.
// =====================================================================================
export function buildInNOut(b: WorldBuilder, x: number, z: number, rotY: number, opts: { name: string; standalone: boolean; w?: number; d?: number; y?: number; patio?: boolean; inLine?: boolean; look?: 'vegas'; address?: string; queueCars?: number; patioXs?: number[] }): RestaurantDef {
  const y0 = opts.y ?? 0;
  const f = frame(x, z, rotY, y0);
  const W = opts.w ?? 18;
  const D = opts.d ?? 13;
  const H = 4.4;
  const white = mat(0xf7f5f0, 0.6);
  const red = mat(0xd81e2a, 0.45);
  const yellow = mat(0xffc72c, 0.45);

  // Floor: red & white checker tile
  const floorMat = new THREE.MeshStandardMaterial({ map: checkerTexture('#d81e2a', '#f7f5f0', 8), roughness: 0.35 });
  floorMat.map!.repeat.set(W / 2.4, D / 2.4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
  floor.rotation.x = -Math.PI / 2;
  f.add(b, floor, 0, 0.035, 0);
  floor.rotation.set(-Math.PI / 2, 0, -rotY);

  // Walls with a glass front and a door gap; red wainscot stripe inside
  f.box(b, 0, 0, -D / 2, W, H, 0.4, white);
  f.box(b, -W / 2, 0, 0, 0.4, H, D, white);
  f.box(b, W / 2, 0, 0, 0.4, H, D, white);
  f.box(b, -W / 4 - 1, 0, D / 2, W / 2 - 2, 1.0, 0.3, white);
  f.box(b, W / 4 + 1, 0, D / 2, W / 2 - 2, 1.0, 0.3, white);
  const glass = new THREE.MeshStandardMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2 });
  f.box(b, -W / 4 - 1, 1.0, D / 2, W / 2 - 2, H - 1.0, 0.12, glass, true, false);
  f.box(b, W / 4 + 1, 1.0, D / 2, W / 2 - 2, H - 1.0, 0.12, glass, true, false);
  f.box(b, 0, 3.2, D / 2, 4, H - 3.2, 0.3, white);
  for (const [lx, lz, w, d] of [
    [0, -D / 2 + 0.22, W - 0.5, 0.05],
    [-W / 2 + 0.22, 0, 0.05, D - 0.5],
    [W / 2 - 0.22, 0, 0.05, D - 0.5],
  ] as const) {
    f.add(b, mesh(new THREE.BoxGeometry(w, 0.25, d), red), lx, 1.0, lz);
    f.add(b, mesh(new THREE.BoxGeometry(w, 0.08, d), yellow), lx, 1.18, lz);
  }

  // Roof: red fascia band with the yellow stripe + roof slab
  f.box(b, 0, H, 0, W + 0.6, 0.35, D + 0.6, white, false, false);
  if (opts.look === 'vegas') vegasShell(b, f, W, D, H, opts.address ?? '');
  else for (const s of [-1, 1]) {
    f.add(b, mesh(new THREE.BoxGeometry(W + 1.2, 1.1, 0.25), red), 0, H + 0.6, s * (D / 2 + 0.42));
    f.add(b, mesh(new THREE.BoxGeometry(W + 1.22, 0.16, 0.27), yellow), 0, H + 0.12, s * (D / 2 + 0.42));
    f.add(b, mesh(new THREE.BoxGeometry(0.25, 1.1, D + 1.2), red), s * (W / 2 + 0.42), H + 0.6, 0);
    f.add(b, mesh(new THREE.BoxGeometry(0.27, 0.16, D + 1.22), yellow), s * (W / 2 + 0.42), H + 0.12, 0);
  }
  if (opts.look !== 'vegas') f.add(b, textPlate('In-N-Out Burger', 9, 1.0, '#d81e2a', '#ffffff', 'italic bold'), 0, H + 0.6, D / 2 + 0.56);

  // Counter, registers, kitchen with grill + fryers, menu board, number board
  const counterZ = -D / 2 + 4.2;
  f.box(b, -2, 0, counterZ, 9, 1.05, 0.9, white);
  f.add(b, mesh(new THREE.BoxGeometry(9.2, 0.08, 1.1), mat(0xb8bcc6, 0.2, 0.8)), -2, 1.08, counterZ);
  f.add(b, mesh(new THREE.BoxGeometry(9.1, 0.3, 0.92), red), -2, 0.3, counterZ + 0.01);
  for (const rx of [-5, -2, 1]) {
    f.add(b, mesh(new THREE.BoxGeometry(0.4, 0.3, 0.3), mat(0x222222, 0.3, 0.5)), rx, 1.27, counterZ);
    f.add(b, mesh(new THREE.PlaneGeometry(0.34, 0.2), basic(0x3aff7a)), rx, 1.32, counterZ + 0.16);
  }
  const steel = mat(0xc8ccd4, 0.25, 0.85);
  f.add(b, mesh(new THREE.BoxGeometry(4, 0.95, 1.0), steel), -4, 0.48, -D / 2 + 1.0);
  f.add(b, mesh(new THREE.BoxGeometry(3.8, 0.04, 0.9), mat(0x1a1a1a, 0.3, 0.6)), -4, 0.98, -D / 2 + 1.0);
  for (let i = 0; i < 6; i++) f.add(b, burgerProp(), -5.5 + i * 0.6, 1.0, -D / 2 + 1.0);
  f.add(b, mesh(new THREE.BoxGeometry(2, 1.1, 0.9), steel), 0.5, 0.55, -D / 2 + 1.0);
  f.add(b, mesh(new THREE.BoxGeometry(1.6, 0.05, 0.6), mat(0xffc93a, 0.2)), 0.5, 1.12, -D / 2 + 1.0);
  f.add(b, mesh(new THREE.BoxGeometry(2.4, 1.6, 0.8), mat(0xf2f2f2, 0.4)), 4, 0.8, -D / 2 + 0.8);
  const menu = canvasTex(1024, 384, (ctx) => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 1024, 384);
    ctx.fillStyle = '#d81e2a';
    ctx.fillRect(0, 0, 1024, 64);
    ctx.fillStyle = '#fff';
    ctx.font = 'italic bold 44px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('In-N-Out Burger', 512, 46);
    const items: Array<[string, string, string]> = [
      ['1', 'Double-Double', '$5.75'],
      ['2', 'Cheeseburger', '$4.15'],
      ['3', 'Hamburger', '$3.75'],
      ['', 'French Fries', '$2.70'],
      ['', 'Shakes  •  Choc / Van / Straw', '$3.25'],
      ['', 'Drinks', '$2.35'],
    ];
    ctx.textAlign = 'left';
    items.forEach(([n, name, price], i) => {
      const y = 110 + i * 44;
      if (n) {
        ctx.fillStyle = '#ffc72c';
        ctx.beginPath();
        ctx.arc(70, y - 12, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#d81e2a';
        ctx.font = 'bold 26px system-ui';
        ctx.fillText(n, 62, y - 2);
      }
      ctx.fillStyle = '#222';
      ctx.font = 'bold 30px system-ui';
      ctx.fillText(name, 110, y);
      ctx.fillStyle = '#d81e2a';
      ctx.fillText(price, 860, y);
    });
  });
  const menuMesh = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.25), new THREE.MeshBasicMaterial({ map: menu }));
  f.add(b, menuMesh, -2, 3.0, counterZ - 0.5);
  const numCanvas = document.createElement('canvas');
  numCanvas.width = 256;
  numCanvas.height = 128;
  const numTex = new THREE.CanvasTexture(numCanvas);
  numTex.colorSpace = THREE.SRGBColorSpace;
  const setNumber = (n: number) => {
    const ctx = numCanvas.getContext('2d')!;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#ff3a2a';
    ctx.font = 'bold 22px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('NOW SERVING', 128, 32);
    ctx.font = 'bold 70px monospace';
    ctx.fillText(String(n), 128, 104);
    numTex.needsUpdate = true;
  };
  setNumber(64);
  f.add(b, new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), new THREE.MeshBasicMaterial({ map: numTex })), 4.6, 2.7, counterZ - 0.5);
  // Pickup counter on the right
  f.box(b, 5.4, 0, counterZ, 3, 1.05, 0.9, red);
  f.add(b, textPlate('PICK UP', 1.6, 0.4, '#ffc72c', '#d81e2a', 'bold'), 5.4, 1.5, counterZ + 0.48);

  // Dining room: tables + red booth benches along the left wall
  const tables: RestaurantTable[] = [];
  const tableSpots: Array<[number, number]> = [
    [-6.2, 1.2],
    [-6.2, 3.8],
    [-3.2, 1.2],
    [-3.2, 3.8],
    [0, 2.4],
    [3.2, 1.2],
    [3.2, 3.8],
    [6.2, 2.4],
  ];
  for (const [lx, lz] of tableSpots) {
    f.add(b, table(0xf7f5f0, 0xc8ccd4, 4, 0xd81e2a), lx, 0, lz);
    b.collider(...aabb(f.p(lx, lz), 0.65, 0.45), y0, y0 + 0.8, true);
    tables.push({ pos: f.p(lx + 0.3, lz + 0.75), yaw: f.yaw(Math.PI), taken: null });
  }
  // Condiment + napkin station, palm decor, framed photos
  f.add(b, mesh(new THREE.BoxGeometry(1.6, 1.0, 0.6), steel), W / 2 - 1.0, 0.5, D / 2 - 2.5);
  f.add(b, palmTree(3.2, false, 1), -W / 2 + 0.8, 0, D / 2 - 0.9);
  for (let i = 0; i < 4; i++) f.add(b, mesh(new THREE.BoxGeometry(0.9, 0.7, 0.04), mat([0x2a66cc, 0xffc72c, 0xd81e2a, 0x2a2a2a][i], 0.6)), -6 + i * 3.2, 2.6, -D / 2 + 0.24);
  b.light(0xfff6e8, 12, 20, x, y0 + H - 0.6, z, 0.9);

  // Outside: the yellow arrow sign, crossed palms, patio, planters (not for an in-line shop on a
  // promenade: that one's front is dressed by its district)
  if (!opts.inLine) {
  const pole = mesh(new THREE.CylinderGeometry(0.25, 0.3, 11, 10), mat(0xd81e2a, 0.4), 0, 5.5, 0, true);
  const sign = new THREE.Group();
  sign.add(pole);
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(-3, 0.8);
  arrowShape.lineTo(1.6, 0.8);
  arrowShape.lineTo(1.6, 1.6);
  arrowShape.lineTo(3.4, 0);
  arrowShape.lineTo(1.6, -1.6);
  arrowShape.lineTo(1.6, -0.8);
  arrowShape.lineTo(-3, -0.8);
  arrowShape.lineTo(-3.6, 0);
  arrowShape.closePath();
  const arrow = new THREE.Mesh(new THREE.ExtrudeGeometry(arrowShape, { depth: 0.3, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0xffc72c, emissive: 0xffb000, emissiveIntensity: 0.25, roughness: 0.4 }));
  b.nightGlow(arrow.material as THREE.MeshStandardMaterial, 0.2, 1.6);
  arrow.position.set(0, 9.2, -0.15);
  arrow.rotation.z = -0.25;
  sign.add(arrow);
  const signPlate = textPlate('In-N-Out Burger', 5, 1.3, '#ffffff', '#d81e2a', 'italic bold');
  signPlate.position.set(-0.2, 11.2, 0);
  sign.add(signPlate);
  const back = signPlate.clone();
  back.rotation.y = Math.PI;
  sign.add(back);
  f.add(b, sign, W / 2 + 3.5, 0, D / 2 + 2);
  b.collider(...aabb(f.p(W / 2 + 3.5, D / 2 + 2), 0.35, 0.35), y0, y0 + 11, true);
  // Signature crossed palm trees
  for (const s of [-1, 1]) {
    const p = palmTree(8.5, false, s + 5);
    p.rotation.z = s * 0.32;
    f.add(b, p, -W / 2 - 2.2 + s * 0.8, 0, D / 2 + 1.5);
  }
  }
  const patioXs = opts.patio === false ? [] : (opts.patioXs ?? [-6, -2, 2, 6]);
  for (const lx of patioXs) {
    const lz = D / 2 + 3;
    f.add(b, table(0xf7f5f0, 0xc8ccd4, 4, 0xd81e2a), lx, 0, lz);
    const umb = new THREE.Group();
    umb.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), mat(0xffffff, 0.4), 0, 1.2, 0));
    umb.add(mesh(new THREE.ConeGeometry(1.4, 0.5, 8), red, 0, 2.5, 0, true));
    f.add(b, umb, lx, 0, lz);
    b.collider(...aabb(f.p(lx, lz), 0.65, 0.45), y0, y0 + 0.8, true);
    tables.push({ pos: f.p(lx + 0.3, lz + 0.75), yaw: f.yaw(Math.PI), taken: null });
  }
  if (opts.patio !== false && !opts.patioXs) f.add(b, planter(W, 0.9, 0xff4d4d), 0, 0, D / 2 + 5.2);

  // Drive-thru lane with a permanent line of cars (it is ALWAYS like this)
  if (opts.standalone) {
    const lane = mat(0x2b2b30, 0.85);
    const nCars = opts.queueCars ?? 5;
    const laneMesh = mesh(new THREE.PlaneGeometry(4, nCars < 5 ? D + 4 : D + 10), lane);
    laneMesh.rotation.x = -Math.PI / 2;
    f.add(b, laneMesh, W / 2 + 3, 0.04, -1);
    laneMesh.rotation.set(-Math.PI / 2, 0, -rotY);
    const colors = [0xffffff, 0x222222, 0xc4161c, 0x2d4f8c, 0x6b6f76, 0xf2f2f0];
    for (let i = 0; i < nCars; i++) {
      const c = car(i % 3 === 0 ? 'suv' : 'sedan', colors[i % colors.length]);
      f.add(b, c.group, W / 2 + 3, 0, D / 2 - 1 - i * 5.4, Math.PI);
      b.collider(...aabb(f.p(W / 2 + 3, D / 2 - 1 - i * 5.4), 1.0, 2.4), 0, 1.6, true);
    }
    f.add(b, textPlate('DRIVE THRU ➜', 2.4, 0.6, '#d81e2a', '#ffffff', 'bold'), W / 2 + 0.6, 2.2, -D / 2 + 1, Math.PI / 2);
  }

  const queue: THREE.Vector3[] = [];
  for (let i = 0; i < 10; i++) queue.push(f.p(-2 + (i < 5 ? 0 : 1.2), counterZ + 1.4 + (i % 5) * 0.95));
  const all = [f.p(-W / 2, -D / 2), f.p(W / 2, D / 2 + 6)];
  b.zone(opts.name, Math.min(all[0].x, all[1].x), Math.max(all[0].x, all[1].x), Math.min(all[0].z, all[1].z), Math.max(all[0].z, all[1].z));
  b.building(x, z, Math.abs(Math.cos(rotY)) > 0.5 ? W : D, Math.abs(Math.cos(rotY)) > 0.5 ? D : W, '#d81e2a', 'In-N-Out');
  b.staticMarkers.push({ x, z, color: '#ffc72c', glyph: '🍔', size: 3 });

  return {
    kind: 'innout',
    name: opts.name,
    counter: f.p(-2, counterZ + 1.1),
    pickup: f.p(5.4, counterZ + 1.1),
    tables,
    queue,
    door: f.p(0, D / 2 + 0.8),
    workers: [f.p(-4, -D / 2 + 2.1), f.p(0.5, -D / 2 + 2.1), f.p(-2, counterZ - 0.9), f.p(4, -D / 2 + 2.0)],
    bounds: boundsOf([all[0], all[1]]),
    busy: 1,
    numberBoard: { set: setNumber },
  };
}

// =====================================================================================
// Whataburger: technically open.
// =====================================================================================
export function buildWhataburger(b: WorldBuilder, x: number, z: number, rotY: number, name: string): RestaurantDef {
  const f = frame(x, z, rotY);
  const W = 15;
  const D = 11;
  const H = 3.2;
  const fadedOrange = mat(0xc98a4a, 0.85);
  const dingyWhite = mat(0xd8d2c4, 0.9);

  // Cracked parking lot with exactly one car
  const lot = new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.95 });
  const lotMesh = new THREE.Mesh(new THREE.PlaneGeometry(W + 14, D + 14), lot);
  lotMesh.rotation.x = -Math.PI / 2;
  f.add(b, lotMesh, 0, 0.02, 4);
  lotMesh.rotation.set(-Math.PI / 2, 0, -rotY);
  for (let i = 0; i < 9; i++) {
    const crack = mesh(new THREE.PlaneGeometry(0.06, 2 + (i % 3)), basic(0x1a1a1a));
    crack.rotation.x = -Math.PI / 2;
    f.add(b, crack, -8 + i * 2.1, 0.035, D / 2 + 3 + (i % 4), (i * 0.7) % 3);
  }
  const lonely = car('sedan', 0x8a7a6a);
  f.add(b, lonely.group, 7, 0, D / 2 + 6, 0.2);
  b.collider(...aabb(f.p(7, D / 2 + 6), 1.2, 2.5), 0, 1.4, true);

  // Checker floor (orange/white, scuffed)
  const floorMat = new THREE.MeshStandardMaterial({ map: checkerTexture('#c98a4a', '#d8d2c4', 6), roughness: 0.8 });
  floorMat.map!.repeat.set(W / 2.5, D / 2.5);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
  floor.rotation.x = -Math.PI / 2;
  f.add(b, floor, 0, 0.04, 0);
  floor.rotation.set(-Math.PI / 2, 0, -rotY);

  f.box(b, 0, 0, -D / 2, W, H, 0.4, dingyWhite);
  f.box(b, -W / 2, 0, 0, 0.4, H, D, dingyWhite);
  f.box(b, W / 2, 0, 0, 0.4, H, D, dingyWhite);
  f.box(b, -W / 4 - 1, 0, D / 2, W / 2 - 2, H, 0.4, dingyWhite);
  f.box(b, W / 4 + 1, 0, D / 2, W / 2 - 2, H, 0.4, dingyWhite);

  // The A-frame roof in faded orange/white stripes
  const stripes = canvasTex(512, 256, (ctx) => {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#d8d2c4' : '#c27a3a';
      ctx.fillRect(i * 64, 0, 64, 256);
    }
    ctx.fillStyle = 'rgba(60,50,40,0.25)';
    for (let i = 0; i < 40; i++) ctx.fillRect((i * 97) % 512, (i * 53) % 256, 30, 8);
  });
  const roofMat = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.9, side: THREE.DoubleSide });
  const roofG = new THREE.Group();
  for (const s of [-1, 1]) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(W + 1, 7.5), roofMat);
    plane.rotation.x = -s * 0.88;
    plane.position.set(0, 5.6, s * 2.89);
    plane.castShadow = true;
    roofG.add(plane);
  }
  const gable = new THREE.Shape();
  gable.moveTo(-5.78, 0);
  gable.lineTo(5.78, 0);
  gable.lineTo(0, 4.8);
  gable.closePath();
  for (const s of [-1, 1]) {
    const g = new THREE.Mesh(new THREE.ShapeGeometry(gable), new THREE.MeshStandardMaterial({ color: 0xc98a4a, roughness: 0.9, side: THREE.DoubleSide }));
    g.rotation.y = Math.PI / 2;
    g.position.set(s * (W / 2 + 0.2), H, 0);
    roofG.add(g);
  }
  f.add(b, roofG, 0, 0, 0);
  b.collider(...aabb(f.p(0, 0), W / 2 + 0.5, D / 2 + 0.5), H, H + 4.5, true);

  // Sign: one letter dead, one flickering
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 1024;
  signCanvas.height = 192;
  const signTex = new THREE.CanvasTexture(signCanvas);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const drawSign = (flickerOn: boolean) => {
    const ctx = signCanvas.getContext('2d')!;
    ctx.fillStyle = '#2a2420';
    ctx.fillRect(0, 0, 1024, 192);
    ctx.font = 'bold 120px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const letters = 'WHATABURGER'.split('');
    let xx = 40;
    letters.forEach((ch, i) => {
      ctx.fillStyle = i === 9 ? '#3a2a20' : i === 4 && !flickerOn ? '#4a3020' : '#e8873a';
      ctx.fillText(ch, xx, 100);
      xx += ctx.measureText(ch).width + 4;
    });
    signTex.needsUpdate = true;
  };
  drawSign(true);
  const signM = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.5), new THREE.MeshBasicMaterial({ map: signTex }));
  const signGroup = new THREE.Group();
  signGroup.add(mesh(new THREE.CylinderGeometry(0.2, 0.25, 7.5, 8), mat(0x7a6a5a, 0.8, 0.4), 0, 3.75, 0));
  const w = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 0.3), mat(0xc27a3a, 0.8));
  w.position.set(0, 8.4, 0);
  signGroup.add(w);
  const wLetter = textPlate('W', 2.2, 2.2, '#c27a3a', '#d8d2c4', 'bold');
  wLetter.position.set(0, 8.4, 0.16);
  signGroup.add(wLetter);
  signM.position.set(0, 6.6, 0);
  signGroup.add(signM);
  f.add(b, signGroup, -W / 2 - 4, 0, D / 2 + 3);
  b.collider(...aabb(f.p(-W / 2 - 4, D / 2 + 3), 0.3, 0.3), 0, 9, true);
  let flick = 0;
  b.every((dt) => {
    flick -= dt;
    if (flick <= 0) {
      flick = 0.05 + Math.random() * (Math.random() < 0.2 ? 0.1 : 1.5);
      drawSign(Math.random() > 0.35);
    }
  });
  f.add(b, textPlate('NOW HIRING • ASK INSIDE', 3.2, 0.6, '#f2f2f2', '#b3121f', 'bold'), W / 4 + 1, 1.8, D / 2 + 0.23);

  // Interior: counter, tired menu board, four empty tables, a sleeping customer's table
  const counterZ = -D / 2 + 3;
  f.box(b, -1.5, 0, counterZ, 7, 1.05, 0.8, fadedOrange);
  f.add(b, mesh(new THREE.BoxGeometry(7.1, 0.06, 0.95), mat(0x6a6a6a, 0.5, 0.3)), -1.5, 1.07, counterZ);
  const menuTex = canvasTex(768, 256, (ctx) => {
    ctx.fillStyle = '#e9e1cf';
    ctx.fillRect(0, 0, 768, 256);
    ctx.fillStyle = '#c27a3a';
    ctx.fillRect(0, 0, 768, 50);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 34px system-ui';
    ctx.fillText('MENU  (prices may vary)', 20, 38);
    ctx.fillStyle = '#3a3030';
    ctx.font = 'bold 28px system-ui';
    ['Whataburger ..... $7.49', 'Honey Butter Chicken Biscuit ..... $5.29', 'Fries ..... $3.19', 'Ice machine ..... BROKEN'].forEach((l, i) => ctx.fillText(l, 24, 100 + i * 42));
  });
  f.add(b, new THREE.Mesh(new THREE.PlaneGeometry(4.5, 1.5), new THREE.MeshBasicMaterial({ map: menuTex })), -1.5, 2.3, counterZ - 0.45);
  const tables: RestaurantTable[] = [];
  for (const [lx, lz] of [
    [-5, 1],
    [-2, 2.5],
    [1.5, 1],
    [4.8, 2.5],
  ] as const) {
    f.add(b, table(0xd8d2c4, 0x6a6a6a, 2, 0xc27a3a), lx, 0, lz);
    b.collider(...aabb(f.p(lx, lz), 0.65, 0.45), 0, 0.8, true);
    tables.push({ pos: f.p(lx + 0.3, lz + 0.75), yaw: f.yaw(Math.PI), taken: null });
  }
  // A knocked-over chair and a puddle
  const chair = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10), mat(0xc27a3a, 0.8), 0, 0, 0);
  f.add(b, chair, 3.5, 0.1, -0.5);
  chair.rotation.set(1.4, 0, 0.3);
  const puddle = mesh(new THREE.CircleGeometry(0.8, 16), mat(0x6a7a8a, 0.05, 0.6, { transparent: true, opacity: 0.6 }));
  puddle.rotation.x = -Math.PI / 2;
  f.add(b, puddle, -4, 0.05, 3.5);
  // Overflowing trash can outside
  const can = new THREE.Group();
  can.add(mesh(new THREE.CylinderGeometry(0.35, 0.32, 0.95, 10), mat(0x5a5a4a, 0.8), 0, 0.48, 0));
  for (let i = 0; i < 5; i++) can.add(mesh(new THREE.BoxGeometry(0.2, 0.15, 0.2), mat([0xd8d2c4, 0xc27a3a, 0xf2f2f2][i % 3], 0.8), (i - 2) * 0.12, 1.0 + (i % 2) * 0.1, (i % 3 - 1) * 0.1));
  b.prop(can, f.p(W / 2 + 1.2, D / 2 + 1).x, f.p(W / 2 + 1.2, D / 2 + 1).z, 0.36, 1.1, 'trash');
  // Tumbleweed that actually rolls (it's a physics prop — kick it)
  const weed = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), new THREE.MeshStandardMaterial({ color: 0x9a7a4a, roughness: 1, wireframe: true }));
  const weedG = new THREE.Group();
  weedG.add(weed);
  weed.position.y = 0.55;
  const wp = f.p(2, D / 2 + 5);
  b.prop(weedG, wp.x, wp.z, 0.55, 1.1, 'tumbleweed');
  b.light(0xffe6c0, 5, 14, x, H - 0.4, z, 0.6);

  const all = [f.p(-W / 2 - 6, -D / 2), f.p(W / 2 + 6, D / 2 + 11)];
  b.zone(name, Math.min(all[0].x, all[1].x), Math.max(all[0].x, all[1].x), Math.min(all[0].z, all[1].z), Math.max(all[0].z, all[1].z));
  b.building(x, z, Math.abs(Math.cos(rotY)) > 0.5 ? W : D, Math.abs(Math.cos(rotY)) > 0.5 ? D : W, '#c27a3a', 'Whataburger');
  b.staticMarkers.push({ x, z, color: '#c27a3a', glyph: 'W', size: 2.4 });

  return {
    kind: 'whataburger',
    name,
    counter: f.p(-1.5, counterZ + 1.0),
    pickup: f.p(-1.5, counterZ + 1.0),
    tables,
    queue: [f.p(-1.5, counterZ + 1.6)],
    door: f.p(0, D / 2 + 0.8),
    workers: [f.p(-1.5, counterZ - 0.9)],
    bounds: boundsOf(all),
    busy: 0.1,
  };
}

function aabb(p: THREE.Vector3, hx: number, hz: number): [number, number, number, number] {
  return [p.x - Math.max(hx, hz), p.x + Math.max(hx, hz), p.z - Math.max(hx, hz), p.z + Math.max(hx, hz)];
}

function boundsOf(pts: THREE.Vector3[]) {
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    maxX: Math.max(...pts.map((p) => p.x)),
    minZ: Math.min(...pts.map((p) => p.z)),
    maxZ: Math.max(...pts.map((p) => p.z)),
  };
}

export { burgerProp };
