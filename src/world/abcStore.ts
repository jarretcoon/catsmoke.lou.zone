import * as THREE from 'three';
import { buildHuman } from '../npcs';
import type { WorldBuilder } from './builder';
import { basic, mat, mesh, neonSign } from './props';

const PRODUCT = [0xff5978, 0x35d0ff, 0xffd23f, 0x52e07a, 0xff8a3d, 0xb874ff, 0xf2f2f2, 0x2a66cc, 0xd9362b];

function signTexture(lines: string[], bg: string, fg: string, w = 512, h = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => {
    ctx.font = `bold ${i === 0 ? Math.round(h * 0.3) : Math.round(h * 0.16)}px system-ui, sans-serif`;
    ctx.fillText(l, w / 2, (h / (lines.length + 1)) * (i + 1), w * 0.92);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function plate(lines: string[], w: number, h: number, bg: string, fg: string): THREE.Mesh {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: signTexture(lines, bg, fg, 512, Math.round((512 * h) / w)) }));
}

/** A shelf unit stacked with little product boxes. Local +z = facing the aisle. */
function gondola(len: number, h: number, seed: number, kind: 'snacks' | 'nuts' | 'souvenir' | 'sun'): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(len, h, 0.6), mat(0xf4f1e8, 0.6), 0, h / 2, 0, true));
  for (let row = 0; row < 4; row++) {
    const y = 0.35 + row * (h - 0.4) / 4;
    g.add(mesh(new THREE.BoxGeometry(len + 0.02, 0.03, 0.66), mat(0xc8ccd4, 0.3, 0.6), 0, y, 0));
    for (let i = 0; i < Math.floor(len / 0.32); i++) {
      const px = -len / 2 + 0.18 + i * 0.32;
      const color = kind === 'nuts' ? (i % 2 ? 0x1f3f86 : 0xd9a63a) : kind === 'sun' ? [0xffd23f, 0xff8a3d, 0xf2f2f2][(i + row) % 3] : PRODUCT[(i * 7 + row * 3 + seed) % PRODUCT.length];
      const bh = kind === 'snacks' ? 0.3 : kind === 'nuts' ? 0.14 : 0.2;
      for (const side of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.26, bh, 0.2), mat(color, kind === 'snacks' ? 0.3 : 0.5), px, y + bh / 2 + 0.02, side * 0.2));
    }
  }
  return g;
}

/**
 * A walk-in Strip ABC Store: front door on local +z, `w` wide (local x), `d` deep (local z).
 * rotY must be a quarter turn. Returns the checkout position.
 */
