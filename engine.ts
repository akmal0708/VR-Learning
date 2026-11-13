import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { IslandAudio } from './audio';
import { createFoliageAndProps, type FoliageAndPropsSystem } from './foliageAndProps';
import { createMaterialLibrary, type MaterialLibrary } from './materials';
import { createSkyAndWater, type SkyAndWaterSystem } from './skyAndWater';
import {
  getZoneAt,
  LANDMARK_POSITIONS,
  PLAYER_SPAWN,
  terrainHeightAt,
  walkableHeightAt,
} from './terrainMath';
import { buildIslandTerrain } from './terrainMesh';
import { createProceduralTextures, type TextureBundle } from './textures';
import type { HudSnapshot, InteractiveTarget, SignboardContent, WorldCollider } from './types';

export interface EngineCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onOpenSignboard: (content: SignboardContent) => void;
  onCrystalCollected: (name: string, count: number, total: number) => void;
  onPointerLockChange: (locked: boolean) => void;
  onContextLost: (lost: boolean) => void;
}

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveDir = new THREE.Vector3();
const _camLookDir = new THREE.Vector3();
const _toTarget = new THREE.Vector3();

export class FantasyIslandEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;

  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();

  private textures: TextureBundle;
  private materials: MaterialLibrary;
  private skyAndWater: SkyAndWaterSystem;
  private structures: ReturnType<typeof import('./structures').createStructures> | null = null;
  private foliage: FoliageAndPropsSystem;
  private audio = new IslandAudio();

  private colliders: WorldCollider[] = [];
  private interactables: InteractiveTarget[] = [];

  private frameId = 0;
  private disposed = false;
  private mode: 'title' | 'explore' = 'title';
  private pointerLocked = false;
  private isDragging = false;
  private dragMoved = false;
  private modalOpen = false;

  // Player physics state
  private playerPos = new THREE.Vector3(PLAYER_SPAWN.x, PLAYER_SPAWN.y, PLAYER_SPAWN.z);
  private playerVelY = 0;
  private isGrounded = true;
  private yaw = PLAYER_SPAWN.yaw;
  private pitch = PLAYER_SPAWN.pitch;
  private bobTimer = 0;
  private stepAccum = 0;

  private keys: Record<string, boolean> = {};
  private crystalsCollected = 0;
  private totalCrystals = 8;
  private discoveredZones = new Set<string>(['harbor']);
  private activeTarget: InteractiveTarget | null = null;
  private lastHudPush = 0;

  private pmremTex: THREE.Texture | null = null;
  private terrainMesh: THREE.Mesh;

  constructor(
    container: HTMLElement,
    callbacks: EngineCallbacks,
    createStructuresFn: typeof import('./structures').createStructures
  ) {
    this.container = container;
    this.callbacks = callbacks;

    // 1. Software WebGL probe
    this.isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    // 2. Renderer configuration
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    // 3. Scene, Camera & Atmospheric Fog
    this.scene = new THREE.Scene();
    const fogColor = new THREE.Color(0x9bd2ee);
    const fogDensity = 0.0036;
    this.scene.background = fogColor;
    this.scene.fog = new THREE.FogExp2(fogColor.getHex(), fogDensity);

    const aspect = (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(68, aspect, 0.15, 700);
    this.camera.rotation.order = 'YXZ';

    // 4. Studio/Outdoor Environment Reflections (RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.pmremTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.pmremTex;
    this.scene.environmentIntensity = 0.65;
    pmremGenerator.dispose();

    // 5. Three-Point Outdoor Daylight Rig
    const sunDir = new THREE.Vector3(75, 92, 62);
    const keySun = new THREE.DirectionalLight(0xfff1d4, 2.25);
    keySun.position.copy(sunDir);
    keySun.castShadow = !this.isSoftwareGl;
    keySun.shadow.mapSize.set(2048, 2048);
    keySun.shadow.camera.near = 15;
    keySun.shadow.camera.far = 270;
    const d = 105;
    keySun.shadow.camera.left = -d;
    keySun.shadow.camera.right = d;
    keySun.shadow.camera.top = d;
    keySun.shadow.camera.bottom = -d;
    keySun.shadow.bias = -0.00045;
    keySun.shadow.normalBias = 0.03;
    keySun.shadow.radius = 2.5;
    this.scene.add(keySun);

    const hemiFill = new THREE.HemisphereLight(0x88ccff, 0x5c724c, 0.88);
    this.scene.add(hemiFill);

    const rimLight = new THREE.DirectionalLight(0xaad8ff, 0.45);
    rimLight.position.set(-70, 45, -80);
    this.scene.add(rimLight);

    // 6. Procedural Textures & PBR Materials
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso);
    this.materials = createMaterialLibrary(this.textures, this.isSoftwareGl);

    // 7. World Terrain
    this.terrainMesh = buildIslandTerrain(this.materials.terrain);
    this.scene.add(this.terrainMesh);

    // 8. Sky, Ocean, Lake, River & Waterfall
    this.skyAndWater = createSkyAndWater(sunDir, fogColor, fogDensity, this.textures.particleSoft);
    this.scene.add(this.skyAndWater.group);

    // 9. Procedural Structures (Castle, Plaza, Bridges, Cottages, Cave, Floating Islands)
    this.structures = createStructuresFn(
      this.materials,
      this.textures.particleSoft,
      (opening) => this.audio.playDoorToggle(opening)
    );
    this.scene.add(this.structures.group);
    this.colliders.push(...this.structures.colliders);
    this.interactables.push(...this.structures.interactables);

    // 10. Foliage, Props, Signboards, Crystals & Motes
    this.foliage = createFoliageAndProps(
      this.materials,
      this.textures.particleSoft,
      (sign) => {
        this.audio.playSignOpen();
        this.modalOpen = true;
        if (document.pointerLockElement === this.renderer.domElement) {
          document.exitPointerLock();
        }
        this.callbacks.onOpenSignboard(sign);
      },
      (name, totalCollected) => {
        this.crystalsCollected = totalCollected;
        this.audio.playCrystalChime();
        this.callbacks.onCrystalCollected(name, totalCollected, this.totalCrystals);
      }
    );
    this.totalCrystals = this.foliage.totalCrystals;
    this.scene.add(this.foliage.group);
    this.colliders.push(...this.foliage.colliders);
    this.interactables.push(...this.foliage.interactables);

    // Pre-warm shaders on real GPUs
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.tick();
  }

  public startExploration(): void {
    this.mode = 'explore';
    this.modalOpen = false;
    this.audio.start();
    this.playerPos.set(PLAYER_SPAWN.x, PLAYER_SPAWN.y, PLAYER_SPAWN.z);
    this.yaw = PLAYER_SPAWN.yaw;
    this.pitch = PLAYER_SPAWN.pitch;
    this.playerVelY = 0;
    this.requestLock();
  }

  public resumeExploration(): void {
    this.modalOpen = false;
    this.audio.start();
    this.requestLock();
  }

  public setModalOpen(open: boolean): void {
    this.modalOpen = open;
    if (open && document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }
  }

  public requestLock(): void {
    if (this.mode !== 'explore' || this.modalOpen) return;
    try {
      this.renderer.domElement.requestPointerLock?.();
    } catch {
      // Ignore pointer lock rejection in restricted contexts
    }
  }

  public toggleMute(): boolean {
    const next = !this.audio.isMuted();
    this.audio.setMuted(next);
    return next;
  }

  public isMuted(): boolean {
    return this.audio.isMuted();
  }

  public teleportToLandmark(id: string): void {
    const map: Record<string, { x: number; z: number; yaw: number }> = {
      harbor: { x: 0, z: 105, yaw: 0 },
      plaza: { x: 0, z: 44, yaw: 0 },
      castle: { x: 0, z: -12, yaw: 0 },
      falls: { x: -33, z: 10, yaw: 0.7 },
      grotto: { x: -54, z: 38, yaw: Math.PI / 2 },
      cottage: { x: 26, z: 28, yaw: -Math.PI / 2 },
    };
    const dest = map[id];
    if (!dest) return;
    this.playerPos.set(dest.x, walkableHeightAt(dest.x, dest.z) + 0.1, dest.z);
    this.yaw = dest.yaw;
    this.pitch = -0.02;
    this.playerVelY = 0;
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    this.renderer.domElement.addEventListener('mousedown', this.onMouseDown);
    this.renderer.domElement.addEventListener('click', this.onCanvasClick);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onWebglContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onWebglContextRestored);
  }

  private onWebglContextLost = (e: Event): void => {
    e.preventDefault();
    this.callbacks.onContextLost(true);
  };

  private onWebglContextRestored = (): void => {
    this.callbacks.onContextLost(false);
  };

  private onResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private onPointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    this.callbacks.onPointerLockChange(this.pointerLocked);
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (this.mode !== 'explore' || this.modalOpen || e.button !== 0) return;
    this.isDragging = true;
    this.dragMoved = false;
  };

  private onMouseUp = (): void => {
    this.isDragging = false;
  };

  private onCanvasClick = (): void => {
    if (this.mode !== 'explore' || this.modalOpen) return;
    if (!this.pointerLocked) {
      if (!this.dragMoved) {
        this.audio.start();
        this.requestLock();
      }
    } else if (this.activeTarget) {
      this.activeTarget.onInteract();
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (this.mode !== 'explore' || this.modalOpen) return;
    if (!this.pointerLocked && !this.isDragging) return;
    if (this.isDragging && (Math.abs(e.movementX) > 1 || Math.abs(e.movementY) > 1)) {
      this.dragMoved = true;
    }
    const sensitivity = this.pointerLocked ? 0.0021 : 0.0032;
    this.yaw -= e.movementX * sensitivity;
    this.pitch -= e.movementY * sensitivity;
    const maxPitch = Math.PI * 0.45;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keys[e.code] = true;

    if (this.mode === 'explore' && !this.modalOpen) {
      if (e.code === 'Space' && this.isGrounded) {
        this.playerVelY = 7.4;
        this.isGrounded = false;
      }
      if (e.code === 'KeyE' && this.activeTarget) {
        this.activeTarget.onInteract();
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys[e.code] = false;
  };

  private resolveCollisions(x: number, z: number, playerRadius = 0.55): { x: number; z: number } {
    let rx = x;
    let rz = z;

    for (let i = 0; i < this.colliders.length; i++) {
      const col = this.colliders[i];
      if (col.type === 'cylinder') {
        const dx = rx - col.x;
        const dz = rz - col.z;
        const minDist = col.radius + playerRadius;
        const distSq = dx * dx + dz * dz;
        if (distSq < minDist * minDist && distSq > 1e-6) {
          const dist = Math.sqrt(distSq);
          const push = (minDist - dist) / dist;
          rx += dx * push;
          rz += dz * push;
        }
      } else if (!col.disabled) {
        const minX = col.minX - playerRadius;
        const maxX = col.maxX + playerRadius;
        const minZ = col.minZ - playerRadius;
        const maxZ = col.maxZ + playerRadius;
        if (rx > minX && rx < maxX && rz > minZ && rz < maxZ) {
          const dLeft = rx - minX;
          const dRight = maxX - rx;
          const dTop = rz - minZ;
          const dBot = maxZ - rz;
          const minPen = Math.min(dLeft, dRight, dTop, dBot);
          if (minPen === dLeft) rx = minX;
          else if (minPen === dRight) rx = maxX;
          else if (minPen === dTop) rz = minZ;
          else rz = maxZ;
        }
      }
    }

    // Keep player within island lagoon & surrounding beach waters
    const maxWorldRadius = 128;
    const distFromCenter = Math.hypot(rx, rz);
    if (distFromCenter > maxWorldRadius) {
      const s = maxWorldRadius / distFromCenter;
      rx *= s;
      rz *= s;
    }

    return { x: rx, z: rz };
  }

  private updatePlayer(dt: number): void {
    const eyeHeight = 1.78;
    if (this.modalOpen) {
      this.camera.position.set(this.playerPos.x, this.playerPos.y + eyeHeight, this.playerPos.z);
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      return;
    }

    const forwardInput = (this.keys['KeyW'] || this.keys['ArrowUp'] ? 1 : 0) -
      (this.keys['KeyS'] || this.keys['ArrowDown'] ? 1 : 0);
    const strafeInput = (this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0) -
      (this.keys['KeyA'] || this.keys['ArrowLeft'] ? 1 : 0);

    _forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    _moveDir.set(0, 0, 0);
    if (forwardInput !== 0) _moveDir.addScaledVector(_forward, forwardInput);
    if (strafeInput !== 0) _moveDir.addScaledVector(_right, strafeInput);

    const isMoving = _moveDir.lengthSq() > 0.001;
    if (isMoving) _moveDir.normalize();

    const sprinting = Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
    const speed = sprinting ? 12.2 : 7.6;

    const nextX = this.playerPos.x + _moveDir.x * speed * dt;
    const nextZ = this.playerPos.z + _moveDir.z * speed * dt;

    // Prevent climbing vertical cliff walls steeper than walkable limit
    const currentFloor = walkableHeightAt(this.playerPos.x, this.playerPos.z);
    const candidateFloor = walkableHeightAt(nextX, nextZ);
    let finalX = nextX;
    let finalZ = nextZ;
    if (candidateFloor - currentFloor > 1.35 && this.isGrounded) {
      // Slide along x or z separately
      const stepXFloor = walkableHeightAt(nextX, this.playerPos.z);
      const stepZFloor = walkableHeightAt(this.playerPos.x, nextZ);
      if (stepXFloor - currentFloor <= 1.35) {
        finalZ = this.playerPos.z;
      } else if (stepZFloor - currentFloor <= 1.35) {
        finalX = this.playerPos.x;
      } else {
        finalX = this.playerPos.x;
        finalZ = this.playerPos.z;
      }
    }

    const resolved = this.resolveCollisions(finalX, finalZ);
    this.playerPos.x = resolved.x;
    this.playerPos.z = resolved.z;

    // Gravity & Grounding
    const groundY = Math.max(-0.35, walkableHeightAt(this.playerPos.x, this.playerPos.z));
    this.playerVelY -= 19.5 * dt;
    this.playerPos.y += this.playerVelY * dt;

    if (this.playerPos.y <= groundY) {
      this.playerPos.y = groundY;
      this.playerVelY = 0;
      this.isGrounded = true;
    } else if (this.playerPos.y > groundY + 0.25) {
      this.isGrounded = false;
    }

    // Head-bob & Footsteps
    let bobOffset = 0;
    if (isMoving && this.isGrounded) {
      const bobFreq = sprinting ? 12.5 : 8.5;
      this.bobTimer += dt * bobFreq;
      bobOffset = Math.sin(this.bobTimer) * 0.055;
      this.stepAccum += dt * (sprinting ? 2.8 : 1.9);
      if (this.stepAccum >= 1) {
        this.stepAccum = 0;
        const tY = terrainHeightAt(this.playerPos.x, this.playerPos.z);
        const surf = tY < 2.9 ? 'sand' : walkableHeightAt(this.playerPos.x, this.playerPos.z) > tY + 0.1 ? 'stone' : 'grass';
        this.audio.playFootstep(surf);
      }
    } else {
      this.bobTimer = 0;
    }

    this.camera.position.set(this.playerPos.x, this.playerPos.y + eyeHeight + bobOffset, this.playerPos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  private updateInteractables(): void {
    _camLookDir.set(0, 0, -1).applyEuler(this.camera.rotation);
    let best: InteractiveTarget | null = null;
    let bestScore = Infinity;

    for (let i = 0; i < this.interactables.length; i++) {
      const item = this.interactables[i];
      _toTarget.subVectors(item.worldPos, this.camera.position);
      const dist = _toTarget.length();
      if (dist > item.radius) continue;

      _toTarget.normalize();
      const align = _camLookDir.dot(_toTarget);
      if (align < 0.35 && dist > 2.2) continue;

      // Auto-collect crystals if very close (< 1.7 units)
      if (item.kind === 'crystal' && dist < 1.85) {
        item.onInteract();
        continue;
      }

      const score = dist * (1.4 - align);
      if (score < bestScore) {
        bestScore = score;
        best = item;
      }
    }

    this.activeTarget = best;
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed) return;
    const dt = Math.min(0.05, this.clock.getDelta());
    const elapsed = this.clock.elapsedTime;

    if (this.mode === 'title') {
      // Gentle cinematic panoramic sweep over the harbor, plaza & castle
      const swayX = Math.sin(elapsed * 0.16) * 14;
      const swayZ = Math.cos(elapsed * 0.12) * 5;
      this.camera.position.set(swayX, 14.5 + Math.sin(elapsed * 0.25) * 1.2, 114 + swayZ);
      this.camera.lookAt(0, 11, -18);
    } else {
      this.updatePlayer(dt);
      this.updateInteractables();
    }

    // Update animated world systems
    this.materials.updateTime(elapsed);
    this.skyAndWater.update(elapsed, this.camera.position);
    this.structures?.update(elapsed, dt);
    this.foliage.update(elapsed, dt);

    // Update spatial ambience volume
    const distFalls = Math.hypot(
      this.playerPos.x - LANDMARK_POSITIONS.waterfall.x,
      this.playerPos.z - LANDMARK_POSITIONS.waterfall.z
    );
    const distShore = Math.max(0, 108 - Math.hypot(this.playerPos.x, this.playerPos.z));
    this.audio.updateAmbience(distFalls, distShore, elapsed);

    // Push HUD update at ~12Hz to avoid unnecessary React re-renders
    if (elapsed - this.lastHudPush > 0.08) {
      this.lastHudPush = elapsed;
      const zone = getZoneAt(this.playerPos.x, this.playerPos.z);
      this.discoveredZones.add(zone.id);
      this.callbacks.onHudUpdate({
        zone,
        playerX: this.playerPos.x,
        playerZ: this.playerPos.z,
        playerYaw: this.yaw,
        activePrompt: this.activeTarget ? this.activeTarget.prompt : null,
        crystalsCollected: this.crystalsCollected,
        totalCrystals: this.totalCrystals,
        discoveredZones: Array.from(this.discoveredZones),
      });
    }

    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.renderer.domElement.removeEventListener('mousedown', this.onMouseDown);
    this.renderer.domElement.removeEventListener('click', this.onCanvasClick);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onWebglContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onWebglContextRestored);

    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }

    this.terrainMesh.geometry.dispose();
    this.skyAndWater.dispose();
    this.structures?.dispose();
    this.foliage.dispose();
    this.materials.dispose();
    this.textures.dispose();
    this.pmremTex?.dispose();
    this.audio.dispose();
    this.renderer.dispose();

    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
