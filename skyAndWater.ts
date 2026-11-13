import * as THREE from 'three';
import { seededRandom } from './noise';
import { LAKE_LEVEL, riverCenterX, terrainHeightAt } from './terrainMath';

export interface SkyAndWaterSystem {
  group: THREE.Group;
  update: (elapsed: number, cameraPos: THREE.Vector3) => void;
  dispose: () => void;
}

export function createSkyAndWater(
  sunDir: THREE.Vector3,
  fogColor: THREE.Color,
  fogDensity: number,
  mistTexture: THREE.Texture
): SkyAndWaterSystem {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const rand = seededRandom(8842);

  // 1. Atmospheric Sky Dome
  const skyGeo = new THREE.SphereGeometry(520, 32, 20);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSunDir: { value: sunDir.clone().normalize() },
      uTopColor: { value: new THREE.Color(0x2869b8) },
      uMidColor: { value: new THREE.Color(0x6ebae8) },
      uHorizonColor: { value: fogColor.clone() },
      uSunColor: { value: new THREE.Color(0xfff0c2) },
    },
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform vec3 uTopColor;
      uniform vec3 uMidColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uSunColor;
      varying vec3 vWorldDir;

      void main() {
        vec3 dir = normalize(vWorldDir);
        float h = clamp(dir.y, 0.0, 1.0);

        vec3 col = mix(uHorizonColor, uMidColor, smoothstep(0.0, 0.24, h));
        col = mix(col, uTopColor, smoothstep(0.22, 0.82, h));

        // Warm atmospheric glow around sun
        float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
        col += uSunColor * pow(sunDot, 12.0) * 0.28;
        col += vec3(1.0, 0.96, 0.85) * smoothstep(0.9965, 0.9992, sunDot) * 1.15;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  group.add(skyDome);
  disposables.push(skyGeo, skyMat);

  // 2. Stylized 3D Drifting Cloud Clusters (InstancedMesh)
  const puffGeo = new THREE.IcosahedronGeometry(1, 2);
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xdbeafe,
    emissiveIntensity: 0.22,
    roughness: 0.92,
    metalness: 0.0,
    transparent: true,
    opacity: 0.92,
  });
  const cloudClusters = 18;
  const puffsPerCluster = 5;
  const totalPuffs = cloudClusters * puffsPerCluster;
  const cloudMesh = new THREE.InstancedMesh(puffGeo, cloudMat, totalPuffs);
  cloudMesh.castShadow = false;
  cloudMesh.receiveShadow = false;

  interface CloudData {
    cx: number;
    cy: number;
    cz: number;
    speed: number;
    ox: number;
    oy: number;
    oz: number;
    sx: number;
    sy: number;
    sz: number;
  }
  const cloudData: CloudData[] = [];
  const dummy = new THREE.Object3D();

  for (let c = 0; c < cloudClusters; c++) {
    const angle = (c / cloudClusters) * Math.PI * 2 + rand() * 0.3;
    const dist = 110 + rand() * 190;
    const cx = Math.cos(angle) * dist;
    const cz = Math.sin(angle) * dist;
    const cy = 62 + rand() * 28;
    const speed = 0.8 + rand() * 0.9;

    for (let p = 0; p < puffsPerCluster; p++) {
      const idx = c * puffsPerCluster + p;
      const ox = (p - 2) * (5.2 + rand() * 2.5);
      const oy = (1 - Math.abs(p - 2) * 0.35) * 2.2 + (rand() - 0.5) * 1.2;
      const oz = (rand() - 0.5) * 6.5;
      const baseScale = 5.5 + (1 - Math.abs(p - 2) * 0.28) * 4.5;
      const sx = baseScale * (1.1 + rand() * 0.3);
      const sy = baseScale * (0.55 + rand() * 0.18);
      const sz = baseScale * (0.9 + rand() * 0.25);

      cloudData.push({ cx, cy, cz, speed, ox, oy, oz, sx, sy, sz });
      dummy.position.set(cx + ox, cy + oy, cz + oz);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      cloudMesh.setMatrixAt(idx, dummy.matrix);
    }
  }
  cloudMesh.instanceMatrix.needsUpdate = true;
  cloudMesh.frustumCulled = false;
  group.add(cloudMesh);
  disposables.push(puffGeo, cloudMat);

  // 3. Animated Ocean Surface with Depth-Aware Turquoise Shallows & Shoreline Foam
  const oceanGeo = new THREE.PlaneGeometry(920, 920, 170, 170);
  oceanGeo.rotateX(-Math.PI / 2);
  const oPos = oceanGeo.attributes.position as THREE.BufferAttribute;
  const shoreDepth = new Float32Array(oPos.count);

  for (let i = 0; i < oPos.count; i++) {
    const x = oPos.getX(i);
    const z = oPos.getZ(i);
    // Positive when water is shallow or near shore
    const groundY = terrainHeightAt(x, z);
    const depth = Math.max(0, -groundY);
    shoreDepth[i] = depth;
  }
  oceanGeo.setAttribute('aShoreDepth', new THREE.BufferAttribute(shoreDepth, 1));

  const oceanMat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: sunDir.clone().normalize() },
      uShallowColor: { value: new THREE.Color(0x2cd4c4) },
      uDeepColor: { value: new THREE.Color(0x0d5c8f) },
      uSkyColor: { value: new THREE.Color(0x88d4f7) },
      uFogColor: { value: fogColor.clone() },
      uFogDensity: { value: fogDensity },
    },
    vertexShader: `
      attribute float aShoreDepth;
      uniform float uTime;
      varying float vDepth;
      varying vec3 vWorldPos;
      varying vec3 vNormal;

      void main() {
        vDepth = aShoreDepth;
        vec3 pos = position;

        float shoreDamp = clamp(aShoreDepth * 0.45, 0.15, 1.0);
        float w1 = sin(pos.x * 0.11 + uTime * 1.45) * cos(pos.z * 0.09 + uTime * 1.15);
        float w2 = sin((pos.x * 0.7 + pos.z * 0.7) * 0.18 - uTime * 1.85);
        pos.y += (w1 * 0.16 + w2 * 0.09) * shoreDamp;

        // Approximate wave normal
        float dx = cos(pos.x * 0.11 + uTime * 1.45) * 0.11 * cos(pos.z * 0.09 + uTime * 1.15) * 0.16
                 + cos((pos.x * 0.7 + pos.z * 0.7) * 0.18 - uTime * 1.85) * 0.126 * 0.09;
        float dz = -sin(pos.x * 0.11 + uTime * 1.45) * sin(pos.z * 0.09 + uTime * 1.15) * 0.09 * 0.16
                 + cos((pos.x * 0.7 + pos.z * 0.7) * 0.18 - uTime * 1.85) * 0.126 * 0.09;
        vNormal = normalize(vec3(-dx * shoreDamp, 1.0, -dz * shoreDamp));

        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uShallowColor;
      uniform vec3 uDeepColor;
      uniform vec3 uSkyColor;
      uniform vec3 uFogColor;
      uniform float uFogDensity;

      varying float vDepth;
      varying vec3 vWorldPos;
      varying vec3 vNormal;

      void main() {
        vec3 N = normalize(vNormal);
        // High-frequency surface micro-ripple normal perturbation
        float r1 = sin(vWorldPos.x * 0.85 + uTime * 2.2) * cos(vWorldPos.z * 0.75 - uTime * 1.7);
        float r2 = cos(vWorldPos.x * 1.3 - vWorldPos.z * 1.1 + uTime * 2.6);
        N = normalize(N + vec3(r1 * 0.06, 0.0, r2 * 0.06));

        vec3 V = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.2);

        float depthT = smoothstep(0.15, 4.2, vDepth);
        vec3 waterCol = mix(uShallowColor, uDeepColor, depthT);

        // Sky reflection
        waterCol = mix(waterCol, uSkyColor, clamp(fresnel * 0.65, 0.0, 0.7));

        // Sun specular sparkle
        vec3 H = normalize(uSunDir + V);
        float spec = pow(max(dot(N, H), 0.0), 96.0);
        waterCol += vec3(1.0, 0.95, 0.82) * spec * 0.9;

        // Animated shoreline foam
        float foamWave = sin(vDepth * 7.5 - uTime * 2.6 + r1 * 1.5);
        float foamMask = (1.0 - smoothstep(0.05, 1.15, vDepth)) * smoothstep(0.25, 0.85, foamWave);
        waterCol = mix(waterCol, vec3(0.95, 0.98, 1.0), clamp(foamMask * 0.8, 0.0, 0.85));

        // Exponential squared fog matching scene.fog
        float dist = length(cameraPosition - vWorldPos);
        float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
        waterCol = mix(waterCol, uFogColor, clamp(fogFactor, 0.0, 1.0));

        float alpha = mix(0.74, 0.96, depthT);
        gl_FragColor = vec4(waterCol, alpha);
      }
    `,
  });
  const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
  oceanMesh.position.y = 0.0;
  oceanMesh.renderOrder = 1;
  group.add(oceanMesh);
  disposables.push(oceanGeo, oceanMat);

  // 4. Crystal-Clear Emerald Lake Surface (-44, 3.8, 4)
  const lakeGeo = new THREE.CircleGeometry(21.5, 48);
  lakeGeo.rotateX(-Math.PI / 2);

  const lakeMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: sunDir.clone().normalize() },
      uFogColor: { value: fogColor.clone() },
      uFogDensity: { value: fogDensity },
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorldPos;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 pos = position;
        pos.y += sin(pos.x * 0.6 + uTime * 2.0) * 0.03 + cos(pos.z * 0.65 - uTime * 1.6) * 0.03;
        vec4 wp = modelMatrix * vec4(pos, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      varying vec3 vWorldPos;
      varying vec2 vUv;

      void main() {
        vec2 c = vUv - 0.5;
        float r = length(c) * 2.0;

        float caustic = sin(vWorldPos.x * 1.8 + uTime * 2.4) * cos(vWorldPos.z * 1.9 - uTime * 2.1);
        float ripple = sin(r * 22.0 - uTime * 2.8) * 0.5 + 0.5;

        vec3 shallow = vec3(0.26, 0.88, 0.82);
        vec3 deep = vec3(0.08, 0.58, 0.68);
        vec3 col = mix(deep, shallow, smoothstep(0.45, 0.95, r));

        col += vec3(0.15, 0.3, 0.25) * smoothstep(0.35, 0.9, caustic);

        // Specular & Fresnel
        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 N = normalize(vec3(caustic * 0.08, 1.0, ripple * 0.05));
        float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        col = mix(col, vec3(0.75, 0.92, 1.0), fresnel * 0.55);

        vec3 H = normalize(uSunDir + V);
        float spec = pow(max(dot(N, H), 0.0), 80.0);
        col += vec3(1.0, 0.96, 0.84) * spec * 0.85;

        // Soft shoreline foam near waterfall impact (north side of lake)
        float distFalls = length(vWorldPos.xz - vec2(-55.5, -12.5));
        float splashRing = smoothstep(7.5, 1.5, distFalls) * (0.45 + 0.55 * sin(distFalls * 3.0 - uTime * 5.0));
        col = mix(col, vec3(0.95, 0.99, 1.0), clamp(splashRing * 0.8, 0.0, 0.85));

        float dist = length(cameraPosition - vWorldPos);
        float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
        col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));

        float alpha = mix(0.62, 0.38, smoothstep(0.72, 1.0, r));
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });

  const lakeMesh = new THREE.Mesh(lakeGeo, lakeMat);
  lakeMesh.position.set(-44, LAKE_LEVEL, 4);
  lakeMesh.renderOrder = 2;
  group.add(lakeMesh);
  disposables.push(lakeGeo, lakeMat);

  // 5. Winding River Ribbon from Lake (z=14) down to Sea Bay (z=78)
  const riverSteps = 44;
  const riverPositions: number[] = [];
  const riverUvs: number[] = [];
  const riverIndices: number[] = [];

  for (let i = 0; i <= riverSteps; i++) {
    const t = i / riverSteps;
    const z = 14 + t * 64;
    const cx = riverCenterX(z);
    const halfW = 3.8 + Math.sin(t * Math.PI) * 0.9;
    // Gently slopes from lake level (3.75) down to sea level (0.05)
    const y = THREE.MathUtils.lerp(LAKE_LEVEL - 0.08, 0.08, Math.pow(t, 0.85));

    riverPositions.push(cx - halfW, y, z);
    riverPositions.push(cx + halfW, y, z);
    riverUvs.push(0, t * 8);
    riverUvs.push(1, t * 8);

    if (i < riverSteps) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      riverIndices.push(a, c, b, b, c, d);
    }
  }

  const riverGeo = new THREE.BufferGeometry();
  riverGeo.setAttribute('position', new THREE.Float32BufferAttribute(riverPositions, 3));
  riverGeo.setAttribute('uv', new THREE.Float32BufferAttribute(riverUvs, 2));
  riverGeo.setIndex(riverIndices);
  riverGeo.computeVertexNormals();

  const riverMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uFogColor: { value: fogColor.clone() },
      uFogDensity: { value: fogDensity },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      varying vec2 vUv;
      varying vec3 vWorldPos;

      void main() {
        float flow = sin(vUv.y * 8.0 - uTime * 4.5 + sin(vUv.x * 6.0) * 1.2) * 0.5 + 0.5;
        float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
        vec3 col = mix(vec3(0.14, 0.68, 0.72), vec3(0.45, 0.9, 0.92), flow * 0.45);
        col = mix(col, vec3(0.92, 0.98, 1.0), smoothstep(0.75, 0.98, flow) * 0.35);

        float dist = length(cameraPosition - vWorldPos);
        float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
        col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));

        float alpha = smoothstep(0.0, 0.25, edge) * 0.74;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });

  const riverMesh = new THREE.Mesh(riverGeo, riverMat);
  riverMesh.renderOrder = 2;
  group.add(riverMesh);
  disposables.push(riverGeo, riverMat);

  // 6. Cascading Waterfall Mesh + Scrolling Foam Shader + Mist Plume
  const fallCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-60.5, 29.8, -24.5),
    new THREE.Vector3(-58.2, 23.0, -19.5),
    new THREE.Vector3(-56.8, 13.0, -15.5),
    new THREE.Vector3(-55.6, 3.4, -12.6),
  ]);

  const fallSegs = 28;
  const fallWidth = 7.2;
  const fPos: number[] = [];
  const fUv: number[] = [];
  const fIdx: number[] = [];
  const sideVec = new THREE.Vector3(0.85, 0, -0.52).normalize();

  for (let i = 0; i <= fallSegs; i++) {
    const t = i / fallSegs;
    const p = fallCurve.getPoint(t);
    const w = fallWidth * (0.72 + t * 0.48);
    fPos.push(p.x - sideVec.x * w * 0.5, p.y, p.z - sideVec.z * w * 0.5);
    fPos.push(p.x + sideVec.x * w * 0.5, p.y, p.z + sideVec.z * w * 0.5);
    fUv.push(0, t * 3.5);
    fUv.push(1, t * 3.5);

    if (i < fallSegs) {
      const a = i * 2;
      fIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }

  const fallGeo = new THREE.BufferGeometry();
  fallGeo.setAttribute('position', new THREE.Float32BufferAttribute(fPos, 3));
  fallGeo.setAttribute('uv', new THREE.Float32BufferAttribute(fUv, 2));
  fallGeo.setIndex(fIdx);
  fallGeo.computeVertexNormals();

  const fallMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uFogColor: { value: fogColor.clone() },
      uFogDensity: { value: fogDensity },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      varying vec2 vUv;
      varying vec3 vWorldPos;

      void main() {
        float stream1 = sin(vUv.x * 16.0 + sin(vUv.y * 4.0 - uTime * 6.5)) * 0.5 + 0.5;
        float stream2 = cos(vUv.x * 28.0 - vUv.y * 5.0 + uTime * 9.0) * 0.5 + 0.5;
        float foam = smoothstep(0.35, 0.9, stream1 * 0.65 + stream2 * 0.55);

        // Extra white foam at crest and plunge base
        float baseFoam = smoothstep(2.4, 3.5, vUv.y);
        foam = clamp(foam + baseFoam * 0.65, 0.0, 1.0);

        vec3 waterBlue = vec3(0.28, 0.78, 0.88);
        vec3 whiteFoam = vec3(0.95, 0.99, 1.0);
        vec3 col = mix(waterBlue, whiteFoam, foam);

        float edgeFade = 1.0 - pow(abs(vUv.x - 0.5) * 2.0, 2.5);
        float dist = length(cameraPosition - vWorldPos);
        float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
        col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));

        gl_FragColor = vec4(col, clamp(edgeFade * (0.72 + foam * 0.25), 0.0, 0.95));
      }
    `,
  });

  const fallMesh = new THREE.Mesh(fallGeo, fallMat);
  fallMesh.renderOrder = 3;
  group.add(fallMesh);
  disposables.push(fallGeo, fallMat);

  // Waterfall Plunge Mist Particles
  const mistCount = 65;
  const mistPositions = new Float32Array(mistCount * 3);
  const mistSeeds: Array<{ ox: number; oz: number; speed: number; phase: number }> = [];
  for (let i = 0; i < mistCount; i++) {
    const ox = (rand() - 0.5) * 9.0;
    const oz = (rand() - 0.5) * 6.5;
    mistSeeds.push({ ox, oz, speed: 1.2 + rand() * 1.4, phase: rand() * 10 });
    mistPositions[i * 3] = -55.6 + ox;
    mistPositions[i * 3 + 1] = LAKE_LEVEL + 0.8 + rand() * 4.5;
    mistPositions[i * 3 + 2] = -12.6 + oz;
  }
  const mistGeo = new THREE.BufferGeometry();
  mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPositions, 3));
  const mistMat = new THREE.PointsMaterial({
    map: mistTexture,
    color: 0xeefbff,
    size: 3.6,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const mistPoints = new THREE.Points(mistGeo, mistMat);
  mistPoints.renderOrder = 4;
  group.add(mistPoints);
  disposables.push(mistGeo, mistMat);

  return {
    group,
    update: (elapsed: number, cameraPos: THREE.Vector3) => {
      skyDome.position.copy(cameraPos);
      oceanMat.uniforms.uTime.value = elapsed;
      lakeMat.uniforms.uTime.value = elapsed;
      riverMat.uniforms.uTime.value = elapsed;
      fallMat.uniforms.uTime.value = elapsed;

      // Drift clouds slowly across sky
      for (let i = 0; i < totalPuffs; i++) {
        const d = cloudData[i];
        const driftX = ((d.cx + elapsed * d.speed + 280) % 560) - 280;
        dummy.position.set(driftX + d.ox, d.cy + d.oy, d.cz + d.oz);
        dummy.scale.set(d.sx, d.sy, d.sz);
        dummy.updateMatrix();
        cloudMesh.setMatrixAt(i, dummy.matrix);
      }
      cloudMesh.instanceMatrix.needsUpdate = true;

      // Animate waterfall mist rising and billowing
      const mAttr = mistGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < mistCount; i++) {
        const ms = mistSeeds[i];
        const life = ((elapsed * ms.speed * 0.35 + ms.phase) % 1);
        const y = LAKE_LEVEL + 0.4 + life * 6.5;
        const spread = 1 + life * 0.9;
        mAttr.setXYZ(
          i,
          -55.6 + ms.ox * spread + Math.sin(elapsed * 1.4 + ms.phase) * 0.6,
          y,
          -12.6 + ms.oz * spread + Math.cos(elapsed * 1.1 + ms.phase) * 0.5
        );
      }
      mAttr.needsUpdate = true;
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
