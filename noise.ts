// Deterministic fast 2D/3D noise utilities for terrain, textures, and foliage

function hash2(ix: number, iz: number, seed = 1337): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function valueNoise2D(x: number, z: number, seed = 1337): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;

  const u = fade(fx);
  const v = fade(fz);

  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);

  return lerp(lerp(a, b, u), lerp(c, d, u), v) * 2 - 1;
}

export function fbm2D(
  x: number,
  z: number,
  octaves = 4,
  lacunarity = 2.05,
  gain = 0.5,
  seed = 1337
): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;

  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2D(x * freq, z * freq, seed + i * 97);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }

  return sum / norm;
}

export function ridgeNoise2D(x: number, z: number, octaves = 4, seed = 4201): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;

  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise2D(x * freq, z * freq, seed + i * 131));
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }

  return sum / norm;
}

export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
