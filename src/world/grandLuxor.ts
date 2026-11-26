import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { makeCarpetTexture } from './textures';
import { barCounter, blackjackTable, crapsTable, mat, mesh, rouletteTable, slotMachine } from './props';
import { canopyStripeTexture, hieroglyphTexture, luxorCorridorAtlas, pyramidGlassTexture, signAtlas } from './grandTextures';
import { gated, gold, Kit, kitAddObject, quad, texFloor, texMat } from './grandInteriors';

/**
 * Inside the Luxor pyramid: the open atrium with the casino on its floor, a colonnade of papyrus
 * columns and attraction fronts round the base, and six stepped floors of hotel corridors climbing
 * the sloped walls (rails, lit doors, glowing balcony edges). Inclinators ride the corner diagonals
 * (one is rideable up to the top floor and back), colossal seated pharaohs guard the entrance, three
 * obelisks stand on the floor, and the Sky Beam's lamp chamber blazes at the apex.
 */

const doorHalf = 3.1;
const doorH = 4.6;

/** Pyramid skin with planar UVs; the east (+x) face has a doorway notch at the bottom middle. */
export function luxorSkinGeometry(half: number, h: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const slant = Math.hypot(half, h);
  const faces: Array<{ n: THREE.Vector3; base: (u: number) => THREE.Vector3; door: boolean }> = [
    { n: new THREE.Vector3(h, half, 0).normalize(), base: (u) => new THREE.Vector3(half, 0, -u), door: true }, // east
    { n: new THREE.Vector3(-h, half, 0).normalize(), base: (u) => new THREE.Vector3(-half, 0, u), door: false }, // west
    { n: new THREE.Vector3(0, half, h).normalize(), base: (u) => new THREE.Vector3(u, 0, half), door: false }, // south
    { n: new THREE.Vector3(0, half, -h).normalize(), base: (u) => new THREE.Vector3(-u, 0, -half), door: false }, // north
  ];
  const apex = new THREE.Vector3(0, h, 0);
  for (const f of faces) {
    // 2D face coords: u across the base (−half…half), v up the slant (0…slant)
    const shape = new THREE.Shape();
    shape.moveTo(-half, 0);
    if (f.door) {
      const vd = doorH * (slant / h);
      shape.lineTo(-doorHalf, 0);
      shape.lineTo(-doorHalf, vd);
      shape.lineTo(doorHalf, vd);
      shape.lineTo(doorHalf, 0);
    }
    shape.lineTo(half, 0);
    shape.lineTo(0, slant);
    shape.closePath();
    const sg = new THREE.ShapeGeometry(shape);
    const sp = sg.attributes.position as THREE.BufferAttribute;
    const idx = sg.index!;
    const map = (i: number) => {
      const u = sp.getX(i);
      const v = sp.getY(i);
      const t = v / slant;
      // planar face: the base point under u, slid up the slope toward the apex
      const p = f.base(u).add(apex.clone().sub(f.base(0)).multiplyScalar(t));
      return { p, u: u / (2 * half) + 0.5, v: t };
    };
    for (let k = 0; k < idx.count; k += 3) {
      const tri = [idx.getX(k), idx.getX(k + 1), idx.getX(k + 2)].map(map);
      // keep the winding facing outward
      const e1 = new THREE.Vector3().subVectors(tri[1].p, tri[0].p);
      const e2 = new THREE.Vector3().subVectors(tri[2].p, tri[0].p);
      if (e1.cross(e2).dot(f.n) < 0) tri.reverse();
      for (const c of tri) {
        pos.push(c.p.x, c.p.y, c.p.z);
        nor.push(f.n.x, f.n.y, f.n.z);
        uv.push(c.u, c.v);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(Array.from({ length: pos.length / 3 }, (_, i) => i));
  return g;
}

/** Hollow pyramid: perimeter rings instead of solid tiers, with the entrance tunnel on the east. */
export function luxorColliders(b: WorldBuilder, px: number, pz: number, half: number, h: number): void {
  const ring = (r0: number, r1: number, y0: number, y1: number, gapEast: boolean) => {
    b.collider(px - r1, px + r1, pz - r1, pz - r0, y0, y1, true); // north
    b.collider(px - r1, px + r1, pz + r0, pz + r1, y0, y1, true); // south
    b.collider(px - r1, px - r0, pz - r0, pz + r0, y0, y1, true); // west
    if (gapEast) {
      b.collider(px + r0, px + r1, pz - r0, pz - doorHalf, y0, y1, true);
      b.collider(px + r0, px + r1, pz + doorHalf, pz + r0, y0, y1, true);
    } else b.collider(px + r0, px + r1, pz - r0, pz + r0, y0, y1, true);
  };
  ring(21.5, half - 0.5, 0, 5.6, true);
  b.collider(px + 21.5, px + half + 4, pz - doorHalf, pz + doorHalf, doorH, 5.6, true); // tunnel lintel
  for (let i = 1; i < 6; i++) {
    const y0 = (i * h) / 6;
    const y1 = ((i + 1) * h) / 6;
    const hw = half * (1 - (y0 + y1) / (2 * h));
    ring(Math.max(0.5, hw - 1), hw, y0, y1, false);
  }
  b.collider(px - 2.5, px + 2.5, pz - 2.5, pz + 2.5, h - 3.5, h - 3, false); // camera lid under the apex
}

export function buildLuxorAtrium(b: WorldBuilder, px: number, pz: number, half: number, h: number): void {
  const hwOut = (y: number) => half * (1 - y / h);
  const R0 = 21.5; // ground-floor perimeter wall (inner face)
  const g = new THREE.Group();
  const k = new Kit();
  const gilt = gold();
  const sand = mat(0xd2b48a, 0.8);
  const sandDark = mat(0xb39669, 0.85);
  const cream = mat(0xe8dcc0, 0.7);

  // ---- Floor: casino carpet inside the colonnade, sandstone round it ----
  const carpet = mesh(new THREE.PlaneGeometry(R0 * 2, R0 * 2), texFloor(makeCarpetTexture('#141a36', '#c9a04a', '#8a2a1e'), R0 * 2, R0 * 2, 3.2, { roughness: 0.9 }), px, 0.035, pz);
  carpet.rotation.x = -Math.PI / 2;
  g.add(carpet);

  // ---- Ground-floor perimeter: hieroglyph walls with attraction fronts ----
  const glyph = hieroglyphTexture();
  const wallM = texMat('lux-glyph', () => {
    const t = glyph.clone();
    t.needsUpdate = true;
    t.repeat.set(R0 / 2.5, 1.4);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, emissive: 0x2a1a08, emissiveIntensity: 0.35 });
  });
  const sides: Array<{ nx: number; nz: number }> = [
    { nx: 0, nz: 1 }, // north wall faces south (+z)
    { nx: 0, nz: -1 },
    { nx: 1, nz: 0 }, // west wall faces east
    { nx: -1, nz: 0 }, // east wall faces west
  ];
  const { tex: luxSigns, rows } = signAtlas(['TITANIC: THE ARTIFACT EXHIBITION', 'BODIES… THE EXHIBITION', 'CARROT TOP THEATER', 'FANTASY', 'PYRAMID CAFÉ', "HUSSONG'S CANTINA", 'LUXOR HOTEL • REGISTRATION', 'INCLINATORS ▲ HOTEL TOWERS', 'LUXOR CASINO'], 'luxor', 'Georgia, serif');
  const signM = texMat('lux-sign', () => new THREE.MeshBasicMaterial({ map: luxSigns }));
  const signQ = (i: number, w: number, hh: number) => quad(w, hh, 0, 1 - (i + 1) / rows, 1, 1 - i / rows);
  let sign = 0;
  for (const s of sides) {
    const ry = Math.atan2(s.nx, s.nz);
    // the wall line sits at −normal · R0
    const wx = px - s.nx * R0;
    const wz = pz - s.nz * R0;
    const east = s.nx === -1;
    const segs: Array<[number, number]> = east ? [[-R0, -doorHalf - 0.4], [doorHalf + 0.4, R0]] : [[-R0, R0]];
    for (const [a, c] of segs) {
      const len = c - a;
      const mid = (a + c) / 2;
      // along-wall axis: (−nz, nx)
      const cx = wx - s.nz * mid;
      const cz = wz + s.nx * mid;
      const tq = quad(len, 5.5, 0, 0, len / (R0 * 2), 1);
      k.at(wallM, tq, cx + s.nx * 0.02, 2.75, cz + s.nz * 0.02, ry);
    }
    // two lit attraction signs per wall
    for (const off of east ? [-12, 12] : [-9, 9]) {
      const cx = wx - s.nz * off + s.nx * 0.12;
      const cz = wz + s.nx * off + s.nz * 0.12;
      k.at(signM, signQ(sign % 8, 6.4, 0.8), cx, 4.4, cz, ry);
      k.box(sandDark, cx - s.nx * 0.06, 1.6, cz - s.nz * 0.06, Math.abs(s.nz) * 5 + 0.3, 3.2, Math.abs(s.nx) * 5 + 0.3, 0);
      sign++;
    }
  }
  // Glowing shop doorways under the signs (behind the dark frames)
  const doorGlow = new THREE.MeshBasicMaterial({ color: 0xffcf8a });
  for (const s of sides) {
    const ry = Math.atan2(s.nx, s.nz);
    for (const off of s.nx === -1 ? [-12, 12] : [-9, 9]) {
      const cx = px - s.nx * R0 - s.nz * off + s.nx * 0.24;
      const cz = pz - s.nz * R0 + s.nx * off + s.nz * 0.24;
      k.at(doorGlow, new THREE.PlaneGeometry(4.2, 2.8), cx, 1.45, cz, ry);
    }
  }

  // ---- Stepped hotel floors up the sloped walls ----
  const corr = luxorCorridorAtlas();
  const doorM = texMat('lux-doors', () => new THREE.MeshStandardMaterial({ map: corr.map, emissiveMap: corr.glow, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.7 }));
  const edgeGlow = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const soffit = mat(0x5a4a38, 0.8);
  const floors = 6;
  const step = 3;
  const deep = 5.2;
  const corridor = 2.4;
  const railR: number[] = [];
  for (let f = 0; f < floors; f++) {
    const y = 6 + f * step;
    const rr = hwOut(y + step) - 3.4;
    railR.push(rr);
    const rb = rr + deep;
    const rd = rr + corridor;
    for (const s of sides) {
      const ry = Math.atan2(s.nx, s.nz);
      // centre of each band along the side's normal (the wall is at −n · r)
      const P = (r: number): [number, number] => [px - s.nx * r, pz - s.nz * r];
      const span = 2 * rb;
      const [sx, sz] = P((rr + rb) / 2);
      // slab (floor of this corridor / roof of the one below)
      k.box(cream, sx, y - 0.25, sz, s.nx ? deep : span, 0.5, s.nx ? span : deep);
      k.box(soffit, sx, y - 0.51, sz, s.nx ? deep - 0.02 : span - 0.02, 0.02, s.nx ? span - 0.02 : deep - 0.02);
      // rows of downlights in the soffit (what you see looking up from the casino)
      for (let a = -rb + 1.5; a <= rb - 1.5; a += 3) {
        for (const dr of [0.9, 2.6]) {
          const [lx, lz] = P(rr + dr);
          k.at(edgeGlow, new THREE.CircleGeometry(0.16, 8).rotateX(Math.PI / 2), lx - s.nz * a, y - 0.53, lz + s.nx * a);
        }
      }
      // glowing fascia under the balcony edge
      const [fx, fz] = P(rr - 0.02);
      k.box(edgeGlow, fx, y - 0.32, fz, s.nx ? 0.06 : 2 * rr, 0.14, s.nx ? 2 * rr : 0.06);
      // railing half-wall with a gilt cap
      const [rx, rz] = P(rr + 0.08);
      k.box(cream, rx, y + 0.5, rz, s.nx ? 0.16 : 2 * rr, 1.0, s.nx ? 2 * rr : 0.16);
      k.box(gilt, rx, y + 1.03, rz, s.nx ? 0.22 : 2 * rr, 0.06, s.nx ? 2 * rr : 0.22);
      // door wall
      const [dx, dz] = P(rd);
      const len = 2 * rd;
      k.at(doorM, quad(len, step, 0, 0, len / 12, 1), dx + s.nx * 0.01, y + step / 2, dz + s.nz * 0.01, ry);
      // colliders: walkable slab, rail, door wall
      if (s.nz !== 0) {
        const z0 = s.nz > 0 ? pz - rb : pz + rr;
        const z1 = s.nz > 0 ? pz - rr : pz + rb;
        b.collider(px - rb, px + rb, z0, z1, y - 0.5, y);
        const zr = s.nz > 0 ? pz - rr : pz + rr;
        b.collider(px - rr, px + rr, zr - 0.12, zr + 0.12, y, y + 1.1, true);
        const zd = s.nz > 0 ? pz - rd : pz + rd;
        b.collider(px - rd, px + rd, s.nz > 0 ? zd - 1 : zd, s.nz > 0 ? zd : zd + 1, y, y + step, true);
      } else {
        const x0 = s.nx > 0 ? px - rb : px + rr;
        const x1 = s.nx > 0 ? px - rr : px + rb;
        b.collider(x0, x1, pz - rb, pz + rb, y - 0.5, y);
        const xr = s.nx > 0 ? px - rr : px + rr;
        b.collider(xr - 0.12, xr + 0.12, pz - rr, pz + rr, y, y + 1.1, true);
        const xd = s.nx > 0 ? px - rd : px + rd;
        b.collider(s.nx > 0 ? xd - 1 : xd, s.nx > 0 ? xd : xd + 1, pz - rd, pz + rd, y, y + step, true);
      }
    }
  }
  // Inner skin above the top floor: dark bronze glass seen from inside
  const innerSkin = luxorSkinGeometry(half - 0.35, h - 0.45);
  innerSkin.scale(1, 1, 1);
  const pane = pyramidGlassTexture().clone();
  pane.needsUpdate = true;
  pane.repeat.set(22, 18);
  const skinM = new THREE.MeshStandardMaterial({ map: pane, color: 0xffffff, roughness: 0.3, metalness: 0.5, side: THREE.BackSide, emissive: 0x1a120a, emissiveIntensity: 1 });
  const skin = new THREE.Mesh(innerSkin, skinM);
  skin.position.set(px, 0, pz);
  g.add(skin);

  // ---- Papyrus columns under the first floor's edge ----
  const colM = mat(0xd8c49a, 0.75);
  const band = texMat('lux-band', () => new THREE.MeshStandardMaterial({ map: canopyStripeTexture('#2a4f9e', '#c9a04a', '#9a3a22'), roughness: 0.6 }));
  const rc = railR[0];
  for (const s of sides) {
    for (let a = -rc + 3; a <= rc - 3; a += 6.2) {
      if (s.nx === -1 && Math.abs(a) < 9) continue; // keep the entrance axis (and the pharaohs) clear
      const cx = px - s.nx * rc - s.nz * a;
      const cz = pz - s.nz * rc + s.nx * a;
      k.cyl(colM, cx, 0, cz, 0.55, 0.62, 4.6, 12);
      k.cyl(band, cx, 1.2, cz, 0.6, 0.6, 0.5, 12);
      k.cyl(band, cx, 3.6, cz, 0.58, 0.58, 0.35, 12);
      k.cyl(gilt, cx, 4.6, cz, 1.0, 0.55, 0.9, 12);
      b.collider(cx - 0.6, cx + 0.6, cz - 0.6, cz + 0.6, 0, 5.5, true);
    }
  }

  // ---- Entrance tunnel lining + colossal seated pharaohs facing the doors ----
  const tx0 = px + R0;
  const tx1 = px + half + 4.2;
  for (const s of [-1, 1]) k.box(sandDark, (tx0 + tx1) / 2, doorH / 2, pz + s * (doorHalf + 0.15), tx1 - tx0, doorH, 0.3);
  k.box(gilt, (tx0 + tx1) / 2, doorH - 0.1, pz, tx1 - tx0, 0.2, doorHalf * 2);
  k.at(edgeGlow, new THREE.PlaneGeometry(tx1 - tx0, doorHalf * 2 - 0.6).rotateX(Math.PI / 2), (tx0 + tx1) / 2, doorH - 0.22, pz);
  const nemes = texMat('lux-nemes', () => {
    const t = canopyStripeTexture('#d8b04a', '#2a4f9e', '#d8b04a');
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
  });
  for (const s of [-1, 1]) {
    const sx = px + 15.2;
    const sz = pz + s * 6.2;
    k.box(sandDark, sx, 0.6, sz, 5, 1.2, 3.4); // plinth
    k.box(sand, sx - 0.9, 3.2, sz, 2.6, 4, 2.8); // throne + lap
    k.box(sand, sx + 0.9, 2.2, sz, 1.4, 2.0, 2.4); // shins
    k.box(sand, sx - 0.5, 6.0, sz, 1.6, 3.0, 2.2); // torso
    k.box(sand, sx - 0.4, 8.1, sz, 1.4, 1.5, 1.2); // head
    k.box(nemes, sx - 0.6, 8.0, sz, 1.6, 1.9, 2.0); // nemes headdress
    k.box(nemes, sx - 0.3, 6.6, sz, 0.6, 1.4, 1.8); // lappets
    k.box(gilt, sx + 0.35, 7.6, sz, 0.3, 0.5, 0.25); // beard
    k.box(sand, sx + 0.3, 4.9, sz - 0.8, 1.6, 0.5, 0.5); // forearms on the knees
    k.box(sand, sx + 0.3, 4.9, sz + 0.8, 1.6, 0.5, 0.5);
    b.collider(sx - 2.5, sx + 2.5, sz - 1.7, sz + 1.7, 0, 9, true);
  }

  // ---- Obelisks with glowing hieroglyphs ----
  const obM = texMat('lux-obelisk', () => {
    const t = glyph.clone();
    t.needsUpdate = true;
    t.repeat.set(0.5, 2.5);
    return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffc070, emissiveIntensity: 0.35, roughness: 0.7 });
  });
  for (const [ox, oz, hh] of [
    [-12.5, 0, 12],
    [0, -14, 9],
    [0, 14, 9],
  ]) {
    const x = px + ox;
    const z = pz + oz;
    k.box(sandDark, x, 0.5, z, 3, 1, 3);
    k.at(obM, new THREE.CylinderGeometry(0.75 * Math.SQRT2, 1.05 * Math.SQRT2, hh, 4, 1).rotateY(Math.PI / 4), x, 1 + hh / 2, z);
    k.at(gilt, new THREE.ConeGeometry(0.75 * Math.SQRT2, 1.6, 4).rotateY(Math.PI / 4), x, 1 + hh + 0.8, z);
    b.collider(x - 1.5, x + 1.5, z - 1.5, z + 1.5, 0, 1 + hh, true);
  }

  // ---- Central bar under a hanging glass pyramid ----
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    kitAddObject(k, barCounter(5, 0x1a1a22, 0x2a4f9e), px + Math.cos(a) * 3.2, 0, pz + Math.sin(a) * 3.2, -a - Math.PI / 2);
  }
  b.collider(px - 3.6, px + 3.6, pz - 3.6, pz + 3.6, 0, 1.15, true);
  b.shopSpots.push({ kind: 'bar', position: new THREE.Vector3(px + 4.8, 0, pz + 1.5), radius: 2.4, label: 'Luxor Pyramid Bar' });
  const glassPyr = new THREE.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffb040, emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.75 });
  k.at(glassPyr, new THREE.ConeGeometry(3.4, 3.6, 4).rotateY(Math.PI / 4), px, 7.8, pz);
  k.at(gilt, new THREE.CylinderGeometry(0.03, 0.03, 12, 4), px, 15.6, pz);

  // ---- Casino games on the atrium floor ----
  const felt = 0x14305a;
  const slots = (x: number, z: number, count: number, along: 'x' | 'z', facing: number, label: string, id: string) => {
    let first: THREE.Vector3 | null = null;
    for (let i = 0; i < count; i++) {
      const off = (i - (count - 1) / 2) * 1.1;
      const sx2 = along === 'x' ? x + off : x;
      const sz2 = along === 'z' ? z + off : z;
      kitAddObject(k, slotMachine('#e8c35a', 0x3a7aff), sx2, 0, sz2, facing);
      b.collider(sx2 - 0.55, sx2 + 0.55, sz2 - 0.5, sz2 + 0.5, 0, 1.75, true);
      if (!first) first = new THREE.Vector3(sx2 + Math.sin(facing) * 1.6, 0, sz2 + Math.cos(facing) * 1.6);
    }
    b.gamblingSpots.push({ id, casinoName: 'Luxor', gameType: 'slots', position: first!, label });
  };
  slots(px, pz - 8, 5, 'x', Math.PI, 'Luxor Pharaoh’s Fortune Slots', 'luxor-slots-n');
  slots(px, pz + 8, 5, 'x', 0, 'Luxor Cleopatra Slots', 'luxor-slots-s');
  slots(px - 8, pz, 4, 'z', -Math.PI / 2, 'Luxor Sphinx Slots', 'luxor-slots-w');
  const table = (game: 'roulette' | 'blackjack' | 'craps', x: number, z: number, label: string, i: number) => {
    const t = game === 'roulette' ? rouletteTable(felt) : game === 'blackjack' ? blackjackTable(felt) : crapsTable(felt);
    kitAddObject(k, t, x, 0, z, 0);
    const hw = game === 'craps' ? 2.4 : 1.9;
    const hd = game === 'craps' ? 1.1 : game === 'roulette' ? 0.95 : 1.0;
    b.collider(x - hw, x + hw, z - hd, z + hd, 0, 1.1);
    b.gamblingSpots.push({ id: `luxor-${game}-${i}`, casinoName: 'Luxor', gameType: game, position: new THREE.Vector3(x, 0, z), label });
  };
  table('roulette', px - 10, pz - 10, 'Luxor Roulette', 0);
  table('blackjack', px + 9, pz - 10, 'Luxor Blackjack', 1);
  table('craps', px - 10, pz + 10, 'Luxor Craps', 2);
  table('blackjack', px + 9, pz + 10, 'Luxor Blackjack (Nile Pit)', 3);

  // ---- Inclinators riding the corner diagonals ----
  const rA = 15.5;
  const yA = 0.2;
  const topFloor = 6 + (floors - 1) * step;
  const rB = railR[floors - 1] + 1.0;
  const yB = topFloor + 0.05;
  const track = mat(0x8a8f96, 0.35, 0.8);
  const cabM = new THREE.MeshStandardMaterial({ color: 0x2a2a30, emissive: 0xffe6b0, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.5 });
  const cabs: Array<{ m: THREE.Mesh; sx: number; sz: number; phase: number }> = [];
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    for (const o of [-0.6, 0.6]) {
      const a = new THREE.Vector3(px + sx * rA + o * sz * 0.7, yA - 0.2, pz + sz * rA - o * sx * 0.7);
      const c = new THREE.Vector3(px + sx * rB + o * sz * 0.7, yB + 2.6, pz + sz * rB - o * sx * 0.7);
      const len = a.distanceTo(c);
      const geo = new THREE.BoxGeometry(0.16, len, 0.16);
      geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.clone().sub(a).normalize()));
      geo.translate((a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2);
      k.add(geo, track);
    }
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.3, 1.9), cabM);
    g.add(cab);
    cabs.push({ m: cab, sx, sz, phase: (sx + 1) * 3 + (sz + 1) * 7 });
  }
  const cabAt = (s: number, sx: number, sz: number, out: THREE.Vector3) => out.set(px + sx * (rA + (rB - rA) * s), yA + (yB - yA) * s, pz + sz * (rA + (rB - rA) * s));
  let rideS = 0;
  let rideDir = 0;
  const tmp = new THREE.Vector3();
  b.every((dt, t) => {
    if (rideDir !== 0) rideS = Math.max(0, Math.min(1, rideS + rideDir * dt * 0.085));
    if (!g.visible) return;
    for (let i = 0; i < cabs.length; i++) {
      const c = cabs[i];
      const s = i === 0 ? rideS : 0.5 - 0.5 * Math.cos(((t + c.phase) / 26) * Math.PI * 2);
      cabAt(s, c.sx, c.sz, tmp);
      c.m.position.set(tmp.x, tmp.y + 1.15, tmp.z);
    }
  });
  const base = cabAt(0, 1, 1, new THREE.Vector3());
  const top = cabAt(1, 1, 1, new THREE.Vector3());
  b.rideables.push({
    id: 'luxor-inclinator-up',
    kind: 'elevator',
    label: 'Luxor Inclinator',
    boardRadius: 2.6,
    boardPoint: (out) => out.copy(base),
    seat: (out) => cabAt(rideS, 1, 1, out).setY(yA + (yB - yA) * rideS + 0.05),
    yaw: () => Math.PI * 0.75,
    exitPoint: (out) => (rideS > 0.97 ? out.set(top.x + 0.9, yB + 0.05, top.z + 0.9) : out.set(base.x - 1.6, 0.2, base.z - 1.6)),
    canBoard: () => ({ ok: true }),
    onBoard: () => {
      rideS = 0;
      rideDir = 1;
    },
    wantsExit: () => rideS >= 1,
    boardPrompt: 'Press [G] to ride the inclinator up the pyramid’s corner (39° and climbing)',
    ridingPrompt: 'Riding the Luxor inclinator… the whole atrium opens up below',
    view: () => ({ yaw: Math.PI * 0.25, pitch: 0.35, dist: 9 }),
  });
  b.rideables.push({
    id: 'luxor-inclinator-down',
    kind: 'elevator',
    label: 'Luxor Inclinator',
    boardRadius: 2.4,
    boardPoint: (out) => out.set(top.x + 0.9, yB, top.z + 0.9),
    seat: (out) => cabAt(rideS, 1, 1, out).setY(yA + (yB - yA) * rideS + 0.05),
    yaw: () => -Math.PI * 0.25,
    exitPoint: (out) => (rideS < 0.03 ? out.set(base.x - 1.6, 0.2, base.z - 1.6) : out.set(top.x + 0.9, yB + 0.05, top.z + 0.9)),
    canBoard: () => ({ ok: true }),
    onBoard: () => {
      rideS = 1;
      rideDir = -1;
    },
    wantsExit: () => rideS <= 0,
    boardPrompt: 'Press [G] to take the inclinator back down to the casino',
    ridingPrompt: 'Down the corner of the pyramid…',
  });

  // ---- The Sky Beam's lamp chamber at the apex, seen from inside ----
  const lampCore = new THREE.MeshBasicMaterial({ color: 0xfff6dc, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const core = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 10), lampCore);
  core.position.set(px, h - 3.2, pz);
  g.add(core);
  const shaftM = new THREE.MeshBasicMaterial({ color: 0xfff2d0, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 0.6, 12, 16, 1, true), shaftM);
  shaft.position.set(px, h - 9, pz);
  g.add(shaft);
  b.every((_dt, t, night) => {
    if (!g.visible) return;
    lampCore.opacity = 0.25 + night * 0.65 + Math.sin(t * 3) * 0.03;
    shaftM.opacity = 0.05 + night * 0.18;
  });

  k.flush(g);
  gated(b, g, px - half, px + half, pz - half, pz + half, 3);

  b.zone('Luxor Casino & Atrium', px - R0, px + R0, pz - R0, pz + R0);
  b.zone('Luxor Entrance Tunnel', px + R0, px + half + 4.5, pz - doorHalf, pz + doorHalf);
  b.crowd.guards.push({
    name: 'Luxor',
    pts: [
      [px - 15, pz - 15],
      [px + 15, pz - 15],
      [px + 15, pz + 15],
      [px - 15, pz + 15],
    ],
    kick: [px + half + 8, pz],
    zone: { minX: px - R0, maxX: px + R0, minZ: pz - R0, maxZ: pz + R0 },
  });
  b.crowd.tourists.push(
    { pts: [[px + 26, pz], [px + 12, pz], [px + 12, pz - 14], [px - 14, pz - 14], [px - 14, pz + 14], [px + 12, pz + 14]], prop: 'camera' },
    { pts: [[px - 19, pz - 19], [px + 19, pz - 19], [px + 19, pz + 19], [px - 19, pz + 19]], prop: 'bag' },
    { pts: [[px + 6, pz + 4], [px + 6, pz - 4], [px - 5, pz - 5], [px - 5, pz + 5]], prop: 'yard-drink' }
  );
  b.pickup(px - 12.5, 1.5, pz + 2, 3, 'Obelisk Offering Pack', true);
  b.pickup(px + 9, 1.35, pz - 10, 5, 'Luxor Blackjack Pack!', true);
  b.pickup(top.x - 2, yB + 0.5, top.z + 1.2, 6, 'Top-Floor Corridor Pack (room service left it)', true);
}
