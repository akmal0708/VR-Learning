import { useEffect, useRef } from 'react';
import { LAKE_LEVEL, MINIMAP_LANDMARKS, riverCenterX, terrainHeightAt } from '../world/terrainMath';

interface MinimapProps {
  playerX: number;
  playerZ: number;
  playerYaw: number;
}

const MAP_SIZE = 144;
const WORLD_SPAN = 250; // Covers [-125, 125]

export function Minimap({ playerX, playerZ, playerYaw }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Pre-render static island terrain silhouette once
  useEffect(() => {
    const bg = document.createElement('canvas');
    bg.width = MAP_SIZE;
    bg.height = MAP_SIZE;
    const ctx = bg.getContext('2d');
    if (!ctx) return;

    const img = ctx.createImageData(MAP_SIZE, MAP_SIZE);
    for (let py = 0; py < MAP_SIZE; py++) {
      for (let px = 0; px < MAP_SIZE; px++) {
        const wx = (px / MAP_SIZE - 0.5) * WORLD_SPAN;
        const wz = (py / MAP_SIZE - 0.5) * WORLD_SPAN;
        const y = terrainHeightAt(wx, wz);

        let r = 16;
        let g = 74;
        let b = 114;

        // Check lake / river water
        const inLake = Math.hypot(wx + 44, wz - 4) < 20.5 && y < LAKE_LEVEL;
        const inRiver = wz > 12 && wz < 78 && Math.abs(wx - riverCenterX(wz)) < 4.0 && y < 3.6;

        if (inLake || inRiver) {
          r = 46;
          g = 178;
          b = 180;
        } else if (y < 0.0) {
          const shallow = Math.max(0, 1 + y / 2.5);
          r = Math.round(16 + shallow * 28);
          g = Math.round(74 + shallow * 105);
          b = Math.round(114 + shallow * 65);
        } else if (y < 2.9) {
          // Beach sand
          r = 216;
          g = 194;
          b = 146;
        } else if (y > 20.0) {
          // Mountain peak
          r = 124;
          g = 130;
          b = 134;
        } else {
          // Lush grass
          r = 72;
          g = 136;
          b = 80;
        }

        const idx = (py * MAP_SIZE + px) * 4;
        img.data[idx] = r;
        img.data[idx + 1] = g;
        img.data[idx + 2] = b;
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Draw Plaza circle & Castle footprint subtle markers
    const toMap = (v: number) => ((v / WORLD_SPAN) + 0.5) * MAP_SIZE;
    ctx.fillStyle = '#d6ccb8';
    ctx.beginPath();
    ctx.arc(toMap(0), toMap(32), 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#b9b2a8';
    ctx.fillRect(toMap(-17), toMap(-55), (34 / WORLD_SPAN) * MAP_SIZE, (34 / WORLD_SPAN) * MAP_SIZE);

    // Landmark pins
    ctx.fillStyle = '#f8e6b4';
    for (const lm of MINIMAP_LANDMARKS) {
      ctx.beginPath();
      ctx.arc(toMap(lm.x), toMap(lm.z), 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    bgCanvasRef.current = bg;
  }, []);

  // Draw dynamic player position + view cone
  useEffect(() => {
    const canvas = canvasRef.current;
    const bg = bgCanvasRef.current;
    if (!canvas || !bg) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    ctx.save();
    ctx.beginPath();
    ctx.arc(MAP_SIZE / 2, MAP_SIZE / 2, MAP_SIZE / 2 - 1, 0, Math.PI * 2);
    ctx.clip();

    ctx.drawImage(bg, 0, 0);

    const px = ((playerX / WORLD_SPAN) + 0.5) * MAP_SIZE;
    const pz = ((playerZ / WORLD_SPAN) + 0.5) * MAP_SIZE;

    // Facing vector: in Three.js yaw=0 faces -Z (up on minimap)
    const dirAngle = -playerYaw - Math.PI / 2;

    // View cone
    ctx.fillStyle = 'rgba(255, 240, 175, 0.34)';
    ctx.beginPath();
    ctx.moveTo(px, pz);
    ctx.arc(px, pz, 18, dirAngle - 0.48, dirAngle + 0.48);
    ctx.closePath();
    ctx.fill();

    // Player dot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px, pz, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.restore();
  }, [playerX, playerZ, playerYaw]);

  return (
    <div
      className="relative rounded-full overflow-hidden border border-white/25 shadow-lg"
      style={{ width: MAP_SIZE, height: MAP_SIZE, backgroundColor: 'rgba(12, 20, 34, 0.78)' }}
      aria-label="Island Minimap"
    >
      <canvas ref={canvasRef} width={MAP_SIZE} height={MAP_SIZE} className="block" />
      <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] font-mono-tabular font-medium text-white/85 pointer-events-none">
        N
      </span>
    </div>
  );
}
