import * as THREE from 'three';

export type RideKind = 'deuce' | 'highroller' | 'gondola' | 'elevator';

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
}
