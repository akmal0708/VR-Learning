import * as THREE from 'three';
import type { TextureBundle } from './textures';

export interface MaterialLibrary {
  terrain: THREE.MeshStandardMaterial;
  castleStone: THREE.MeshStandardMaterial;
  castleTrimStone: THREE.MeshStandardMaterial;
  castleRoof: THREE.MeshStandardMaterial;
  cottageRoof: THREE.MeshStandardMaterial;
  plaster: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  darkIron: THREE.MeshStandardMaterial;
  brassGold: THREE.MeshStandardMaterial;
  plazaStone: THREE.MeshStandardMaterial;
  plazaMedallion: THREE.MeshStandardMaterial;
  rock: THREE.MeshStandardMaterial;
  mossyRock: THREE.MeshStandardMaterial;
  palmTrunk: THREE.MeshStandardMaterial;
  palmFrond: THREE.MeshStandardMaterial;
  treeTrunk: THREE.MeshStandardMaterial;
  foliageCanopy: THREE.MeshStandardMaterial;
  fernLeaf: THREE.MeshStandardMaterial;
  lanternGlow: THREE.MeshStandardMaterial;
  windowGlow: THREE.MeshStandardMaterial;
  crystalCyan: THREE.MeshPhysicalMaterial;
  crystalViolet: THREE.MeshPhysicalMaterial;
  mushroomCap: THREE.MeshStandardMaterial;
  mushroomGlow: THREE.MeshStandardMaterial;
  bannerBlue: THREE.MeshStandardMaterial;
  bannerGold: THREE.MeshStandardMaterial;
  signWood: THREE.MeshStandardMaterial;
  updateTime: (elapsed: number) => void;
  dispose: () => void;
}

function attachWindSway(material: THREE.MeshStandardMaterial, amplitude: number, speed: number, minY = 0.2) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = { value: 0 };
    material.userData.windShader = shader;
    shader.vertexShader =
      `uniform float uWindTime;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        float swayMask = smoothstep(${minY.toFixed(2)}, ${(minY + 1.8).toFixed(2)}, position.y);
        float worldPhase = position.x * 0.7 + position.z * 0.5;
        #ifdef USE_INSTANCING
          worldPhase += instanceMatrix[3][0] * 0.35 + instanceMatrix[3][2] * 0.35;
        #endif
        transformed.x += sin(uWindTime * ${speed.toFixed(2)} + worldPhase) * ${amplitude.toFixed(3)} * swayMask;
        transformed.z += cos(uWindTime * ${(speed * 0.83).toFixed(2)} + worldPhase * 1.1) * ${(amplitude * 0.75).toFixed(3)} * swayMask;
        `
      );
  };
}

