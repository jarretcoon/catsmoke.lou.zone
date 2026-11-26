import * as THREE from 'three';
import type { WorldBuilder } from './builder';
import { mat } from './props';
import { fitFont, letterFace, part, placed } from './signKit';
import { STRIP } from './strip';

/**
 * Rideshare pickup zones. On the real Strip the resorts keep Uber / Lyft (and now Waymo) off the Boulevard
 * curb: you follow "Rideshare Pickup" signs to the side or the back of the property. Here they sit on the
 * cross streets beside the resorts, on the curb whose lane runs back toward the Strip, so a ride can pull
 * out and turn straight onto the Boulevard. Each zone has the resort's RIDESHARE PICKUP sign (Uber, Lyft)
 * and, a few metres up the curb, Waymo's own pickup flag.
 *
 * Where a resort's porte-cochère drive opens straight off the Boulevard (Bellagio Dr, Encore's drive), rides
 * also pick up there, as they do for real: the car comes round from the valet loop at the back of the drive,
 * stops at the curb facing the Strip and leaves with a right turn onto the Boulevard (a left too where the
 * drive is signalised with a cut in the median, like Bellagio Dr).
 */
export interface RideshareSpot {
  id: string;
  /** Resort and street, as the app shows it. */
  name: string;
  /** Centre line (z) of the cross street. */
  zc: number;
  /** Travel direction of the curb lane (+1 = east). Always toward the Strip. */
  dir: 1 | -1;
  /** The Uber / Lyft stop (x); Waymo stops `WAYMO_UPSTREAM` metres before it, by its flag. */
  x: number;
  /** Half width of the street (the curb line). */
  half: number;
  /** Lane offset the cars drive in, and where they stop against the curb. */
  driveOff: number;
  curbOff: number;
  /** Street extent (x), for the approaching car. */
  x0: number;
  x1: number;
  /** A porte-cochère drive off the Boulevard (a dead end: the car comes from its far end), not a street. */
  drive?: boolean;
  /** No cut in the median at the mouth: leaving, the car may only turn right onto the Boulevard. */
  rightOut?: boolean;
  /** Signs this far from the centre line (default: on the sidewalk, half + 1.1). */
  signOff?: number;
}

export const WAYMO_UPSTREAM = 9;

const FLAMINGO = { half: STRIP.flamingoHalf, driveOff: STRIP.laneCenters[1], curbOff: STRIP.flamingoHalf - 1.4 };
/** Side-street stubs are 14 m wide; cars keep near the centre so left turns clear the median cut. */
const STUB = { half: 7, driveOff: 3.5, curbOff: 5.6 };
const WEST = { x0: STRIP.flamingoWest + 4, x1: -STRIP.curb - 1 };
const EAST = { x0: STRIP.curb + 1, x1: STRIP.flamingoEast - 4 };

export const RIDESHARE_SPOTS: RideshareSpot[] = [
  { id: 'circus', name: 'Circus Circus · Circus Circus Dr', zc: -797, dir: 1, x: -54, ...STUB, ...WEST },
  { id: 'ti', name: 'Treasure Island · Spring Mountain Rd', zc: -407, dir: 1, x: -52, ...STUB, ...WEST },
  { id: 'palazzo', name: 'The Palazzo & Sphere · Sands Ave', zc: -407, dir: -1, x: 58, ...STUB, ...EAST },
  { id: 'bellagio', name: 'Bellagio · Flamingo Rd', zc: 0, dir: 1, x: -60, ...FLAMINGO, ...WEST },
  { id: 'cromwell', name: 'The Cromwell & Flamingo · Flamingo Rd', zc: 0, dir: -1, x: 54, ...FLAMINGO, ...EAST },
  { id: 'excalibur', name: 'Excalibur · Tropicana Ave', zc: STRIP.tropicanaZ, dir: 1, x: -56, ...FLAMINGO, ...WEST },
  { id: 'mgm', name: 'MGM Grand · Tropicana Ave', zc: STRIP.tropicanaZ, dir: -1, x: 58, ...FLAMINGO, ...EAST },
  // Porte-cochère drives. Bellagio Dr (z 101…110, the lobby canopy at x −122): the taxi line holds the inbound
  // lane, so rides use the outbound curb; the signs stand at the drive's edge in front of Via Bellagio.
  { id: 'bellagio-drive', name: 'Bellagio · porte-cochère, Bellagio Dr', zc: 105.5, dir: 1, x: -30, half: 4.5, driveOff: 2.3, curbOff: 2.8, x0: -110, x1: -19, drive: true, signOff: 4.75 },
  // Encore's drive (z −557.5…−548.5, canopy x 33…47): taxis queue on the south side, rides stop in the north lane
  // between the canopy's columns. No median cut here, so right turns out only.
  { id: 'encore-drive', name: 'Encore · porte-cochère', zc: -553, dir: -1, x: 30, half: 4.5, driveOff: 2.3, curbOff: 2.4, x0: 19, x1: 55, drive: true, rightOut: true },
];

