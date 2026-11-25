import * as THREE from 'three';

export type TouristProp = 'yard-drink' | 'camera' | 'cig' | 'bag' | 'none';

export interface TouristNPC {
  id: number;
  mesh: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  head: THREE.Group;
  waypoints: THREE.Vector3[];
  wpIndex: number;
  speed: number;
  pauseTimer: number;
  begCooldown: number;
  hasCig: boolean;
  cigStolen: boolean;
  cigMesh: THREE.Object3D | null;
  speechSprite: THREE.Sprite | null;
  speechTimer: number;
  walkPhase: number;
}

export interface GuardNPC {
  id: number;
  mesh: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  waypoints: THREE.Vector3[];
  wpIndex: number;
  casinoName: string;
  kickPoint: THREE.Vector3;
  walkPhase: number;
}

const SKIN_TONES = [0xf2c8a8, 0xe2ae88, 0xc88c64, 0x9b6342, 0x6b412a];
const HAIR_COLORS = [0x1c1512, 0x4a2e1b, 0x9c6b30, 0xd8b158, 0x7b2c25, 0x8e939e];
const SHIRT_COLORS = [0xff5a7a, 0x2ec4ff, 0xffc83d, 0x4de088, 0xb874ff, 0xff7b3b, 0xf2f0eb, 0x26354d];
const PANTS_COLORS = [0x212c42, 0x2c2b30, 0x453b31, 0x3b4d6b, 0xd6cbb8];

