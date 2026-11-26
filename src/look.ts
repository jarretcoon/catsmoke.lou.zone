import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/** Sky state the world publishes every frame (see vegasWorld applyAtmosphere). */
export interface AtmosphereState {
  day: number;
  sunset: number;
  night: number;
  sunDir: THREE.Vector3;
  top: THREE.Color;
  horizon: THREE.Color;
}

const rand = (() => {
  let s = 1337;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
})();

/**
 * Image-based lighting for the Strip: a tiny stand-in world (sky gradient, sun, desert floor,
 * a ring of distant towers and, after dark, neon signage and street glow) is rendered into a
 * PMREM env map. Glass towers, car paint, chrome, wet eyes and polished floors then reflect a
 * Vegas that matches the time of day. Rebuilt only when the sky changes noticeably (a few ms).
 */
export class EnvLighting {
  private readonly pmrem: THREE.PMREMGenerator;
  private readonly envScene = new THREE.Scene();
  private readonly skyUniforms = {
    top: { value: new THREE.Color() },
    horizon: { value: new THREE.Color() },
    ground: { value: new THREE.Color() },
    glow: { value: new THREE.Color() },
  };
  private readonly sun: THREE.Mesh;
  private readonly sunMat: THREE.MeshBasicMaterial;
  private readonly neon: THREE.Group;
  private readonly neonMats: Array<{ mat: THREE.MeshBasicMaterial; base: THREE.Color }> = [];
  private readonly towerMat: THREE.MeshBasicMaterial;
  private readonly windowMat: THREE.MeshBasicMaterial;
  private rt: THREE.WebGLRenderTarget | null = null;
  private key = '';

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene
  ) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(100, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: this.skyUniforms,
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; uniform vec3 glow;
          varying vec3 vDir;
          void main() {
            float h = vDir.y;
            vec3 sky = mix(horizon, top, pow(max(h, 0.0), 0.5));
            sky += glow * pow(1.0 - max(h, 0.0), 5.0);
            vec3 floorCol = mix(ground, horizon * 0.35 + glow * 0.6, pow(1.0 - min(-h, 1.0), 6.0));
            gl_FragColor = vec4(h >= 0.0 ? sky : floorCol, 1.0);
          }`,
      })
    );
    this.envScene.add(sky);

    this.sunMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.sun = new THREE.Mesh(new THREE.SphereGeometry(4.5, 16, 8), this.sunMat);
    this.envScene.add(this.sun);

    // A ring of distant towers: dark slabs by day (breaks up glass reflections), lit grids by night.
    this.towerMat = new THREE.MeshBasicMaterial({ color: 0x404650 });
    this.windowMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    const box = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rand() * 0.15;
      const r = 60 + rand() * 25;
      const h = 8 + rand() * 30;
      const w = 6 + rand() * 9;
      // Group faces the centre (+z local points inward after lookAt), so window bands sit on the near face.
      const g = new THREE.Group();
      g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      g.lookAt(0, 0, 0);
      const t = new THREE.Mesh(box, this.towerMat);
      t.scale.set(w, h, w);
      t.position.y = h / 2 - 2;
      g.add(t);
      for (let k = 0; k < 5; k++) {
        if (rand() < 0.3) continue;
        const band = new THREE.Mesh(box, this.windowMat);
        band.scale.set(w * (0.6 + rand() * 0.3), 0.4 + rand() * 0.5, 0.2);
        band.position.set(0, -2 + 1.5 + ((k + 0.5) / 5) * (h - 2.5), w / 2 + 0.12);
        g.add(band);
      }
      this.envScene.add(g);
    }

    // Neon signage and marquees low on the horizon: what makes Vegas reflections read as Vegas.
    this.neon = new THREE.Group();
    const neonHues = [0xff2fa0, 0x29e6ff, 0xffc93a, 0xff3b3b, 0x9a5bff, 0x3bff8a, 0xff7a1f];
    for (let i = 0; i < 34; i++) {
      const a = rand() * Math.PI * 2;
      const r = 40 + rand() * 30;
      const w = 2 + rand() * 7;
      const h = 0.6 + rand() * 3.5;
      const base = new THREE.Color(neonHues[i % neonHues.length]);
      const mat = new THREE.MeshBasicMaterial({ color: base.clone(), side: THREE.DoubleSide });
      this.neonMats.push({ mat, base });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      p.position.set(Math.cos(a) * r, 1 + rand() * 12, Math.sin(a) * r);
      p.lookAt(0, p.position.y, 0);
      this.neon.add(p);
    }
    // Street-light pools and headlight streaks just below the horizon.
    const streetMat = new THREE.MeshBasicMaterial({ color: 0xffb066, side: THREE.DoubleSide });
    this.neonMats.push({ mat: streetMat, base: new THREE.Color(0xffb066) });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(10, 0.5), streetMat);
      p.position.set(Math.cos(a) * 35, -1.2, Math.sin(a) * 35);
      p.lookAt(0, -1.2, 0);
      this.neon.add(p);
    }
    this.envScene.add(this.neon);
  }

  /** Rebuild the env map when the sky has moved on enough to notice. Cheap no-op otherwise. */
  update(a: AtmosphereState): void {
    const key = `${Math.round(a.day * 10)}|${Math.round(a.sunset * 8)}|${Math.round(a.sunDir.y * 12)}`;
    if (key === this.key) return;
    this.key = key;

    const u = this.skyUniforms;
    u.top.value.copy(a.top);
    u.horizon.value.copy(a.horizon);
    // Desert floor by day, warm sodium/neon bounce at night.
    u.ground.value.setHex(0x2a2018).lerp(new THREE.Color(0x8a7458), a.day);
    u.glow.value.setRGB(0.55, 0.2, 0.42).multiplyScalar(a.night * 0.9).add(new THREE.Color(1.0, 0.45, 0.2).multiplyScalar(a.sunset * 0.6));

    this.sun.visible = a.sunDir.y > -0.02 && a.day > 0.05;
    this.sun.position.copy(a.sunDir).multiplyScalar(90);
    this.sunMat.color.setRGB(1, 0.93, 0.8).lerp(new THREE.Color(1, 0.5, 0.25), a.sunset).multiplyScalar(40 * Math.max(a.day, 0.2));

    this.towerMat.color.setHex(0x0c0e16).lerp(new THREE.Color(0x6c727c), a.day);
    this.windowMat.color.setRGB(1.0, 0.78, 0.5).multiplyScalar(a.night * 1.6 + 0.02);
    this.neon.visible = a.night > 0.05;
    for (const n of this.neonMats) n.mat.color.copy(n.base).multiplyScalar(0.2 + a.night * 5.5);

    const next = this.pmrem.fromScene(this.envScene, 0, 0.1, 200, { size: 128 });
    this.scene.environment = next.texture;
    this.rt?.dispose();
    this.rt = next;
  }
}

/**
 * Final grade (runs in linear HDR, before tone mapping): a touch more saturation, cool shadows
 * and warm highlights after dark, a soft vignette. Keeps the neon punchy without crushing faces.
 */
export function makeGradePass(): ShaderPass {
  return new ShaderPass({
    name: 'StripGrade',
    uniforms: {
      tDiffuse: { value: null },
      night: { value: 0 },
      vignette: { value: 0.55 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse; uniform float night; uniform float vignette;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        vec3 col = c.rgb;
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = max(mix(vec3(l), col, 1.0 + mix(0.07, 0.12, night)), 0.0);
        float t = smoothstep(0.02, 0.9, l / (l + 0.6));
        vec3 shadowTint = mix(vec3(1.0, 1.0, 1.02), vec3(0.95, 0.98, 1.07), night);
        vec3 highTint = mix(vec3(1.025, 1.0, 0.97), vec3(1.05, 0.99, 0.95), night);
        col *= mix(shadowTint, highTint, t);
        vec2 d = (vUv - 0.5) * vec2(1.0, 0.8);
        col *= clamp(1.0 - dot(d, d) * vignette, 0.0, 1.0);
        gl_FragColor = vec4(col, c.a);
      }`,
  });
}
