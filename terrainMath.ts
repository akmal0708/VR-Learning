import { fbm2D, ridgeNoise2D } from './noise';
import type { LandmarkMarker, ZoneInfo } from './types';

export const SEA_LEVEL = 0.0;
export const LAKE_LEVEL = 3.8;

export const PLAYER_SPAWN = {
  x: 0,
  y: 4.55,
  z: 105,
  yaw: 0, // Facing -Z (North toward Plaza & Citadel Castle)
  pitch: 0.025,
};

export const LANDMARK_POSITIONS = {
  harborPier: { x: 0, z: 102 },
  plaza: { x: 0, z: 32 },
  castle: { x: 0, z: -38 },
  castleGate: { x: 0, z: -17 },
  lake: { x: -44, z: 4 },
  waterfall: { x: -58, z: -20 },
  bridge1: { x: -27, z: 14 },
  bridge2: { x: -24, z: 48 },
  cottage1: { x: 34, z: 26 },
  cottage2: { x: 44, z: -14 },
  boathouse: { x: 28, z: 68 },
  grotto: { x: -64, z: 38 },
};

export const MINIMAP_LANDMARKS: LandmarkMarker[] = [
  { id: 'castle', label: 'Citadel Keep', x: 0, z: -38, kind: 'castle' },
  { id: 'plaza', label: 'Central Plaza', x: 0, z: 32, kind: 'plaza' },
  { id: 'falls', label: 'Whispering Falls', x: -58, z: -20, kind: 'falls' },
  { id: 'grotto', label: 'Crystal Grotto', x: -64, z: 38, kind: 'grotto' },
  { id: 'cottage', label: 'Artisan Village', x: 34, z: 26, kind: 'cottage' },
  { id: 'harbor', label: 'Sunlit Harbor', x: 0, z: 102, kind: 'harbor' },
];

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): { dist: number; t: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-6) {
    return { dist: Math.hypot(px - ax, pz - az), t: 0 };
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  const cx = ax + dx * t;
  const cz = az + dz * t;
  return { dist: Math.hypot(px - cx, pz - cz), t };
}

// River center X as a function of Z from lake outlet (z=12) to sea (z=82)
export function riverCenterX(z: number): number {
  return -29 + Math.sin((z - 12) * 0.085) * 4.5 + (z - 12) * 0.08;
}

// Winding pathway segments connecting key landmarks
const PATH_SEGMENTS: Array<[number, number, number, number, number]> = [
  // Harbor approach to Plaza
  [0, 96, 0, 74, 2.8],
  [0, 74, 6, 54, 2.6],
  [6, 54, 0, 48, 2.6],
  // Plaza to Castle Gate Ramp
  [0, 14, 0, -17, 3.6],
  // Plaza West to Bridge 1 -> Lake Shore
  [-17, 30, -24, 22, 2.1],
  [-24, 22, -27, 14, 2.1],
  [-27, 14, -34, 8, 2.0],
  // Plaza Southwest to Bridge 2 -> Crystal Grotto
  [-12, 42, -18, 48, 2.0],
  [-18, 48, -24, 48, 2.1],
  [-24, 48, -42, 44, 2.0],
  [-42, 44, -56, 38, 2.1],
  // Plaza East to Artisan Cottage & Boathouse & Alchemist Hut
  [17, 30, 28, 28, 2.0],
  [28, 28, 34, 18, 1.9],
  [28, 28, 30, 48, 1.9],
  [30, 48, 26, 64, 1.9],
  [32, 22, 38, 4, 1.8],
  [38, 4, 41, -10, 1.8],
];

export function getPathFactor(x: number, z: number): number {
  let best = 0;
  for (let i = 0; i < PATH_SEGMENTS.length; i++) {
    const [ax, az, bx, bz, halfW] = PATH_SEGMENTS[i];
    const { dist } = distToSegment(x, z, ax, az, bx, bz);
    if (dist < halfW + 1.4) {
      const f = 1 - smoothstep(halfW * 0.65, halfW + 1.2, dist);
      if (f > best) best = f;
    }
  }
  return best;
}