function makeHawaiianTexture(baseHex: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    const col = new THREE.Color(baseHex);
    ctx.fillStyle = `#${col.getHexString()}`;
    ctx.fillRect(0, 0, 128, 128);
    const accents = ['#ffe066', '#ff6b9e', '#63f5b8', '#ffffff'];
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = accents[i % accents.length];
      const x = (i * 37) % 128;
      const y = (i * 59) % 128;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 8, y - 2, 16, 4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSpeechTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 512, 160);
    ctx.fillStyle = 'rgba(18, 22, 36, 0.94)';
    ctx.strokeStyle = '#ffd25a';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(14, 14, 484, 108, 28);
    ctx.fill();
    ctx.stroke();

    // Pointer triangle
    ctx.beginPath();
    ctx.moveTo(234, 120);
    ctx.lineTo(256, 150);
    ctx.lineTo(278, 120);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fff5e0';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 68, 456);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildArticulatedHuman(seed: number, isGuard: boolean, prop: TouristProp): {
  group: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  head: THREE.Group;
  cigMesh: THREE.Object3D | null;
} {
  const g = new THREE.Group();

  const skinColor = SKIN_TONES[seed % SKIN_TONES.length];
  const hairColor = HAIR_COLORS[(seed * 3) % HAIR_COLORS.length];
  const shirtHex = isGuard ? 0x162038 : SHIRT_COLORS[(seed * 5) % SHIRT_COLORS.length];
  const pantsHex = isGuard ? 0x0e1320 : PANTS_COLORS[(seed * 7) % PANTS_COLORS.length];

  const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.68 });
  const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.78 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pantsHex, roughness: 0.85 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: isGuard ? 0x0c0d12 : 0xe9e6de, roughness: 0.55 });
  const soleMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f6, roughness: 0.7 });

  const isHawaiian = !isGuard && seed % 3 === 0;
  const shirtMat = isHawaiian
    ? new THREE.MeshStandardMaterial({ map: makeHawaiianTexture(shirtHex), roughness: 0.72 })
    : new THREE.MeshStandardMaterial({ color: shirtHex, roughness: 0.72 });

  // Pelvis / Belt
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.22), pantsMat);
  pelvis.position.y = 0.84;
  pelvis.castShadow = true;
  g.add(pelvis);

  const belt = new THREE.Mesh(
    new THREE.BoxGeometry(0.40, 0.05, 0.24),
    new THREE.MeshStandardMaterial({ color: 0x1a1615, roughness: 0.45 })
  );
  belt.position.y = 0.90;
  g.add(belt);

  const buckle = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.06, 0.03),
    new THREE.MeshStandardMaterial({ color: 0xf4c44e, metalness: 0.85, roughness: 0.22 })
  );
  buckle.position.set(0, 0.90, 0.125);
  g.add(buckle);

  // Sculpted Torso (capsule-tapered chest + collar)
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.175, 0.52, 14), shirtMat);
  torso.scale.set(1.05, 1, 0.65);
  torso.position.y = 1.17;
  torso.castShadow = true;
  g.add(torso);

  // Shoulders
  for (const s of [-1, 1]) {
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.088, 10, 8), shirtMat);
    sh.position.set(s * 0.22, 1.38, 0);
    g.add(sh);
  }

  // Guard Tie & Gold Badge OR Tourist Camera Strap
  if (isGuard) {
    const badge = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.02, 8),
      new THREE.MeshStandardMaterial({ color: 0xffd24d, metalness: 0.9, roughness: 0.2 })
    );
    badge.rotation.x = Math.PI / 2;
    badge.position.set(0.1, 1.28, 0.13);
    g.add(badge);

    const tie = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.30, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x10141f, roughness: 0.5 })
    );
    tie.position.set(0, 1.24, 0.13);
    g.add(tie);
  }

  // Neck & Detailed Head Group
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.072, 0.12, 10), skinMat);
  neck.position.y = 1.46;
  g.add(neck);

  const head = new THREE.Group();
  head.position.set(0, 1.62, 0);
  g.add(head);

  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.145, 16, 14), skinMat);
  cranium.scale.set(0.92, 1.06, 0.98);
  cranium.castShadow = true;
  head.add(cranium);

  // Nose & Ears
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.055, 6), skinMat);
  nose.rotation.x = Math.PI * 0.45;
  nose.position.set(0, -0.01, 0.145);
  head.add(nose);

  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), skinMat);
    ear.scale.set(0.55, 1.0, 0.75);
    ear.position.set(s * 0.132, -0.01, 0);
    head.add(ear);
  }

  // Eyes or Cool Vegas Sunglasses
  const hasShades = isGuard || seed % 2 === 0;
  if (hasShades) {
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x12141c, roughness: 0.2, metalness: 0.7 });
    const lensMat = new THREE.MeshStandardMaterial({
      color: isGuard ? 0x090b10 : 0x261436,
      roughness: 0.08,
      metalness: 0.85,
    });
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.018, 0.03), frameMat);
    bridge.position.set(0, 0.025, 0.138);
    head.add(bridge);
    for (const s of [-1, 1]) {
      const lens = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.044, 0.025), lensMat);
      lens.position.set(s * 0.048, 0.02, 0.142);
      head.add(lens);
    }
  } else {
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x161a24 });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), eyeMat);
      eye.position.set(s * 0.046, 0.022, 0.132);
      head.add(eye);
    }
  }

  // Hair / Hats / Guard Cap
  if (isGuard) {
    const capCrown = new THREE.Mesh(
      new THREE.CylinderGeometry(0.155, 0.145, 0.09, 14),
      new THREE.MeshStandardMaterial({ color: 0x13192b, roughness: 0.5 })
    );
    capCrown.position.y = 0.11;
    head.add(capCrown);
    const visor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 0.02, 12, 1, false, -Math.PI * 0.35, Math.PI * 0.7),
      new THREE.MeshStandardMaterial({ color: 0x090b12, roughness: 0.2 })
    );
    visor.position.set(0, 0.075, 0.04);
    head.add(visor);
  } else {
    const hairDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.152, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
      hairMat
    );
    hairDome.position.set(0, 0.02, -0.01);
    head.add(hairDome);

    if (seed % 4 === 1) {
      // Tourist Baseball Cap
      const capColor = [0xd9362b, 0x2665d8, 0x28995a][seed % 3];
      const capMat = new THREE.MeshStandardMaterial({ color: capColor, roughness: 0.6 });
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.156, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), capMat);
      cap.position.y = 0.04;
      head.add(cap);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.018, 0.14), capMat);
      brim.position.set(0, 0.06, 0.14);
      brim.rotation.x = 0.15;
      head.add(brim);
    } else if (seed % 4 === 2) {
      // Back bun / ponytail
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), hairMat);
      bun.position.set(0, 0.02, -0.16);
      head.add(bun);
    }
  }

  // Articulated Legs + Sneakers
  const buildLeg = (side: number): THREE.Group => {
    const legPivot = new THREE.Group();
    legPivot.position.set(side * 0.11, 0.80, 0);

    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.074, 0.26, 6, 10), pantsMat);
    thigh.position.y = -0.18;
    thigh.castShadow = true;
    legPivot.add(thigh);

    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.060, 0.28, 6, 10), pantsMat);
    shin.position.y = -0.50;
    shin.castShadow = true;
    legPivot.add(shin);

    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.21), shoeMat);
    shoe.position.set(0, -0.73, 0.04);
    shoe.castShadow = true;
    legPivot.add(shoe);

    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.028, 0.215), soleMat);
    sole.position.set(0, -0.775, 0.04);
    legPivot.add(sole);

    return legPivot;
  };

  const leftLeg = buildLeg(1);
  const rightLeg = buildLeg(-1);
  g.add(leftLeg, rightLeg);

  // Articulated Arms + Hands + Props
  const sleeveMat = shirtMat;
  const buildArm = (side: number): THREE.Group => {
    const armPivot = new THREE.Group();
    armPivot.position.set(side * 0.24, 1.38, 0);

    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.056, 0.16, 6, 10), sleeveMat);
    sleeve.position.y = -0.12;
    sleeve.castShadow = true;
    armPivot.add(sleeve);

    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.044, 0.22, 6, 10), isGuard ? sleeveMat : skinMat);
    forearm.position.y = -0.34;
    forearm.castShadow = true;
    armPivot.add(forearm);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.046, 8, 8), skinMat);
    hand.position.y = -0.50;
    armPivot.add(hand);

    return armPivot;
  };

  const leftArm = buildArm(1);
  const rightArm = buildArm(-1);
  g.add(leftArm, rightArm);

  // Guard Flashlight + Cone
  if (isGuard) {
    const torch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.028, 0.22, 8),
      new THREE.MeshStandardMaterial({ color: 0x1a1e26, metalness: 0.8, roughness: 0.3 })
    );
    torch.rotation.x = Math.PI / 2;
    torch.position.set(0, -0.50, 0.10);
    rightArm.add(torch);

    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(1.4, 4.4, 14, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffe69c,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    cone.rotation.x = -Math.PI / 2;
    cone.position.set(0, -0.50, 2.35);
    rightArm.add(cone);
  }

  // Tourist Vegas Props!
  let cigMesh: THREE.Object3D | null = null;
  if (!isGuard) {
    if (prop === 'yard-drink') {
      const cupMat = new THREE.MeshStandardMaterial({
        color: [0xff33a6, 0x2de2ff, 0x7aff47][seed % 3],
        emissive: [0xff1e8a, 0x00b7ff, 0x45d618][seed % 3],
        emissiveIntensity: 0.4,
        roughness: 0.15,
      });
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.032, 0.44, 10), cupMat);
      cup.position.set(0, -0.34, 0.16);
      rightArm.add(cup);
      const straw = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.008, 0.18, 6),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      straw.position.set(0, -0.06, 0.16);
      rightArm.add(straw);
      rightArm.rotation.x = -0.55;
    } else if (prop === 'camera') {
      const camBody = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.09, 0.07),
        new THREE.MeshStandardMaterial({ color: 0x1c1f28, roughness: 0.35 })
      );
      camBody.position.set(0, 1.18, 0.17);
      g.add(camBody);
      const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.032, 0.035, 0.06, 10),
        new THREE.MeshStandardMaterial({ color: 0x0b0e14, metalness: 0.8, roughness: 0.1 })
      );
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0, 1.18, 0.22);
      g.add(lens);
    } else if (prop === 'cig') {
      const cigGroup = new THREE.Group();
      const paper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.010, 0.010, 0.11, 8),
        new THREE.MeshStandardMaterial({ color: 0xf7f5f0, roughness: 0.7 })
      );
      paper.rotation.x = Math.PI / 2;
      cigGroup.add(paper);
      const ember = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0105, 0.008, 0.018, 8),
        new THREE.MeshBasicMaterial({ color: 0xff5a1f })
      );
      ember.rotation.x = Math.PI / 2;
      ember.position.z = 0.06;
      cigGroup.add(ember);
      cigGroup.position.set(0, -0.50, 0.09);
      rightArm.add(cigGroup);
      rightArm.rotation.x = -0.45;
      cigMesh = cigGroup;
    } else if (prop === 'bag') {
      const bag = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.28, 0.10),
        new THREE.MeshStandardMaterial({ color: 0xe8486b, roughness: 0.55 })
      );
      bag.position.set(0.04, -0.62, 0);
      leftArm.add(bag);
    }
  }

  return { group: g, leftArm, rightArm, leftLeg, rightLeg, head, cigMesh };
}

