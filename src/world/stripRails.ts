import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WorldBuilder } from './builder';
import { mat, mesh } from './props';
import { STRIP } from './strip';
import { canvasTex } from './themedKit';

/*
 * The Strip's two bridge intersections (Flamingo Rd and Tropicana Ave) have no at-grade crosswalks:
 * black steel pedestrian railings run along the curbs at all four corners, on the Boulevard and on the
 * cross street, with "NO PED CROSSING — USE BRIDGE" signs, so people take the escalators up to the
 * skybridges. Rails are merged boxes; the pickets are one alpha-tested plane per run (one material).
 */

let picketMat: THREE.MeshStandardMaterial | null = null;
function pickets(): THREE.MeshStandardMaterial {
  if (picketMat) return picketMat;
  const tex = canvasTex(
    64,
    64,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#1b1d20';
      ctx.fillRect(w / 2 - 5, 0, 10, h);
    },
    true
  );
  picketMat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6, color: 0xffffff });
  return picketMat;
}

let signMat: THREE.MeshStandardMaterial | null = null;
function useBridgeSign(): THREE.MeshStandardMaterial {
  if (signMat) return signMat;
  const tex = canvasTex(256, 320, (ctx, w, h) => {
    ctx.fillStyle = '#f4f4f0';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 40px "Arial Narrow", Arial, sans-serif';
    ctx.fillText('NO PED', w / 2, 52);
    ctx.fillText('CROSSING', w / 2, 98);
    // walking figure in a red circle-slash
    ctx.save();
    ctx.translate(w / 2, 178);
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(0, -34, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111';
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(0, 8);
    ctx.lineTo(-14, 34);
    ctx.moveTo(0, 8);
    ctx.lineTo(14, 34);
    ctx.moveTo(-16, -10);
    ctx.lineTo(16, -4);
    ctx.stroke();
    ctx.strokeStyle = '#c8102e';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(0, 0, 46, 0, Math.PI * 2);
    ctx.moveTo(-33, -33);
    ctx.lineTo(33, 33);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 34px "Arial Narrow", Arial, sans-serif';
    ctx.fillText('USE BRIDGE', w / 2, 262);
    ctx.beginPath();
    ctx.moveTo(w / 2, 284);
    ctx.lineTo(w / 2 - 14, 300);
    ctx.lineTo(w / 2 + 14, 300);
    ctx.closePath();
    ctx.fill();
  });
  signMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, side: THREE.DoubleSide });
  return signMat;
}

/** One straight railing run from (x0, z0) to (x1, z1): posts, top/mid/bottom rails, picket plane. */
function railRun(b: WorldBuilder, x0: number, z0: number, x1: number, z1: number): void {
  const steel = mat(0x1b1d20, 0.5, 0.6);
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const ang = Math.atan2(dx, dz);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const H = 1.07;
  for (const [y, t] of [
    [H, 0.06],
    [0.55, 0.04],
    [0.12, 0.04],
  ] as Array<[number, number]>) {
    const r = mesh(new THREE.BoxGeometry(t, t, len), steel, cx, y, cz);
    r.rotation.y = ang;
    b.add(r);
  }
  const n = Math.max(1, Math.round(len / 2.4));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    b.add(mesh(new THREE.BoxGeometry(0.07, H + 0.04, 0.07), steel, x0 + dx * t, (H + 0.04) / 2, z0 + dz * t));
  }
  const geo = new THREE.PlaneGeometry(len, H - 0.16);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / 0.14));
  const p = mesh(geo, pickets(), cx, 0.12 + (H - 0.16) / 2, cz);
  p.rotation.y = ang + Math.PI / 2;
  b.add(p);
}

