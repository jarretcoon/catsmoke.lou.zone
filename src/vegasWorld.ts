import * as THREE from 'three';
import type { MapFeature, MapMarker } from './minimap';
import type { CrowdConfig } from './npcs';
import type { Rideable } from './rides';
import { buildBackdrop } from './world/backdrop';
import { CigPickup, GamblingSpot, PlatformBox, ShopSpot, WorldBuilder } from './world/builder';
import { buildEastSide } from './world/eastSide';
import type { RestaurantDef } from './world/food';
import { buildFoodAndShops } from './world/foodAndShops';
import { SkyDome } from './world/sky';
import { bakeStatic } from './world/staticBatch';
import { buildStrip, DeuceState, TrafficCar } from './world/strip';
import { buildWestSide } from './world/westSide';

export type { CigPickup, GamblingSpot, PlatformBox, ShopSpot } from './world/builder';
export type TimePreset = 'day' | 'sunset' | 'night' | 'auto';

export interface WaterZone {
  name: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y: number;
}

export interface VegasWorldContext {
  colliders: PlatformBox[];
  cigPickups: CigPickup[];
  gamblingSpots: GamblingSpot[];
  shopSpots: ShopSpot[];
  rideables: Rideable[];
  waterZones: WaterZone[];
  mapFeatures: MapFeature[];
  staticMarkers: MapMarker[];
  crowd: CrowdConfig;
  props: Array<{ obj: THREE.Object3D; r: number; h: number; kind: string }>;
  restaurants: RestaurantDef[];
  deuceBuses: DeuceState[];
  deuceStops: Array<{ z: number; side: 1 | -1; name: string }>;
  trafficVehicles: TrafficCar[];
  /** New games start at the Welcome sign (3:47 AM). */
  spawn: THREE.Vector3;
  spawnYaw: number;
  /** [R] puts Lou back at the Bellagio fountains. */
  resetPoint: THREE.Vector3;
  sun: THREE.DirectionalLight;
  stats: { meshesBefore: number; meshesAfter: number };
  setTimePreset: (preset: TimePreset) => void;
  getTimePreset: () => TimePreset;
  getDaylightLabel: () => string;
  getNight: () => number;
  getZoneName: (x: number, z: number) => string;
  unlockVip: () => void;
  update: (dt: number, elapsed: number, focus: THREE.Vector3, camera: THREE.Camera) => void;
}

/** Real Deuce stops on this stretch (+ the two ends of the map). side −1 = west curb (southbound). */
const DEUCE_STOPS: Array<{ z: number; side: 1 | -1; name: string }> = [
  // southbound (west curb)
  { z: -722, side: -1, name: 'CIRCUS CIRCUS' },
  { z: -640, side: -1, name: 'RESORTS WORLD' },
  { z: -455, side: -1, name: 'FASHION SHOW' },
  { z: -360, side: -1, name: 'TREASURE ISLAND' },
  { z: -194, side: -1, name: 'HARD ROCK (MIRAGE)' },
  { z: -108, side: -1, name: 'CAESARS PALACE' },
  { z: 186, side: -1, name: 'COSMOPOLITAN' },
  { z: 495, side: -1, name: 'EXCALIBUR' },
  { z: 575, side: -1, name: 'LUXOR' },
  { z: 665, side: -1, name: 'MANDALAY BAY' },
  { z: 872, side: -1, name: 'WELCOME SIGN • SOUTH STRIP' },
  // northbound (east curb)
  { z: 880, side: 1, name: 'WELCOME SIGN • SOUTH STRIP' },
  { z: 690, side: 1, name: 'MANDALAY BAY RD' },
  { z: 515, side: 1, name: 'BALLPARK SITE' },
  { z: 405, side: 1, name: 'MGM GRAND' },
  { z: 175, side: 1, name: 'PLANET HOLLYWOOD' },
  { z: 94, side: 1, name: 'PARIS' },
  { z: -156, side: 1, name: "HARRAH'S" },
  { z: -238, side: 1, name: 'VENETIAN' },
  { z: -470, side: 1, name: 'WYNN' },
  { z: -680, side: 1, name: 'PEPPERMILL • RIVIERA' },
  { z: -770, side: 1, name: 'FONTAINEBLEAU' },
];

