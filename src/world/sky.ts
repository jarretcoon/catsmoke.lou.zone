import * as THREE from 'three';

/** Gradient sky dome with a sun glow and twinkling stars that fade in after dusk. */
export class SkyDome {
  readonly mesh: THREE.Mesh;
  private readonly uniforms: {
    top: { value: THREE.Color };
    horizon: { value: THREE.Color };
    sunDir: { value: THREE.Vector3 };
    sunColor: { value: THREE.Color };
    night: { value: number };
    time: { value: number };
  };

  constructor(radius = 480) {
    this.uniforms = {
      top: { value: new THREE.Color(0x2b6fd0) },
      horizon: { value: new THREE.Color(0xbcd8f0) },
      sunDir: { value: new THREE.Vector3(0.4, 0.6, 0.3).normalize() },
      sunColor: { value: new THREE.Color(0xfff2d0) },
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
        uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor;
        uniform float night; uniform float time;
        varying vec3 vDir;
        float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
        void main() {
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 col = mix(horizon, top, pow(max(h, 0.0), 0.55));
          // City glow on the horizon at night (the Strip lights up the haze)
          col += night * vec3(0.32, 0.16, 0.28) * pow(1.0 - max(h, 0.0), 6.0);
          float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
          col += sunColor * (pow(s, 900.0) * 3.0 + pow(s, 12.0) * 0.35) * (1.0 - night);
          // Stars
          vec3 cell = floor(vDir * 220.0);
          float star = step(0.9965, hash(cell)) * smoothstep(0.05, 0.4, h);
          float tw = 0.6 + 0.4 * sin(time * 3.0 + hash(cell + 1.0) * 30.0);
          col += vec3(star * tw * night * 0.9);
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
