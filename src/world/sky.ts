import * as THREE from 'three';

/**
 * Gradient sky dome: sun glow, thin desert cirrus by day, a moon with a hazy halo and
 * light-polluted stars after dusk (few and faint near the glowing horizon, more overhead).
 */
export class SkyDome {
  readonly mesh: THREE.Mesh;
  private readonly uniforms: {
    top: { value: THREE.Color };
    horizon: { value: THREE.Color };
    sunDir: { value: THREE.Vector3 };
    sunColor: { value: THREE.Color };
    moonDir: { value: THREE.Vector3 };
    night: { value: number };
    time: { value: number };
  };

  constructor(radius = 480) {
    this.uniforms = {
      top: { value: new THREE.Color(0x2b6fd0) },
      horizon: { value: new THREE.Color(0xbcd8f0) },
      sunDir: { value: new THREE.Vector3(0.4, 0.6, 0.3).normalize() },
      sunColor: { value: new THREE.Color(0xfff2d0) },
      // Low in the south-east over the airport, where you see it from the Welcome sign.
      moonDir: { value: new THREE.Vector3(0.45, 0.42, 0.78).normalize() },
      night: { value: 0 },
      time: { value: 0 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; uniform vec3 moonDir;
        uniform float night; uniform float time;
        varying vec3 vDir;
        float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
        float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float fbm(vec2 p) {
          float v = 0.0; float a = 0.5;
          for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(17.1, 9.3); a *= 0.5; }
          return v;
        }
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -0.2, 1.0);
          vec3 col = mix(horizon, top, pow(max(h, 0.0), 0.55));
          // City glow on the horizon at night (the Strip lights up the haze)
          col += night * vec3(0.32, 0.16, 0.28) * pow(1.0 - max(h, 0.0), 6.0);
          float s = max(dot(d, normalize(sunDir)), 0.0);
          col += sunColor * (pow(s, 900.0) * 3.0 + pow(s, 12.0) * 0.35) * (1.0 - night);

          // Thin, wind-stretched desert cirrus (projected on a high flat layer).
          if (h > 0.02) {
            vec2 cp = d.xz / (d.y + 0.08) * 0.9 + vec2(time * 0.004, time * 0.0015);
            float c = fbm(cp * vec2(1.0, 2.6));
            c = smoothstep(0.55, 0.85, c) * smoothstep(0.02, 0.25, h);
            vec3 cloudLit = mix(vec3(1.0), sunColor, 0.35) * (1.0 + pow(s, 6.0) * 0.6);
            vec3 cloudNight = vec3(0.16, 0.1, 0.16); // underlit by the Strip
            col = mix(col, mix(cloudLit, cloudNight, night), c * mix(0.55, 0.35, night));
          }

          // Moon with a hazy halo; its face has a few soft maria.
          float m = dot(d, normalize(moonDir));
          float disc = smoothstep(0.99955, 0.99975, m);
          vec2 mf = vec2(dot(d, normalize(cross(moonDir, vec3(0.0, 1.0, 0.0)))), d.y - moonDir.y) * 900.0;
          float maria = 0.82 + 0.18 * noise(mf * 0.25 + 3.0);
          col += night * (disc * vec3(1.0, 0.97, 0.9) * 1.6 * maria + pow(max(m, 0.0), 300.0) * vec3(0.25, 0.22, 0.3) + pow(max(m, 0.0), 30.0) * vec3(0.05, 0.04, 0.06));

          // Stars: light pollution leaves only the brighter ones, and almost none low down.
          vec3 cell = floor(d * 260.0);
          float r = hash(cell);
          float star = step(0.9972, r) * smoothstep(0.12, 0.55, h) * (1.0 - disc);
          float bright = 0.35 + 0.65 * hash(cell + 3.0);
          float tw = 0.65 + 0.35 * sin(time * (2.0 + 3.0 * hash(cell + 2.0)) + hash(cell + 1.0) * 30.0);
          vec3 tint = mix(vec3(0.8, 0.88, 1.0), vec3(1.0, 0.9, 0.78), hash(cell + 5.0));
          col += tint * star * bright * tw * night * 0.85;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
  }

  set(top: THREE.Color, horizon: THREE.Color, sunDir: THREE.Vector3, sunColor: THREE.Color, night: number, time: number): void {
    this.uniforms.top.value.copy(top);
    this.uniforms.horizon.value.copy(horizon);
    this.uniforms.sunDir.value.copy(sunDir).normalize();
    this.uniforms.sunColor.value.copy(sunColor);
    this.uniforms.night.value = night;
    this.uniforms.time.value = time;
  }

  follow(camera: THREE.Camera): void {
    this.mesh.position.copy(camera.position);
  }
}