/** Railings and signs at the four corners of one bridge intersection centred on z = zc. */
function cornerRails(b: WorldBuilder, zc: number, crossHalf = STRIP.flamingoHalf, reach = 27): void {
  const half = STRIP.curb;
  const xr = half + 0.35; // just behind the curb
  const zEdge = crossHalf + 0.35; // behind the cross street's curb
  // reach: along the Boulevard from the intersection centre
  const post = mat(0x8a8f96, 0.5, 0.6);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      // along the Boulevard curb, then round the corner along the cross street to the sidewalk's edge
      railRun(b, sx * xr, zc + sz * (zEdge + 1.6), sx * xr, zc + sz * reach);
      railRun(b, sx * (xr + 1.6), zc + sz * zEdge, sx * (STRIP.sidewalkOuter - 0.3), zc + sz * zEdge);
      // the corner itself: a short angled run
      railRun(b, sx * xr, zc + sz * (zEdge + 1.6), sx * (xr + 1.6), zc + sz * zEdge);
      // NO PED CROSSING sign on a post, facing people walking toward the corner
      const px = sx * (xr + 0.25);
      const pz = zc + sz * (zEdge + 3.2);
      b.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), post, px, 1.3, pz));
      const sg = mesh(new THREE.PlaneGeometry(0.6, 0.75), useBridgeSign(), px, 2.15, pz + sz * 0.03);
      sg.rotation.y = sz > 0 ? 0 : Math.PI;
      b.add(sg);
    }
  }
}

/**
 * Steel security bollards along both curbs: Clark County has set thousands of 4-ft crash-rated posts
 * along the Strip's sidewalks since 2017-18, every metre and a half or so, with gaps for the crossings,
 * the bus stops and the street furniture. Dark bronze like the light poles, domed tops. Static (they bake
 * into the street's shared vertex-colour draw), with low colliders: a car can't mount the curb through
 * them, and Lou can hop up and sit on one.
 */
export function buildCurbBollards(b: WorldBuilder, deuceStops: Array<{ z: number; side: 1 | -1 }>, crossings: Array<{ z: number; road?: string }>): void {
  const body = new THREE.CylinderGeometry(0.1, 0.11, 1.05, 10).translate(0, 0.525, 0);
  const cap = new THREE.SphereGeometry(0.105, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.05, 0);
  for (const g of [body, cap]) g.deleteAttribute('uv');
  const geo = mergeGeometries([body.toNonIndexed(), cap.toNonIndexed()], false)!;
  // bakeStatic wants position/normal/uv
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  const steel = mat(0x2a2622, 0.45, 0.6);
  const half = STRIP.curb;
  const x0 = half + 0.5;
  const mod = (v: number, m: number) => ((v % m) + m) % m;
  for (const s of [-1, 1] as const) {
    for (let z = STRIP.north + 8; z < STRIP.south - 8; z += 1.55) {
      if (Math.abs(z) < 28 || Math.abs(z - STRIP.tropicanaZ) < 28 || Math.abs(z + 407) < 21 || (z > 880 && z < 960)) continue;
      if (crossings.some((c) => Math.abs(c.z - z) < (c.road ? 12 : 6))) continue;
      if (deuceStops.some((d) => d.side === s && Math.abs(d.z - z) < 4.5)) continue;
      // driveway mouths (Bellagio's main drive, Wynn's)
      if ((s < 0 && z > 93 && z < 112) || (s > 0 && z > -561 && z < -545)) continue;
      // clear of the curb furniture (every 11 m) and the light poles (every 24 m)
      const f = mod(z - (STRIP.north + 16), 11);
      if (f < 0.9 || f > 10.1) continue;
      const p = mod(z - (STRIP.north + 10), 24);
      if (p < 0.8 || p > 23.2) continue;
      const x = s * x0;
      b.add(mesh(geo, steel, x, 0, z));
      b.collider(x - 0.11, x + 0.11, z - 0.11, z + 0.11, 0, 1.1);
    }
  }
}

/**
 * Corner railings at the bridge intersections: Flamingo Rd and Tropicana Ave, and Spring Mountain Rd /
 * Sands Ave (a narrower cross street, its bridges just beyond the corners).
 */
export function buildCornerRails(b: WorldBuilder): void {
  cornerRails(b, 0);
  cornerRails(b, STRIP.tropicanaZ);
  cornerRails(b, -407, 7, 20);
}