export function terrainHeightAt(x: number, z: number): number {
  // 1. Base island radial mask with organic coastline noise
  const angle = Math.atan2(z, x);
  const coastWarp =
    fbm2D(Math.cos(angle) * 1.4 + 3.1, Math.sin(angle) * 1.4 - 2.3, 3, 2.0, 0.5, 901) * 18 +
    Math.sin(angle * 3.0 + 0.7) * 7.5;
  const baseRadius = 112 + coastWarp;
  const distFromCenter = Math.hypot(x, z * 0.96);

  // Carve a graceful crescent Harbor Bay in the south (z > 62, |x| < 36)
  const bayDist = Math.hypot(x * 0.85, (z - 84) * 1.15);
  const bayCarve = 1 - smoothstep(14, 34, bayDist);

  // Island land mask (1 inside island, 0 in deep ocean)
  const islandMask = 1 - smoothstep(baseRadius - 26, baseRadius + 8, distFromCenter);

  // Rolling natural terrain height
  const rolling =
    fbm2D(x * 0.014, z * 0.014, 4, 2.0, 0.5, 101) * 6.5 +
    fbm2D(x * 0.045, z * 0.045, 2, 2.0, 0.45, 202) * 1.6;

  let h = -8.5 + islandMask * (13.2 + rolling);

  // Gentle coastal beach slope
  const beachBand = smoothstep(baseRadius - 32, baseRadius - 10, distFromCenter);
  h = lerp(h, -1.2 + (1 - beachBand) * 4.0, beachBand * 0.72);

  // Apply Harbor Bay indentation (keeps a shallow turquoise cove)
  if (bayCarve > 0.001) {
    const coveFloor = -1.6 + smoothstep(0, 1, 1 - bayCarve) * 2.2;
    h = lerp(h, coveFloor, bayCarve * 0.88);
  }

  // Harbor Overlook / Pier Landing Ridge (x: 0, z: 88..98)
  const pierPadDist = Math.hypot(x * 0.9, (z - 92) * 1.1);
  const pierPadBlend = 1 - smoothstep(6, 15, pierPadDist);
  if (pierPadBlend > 0.001) {
    h = lerp(h, 4.1, pierPadBlend);
  }

  // 2. Northern & Northwestern Mountain Backdrop (z < -48)
  if (z < -35) {
    const northMask = smoothstep(-38, -78, z) * islandMask;
    const ridge = ridgeNoise2D(x * 0.024 + 1.5, z * 0.024 - 0.8, 4, 707);
    const eastWestPeak = 0.72 + 0.45 * Math.sin(x * 0.042 + 0.6);
    h += northMask * (14 + ridge * 26 * eastWestPeak);
  }

  // 3. Waterfall Cliff Massif behind Lake (-62, -26)
  const cliffDist = Math.hypot((x + 65) * 0.95, (z + 25) * 1.15);
  const cliffMask = 1 - smoothstep(10, 28, cliffDist);
  if (cliffMask > 0.001) {
    const cliffNoise = ridgeNoise2D(x * 0.04, z * 0.04, 3, 555) * 5.5;
    h = Math.max(h, lerp(h, 31.5 + cliffNoise, cliffMask));
  }

  // 4. Crystal Cave Cliff Outcrop at (-70, 38)
  const grottoCliffDist = Math.hypot((x + 73) * 0.9, (z - 38) * 1.1);
  const grottoCliffMask = 1 - smoothstep(8, 22, grottoCliffDist);
  if (grottoCliffMask > 0.001) {
    const rockDetail = ridgeNoise2D(x * 0.05, z * 0.05, 3, 888) * 3.5;
    h = lerp(h, 17.5 + rockDetail, grottoCliffMask);
  }
  // Carve flat grotto forecourt & cave floor at (-64, 38)
  const grottoCourtDist = Math.hypot((x + 61) * 0.85, (z - 38) * 1.15);
  const grottoCourtMask = 1 - smoothstep(5.5, 11.5, grottoCourtDist);
  if (grottoCourtMask > 0.001) {
    h = lerp(h, 4.5, grottoCourtMask);
  }

  // 5. Citadel Hill (0, -38) & Grand Approach Ramp (0, 14 -> -18)
  const hillDist = Math.hypot(x, z + 38);
  const hillMask = 1 - smoothstep(21, 38, hillDist);
  if (hillMask > 0.001) {
    h = lerp(h, 18.0, hillMask);
  }

  // Smooth walkable ramp from Plaza north edge (z=14, y=6.0) up to Castle Gate (z=-18, y=18.0)
  if (z >= -20 && z <= 18 && Math.abs(x) < 11) {
    const rampT = smoothstep(15, -17, z);
    const rampY = lerp(6.0, 18.0, rampT);
    const sideBlend = 1 - smoothstep(4.2, 10.5, Math.abs(x));
    h = lerp(h, rampY, sideBlend);
  }

  // 6. Central Open Plaza Plateau (0, 32)
  const plazaDist = Math.hypot(x, z - 32);
  const plazaMask = 1 - smoothstep(17, 26, plazaDist);
  if (plazaMask > 0.001) {
    h = lerp(h, 6.0, plazaMask);
  }

  // 7. Eastern Cottages & Harbor Boathouse Meadows
  const cottage1Dist = Math.hypot(x - 34, z - 26);
  const cottage1Mask = 1 - smoothstep(9, 19, cottage1Dist);
  if (cottage1Mask > 0.001) {
    h = lerp(h, 6.4, cottage1Mask);
  }

  const cottage2Dist = Math.hypot(x - 44, z + 14);
  const cottage2Mask = 1 - smoothstep(8, 17, cottage2Dist);
  if (cottage2Mask > 0.001) {
    h = lerp(h, 9.2, cottage2Mask);
  }

  const boatDist = Math.hypot(x - 28, z - 68);
  const boatMask = 1 - smoothstep(7, 15, boatDist);
  if (boatMask > 0.001) {
    h = lerp(h, 2.8, boatMask);
  }

  // 8. Carve Emerald Lake Basin at (-44, 4)
  const lakeDist = Math.hypot((x + 44) * 0.92, (z - 4) * 1.04);
  const lakeRim = 1 - smoothstep(16, 26, lakeDist);
  if (lakeRim > 0.001) {
    const basinDepth = lakeDist < 17 ? 0.6 : lerp(0.6, 4.7, smoothstep(17, 25, lakeDist));
    h = lerp(h, basinDepth, lakeRim);
  }

  // 9. Carve Winding River Outlet from Lake (z=12) to Southern Sea (z=82)
  if (z > 8 && z < 84) {
    const rcx = riverCenterX(z);
    const riverDist = Math.abs(x - rcx);
    const riverMask = 1 - smoothstep(2.6, 6.8, riverDist);
    if (riverMask > 0.001) {
      // River bed gently steps from lakebed down to sea level
      const riverZProgress = smoothstep(12, 76, z);
      const bedY = lerp(1.3, -1.0, riverZProgress);
      h = lerp(h, bedY, riverMask);
    }
  }

  // 10. Flatten winding pathways slightly for comfortable walking
  const pathF = getPathFactor(x, z);
  if (pathF > 0.05 && z > 15 && z < 96) {
    // Keep gentle slope along path without micro bumps
    const smoothH =
      -8.5 +
      islandMask * 13.2 +
      fbm2D(x * 0.014, z * 0.014, 2, 2.0, 0.5, 101) * 4.5;
    if (plazaMask < 0.5 && hillMask < 0.5) {
      h = lerp(h, Math.max(2.2, smoothH), pathF * 0.25);
    }
  }

  return h;
}