export function createMaterialLibrary(
  textures: TextureBundle,
  isSoftwareGl: boolean
): MaterialLibrary {
  const created: THREE.Material[] = [];
  const windMaterials: THREE.MeshStandardMaterial[] = [];

  const track = <T extends THREE.Material>(m: T): T => {
    created.push(m);
    return m;
  };

  const terrain = track(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: textures.terrainDetail,
      roughness: 0.9,
      metalness: 0.02,
    })
  );

  const castleStone = track(
    new THREE.MeshStandardMaterial({
      map: textures.stoneAlbedo,
      bumpMap: textures.stoneBump,
      bumpScale: 0.14,
      color: 0xdcd7cd,
      roughness: 0.82,
      metalness: 0.04,
    })
  );

  const castleTrimStone = track(
    new THREE.MeshStandardMaterial({
      map: textures.stoneAlbedo,
      color: 0xb7b1a6,
      roughness: 0.74,
      metalness: 0.08,
    })
  );

  const castleRoof = track(
    new THREE.MeshStandardMaterial({
      map: textures.roofTileAlbedo,
      color: 0x3b6e8c,
      roughness: 0.5,
      metalness: 0.18,
    })
  );

  const cottageRoof = track(
    new THREE.MeshStandardMaterial({
      map: textures.roofTileAlbedo,
      color: 0x9b543a,
      roughness: 0.68,
      metalness: 0.08,
    })
  );

  const plaster = track(
    new THREE.MeshStandardMaterial({
      map: textures.plasterAlbedo,
      color: 0xf4ecd9,
      roughness: 0.88,
      metalness: 0.02,
    })
  );

  const wood = track(
    new THREE.MeshStandardMaterial({
      map: textures.woodAlbedo,
      bumpMap: textures.woodBump,
      bumpScale: 0.08,
      color: 0xc28f5e,
      roughness: 0.76,
      metalness: 0.04,
    })
  );

  const darkIron = track(
    new THREE.MeshStandardMaterial({
      color: 0x2c323b,
      roughness: 0.34,
      metalness: 0.86,
    })
  );

  const brassGold = track(
    new THREE.MeshStandardMaterial({
      color: 0xd9a84e,
      roughness: 0.24,
      metalness: 0.9,
    })
  );

  const plazaStone = track(
    new THREE.MeshStandardMaterial({
      map: textures.plazaAlbedo,
      bumpMap: textures.stoneBump,
      bumpScale: 0.06,
      color: 0xe6decb,
      roughness: 0.78,
      metalness: 0.04,
    })
  );

  const plazaMedallion = track(
    new THREE.MeshStandardMaterial({
      map: textures.plazaMedallion,
      roughness: 0.55,
      metalness: 0.22,
      transparent: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );

  const rock = track(
    new THREE.MeshStandardMaterial({
      map: textures.rockAlbedo,
      bumpMap: textures.rockBump,
      bumpScale: 0.24,
      color: 0x9b9995,
      roughness: 0.9,
      metalness: 0.03,
      flatShading: true,
    })
  );

  const mossyRock = track(
    new THREE.MeshStandardMaterial({
      map: textures.rockAlbedo,
      bumpMap: textures.rockBump,
      bumpScale: 0.2,
      color: 0x7b8f74,
      roughness: 0.88,
      metalness: 0.02,
      flatShading: true,
    })
  );

  const palmTrunk = track(
    new THREE.MeshStandardMaterial({
      map: textures.woodAlbedo,
      bumpMap: textures.woodBump,
      bumpScale: 0.12,
      color: 0x9b7452,
      roughness: 0.86,
      metalness: 0.02,
    })
  );

  const palmFrond = track(
    new THREE.MeshStandardMaterial({
      color: 0x4ca64c,
      roughness: 0.62,
      metalness: 0.04,
      side: THREE.DoubleSide,
    })
  );
  attachWindSway(palmFrond, 0.18, 1.8, 0.1);
  windMaterials.push(palmFrond);

  const treeTrunk = track(
    new THREE.MeshStandardMaterial({
      map: textures.woodAlbedo,
      bumpMap: textures.woodBump,
      bumpScale: 0.14,
      color: 0x6e4e35,
      roughness: 0.88,
      metalness: 0.02,
    })
  );

  const foliageCanopy = track(
    new THREE.MeshStandardMaterial({
      color: 0x3f8f48,
      roughness: 0.72,
      metalness: 0.02,
      flatShading: true,
    })
  );
  attachWindSway(foliageCanopy, 0.11, 1.4, 2.5);
  windMaterials.push(foliageCanopy);

  const fernLeaf = track(
    new THREE.MeshStandardMaterial({
      color: 0x479e49,
      roughness: 0.66,
      metalness: 0.04,
      side: THREE.DoubleSide,
    })
  );
  attachWindSway(fernLeaf, 0.08, 2.1, 0.1);
  windMaterials.push(fernLeaf);

  const lanternGlow = track(
    new THREE.MeshStandardMaterial({
      color: 0xffe4a0,
      emissive: 0xffaa33,
      emissiveIntensity: 2.2,
      roughness: 0.25,
      metalness: 0.05,
    })
  );

  const windowGlow = track(
    new THREE.MeshStandardMaterial({
      color: 0xffdf99,
      emissive: 0xffaa44,
      emissiveIntensity: 1.35,
      roughness: 0.3,
      metalness: 0.1,
    })
  );

  const crystalCyan = track(
    new THREE.MeshPhysicalMaterial({
      color: 0x6ef3ff,
      emissive: 0x1aa8d8,
      emissiveIntensity: 1.15,
      roughness: 0.1,
      metalness: 0.05,
      clearcoat: 1.0,
      ior: 1.7,
      transmission: isSoftwareGl ? 0 : 0.65,
      transparent: isSoftwareGl,
      opacity: isSoftwareGl ? 0.86 : 1.0,
      thickness: 1.2,
      attenuationColor: new THREE.Color(0x16a5c7),
    })
  );

  const crystalViolet = track(
    new THREE.MeshPhysicalMaterial({
      color: 0xd49cff,
      emissive: 0x8d3ce8,
      emissiveIntensity: 1.1,
      roughness: 0.12,
      metalness: 0.08,
      clearcoat: 1.0,
      ior: 1.65,
      transmission: isSoftwareGl ? 0 : 0.6,
      transparent: isSoftwareGl,
      opacity: isSoftwareGl ? 0.88 : 1.0,
      thickness: 1.0,
      attenuationColor: new THREE.Color(0x6d28d9),
    })
  );

  const mushroomCap = track(
    new THREE.MeshStandardMaterial({
      color: 0xd9564a,
      roughness: 0.55,
      metalness: 0.04,
    })
  );

  const mushroomGlow = track(
    new THREE.MeshStandardMaterial({
      color: 0x7effd4,
      emissive: 0x26d9a8,
      emissiveIntensity: 1.25,
      roughness: 0.35,
      metalness: 0.05,
    })
  );

  const bannerBlue = track(
    new THREE.MeshStandardMaterial({
      color: 0x275d8c,
      roughness: 0.82,
      metalness: 0.04,
      side: THREE.DoubleSide,
    })
  );

  const bannerGold = track(
    new THREE.MeshStandardMaterial({
      color: 0xd4a442,
      roughness: 0.62,
      metalness: 0.25,
      side: THREE.DoubleSide,
    })
  );

  const signWood = track(
    new THREE.MeshStandardMaterial({
      map: textures.signWoodAlbedo,
      bumpMap: textures.woodBump,
      bumpScale: 0.05,
      color: 0xdcb98a,
      roughness: 0.72,
      metalness: 0.04,
    })
  );

  return {
    terrain,
    castleStone,
    castleTrimStone,
    castleRoof,
    cottageRoof,
    plaster,
    wood,
    darkIron,
    brassGold,
    plazaStone,
    plazaMedallion,
    rock,
    mossyRock,
    palmTrunk,
    palmFrond,
    treeTrunk,
    foliageCanopy,
    fernLeaf,
    lanternGlow,
    windowGlow,
    crystalCyan,
    crystalViolet,
    mushroomCap,
    mushroomGlow,
    bannerBlue,
    bannerGold,
    signWood,
    updateTime: (elapsed: number) => {
      for (let i = 0; i < windMaterials.length; i++) {
        const shader = windMaterials[i].userData.windShader;
        if (shader) {
          shader.uniforms.uWindTime.value = elapsed;
        }
      }
    },
    dispose: () => {
      created.forEach((m) => m.dispose());
    },
  };
}
