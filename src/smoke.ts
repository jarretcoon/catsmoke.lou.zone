import * as THREE from 'three';

export type VapeFlavor = 'Blue Razz' | 'Mango Sunset' | 'Mint Chill' | 'Cotton Candy' | 'Watermelon Ice' | 'Vegas Strawberry' | 'Tobacco Gold';
export type VapeTrick = 'orings' | 'french' | 'ghost' | 'tornado';

export const FLAVOR_COLORS: Record<VapeFlavor, number> = {
  'Blue Razz': 0x7ae8ff,
  'Mango Sunset': 0xffc478,
  'Mint Chill': 0x8effd2,
  'Cotton Candy': 0xff94e4,
  'Watermelon Ice': 0xff7a8a,
  'Vegas Strawberry': 0xff4d6d,
  'Tobacco Gold': 0xe8d2a0,
};

interface SmokeParticle {
  sprite: THREE.Sprite;
  velocity: THREE.Vector3;
  age: number;
  maxAge: number;
  startScale: number;
  endScale: number;
  baseOpacity: number;
  swirlPhase: number;
  swirlFreq: number;
  warmTint: number;
  baseColor: THREE.Color;
  /** Tornado trick: spin around a vertical axis. */
  orbit?: { cx: number; cz: number; r: number; w: number; a: number; rise: number };
  /** Ghost trick: after `at` seconds, get sucked back to `to`. */
  pull?: { to: THREE.Vector3; at: number };
}

interface SmokeRing {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  age: number;
  maxAge: number;
  baseScale: number;
}

function createSmokeTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    const blobs = [
      { x: 64, y: 64, r: 52, a: 0.48 },
      { x: 50, y: 54, r: 34, a: 0.38 },
      { x: 78, y: 58, r: 32, a: 0.38 },
      { x: 62, y: 76, r: 36, a: 0.34 },
    ];
    for (const b of blobs) {
      const grad = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, b.r);
      grad.addColorStop(0, `rgba(250, 252, 255, ${b.a})`);
      grad.addColorStop(0.55, `rgba(226, 234, 248, ${b.a * 0.5})`);
      grad.addColorStop(1, 'rgba(205, 215, 235, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class SmokeSystem {
  private readonly scene: THREE.Scene;
  private readonly texture: THREE.CanvasTexture;
  private readonly particles: SmokeParticle[] = [];
  private readonly rings: SmokeRing[] = [];
  private readonly ringGeo: THREE.TorusGeometry;
  private emitTimer = 0;
  private windTime = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.texture = createSmokeTexture();
    this.ringGeo = new THREE.TorusGeometry(0.055, 0.015, 10, 26);
  }

  public spawnWisp(
    origin: THREE.Vector3,
    catVelocity: THREE.Vector3,
    intense = false
  ): void {
    const baseColor = new THREE.Color(0xdce3f2);
    const mat = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      opacity: intense ? 0.58 : 0.38,
      color: baseColor.clone(),
    });

    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(origin);
    sprite.position.x += (Math.random() - 0.5) * 0.025;
    sprite.position.z += (Math.random() - 0.5) * 0.025;
    const startScale = intense ? 0.08 : 0.044;
    sprite.scale.set(startScale, startScale, startScale);
    mat.rotation = Math.random() * Math.PI * 2;
    this.scene.add(sprite);

    const speedBoost = intense ? 1.5 : 1.0;
    this.particles.push({
      sprite,
      velocity: new THREE.Vector3(
        catVelocity.x * 0.16 + (Math.random() - 0.5) * 0.14,
        (0.42 + Math.random() * 0.24) * speedBoost,
        catVelocity.z * 0.16 + (Math.random() - 0.5) * 0.14
      ),
      age: 0,
      maxAge: intense ? 2.4 + Math.random() * 0.9 : 1.75 + Math.random() * 0.7,
      startScale,
      endScale: intense ? 0.65 + Math.random() * 0.25 : 0.36 + Math.random() * 0.16,
      baseOpacity: intense ? 0.56 : 0.35,
      swirlPhase: Math.random() * Math.PI * 2,
      swirlFreq: 2.2 + Math.random() * 1.8,
      warmTint: intense ? 0.45 : 0.25,
      baseColor,
    });
  }

  public spawnExhaleBurst(origin: THREE.Vector3, forwardDir: THREE.Vector3): void {
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xe6ecf8,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(this.ringGeo, ringMat);
    ringMesh.position.copy(origin).addScaledVector(forwardDir, 0.08);
    ringMesh.lookAt(ringMesh.position.clone().add(forwardDir));
    this.scene.add(ringMesh);

    const ringVel = forwardDir.clone().multiplyScalar(0.85);
    ringVel.y += 0.42;
    this.rings.push({ mesh: ringMesh, velocity: ringVel, age: 0, maxAge: 2.1, baseScale: 1.0 });

    for (let i = 0; i < 8; i++) {
      const burstOrigin = origin.clone().addScaledVector(forwardDir, 0.04 + i * 0.015);
      this.spawnWisp(burstOrigin, forwardDir.clone().multiplyScalar(1.4), true);
    }
  }

  private cloudSprite(color: THREE.Color, pos: THREE.Vector3, startScale: number, opacity: number): THREE.Sprite {
    const mat = new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false, opacity, color: color.clone() });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(pos);
    sprite.scale.setScalar(startScale);
    mat.rotation = Math.random() * Math.PI * 2;
    this.scene.add(sprite);
    return sprite;
  }

  /** Vape tricks. `mouth` = mouthpiece position, `forwardDir` = facing. */
  public spawnTrick(trick: VapeTrick, mouth: THREE.Vector3, forwardDir: THREE.Vector3, flavor: VapeFlavor): void {
    const color = new THREE.Color(FLAVOR_COLORS[flavor]).lerp(new THREE.Color(0xffffff), 0.35);
    if (trick === 'orings') {
      for (let r = 0; r < 6; r++) {
        const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false });
        const ring = new THREE.Mesh(this.ringGeo, ringMat);
        ring.position.copy(mouth).addScaledVector(forwardDir, 0.08);
        ring.lookAt(ring.position.clone().add(forwardDir));
        this.scene.add(ring);
        const vel = forwardDir.clone().multiplyScalar(1.4 + r * 0.12);
        vel.y += 0.25;
        this.rings.push({ mesh: ring, velocity: vel, age: -r * 0.32, maxAge: 3.2, baseScale: 2.2 });
      }
      return;
    }
    const n = trick === 'tornado' ? 46 : 24;
    for (let i = 0; i < n; i++) {
      let vel: THREE.Vector3;
      let orbit: SmokeParticle['orbit'];
      let pull: SmokeParticle['pull'];
      let start = mouth.clone();
      let maxAge = 3 + Math.random();
      if (trick === 'french') {
        // Cloud rolls out of the mouth and up into the nose
        vel = new THREE.Vector3(forwardDir.x * 0.25, 0.55 + Math.random() * 0.2, forwardDir.z * 0.25);
        start.addScaledVector(forwardDir, 0.05 + (i / n) * 0.08);
        maxAge = 2.2;
      } else if (trick === 'ghost') {
        vel = forwardDir.clone().multiplyScalar(0.9 + Math.random() * 0.2).add(new THREE.Vector3((Math.random() - 0.5) * 0.1, 0.05, (Math.random() - 0.5) * 0.1));
        pull = { to: mouth.clone(), at: 0.75 };
        maxAge = 1.6;
      } else {
        // Tornado: a spinning column off the ground in front of Lou
        const cx = mouth.x + forwardDir.x * 1.2;
        const cz = mouth.z + forwardDir.z * 1.2;
        orbit = { cx, cz, r: 0.15 + (i / n) * 0.7, w: 7 + Math.random() * 2, a: i * 0.6, rise: 0.9 + Math.random() * 0.4 };
        start = new THREE.Vector3(cx, Math.max(0.05, mouth.y - 0.4), cz);
        vel = new THREE.Vector3();
        maxAge = 3.4;
      }
      const startScale = trick === 'tornado' ? 0.18 : 0.12;
      const sprite = this.cloudSprite(color, start, startScale, 0.75);
      this.particles.push({
        sprite,
        velocity: vel,
        age: trick === 'tornado' ? -i * 0.03 : 0,
        maxAge,
        startScale,
        endScale: trick === 'tornado' ? 0.7 : trick === 'ghost' ? 0.42 : 0.5,
        baseOpacity: 0.75,
        swirlPhase: Math.random() * Math.PI * 2,
        swirlFreq: 1.5,
        warmTint: 0,
        baseColor: color.clone(),
        orbit,
        pull,
      });
    }
  }

  public spawnVapeCloud(
    origin: THREE.Vector3,
    forwardDir: THREE.Vector3,
    flavor: VapeFlavor,
    catVelocity: THREE.Vector3,
    power = 1
  ): void {
    const colorHex = FLAVOR_COLORS[flavor];
    const cloudColor = new THREE.Color(colorHex).lerp(new THREE.Color(0xffffff), 0.35);

    // Massive triple-ring O trick!
    for (let r = 0; r < 3; r++) {
      const ringMat = new THREE.MeshBasicMaterial({
        color: cloudColor,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
      });
      const ringMesh = new THREE.Mesh(this.ringGeo, ringMat);
      ringMesh.position.copy(origin).addScaledVector(forwardDir, 0.10 + r * 0.18);
      ringMesh.lookAt(ringMesh.position.clone().add(forwardDir));
      this.scene.add(ringMesh);

      const vel = forwardDir.clone().multiplyScalar(1.15 + r * 0.35);
      vel.y += 0.32 + r * 0.08;
      this.rings.push({
        mesh: ringMesh,
        velocity: vel,
        age: -r * 0.08,
        maxAge: 2.7,
        baseScale: 1.55 + r * 0.35,
      });
    }

    // Thick sub-ohm plume: more and bigger sprites the longer the rip was held
    const count = Math.round(14 + power * 14);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.texture,
        transparent: true,
        depthWrite: false,
        opacity: 0.72,
        color: cloudColor.clone(),
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position
        .copy(origin)
        .addScaledVector(forwardDir, 0.06 + Math.random() * 0.45)
        .add(new THREE.Vector3((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.16, (Math.random() - 0.5) * 0.25));
      const startScale = (0.14 + Math.random() * 0.1) * (0.8 + power * 0.3);
      sprite.scale.set(startScale, startScale, startScale);
      mat.rotation = Math.random() * Math.PI * 2;
      this.scene.add(sprite);

      this.particles.push({
        sprite,
        velocity: new THREE.Vector3(
          forwardDir.x * (1.2 + Math.random() * 1.1) * (0.7 + power * 0.4) + catVelocity.x * 0.22 + (Math.random() - 0.5) * 0.45 * power,
          0.35 + Math.random() * 0.55,
          forwardDir.z * (1.2 + Math.random() * 1.1) * (0.7 + power * 0.4) + catVelocity.z * 0.22 + (Math.random() - 0.5) * 0.45 * power
        ),
        age: 0,
        maxAge: (3.1 + Math.random() * 1.3) * (0.8 + power * 0.35),
        startScale,
        endScale: (1.15 + Math.random() * 0.55) * (0.7 + power * 0.45),
        baseOpacity: 0.72,
        swirlPhase: Math.random() * Math.PI * 2,
        swirlFreq: 1.5 + Math.random() * 1.2,
        warmTint: 0,
        baseColor: cloudColor.clone(),
      });
    }
  }

  public update(
    dt: number,
    tipWorldPos: THREE.Vector3,
    catVelocity: THREE.Vector3,
    emitContinuous: boolean,
    isPuffing: boolean
  ): void {
    this.windTime += dt;
    if (emitContinuous) {
      const emitInterval = isPuffing ? 0.035 : 0.075;
      this.emitTimer += dt;
      while (this.emitTimer >= emitInterval) {
        this.emitTimer -= emitInterval;
        this.spawnWisp(tipWorldPos, catVelocity, isPuffing);
      }
    }

    const windX = Math.sin(this.windTime * 0.45) * 0.16 + 0.05;
    const windZ = Math.cos(this.windTime * 0.32) * 0.10;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.maxAge) {
        this.scene.remove(p.sprite);
        p.sprite.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      if (p.age < 0) {
        p.sprite.visible = false;
        continue;
      }
      p.sprite.visible = true;
      const t = p.age / p.maxAge;
      const swirl = Math.sin(p.age * p.swirlFreq + p.swirlPhase) * 0.16;

      if (p.orbit) {
        const o = p.orbit;
        const a = o.a + p.age * o.w;
        const r = o.r * (1 + t * 1.6);
        p.sprite.position.set(o.cx + Math.cos(a) * r, p.sprite.position.y + o.rise * dt, o.cz + Math.sin(a) * r);
      } else if (p.pull && p.age > p.pull.at) {
        const toMouth = p.pull.to.clone().sub(p.sprite.position);
        p.sprite.position.addScaledVector(toMouth, Math.min(1, dt * 5));
      } else {
        p.sprite.position.x += (p.velocity.x + windX + swirl) * dt;
        p.sprite.position.y += p.velocity.y * dt;
        p.sprite.position.z += (p.velocity.z + windZ + Math.cos(p.age * p.swirlFreq) * 0.12) * dt;
      }

      p.velocity.x *= Math.max(0, 1 - dt * 1.45);
      p.velocity.z *= Math.max(0, 1 - dt * 1.45);

      const scale = THREE.MathUtils.lerp(p.startScale, p.endScale, Math.pow(t, 0.7));
      p.sprite.scale.set(scale, scale, scale);
      p.sprite.material.rotation += dt * 0.32;

      const fadeIn = Math.min(1, t * 8);
      const fadeOut = Math.pow(1 - t, 1.4);
      p.sprite.material.opacity = p.baseOpacity * fadeIn * fadeOut;

      if (p.warmTint > 0) {
        const emberFade = Math.max(0, 1 - t * 4) * p.warmTint;
        p.sprite.material.color.setRGB(
          p.baseColor.r + emberFade * 0.16,
          p.baseColor.g - emberFade * 0.18,
          p.baseColor.b - emberFade * 0.42
        );
      }
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.age += dt;
      if (r.age < 0) continue;
      if (r.age >= r.maxAge) {
        this.scene.remove(r.mesh);
        (r.mesh.material as THREE.Material).dispose();
        this.rings.splice(i, 1);
        continue;
      }
      const t = r.age / r.maxAge;
      r.mesh.position.addScaledVector(r.velocity, dt);
      r.velocity.multiplyScalar(Math.max(0, 1 - dt * 1.25));
      r.velocity.y += dt * 0.12;
      const s = r.baseScale * (1 + t * 4.5);
      r.mesh.scale.set(s, s, s);
      r.mesh.rotation.x += dt * 0.3;
      const mat = r.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.72 * Math.pow(1 - t, 1.3);
    }
  }
}
