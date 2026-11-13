import * as THREE from 'three';
import { fbm2D, seededRandom } from './noise';

export interface TextureBundle {
  stoneAlbedo: THREE.CanvasTexture;
  stoneBump: THREE.CanvasTexture;
  plazaAlbedo: THREE.CanvasTexture;
  woodAlbedo: THREE.CanvasTexture;
  woodBump: THREE.CanvasTexture;
  roofTileAlbedo: THREE.CanvasTexture;
  plasterAlbedo: THREE.CanvasTexture;
  rockAlbedo: THREE.CanvasTexture;
  rockBump: THREE.CanvasTexture;
  terrainDetail: THREE.CanvasTexture;
  plazaMedallion: THREE.CanvasTexture;
  signWoodAlbedo: THREE.CanvasTexture;
  particleSoft: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function finalizeTexture(
  canvas: HTMLCanvasElement,
  anisotropy: number,
  isColor: boolean,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  if (isColor) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(maxAnisotropy: number): TextureBundle {
  const aniso = Math.min(8, Math.max(1, maxAnisotropy));
  const created: THREE.Texture[] = [];
  const track = <T extends THREE.Texture>(t: T): T => {
    created.push(t);
    return t;
  };

  // 1. Castle Ashlar Stone (Albedo + Bump)
  const stoneSize = 512;
  const [stoneC, stoneCtx] = makeCanvas(stoneSize);
  const [stoneBC, stoneBCtx] = makeCanvas(stoneSize);
  const randStone = seededRandom(1001);

  stoneCtx.fillStyle = '#5c6066';
  stoneCtx.fillRect(0, 0, stoneSize, stoneSize);
  stoneBCtx.fillStyle = '#252525';
  stoneBCtx.fillRect(0, 0, stoneSize, stoneSize);

  const rows = 8;
  const rowH = stoneSize / rows;
  for (let r = 0; r < rows; r++) {
    const cols = 4 + (r % 2);
    const colW = stoneSize / cols;
    const offset = (r % 2) * (colW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const bx = c * colW + offset;
      const by = r * rowH;
      const lum = 135 + Math.floor((randStone() - 0.5) * 34);
      const warm = Math.floor((randStone() - 0.3) * 14);
      stoneCtx.fillStyle = `rgb(${lum + warm}, ${lum + Math.floor(warm * 0.5)}, ${lum - 4})`;
      stoneCtx.fillRect(bx + 3, by + 3, colW - 6, rowH - 6);

      // Subtle bevel highlight & shadow
      stoneCtx.fillStyle = 'rgba(255,250,240,0.12)';
      stoneCtx.fillRect(bx + 3, by + 3, colW - 6, 4);
      stoneCtx.fillStyle = 'rgba(20,25,32,0.16)';
      stoneCtx.fillRect(bx + 3, by + rowH - 7, colW - 6, 4);

      const bVal = 175 + Math.floor((randStone() - 0.5) * 45);
      stoneBCtx.fillStyle = `rgb(${bVal},${bVal},${bVal})`;
      stoneBCtx.fillRect(bx + 3, by + 3, colW - 6, rowH - 6);
    }
  }
  // Micro-pitting noise over stone
  for (let i = 0; i < 4000; i++) {
    const px = randStone() * stoneSize;
    const py = randStone() * stoneSize;
    const sz = 1 + randStone() * 3;
    stoneCtx.fillStyle = randStone() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(15,20,25,0.08)';
    stoneCtx.fillRect(px, py, sz, sz);
    stoneBCtx.fillStyle = randStone() > 0.5 ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.14)';
    stoneBCtx.fillRect(px, py, sz, sz);
  }
  const stoneAlbedo = track(finalizeTexture(stoneC, aniso, true, 2, 2));
  const stoneBump = track(finalizeTexture(stoneBC, aniso, false, 2, 2));

  // 2. Plaza Cobblestone Paving
  const [plazaC, plazaCtx] = makeCanvas(512);
  const randPlaza = seededRandom(2024);
  plazaCtx.fillStyle = '#8b8378';
  plazaCtx.fillRect(0, 0, 512, 512);
  const pRows = 10;
  const pH = 512 / pRows;
  for (let r = 0; r < pRows; r++) {
    const pCols = 10;
    const pW = 512 / pCols;
    const off = (r % 2) * (pW * 0.5);
    for (let c = -1; c <= pCols; c++) {
      const px = c * pW + off;
      const py = r * pH;
      const base = 175 + Math.floor((randPlaza() - 0.5) * 30);
      plazaCtx.fillStyle = `rgb(${base + 12}, ${base + 4}, ${base - 8})`;
      plazaCtx.beginPath();
      plazaCtx.roundRect(px + 2.5, py + 2.5, pW - 5, pH - 5, 5);
      plazaCtx.fill();
    }
  }
  const plazaAlbedo = track(finalizeTexture(plazaC, aniso, true, 6, 6));

  // 3. Timber Wood Planks (Albedo + Bump)
  const [woodC, woodCtx] = makeCanvas(512);
  const [woodBC, woodBCtx] = makeCanvas(512);
  const randWood = seededRandom(3031);
  woodCtx.fillStyle = '#4a3121';
  woodCtx.fillRect(0, 0, 512, 512);
  woodBCtx.fillStyle = '#303030';
  woodBCtx.fillRect(0, 0, 512, 512);

  const planks = 8;
  const plankH = 512 / planks;
  for (let p = 0; p < planks; p++) {
    const py = p * plankH;
    const rCol = 122 + Math.floor((randWood() - 0.5) * 26);
    const gCol = 82 + Math.floor((randWood() - 0.5) * 18);
    const bCol = 52 + Math.floor((randWood() - 0.5) * 14);
    woodCtx.fillStyle = `rgb(${rCol},${gCol},${bCol})`;
    woodCtx.fillRect(0, py + 2, 512, plankH - 4);

    woodBCtx.fillStyle = '#b8b8b8';
    woodBCtx.fillRect(0, py + 2, 512, plankH - 4);

    // Wood grain streaks
    for (let g = 0; g < 24; g++) {
      const gy = py + 4 + randWood() * (plankH - 8);
      woodCtx.fillStyle = randWood() > 0.5 ? 'rgba(60,34,18,0.22)' : 'rgba(180,132,88,0.12)';
      woodCtx.fillRect(0, gy, 512, 1.5);
      woodBCtx.fillStyle = 'rgba(70,70,70,0.35)';
      woodBCtx.fillRect(0, gy, 512, 1.2);
    }
  }
  const woodAlbedo = track(finalizeTexture(woodC, aniso, true, 2, 2));
  const woodBump = track(finalizeTexture(woodBC, aniso, false, 2, 2));

  // 4. Fantasy Slate/Terracotta Roof Shingles
  const [roofC, roofCtx] = makeCanvas(512);
  const randRoof = seededRandom(4049);
  roofCtx.fillStyle = '#25394d';
  roofCtx.fillRect(0, 0, 512, 512);
  const sRows = 12;
  const sH = 512 / sRows;
  for (let r = 0; r < sRows; r++) {
    const sCols = 8;
    const sW = 512 / sCols;
    const off = (r % 2) * (sW * 0.5);
    for (let c = -1; c <= sCols; c++) {
      const sx = c * sW + off;
      const sy = r * sH;
      const v = randRoof();
      const red = Math.floor(42 + v * 20);
      const grn = Math.floor(78 + v * 28);
      const blu = Math.floor(110 + v * 32);
      roofCtx.fillStyle = `rgb(${red},${grn},${blu})`;
      roofCtx.beginPath();
      roofCtx.roundRect(sx + 2, sy + 2, sW - 4, sH - 3, [2, 2, 10, 10]);
      roofCtx.fill();
      roofCtx.fillStyle = 'rgba(255,255,255,0.08)';
      roofCtx.fillRect(sx + 4, sy + 3, sW - 8, 3);
    }
  }
  const roofTileAlbedo = track(finalizeTexture(roofC, aniso, true, 3, 3));

  // 5. Warm Cottage Stucco Plaster
  const [plasterC, plasterCtx] = makeCanvas(256);
  const randPlaster = seededRandom(5051);
  plasterCtx.fillStyle = '#ece3d0';
  plasterCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3200; i++) {
    const x = randPlaster() * 256;
    const y = randPlaster() * 256;
    plasterCtx.fillStyle = randPlaster() > 0.5 ? 'rgba(255,252,245,0.16)' : 'rgba(170,152,126,0.14)';
    plasterCtx.fillRect(x, y, 3, 3);
  }
  const plasterAlbedo = track(finalizeTexture(plasterC, aniso, true, 2, 2));