/** Where a zone's sign stands (on the sidewalk just past the curb), for the Uber / Lyft sign or the Waymo flag. */
export function spotSign(s: RideshareSpot, service: 'uber' | 'waymo', out = new THREE.Vector3()): THREE.Vector3 {
  const x = service === 'uber' ? s.x + s.dir * 2.5 : s.x - s.dir * (WAYMO_UPSTREAM - 2.5);
  return out.set(x, 0, s.zc + s.dir * (s.signOff ?? s.half + 1.1));
}

/** The resort's sign: navy cabinet, RIDESHARE PICKUP, a car pictogram, Uber • Lyft (drawn, no logos copied). */
function rideshareSign(b: WorldBuilder, resort: string): THREE.Group {
  const g = new THREE.Group();
  const pole = mat(0x8c9196, 0.4, 0.7);
  g.add(part(new THREE.CylinderGeometry(0.05, 0.05, 2.9, 8), pole, 0, 1.45, 0));
  g.add(part(new THREE.BoxGeometry(0.94, 1.18, 0.05), mat(0x0d1a2c, 0.5, 0.3), 0, 2.4, 0));
  g.add(
    placed(
      letterFace(
        b,
        0.88,
        1.12,
        (ctx, w, h) => {
          ctx.fillStyle = '#123a6b';
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(w * 0.04, h * 0.03, w * 0.92, h * 0.012);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          fitFont(ctx, 'RIDESHARE', 'sans', w * 0.86, h * 0.13, 0.04);
          ctx.fillText('RIDESHARE', w / 2, h * 0.13);
          fitFont(ctx, 'PICKUP', 'sans', w * 0.7, h * 0.12, 0.1);
          ctx.fillText('PICKUP', w / 2, h * 0.26);
          // car pictogram (front three-quarter, white)
          const cx = w / 2;
          const cy = h * 0.45;
          const cw = w * 0.5;
          ctx.beginPath();
          ctx.roundRect(cx - cw / 2, cy - h * 0.02, cw, h * 0.09, h * 0.02);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(cx - cw * 0.34, cy);
          ctx.lineTo(cx - cw * 0.22, cy - h * 0.07);
          ctx.lineTo(cx + cw * 0.22, cy - h * 0.07);
          ctx.lineTo(cx + cw * 0.34, cy);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#123a6b';
          for (const sx of [-1, 1]) {
            ctx.beginPath();
            ctx.arc(cx + sx * cw * 0.3, cy + h * 0.075, h * 0.03, 0, Math.PI * 2);
            ctx.fill();
          }
          // service names in their own colours
          ctx.fillStyle = '#000000';
          ctx.fillRect(w * 0.1, h * 0.58, w * 0.38, h * 0.1);
          ctx.fillStyle = '#ff00bf';
          ctx.fillRect(w * 0.52, h * 0.58, w * 0.38, h * 0.1);
          ctx.fillStyle = '#ffffff';
          fitFont(ctx, 'Uber', 'sans', w * 0.3, h * 0.07);
          ctx.fillText('Uber', w * 0.29, h * 0.632);
          fitFont(ctx, 'lyft', 'sans', w * 0.3, h * 0.07);
          ctx.fillText('lyft', w * 0.71, h * 0.632);
          ctx.fillStyle = '#ffd36a';
          fitFont(ctx, resort.toUpperCase(), 'sans', w * 0.9, h * 0.06, 0.03);
          ctx.fillText(resort.toUpperCase(), w / 2, h * 0.79);
          ctx.fillStyle = '#cfe3ff';
          fitFont(ctx, 'WAIT HERE • NO STRIP PICKUPS', 'sans', w * 0.9, h * 0.045, 0.03);
          ctx.fillText('WAIT HERE • NO STRIP PICKUPS', w / 2, h * 0.9);
        },
        0.05,
      ),
      0,
      2.4,
      0,
    ),
  );
  return g;
}

