import * as THREE from 'three';

export type RideKind = 'deuce' | 'highroller' | 'gondola' | 'elevator' | 'tram' | 'monorail' | 'coaster' | 'seat';

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
  /** Live status line while riding (e.g. the next Deuce stop). */
  status?(): string;
  /**
   * Optional camera framing while riding: the orbit yaw/pitch/dist around the cat the camera eases to
   * (pitch may be negative to look up from below), and an optional world point to look at instead of the cat.
   * Mouse-drag still overrides it while the button is held.
   */
  view?(): { yaw: number; pitch: number; dist: number; look?: THREE.Vector3 } | null;
}