  // 6. Cliff Rock Strata (Albedo + Bump)
  const [rockC, rockCtx] = makeCanvas(512);
  const [rockBC, rockBCtx] = makeCanvas(512);
  const rImg = rockCtx.createImageData(512, 512);
  const rbImg = rockBCtx.createImageData(512, 512);
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const idx = (y * 512 + x) * 4;
      const n1 = fbm2D(x * 0.025, y * 0.06, 4, 2.0, 0.5, 606);
      const n2 = fbm2D(x * 0.08, y * 0.08, 3, 2.0, 0.5, 607);
      const strata = Math.sin(y * 0.12 + n1 * 4.5) * 0.5 + 0.5;
      const shade = 0.45 + n1 * 0.22 + n2 * 0.14 + strata * 0.16;
      const c = Math.max(40, Math.min(220, Math.floor(shade * 175)));
      rImg.data[idx] = Math.floor(c * 1.03);
      rImg.data[idx + 1] = Math.floor(c * 0.99);
      rImg.data[idx + 2] = Math.floor(c * 0.95);
      rImg.data[idx + 3] = 255;

      const b = Math.max(0, Math.min(255, Math.floor((0.5 + n1 * 0.3 + n2 * 0.2) * 255)));
      rbImg.data[idx] = b;
      rbImg.data[idx + 1] = b;
      rbImg.data[idx + 2] = b;
      rbImg.data[idx + 3] = 255;
    }
  }
  rockCtx.putImageData(rImg, 0, 0);
  rockBCtx.putImageData(rbImg, 0, 0);
  const rockAlbedo = track(finalizeTexture(rockC, aniso, true, 3, 3));
  const rockBump = track(finalizeTexture(rockBC, aniso, false, 3, 3));

  // 7. Subtle Terrain Micro-Detail Map (multiplied with vertex colors)
  const [tdC, tdCtx] = makeCanvas(256);
  const tdImg = tdCtx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const idx = (y * 256 + x) * 4;
      const n = fbm2D(x * 0.11, y * 0.11, 3, 2.0, 0.5, 707);
      const val = Math.floor(226 + n * 28);
      tdImg.data[idx] = val;
      tdImg.data[idx + 1] = val;
      tdImg.data[idx + 2] = val;
      tdImg.data[idx + 3] = 255;
    }
  }
  tdCtx.putImageData(tdImg, 0, 0);
  const terrainDetail = track(finalizeTexture(tdC, aniso, true, 36, 36));

  // 8. Ornate Central Plaza Compass Sun Medallion
  const [medC, medCtx] = makeCanvas(512);
  medCtx.clearRect(0, 0, 512, 512);
  medCtx.fillStyle = '#c8beaa';
  medCtx.beginPath();
  medCtx.arc(256, 256, 250, 0, Math.PI * 2);
  medCtx.fill();

  medCtx.strokeStyle = '#92794d';
  medCtx.lineWidth = 10;
  medCtx.beginPath();
  medCtx.arc(256, 256, 232, 0, Math.PI * 2);
  medCtx.stroke();

  medCtx.strokeStyle = '#537e7d';
  medCtx.lineWidth = 5;
  medCtx.beginPath();
  medCtx.arc(256, 256, 175, 0, Math.PI * 2);
  medCtx.stroke();

  // 8-point compass star
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const len = i % 2 === 0 ? 195 : 130;
    medCtx.save();
    medCtx.translate(256, 256);
    medCtx.rotate(a);
    medCtx.fillStyle = i % 2 === 0 ? '#b78c47' : '#537e7d';
    medCtx.beginPath();
    medCtx.moveTo(0, -len);
    medCtx.lineTo(18, -32);
    medCtx.lineTo(0, 0);
    medCtx.lineTo(-18, -32);
    medCtx.closePath();
    medCtx.fill();
    medCtx.restore();
  }
  medCtx.fillStyle = '#d4aa60';
  medCtx.beginPath();
  medCtx.arc(256, 256, 32, 0, Math.PI * 2);
  medCtx.fill();
  const plazaMedallion = track(finalizeTexture(medC, aniso, true, 1, 1));
  plazaMedallion.wrapS = THREE.ClampToEdgeWrapping;
  plazaMedallion.wrapT = THREE.ClampToEdgeWrapping;

  // 9. Signboard Wood Panel Texture
  const [signC, signCtx] = makeCanvas(256);
  signCtx.fillStyle = '#754e2f';
  signCtx.fillRect(0, 0, 256, 256);
  signCtx.strokeStyle = '#3f2816';
  signCtx.lineWidth = 14;
  signCtx.strokeRect(10, 10, 236, 236);
  for (let y = 26; y < 230; y += 22) {
    signCtx.fillStyle = 'rgba(245, 228, 190, 0.25)';
    signCtx.fillRect(34, y, 188, 6);
  }
  const signWoodAlbedo = track(finalizeTexture(signC, aniso, true, 1, 1));

  // 10. Soft Radial Glow Particle Texture
  const [partC, partCtx] = makeCanvas(64);
  const grad = partCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.75)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  partCtx.fillStyle = grad;
  partCtx.fillRect(0, 0, 64, 64);
  const particleSoft = track(new THREE.CanvasTexture(partC));
  particleSoft.colorSpace = THREE.SRGBColorSpace;
  particleSoft.needsUpdate = true;

  return {
    stoneAlbedo,
    stoneBump,
    plazaAlbedo,
    woodAlbedo,
    woodBump,
    roofTileAlbedo,
    plasterAlbedo,
    rockAlbedo,
    rockBump,
    terrainDetail,
    plazaMedallion,
    signWoodAlbedo,
    particleSoft,
    dispose: () => {
      created.forEach((t) => t.dispose());
    },
  };
}
