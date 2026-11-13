import * as THREE from 'three';
import { fbm2D } from './noise';
import { getTerrainSurfaceInfo, terrainHeightAt } from './terrainMath';

export function buildIslandTerrain(material: THREE.MeshStandardMaterial): THREE.Mesh {
  const size = 320;
  const segments = 224;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const count = posAttr.count;
  const colors = new Float32Array(count * 3);

  // Set vertex heights
  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = terrainHeightAt(x, z);
    posAttr.setY(i, y);
  }

  geo.computeVertexNormals();
  const normAttr = geo.attributes.normal as THREE.BufferAttribute;

  // Palette colors
  const cDeepSand = new THREE.Color(0xcab282);
  const cWarmSand = new THREE.Color(0xe6cf9e);
  const cCoastGrass = new THREE.Color(0x63a64b);
  const cLushGrass = new THREE.Color(0x3f8442);
  const cHighMeadow = new THREE.Color(0x4c7c48);
  const cCliffRock = new THREE.Color(0x73767a);
  const cWarmCliff = new THREE.Color(0x887d71);
  const cPathStone = new THREE.Color(0xb8ac95);
  const cPlazaBase = new THREE.Color(0xc7bda9);
  const cLakeBed = new THREE.Color(0x7fa38f);
  const tmpColor = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const ny = normAttr.getY(i);

    const nVar = fbm2D(x * 0.055, z * 0.055, 2, 2.0, 0.5, 313) * 0.5 + 0.5;
    const info = getTerrainSurfaceInfo(x, z, y, ny);

    // Base biome color by elevation
    if (y < 0.3) {
      tmpColor.copy(cDeepSand).lerp(cWarmSand, Math.max(0, (y + 2.5) / 2.8));
    } else if (y < 2.9) {
      const t = Math.max(0, Math.min(1, (y - 0.3) / 2.6));
      tmpColor.copy(cWarmSand).lerp(cCoastGrass, t * t);
    } else if (y < 14.0) {
      tmpColor.copy(cCoastGrass).lerp(cLushGrass, nVar);
    } else {
      const highT = Math.min(1, (y - 14.0) / 14.0);
      tmpColor.copy(cLushGrass).lerp(cHighMeadow, highT);
    }

    // Lake bed pebbles tint
    if (Math.hypot(x + 44, z - 4) < 22 && y < 3.6) {
      const lakeT = Math.min(1, (3.6 - y) / 2.2);
      tmpColor.lerp(cLakeBed, lakeT * 0.65);
    }

    // Cliff & steep slope rock blend
    if (ny < 0.84 || y > 20.5) {
      const steepness = Math.max(0, Math.min(1, (0.86 - ny) / 0.24));
      const highRock = Math.max(0, Math.min(1, (y - 19.5) / 9.0));
      const rockWeight = Math.max(steepness, highRock * 0.88);
      const rockShade = cCliffRock.clone().lerp(cWarmCliff, nVar);
      tmpColor.lerp(rockShade, rockWeight);
    }

    // Winding cobblestone/sandstone paths
    if (info.pathFactor > 0.01 && y > 1.2) {
      tmpColor.lerp(cPathStone, info.pathFactor * 0.85);
    }

    // Plaza & Citadel Hill stone grading
    if (info.isPlaza) {
      tmpColor.lerp(cPlazaBase, 0.72);
    }

    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'IslandTerrain';
  return mesh;
}