/** Waymo's pickup flag: white blade with the teal-blue W and PICKUP (drawn, no logos copied). */
function waymoFlag(b: WorldBuilder): THREE.Group {
  const g = new THREE.Group();
  g.add(part(new THREE.CylinderGeometry(0.04, 0.04, 2.5, 8), mat(0x2d3238, 0.4, 0.6), 0, 1.25, 0));
  g.add(part(new THREE.BoxGeometry(0.64, 0.84, 0.04), mat(0xdfe4e8, 0.5, 0.2), 0, 2.16, 0));
  g.add(
    placed(
      letterFace(
        b,
        0.6,
        0.8,
        (ctx, w, h) => {
          ctx.fillStyle = '#f6f8f9';
          ctx.fillRect(0, 0, w, h);
          const s = w * 0.5;
          const x = (w - s) / 2;
          const y = h * 0.08;
          const grad = ctx.createLinearGradient(x, y, x + s, y + s);
          grad.addColorStop(0, '#1fd6c4');
          grad.addColorStop(1, '#2f6dff');
          ctx.strokeStyle = grad;
          ctx.lineWidth = s * 0.2;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(x + s * 0.08, y + s * 0.18);
          ctx.lineTo(x + s * 0.3, y + s * 0.82);
          ctx.lineTo(x + s * 0.5, y + s * 0.4);
          ctx.lineTo(x + s * 0.7, y + s * 0.82);
          ctx.lineTo(x + s * 0.92, y + s * 0.18);
          ctx.stroke();
          ctx.fillStyle = '#3c4650';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          fitFont(ctx, 'waymo', 'sans', w * 0.8, h * 0.13);
          ctx.fillText('waymo', w / 2, h * 0.6);
          ctx.fillStyle = '#1b7f74';
          fitFont(ctx, 'PICKUP', 'sans', w * 0.7, h * 0.09, 0.12);
          ctx.fillText('PICKUP', w / 2, h * 0.76);
          ctx.fillStyle = '#6b7884';
          fitFont(ctx, 'rider-only rides', 'sans', w * 0.8, h * 0.055);
          ctx.fillText('rider-only rides', w / 2, h * 0.89);
        },
        0.04,
      ),
      0,
      2.16,
      0,
    ),
  );
  return g;
}

/** Signs (and a minimap marker) at every pickup zone. Faces run along the street, so they read from the sidewalk. */
export function buildRideshareSigns(b: WorldBuilder): void {
  const p = new THREE.Vector3();
  for (const s of RIDESHARE_SPOTS) {
    const resort = s.name.split(' · ')[0];
    spotSign(s, 'uber', p);
    b.add(rideshareSign(b, resort), p.x, 0, p.z, Math.PI / 2);
    b.collider(p.x - 0.12, p.x + 0.12, p.z - 0.12, p.z + 0.12, 0, 3, true);
    spotSign(s, 'waymo', p);
    b.add(waymoFlag(b), p.x, 0, p.z, Math.PI / 2);
    b.collider(p.x - 0.1, p.x + 0.1, p.z - 0.1, p.z + 0.1, 0, 2.6, true);
    b.staticMarkers.push({ x: s.x, z: s.zc + s.dir * (s.half + 1.1), color: '#2fd8ff', glyph: 'R', size: 2.4 });
  }
}