export function buildAbcStore(b: WorldBuilder, x: number, z: number, rotY: number, opts: { label: string; w?: number; d?: number; y?: number }): THREE.Vector3 {
  const W = opts.w ?? 20;
  const D = opts.d ?? 16;
  const H = 5.2;
  const y0 = opts.y ?? 0;
  const c = Math.round(Math.cos(rotY));
  const s = Math.round(Math.sin(rotY));
  const P = (lx: number, lz: number) => new THREE.Vector3(x + lx * c + lz * s, y0, z - lx * s + lz * c);
  const root = new THREE.Group();
  root.position.set(x, y0, z);
  root.rotation.y = rotY;
  const put = (obj: THREE.Object3D, lx: number, y: number, lz: number, yaw = 0) => {
    obj.position.set(lx, y, lz);
    obj.rotation.y = yaw;
    root.add(obj);
    return obj;
  };
  const wall = (lx: number, lz: number, w: number, h: number, d: number, m: THREE.Material, y = 0) => {
    const ww = Math.abs(s) ? d : w;
    const dd = Math.abs(s) ? w : d;
    const p = P(lx, lz);
    b.collider(p.x - ww / 2, p.x + ww / 2, p.z - dd / 2, p.z + dd / 2, y0 + y, y0 + y + h, true);
    put(mesh(new THREE.BoxGeometry(w, h, d), m, 0, 0, 0, true), lx, y + h / 2, lz);
  };

  const blue = mat(0x0b4ea2, 0.45);
  const white = mat(0xf4f1e8, 0.6);
  const glass = new THREE.MeshStandardMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.25, roughness: 0.05 });

  // Floor + walls + glass storefront with a centre door
  const floor = mesh(new THREE.PlaneGeometry(W, D), mat(0xe9e3d6, 0.35), 0, 0, 0);
  floor.rotation.x = -Math.PI / 2;
  put(floor, 0, 0.04, 0);
  wall(0, -D / 2, W, H, 0.4, blue);
  wall(-W / 2, 0, 0.4, H, D, blue);
  wall(W / 2, 0, 0.4, H, D, blue);
  wall(-W / 4 - 1, D / 2, W / 2 - 2, 0.9, 0.3, blue);
  wall(W / 4 + 1, D / 2, W / 2 - 2, 0.9, 0.3, blue);
  for (const sx of [-1, 1]) put(mesh(new THREE.BoxGeometry(W / 2 - 2, H - 0.9, 0.08), glass), sx * (W / 4 + 1), 0.9 + (H - 0.9) / 2, D / 2);
  put(mesh(new THREE.BoxGeometry(4, H - 3.1, 0.3), blue), 0, 3.1 + (H - 3.1) / 2, D / 2);
  put(mesh(new THREE.BoxGeometry(W + 0.4, 0.3, D + 0.4), blue), 0, H + 0.15, 0);
  const pf = P(0, 0);
  b.collider(pf.x - (Math.abs(s) ? D : W) / 2, pf.x + (Math.abs(s) ? D : W) / 2, pf.z - (Math.abs(s) ? W : D) / 2, pf.z + (Math.abs(s) ? W : D) / 2, y0 + H, y0 + H + 0.3);

  // Sign, awning, window displays
  const sign = neonSign('ABC STORES', '#093c82', '#ffe14d', Math.min(12, W - 2), 1.8, 'SNACKS • SMOKES • VAPES • SOUVENIRS');
  put(sign, 0, H - 0.6, D / 2 + 0.3);
  put(mesh(new THREE.BoxGeometry(W, 0.18, 1.6), mat(0xffd23f, 0.5)), 0, 3.3, D / 2 + 0.8);
  put(plate(['ALOHA!', 'Macadamia nuts • 4 shirts $20 • Ice cold beer'], 4.5, 1.1, '#ffffff', '#0b4ea2'), -W / 4 - 1, 2.4, D / 2 - 0.15);
  put(plate(['WE ID', 'under 40 • 21+ for tobacco & vapes'], 2.6, 0.9, '#d9362b', '#ffffff'), W / 4 + 1, 2.6, D / 2 - 0.15);

  // Wood-baffle wave ceiling + light strips
  const wood = mat(0x9b6432, 0.72);
  for (let i = 0; i < Math.floor(W / 1.1); i++) put(mesh(new THREE.BoxGeometry(0.18, 0.5, D - 1), wood), -W / 2 + 0.8 + i * 1.1, H - 0.7 + Math.sin(i * 0.55) * 0.35, 0);
  const strip = basic(0xfff8e6);
  for (let i = -1; i <= 1; i++) put(mesh(new THREE.BoxGeometry(W - 3, 0.05, 0.25), strip), 0, H - 1.25, i * (D / 4));

  // Cooler wall at the back: lit glass doors over beer/soda/water
  const coolerLight = new THREE.MeshStandardMaterial({ color: 0xeef6ff, emissive: 0xdff0ff, emissiveIntensity: 0.9, roughness: 0.2 });
  const coolerW = W - 6;
  put(mesh(new THREE.BoxGeometry(coolerW, 3, 1.2), mat(0x2b2f3a, 0.4, 0.5)), -1, 1.5, -D / 2 + 0.8, 0);
  const doors = Math.floor(coolerW / 1.3);
  for (let i = 0; i < doors; i++) {
    const lx = -1 - coolerW / 2 + 0.65 + i * 1.3;
    put(mesh(new THREE.BoxGeometry(1.2, 2.5, 0.04), coolerLight), lx, 1.45, -D / 2 + 1.42);
    for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 4; k++) {
        const col = i % 4 === 0 ? 0xd9b23a : i % 4 === 1 ? 0x2a66cc : i % 4 === 2 ? 0xe6f4ff : 0x52e07a; // beer, soda, water, energy
        put(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.32, 8), mat(col, 0.3, 0.3)), lx - 0.42 + k * 0.28, 0.5 + r * 0.6, -D / 2 + 1.3);
      }
    }
    put(mesh(new THREE.BoxGeometry(0.04, 2.5, 0.06), mat(0x9aa0aa, 0.3, 0.8)), lx + 0.62, 1.45, -D / 2 + 1.44);
  }
  put(plate(['ICE COLD', 'BEER • WATER • ENERGY'], 4, 0.7, '#0b4ea2', '#ffffff'), -1, 3.4, -D / 2 + 1.45);

  // Aisles
  put(gondola(6, 1.7, 1, 'snacks'), -3, 0, -1.2);
  put(gondola(6, 1.7, 4, 'sun'), -3, 0, 1.6);
  put(gondola(6, 1.7, 7, 'nuts'), -3, 0, 4.2);
  for (const lz of [-1.2, 1.6, 4.2]) {
    const p = P(-3, lz);
    const hw = Math.abs(s) ? 0.35 : 3;
    const hd = Math.abs(s) ? 3 : 0.35;
    b.collider(p.x - hw, p.x + hw, p.z - hd, p.z + hd, y0, y0 + 1.7, true);
  }
  // Macadamia nut pyramid end cap
  for (let layer = 0; layer < 4; layer++) {
    for (let i = 0; i < 4 - layer; i++) {
      for (let j = 0; j < 4 - layer; j++) put(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.14, 10), mat(layer % 2 ? 0xd9a63a : 0x1f3f86, 0.4, 0.3)), 1.2 + (i - (3 - layer) / 2) * 0.24, 0.07 + layer * 0.14, 6.2 + (j - (3 - layer) / 2) * 0.24);
    }
  }
  put(plate(['MACADAMIA', 'NUTS • 3 for $20'], 1.4, 0.5, '#1f3f86', '#ffd23f'), 1.2, 1.0, 6.7);

  // Souvenir wall (left): t-shirts, hats, shot glasses, magnets
  const shirtColors = [0xff5978, 0x2ec4ff, 0xf2f2f2, 0x111111, 0xffd23f, 0x52e07a];
  for (let i = 0; i < 8; i++) {
    const shirt = mesh(new THREE.BoxGeometry(0.06, 0.7, 0.6), mat(shirtColors[i % shirtColors.length], 0.8), -W / 2 + 0.35, 2.0 - (i % 2) * 0.85, -D / 2 + 3 + Math.floor(i / 2) * 0.8);
    root.add(shirt);
  }
  put(plate(['4 SHIRTS $20'], 1.6, 0.45, '#ffd23f', '#d9362b'), -W / 2 + 0.25, 2.9, -D / 2 + 4.2, Math.PI / 2);
  for (let i = 0; i < 6; i++) put(mesh(new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(PRODUCT[i], 0.6)), -W / 2 + 0.4, 2.9, -D / 2 + 7 + i * 0.4);
  for (let i = 0; i < 12; i++) put(mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.08, 8), new THREE.MeshStandardMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0.7, roughness: 0.05 })), -W / 2 + 0.35, 1.2 + (i % 3) * 0.2, -D / 2 + 9.4 + Math.floor(i / 3) * 0.12);
  put(mesh(new THREE.BoxGeometry(0.05, 1.0, 1.6), mat(0x6b6f76, 0.5, 0.5)), -W / 2 + 0.3, 1.4, D / 2 - 2.4);
  for (let i = 0; i < 18; i++) put(mesh(new THREE.BoxGeometry(0.03, 0.14, 0.14), mat(PRODUCT[i % PRODUCT.length], 0.5)), -W / 2 + 0.34, 1.0 + (i % 6) * 0.15, D / 2 - 3.0 + Math.floor(i / 6) * 0.5);

  // Checkout counter (front right) + cigarette wall + vape case + liquor shelves
  const counterX = W / 2 - 3.2;
  put(mesh(new THREE.BoxGeometry(1.4, 1.05, 5.5), blue), counterX, 0.53, 1.2);
  put(mesh(new THREE.BoxGeometry(1.5, 0.06, 5.6), mat(0x1a1a22, 0.2, 0.4)), counterX, 1.08, 1.2);
  const cp = P(counterX, 1.2);
  b.collider(cp.x - (Math.abs(s) ? 2.75 : 0.7), cp.x + (Math.abs(s) ? 2.75 : 0.7), cp.z - (Math.abs(s) ? 0.7 : 2.75), cp.z + (Math.abs(s) ? 0.7 : 2.75), y0, y0 + 1.1, true);
  put(mesh(new THREE.BoxGeometry(0.4, 0.3, 0.35), mat(0x222222, 0.3, 0.5)), counterX, 1.27, 0);
  put(mesh(new THREE.PlaneGeometry(0.3, 0.18), basic(0x3aff7a)), counterX - 0.21, 1.3, 0, -Math.PI / 2);
  const vape = new THREE.MeshStandardMaterial({ color: 0x5cf2ff, emissive: 0x2ad8ff, emissiveIntensity: 0.6, transparent: true, opacity: 0.6 });
  put(mesh(new THREE.BoxGeometry(0.8, 0.5, 1.8), vape), counterX, 1.36, 2.8);
  for (let i = 0; i < 6; i++) put(mesh(new THREE.BoxGeometry(0.06, 0.2, 0.08), mat([0x2a66cc, 0xff94e4, 0x8effd2, 0xffc478, 0xff4d6d, 0x7ae8ff][i], 0.3, 0.6)), counterX, 1.32, 2.1 + i * 0.28);
  // Cigarette wall behind the clerk: rows of colourful packs
  const packColors = [0xd9362b, 0xf2f2f2, 0x1e8855, 0x2a66cc, 0xf2b830, 0x111111];
  put(mesh(new THREE.BoxGeometry(0.4, 2.2, 5), mat(0x2b2f3a, 0.5)), W / 2 - 0.4, 2.0, 1.2);
  for (let r = 0; r < 6; r++) for (let i = 0; i < 12; i++) put(mesh(new THREE.BoxGeometry(0.06, 0.22, 0.32), mat(packColors[(i + r * 2) % packColors.length], 0.4)), W / 2 - 0.62, 1.1 + r * 0.32, -1.1 + i * 0.4);
  put(plate(['TOBACCO', 'Packs $12 • Cartons $95'], 2.4, 0.6, '#111111', '#ffd23f'), W / 2 - 0.62, 3.25, 1.2, -Math.PI / 2);
  // Liquor shelves
  for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) put(mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.32, 8), mat([0x7a3a1a, 0x2e8b57, 0xe8f4ff, 0xb8860b, 0x8b0000][(i + r) % 5], 0.1, 0.2)), W / 2 - 0.7, 3.6 + r * 0.0, D / 2 - 3.4 - i * 0.3 + r * 0.05);

  // Aloha decor: surfboard, hanging leis, a tiki by the door
  const board = mesh(new THREE.CapsuleGeometry(0.25, 2.2, 6, 12), mat(0x2ec4ff, 0.3), 0, 0, 0);
  board.scale.set(1, 1, 0.15);
  put(board, 3, 3.6, -D / 2 + 0.3, 0).rotation.z = 0.2;
  for (let i = 0; i < 6; i++) {
    const lei = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 14), mat([0xff5978, 0xffd23f, 0xb874ff][i % 3], 0.7));
    lei.rotation.x = Math.PI / 2 - 0.3;
    put(lei, -W / 2 + 0.5, 3.4, -D / 2 + 2.6 + i * 0.4);
  }
  const tiki = new THREE.Group();
  tiki.add(mesh(new THREE.CylinderGeometry(0.28, 0.32, 1.6, 8), mat(0x6b4a2a, 0.9), 0, 0.8, 0));
  tiki.add(mesh(new THREE.BoxGeometry(0.4, 0.12, 0.05), basic(0xffd23f), 0, 1.2, 0.3));
  put(tiki, -W / 2 + 1, 0, D / 2 - 1);
  b.light(0xfff5e0, 10, 18, P(0, 0).x, y0 + H - 0.8, P(0, 0).z, 0.6);

  // Clerk in an aloha shirt behind the counter
  const clerk = buildHuman(3, 'tourist', 'none');
  const cpos = P(counterX + 1.0, 1.2);
  clerk.group.position.set(cpos.x, y0, cpos.z);
  clerk.group.rotation.y = rotY - Math.PI / 2;
  b.scene.add(clerk.group);

  b.add(root);
  const shop = P(counterX - 1.4, 1.2);
  b.shopSpots.push({ kind: 'abc', position: shop, radius: 2.8, label: opts.label });
  b.pickup(P(counterX, 0.3).x, y0 + 1.5, P(counterX, 0.3).z, 4, `${opts.label} Counter Loose Pack!`, false);
  const corners = [P(-W / 2, -D / 2), P(W / 2, D / 2)];
  b.zone(opts.label, Math.min(corners[0].x, corners[1].x), Math.max(corners[0].x, corners[1].x), Math.min(corners[0].z, corners[1].z), Math.max(corners[0].z, corners[1].z));
  b.staticMarkers.push({ x: P(0, 0).x, z: P(0, 0).z, color: '#5ab4ff', glyph: 'ABC', size: 2 });
  // A couple of shoppers browsing the aisles
  const a1 = P(-3, 0.2);
  const a2 = P(-3, 2.9);
  const a3 = P(1.5, 2.9);
  b.crowd.tourists.push({ pts: [[a1.x, a1.z], [a3.x, a3.z]], prop: 'bag' }, { pts: [[a2.x, a2.z], [P(-6, 6).x, P(-6, 6).z]], prop: 'none' });
  return shop;
}