export class StripCrowdSystem {
  public readonly tourists: TouristNPC[] = [];
  public readonly guards: GuardNPC[] = [];
  private readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const touristRoutes: Array<{ pts: Array<[number, number]>; prop: TouristProp }> = [
      // Bellagio Fountains Sidewalk tourists
      { pts: [[-10.6, 8], [-10.6, 48]], prop: 'camera' },
      { pts: [[-11.2, 46], [-11.2, 12]], prop: 'cig' },
      { pts: [[-11.4, 20], [-11.4, 38]], prop: 'yard-drink' },
      { pts: [[-10.8, 32], [-10.8, 18]], prop: 'bag' },
      // Paris Sidewalk & Eiffel Tower tourists
      { pts: [[11.0, 6], [11.0, 48]], prop: 'yard-drink' },
      { pts: [[12.2, 45], [16.5, 24], [12.2, 10]], prop: 'cig' },
      { pts: [[18.5, 14], [24, 34]], prop: 'camera' },
      { pts: [[14.5, 26], [14.5, 42]], prop: 'bag' },
      // Flamingo Strip & Habitat tourists
      { pts: [[11.2, -16], [11.2, -52]], prop: 'yard-drink' },
      { pts: [[15.5, -24], [24, -44]], prop: 'cig' },
      { pts: [[18.0, -40], [18.0, -24]], prop: 'camera' },
      // Caesars Sidewalk tourists
      { pts: [[-11.2, -16], [-11.2, -52]], prop: 'cig' },
      { pts: [[-16.0, -46], [-16.0, -22]], prop: 'yard-drink' },
      // Inside Bellagio Casino
      { pts: [[-41, 18], [-41, 40], [-56, 40], [-56, 18]], prop: 'cig' },
      { pts: [[-48, 22], [-48, 38]], prop: 'yard-drink' },
      { pts: [[-51, 20], [-43, 35]], prop: 'bag' },
      // Inside Paris Casino
      { pts: [[38, 18], [55, 18], [55, 42], [38, 42]], prop: 'cig' },
      { pts: [[45, 24], [45, 38]], prop: 'yard-drink' },
      // Inside Flamingo Casino
      { pts: [[38, -24], [55, -24], [55, -48], [38, -48]], prop: 'cig' },
      { pts: [[44, -29], [44, -42]], prop: 'bag' },
      // Cosmopolitan & ABC Stores & Bus Stop South
      { pts: [[-12.0, 62], [-12.0, 88]], prop: 'yard-drink' },
      { pts: [[-26.0, 68], [-26.0, 86]], prop: 'camera' },
      { pts: [[12.5, 62], [12.5, 86]], prop: 'bag' },
      { pts: [[20.5, 68], [26.5, 78]], prop: 'cig' },
      // Venetian & Caesars North
      { pts: [[12.5, -62], [12.5, -92]], prop: 'camera' },
      { pts: [[25.0, -72], [25.0, -88]], prop: 'yard-drink' },
      { pts: [[-12.5, -62], [-12.5, -90]], prop: 'cig' },
    ];

