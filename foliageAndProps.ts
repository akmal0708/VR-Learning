import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from './materials';
import { seededRandom } from './noise';
import { getPathFactor, LANDMARK_POSITIONS, riverCenterX, terrainHeightAt } from './terrainMath';
import type { InteractiveTarget, SignboardContent, WorldCollider } from './types';

export interface FoliageAndPropsSystem {
  group: THREE.Group;
  colliders: WorldCollider[];
  interactables: InteractiveTarget[];
  totalCrystals: number;
  update: (elapsed: number, dt: number) => void;
  dispose: () => void;
}

export function createFoliageAndProps(
  materials: MaterialLibrary,
  particleTex: THREE.Texture,
  onOpenSignboard: (content: SignboardContent) => void,
  onCollectCrystal: (id: string, totalCollected: number) => void
): FoliageAndPropsSystem {
  const group = new THREE.Group();
  const colliders: WorldCollider[] = [];
  const interactables: InteractiveTarget[] = [];
  const disposables: Array<{ dispose: () => void }> = [];
  const rand = seededRandom(55123);

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };

  function isClearOfLandmarks(x: number, z: number, minPathDist = 0.25): boolean {
    if (getPathFactor(x, z) > minPathDist) return false;
    if (Math.hypot(x - LANDMARK_POSITIONS.plaza.x, z - LANDMARK_POSITIONS.plaza.z) < 20.5) return false;
    if (Math.hypot(x - LANDMARK_POSITIONS.castle.x, z - LANDMARK_POSITIONS.castle.z) < 27.5) return false;
    if (Math.hypot(x - LANDMARK_POSITIONS.lake.x, z - LANDMARK_POSITIONS.lake.z) < 21.5) return false;
    if (Math.hypot(x - LANDMARK_POSITIONS.cottage1.x, z - LANDMARK_POSITIONS.cottage1.z) < 9.5) return false;
    if (Math.hypot(x - LANDMARK_POSITIONS.cottage2.x, z - LANDMARK_POSITIONS.cottage2.z) < 8.5) return false;
    if (Math.hypot(x - LANDMARK_POSITIONS.boathouse.x, z - LANDMARK_POSITIONS.boathouse.z) < 7.5) return false;
    if (Math.hypot(x - LANDMARK_POSITIONS.grotto.x, z - LANDMARK_POSITIONS.grotto.z) < 10.5) return false;
    if (Math.abs(x) < 9.5 && z > -22 && z < 114) return false; // Ramp & Pier corridor
    if (z > 8 && z < 84 && Math.abs(x - riverCenterX(z)) < 6.8) return false; // River corridor
    return true;
  }

  // =========================================================================
  // 1. INSTANCED TROPICAL PALMS (Curved Trunk + Multi-Frond Crown)
  // =========================================================================
  const trunkSegs: THREE.BufferGeometry[] = [];
  let ty = 0;
  let tx = 0;
  for (let s = 0; s < 5; s++) {
    const segH = 1.35;
    const rBot = 0.28 - s * 0.032;
    const rTop = 0.24 - s * 0.032;
    const seg = new THREE.CylinderGeometry(rTop, rBot, segH, 7);
    seg.rotateZ(-0.07 * s);
    seg.translate(tx + s * 0.11, ty + segH * 0.5, 0);
    trunkSegs.push(seg);
    ty += segH * 0.94;
    tx += s * 0.11;
  }
  const palmTrunkGeo = trackGeo(mergeGeometries(trunkSegs));
  trunkSegs.forEach((g) => g.dispose());

  // Multi-frond arched palm crown
  const frondGeos: THREE.BufferGeometry[] = [];
  const crownCenterX = tx + 0.35;
  const crownCenterY = ty - 0.1;
  const frondCount = 8;
  for (let f = 0; f < frondCount; f++) {
    const a = (f / frondCount) * Math.PI * 2;
    const blade = new THREE.PlaneGeometry(0.95, 3.4, 2, 5);
    const pos = blade.attributes.position as THREE.BufferAttribute;
    for (let vi = 0; vi < pos.count; vi++) {
      const py = pos.getY(vi) + 1.7; // 0 to 3.4 along blade
      const px = pos.getX(vi);
      const t = py / 3.4;
      const taper = Math.sin(t * Math.PI);
      const droop = -Math.pow(t, 1.8) * 1.45 + Math.sin(t * Math.PI) * 0.55;
      pos.setXYZ(vi, px * taper, droop, py);
    }
    blade.computeVertexNormals();
    blade.rotateY(a);
    blade.translate(crownCenterX, crownCenterY, 0);
    frondGeos.push(blade);
  }
  const palmCrownGeo = trackGeo(mergeGeometries(frondGeos));
  frondGeos.forEach((g) => g.dispose());

  const palmPlacements: Array<{ x: number; y: number; z: number; rot: number; scale: number }> = [];
  for (let attempt = 0; attempt < 420 && palmPlacements.length < 52; attempt++) {
    const a = rand() * Math.PI * 2;
    const r = 38 + rand() * 72;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = terrainHeightAt(x, z);
    if (y > 0.7 && y < 6.2 && isClearOfLandmarks(x, z, 0.2)) {
      if (palmPlacements.every((p) => Math.hypot(p.x - x, p.z - z) > 6.5)) {
        palmPlacements.push({ x, y: y - 0.25, z, rot: rand() * Math.PI * 2, scale: 0.85 + rand() * 0.45 });
      }
    }
  }

  const palmTrunks = new THREE.InstancedMesh(palmTrunkGeo, materials.palmTrunk, palmPlacements.length);
  const palmCrowns = new THREE.InstancedMesh(palmCrownGeo, materials.palmFrond, palmPlacements.length);
  palmTrunks.castShadow = true;
  palmTrunks.receiveShadow = true;
  palmCrowns.castShadow = true;

  const dummy = new THREE.Object3D();
  const cTmp = new THREE.Color();
  for (let i = 0; i < palmPlacements.length; i++) {
    const p = palmPlacements[i];
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, p.rot, 0);
    dummy.scale.setScalar(p.scale);
    dummy.updateMatrix();
    palmTrunks.setMatrixAt(i, dummy.matrix);
    palmCrowns.setMatrixAt(i, dummy.matrix);

    cTmp.setHSL(0.31 + (rand() - 0.5) * 0.04, 0.55 + rand() * 0.12, 0.42 + rand() * 0.1);
    palmCrowns.setColorAt(i, cTmp);
    colliders.push({ type: 'cylinder', x: p.x, z: p.z, radius: 0.5 * p.scale });
  }
  palmTrunks.instanceMatrix.needsUpdate = true;
  palmCrowns.instanceMatrix.needsUpdate = true;
  if (palmCrowns.instanceColor) palmCrowns.instanceColor.needsUpdate = true;
  palmTrunks.computeBoundingSphere();
  palmCrowns.computeBoundingSphere();
  group.add(palmTrunks, palmCrowns);

  // =========================================================================
  // 2. INSTANCED TROPICAL BROADLEAF TREES (Tapered Trunk + Layered Canopy)
  // =========================================================================
  const treeTrunkParts: THREE.BufferGeometry[] = [];
  const mainStem = new THREE.CylinderGeometry(0.32, 0.58, 4.4, 7);
  mainStem.translate(0, 2.2, 0);
  treeTrunkParts.push(mainStem);
  const root1 = new THREE.CylinderGeometry(0.16, 0.34, 1.5, 5);
  root1.rotateZ(0.45);
  root1.translate(-0.38, 0.55, 0.1);
  treeTrunkParts.push(root1);
  const root2 = new THREE.CylinderGeometry(0.16, 0.34, 1.5, 5);
  root2.rotateZ(-0.42);
  root2.translate(0.36, 0.55, -0.15);
  treeTrunkParts.push(root2);
  const broadTrunkGeo = trackGeo(mergeGeometries(treeTrunkParts));
  treeTrunkParts.forEach((g) => g.dispose());

  const canopyParts: THREE.BufferGeometry[] = [];
  const puffOffsets: Array<[number, number, number, number]> = [
    [0, 5.2, 0, 2.45],
    [-1.4, 4.6, 0.7, 1.75],
    [1.45, 4.7, -0.6, 1.8],
    [0.2, 4.5, 1.35, 1.7],
    [-0.3, 6.4, -0.2, 1.65],
  ];
  for (const [cx, cy, cz, cr] of puffOffsets) {
    const puff = new THREE.IcosahedronGeometry(cr, 1);
    puff.scale(1.12, 0.84, 1.12);
    puff.translate(cx, cy, cz);
    canopyParts.push(puff);
  }
  const broadCanopyGeo = trackGeo(mergeGeometries(canopyParts));
  canopyParts.forEach((g) => g.dispose());

  const treePlacements: Array<{ x: number; y: number; z: number; rot: number; scale: number }> = [];
  for (let attempt = 0; attempt < 600 && treePlacements.length < 78; attempt++) {
    const x = (rand() - 0.5) * 185;
    const z = (rand() - 0.5) * 180;
    const y = terrainHeightAt(x, z);
    if (y > 3.5 && y < 19.5 && isClearOfLandmarks(x, z, 0.2)) {
      if (treePlacements.every((p) => Math.hypot(p.x - x, p.z - z) > 7.5)) {
        treePlacements.push({ x, y: y - 0.3, z, rot: rand() * Math.PI * 2, scale: 0.82 + rand() * 0.52 });
      }
    }
  }

  const broadTrunks = new THREE.InstancedMesh(broadTrunkGeo, materials.treeTrunk, treePlacements.length);
  const broadCanopies = new THREE.InstancedMesh(broadCanopyGeo, materials.foliageCanopy, treePlacements.length);
  broadTrunks.castShadow = true;
  broadTrunks.receiveShadow = true;
  broadCanopies.castShadow = true;
  broadCanopies.receiveShadow = true;

  for (let i = 0; i < treePlacements.length; i++) {
    const t = treePlacements[i];
    dummy.position.set(t.x, t.y, t.z);
    dummy.rotation.set(0, t.rot, 0);
    dummy.scale.setScalar(t.scale);
    dummy.updateMatrix();
    broadTrunks.setMatrixAt(i, dummy.matrix);
    broadCanopies.setMatrixAt(i, dummy.matrix);

    cTmp.setHSL(0.32 + (rand() - 0.5) * 0.06, 0.5 + rand() * 0.14, 0.34 + rand() * 0.1);
    broadCanopies.setColorAt(i, cTmp);
    colliders.push({ type: 'cylinder', x: t.x, z: t.z, radius: 0.72 * t.scale });
  }
  broadTrunks.instanceMatrix.needsUpdate = true;
  broadCanopies.instanceMatrix.needsUpdate = true;
  if (broadCanopies.instanceColor) broadCanopies.instanceColor.needsUpdate = true;
  broadTrunks.computeBoundingSphere();
  broadCanopies.computeBoundingSphere();
  group.add(broadTrunks, broadCanopies);

  // =========================================================================
  // 3. INSTANCED COASTAL & MOUNTAIN ROCKS, FERNS, FLOWERS & MUSHROOMS
  // =========================================================================
  const rockGeo = trackGeo(new THREE.DodecahedronGeometry(1.0, 1));
  const rockCount = 95;
  const rockInst = new THREE.InstancedMesh(rockGeo, materials.mossyRock, rockCount);
  rockInst.castShadow = true;
  rockInst.receiveShadow = true;

  let placedRocks = 0;
  for (let attempt = 0; attempt < 500 && placedRocks < rockCount; attempt++) {
    const x = (rand() - 0.5) * 200;
    const z = (rand() - 0.5) * 195;
    const y = terrainHeightAt(x, z);
    if (y > -0.2 && y < 24 && isClearOfLandmarks(x, z, 0.15)) {
      const s = 0.75 + rand() * 1.9;
      dummy.position.set(x, y + s * 0.25, z);
      dummy.rotation.set(rand() * 2, rand() * 3, rand() * 2);
      dummy.scale.set(s * (0.9 + rand() * 0.4), s * (0.65 + rand() * 0.3), s * (0.9 + rand() * 0.4));
      dummy.updateMatrix();
      rockInst.setMatrixAt(placedRocks, dummy.matrix);
      cTmp.setHSL(0.28 + (rand() - 0.5) * 0.08, 0.12 + rand() * 0.1, 0.46 + rand() * 0.16);
      rockInst.setColorAt(placedRocks, cTmp);
      if (s > 1.35) {
        colliders.push({ type: 'cylinder', x, z, radius: s * 0.85 });
      }
      placedRocks++;
    }
  }
  rockInst.count = placedRocks;
  rockInst.instanceMatrix.needsUpdate = true;
  if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
  rockInst.computeBoundingSphere();
  group.add(rockInst);

  // Tropical Ferns / Shrubs (InstancedMesh)
  const fernParts: THREE.BufferGeometry[] = [];
  for (let f = 0; f < 6; f++) {
    const a = (f / 6) * Math.PI * 2;
    const leaf = new THREE.PlaneGeometry(0.45, 1.3, 1, 3);
    leaf.rotateX(-Math.PI * 0.34);
    leaf.translate(0, 0.45, 0.5);
    leaf.rotateY(a);
    fernParts.push(leaf);
  }
  const fernGeo = trackGeo(mergeGeometries(fernParts));
  fernParts.forEach((g) => g.dispose());

  const fernCount = 160;
  const fernInst = new THREE.InstancedMesh(fernGeo, materials.fernLeaf, fernCount);
  let placedFerns = 0;
  for (let attempt = 0; attempt < 600 && placedFerns < fernCount; attempt++) {
    const x = (rand() - 0.5) * 185;
    const z = (rand() - 0.5) * 180;
    const y = terrainHeightAt(x, z);
    if (y > 2.4 && y < 18 && isClearOfLandmarks(x, z, 0.25)) {
      const s = 0.75 + rand() * 0.75;
      dummy.position.set(x, y - 0.05, z);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      fernInst.setMatrixAt(placedFerns, dummy.matrix);
      cTmp.setHSL(0.32 + (rand() - 0.5) * 0.06, 0.62, 0.38 + rand() * 0.14);
      fernInst.setColorAt(placedFerns, cTmp);
      placedFerns++;
    }
  }
  fernInst.count = placedFerns;
  fernInst.instanceMatrix.needsUpdate = true;
  if (fernInst.instanceColor) fernInst.instanceColor.needsUpdate = true;
  fernInst.computeBoundingSphere();
  group.add(fernInst);

  // Vibrant Tropical Flower Blossoms (InstancedMesh)
  const flowerGeo = trackGeo(new THREE.OctahedronGeometry(0.24, 0));
  const flowerCount = 130;
  const flowerInst = new THREE.InstancedMesh(flowerGeo, materials.plaster, flowerCount);
  const flowerPalette = [0xff6b8b, 0xffd166, 0xff9f43, 0xd980fa, 0x70a1ff];
  let placedFlowers = 0;
  for (let attempt = 0; attempt < 500 && placedFlowers < flowerCount; attempt++) {
    const x = (rand() - 0.5) * 165;
    const z = (rand() - 0.5) * 165;
    const y = terrainHeightAt(x, z);
    if (y > 3.2 && y < 16 && isClearOfLandmarks(x, z, 0.35)) {
      dummy.position.set(x, y + 0.26, z);
      dummy.rotation.set(rand(), rand() * Math.PI, rand());
      dummy.scale.set(1.1, 0.55, 1.1);
      dummy.updateMatrix();
      flowerInst.setMatrixAt(placedFlowers, dummy.matrix);
      cTmp.setHex(flowerPalette[placedFlowers % flowerPalette.length]);
      flowerInst.setColorAt(placedFlowers, cTmp);
      placedFlowers++;
    }
  }
  flowerInst.count = placedFlowers;
  flowerInst.instanceMatrix.needsUpdate = true;
  if (flowerInst.instanceColor) flowerInst.instanceColor.needsUpdate = true;
  flowerInst.computeBoundingSphere();
  group.add(flowerInst);

  // Bioluminescent Mushrooms near Lake, Waterfall & Crystal Grotto
  const mushZones = [
    { cx: -32, cz: 4, r: 10 },
    { cx: -52, cz: 20, r: 12 },
    { cx: -56, cz: 36, r: 10 },
    { cx: 36, cz: 18, r: 8 },
  ];
  for (const mz of mushZones) {
    for (let m = 0; m < 6; m++) {
      const a = rand() * Math.PI * 2;
      const d = 2 + rand() * mz.r;
      const mx = mz.cx + Math.cos(a) * d;
      const mzPos = mz.cz + Math.sin(a) * d;
      const my = terrainHeightAt(mx, mzPos);
      if (my < 3.6) continue;

      const s = 0.65 + rand() * 0.75;
      const mGroup = new THREE.Group();
      mGroup.position.set(mx, my, mzPos);
      mGroup.scale.setScalar(s);

      const stalk = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.11, 0.16, 0.55, 7)), materials.plaster);
      stalk.position.y = 0.27;
      mGroup.add(stalk);

      const cap = new THREE.Mesh(
        trackGeo(new THREE.SphereGeometry(0.36, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55)),
        m % 2 === 0 ? materials.mushroomGlow : materials.mushroomCap
      );
      cap.position.y = 0.5;
      mGroup.add(cap);
      group.add(mGroup);
    }
  }

  // =========================================================================
  // 4. INTERACTIVE SIGNBOARDS (x5)
  // =========================================================================
  const signDefinitions: Array<SignboardContent & { x: number; z: number; rotY: number; overrideY?: number }> = [
    {
      id: 'sign-harbor',
      title: 'Welcome to Fantasy Island',
      location: 'Sunlit Harbor Overlook',
      body: 'Ahead lies the Golden Crescent Beach, the Central Sun Plaza, and Citadel Keep rising above the northern cliffs. Explore the Whispering Falls to the west, the Artisan Village to the east, and seek out all eight Echo Crystals hidden across the island.',
      x: 2.3,
      z: 96.5,
      rotY: -0.35,
      overrideY: 4.45,
    },
    {
      id: 'sign-plaza',
      title: 'Central Sun Plaza',
      location: 'Heart of the Island',
      body: 'An open ceremonial terrace linking every realm of Fantasy Island. Follow the northern stone ramp to Citadel Keep, cross the western arch bridges toward Whispering Falls and Crystal Grotto, or stroll east into the Artisan Village.',
      x: -3.8,
      z: 20.5,
      rotY: 0.25,
      overrideY: 6.18,
    },
    {
      id: 'sign-falls',
      title: 'Whispering Falls & Lagoon',
      location: 'Emerald Lagoon',
      body: 'Fed by springs high in the northern peaks, Whispering Falls pours into a crystal-clear mountain basin before winding southward beneath two ancient stone bridges toward the tropical sea.',
      x: -33.5,
      z: 10.5,
      rotY: 0.75,
    },
    {
      id: 'sign-grotto',
      title: 'The Crystal Grotto',
      location: 'Western Sea Cliffs',
      body: 'Ancient stone pillars guard this luminous cavern carved into the western cliffs. Step inside to witness the glowing amethyst and cyan crystal veins pulsing beneath the rock.',
      x: -57.5,
      z: 34.8,
      rotY: 1.25,
    },
    {
      id: 'sign-castle',
      title: 'Citadel Keep Courtyard',
      location: 'Citadel Hill',
      body: 'You have ascended to the royal hilltop fortress. Stand beside the courtyard crystal fountain or gaze out from the battlements over the floating sky islands and emerald canopy below.',
      x: 4.2,
      z: -24.5,
      rotY: -0.4,
      overrideY: 18.12,
    },
  ];

  for (const sd of signDefinitions) {
    const sy = sd.overrideY !== undefined ? sd.overrideY : terrainHeightAt(sd.x, sd.z);
    const sGroup = new THREE.Group();
    sGroup.position.set(sd.x, sy, sd.z);
    sGroup.rotation.y = sd.rotY;

    const post = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.09, 0.12, 1.55, 8)), materials.treeTrunk);
    post.position.y = 0.77;
    post.castShadow = true;
    sGroup.add(post);

    const board = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.35, 0.88, 0.12)), materials.signWood);
    board.position.y = 1.48;
    board.rotation.x = -0.14;
    board.castShadow = true;
    sGroup.add(board);

    const cap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.5, 0.14, 0.22)), materials.wood);
    cap.position.y = 1.94;
    cap.rotation.x = -0.14;
    sGroup.add(cap);

    // Small golden lantern finial on signboard post to draw player eye
    const gem = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.11, 0)), materials.lanternGlow);
    gem.position.y = 2.12;
    sGroup.add(gem);

    group.add(sGroup);
    colliders.push({ type: 'cylinder', x: sd.x, z: sd.z, radius: 0.45 });

    interactables.push({
      id: sd.id,
      kind: 'signboard',
      title: sd.title,
      prompt: `Read Signboard: ${sd.title}`,
      worldPos: new THREE.Vector3(sd.x, sy + 1.4, sd.z),
      radius: 3.6,
      hitMesh: board,
      onInteract: () => {
        onOpenSignboard({
          id: sd.id,
          title: sd.title,
          location: sd.location,
          body: sd.body,
        });
      },
    });
  }

  // =========================================================================
  // 5. COLLECTIBLE GLOWING ECHO CRYSTALS (x8)
  // =========================================================================
  const crystalLocations = [
    { id: 'c1', name: 'Harbor Tide Crystal', x: -2.2, z: 109.5, overrideY: 4.45 },
    { id: 'c2', name: 'Sun Plaza Crystal', x: 10.5, z: 32.0, overrideY: 6.18 },
    { id: 'c3', name: 'Arch Bridge Crystal', x: -27.0, z: 14.0, overrideY: 6.1 },
    { id: 'c4', name: 'Whispering Falls Crystal', x: -50.0, z: -8.0, overrideY: 4.35 },
    { id: 'c5', name: 'Crystal Grotto Heart', x: -67.8, z: 38.0, overrideY: 4.55 },
    { id: 'c6', name: 'Artisan Garden Crystal', x: 38.5, z: 31.0 },
    { id: 'c7', name: 'Boathouse Cove Crystal', x: 31.5, z: 72.5 },
    { id: 'c8', name: 'Citadel Crown Crystal', x: 0.0, z: -30.5, overrideY: 20.6 },
  ];

  const floatingCrystals: Array<{ id: string; group: THREE.Group; baseY: number; collected: boolean }> = [];
  let collectedCount = 0;

  for (let i = 0; i < crystalLocations.length; i++) {
    const cl = crystalLocations[i];
    const baseY = (cl.overrideY !== undefined ? cl.overrideY : terrainHeightAt(cl.x, cl.z)) + 1.15;
    const cGroup = new THREE.Group();
    cGroup.position.set(cl.x, baseY, cl.z);

    const shard = new THREE.Mesh(
      trackGeo(new THREE.OctahedronGeometry(0.42, 0)),
      i % 2 === 0 ? materials.crystalCyan : materials.crystalViolet
    );
    shard.scale.set(0.75, 1.45, 0.75);
    cGroup.add(shard);

    const haloRing = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.62, 0.035, 8, 24)),
      materials.brassGold
    );
    haloRing.rotation.x = Math.PI * 0.35;
    cGroup.add(haloRing);

    group.add(cGroup);
    floatingCrystals.push({ id: cl.id, group: cGroup, baseY, collected: false });

    const interactObj: InteractiveTarget = {
      id: `crystal-${cl.id}`,
      kind: 'crystal',
      title: cl.name,
      prompt: `Collect ${cl.name}`,
      worldPos: new THREE.Vector3(cl.x, baseY, cl.z),
      radius: 3.2,
      hitMesh: shard,
      onInteract: () => {
        const entry = floatingCrystals.find((fc) => fc.id === cl.id);
        if (!entry || entry.collected) return;
        entry.collected = true;
        entry.group.visible = false;
        collectedCount++;
        // Remove from active interactables
        const idx = interactables.indexOf(interactObj);
        if (idx >= 0) interactables.splice(idx, 1);
        onCollectCrystal(cl.name, collectedCount);
      },
    };
    interactables.push(interactObj);
  }

  // =========================================================================
  // 6. AMBIENT FLOATING FIREFLIES / GOLDEN POLLEN MOTES
  // =========================================================================
  const moteCount = 180;
  const motePos = new Float32Array(moteCount * 3);
  const moteBase: Array<{ x: number; y: number; z: number; phase: number; speed: number }> = [];

  for (let i = 0; i < moteCount; i++) {
    const x = (rand() - 0.5) * 165;
    const z = (rand() - 0.5) * 165;
    const y = Math.max(2.0, terrainHeightAt(x, z)) + 1.2 + rand() * 5.5;
    moteBase.push({ x, y, z, phase: rand() * Math.PI * 2, speed: 0.4 + rand() * 0.7 });
    motePos[i * 3] = x;
    motePos[i * 3 + 1] = y;
    motePos[i * 3 + 2] = z;
  }
  const moteGeo = trackGeo(new THREE.BufferGeometry());
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const moteMat = new THREE.PointsMaterial({
    map: particleTex,
    color: 0xffeaa3,
    size: 0.72,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  disposables.push(moteMat);
  const motes = new THREE.Points(moteGeo, moteMat);
  group.add(motes);

  return {
    group,
    colliders,
    interactables,
    totalCrystals: crystalLocations.length,
    update: (elapsed: number, dt: number) => {
      void dt;
      // Rotate & bob collectible crystals
      for (let i = 0; i < floatingCrystals.length; i++) {
        const fc = floatingCrystals[i];
        if (fc.collected) continue;
        fc.group.position.y = fc.baseY + Math.sin(elapsed * 2.4 + i) * 0.22;
        fc.group.rotation.y = elapsed * 1.4 + i;
      }

      // Gently drift ambient pollen/firefly motes
      const attr = moteGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < moteCount; i++) {
        const m = moteBase[i];
        attr.setXYZ(
          i,
          m.x + Math.sin(elapsed * m.speed + m.phase) * 1.4,
          m.y + Math.cos(elapsed * m.speed * 0.9 + m.phase) * 0.75,
          m.z + Math.cos(elapsed * m.speed * 0.7 + m.phase) * 1.4
        );
      }
      attr.needsUpdate = true;
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
