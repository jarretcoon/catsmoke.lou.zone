import * as THREE from 'three';

export type RideKind = 'deuce' | 'highroller' | 'gondola' | 'elevator' | 'tram' | 'monorail' | 'coaster' | 'seat' | 'rideshare';

/** Anything the cat can hop on with [G]. */
export interface Rideable {
  id: string;
  kind: RideKind;
  label: string;
  /** Distance from boardPoint within which [G] boards. */
  boardRadius: number;
  boardPoint(out: THREE.Vector3): THREE.Vector3;
  /** Where the cat sits while riding (world space). */
  seat(out: THREE.Vector3): THREE.Vector3;
  /** Yaw the cat should face while riding. */
  yaw(): number;
  /** Where the cat lands when it hops off. */
  exitPoint(out: THREE.Vector3): THREE.Vector3;
  /** Called when boarding; return false to refuse (with a reason toast). */
  canBoard(): { ok: boolean; reason?: string };
  onBoard?(): void;
  onExit?(): void;
  /** Set by the ride when it wants to drop the cat off by itself (end of a loop). */
  wantsExit?(): boolean;
  boardPrompt: string;
  ridingPrompt: string;
  /** What the toast says when the cat gets out (read after onExit; e.g. the fare). */
  exitMessage?(): string | undefined;
  /** Live status line while riding (e.g. the next Deuce stop). */
  status?(): string;
  /**
   * Optional camera framing while riding: the orbit yaw/pitch/dist around the cat the camera eases to
   * (pitch may be negative to look up from below), and an optional world point to look at instead of the cat.
   * Mouse-drag still overrides it while the button is held.
   */
  view?(): RideView | null;
}

export interface RideView {
  yaw: number;
  pitch: number;
  dist: number;
  /** World point to look at instead of the cat. */
  look?: THREE.Vector3;
  /** Skip the camera's wall test: the shot is placed by hand (a seat among other seats, say). */
  free?: boolean;
  /** Vertical field of view for this shot, in degrees (eased in, and back out after). */
  fov?: number;
  /** What the rider is watching: Lou's glances go there (the show, from a Sphere seat). */
  focus?: THREE.Vector3;
}

let baseFov = 0;
let inLens = false;
/**
 * Eases the camera's field of view to a ride view's lens and back to the usual one afterwards. Outside a
 * ride view it leaves the camera alone, so a field-of-view setting elsewhere keeps working.
 */
export function rideLens(camera: THREE.PerspectiveCamera, fov: number | undefined, dt: number): void {
  if (fov === undefined && !inLens) {
    baseFov = camera.fov;
    return;
  }
  if (fov !== undefined && !inLens) {
    baseFov = camera.fov;
    inLens = true;
  }
  const want = fov ?? baseFov;
  const d = want - camera.fov;
  if (Math.abs(d) < 0.05) {
    camera.fov = want;
    if (fov === undefined) inLens = false;
  } else camera.fov += d * Math.min(1, dt * 3);
  camera.updateProjectionMatrix();
}