    touristRoutes.forEach((r, idx) => {
      const built = buildArticulatedHuman(idx + 3, false, r.prop);
      const waypoints = r.pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
      built.group.position.copy(waypoints[0]);
      scene.add(built.group);

      this.tourists.push({
        id: idx,
        mesh: built.group,
        leftArm: built.leftArm,
        rightArm: built.rightArm,
        leftLeg: built.leftLeg,
        rightLeg: built.rightLeg,
        head: built.head,
        waypoints,
        wpIndex: 1 % waypoints.length,
        speed: 1.55 + (idx % 4) * 0.28,
        pauseTimer: 0,
        begCooldown: 0,
        hasCig: r.prop === 'cig',
        cigStolen: false,
        cigMesh: built.cigMesh,
        speechSprite: null,
        speechTimer: 0,
        walkPhase: idx * 1.1,
      });
    });

    // Casino Security Guards (patrol inside Bellagio, Paris, and Flamingo)
    const guardRoutes: Array<{ name: string; pts: Array<[number, number]>; kick: [number, number] }> = [
      { name: 'Bellagio', pts: [[-43, 19], [-55, 19], [-55, 41], [-43, 41]], kick: [-33, 30] },
      { name: 'Paris Las Vegas', pts: [[40, 19], [54, 19], [54, 41], [40, 41]], kick: [29, 30] },
      { name: 'Flamingo', pts: [[40, -25], [54, -25], [54, -47], [40, -47]], kick: [29, -36] },
    ];

