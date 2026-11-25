import * as THREE from 'three';

export interface PlatformBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  topY: number;
  isWall?: boolean;
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

export interface GamblingSpot {
  id: string;
  casinoName: 'Bellagio' | 'Paris Las Vegas' | 'Flamingo';
  gameType: 'slots' | 'roulette';
  position: THREE.Vector3;
  label: string;
}

export interface DeuceBus {
  id: number;
  mesh: THREE.Group;
  laneX: number;
  dir: 1 | -1;
  speed: number;
  stopTimer: number;
  lastStopIdx: number;
  wheels: THREE.Mesh[];
  deckOffset: THREE.Vector3;
}

export interface TrafficVehicle {
  mesh: THREE.Group;
  laneX: number;
  dir: 1 | -1;
  speed: number;
  halfLen: number;
}

export type TimePreset = 'day' | 'sunset' | 'night' | 'auto';

export interface VegasWorldContext {
  colliders: PlatformBox[];
  cigPickups: CigPickup[];
  gamblingSpots: GamblingSpot[];
  abcShopSpot: THREE.Vector3;
  deuceBuses: DeuceBus[];
  trafficVehicles: TrafficVehicle[];
  setTimePreset: (preset: TimePreset) => void;
  getTimePreset: () => TimePreset;
  getDaylightLabel: () => string;
  getZoneName: (x: number, z: number) => string;
  update: (dt: number, elapsed: number) => void;
}

function makeAsphaltTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#1b1d26';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 3200; i++) {
      const v = 22 + ((i * 37) % 24);
      ctx.fillStyle = `rgb(${v},${v},${v + 4})`;
      ctx.fillRect((i * 73) % 512, (i * 139) % 512, 2, 2);
    }
    ctx.fillStyle = '#e8c44a';
    ctx.fillRect(249, 0, 4, 512);
    ctx.fillRect(259, 0, 4, 512);
    ctx.fillStyle = 'rgba(244, 246, 255, 0.82)';
    for (let y = 0; y < 512; y += 64) {
      ctx.fillRect(126, y + 8, 5, 34);
      ctx.fillRect(382, y + 8, 5, 34);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 22);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSidewalkTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#383b48';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#282b34';
    ctx.lineWidth = 2;
    for (let x = 0; x <= 256; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }
    for (let y = 0; y <= 256; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(44, 62);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeHotelFacadeTexture(
  wallHex: string,
  pilasterHex: string,
  winLitHex: string,
  cols = 14,
  rows = 20
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = wallHex;
    ctx.fillRect(0, 0, 512, 512);
    const cw = 512 / cols;
    const rh = 512 / rows;
    for (let col = 0; col < cols; col++) {
      ctx.fillStyle = pilasterHex;
      ctx.fillRect(col * cw, 0, 4, 512);
      for (let row = 0; row < rows; row++) {
        const lit = (col * 17 + row * 31) % 11 > 3;
        ctx.fillStyle = lit ? winLitHex : '#202636';
        ctx.fillRect(col * cw + 7, row * rh + 5, cw - 12, rh - 9);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeCarpetTexture(primary: string, accent: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = primary;
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    for (let x = 0; x <= 256; x += 64) {
      for (let y = 0; y <= 256; y += 64) {
        ctx.beginPath();
        ctx.arc(x, y, 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeRect(x + 18, y + 18, 28, 28);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(7, 10);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBalloonTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    const colors = ['#d63232', '#f7e5b7', '#20458c', '#f2b830'];
    const stripes = 12;
    const sw = 512 / stripes;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(i * sw, 0, sw + 1, 256);
    }
    ctx.fillStyle = '#f5ca56';
    ctx.fillRect(0, 108, 512, 34);
    ctx.fillStyle = '#182442';
    ctx.font = 'bold 24px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PARIS  •  LAS VEGAS  •  PARIS  •  LAS VEGAS', 256, 125);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeNeonSignMesh(
  text: string,
  bg: string,
  fg: string,
  width = 8,
  height = 1.9,
  subtext?: string
): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 160;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 640, 160);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, 624, 144);
    ctx.fillStyle = fg;
    ctx.font = 'bold 62px Georgia, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = fg;
    ctx.shadowBlur = 20;
    ctx.fillText(text, 320, subtext ? 62 : 82);
    if (subtext) {
      ctx.font = 'bold 26px system-ui, sans-serif';
      ctx.fillText(subtext, 320, 122);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.BoxGeometry(width, height, 0.28),
    new THREE.MeshBasicMaterial({ map: tex })
  );
}

function makeSlotScreenTexture(accentHex: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0c1020';
    ctx.fillRect(0, 0, 128, 96);
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, 122, 90);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(14, 24, 28, 48);
    ctx.fillRect(50, 24, 28, 48);
    ctx.fillRect(86, 24, 28, 48);
    ctx.fillStyle = accentHex;
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('7', 28, 57);
    ctx.fillText('7', 64, 57);
    ctx.fillText('7', 100, 57);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createCigPackMesh(): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.34, 0.11),
    new THREE.MeshStandardMaterial({
      color: 0xd9362b,
      emissive: 0xff6224,
      emissiveIntensity: 0.45,
      roughness: 0.35,
    })
  );
  g.add(box);

  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.25, 0.10, 0.115),
    new THREE.MeshStandardMaterial({ color: 0xf7efe0, roughness: 0.4 })
  );
  stripe.position.y = 0.08;
  g.add(stripe);

  const cigMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  const tipMat = new THREE.MeshStandardMaterial({ color: 0xc97b32, roughness: 0.7 });
  for (const ox of [-0.04, 0.04]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 8), cigMat);
    c.position.set(ox, 0.21, 0);
    g.add(c);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.0185, 0.0185, 0.04, 8), tipMat);
    t.position.set(ox, 0.26, 0);
    g.add(t);
  }

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.24, 0.33, 20),
    new THREE.MeshBasicMaterial({ color: 0xffb347, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.16;
  g.add(ring);

  return g;
}

function createSlotMachine(accentHex: string, topperHex: number): THREE.Group {
  const g = new THREE.Group();
  const cabinet = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 2.05, 0.95),
    new THREE.MeshStandardMaterial({ color: 0x222638, roughness: 0.32, metalness: 0.6 })
  );
  cabinet.position.y = 1.025;
  cabinet.castShadow = true;
  g.add(cabinet);

  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(1.20, 0.10, 1.0),
    new THREE.MeshStandardMaterial({ color: 0xf0be4d, metalness: 0.85, roughness: 0.25 })
  );
  trim.position.y = 0.9;
  g.add(trim);

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.92, 0.68),
    new THREE.MeshBasicMaterial({ map: makeSlotScreenTexture(accentHex) })
  );
  screen.position.set(0, 1.38, 0.485);
  g.add(screen);

  const topper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.40, 0.32, 16),
    new THREE.MeshBasicMaterial({ color: topperHex })
  );
  topper.position.set(0, 2.2, 0);
  g.add(topper);

  const lever = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.68, 8),
    new THREE.MeshStandardMaterial({ color: 0xd8dce8, metalness: 0.85, roughness: 0.2 })
  );
  lever.position.set(0.65, 1.32, 0.12);
  lever.rotation.x = 0.25;
  g.add(lever);

  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xff2b4e, roughness: 0.2 })
  );
  knob.position.set(0.65, 1.66, 0.21);
  g.add(knob);

  return g;
}

function createCasinoTable(feltHex: number): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.88, 1.15, 0.92, 16),
    new THREE.MeshStandardMaterial({ color: 0x3b2116, roughness: 0.5 })
  );
  base.position.y = 0.46;
  base.castShadow = true;
  g.add(base);

  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(1.78, 1.78, 0.16, 24),
    new THREE.MeshStandardMaterial({ color: 0x4b1c12, roughness: 0.35 })
  );
  rim.position.y = 0.96;
  rim.castShadow = true;
  g.add(rim);

  const felt = new THREE.Mesh(
    new THREE.CylinderGeometry(1.54, 1.54, 0.18, 24),
    new THREE.MeshStandardMaterial({ color: feltHex, roughness: 0.85 })
  );
  felt.position.y = 0.97;
  g.add(felt);

  const wheel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.48, 0.12, 18),
    new THREE.MeshStandardMaterial({ color: 0x1a1412, roughness: 0.3, metalness: 0.4 })
  );
  wheel.position.set(-0.55, 1.1, 0);
  g.add(wheel);

  const turret = new THREE.Mesh(
    new THREE.ConeGeometry(0.14, 0.22, 10),
    new THREE.MeshStandardMaterial({ color: 0xf4c44e, metalness: 0.9, roughness: 0.2 })
  );
  turret.position.set(-0.55, 1.22, 0);
  g.add(turret);

  for (const [cx, cz, col] of [
    [0.5, 0.4, 0xe83b4d],
    [0.65, -0.2, 0x3482f6],
    [0.45, -0.5, 0xf2c23a],
  ]) {
    const stack = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.16, 10),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.4 })
    );
    stack.position.set(cx, 1.12, cz);
    g.add(stack);
  }
  return g;
}

