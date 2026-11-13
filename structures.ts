import * as THREE from 'three';
import type { MaterialLibrary } from './materials';
import { seededRandom } from './noise';
import { LANDMARK_POSITIONS, terrainHeightAt } from './terrainMath';
import type { InteractiveTarget, WorldCollider } from './types';

export interface StructuresSystem {
  group: THREE.Group;
  colliders: WorldCollider[];
  interactables: InteractiveTarget[];
  update: (elapsed: number, dt: number) => void;
  dispose: () => void;
}

interface DoorAnimation {
  pivots: Array<{ mesh: THREE.Object3D; closedYaw: number; openYaw: number }>;
  isOpen: boolean;
  progress: number;
  colliderId?: string;
}

export function createStructures(
  materials: MaterialLibrary,
  mistTexture: THREE.Texture,
  onDoorAudio: (opening: boolean) => void
): StructuresSystem {
  const group = new THREE.Group();
  const colliders: WorldCollider[] = [];
  const interactables: InteractiveTarget[] = [];
  const disposables: Array<{ dispose: () => void }> = [];
  const doors: DoorAnimation[] = [];
  const animatedBanners: Array<{ mesh: THREE.Mesh; phase: number }> = [];
  const floatingIslands: Array<{ group: THREE.Group; baseY: number; phase: number; speed: number }> = [];
  const animatedLights: Array<{ light: THREE.PointLight; baseIntensity: number; phase: number }> = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };

  // Shared helper for a detailed multi-part Lantern Post
  function createLanternPost(x: number, y: number, z: number, addLight = false): THREE.Group {
    const g = new THREE.Group();
    g.position.set(x, y, z);

    const base = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.18, 0.24, 0.35, 8)), materials.castleTrimStone);
    base.position.y = 0.175;
    base.castShadow = true;
    base.receiveShadow = true;
    g.add(base);

    const post = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.07, 0.1, 2.35, 8)), materials.darkIron);
    post.position.y = 1.5;
    post.castShadow = true;
    g.add(post);

    const arm = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.5, 0.07, 0.07)), materials.darkIron);
    arm.position.set(0.22, 2.6, 0);
    g.add(arm);

    const housing = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.14, 0.11, 0.32, 6)), materials.lanternGlow);
    housing.position.set(0.42, 2.4, 0);
    g.add(housing);

    const cap = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.2, 0.16, 6)), materials.darkIron);
    cap.position.set(0.42, 2.63, 0);
    g.add(cap);

    if (addLight) {
      const pt = new THREE.PointLight(0xffb454, 4.5, 15, 1.8);
      pt.position.set(0.42, 2.38, 0);
      g.add(pt);
      animatedLights.push({ light: pt, baseIntensity: 4.5, phase: x * 0.7 + z * 0.3 });
    }

    return g;
  }

  // =========================================================================
  // 1. SUNLIT HARBOR PIER & MOORED ROWBOAT
  // =========================================================================
  const pierGroup = new THREE.Group();
  const pierY = 4.45;
  // Main timber deck from z = 90 to z = 112
  const deckMat = materials.wood;
  for (let z = 90.5; z <= 111.5; z += 1.0) {
    const plank = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.8, 0.24, 0.88)), deckMat);
    plank.position.set(0, pierY - 0.12, z);
    plank.castShadow = true;
    plank.receiveShadow = true;
    pierGroup.add(plank);
  }
  // Longitudinal support beams & pilings
  for (const sx of [-2.9, 2.9]) {
    const beam = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.36, 22.5)), materials.treeTrunk);
    beam.position.set(sx, pierY - 0.38, 101);
    pierGroup.add(beam);

    for (let pz = 92; pz <= 111; pz += 4.7) {
      const piling = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.22, 0.26, 7.6, 10)), materials.treeTrunk);
      piling.position.set(sx, pierY - 3.2, pz);
      piling.castShadow = true;
      piling.receiveShadow = true;
      pierGroup.add(piling);
    }
  }
  // Timber bollards & rope railing along pier sides
  for (const sx of [-3.1, 3.1]) {
    for (const pz of [94, 101, 108, 111.5]) {
      const bollard = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.16, 0.19, 0.95, 10)), materials.wood);
      bollard.position.set(sx, pierY + 0.45, pz);
      bollard.castShadow = true;
      pierGroup.add(bollard);

      const cap = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.19, 0.19, 0.12, 10)), materials.brassGold);
      cap.position.set(sx, pierY + 0.96, pz);
      pierGroup.add(cap);
    }
  }
  // Pier edge lantern posts
  pierGroup.add(createLanternPost(-2.9, pierY, 101, true));
  pierGroup.add(createLanternPost(2.9, pierY, 101, false));
  pierGroup.add(createLanternPost(-2.9, pierY, 92, false));
  pierGroup.add(createLanternPost(2.9, pierY, 92, true));

  // Moored Rowboat gently bobbing near the pier
  const boatGroup = new THREE.Group();
  boatGroup.position.set(6.2, 0.1, 105.5);
  boatGroup.rotation.y = -0.35;
  const hullGeo = trackGeo(new THREE.CylinderGeometry(1.1, 0.72, 4.2, 10, 1, false, 0, Math.PI));
  hullGeo.rotateZ(Math.PI / 2);
  hullGeo.rotateY(Math.PI / 2);
  const hull = new THREE.Mesh(hullGeo, materials.wood);
  hull.scale.set(1.0, 0.75, 1.0);
  hull.castShadow = true;
  boatGroup.add(hull);
  const seat1 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.65, 0.1, 0.35)), materials.treeTrunk);
  seat1.position.set(0, 0.12, -0.5);
  boatGroup.add(seat1);
  const seat2 = seat1.clone();
  seat2.position.z = 0.6;
  boatGroup.add(seat2);
  const oar = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.04, 0.04, 2.8, 6)), materials.wood);
  oar.rotation.z = Math.PI / 2.2;
  oar.position.set(0.3, 0.25, 0.1);
  boatGroup.add(oar);
  pierGroup.add(boatGroup);

  group.add(pierGroup);

  // =========================================================================
  // 2. CENTRAL OPEN PLAZA (0, 6.18, 32)
  // =========================================================================
  const plazaGroup = new THREE.Group();
  const px = LANDMARK_POSITIONS.plaza.x;
  const pz = LANDMARK_POSITIONS.plaza.z;
  const py = 6.18;
  plazaGroup.position.set(px, py, pz);

  // Stepped circular stone terrace
  const lowerStep = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(17.6, 18.4, 0.5, 48)), materials.castleTrimStone);
  lowerStep.position.y = -0.32;
  lowerStep.receiveShadow = true;
  plazaGroup.add(lowerStep);

  const mainDisc = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(16.6, 16.9, 0.35, 48)), materials.plazaStone);
  mainDisc.position.y = -0.175;
  mainDisc.receiveShadow = true;
  plazaGroup.add(mainDisc);

  // Central inlaid Compass Sun Medallion (polygonOffset prevents z-fighting)
  const medMesh = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(7.2, 48)), materials.plazaMedallion);
  medMesh.rotation.x = -Math.PI / 2;
  medMesh.position.y = 0.025;
  medMesh.receiveShadow = true;
  plazaGroup.add(medMesh);

  // Perimeter stone balustrade pillars with wide N/S/E/W entrance openings
  const pillarCount = 16;
  for (let i = 0; i < pillarCount; i++) {
    const a = (i / pillarCount) * Math.PI * 2;
    const deg = ((a * 180) / Math.PI + 360) % 360;
    // Leave wide entry corridors at 0, 90, 180, 270 degrees
    if (
      Math.abs(deg - 0) < 18 ||
      Math.abs(deg - 90) < 18 ||
      Math.abs(deg - 180) < 18 ||
      Math.abs(deg - 270) < 18 ||
      deg > 342
    ) {
      continue;
    }
    const rx = Math.cos(a) * 15.8;
    const rz = Math.sin(a) * 15.8;

    const col = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.32, 0.38, 1.35, 8)), materials.castleTrimStone);
    col.position.set(rx, 0.675, rz);
    col.castShadow = true;
    col.receiveShadow = true;
    plazaGroup.add(col);

    const cap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.82, 0.18, 0.82)), materials.castleStone);
    cap.position.set(rx, 1.4, rz);
    cap.castShadow = true;
    plazaGroup.add(cap);

    colliders.push({ type: 'cylinder', x: px + rx, z: pz + rz, radius: 0.55 });

    if (i % 2 === 1) {
      const orb = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.22, 0)), materials.lanternGlow);
      orb.position.set(rx, 1.72, rz);
      plazaGroup.add(orb);
    }
  }

  // 4 Carved Stone & Timber Benches around the plaza perimeter
  const benchAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
  for (const ba of benchAngles) {
    const bx = Math.cos(ba) * 12.6;
    const bz = Math.sin(ba) * 12.6;
    const bench = new THREE.Group();
    bench.position.set(bx, 0, bz);
    bench.rotation.y = -ba + Math.PI / 2;

    const legL = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.52, 0.72)), materials.castleTrimStone);
    legL.position.set(-1.1, 0.26, 0);
    legL.castShadow = true;
    bench.add(legL);

    const legR = legL.clone();
    legR.position.x = 1.1;
    bench.add(legR);

    const seat = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.8, 0.14, 0.82)), materials.wood);
    seat.position.set(0, 0.56, 0);
    seat.castShadow = true;
    bench.add(seat);

    const backrest = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.8, 0.52, 0.12)), materials.wood);
    backrest.position.set(0, 0.88, -0.34);
    backrest.castShadow = true;
    bench.add(backrest);

    plazaGroup.add(bench);
    colliders.push({ type: 'cylinder', x: px + bx, z: pz + bz, radius: 1.25 });
  }

  // Plaza corner lanterns
  plazaGroup.add(createLanternPost(-5.2, 0, 14.5, true));
  plazaGroup.add(createLanternPost(5.2, 0, -14.5, true));
  plazaGroup.add(createLanternPost(-14.5, 0, -4.5, false));
  plazaGroup.add(createLanternPost(14.5, 0, 4.5, false));

  group.add(plazaGroup);

  // =========================================================================
  // 3. GRAND FANTASY CASTLE ON CITADEL HILL (0, 18.0, -38)
  // =========================================================================
  const castleGroup = new THREE.Group();
  const cx = LANDMARK_POSITIONS.castle.x;
  const cy = 18.0;
  const cz = LANDMARK_POSITIONS.castle.z;
  castleGroup.position.set(cx, cy, cz);

  // Courtyard stone paving floor
  const courtyardFloor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(34, 0.35, 34)), materials.plazaStone);
  courtyardFloor.position.set(0, 0.05, 0);
  courtyardFloor.receiveShadow = true;
  castleGroup.add(courtyardFloor);

  // Helper to build crenellated curtain wall segment
  function addWallSegment(lx: number, lz: number, w: number, h: number, d: number, registerCollider = true) {
    const wall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, h, d)), materials.castleStone);
    wall.position.set(lx, h / 2, lz);
    wall.castShadow = true;
    wall.receiveShadow = true;
    castleGroup.add(wall);

    // Trim ledge
    const ledge = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w + 0.35, 0.4, d + 0.35)), materials.castleTrimStone);
    ledge.position.set(lx, h + 0.15, lz);
    ledge.castShadow = true;
    castleGroup.add(ledge);

    // Merlons (crenellations)
    const alongX = w > d;
    const span = alongX ? w : d;
    const merlonCount = Math.max(2, Math.floor(span / 2.6));
    for (let i = 0; i < merlonCount; i++) {
      const offset = -span / 2 + 1.1 + (i / Math.max(1, merlonCount - 1)) * (span - 2.2);
      const merlon = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(alongX ? 1.2 : d * 0.45, 1.0, alongX ? w * 0.04 + 0.5 : 1.2)),
        materials.castleStone
      );
      merlon.position.set(alongX ? lx + offset : lx, h + 0.85, alongX ? lz : lz + offset);
      merlon.castShadow = true;
      castleGroup.add(merlon);
    }

    if (registerCollider) {
      colliders.push({
        type: 'box',
        minX: cx + lx - w / 2 - 0.3,
        maxX: cx + lx + w / 2 + 0.3,
        minZ: cz + lz - d / 2 - 0.3,
        maxZ: cz + lz + d / 2 + 0.3,
      });
    }
  }

  // North, East, West Curtain Walls & South Wall split around Gatehouse
  addWallSegment(0, -17, 32, 7.5, 2.2);
  addWallSegment(-17, 0, 2.2, 7.5, 32);
  addWallSegment(17, 0, 2.2, 7.5, 32);
  addWallSegment(-10.5, 17, 11.5, 7.5, 2.2);
  addWallSegment(10.5, 17, 11.5, 7.5, 2.2);

  // 4 Corner Watchtowers
  function addCornerTower(lx: number, lz: number, height: number, radius: number) {
    const tGroup = new THREE.Group();
    tGroup.position.set(lx, 0, lz);

    const plinth = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(radius + 0.4, radius + 0.7, 2.0, 10)), materials.castleTrimStone);
    plinth.position.y = 1.0;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    tGroup.add(plinth);

    const shaft = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(radius, radius + 0.25, height, 10)), materials.castleStone);
    shaft.position.y = height / 2 + 1.5;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    tGroup.add(shaft);

    const gallery = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(radius + 0.55, radius + 0.15, 1.4, 10)), materials.castleTrimStone);
    gallery.position.y = height + 2.0;
    gallery.castShadow = true;
    tGroup.add(gallery);

    const roof = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(radius + 1.1, 5.4, 10)), materials.castleRoof);
    roof.position.y = height + 5.3;
    roof.castShadow = true;
    tGroup.add(roof);

    const finial = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.06, 0.14, 1.8, 8)), materials.brassGold);
    finial.position.y = height + 8.6;
    tGroup.add(finial);

    // Pennant banner
    const flag = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(1.8, 0.75, 4, 1)), materials.bannerBlue);
    flag.position.set(0.9, height + 9.0, 0);
    tGroup.add(flag);
    animatedBanners.push({ mesh: flag, phase: lx + lz });

    // Glowing tower windows
    for (let wi = 0; wi < 4; wi++) {
      const wa = (wi * Math.PI) / 2;
      const win = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.55, 1.1, 0.2)), materials.windowGlow);
      win.position.set(Math.sin(wa) * (radius + 0.05), height * 0.72, Math.cos(wa) * (radius + 0.05));
      win.rotation.y = wa;
      tGroup.add(win);
    }

    castleGroup.add(tGroup);
    colliders.push({ type: 'cylinder', x: cx + lx, z: cz + lz, radius: radius + 0.65 });
  }

  addCornerTower(-17, 17, 11.5, 2.8);
  addCornerTower(17, 17, 11.5, 2.8);
  addCornerTower(-17, -17, 13.0, 3.0);
  addCornerTower(17, -17, 13.0, 3.0);

  // Grand Gatehouse at South Wall (lx: 0, lz: 17 -> world z = -21)
  const gatehouse = new THREE.Group();
  gatehouse.position.set(0, 0, 17);

  // Flanking gate pillars & overhead bridge
  for (const gx of [-3.4, 3.4]) {
    const pier = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.1, 9.6, 3.2)), materials.castleTrimStone);
    pier.position.set(gx, 4.8, 0);
    pier.castShadow = true;
    pier.receiveShadow = true;
    gatehouse.add(pier);

    const turretRoof = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(1.65, 3.6, 8)), materials.castleRoof);
    turretRoof.position.set(gx, 11.4, 0);
    turretRoof.castShadow = true;
    gatehouse.add(turretRoof);

    colliders.push({
      type: 'box',
      minX: cx + gx - 1.2,
      maxX: cx + gx + 1.2,
      minZ: cz + 17 - 1.8,
      maxZ: cz + 17 + 1.8,
    });
  }

  const gateLintels = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.8, 3.6, 3.0)), materials.castleStone);
  gateLintels.position.set(0, 8.2, 0);
  gateLintels.castShadow = true;
  gatehouse.add(gateLintels);

  // Royal Gold Crest above gate
  const crest = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.65, 0)), materials.brassGold);
  crest.position.set(0, 8.3, 1.62);
  crest.scale.set(1, 1.35, 0.4);
  gatehouse.add(crest);

  // Gatehouse glowing wall torches
  gatehouse.add(createLanternPost(-4.3, 0, 2.6, true));
  gatehouse.add(createLanternPost(4.3, 0, 2.6, false));

  // Interactive Double Oak & Iron Castle Doors
  const leftDoorPivot = new THREE.Group();
  leftDoorPivot.position.set(-2.3, 0.1, 0);
  const leftDoorLeaf = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.28, 6.2, 0.28)), materials.wood);
  leftDoorLeaf.position.set(1.14, 3.1, 0);
  leftDoorLeaf.castShadow = true;
  leftDoorPivot.add(leftDoorLeaf);
  const leftStrap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.2, 0.24, 0.34)), materials.darkIron);
  leftStrap.position.set(1.14, 1.8, 0);
  leftDoorPivot.add(leftStrap);
  const leftStrap2 = leftStrap.clone();
  leftStrap2.position.y = 4.4;
  leftDoorPivot.add(leftStrap2);
  gatehouse.add(leftDoorPivot);

  const rightDoorPivot = new THREE.Group();
  rightDoorPivot.position.set(2.3, 0.1, 0);
  const rightDoorLeaf = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.28, 6.2, 0.28)), materials.wood);
  rightDoorLeaf.position.set(-1.14, 3.1, 0);
  rightDoorLeaf.castShadow = true;
  rightDoorPivot.add(rightDoorLeaf);
  const rightStrap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.2, 0.24, 0.34)), materials.darkIron);
  rightStrap.position.set(-1.14, 1.8, 0);
  rightDoorPivot.add(rightStrap);
  const rightStrap2 = rightStrap.clone();
  rightStrap2.position.y = 4.4;
  rightDoorPivot.add(rightStrap2);
  gatehouse.add(rightDoorPivot);

  const gateColliderId = 'castle-gate-door';
  colliders.push({
    id: gateColliderId,
    type: 'box',
    minX: cx - 2.35,
    maxX: cx + 2.35,
    minZ: cz + 16.2,
    maxZ: cz + 17.8,
    disabled: false,
  });

  const castleDoorState: DoorAnimation = {
    pivots: [
      { mesh: leftDoorPivot, closedYaw: 0, openYaw: -Math.PI * 0.48 },
      { mesh: rightDoorPivot, closedYaw: 0, openYaw: Math.PI * 0.48 },
    ],
    isOpen: false,
    progress: 0,
    colliderId: gateColliderId,
  };
  doors.push(castleDoorState);

  interactables.push({
    id: 'interact-castle-gate',
    kind: 'door',
    title: 'Citadel Gate',
    prompt: 'Open Castle Gate',
    worldPos: new THREE.Vector3(cx, cy + 2.0, cz + 17),
    radius: 6.0,
    hitMesh: gatehouse,
    onInteract: () => {
      castleDoorState.isOpen = !castleDoorState.isOpen;
      onDoorAudio(castleDoorState.isOpen);
      const target = interactables.find((i) => i.id === 'interact-castle-gate');
      if (target) {
        target.prompt = castleDoorState.isOpen ? 'Close Castle Gate' : 'Open Castle Gate';
      }
    },
  });

  castleGroup.add(gatehouse);

  // Towering Central Grand Keep (lx: 0, lz: -5)
  const keepGroup = new THREE.Group();
  keepGroup.position.set(0, 0, -5);

  const keepBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(14.5, 13.5, 12.5)), materials.castleStone);
  keepBase.position.y = 6.75;
  keepBase.castShadow = true;
  keepBase.receiveShadow = true;
  keepGroup.add(keepBase);

  // Corner buttresses on Keep
  for (const bx of [-7.1, 7.1]) {
    for (const bz of [-6.1, 6.1]) {
      const buttress = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.6, 14.5, 1.6)), materials.castleTrimStone);
      buttress.position.set(bx, 7.25, bz);
      buttress.castShadow = true;
      keepGroup.add(buttress);
    }
  }

  // Grand Keep Upper Roof & Spire
  const keepRoof = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(9.6, 7.8, 4)), materials.castleRoof);
  keepRoof.rotation.y = Math.PI / 4;
  keepRoof.position.y = 17.3;
  keepRoof.castShadow = true;
  keepGroup.add(keepRoof);

  // Tall Central Bell Spire
  const spireShaft = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(2.6, 3.2, 8.5, 8)), materials.castleTrimStone);
  spireShaft.position.set(0, 18.0, 0);
  spireShaft.castShadow = true;
  keepGroup.add(spireShaft);

  const spireCone = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(3.4, 7.2, 8)), materials.castleRoof);
  spireCone.position.set(0, 25.5, 0);
  spireCone.castShadow = true;
  keepGroup.add(spireCone);

  const spireGold = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.22, 2.4, 8)), materials.brassGold);
  spireGold.position.set(0, 29.8, 0);
  keepGroup.add(spireGold);

  const spireFlag = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(2.8, 1.1, 5, 1)), materials.bannerGold);
  spireFlag.position.set(1.4, 30.3, 0);
  keepGroup.add(spireFlag);
  animatedBanners.push({ mesh: spireFlag, phase: 2.1 });

  // Rose Window & Arched Stained-Glass Windows on Keep facade
  const roseWin = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(1.85, 1.85, 0.35, 16)), materials.windowGlow);
  roseWin.rotation.x = Math.PI / 2;
  roseWin.position.set(0, 9.5, 6.22);
  keepGroup.add(roseWin);

  const roseFrame = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(1.9, 0.22, 8, 24)), materials.castleTrimStone);
  roseFrame.position.set(0, 9.5, 6.32);
  keepGroup.add(roseFrame);

  for (const wx of [-4.2, 4.2]) {
    const tallWin = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.2, 3.2, 0.3)), materials.windowGlow);
    tallWin.position.set(wx, 8.2, 6.24);
    keepGroup.add(tallWin);
  }

  // Keep Front Portico & Arch
  const portico = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.6, 5.2, 2.2)), materials.castleTrimStone);
  portico.position.set(0, 2.6, 6.8);
  portico.castShadow = true;
  keepGroup.add(portico);
  const keepDoor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.6, 3.8, 0.4)), materials.wood);
  keepDoor.position.set(0, 1.9, 7.8);
  keepGroup.add(keepDoor);

  castleGroup.add(keepGroup);
  colliders.push({
    type: 'box',
    minX: cx - 7.8,
    maxX: cx + 7.8,
    minZ: cz - 12.2,
    maxZ: cz + 2.4,
  });

  // Inner Courtyard Crystal Pedestal Fountain (lx: 0, lz: 6)
  const fountGroup = new THREE.Group();
  fountGroup.position.set(0, 0.15, 7.5);
  const basin = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(2.5, 2.8, 0.75, 16)), materials.castleTrimStone);
  basin.position.y = 0.375;
  basin.castShadow = true;
  basin.receiveShadow = true;
  fountGroup.add(basin);
  const ped = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.6, 0.85, 1.6, 10)), materials.castleStone);
  ped.position.y = 1.2;
  fountGroup.add(ped);
  const fCrystal = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.65, 0)), materials.crystalCyan);
  fCrystal.position.y = 2.55;
  fCrystal.scale.set(0.85, 1.45, 0.85);
  fountGroup.add(fCrystal);
  castleGroup.add(fountGroup);
  colliders.push({ type: 'cylinder', x: cx, z: cz + 7.5, radius: 2.8 });

  group.add(castleGroup);

  // =========================================================================
  // 4. NATURAL STONE ARCH BRIDGES (x2)
  // =========================================================================
  function createStoneBridge(bx: number, bz: number, baseDeckY: number, archRise: number) {
    const bGroup = new THREE.Group();
    bGroup.position.set(bx, 0, bz);

    const span = 15.0;
    const width = 4.6;
    const steps = 14;

    for (let i = 0; i < steps; i++) {
      const t0 = (i / steps) * 2 - 1;
      const t1 = ((i + 1) / steps) * 2 - 1;
      const tm = (t0 + t1) * 0.5;
      const xPos = tm * (span * 0.5);
      const yPos = baseDeckY + (1 - tm * tm) * archRise;
      const slopeAngle = Math.atan2(-2 * tm * archRise, span * 0.5);

      const segLen = span / steps + 0.16;
      const deckSeg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(segLen, 0.55, width)), materials.plazaStone);
      deckSeg.position.set(xPos, yPos - 0.25, 0);
      deckSeg.rotation.z = slopeAngle;
      deckSeg.castShadow = true;
      deckSeg.receiveShadow = true;
      bGroup.add(deckSeg);

      // Side stone parapets
      for (const pzSide of [-width * 0.48, width * 0.48]) {
        const parapet = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(segLen * 0.92, 0.82, 0.38)), materials.castleStone);
        parapet.position.set(xPos, yPos + 0.36, pzSide);
        parapet.rotation.z = slopeAngle;
        parapet.castShadow = true;
        bGroup.add(parapet);
      }
    }

    // Bridge end abutment boulders & lantern posts
    for (const endX of [-span * 0.48, span * 0.48]) {
      for (const endZ of [-width * 0.5, width * 0.5]) {
        const post = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.68, 1.35, 0.68)), materials.castleTrimStone);
        post.position.set(endX, baseDeckY + 0.45, endZ);
        post.castShadow = true;
        bGroup.add(post);
      }
    }
    bGroup.add(createLanternPost(-span * 0.46, baseDeckY + 0.05, -width * 0.48, false));
    bGroup.add(createLanternPost(span * 0.46, baseDeckY + 0.05, width * 0.48, true));

    // Parapet guard colliders so player walks cleanly across the deck without falling off sides
    colliders.push({
      type: 'box',
      minX: bx - span * 0.48,
      maxX: bx + span * 0.48,
      minZ: bz - width * 0.56,
      maxZ: bz - width * 0.42,
    });
    colliders.push({
      type: 'box',
      minX: bx - span * 0.48,
      maxX: bx + span * 0.48,
      minZ: bz + width * 0.42,
      maxZ: bz + width * 0.56,
    });

    group.add(bGroup);
  }

  createStoneBridge(LANDMARK_POSITIONS.bridge1.x, LANDMARK_POSITIONS.bridge1.z, 4.65, 1.45);
  createStoneBridge(LANDMARK_POSITIONS.bridge2.x, LANDMARK_POSITIONS.bridge2.z, 3.4, 1.35);

  // =========================================================================
  // 5. FANTASY COTTAGES (x2) & HARBOR BOATHOUSE PAVILION
  // =========================================================================
  function createCottage(
    id: string,
    x: number,
    z: number,
    rotY: number,
    scale = 1.0,
    withLight = true
  ) {
    const baseY = terrainHeightAt(x, z);
    const cot = new THREE.Group();
    cot.position.set(x, baseY, z);
    cot.rotation.y = rotY;
    cot.scale.setScalar(scale);

    // Stone foundation plinth sunk 1.2 units into terrain so slopes never gap
    const plinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.2, 1.8, 5.8)), materials.castleStone);
    plinth.position.y = -0.35;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    cot.add(plinth);

    // Timber-framed Plaster Main Body
    const body = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.6, 3.5, 5.2)), materials.plaster);
    body.position.y = 2.25;
    body.castShadow = true;
    body.receiveShadow = true;
    cot.add(body);

    // Timber corner & mid beams
    for (const bx of [-3.3, 0, 3.3]) {
      for (const bz of [-2.6, 2.6]) {
        if (bx === 0 && bz === 2.6) continue;
        const beam = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.24, 3.6, 0.24)), materials.treeTrunk);
        beam.position.set(bx, 2.25, bz);
        beam.castShadow = true;
        cot.add(beam);
      }
    }

    // Pitched Shingled Fantasy Roof (2 sloped planes + gable fill)
    const roofL = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.6, 0.26, 4.2)), materials.cottageRoof);
    roofL.position.set(0, 5.05, -1.55);
    roofL.rotation.x = Math.PI * 0.24;
    roofL.castShadow = true;
    cot.add(roofL);

    const roofR = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.6, 0.26, 4.2)), materials.cottageRoof);
    roofR.position.set(0, 5.05, 1.55);
    roofR.rotation.x = -Math.PI * 0.24;
    roofR.castShadow = true;
    cot.add(roofR);

    // Gable end triangles
    const gableGeo = trackGeo(new THREE.ConeGeometry(2.9, 2.6, 4));
    gableGeo.rotateY(Math.PI / 4);
    const gable = new THREE.Mesh(gableGeo, materials.plaster);
    gable.scale.set(1.6, 1.0, 1.26);
    gable.position.set(0, 5.1, 0);
    cot.add(gable);

    // Stone Chimney
    const chimney = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.05, 4.8, 1.05)), materials.castleTrimStone);
    chimney.position.set(-2.3, 5.1, -1.3);
    chimney.castShadow = true;
    cot.add(chimney);

    // Glowing Leaded Windows
    const winFront = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.1, 1.1, 0.16)), materials.windowGlow);
    winFront.position.set(1.75, 2.4, 2.62);
    cot.add(winFront);
    const winSide = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.16, 1.1, 1.1)), materials.windowGlow);
    winSide.position.set(3.32, 2.4, 0);
    cot.add(winSide);
    const winSideL = winSide.clone();
    winSideL.position.x = -3.32;
    cot.add(winSideL);

    // Front Porch Awning & Steps
    const porchRoof = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.6, 0.16, 1.6)), materials.wood);
    porchRoof.position.set(-1.1, 3.25, 3.2);
    porchRoof.rotation.x = 0.22;
    porchRoof.castShadow = true;
    cot.add(porchRoof);

    // Interactive Cottage Door
    const doorPivot = new THREE.Group();
    doorPivot.position.set(-1.75, 0.55, 2.64);
    const doorMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.26, 2.35, 0.16)), materials.wood);
    doorMesh.position.set(0.63, 1.17, 0);
    doorMesh.castShadow = true;
    doorPivot.add(doorMesh);
    const knob = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.08, 8, 8)), materials.brassGold);
    knob.position.set(1.08, 1.1, 0.1);
    doorPivot.add(knob);
    cot.add(doorPivot);

    const doorAnim: DoorAnimation = {
      pivots: [{ mesh: doorPivot, closedYaw: 0, openYaw: -Math.PI * 0.52 }],
      isOpen: false,
      progress: 0,
    };
    doors.push(doorAnim);

    const doorWorldPos = new THREE.Vector3(-1.1 * scale, 1.8 * scale, 3.1 * scale).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      rotY
    );
    doorWorldPos.add(new THREE.Vector3(x, baseY, z));

    interactables.push({
      id: `door-${id}`,
      kind: 'door',
      title: 'Cottage Door',
      prompt: 'Open Cottage Door',
      worldPos: doorWorldPos,
      radius: 4.0,
      hitMesh: doorMesh,
      onInteract: () => {
        doorAnim.isOpen = !doorAnim.isOpen;
        onDoorAudio(doorAnim.isOpen);
        const item = interactables.find((i) => i.id === `door-${id}`);
        if (item) {
          item.prompt = doorAnim.isOpen ? 'Close Cottage Door' : 'Open Cottage Door';
        }
      },
    });

    // Barrels & Warm Hanging Lantern by porch
    const barrel = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.42, 0.38, 0.95, 10)), materials.wood);
    barrel.position.set(2.4, 1.0, 3.1);
    barrel.castShadow = true;
    cot.add(barrel);

    const lantern = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.14, 0.1, 0.28, 6)), materials.lanternGlow);
    lantern.position.set(-2.1, 2.75, 3.4);
    cot.add(lantern);

    if (withLight) {
      const pLight = new THREE.PointLight(0xffaa44, 4.0, 14, 1.8);
      pLight.position.set(-2.1, 2.6, 3.5);
      cot.add(pLight);
      animatedLights.push({ light: pLight, baseIntensity: 4.0, phase: x });
    }

    group.add(cot);
    // Approximate cylinder collider around cottage footprint
    colliders.push({ type: 'cylinder', x, z, radius: 4.4 * scale });
  }

  createCottage('artisan', LANDMARK_POSITIONS.cottage1.x, LANDMARK_POSITIONS.cottage1.z, -Math.PI * 0.68, 1.05, true);
  createCottage('alchemist', LANDMARK_POSITIONS.cottage2.x, LANDMARK_POSITIONS.cottage2.z, -Math.PI * 0.78, 0.95, false);

  // Harbor Boathouse Pavilion (28, 2.8, 68)
  const bhX = LANDMARK_POSITIONS.boathouse.x;
  const bhZ = LANDMARK_POSITIONS.boathouse.z;
  const bhY = terrainHeightAt(bhX, bhZ);
  const bhGroup = new THREE.Group();
  bhGroup.position.set(bhX, bhY, bhZ);
  bhGroup.rotation.y = -0.5;

  const bhDeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.2, 0.6, 5.2)), materials.wood);
  bhDeck.position.y = 0.2;
  bhDeck.castShadow = true;
  bhDeck.receiveShadow = true;
  bhGroup.add(bhDeck);

  for (const pxOff of [-2.6, 2.6]) {
    for (const pzOff of [-2.1, 2.1]) {
      const post = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.14, 0.16, 3.3, 8)), materials.treeTrunk);
      post.position.set(pxOff, 1.9, pzOff);
      post.castShadow = true;
      bhGroup.add(post);
      colliders.push({ type: 'cylinder', x: bhX + pxOff * 0.85, z: bhZ + pzOff * 0.85, radius: 0.45 });
    }
  }
  const bhRoof = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(4.6, 2.2, 4)), materials.cottageRoof);
  bhRoof.rotation.y = Math.PI / 4;
  bhRoof.position.y = 4.4;
  bhRoof.castShadow = true;
  bhGroup.add(bhRoof);

  const bhLantern = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.22, 0)), materials.lanternGlow);
  bhLantern.position.set(0, 3.1, 2.1);
  bhGroup.add(bhLantern);

  group.add(bhGroup);

  // =========================================================================
  // 6. MYSTERIOUS CRYSTAL CAVE GROTTO (-64, 4.5, 38)
  // =========================================================================
  const gx = LANDMARK_POSITIONS.grotto.x;
  const gz = LANDMARK_POSITIONS.grotto.z;
  const gy = terrainHeightAt(gx, gz);
  const grottoGroup = new THREE.Group();
  grottoGroup.position.set(gx, gy, gz);

  // Sculpted boulder arch framing the cave opening facing +X
  const archOffsets: Array<[number, number, number, number, number, number]> = [
    [-2.5, 2.2, -3.4, 3.2, 3.4, 2.8],
    [-2.5, 2.2, 3.4, 3.2, 3.4, 2.8],
    [-2.8, 5.2, 0, 3.6, 2.6, 4.8],
    [-6.0, 2.8, -2.5, 3.6, 4.0, 3.2],
    [-6.0, 2.8, 2.5, 3.6, 4.0, 3.2],
    [-7.2, 3.0, 0, 3.2, 4.8, 4.5], // Back wall of cave
  ];

  for (const [ax, ay, az, sx, sy, sz] of archOffsets) {
    const boulder = new THREE.Mesh(trackGeo(new THREE.DodecahedronGeometry(1, 1)), materials.rock);
    boulder.position.set(ax, ay, az);
    boulder.scale.set(sx, sy, sz);
    boulder.rotation.set(ax * 0.2, az * 0.3, ay * 0.15);
    boulder.castShadow = true;
    boulder.receiveShadow = true;
    grottoGroup.add(boulder);
  }

  // Carved ancient entrance stone rune pillars
  for (const pzOff of [-2.4, 2.4]) {
    const rPillar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.95, 3.8, 0.95)), materials.castleTrimStone);
    rPillar.position.set(0.2, 1.9, pzOff);
    rPillar.castShadow = true;
    grottoGroup.add(rPillar);

    const runeCap = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.32, 0)), materials.crystalViolet);
    runeCap.position.set(0.2, 4.15, pzOff);
    grottoGroup.add(runeCap);
    colliders.push({ type: 'cylinder', x: gx + 0.2, z: gz + pzOff, radius: 0.75 });
  }

  // Glowing Crystal Clusters deep inside the Grotto
  const randCave = seededRandom(7711);
  for (let i = 0; i < 10; i++) {
    const cMat = i % 2 === 0 ? materials.crystalCyan : materials.crystalViolet;
    const h = 0.85 + randCave() * 1.4;
    const cShard = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.28 + randCave() * 0.18, h, 5)), cMat);
    cShard.position.set(-4.0 - randCave() * 1.6, h * 0.45, (randCave() - 0.5) * 3.8);
    cShard.rotation.set((randCave() - 0.5) * 0.5, randCave() * Math.PI, (randCave() - 0.5) * 0.5);
    grottoGroup.add(cShard);
  }

  const grottoLight = new THREE.PointLight(0x52e5ff, 6.5, 16, 1.7);
  grottoLight.position.set(-4.2, 2.4, 0);
  grottoGroup.add(grottoLight);
  animatedLights.push({ light: grottoLight, baseIntensity: 6.5, phase: 1.4 });

  // Back wall collider so player can walk inside grotto up to x = gx - 4.4
  colliders.push({
    type: 'box',
    minX: gx - 9.0,
    maxX: gx - 4.6,
    minZ: gz - 4.5,
    maxZ: gz + 4.5,
  });
  colliders.push({
    type: 'box',
    minX: gx - 4.8,
    maxX: gx - 0.5,
    minZ: gz - 5.2,
    maxZ: gz - 2.3,
  });
  colliders.push({
    type: 'box',
    minX: gx - 4.8,
    maxX: gx - 0.5,
    minZ: gz + 2.3,
    maxZ: gz + 5.2,
  });

  group.add(grottoGroup);

  // =========================================================================
  // 7. DISTANT FLOATING SKY ISLANDS (x5)
  // =========================================================================
  const islandSpecs = [
    { x: -88, y: 46, z: -72, scale: 1.25, phase: 0.4 },
    { x: 84, y: 52, z: -56, scale: 1.1, phase: 1.7 },
    { x: 98, y: 40, z: 32, scale: 0.9, phase: 2.9 },
    { x: -98, y: 54, z: 14, scale: 1.0, phase: 4.1 },
    { x: 18, y: 62, z: -118, scale: 1.45, phase: 5.2 },
  ];

  for (const spec of islandSpecs) {
    const fi = new THREE.Group();
    fi.position.set(spec.x, spec.y, spec.z);
    fi.scale.setScalar(spec.scale);

    // Inverted tapered rocky spire underneath
    const rockUnderside = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(8.5, 13.5, 7)), materials.rock);
    rockUnderside.rotation.x = Math.PI;
    rockUnderside.position.y = -6.7;
    rockUnderside.castShadow = false;
    fi.add(rockUnderside);

    // Lush emerald cap
    const turfCap = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(8.8, 8.2, 1.4, 9)), materials.foliageCanopy);
    turfCap.position.y = 0.5;
    fi.add(turfCap);

    // Hanging glowing crystal root
    const hangCrystal = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(1.1, 3.8, 5)), materials.crystalCyan);
    hangCrystal.rotation.x = Math.PI;
    hangCrystal.position.y = -14.2;
    fi.add(hangCrystal);

    // Mini ancient stone arch & trees on top
    const miniTreeTrunk = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.35, 0.5, 3.2, 6)), materials.treeTrunk);
    miniTreeTrunk.position.set(-2.2, 2.4, 1.1);
    fi.add(miniTreeTrunk);
    const miniCrown = new THREE.Mesh(trackGeo(new THREE.DodecahedronGeometry(2.3, 1)), materials.foliageCanopy);
    miniCrown.position.set(-2.2, 4.6, 1.1);
    fi.add(miniCrown);

    const archL = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.75, 3.6, 0.75)), materials.castleTrimStone);
    archL.position.set(2.0, 2.8, -1.0);
    fi.add(archL);
    const archR = archL.clone();
    archR.position.set(4.2, 2.8, -1.0);
    fi.add(archR);
    const archTop = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.2, 0.75, 0.9)), materials.castleTrimStone);
    archTop.position.set(3.1, 4.7, -1.0);
    fi.add(archTop);

    group.add(fi);
    floatingIslands.push({ group: fi, baseY: spec.y, phase: spec.phase, speed: 0.55 + spec.scale * 0.12 });
  }

  // Prevent unused import lint warning if mistTexture used in future chimney smoke
  void mistTexture;

  return {
    group,
    colliders,
    interactables,
    update: (elapsed: number, dt: number) => {
      // Smoothly animate doors & toggle colliders
      for (let i = 0; i < doors.length; i++) {
        const d = doors[i];
        const target = d.isOpen ? 1 : 0;
        d.progress = THREE.MathUtils.damp(d.progress, target, 6.5, dt);
        for (let p = 0; p < d.pivots.length; p++) {
          const piv = d.pivots[p];
          piv.mesh.rotation.y = THREE.MathUtils.lerp(piv.closedYaw, piv.openYaw, d.progress);
        }
        if (d.colliderId) {
          const col = colliders.find((c) => c.type === 'box' && c.id === d.colliderId);
          if (col && col.type === 'box') {
            col.disabled = d.progress > 0.55;
          }
        }
      }

      // Bob moored rowboat gently
      boatGroup.position.y = 0.08 + Math.sin(elapsed * 1.6) * 0.09;
      boatGroup.rotation.z = Math.sin(elapsed * 1.3) * 0.04;
      boatGroup.rotation.x = Math.cos(elapsed * 1.1) * 0.025;

      // Flutter castle banners
      for (let i = 0; i < animatedBanners.length; i++) {
        const b = animatedBanners[i];
        b.mesh.rotation.y = Math.sin(elapsed * 3.4 + b.phase) * 0.16;
      }

      // Hover floating islands
      for (let i = 0; i < floatingIslands.length; i++) {
        const fi = floatingIslands[i];
        fi.group.position.y = fi.baseY + Math.sin(elapsed * fi.speed + fi.phase) * 1.35;
        fi.group.rotation.y = Math.sin(elapsed * 0.12 + fi.phase) * 0.08;
      }

      // Subtle warm lantern shimmer
      for (let i = 0; i < animatedLights.length; i++) {
        const al = animatedLights[i];
        al.light.intensity = al.baseIntensity + Math.sin(elapsed * 6.5 + al.phase) * 0.35;
      }
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
