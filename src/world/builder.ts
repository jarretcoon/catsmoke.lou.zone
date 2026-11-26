import * as THREE from 'three';
import type { MapFeature, MapMarker } from '../minimap';
import type { CrowdConfig } from '../npcs';
import type { Rideable } from '../rides';
import type { RestaurantDef } from './food';
import { bakeGroup } from '../meshBake';
import { cigPack, mesh } from './props';

export interface PlatformBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  topY: number;
  isWall?: boolean;
}

export type GameType = 'slots' | 'roulette' | 'blackjack' | 'craps';

export interface GamblingSpot {
  id: string;
  casinoName: string;
  gameType: GameType;
  position: THREE.Vector3;
  label: string;
  vipOnly?: boolean;
}

export interface CigPickup {
  id: number;
  mesh: THREE.Group;
  position: THREE.Vector3;
  amount: number;
  label: string;
  insideCasino: boolean;
  stolenCooldown: number;
}

export type ShopKind = 'abc' | 'boutique' | 'vip-host' | 'bar';
export interface ShopSpot {
  kind: ShopKind;
  position: THREE.Vector3;
  radius: number;
  label: string;
}

export interface Zone {
  name: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  area: number;
}

export interface NightMaterial {
  mat: THREE.MeshStandardMaterial;
  day: number;
  night: number;
}

export interface LightAnchor {
  light: THREE.PointLight;
  day: number;
  night: number;
}

/**
 * Where the camera and the cat are, refreshed every frame just before the `every(...)` updaters run.
 * Use it to hide interiors and dynamic dressing nobody can see (things added straight to `b.scene`
 * are never culled by the world). `zone` is the cat's current zone name.
 */
export const viewer = { cam: new THREE.Vector3(), cat: new THREE.Vector3(), zone: '' };

/** Zone names that count as indoors: police lose sight of Lou, and the lighting adapts to the room. */
export const INDOOR_ZONE = /Casino|Lounge|Chandelier|ABC Stores|Conservatory|Forum Shops|Lobby|Shoppes|Atrium/;

/** Shared state every district writes into while the world is assembled. */
export class WorldBuilder {
  readonly root = new THREE.Group();
  readonly colliders: PlatformBox[] = [];
  readonly gamblingSpots: GamblingSpot[] = [];
  readonly cigPickups: CigPickup[] = [];
  readonly shopSpots: ShopSpot[] = [];
  readonly zones: Zone[] = [];
  readonly mapFeatures: MapFeature[] = [];
  readonly staticMarkers: MapMarker[] = [];
  readonly nightMaterials: NightMaterial[] = [];
  readonly lights: LightAnchor[] = [];
  readonly rideables: Rideable[] = [];
  readonly updaters: Array<(dt: number, t: number, night: number) => void> = [];
  readonly crowd: CrowdConfig = { tourists: [], performers: [], guards: [] };
  /** Water the cat refuses to swim in (it gets bounced back to the edge with a splash). */
  readonly waterZones: Array<{ name: string; minX: number; maxX: number; minZ: number; maxZ: number; y: number }> = [];
  /** In-N-Outs and the Whataburger (restaurant gameplay). */
  readonly restaurants: RestaurantDef[] = [];
  /** Knockable street props (trash cans, urns, newsracks, cones…) simulated by PropPhysics. */
  readonly props: Array<{ obj: THREE.Object3D; r: number; h: number; kind: string }> = [];
  /** Colliders that disappear when the player earns VIP. */
  readonly vipColliders: PlatformBox[] = [];

  constructor(readonly scene: THREE.Scene) {
    scene.add(this.root);
  }

  add<T extends THREE.Object3D>(obj: T, x?: number, y?: number, z?: number, rotY?: number): T {
    if (x !== undefined) obj.position.set(x, y ?? 0, z ?? 0);
    if (rotY !== undefined) obj.rotation.y = rotY;
    this.root.add(obj);
    return obj;
  }

  collider(minX: number, maxX: number, minZ: number, maxZ: number, minY: number, topY: number, isWall = false): PlatformBox {
    const c = { minX, maxX, minZ, maxZ, minY, topY, isWall };
    this.colliders.push(c);
    return c;
  }

  /** A physics prop: lives outside the static batch so it can be knocked over. */
  prop(obj: THREE.Object3D, x: number, z: number, r: number, h: number, kind: string, rotY = 0, y = 0): THREE.Object3D {
    obj.position.set(x, y, z);
    obj.rotation.y = rotY;
    this.scene.add(obj);
    this.props.push({ obj, r, h, kind });
    return obj;
  }

  /** Solid box mesh + matching collider (y = bottom). */
  box(x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material, isWall = false, cast = true): THREE.Mesh {
    const m = mesh(new THREE.BoxGeometry(w, h, d), material, x, y + h / 2, z, cast && h < 30);
    this.root.add(m);
    this.collider(x - w / 2, x + w / 2, z - d / 2, z + d / 2, y, y + h, isWall);
    return m;
  }

  /** Thin floor plane (no collider). */
  floor(x: number, z: number, w: number, d: number, material: THREE.Material, y = 0.02): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    this.root.add(m);
    return m;
  }

  zone(name: string, minX: number, maxX: number, minZ: number, maxZ: number): void {
    this.zones.push({ name, minX, maxX, minZ, maxZ, area: (maxX - minX) * (maxZ - minZ) });
  }

  feature(f: MapFeature): void {
    this.mapFeatures.push(f);
  }

  /** A building on the minimap + optional label. */
  building(x: number, z: number, w: number, d: number, color: string, label?: string): void {
    this.mapFeatures.push({ kind: 'building', x, z, w, d, color, label });
  }

  pickup(x: number, y: number, z: number, amount: number, label: string, inside: boolean): void {
    const g = cigPack();
    bakeGroup(g);
    g.position.set(x, y, z);
    this.scene.add(g);
    this.cigPickups.push({ id: this.cigPickups.length, mesh: g, position: new THREE.Vector3(x, y, z), amount, label, insideCasino: inside, stolenCooldown: 0 });
  }

  light(color: number, intensity: number, distance: number, x: number, y: number, z: number, dayScale = 1): THREE.PointLight {
    const l = new THREE.PointLight(color, intensity, distance, 1.3);
    l.position.set(x, y, z);
    this.scene.add(l);
    this.lights.push({ light: l, day: intensity * dayScale, night: intensity });
    return l;
  }

  nightGlow(m: THREE.MeshStandardMaterial, day: number, night: number): THREE.MeshStandardMaterial {
    this.nightMaterials.push({ mat: m, day, night });
    return m;
  }

  every(fn: (dt: number, t: number, night: number) => void): void {
    this.updaters.push(fn);
  }

  zoneAt(x: number, z: number): string {
    let best: Zone | null = null;
    for (const zn of this.zones) {
      if (x < zn.minX || x > zn.maxX || z < zn.minZ || z > zn.maxZ) continue;
      if (!best || zn.area < best.area) best = zn;
    }
    return best ? best.name : 'Las Vegas Boulevard';
  }
}
