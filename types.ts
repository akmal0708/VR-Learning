import * as THREE from 'three';

export type ZoneId =
  | 'harbor'
  | 'beach'
  | 'plaza'
  | 'castle'
  | 'lake'
  | 'waterfall'
  | 'cottage'
  | 'grotto'
  | 'forest'
  | 'mountains';

export interface ZoneInfo {
  id: ZoneId;
  name: string;
  subtitle: string;
}

export interface ColliderCylinder {
  type: 'cylinder';
  x: number;
  z: number;
  radius: number;
  minY?: number;
  maxY?: number;
}

export interface ColliderBox {
  type: 'box';
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY?: number;
  maxY?: number;
  id?: string;
  disabled?: boolean;
}

export type WorldCollider = ColliderCylinder | ColliderBox;

export interface InteractiveTarget {
  id: string;
  kind: 'signboard' | 'door' | 'crystal';
  title: string;
  prompt: string;
  worldPos: THREE.Vector3;
  radius: number;
  hitMesh?: THREE.Object3D;
  onInteract: () => void;
}

export interface SignboardContent {
  id: string;
  title: string;
  location: string;
  body: string;
}

export interface LandmarkMarker {
  id: string;
  label: string;
  x: number;
  z: number;
  kind: 'castle' | 'plaza' | 'falls' | 'grotto' | 'cottage' | 'harbor';
}

export interface HudSnapshot {
  zone: ZoneInfo;
  playerX: number;
  playerZ: number;
  playerYaw: number;
  activePrompt: string | null;
  crystalsCollected: number;
  totalCrystals: number;
  discoveredZones: string[];
}