// Computes deck/floor elevation for bridges, pier, plaza terrace, and castle courtyard
export function walkableHeightAt(x: number, z: number): number {
  let y = terrainHeightAt(x, z);

  // Harbor Pier wooden deck: x in [-3.4, 3.4], z in [90, 112]
  if (Math.abs(x) <= 3.5 && z >= 89 && z <= 112.5) {
    const pierY = 4.45;
    if (pierY > y) y = pierY;
  }

  // Central Plaza raised stone terrace: radius 16.5 around (0, 32)
  const plazaDist = Math.hypot(x, z - 32);
  if (plazaDist <= 16.6) {
    y = Math.max(y, 6.18);
  }

  // Bridge 1 (West Meadow Stone Arch Bridge) centered at (-27, 14), spans x: [-34.5, -19.5], z: [11.6, 16.4]
  if (x >= -34.5 && x <= -19.5 && z >= 11.4 && z <= 16.6) {
    const t = (x + 27) / 7.5; // -1..1
    const archH = 4.65 + (1 - t * t) * 1.45;
    y = Math.max(y, archH);
  }

  // Bridge 2 (Coastal Cove Stone Arch Bridge) centered at (-24, 48), spans x: [-31.5, -16.5], z: [45.6, 50.4]
  if (x >= -31.5 && x <= -16.5 && z >= 45.4 && z <= 50.6) {
    const t = (x + 24) / 7.5;
    const archH = 3.4 + (1 - t * t) * 1.35;
    y = Math.max(y, archH);
  }

  // Castle Courtyard & Gatehouse Threshold
  const castleDist = Math.hypot(x, z + 38);
  if (castleDist < 22) {
    y = Math.max(y, 18.12);
  }

  return y;
}