function createPalmTree(pinkNeon = false): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.28, 6.2, 8),
    new THREE.MeshStandardMaterial({ color: 0x5c422c, roughness: 0.9 })
  );
  trunk.position.y = 3.1;
  trunk.castShadow = true;
  g.add(trunk);

  const frondMat = pinkNeon
    ? new THREE.MeshStandardMaterial({
        color: 0xff5eb8,
        emissive: 0xff2b9e,
        emissiveIntensity: 0.75,
        roughness: 0.55,
      })
    : new THREE.MeshStandardMaterial({
        color: 0x26753c,
        emissive: 0x0a2e14,
        emissiveIntensity: 0.25,
        roughness: 0.75,
      });

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.52, 2.7, 5), frondMat);
    frond.position.set(Math.cos(a) * 1.15, 6.25, Math.sin(a) * 1.15);
    frond.rotation.z = -Math.cos(a) * 1.18;
    frond.rotation.x = Math.sin(a) * 1.18;
    g.add(frond);
  }
  return g;
}

function createCypressTree(): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.18, 1.6, 6),
    new THREE.MeshStandardMaterial({ color: 0x453020, roughness: 0.9 })
  );
  trunk.position.y = 0.8;
  g.add(trunk);

  const foliage = new THREE.Mesh(
    new THREE.ConeGeometry(0.75, 5.4, 8),
    new THREE.MeshStandardMaterial({ color: 0x1a4229, roughness: 0.88 })
  );
  foliage.position.y = 3.8;
  foliage.castShadow = true;
  g.add(foliage);
  return g;
}

function createFlamingoBird(phase: number): THREE.Group {
  const g = new THREE.Group();
  const pink = new THREE.MeshStandardMaterial({ color: 0xff62a8, roughness: 0.42 });
  const beakMat = new THREE.MeshStandardMaterial({ color: 0x18181f, roughness: 0.5 });
  const legMat = new THREE.MeshStandardMaterial({ color: 0xff9b85, roughness: 0.6 });

  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.66, 6), legMat);
  leg.position.y = 0.33;
  g.add(leg);

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), pink);
  body.scale.set(0.85, 0.85, 1.32);
  body.position.y = 0.69;
  g.add(body);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.50, 8), pink);
  neck.position.set(0, 0.98, 0.14);
  neck.rotation.x = 0.25;
  g.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.082, 8, 8), pink);
  head.position.set(0, 1.22, 0.21);
  g.add(head);

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.11, 6), beakMat);
  beak.rotation.x = Math.PI * 0.72;
  beak.position.set(0, 1.18, 0.29);
  g.add(beak);

  g.rotation.y = phase;
  return g;
}

function createDeuceBus(): { group: THREE.Group; wheels: THREE.Mesh[]; deckOffset: THREE.Vector3 } {
  const g = new THREE.Group();
  const wheels: THREE.Mesh[] = [];

  // Shimmering Metallic Gold RTC "The Deuce" Double-Decker Bus (Alexander Dennis Enviro500)
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xd9a738,
    roughness: 0.26,
    metalness: 0.78,
  });
  const darkTrimMat = new THREE.MeshStandardMaterial({ color: 0x191d28, roughness: 0.4 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x1a2c44,
    roughness: 0.1,
    metalness: 0.65,
    transparent: true,
    opacity: 0.62,
  });

  // Lower Deck Hull
  const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(2.55, 1.95, 11.4), goldMat);
  lowerHull.position.y = 1.35;
  lowerHull.castShadow = true;
  g.add(lowerHull);

  // Lower Deck Windows
  const lowerWin = new THREE.Mesh(new THREE.BoxGeometry(2.60, 0.95, 9.8), glassMat);
  lowerWin.position.y = 1.65;
  g.add(lowerWin);

  // Upper Deck Side Walls & Floor (with open panoramic front/roof skylight view so cat rides cleanly!)
  const upperFloor = new THREE.Mesh(new THREE.BoxGeometry(2.52, 0.2, 11.2), darkTrimMat);
  upperFloor.position.y = 2.42;
  g.add(upperFloor);

  // Upper deck seats (rows of blue transit seats!)
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x1c458c, roughness: 0.7 });
  for (let sz = -4.2; sz <= 4.2; sz += 1.4) {
    for (const sx of [-0.68, 0.68]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.62, 0.55), seatMat);
      seat.position.set(sx, 2.82, sz);
      g.add(seat);
    }
  }

  // Upper Deck Panoramic Glass Surround + Open Skylight Roof Rim
  const upperGlassSide = new THREE.Mesh(new THREE.BoxGeometry(2.56, 1.15, 11.1), glassMat);
  upperGlassSide.position.y = 3.1;
  g.add(upperGlassSide);

  const roofRim = new THREE.Mesh(new THREE.BoxGeometry(2.60, 0.22, 11.4), goldMat);
  roofRim.position.y = 3.85;
  g.add(roofRim);

  // Glowing LED Header Signs ("THE DEUCE • STRIP")
  const frontMarquee = makeNeonSignMesh('THE DEUCE', '#0a1222', '#ffcb47', 2.2, 0.58, 'LAS VEGAS STRIP');
  frontMarquee.position.set(0, 3.85, 5.75);
  g.add(frontMarquee);

  const sideBanner = makeNeonSignMesh('THE DEUCE', '#1c1406', '#ffe066', 4.8, 0.62, 'DOUBLE DECKER');
  sideBanner.rotation.y = Math.PI / 2;
  sideBanner.position.set(1.31, 2.35, 0);
  g.add(sideBanner);
  const sideBannerL = sideBanner.clone();
  sideBannerL.rotation.y = -Math.PI / 2;
  sideBannerL.position.set(-1.31, 2.35, 0);
  g.add(sideBannerL);

  // 3 Axles (6 detailed wheels!)
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x111216, roughness: 0.85 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xd8dce8, metalness: 0.85, roughness: 0.25 });
  for (const wz of [3.7, -2.6, -4.1]) {
    for (const wx of [-1.24, 1.24]) {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.34, 14), tireMat);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(wx, 0.46, wz);
      g.add(tire);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.36, 10), rimMat);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(wx, 0.46, wz);
      g.add(hub);
      wheels.push(tire);
    }
  }

  // Headlights & Taillights
  const hlMat = new THREE.MeshBasicMaterial({ color: 0xfff6cf });
  const tlMat = new THREE.MeshBasicMaterial({ color: 0xff2233 });
  for (const hx of [-0.85, 0.85]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.20, 0.08), hlMat);
    hl.position.set(hx, 0.72, 5.74);
    g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.24, 0.08), tlMat);
    tl.position.set(hx, 0.85, -5.74);
    g.add(tl);
  }

  // Cat rides on the front panoramic upper-deck observation perch (y = 3.96) for awesome 360 views!
  return { group: g, wheels, deckOffset: new THREE.Vector3(0, 3.96, 3.6) };
}

function createSphereCanvasTexture(isDay: boolean): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture } {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (isDay) {
    ctx.fillStyle = '#5c6370';
    ctx.fillRect(0, 0, 512, 256);
  }
  return { canvas: c, ctx, tex };
}