    guardRoutes.forEach((gr, idx) => {
      const built = buildArticulatedHuman(idx + 1, true, 'none');
      const waypoints = gr.pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
      built.group.position.copy(waypoints[0]);
      scene.add(built.group);
      this.guards.push({
        id: idx,
        mesh: built.group,
        leftArm: built.leftArm,
        rightArm: built.rightArm,
        leftLeg: built.leftLeg,
        rightLeg: built.rightLeg,
        waypoints,
        wpIndex: 1,
        casinoName: gr.name,
        kickPoint: new THREE.Vector3(...gr.kick),
        walkPhase: idx * 2.0,
      });
    });
  }

  public showTouristSpeech(tourist: TouristNPC, text: string, duration = 3.0): void {
    if (tourist.speechSprite) {
      this.scene.remove(tourist.speechSprite);
      tourist.speechSprite.material.map?.dispose();
      tourist.speechSprite.material.dispose();
      tourist.speechSprite = null;
    }
    const tex = makeSpeechTexture(text);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(0, 2.28, 0);
    sprite.scale.set(2.3, 0.72, 1);
    tourist.mesh.add(sprite);
    tourist.speechSprite = sprite;
    tourist.speechTimer = duration;
  }

  public update(dt: number, elapsed: number): void {
    for (const t of this.tourists) {
      if (t.begCooldown > 0) t.begCooldown = Math.max(0, t.begCooldown - dt);

      if (t.speechTimer > 0) {
        t.speechTimer -= dt;
        if (t.speechTimer <= 0 && t.speechSprite) {
          t.mesh.remove(t.speechSprite);
          t.speechSprite.material.map?.dispose();
          t.speechSprite.material.dispose();
          t.speechSprite = null;
        }
      }

      if (t.pauseTimer > 0) {
        t.pauseTimer -= dt;
        t.leftLeg.rotation.x = THREE.MathUtils.lerp(t.leftLeg.rotation.x, 0, dt * 8);
        t.rightLeg.rotation.x = THREE.MathUtils.lerp(t.rightLeg.rotation.x, 0, dt * 8);
        t.head.rotation.y = Math.sin(elapsed * 2 + t.id) * 0.25;
        continue;
      }

      const target = t.waypoints[t.wpIndex];
      const delta = target.clone().sub(t.mesh.position);
      delta.y = 0;
      const dist = delta.length();
      if (dist < 0.35) {
        t.wpIndex = (t.wpIndex + 1) % t.waypoints.length;
        if (t.id % 3 === 0) t.pauseTimer = 1.6;
      } else {
        delta.normalize();
        t.mesh.position.addScaledVector(delta, t.speed * dt);
        t.mesh.rotation.y = Math.atan2(delta.x, delta.z);

        t.walkPhase += dt * t.speed * 3.8;
        const swing = Math.sin(t.walkPhase) * 0.55;
        t.leftLeg.rotation.x = swing;
        t.rightLeg.rotation.x = -swing;
        t.leftArm.rotation.x = -swing * 0.65;
        if (!t.hasCig || t.cigStolen) {
          t.rightArm.rotation.x = swing * 0.65;
        } else {
          // Smoker periodically lifts cigarette hand toward face
          const drag = Math.max(0, Math.sin(elapsed * 1.1 + t.id));
          t.rightArm.rotation.x = -0.45 - drag * 0.65;
        }
        t.mesh.position.y = Math.abs(Math.sin(t.walkPhase)) * 0.035;
      }
    }

    for (const g of this.guards) {
      const target = g.waypoints[g.wpIndex];
      const delta = target.clone().sub(g.mesh.position);
      delta.y = 0;
      if (delta.length() < 0.4) {
        g.wpIndex = (g.wpIndex + 1) % g.waypoints.length;
      } else {
        delta.normalize();
        g.mesh.position.addScaledVector(delta, 2.2 * dt);
        g.mesh.rotation.y = Math.atan2(delta.x, delta.z);
        g.walkPhase += dt * 7.2;
        const swing = Math.sin(g.walkPhase) * 0.5;
        g.leftLeg.rotation.x = swing;
        g.rightLeg.rotation.x = -swing;
        g.leftArm.rotation.x = -swing * 0.6;
        g.rightArm.rotation.x = -0.35; // Holds flashlight steady forward
      }
    }
  }
}