export function getTerrainSurfaceInfo(x: number, z: number, y: number, slopeY: number) {
  const pathFactor = getPathFactor(x, z);
  const plazaDist = Math.hypot(x, z - 32);
  const castleDist = Math.hypot(x, z + 38);
  const onRamp = z >= -19 && z <= 16 && Math.abs(x) < 4.5;

  return {
    pathFactor,
    isPlaza: plazaDist < 17.5 || castleDist < 21.5 || onRamp,
    isBeach: y < 3.4 && pathFactor < 0.4,
    isCliff: slopeY < 0.72 || y > 19.5,
  };
}

export function getZoneAt(x: number, z: number): ZoneInfo {
  if (Math.hypot(x, z - 102) < 18) {
    return { id: 'harbor', name: 'Sunlit Harbor', subtitle: 'Southern Timber Pier & Lagoon Overlook' };
  }
  if (Math.hypot(x, z + 38) < 25) {
    return { id: 'castle', name: 'Citadel Keep', subtitle: 'Royal Hilltop Fortress & Courtyard' };
  }
  if (Math.hypot(x, z - 32) < 20) {
    return { id: 'plaza', name: 'Central Sun Plaza', subtitle: 'Grand Open Stone Terrace' };
  }
  if (Math.hypot(x + 58, z + 20) < 22) {
    return { id: 'waterfall', name: 'Whispering Falls', subtitle: 'Cascading Highland Cataract' };
  }
  if (Math.hypot(x + 44, z - 4) < 26) {
    return { id: 'lake', name: 'Emerald Lagoon', subtitle: 'Crystal-Clear Mountain Lake' };
  }
  if (Math.hypot(x + 64, z - 38) < 18) {
    return { id: 'grotto', name: 'Crystal Grotto', subtitle: 'Luminous Western Sea Cave' };
  }
  if (Math.hypot(x - 36, z - 20) < 24 || Math.hypot(x - 44, z + 14) < 18) {
    return { id: 'cottage', name: 'Artisan Village', subtitle: 'Timber Cottages & Herb Gardens' };
  }
  if (z < -56) {
    return { id: 'mountains', name: 'Highland Peaks', subtitle: 'Northern Stone Ridges' };
  }
  const y = terrainHeightAt(x, z);
  if (y < 3.1) {
    return { id: 'beach', name: 'Golden Crescent Beach', subtitle: 'Tropical Shoreline & Palm Cove' };
  }
  return { id: 'forest', name: 'Emerald Canopy Grove', subtitle: 'Lush Tropical Woodland' };
}