export function buildVegasStripWorld(scene: THREE.Scene): VegasWorldContext {
  const b = new WorldBuilder(scene);

  // ---- Lighting & atmosphere ----
  const sky = new SkyDome(900);
  scene.add(sky.mesh);
  const fog = new THREE.FogExp2(0x9fc4e8, 0.0018);
  scene.fog = fog;
  scene.background = new THREE.Color(0x070917);
  const hemi = new THREE.HemisphereLight(0x7c92d6, 0x201828, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4de, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 260;
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  // ---- Build the Strip ----
  const strip = buildStrip(b, DEUCE_STOPS);
  buildWestSide(b);
  buildEastSide(b);
  buildFoodAndShops(b);
  buildBackdrop(b);
  const baked = bakeStatic(b.root, 64, new Set<THREE.Material>(b.nightMaterials.map((n) => n.mat)));
  // Distance culling for a 1.8 km Strip: small clutter fades out past ~380 m, towers past ~650 m.
  const cullables: Array<{ m: THREE.Object3D; c: THREE.Vector3; r: number }> = [];
  b.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.updateWorldMatrix(true, false);
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    const bs = m.geometry.boundingSphere!;
    const c = bs.center.clone().applyMatrix4(m.matrixWorld);
    const r = bs.radius * m.matrixWorld.getMaxScaleOnAxis();
    if (r > 140) return; // mountains, freeway, ground planes: always drawn
    cullables.push({ m, c, r });
  });
  let cullTimer = 0;

  // ---- Time of day ----
  let timePreset: TimePreset = 'day';
  let phase = 0.28;
  const presetPhase = (p: TimePreset) => (p === 'day' ? 0.28 : p === 'sunset' ? 0.52 : 0.82);
  let night = 0;
  const cTop = new THREE.Color();
  const cHorizon = new THREE.Color();
  const sunDir = new THREE.Vector3();
  const tmpC = new THREE.Color();

  const applyAtmosphere = (focus: THREE.Vector3, t: number) => {
    let day = 0;
    let sunset = 0;
    if (phase < 0.45) day = 1;
    else if (phase < 0.6) {
      const k = (phase - 0.45) / 0.15;
      day = 1 - k;
      sunset = Math.sin(k * Math.PI);
    } else if (phase < 0.9) day = 0;
    else {
      const k = (phase - 0.9) / 0.1;
      day = k;
      sunset = Math.sin(k * Math.PI) * 0.6;
    }
    night = 1 - day;

    cTop.setHex(0x05060f).lerp(tmpC.setHex(0x2b6fd0), day).lerp(tmpC.setHex(0x3a3470), sunset * 0.8);
    cHorizon.setHex(0x1a1030).lerp(tmpC.setHex(0xbcd8f0), day).lerp(tmpC.setHex(0xff8a4a), sunset);
    // Sun arcs from the east over the Spring Mountains in the west
    const elev = THREE.MathUtils.lerp(-0.25, 0.85, day) + sunset * 0.05;
    sunDir.set(-0.7 + day * 0.3, Math.max(0.05, elev), 0.25).normalize();
    sky.set(cTop, cHorizon, sunDir, tmpC.setHex(0xfff2d0).lerp(new THREE.Color(0xff7a3a), sunset), night, t);
    fog.color.copy(cHorizon).lerp(cTop, 0.15);
    fog.density = THREE.MathUtils.lerp(0.0024, 0.0016, day);

    // At night the Strip lights itself: warm neon bounce from below, violet sky above
    hemi.color.setHex(0x8a8fe0).lerp(tmpC.setHex(0xdff0ff), day).lerp(tmpC.setHex(0xffb58a), sunset);
    hemi.groundColor.setHex(0x7a4a3a).lerp(tmpC.setHex(0x7a6a58), day);
    hemi.intensity = THREE.MathUtils.lerp(1.25, 1.35, day);
    sun.color.setHex(0x9fb4ff).lerp(tmpC.setHex(0xfff4de), day).lerp(tmpC.setHex(0xff924c), sunset);
    sun.intensity = THREE.MathUtils.lerp(0.55, 2.6, day);
    // Shadow frustum follows the cat so shadows stay crisp across a 700 m map
    sun.position.copy(focus).addScaledVector(sunDir, 120);
    sun.target.position.copy(focus);

    for (const nm of b.nightMaterials) nm.mat.emissiveIntensity = THREE.MathUtils.lerp(nm.day, nm.night, night);
    for (const l of b.lights) l.light.intensity = THREE.MathUtils.lerp(l.day, l.night, night);
  };

  const getDaylightLabel = () => (phase < 0.45 ? 'Mojave Day' : phase < 0.62 ? 'Golden Sunset' : phase < 0.9 ? 'Neon Night' : 'Desert Dawn');

  let vipUnlocked = false;
  const unlockVip = () => {
    if (vipUnlocked) return;
    vipUnlocked = true;
    for (const c of b.vipColliders) {
      const i = b.colliders.indexOf(c);
      if (i >= 0) b.colliders.splice(i, 1);
    }
  };

  const update = (dt: number, elapsed: number, focus: THREE.Vector3, camera: THREE.Camera) => {
    if (timePreset === 'auto') phase = (phase + dt * 0.006) % 1; // ~2.8 min per full day
    applyAtmosphere(focus, elapsed);
    sky.follow(camera);
    cullTimer -= dt;
    if (cullTimer <= 0) {
      cullTimer = 0.25;
      const cam = camera.position;
      const far = night > 0.5 ? 0.85 : 1;
      for (const k of cullables) {
        const limit = (k.r > 18 ? 650 : 380) * far;
        k.m.visible = cam.distanceTo(k.c) - k.r < limit;
      }
    }
    for (const fn of b.updaters) fn(dt, elapsed, night);
    for (const p of b.cigPickups) {
      if (p.stolenCooldown > 0) {
        p.stolenCooldown = Math.max(0, p.stolenCooldown - dt);
        if (p.stolenCooldown === 0) p.mesh.visible = true;
      } else {
        p.mesh.rotation.y = elapsed * 1.8 + p.id;
        p.mesh.position.y = p.position.y + Math.sin(elapsed * 2.6 + p.id) * 0.08;
      }
    }
  };

  applyAtmosphere(new THREE.Vector3(), 0);

  return {
    colliders: b.colliders,
    cigPickups: b.cigPickups,
    gamblingSpots: b.gamblingSpots,
    shopSpots: b.shopSpots,
    rideables: b.rideables,
    waterZones: b.waterZones,
    mapFeatures: b.mapFeatures,
    staticMarkers: b.staticMarkers,
    crowd: b.crowd,
    props: b.props,
    restaurants: b.restaurants,
    deuceBuses: strip.buses,
    deuceStops: DEUCE_STOPS,
    trafficVehicles: strip.cars,
    spawn: new THREE.Vector3(0, 1, 936),
    spawnYaw: Math.PI,
    resetPoint: new THREE.Vector3(-15, 0.2, 40),
    sun,
    stats: { meshesBefore: baked.before, meshesAfter: baked.after },
    setTimePreset: (p) => {
      timePreset = p;
      if (p !== 'auto') phase = presetPhase(p);
    },
    getTimePreset: () => timePreset,
    getDaylightLabel,
    getNight: () => night,
    getZoneName: (x, z) => b.zoneAt(x, z),
    unlockVip,
    update,
  };
}
