import * as THREE from 'three';

/**
 * The phone in Lou's paws while it's open: one box, one material, one draw call (only while shown).
 *
 * Its front is a lit LOU lock screen, its back a cigarette-pack case (red flip-top, white body, a gold crest; an
 * original design, no real brand). It sits at his right forepaw, nudged outward so it peeks past his shoulder from
 * the usual camera behind him, and turns its screen toward his face.
 */

const W = 0.088;
const H = 0.165;
const D = 0.013;

function drawAtlas(): { map: HTMLCanvasElement; glow: HTMLCanvasElement } {
  // 256 x 240: left half the screen, right half the case back (each 128 x 240, the phone's aspect).
  const map = document.createElement('canvas');
  map.width = 256;
  map.height = 240;
  const glow = document.createElement('canvas');
  glow.width = 256;
  glow.height = 240;
  const g = map.getContext('2d')!;
  const e = glow.getContext('2d')!;

  // ---- screen: dusk Strip wallpaper, LOU and the clock
  const screen = (c: CanvasRenderingContext2D, lit: boolean) => {
    const sky = c.createLinearGradient(0, 0, 0, 240);
    sky.addColorStop(0, lit ? '#2a1450' : '#120a20');
    sky.addColorStop(0.55, lit ? '#a8326a' : '#3a1226');
    sky.addColorStop(0.8, lit ? '#e8823a' : '#4a2410');
    sky.addColorStop(1, lit ? '#2a1236' : '#100818');
    c.fillStyle = sky;
    c.fillRect(4, 4, 120, 232);
    // skyline: a tower, a pyramid, a wheel
    c.fillStyle = lit ? '#1a0c24' : '#08040c';
    c.fillRect(18, 120, 6, 90);
    c.fillRect(14, 112, 14, 10);
    c.beginPath();
    c.moveTo(40, 210);
    c.lineTo(66, 168);
    c.lineTo(92, 210);
    c.fill();
    c.fillRect(94, 150, 26, 60);
    c.strokeStyle = c.fillStyle;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(106, 150, 14, 0, Math.PI * 2);
    c.stroke();
    c.fillRect(4, 206, 120, 30);
    c.fillStyle = lit ? '#ffe7a8' : '#000';
    c.font = 'bold 34px system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText('LOU', 64, 62);
    c.font = 'bold 22px system-ui, sans-serif';
    c.fillStyle = lit ? '#fff4e0' : '#000';
    c.fillText('3:47', 64, 92);
  };
  g.fillStyle = '#0d0d12';
  g.fillRect(0, 0, 128, 240);
  screen(g, true);
  e.fillStyle = '#000';
  e.fillRect(0, 0, 256, 240);
  screen(e, true);

  // ---- case back: a smokes pack of Lou's own brand (cream, a teal flip-top band, a gold paw crest)
  g.fillStyle = '#f2ead8';
  g.fillRect(128, 0, 128, 240);
  g.fillStyle = '#0f6b62';
  g.fillRect(128, 0, 128, 64);
  g.fillStyle = '#d9b44a';
  g.fillRect(128, 64, 128, 5);
  g.beginPath();
  g.arc(192, 138, 24, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#5a3a12';
  for (const [dx, dy, r] of [[0, 6, 8], [-10, -8, 4], [-3, -13, 4], [5, -13, 4], [12, -7, 4]] as const) {
    g.beginPath();
    g.ellipse(192 + dx, 138 + dy, r, r * 1.15, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#f2ead8';
  g.font = 'bold 22px Georgia, serif';
  g.textAlign = 'center';
  g.fillText('LOU', 192, 42);
  g.fillStyle = '#0f6b62';
  g.font = 'bold 13px Georgia, serif';
  g.fillText('PAW SELECT', 192, 192);
  g.font = '10px Georgia, serif';
  g.fillText('20 CLASS A CIGS', 192, 210);
  // the solid teal the sides sample
  g.fillRect(250, 0, 6, 8);
  return { map, glow };
}

export class PhoneProp {
  readonly mesh: THREE.Mesh;
  private pawR: THREE.Object3D | null = null;
  private pawL: THREE.Object3D | null = null;
  private head: THREE.Object3D | null = null;
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly h = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly side = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(W, H, D);
    // Faces in order +x, -x, +y, -y, +z (screen), -z (case back), 4 vertices each: remap their UVs into the atlas.
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    const rects: Array<[number, number, number, number]> = [
      [0.98, 0.97, 0.99, 0.99],
      [0.98, 0.97, 0.99, 0.99],
      [0.98, 0.97, 0.99, 0.99],
      [0.98, 0.97, 0.99, 0.99],
      [0, 0, 0.5, 1],
      [0.5, 0, 1, 1],
    ];
    for (let f = 0; f < 6; f++) {
      const [u0, v0, u1, v1] = rects[f];
      for (let i = f * 4; i < f * 4 + 4; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    }
    uv.needsUpdate = true;
    const { map, glow } = drawAtlas();
    const tex = new THREE.CanvasTexture(map);
    tex.colorSpace = THREE.SRGBColorSpace;
    const glowTex = new THREE.CanvasTexture(glow);
    glowTex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: glowTex, emissive: 0xffffff, emissiveIntensity: 0.62, roughness: 0.42, metalness: 0.05 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'LouPhone';
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  /** Find the paws and head on Lou's rig (missing bones: it floats in front of his chest instead). */
  attach(model: THREE.Object3D): void {
    this.pawR = model.getObjectByName('Leg_FR_Paw') ?? null;
    this.pawL = model.getObjectByName('Leg_FL_Paw') ?? null;
    this.head = model.getObjectByName('Head') ?? null;
  }

  /** Once per frame after Lou's pose is set: show it in his paws, or hide it. */
  update(show: boolean, holder: THREE.Object3D, yaw: number): void {
    this.mesh.visible = show;
    if (!show) return;
    this.fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.side.set(-Math.cos(yaw), 0, Math.sin(yaw)); // Lou's right
    if (this.pawR && this.pawL && this.head) {
      this.pawR.getWorldPosition(this.a);
      this.pawL.getWorldPosition(this.b);
      this.head.getWorldPosition(this.h);
      // between the paws, nudged to his right and up a touch so it shows past his shoulder from behind
      this.a.lerp(this.b, 0.3).addScaledVector(this.side, 0.1).addScaledVector(this.fwd, 0.06);
      this.a.y += 0.09;
    } else {
      this.a.copy(holder.position).addScaledVector(this.fwd, 0.34).addScaledVector(this.side, 0.08);
      this.a.y += 0.62;
      this.h.copy(holder.position).addScaledVector(this.fwd, 0.25);
      this.h.y += 0.95;
    }
    this.mesh.position.copy(this.a);
    this.mesh.lookAt(this.h);
  }
}