export function buildVegasStripWorld(scene: THREE.Scene): VegasWorldContext {
  const colliders: PlatformBox[] = [];
  const cigPickups: CigPickup[] = [];
  const gamblingSpots: GamblingSpot[] = [];
  const deuceBuses: DeuceBus[] = [];
  const trafficVehicles: TrafficVehicle[] = [];
  const lampLights: THREE.PointLight[] = [];

  // Lighting & Atmosphere
  const skyColor = new THREE.Color(0x070917);
  scene.background = skyColor;
  const fog = new THREE.FogExp2(0x070917, 0.0052);
  scene.fog = fog;

  const ambientLight = new THREE.HemisphereLight(0x7c92d6, 0x201828, 0.85);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xbcd2ff, 1.25);
  sunLight.position.set(36, 56, 24);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 2;
  sunLight.shadow.camera.far = 200;
  sunLight.shadow.camera.left = -95;
  sunLight.shadow.camera.right = 95;
  sunLight.shadow.camera.top = 95;
  sunLight.shadow.camera.bottom = -95;
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight);

  // Distant Mojave Desert Mountain Ring on the Horizon!
  const mountainMat = new THREE.MeshStandardMaterial({ color: 0x3b3145, roughness: 0.95 });
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const dist = 135 + (i % 3) * 14;
    const m = new THREE.Mesh(new THREE.ConeGeometry(28 + (i % 4) * 8, 28 + (i % 5) * 9, 5), mountainMat);
    m.position.set(Math.cos(a) * dist, 11, Math.sin(a) * dist);
    scene.add(m);
  }

  const addBox = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    isWall = false,
    receiveShadow = true
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y + h * 0.5, z);
    mesh.castShadow = !isWall || h < 18;
    mesh.receiveShadow = receiveShadow;
    scene.add(mesh);
    colliders.push({
      minX: x - w * 0.5,
      maxX: x + w * 0.5,
      minZ: z - d * 0.5,
      maxZ: z + d * 0.5,
      minY: y,
      topY: y + h,
      isWall,
    });
    return mesh;
  };

  // --- 1. EXTENDED LAS VEGAS BLVD GROUND, SIDEWALKS & BOLLARDS (220m Corridor!) ---
  const sidewalkMat = new THREE.MeshStandardMaterial({ map: makeSidewalkTexture(), roughness: 0.78 });
  const plazaBase = new THREE.Mesh(new THREE.PlaneGeometry(210, 240), sidewalkMat);
  plazaBase.rotation.x = -Math.PI / 2;
  plazaBase.receiveShadow = true;
  scene.add(plazaBase);

  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 224),
    new THREE.MeshStandardMaterial({ map: makeAsphaltTexture(), roughness: 0.72 })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.015;
  road.receiveShadow = true;
  scene.add(road);

  // Flamingo Rd Cross Street (z = -4)
  const crossRoad = new THREE.Mesh(
    new THREE.PlaneGeometry(180, 10),
    new THREE.MeshStandardMaterial({ color: 0x181a22, roughness: 0.75 })
  );
  crossRoad.rotation.x = -Math.PI / 2;
  crossRoad.position.set(0, 0.012, -4);
  crossRoad.receiveShadow = true;
  scene.add(crossRoad);

  // Zebra Crosswalks
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xe6e8f0 });
  for (const cz of [-9.5, 1.8]) {
    for (let sx = -7.5; sx <= 7.5; sx += 1.65) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 2.4), stripeMat);
      s.rotation.x = -Math.PI / 2;
      s.position.set(sx, 0.022, cz);
      scene.add(s);
    }
  }

  // Raised Median with Palms
  const medianMat = new THREE.MeshStandardMaterial({ color: 0x3b404f, roughness: 0.8 });
  for (const [mz, len] of [
    [-58, 86],
    [52, 92],
  ]) {
    addBox(0, 0, mz, 1.8, 0.22, len, medianMat);
    for (let pz = mz - len * 0.44; pz <= mz + len * 0.44; pz += 11) {
      const palm = createPalmTree(false);
      palm.position.set(0, 0.22, pz);
      scene.add(palm);
    }
  }

  // Sidewalk Bollards
  const bollardMat = new THREE.MeshStandardMaterial({ color: 0x323746, metalness: 0.6, roughness: 0.35 });
  for (const bx of [-9.5, 9.5]) {
    for (let bz = -98; bz <= 98; bz += 6.0) {
      if (bz > -9 && bz < 2) continue;
      const bol = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.85, 8), bollardMat);
      bol.position.set(bx, 0.425, bz);
      scene.add(bol);
    }
  }

  // Strip Bus Stop Shelters (where Deuce Buses pause!)
  const busStopZs = [72, 26, -28, -78];
  const shelterGlassMat = new THREE.MeshStandardMaterial({
    color: 0x86e0ff,
    transparent: true,
    opacity: 0.4,
    roughness: 0.1,
  });
  for (const side of [-1, 1]) {
    for (const bz of busStopZs) {
      const bx = side * 10.6;
      addBox(bx, 0, bz, 1.5, 0.14, 4.2, medianMat);
      addBox(bx, 2.5, bz, 1.7, 0.15, 4.4, bollardMat);
      addBox(bx + side * 0.72, 0.14, bz, 0.12, 2.36, 4.0, shelterGlassMat, true);
      const busSign = makeNeonSignMesh('DEUCE STOP', '#0f2042', '#ffd24d', 1.8, 0.55);
      busSign.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      busSign.position.set(bx - side * 0.6, 2.9, bz);
      scene.add(busSign);
    }
  }

  // World Outer Boundaries
  const borderMat = new THREE.MeshStandardMaterial({ color: 0x1a1d2b, roughness: 0.9 });
  addBox(0, 0, -108, 200, 4.0, 2, borderMat, true);
  addBox(0, 0, 108, 200, 4.0, 2, borderMat, true);
  addBox(-96, 0, 0, 2, 4.0, 220, borderMat, true);
  addBox(96, 0, 0, 2, 4.0, 220, borderMat, true);

  // Strip Pedestrian Skybridge at Flamingo Rd (z = -11)
  const bridgeDeckMat = new THREE.MeshStandardMaterial({ color: 0x454a5c, roughness: 0.65, metalness: 0.25 });
  const glassRailMat = new THREE.MeshStandardMaterial({
    color: 0x76e0ff,
    transparent: true,
    opacity: 0.38,
    roughness: 0.1,
  });
  addBox(0, 4.1, -11, 28, 0.35, 3.4, bridgeDeckMat);
  addBox(0, 4.45, -12.6, 26, 0.9, 0.16, glassRailMat, true);
  addBox(0, 4.45, -9.4, 26, 0.9, 0.16, glassRailMat, true);
  const bridgeSign = makeNeonSignMesh('LAS VEGAS BLVD', '#0a2416', '#72ffae', 7.2, 1.2, 'FLAMINGO RD');
  bridgeSign.position.set(0, 6.2, -9.3);
  scene.add(bridgeSign);

  for (const side of [-1, 1]) {
    for (let s = 0; s < 8; s++) {
      const stepY = s * 0.52;
      const stepZ = -19.5 + s * 1.1;
      addBox(side * 12.6, 0, stepZ, 2.8, stepY + 0.52, 1.15, bridgeDeckMat);
    }
  }

  // --- 2. BELLAGIO & FOUNTAINS (West Side: z +6 to +55) ---
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xdccab0, roughness: 0.72 });
  const fountainWaterMat = new THREE.MeshStandardMaterial({
    color: 0x0d6b8c,
    emissive: 0x072b42,
    emissiveIntensity: 0.35,
    roughness: 0.06,
    metalness: 0.75,
  });
  const lake = new THREE.Mesh(new THREE.PlaneGeometry(22, 48), fountainWaterMat);
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(-23.5, 0.04, 30);
  scene.add(lake);

  addBox(-12.1, 0, 30, 1.3, 0.55, 49, stoneMat);
  addBox(-34.8, 0, 30, 1.3, 0.55, 49, stoneMat);
  addBox(-23.5, 0, 6.2, 23, 0.55, 1.3, stoneMat);
  addBox(-23.5, 0, 53.8, 23, 0.55, 1.3, stoneMat);

  for (let lz = 8; lz <= 52; lz += 4.4) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.1, 0.38), stoneMat);
    post.position.set(-12.1, 0.9, lz);
    scene.add(post);
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe4a8 })
    );
    globe.position.set(-12.1, 1.55, lz);
    scene.add(globe);
  }
  for (const cz of [8, 16, 44, 52]) {
    const cy = createCypressTree();
    cy.position.set(-13.4, 0, cz);
    scene.add(cy);
  }

  const centerJets: THREE.Mesh[] = [];
  const sideJets: Array<{ mesh: THREE.Mesh; dir: number; idx: number }> = [];
  const jetMat = new THREE.MeshBasicMaterial({ color: 0xd9faff, transparent: true, opacity: 0.78 });
  for (let i = 0; i < 22; i++) {
    const jz = 9.5 + i * 1.95;
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.36, 1.0, 8), jetMat);
    jet.position.set(-23.5, 0.5, jz);
    scene.add(jet);
    centerJets.push(jet);

    if (i % 2 === 0) {
      for (const s of [-1, 1]) {
        const sjet = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.22, 1.0, 7), jetMat);
        sjet.position.set(-23.5 + s * 4.2, 0.5, jz);
        scene.add(sjet);
        sideJets.push({ mesh: sjet, dir: s, idx: i });
      }
    }
  }
  const fountainGlowA = new THREE.PointLight(0x76ecff, 22, 34, 1.3);
  fountainGlowA.position.set(-23.5, 3.5, 22);
  const fountainGlowB = new THREE.PointLight(0xffb86b, 20, 34, 1.3);
  fountainGlowB.position.set(-23.5, 3.5, 38);
  scene.add(fountainGlowA, fountainGlowB);

  const bellagioTowerMat = new THREE.MeshStandardMaterial({
    map: makeHotelFacadeTexture('#b58559', '#d9b58d', '#ffe199', 16, 22),
    roughness: 0.7,
  });
  const bellagioWall = new THREE.MeshStandardMaterial({ color: 0xc99c6d, roughness: 0.75 });
  const bellagioTrim = new THREE.MeshStandardMaterial({ color: 0xebd9bc, roughness: 0.6 });
  const bellagioCarpet = new THREE.MeshStandardMaterial({
    map: makeCarpetTexture('#144734', '#d4a64a'),
    roughness: 0.85,
  });

  const belMainTower = new THREE.Mesh(new THREE.BoxGeometry(10, 40, 22), bellagioTowerMat);
  belMainTower.position.set(-64, 20, 30);
  scene.add(belMainTower);
  for (const [wz, ang] of [
    [13, -0.35],
    [47, 0.35],
  ]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(8, 32, 16), bellagioTowerMat);
    wing.position.set(-61, 16, wz);
    wing.rotation.y = ang;
    scene.add(wing);
  }
  const belCrownSign = makeNeonSignMesh('BELLAGIO', '#1d120a', '#ffd573', 14, 2.4);
  belCrownSign.rotation.y = Math.PI / 2;
  belCrownSign.position.set(-58.6, 36.5, 30);
  scene.add(belCrownSign);

  const belFloor = new THREE.Mesh(new THREE.PlaneGeometry(28, 44), bellagioCarpet);
  belFloor.rotation.x = -Math.PI / 2;
  belFloor.position.set(-51, 0.03, 30);
  belFloor.receiveShadow = true;
  scene.add(belFloor);

  addBox(-64, 0, 30, 4, 24, 46, bellagioWall, true);
  addBox(-51, 0, 53, 28, 16, 3, bellagioWall, true);
  addBox(-51, 0, 7, 28, 16, 3, bellagioWall, true);
  addBox(-37, 0, 14, 2.2, 14, 12, bellagioWall, true);
  addBox(-37, 0, 46, 2.2, 14, 12, bellagioWall, true);
  addBox(-37, 6.2, 30, 2.5, 8.5, 20, bellagioWall, true);
  addBox(-51, 6.4, 30, 28, 0.8, 46, bellagioTrim);

  const bellagioSign = makeNeonSignMesh('BELLAGIO', '#1d120a', '#ffd573', 13, 2.5, 'RESORT & CASINO');
  bellagioSign.rotation.y = Math.PI / 2;
  bellagioSign.position.set(-35.6, 8.8, 30);
  scene.add(bellagioSign);

  const blossomColors = [0xff5e8e, 0xffc63d, 0x3bdcff, 0x76ff7a, 0xff7b29, 0xd16bff];
  for (let i = 0; i < 18; i++) {
    const petal = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.42 + (i % 3) * 0.12, 0),
      new THREE.MeshStandardMaterial({
        color: blossomColors[i % blossomColors.length],
        emissive: blossomColors[i % blossomColors.length],
        emissiveIntensity: 0.65,
        roughness: 0.15,
      })
    );
    petal.position.set(-41 - (i % 3) * 2.2, 5.4 + (i % 2) * 0.3, 24 + Math.floor(i / 3) * 2.2);
    scene.add(petal);
  }

  const belInteriorLight = new THREE.PointLight(0xffd78c, 26, 36, 1.25);
  belInteriorLight.position.set(-50, 5.6, 30);
  scene.add(belInteriorLight);

  for (const sz of [19, 24, 36, 41]) {
    const slot = createSlotMachine('#ffbe3d', 0xffd147);
    slot.position.set(-46, 0, sz);
    slot.rotation.y = Math.PI / 2;
    scene.add(slot);
    colliders.push({ minX: -46.6, maxX: -45.4, minZ: sz - 0.6, maxZ: sz + 0.6, minY: 0, topY: 2.0, isWall: true });
  }
  gamblingSpots.push({
    id: 'bellagio-slots',
    casinoName: 'Bellagio',
    gameType: 'slots',
    position: new THREE.Vector3(-44.5, 0, 21.5),
    label: 'Bellagio High-Limit Slots',
  });
  const belTable = createCasinoTable(0x136f45);
  belTable.position.set(-53, 0, 30);
  scene.add(belTable);
  colliders.push({ minX: -54.7, maxX: -51.3, minZ: 28.3, maxZ: 31.7, minY: 0, topY: 1.08 });
  gamblingSpots.push({
    id: 'bellagio-roulette',
    casinoName: 'Bellagio',
    gameType: 'roulette',
    position: new THREE.Vector3(-51.2, 0, 30),
    label: 'Bellagio VIP Roulette',
  });

  // --- 3. THE COSMOPOLITAN OF LAS VEGAS (West Side South: z +60 to +96) ---
  const cosmoTowerMat = new THREE.MeshStandardMaterial({
    map: makeHotelFacadeTexture('#212a3d', '#3e527a', '#b6e6ff', 16, 26),
    roughness: 0.25,
    metalness: 0.65,
  });
  addBox(-46, 0, 78, 22, 42, 32, cosmoTowerMat, true);
  // Shimmering Vertical Digital Strip Marquee & Purple Chandelier Entrance
  const cosmoSign = makeNeonSignMesh('THE COSMOPOLITAN', '#1b082e', '#e58aff', 12, 2.8, 'CHANDELIER LOUNGE');
  cosmoSign.rotation.y = Math.PI / 2;
  cosmoSign.position.set(-34.6, 8.2, 78);
  scene.add(cosmoSign);
  const cosmoChandelier = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 1.4, 5.2, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xd94dff, wireframe: true })
  );
  cosmoChandelier.position.set(-28, 3.8, 78);
  scene.add(cosmoChandelier);
  const cosmoGlow = new THREE.PointLight(0xd94dff, 22, 28, 1.4);
  cosmoGlow.position.set(-28, 4.5, 78);
  scene.add(cosmoGlow);

  // --- 4. CAESARS PALACE (West Side North: z -60 to -12) ---
  const caesarsTowerMat = new THREE.MeshStandardMaterial({
    map: makeHotelFacadeTexture('#cfc7b8', '#ece5d6', '#fff0b3', 14, 18),
    roughness: 0.62,
  });
  const marbleMat = new THREE.MeshStandardMaterial({ color: 0xe6dfd3, roughness: 0.58 });
  addBox(-52, 0, -38, 22, 28, 38, caesarsTowerMat, true);
  for (let cz = -52; cz <= -24; cz += 5.5) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.52, 6.8, 12), marbleMat);
    col.position.set(-34, 3.4, cz);
    col.castShadow = true;
    scene.add(col);
    colliders.push({ minX: -34.6, maxX: -33.4, minZ: cz - 0.6, maxZ: cz + 0.6, minY: 0, topY: 6.8, isWall: true });
  }
  const pediment = new THREE.Mesh(new THREE.ConeGeometry(8.5, 3.5, 4), marbleMat);
  pediment.rotation.y = Math.PI / 4;
  pediment.position.set(-34, 8.5, -38);
  scene.add(pediment);

  // Roman Fountain Plaza in front of Caesars
  const romanPool = new THREE.Mesh(new THREE.CircleGeometry(4.2, 24), fountainWaterMat);
  romanPool.rotation.x = -Math.PI / 2;
  romanPool.position.set(-22, 0.04, -38);
  scene.add(romanPool);
  const romanPedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 2.2, 12), marbleMat);
  romanPedestal.position.set(-22, 1.1, -38);
  scene.add(romanPedestal);

  const caesarsSign = makeNeonSignMesh('CAESARS PALACE', '#1a140d', '#f7d560', 14, 2.5, 'LAS VEGAS');
  caesarsSign.rotation.y = Math.PI / 2;
  caesarsSign.position.set(-22, 6.5, -38);
  scene.add(caesarsSign);

  // --- 5. ABC STORES FLAGSHIP CONVENIENCE STORE (East Side South: x +14 to +34, z +62 to +88) ---
  // Walk-in Hawaiian/Vegas convenience store with curved Rulon wood-baffle ceiling & Cigarette Cartons / Vape Display!
  const abcBlueMat = new THREE.MeshStandardMaterial({ color: 0x0b4ea2, roughness: 0.45 });
  const abcTileMat = new THREE.MeshStandardMaterial({ color: 0xe6dfd0, roughness: 0.65 });
  const woodBaffleMat = new THREE.MeshStandardMaterial({ color: 0x9b6432, roughness: 0.72 });

  const abcFloor = new THREE.Mesh(new THREE.PlaneGeometry(18, 22), abcTileMat);
  abcFloor.rotation.x = -Math.PI / 2;
  abcFloor.position.set(24, 0.03, 75);
  abcFloor.receiveShadow = true;
  scene.add(abcFloor);

  // Back wall, side walls, and open glass front frames
  addBox(33, 0, 75, 1.4, 7.2, 24, abcBlueMat, true);
  addBox(24, 0, 86, 18, 7.2, 1.4, abcBlueMat, true);
  addBox(24, 0, 64, 18, 7.2, 1.4, abcBlueMat, true);
  addBox(15, 0, 67.5, 1.2, 7.2, 7, abcBlueMat, true);
  addBox(15, 0, 82.5, 1.2, 7.2, 7, abcBlueMat, true);
  addBox(15, 4.4, 75, 1.4, 2.8, 9.5, abcBlueMat, true);
  addBox(24, 6.8, 75, 18, 0.6, 24, abcBlueMat);

  // Iconic Illuminated "ABC STORES" Marquee with Tropical Yellow Accent!
  const abcSign = makeNeonSignMesh('ABC STORES', '#093c82', '#ffe14d', 12, 2.3, 'CARTONS • VAPES • SNACKS');
  abcSign.rotation.y = -Math.PI / 2;
  abcSign.position.set(14.1, 5.7, 75);
  scene.add(abcSign);

  // Sweeping Rulon Linear Wood-Baffle Wave Ceiling inside ABC Stores!
  for (let b = 0; b < 14; b++) {
    const bx = 17 + b * 1.1;
    const waveY = 5.4 + Math.sin(b * 0.55) * 0.45;
    const baffle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 19), woodBaffleMat);
    baffle.position.set(bx, waveY, 75);
    scene.add(baffle);
  }

  // ABC Store Merchandise Aisles & Checkout Counter with Cigarette Carton Stacks!
  const shelfMat = new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.6 });
  for (const az of [69, 81]) {
    addBox(22, 0, az, 5.5, 1.8, 1.2, shelfMat, true);
    for (let cx = 19.8; cx <= 24.2; cx += 1.1) {
      const item = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 0.55, 0.7),
        new THREE.MeshStandardMaterial({ color: [0xff5978, 0x35d0ff, 0xffd23f, 0x52e07a][Math.floor(cx) % 4] })
      );
      item.position.set(cx, 2.08, az);
      scene.add(item);
    }
  }
  // ABC Checkout Counter + Behind-Counter Cigarette Carton Wall + Vape Display!
  addBox(29.5, 0, 75, 1.5, 1.1, 8.5, abcBlueMat, true);
  const abcShopSpot = new THREE.Vector3(27.8, 0, 75);
  // Display cigarette cartons stacked on wall behind clerk
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 5; col++) {
      const carton = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.48, 0.88),
        new THREE.MeshStandardMaterial({
          color: [0xd9362b, 0x1e8855, 0x2a66cc, 0xf2b830][col % 4],
          roughness: 0.45,
        })
      );
      carton.position.set(31.8, 1.5 + row * 0.6, 72.5 + col * 1.2);
      scene.add(carton);
    }
  }
  // Glowing Vape Showcase on counter
  const vapeCase = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 0.75, 1.8),
    new THREE.MeshBasicMaterial({ color: 0x5cf2ff, transparent: true, opacity: 0.55 })
  );
  vapeCase.position.set(29.5, 1.48, 72.2);
  scene.add(vapeCase);

  const abcInteriorLight = new THREE.PointLight(0xfff5e0, 26, 26, 1.2);
  abcInteriorLight.position.set(23, 5.0, 75);
  scene.add(abcInteriorLight);

  // --- 6. PARIS LAS VEGAS (East Side: z +6 to +56) ---
  const eiffelMat = new THREE.MeshStandardMaterial({ color: 0x4f4136, roughness: 0.48, metalness: 0.7 });
  const eiffelGoldLight = new THREE.MeshBasicMaterial({ color: 0xffd278 });
  const legBases: Array<[number, number, number, number]> = [
    [15.2, 19.2, 1, -1],
    [24.8, 19.2, -1, -1],
    [15.2, 28.8, 1, 1],
    [24.8, 28.8, -1, 1],
  ];
  for (const [lx, lz, dx, dz] of legBases) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.92, 14.5, 4), eiffelMat);
    leg.position.set(lx + dx * 2.1, 6.8, lz + dz * 2.1);
    leg.rotation.set(dz * 0.34, Math.PI / 4, dx * 0.34);
    leg.castShadow = true;
    scene.add(leg);
    colliders.push({ minX: lx - 0.85, maxX: lx + 0.85, minZ: lz - 0.85, maxZ: lz + 0.85, minY: 0, topY: 3.0, isWall: true });
  }
  const deck1 = new THREE.Mesh(new THREE.BoxGeometry(7.8, 1.0, 7.8), eiffelMat);
  deck1.position.set(20, 12.8, 24);
  scene.add(deck1);
  const deckRim1 = new THREE.Mesh(new THREE.BoxGeometry(8.1, 0.28, 8.1), eiffelGoldLight);
  deckRim1.position.set(20, 13.1, 24);
  scene.add(deckRim1);

  const midShaft = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 3.3, 10, 4), eiffelMat);
  midShaft.rotation.y = Math.PI / 4;
  midShaft.position.set(20, 18.2, 24);
  scene.add(midShaft);

  const deck2 = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.8, 4.4), eiffelMat);
  deck2.position.set(20, 23.2, 24);
  scene.add(deck2);
  const deckRim2 = new THREE.Mesh(new THREE.BoxGeometry(4.65, 0.24, 4.65), eiffelGoldLight);
  deckRim2.position.set(20, 23.4, 24);
  scene.add(deckRim2);

  const upperShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 1.85, 18, 4), eiffelMat);
  upperShaft.rotation.y = Math.PI / 4;
  upperShaft.position.set(20, 32.5, 24);
  scene.add(upperShaft);

  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.55, 7.5, 4), eiffelGoldLight);
  spire.rotation.y = Math.PI / 4;
  spire.position.set(20, 45.0, 24);
  scene.add(spire);

  // 72-ft Montgolfier Hot Air Balloon Marquee
  const balloonGroup = new THREE.Group();
  balloonGroup.position.set(13.5, 13.2, 8.2);
  const balloonSphere = new THREE.Mesh(
    new THREE.SphereGeometry(4.2, 24, 18),
    new THREE.MeshStandardMaterial({
      map: makeBalloonTexture(),
      emissive: 0x3b1f08,
      emissiveIntensity: 0.4,
      roughness: 0.45,
    })
  );
  balloonGroup.add(balloonSphere);
  const balloonBasePole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.65, 8.8, 10),
    new THREE.MeshStandardMaterial({ color: 0x262938, metalness: 0.7, roughness: 0.35 })
  );
  balloonBasePole.position.y = -8.8;
  balloonGroup.add(balloonBasePole);
  const gondola = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 1.8, 2.6),
    new THREE.MeshStandardMaterial({ color: 0x7d4c24, roughness: 0.65 })
  );
  gondola.position.y = -5.4;
  balloonGroup.add(gondola);
  const balloonSign = makeNeonSignMesh('PARIS', '#210c1f', '#ffd26a', 4.6, 1.35);
  balloonSign.position.set(-1.35, -5.4, 0);
  balloonSign.rotation.y = -Math.PI / 2;
  balloonGroup.add(balloonSign);
  scene.add(balloonGroup);
  colliders.push({ minX: 12.6, maxX: 14.4, minZ: 7.3, maxZ: 9.1, minY: 0, topY: 6.0, isWall: true });

  // Arc de Triomphe
  const arcMat = new THREE.MeshStandardMaterial({ color: 0xe3d3ba, roughness: 0.72 });
  addBox(15.5, 0, 38.0, 2.2, 5.4, 1.5, arcMat, true);
  addBox(15.5, 0, 42.4, 2.2, 5.4, 1.5, arcMat, true);
  addBox(15.5, 3.8, 40.2, 2.4, 2.5, 6.2, arcMat, true);
  addBox(15.5, 6.3, 40.2, 2.7, 0.55, 6.6, arcMat, true);

  const parisTowerMat = new THREE.MeshStandardMaterial({
    map: makeHotelFacadeTexture('#c2b6a2', '#dcd0bc', '#ffe6a8', 14, 20),
    roughness: 0.68,
  });
  const parisMainTower = new THREE.Mesh(new THREE.BoxGeometry(10, 34, 34), parisTowerMat);
  parisMainTower.position.set(62, 17, 30);
  scene.add(parisMainTower);
  const mansardRoof = new THREE.Mesh(
    new THREE.BoxGeometry(11, 4, 35),
    new THREE.MeshStandardMaterial({ color: 0x26384d, roughness: 0.6 })
  );
  mansardRoof.position.set(62, 36, 30);
  scene.add(mansardRoof);

  const parisWall = new THREE.MeshStandardMaterial({ color: 0x45414f, roughness: 0.78 });
  const parisCarpet = new THREE.MeshStandardMaterial({
    map: makeCarpetTexture('#3c1830', '#ffd278'),
    roughness: 0.85,
  });
  const parisFloor = new THREE.Mesh(new THREE.PlaneGeometry(28, 42), parisCarpet);
  parisFloor.rotation.x = -Math.PI / 2;
  parisFloor.position.set(47, 0.03, 30);
  parisFloor.receiveShadow = true;
  scene.add(parisFloor);

  const parisSkyCeiling = new THREE.MeshStandardMaterial({
    color: 0x8cc8ff,
    emissive: 0x3b6ca8,
    emissiveIntensity: 0.5,
    roughness: 0.9,
  });
  addBox(61, 0, 30, 3, 20, 44, parisWall, true);
  addBox(47, 0, 52, 28, 16, 3, parisWall, true);
  addBox(47, 0, 8, 28, 16, 3, parisWall, true);
  addBox(33, 0, 15, 2.2, 15, 11, parisWall, true);
  addBox(33, 0, 45, 2.2, 15, 11, parisWall, true);
  addBox(33, 6.0, 30, 2.4, 9.5, 19, parisWall, true);
  addBox(47, 6.2, 30, 28, 0.8, 44, parisSkyCeiling);

  const parisSign = makeNeonSignMesh('PARIS', '#1c112b', '#ffdf8e', 13, 2.5, 'LAS VEGAS');
  parisSign.rotation.y = -Math.PI / 2;
  parisSign.position.set(31.6, 8.6, 30);
  scene.add(parisSign);

  const parisLight = new THREE.PointLight(0xffd292, 24, 36, 1.25);
  parisLight.position.set(46, 5.2, 30);
  scene.add(parisLight);

  for (const sz of [19, 24, 36, 41]) {
    const slot = createSlotMachine('#63e8ff', 0x63e8ff);
    slot.position.set(41, 0, sz);
    slot.rotation.y = -Math.PI / 2;
    scene.add(slot);
    colliders.push({ minX: 40.4, maxX: 41.6, minZ: sz - 0.6, maxZ: sz + 0.6, minY: 0, topY: 2.0, isWall: true });
  }
  gamblingSpots.push({
    id: 'paris-slots',
    casinoName: 'Paris Las Vegas',
    gameType: 'slots',
    position: new THREE.Vector3(39.4, 0, 21.5),
    label: 'Paris Eiffel Slots',
  });
  const parisTable = createCasinoTable(0x7c1d2e);
  parisTable.position.set(49, 0, 30);
  scene.add(parisTable);
  colliders.push({ minX: 47.3, maxX: 50.7, minZ: 28.3, maxZ: 31.7, minY: 0, topY: 1.08 });
  gamblingSpots.push({
    id: 'paris-roulette',
    casinoName: 'Paris Las Vegas',
    gameType: 'roulette',
    position: new THREE.Vector3(47.2, 0, 30),
    label: 'Paris Monte Carlo Roulette',
  });

  // Mon Ami Gabi Parisian Bistro Tables & Umbrellas
  const bistroMat = new THREE.MeshStandardMaterial({ color: 0x734a2d, roughness: 0.72 });
  const umbrellaMat = new THREE.MeshStandardMaterial({ color: 0xb82e2e, roughness: 0.65 });
  for (const bz of [13, 34, 46]) {
    addBox(14.5, 0, bz, 1.35, 0.85, 1.35, bistroMat);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 6), bistroMat);
    pole.position.set(14.5, 1.9, bz);
    scene.add(pole);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.55, 8), umbrellaMat);
    canopy.position.set(14.5, 2.95, bz);
    scene.add(canopy);
  }

  // --- 7. FLAMINGO LAS VEGAS, LINQ PROMENADE & HIGH ROLLER (Northeast: z -60 to -12) ---
  const flamingoTowerMat = new THREE.MeshStandardMaterial({
    map: makeHotelFacadeTexture('#4b2442', '#703864', '#ff9ae0', 14, 18),
    roughness: 0.68,
  });
  const flamMainTower = new THREE.Mesh(new THREE.BoxGeometry(10, 30, 36), flamingoTowerMat);
  flamMainTower.position.set(62, 15, -36);
  scene.add(flamMainTower);

  const flamingoWall = new THREE.MeshStandardMaterial({ color: 0x3b2038, roughness: 0.75 });
  const flamingoPinkMat = new THREE.MeshBasicMaterial({ color: 0xff45a8 });
  const flamingoCoralMat = new THREE.MeshBasicMaterial({ color: 0xff7b3b });
  const flamingoCarpet = new THREE.MeshStandardMaterial({
    map: makeCarpetTexture('#4a1238', '#ff64b8'),
    roughness: 0.85,
  });
  const flamFloor = new THREE.Mesh(new THREE.PlaneGeometry(28, 38), flamingoCarpet);
  flamFloor.rotation.x = -Math.PI / 2;
  flamFloor.position.set(47, 0.03, -36);
  flamFloor.receiveShadow = true;
  scene.add(flamFloor);

  addBox(61, 0, -36, 3, 20, 40, flamingoWall, true);
  addBox(47, 0, -56, 28, 16, 3, flamingoWall, true);
  addBox(47, 0, -16, 28, 16, 3, flamingoWall, true);
  addBox(33, 0, -22, 2.2, 15, 10, flamingoWall, true);
  addBox(33, 0, -50, 2.2, 15, 10, flamingoWall, true);
  addBox(33, 5.8, -36, 2.4, 9.5, 18, flamingoWall, true);
  addBox(47, 6.0, -36, 28, 0.8, 40, flamingoWall);

  for (let i = -4; i <= 4; i++) {
    const feather = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 7.2 - Math.abs(i) * 0.55, 0.25),
      i % 2 === 0 ? flamingoPinkMat : flamingoCoralMat
    );
    feather.position.set(32.0, 11.4, -36 + i * 1.45);
    feather.rotation.x = i * 0.22;
    scene.add(feather);
  }
  const flamCornerSign = makeNeonSignMesh('FLAMINGO', '#2b0722', '#ff66c4', 12, 2.8, 'LAS VEGAS • EST 1946');
  flamCornerSign.rotation.y = -Math.PI / 2;
  flamCornerSign.position.set(31.5, 7.6, -36);
  scene.add(flamCornerSign);

  const flamStripCorner = makeNeonSignMesh('FLAMINGO', '#2b0722', '#ff7b3b', 6.5, 2.2, 'WILDLIFE HABITAT');
  flamStripCorner.position.set(14.5, 5.2, -16.5);
  scene.add(flamStripCorner);

  const flamLight = new THREE.PointLight(0xff52b8, 26, 36, 1.25);
  flamLight.position.set(45, 5.2, -36);
  scene.add(flamLight);

  // Wildlife Habitat Pond + Waterfall + Bridge + 6 Flamingos
  const pond = new THREE.Mesh(
    new THREE.CircleGeometry(5.6, 28),
    new THREE.MeshStandardMaterial({ color: 0x157885, roughness: 0.08, metalness: 0.7 })
  );
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(22.5, 0.03, -36);
  scene.add(pond);

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b5d54, roughness: 0.92 });
  addBox(26.5, 0, -36, 2.4, 2.6, 4.2, rockMat, true);
  const waterfall = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 2.6),
    new THREE.MeshBasicMaterial({ color: 0x8ef4ff, transparent: true, opacity: 0.72 })
  );
  waterfall.rotation.y = -Math.PI / 2;
  waterfall.position.set(25.25, 1.3, -36);
  scene.add(waterfall);

  const bridgeWood = new THREE.MeshStandardMaterial({ color: 0x70492b, roughness: 0.75 });
  addBox(19.0, 0, -36, 4.4, 0.35, 1.6, bridgeWood);

  for (const [fx, fz, ph] of [
    [21.4, -34.2, 0.5],
    [23.2, -35.8, 1.8],
    [22.0, -38.0, 2.7],
    [24.1, -33.6, 4.1],
    [20.6, -37.2, 5.2],
    [23.5, -38.5, 0.9],
  ]) {
    const bird = createFlamingoBird(ph);
    bird.position.set(fx, 0, fz);
    scene.add(bird);
  }
  for (const fz of [-26, -46]) {
    const p = createPalmTree(true);
    p.position.set(16.5, 0, fz);
    scene.add(p);
  }

  for (const sz of [-44, -39, -31, -27]) {
    const slot = createSlotMachine('#ff4fc6', 0xff4fc6);
    slot.position.set(41, 0, sz);
    slot.rotation.y = -Math.PI / 2;
    scene.add(slot);
    colliders.push({ minX: 40.4, maxX: 41.6, minZ: sz - 0.6, maxZ: sz + 0.6, minY: 0, topY: 2.0, isWall: true });
  }
  gamblingSpots.push({
    id: 'flamingo-slots',
    casinoName: 'Flamingo',
    gameType: 'slots',
    position: new THREE.Vector3(39.4, 0, -41.5),
    label: 'Flamingo Pink 777 Slots',
  });
  const flamTable = createCasinoTable(0x7c1456);
  flamTable.position.set(49, 0, -36);
  scene.add(flamTable);
  colliders.push({ minX: 47.3, maxX: 50.7, minZ: -37.7, maxZ: -34.3, minY: 0, topY: 1.08 });
  gamblingSpots.push({
    id: 'flamingo-roulette',
    casinoName: 'Flamingo',
    gameType: 'roulette',
    position: new THREE.Vector3(47.2, 0, -36),
    label: 'Flamingo High-Roller Roulette',
  });

  // High Roller Observation Wheel behind Flamingo / LINQ Promenade
  const wheelGroup = new THREE.Group();
  wheelGroup.position.set(82, 34, -52);
  wheelGroup.rotation.y = Math.PI / 2;
  const wheelRimMat = new THREE.MeshBasicMaterial({ color: 0x35e0ff });
  const wheelInnerMat = new THREE.MeshBasicMaterial({ color: 0xff49b8 });
  wheelGroup.add(new THREE.Mesh(new THREE.TorusGeometry(26, 0.55, 10, 48), wheelRimMat));
  wheelGroup.add(new THREE.Mesh(new THREE.TorusGeometry(23, 0.35, 8, 40), wheelInnerMat));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const spoke = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 50, 6),
      new THREE.MeshBasicMaterial({ color: 0x7799cc })
    );
    spoke.rotation.z = a;
    wheelGroup.add(spoke);
    const pod = new THREE.Mesh(
      new THREE.SphereGeometry(1.0, 8, 8),
      new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xffd15a : 0xff62c8 })
    );
    pod.position.set(Math.cos(a) * 26, Math.sin(a) * 26, 0);
    wheelGroup.add(pod);
  }
  scene.add(wheelGroup);

  // --- 8. THE VENETIAN & THE SPHERE (East Side North: z -98 to -64) ---
  const venetianTowerMat = new THREE.MeshStandardMaterial({
    map: makeHotelFacadeTexture('#e3c9a4', '#f2dec0', '#ffe9a8', 16, 22),
    roughness: 0.65,
  });
  addBox(48, 0, -82, 24, 34, 30, venetianTowerMat, true);
  // St. Mark's Campanile Bell Tower!
  addBox(16.5, 0, -76, 4.0, 32, 4.0, stoneMat, true);
  const campanileRoof = new THREE.Mesh(
    new THREE.ConeGeometry(3.2, 8.5, 4),
    new THREE.MeshStandardMaterial({ color: 0x993e2e, roughness: 0.6 })
  );
  campanileRoof.rotation.y = Math.PI / 4;
  campanileRoof.position.set(16.5, 36.2, -76);
  scene.add(campanileRoof);

  // Venetian Outdoor Grand Canal + Rialto Bridge + Striped Gondola!
  const canal = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 28), fountainWaterMat);
  canal.rotation.x = -Math.PI / 2;
  canal.position.set(25, 0.04, -82);
  scene.add(canal);
  addBox(25, 0, -82, 9.5, 0.65, 2.8, marbleMat); // Walkable Rialto Footbridge!
  const canalGondola = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.45, 4.2),
    new THREE.MeshStandardMaterial({ color: 0x111216, roughness: 0.3 })
  );
  canalGondola.position.set(25, 0.25, -73);
  scene.add(canalGondola);

  const venSign = makeNeonSignMesh('THE VENETIAN', '#221409', '#ffd86b', 13, 2.5, 'GRAND CANAL & SPHERE');
  venSign.rotation.y = -Math.PI / 2;
  venSign.position.set(35.6, 8.2, -82);
  scene.add(venSign);

  // THE SPHERE (Iconic Animated 1.2M LED Orb behind The Venetian!)
  const sphereCanvas = createSphereCanvasTexture(false);
  const sphereMat = new THREE.MeshBasicMaterial({ map: sphereCanvas.tex });
  const sphereMesh = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 24), sphereMat);
  sphereMesh.position.set(78, 19, -86);
  scene.add(sphereMesh);

  // --- 9. STREETLIGHTS, BUS ROUTE TRAFFIC & STRIP VEHICLES ---
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x1c1f2b, metalness: 0.72, roughness: 0.35 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe4a0 });
  for (const lx of [-10.2, 10.2]) {
    for (let lz = -90; lz <= 90; lz += 18) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 5.4, 8), poleMat);
      pole.position.set(lx, 2.7, lz);
      scene.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.12), poleMat);
      arm.position.set(lx + (lx < 0 ? 0.45 : -0.45), 5.3, lz);
      scene.add(arm);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), bulbMat);
      bulb.position.set(lx + (lx < 0 ? 0.9 : -0.9), 5.2, lz);
      scene.add(bulb);
      const pt = new THREE.PointLight(0xffcb78, 9.5, 20, 1.5);
      pt.position.set(lx, 5.0, lz);
      scene.add(pt);
      lampLights.push(pt);
    }
  }

  // Stealable Cigarette Packs across the entire 220m Strip + Casinos + ABC Counter!
  const pickupDefs: Array<{ pos: [number, number, number]; amount: number; label: string; inside: boolean }> = [
    { pos: [-12.1, 0.9, 18], amount: 2, label: 'Bellagio Fountains Ash-Stand Pack', inside: false },
    { pos: [-12.1, 0.9, 42], amount: 2, label: 'Fountains Balustrade Smokes', inside: false },
    { pos: [14.5, 1.2, 13], amount: 2, label: 'Mon Ami Gabi Patio Pack', inside: false },
    { pos: [14.5, 1.2, 34], amount: 3, label: 'Paris Bistro Carton', inside: false },
    { pos: [20, 0.45, 24], amount: 2, label: 'Under-Eiffel Tourist Pack', inside: false },
    { pos: [0, 4.85, -11], amount: 4, label: 'Flamingo Skybridge Stash!', inside: false },
    { pos: [19.0, 0.72, -36], amount: 2, label: 'Flamingo Habitat Bridge Pack', inside: false },
    { pos: [-16, 0.45, -26], amount: 2, label: 'Caesars Colonnade Smokes', inside: false },
    { pos: [25, 0.95, -82], amount: 3, label: 'Venetian Rialto Bridge Pack', inside: false },
    { pos: [-28, 0.45, 78], amount: 3, label: 'Cosmopolitan Lounge Pack', inside: false },
    { pos: [28.6, 1.45, 77], amount: 4, label: 'ABC Stores Counter Loose Pack!', inside: false },
    { pos: [-47, 0.45, 16], amount: 3, label: 'Bellagio Slot Bar Pack', inside: true },
    { pos: [-53, 1.4, 30], amount: 5, label: 'Bellagio VIP Table Luxury Pack!', inside: true },
    { pos: [-56, 0.45, 42], amount: 3, label: 'Bellagio Lounge Smokes', inside: true },
    { pos: [42, 0.45, 16], amount: 3, label: 'Paris Slot Row Pack', inside: true },
    { pos: [49, 1.4, 30], amount: 5, label: 'Paris High-Roller Table Pack!', inside: true },
    { pos: [42, 0.45, -47], amount: 3, label: 'Flamingo Pink Slots Pack', inside: true },
    { pos: [49, 1.4, -36], amount: 5, label: 'Flamingo VIP Table Pack!', inside: true },
  ];

  pickupDefs.forEach((def, idx) => {
    const mesh = createCigPackMesh();
    mesh.position.set(...def.pos);
    scene.add(mesh);
    cigPickups.push({
      id: idx,
      mesh,
      position: new THREE.Vector3(...def.pos),
      amount: def.amount,
      label: def.label,
      insideCasino: def.inside,
      stolenCooldown: 0,
    });
  });

  // Two Rideable Metallic Gold RTC "THE DEUCE" Double-Decker Buses (Southbound & Northbound!)
  const busSpecs: Array<{ lane: number; dir: 1 | -1; startZ: number }> = [
    { lane: 6.4, dir: 1, startZ: -10 },  // Northbound on East outer bus lane
    { lane: -6.4, dir: -1, startZ: 18 }, // Southbound on West outer bus lane
  ];
  busSpecs.forEach((spec, idx) => {
    const built = createDeuceBus();
    built.group.position.set(spec.lane, 0, spec.startZ);
    if (spec.dir === -1) built.group.rotation.y = Math.PI;
    scene.add(built.group);
    deuceBuses.push({
      id: idx,
      mesh: built.group,
      laneX: spec.lane,
      dir: spec.dir,
      speed: 8.5,
      stopTimer: 0,
      lastStopIdx: -1,
      wheels: built.wheels,
      deckOffset: built.deckOffset,
    });
  });

  // Other Strip Traffic (Yellow Taxis & Black Stretch Limo)
  const carSpecs: Array<{ lane: number; dir: 1 | -1; kind: 'taxi' | 'limo'; speed: number; startZ: number }> = [
    { lane: -3.2, dir: -1, kind: 'taxi', speed: 12.2, startZ: -42 },
    { lane: 3.2, dir: 1, kind: 'taxi', speed: 12.5, startZ: 40 },
    { lane: -3.2, dir: -1, kind: 'limo', speed: 14.0, startZ: 60 },
  ];
  for (const cfg of carSpecs) {
    const v = new THREE.Group();
    const len = cfg.kind === 'limo' ? 7.2 : 4.1;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.85, len),
      new THREE.MeshStandardMaterial({
        color: cfg.kind === 'limo' ? 0x11131c : 0xf4c430,
        roughness: 0.22,
        metalness: 0.72,
      })
    );
    body.position.y = 0.56;
    v.add(body);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.65, 0.6, cfg.kind === 'limo' ? 5.0 : 2.1),
      new THREE.MeshStandardMaterial({ color: 0x0f1420, roughness: 0.1, metalness: 0.85 })
    );
    cabin.position.set(0, 1.15, -0.2);
    v.add(cabin);
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xfff5cc });
    const tlMat = new THREE.MeshBasicMaterial({ color: 0xff2233 });
    for (const hx of [-0.65, 0.65]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.08), hlMat);
      hl.position.set(hx, 0.56, len * 0.5 + 0.04);
      v.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.08), tlMat);
      tl.position.set(hx, 0.56, -len * 0.5 - 0.04);
      v.add(tl);
    }
    v.position.set(cfg.lane, 0, cfg.startZ);
    if (cfg.dir === -1) v.rotation.y = Math.PI;
    scene.add(v);
    trafficVehicles.push({ mesh: v, laneX: cfg.lane, dir: cfg.dir, speed: cfg.speed, halfLen: len * 0.5 + 0.2 });
  }

  // --- 10. CONTINUOUS DAYTIME / SUNSET / NIGHTTIME CONTROLLER ---
  let timePreset: TimePreset = 'day';
  let cyclePhase = 0.28; // 0.0 = midnight, 0.28 = bright Mojave afternoon, 0.52 = golden sunset, 0.78 = neon night

  const presetToPhase = (p: TimePreset): number => {
    if (p === 'day') return 0.28;
    if (p === 'sunset') return 0.52;
    return 0.85;
  };

  const applyAtmosphere = (phase: number, elapsed: number) => {
    // Daylight factor 0 (night) -> 1 (bright noon)
    const sunElev = Math.sin(phase * Math.PI); // >0 during day, peaking at 0.5? Wait: let's define 0.28=day peak, 0.52=sunset, 0.85=night!
    // Map phase nicely: 0..0.5 = Day, 0.5..0.65 = Sunset, 0.65..1.0 = Night
    let dayFactor = 0;
    let sunsetFactor = 0;
    if (phase < 0.45) {
      dayFactor = 1.0;
    } else if (phase < 0.60) {
      const t = (phase - 0.45) / 0.15;
      dayFactor = 1 - t;
      sunsetFactor = Math.sin(t * Math.PI);
    } else if (phase < 0.90) {
      dayFactor = 0;
    } else {
      const t = (phase - 0.90) / 0.10;
      dayFactor = t;
      sunsetFactor = Math.sin(t * Math.PI) * 0.5;
    }

    const cNight = new THREE.Color(0x070917);
    const cSunset = new THREE.Color(0xd96b52);
    const cDay = new THREE.Color(0x5faef5);
    skyColor.copy(cNight).lerp(cDay, dayFactor).lerp(cSunset, sunsetFactor * 0.75);
    fog.color.copy(skyColor);
    fog.density = THREE.MathUtils.lerp(0.0056, 0.0024, dayFactor);

    ambientLight.color.setHex(0x7c92d6).lerp(new THREE.Color(0xdff0ff), dayFactor).lerp(new THREE.Color(0xffb58a), sunsetFactor);
    ambientLight.groundColor.setHex(0x201828).lerp(new THREE.Color(0x6e6258), dayFactor);
    ambientLight.intensity = THREE.MathUtils.lerp(0.85, 1.45, dayFactor);

    sunLight.color.setHex(0xbcd2ff).lerp(new THREE.Color(0xfff4de), dayFactor).lerp(new THREE.Color(0xff924c), sunsetFactor);
    sunLight.intensity = THREE.MathUtils.lerp(1.15, 2.65, dayFactor);
    sunLight.position.set(
      36 + Math.cos(phase * Math.PI * 2) * 28,
      20 + dayFactor * 48,
      24
    );

    const lampIntensity = Math.max(0.4, (1 - dayFactor * 0.88) * 9.5);
    for (const l of lampLights) l.intensity = lampIntensity;

    // Update The Sphere LED skin (matte geometric shell by day -> animated glowing Cat Eye / Neon Orb at night!)
    if (Math.floor(elapsed * 8) !== Math.floor((elapsed - 0.016) * 8)) {
      const ctx = sphereCanvas.ctx;
      if (dayFactor > 0.65) {
        ctx.fillStyle = '#677180';
        ctx.fillRect(0, 0, 512, 256);
        ctx.strokeStyle = '#535c6b';
        ctx.lineWidth = 2;
        for (let x = 0; x < 512; x += 32) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, 256);
          ctx.stroke();
        }
      } else {
        const grad = ctx.createLinearGradient(0, 0, 512, 256);
        const h1 = (elapsed * 45) % 360;
        grad.addColorStop(0, `hsl(${h1}, 90%, 42%)`);
        grad.addColorStop(0.5, `hsl(${(h1 + 110) % 360}, 95%, 52%)`);
        grad.addColorStop(1, `hsl(${(h1 + 220) % 360}, 90%, 42%)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 512, 256);

        // Giant Vegas Sphere Cat Eye!
        ctx.fillStyle = '#090b16';
        ctx.beginPath();
        ctx.ellipse(256, 128, 120, 62, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4bff88';
        ctx.beginPath();
        ctx.arc(256, 128, 48, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#05060b';
        ctx.beginPath();
        ctx.ellipse(256, 128, 14, 38, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      sphereCanvas.tex.needsUpdate = true;
    }
  };

  applyAtmosphere(cyclePhase, 0);

  const setTimePreset = (preset: TimePreset) => {
    timePreset = preset;
    if (preset !== 'auto') {
      cyclePhase = presetToPhase(preset);
    }
  };

  const getTimePreset = () => timePreset;

  const getDaylightLabel = (): string => {
    if (timePreset === 'day' || (timePreset === 'auto' && cyclePhase < 0.45)) return 'Mojave Day';
    if (timePreset === 'sunset' || (timePreset === 'auto' && cyclePhase < 0.62)) return 'Golden Sunset';
    return 'Neon Night';
  };

  const getZoneName = (x: number, z: number): string => {
    if (x > 14 && z > 62) return 'ABC Stores Flagship';
    if (x < -28 && z > 58) return 'The Cosmopolitan';
    if (x < -36 && z > 6) return 'Bellagio Casino Floor';
    if (x < -11 && z > 6) return 'Bellagio Fountains';
    if (x < -11 && z <= -12) return 'Caesars Palace';
    if (x > 33 && z > 6 && z <= 58) return 'Paris Casino Floor';
    if (x > 11 && z > 6 && z <= 58) return 'Paris Las Vegas & Eiffel Tower';
    if (x > 33 && z <= -12 && z >= -62) return 'Flamingo Casino Floor';
    if (x > 11 && z <= -12 && z >= -62) return 'Flamingo Wildlife Habitat';
    if (x > 11 && z < -62) return 'The Venetian & The Sphere';
    if (Math.abs(x) <= 13 && Math.abs(z + 11) < 3.5) return 'Strip Pedestrian Skybridge';
    return 'Las Vegas Boulevard (The Strip)';
  };

  const update = (dt: number, elapsed: number) => {
    if (timePreset === 'auto') {
      cyclePhase = (cyclePhase + dt * 0.014) % 1.0; // ~70s full Day/Sunset/Night loop
    }
    applyAtmosphere(cyclePhase, elapsed);

    // Choreographed Bellagio Fountains
    for (let i = 0; i < centerJets.length; i++) {
      const jet = centerJets[i];
      const wave = Math.sin(elapsed * 2.6 - i * 0.36);
      const pulse = Math.max(0.3, (wave * 0.5 + 0.5) * 16.5 + Math.sin(elapsed * 0.7) * 3.5);
      jet.scale.set(1, pulse, 1);
      jet.position.y = pulse * 0.5;
    }
    for (const sj of sideJets) {
      const sway = Math.sin(elapsed * 1.9 + sj.idx * 0.45);
      const h = Math.max(0.4, (Math.cos(elapsed * 2.1 - sj.idx * 0.3) * 0.5 + 0.5) * 9.5);
      sj.mesh.scale.set(1, h, 1);
      sj.mesh.rotation.z = sj.dir * (0.28 + sway * 0.24);
      sj.mesh.position.y = h * 0.46;
    }
    const hueA = (elapsed * 0.05) % 1;
    const hueB = (elapsed * 0.05 + 0.35) % 1;
    fountainGlowA.color.setHSL(hueA, 0.85, 0.62);
    fountainGlowB.color.setHSL(hueB, 0.85, 0.62);

    wheelGroup.rotation.z = elapsed * 0.04;

    // Pickups
    for (const p of cigPickups) {
      if (p.stolenCooldown > 0) {
        p.stolenCooldown = Math.max(0, p.stolenCooldown - dt);
        if (p.stolenCooldown === 0) p.mesh.visible = true;
      } else {
        p.mesh.rotation.y = elapsed * 1.8 + p.id;
        p.mesh.position.y = p.position.y + Math.sin(elapsed * 2.6 + p.id) * 0.08;
      }
    }

    // Rideable RTC "The Deuce" Buses (pause cleanly at Strip Bus Stops!)
    for (const bus of deuceBuses) {
      if (bus.stopTimer > 0) {
        bus.stopTimer = Math.max(0, bus.stopTimer - dt);
        continue;
      }
      const prevZ = bus.mesh.position.z;
      const nextZ = prevZ + bus.dir * bus.speed * dt;
      bus.mesh.position.z = nextZ;

      for (const w of bus.wheels) {
        w.rotation.x += bus.dir * bus.speed * dt * 1.8;
      }

      // Check Bus Stop pauses
      for (let si = 0; si < busStopZs.length; si++) {
        if (si === bus.lastStopIdx) continue;
        const sz = busStopZs[si];
        if ((bus.dir === 1 && prevZ < sz && nextZ >= sz) || (bus.dir === -1 && prevZ > sz && nextZ <= sz)) {
          bus.mesh.position.z = sz;
          bus.stopTimer = 3.2;
          bus.lastStopIdx = si;
          break;
        }
      }

      if (bus.dir === 1 && bus.mesh.position.z > 98) {
        bus.mesh.position.z = -98;
        bus.lastStopIdx = -1;
      } else if (bus.dir === -1 && bus.mesh.position.z < -98) {
        bus.mesh.position.z = 98;
        bus.lastStopIdx = -1;
      }
    }

    // Other Strip Traffic
    for (const car of trafficVehicles) {
      car.mesh.position.z += car.dir * car.speed * dt;
      if (car.dir === 1 && car.mesh.position.z > 100) car.mesh.position.z = -100;
      if (car.dir === -1 && car.mesh.position.z < -100) car.mesh.position.z = 100;
    }
  };

  return {
    colliders,
    cigPickups,
    gamblingSpots,
    abcShopSpot,
    deuceBuses,
    trafficVehicles,
    setTimePreset,
    getTimePreset,
    getDaylightLabel,
    getZoneName,
    update,
  };
}
