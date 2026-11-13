import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Compass, Volume2, VolumeX } from 'lucide-react';
import { Minimap } from './components/Minimap';
import { SignboardModal } from './components/SignboardModal';
import { FantasyIslandEngine } from './world/engine';
import { createStructures } from './world/structures';
import { MINIMAP_LANDMARKS, PLAYER_SPAWN } from './world/terrainMath';
import type { HudSnapshot, SignboardContent } from './world/types';

const INITIAL_HUD: HudSnapshot = {
  zone: {
    id: 'harbor',
    name: 'Sunlit Harbor',
    subtitle: 'Southern Timber Pier & Lagoon Overlook',
  },
  playerX: PLAYER_SPAWN.x,
  playerZ: PLAYER_SPAWN.z,
  playerYaw: PLAYER_SPAWN.yaw,
  activePrompt: null,
  crystalsCollected: 0,
  totalCrystals: 8,
  discoveredZones: ['harbor'],
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<FantasyIslandEngine | null>(null);

  const [started, setStarted] = useState(false);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [activeSign, setActiveSign] = useState<SignboardContent | null>(null);
  const [crystalNotice, setCrystalNotice] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [hudCollapsed, setHudCollapsed] = useState(false);
  const [showMinimap, setShowMinimap] = useState(true);
  const [contextLost, setContextLost] = useState(false);

  const noticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new FantasyIslandEngine(
      container,
      {
        onHudUpdate: (snapshot) => setHud(snapshot),
        onOpenSignboard: (content) => setActiveSign(content),
        onCrystalCollected: (name, count, total) => {
          setCrystalNotice(`${name} (${count}/${total})`);
          if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
          noticeTimerRef.current = window.setTimeout(() => setCrystalNotice(null), 2800);
        },
        onPointerLockChange: (locked) => setPointerLocked(locked),
        onContextLost: (lost) => setContextLost(lost),
      },
      createStructures
    );

    engineRef.current = engine;

    return () => {
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Keyboard shortcuts for HUD toggle (H) and Minimap (M)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!started) return;
      if (e.code === 'KeyH' && !activeSign) {
        setHudCollapsed((prev) => !prev);
      } else if (e.code === 'KeyM' && !activeSign) {
        setShowMinimap((prev) => !prev);
      } else if (e.code === 'Escape' && activeSign) {
        setActiveSign(null);
        engineRef.current?.resumeExploration();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [started, activeSign]);

  const handleStartExploration = useCallback(() => {
    setStarted(true);
    engineRef.current?.startExploration();
  }, []);

  const handleCloseSignboard = useCallback(() => {
    setActiveSign(null);
    engineRef.current?.resumeExploration();
  }, []);

  const handleToggleMute = useCallback(() => {
    if (!engineRef.current) return;
    const isNowMuted = engineRef.current.toggleMute();
    setMuted(isNowMuted);
  }, []);

  const handleFastTravel = useCallback((landmarkId: string) => {
    engineRef.current?.teleportToLandmark(landmarkId);
    engineRef.current?.resumeExploration();
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950">
      {/* Isolated WebGL Canvas Mount */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* WebGL Context Loss Fallback */}
      {contextLost && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-8 text-center"
          style={{ backgroundColor: 'rgba(10, 15, 28, 0.94)' }}
        >
          <h2 className="font-display text-2xl font-semibold text-white mb-2">
            Graphics Context Interrupted
          </h2>
          <p className="text-sm text-slate-300 max-w-md mb-5">
            The browser suspended the WebGL context. Reload the page to restore the 3D island view.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 text-sm font-medium text-slate-950 bg-amber-300 rounded-lg hover:bg-amber-200 transition-colors cursor-pointer"
          >
            Reload Scene
          </button>
        </div>
      )}

      {/* TITLE OVERLAY (Live 3D Panoramic Background) */}
      {!started && (
        <div className="fixed inset-0 z-20 flex flex-col items-center justify-end pb-20 px-6 pointer-events-none">
          <div
            className="pointer-events-auto flex flex-col items-center text-center max-w-xl px-8 py-8 rounded-2xl border border-white/15 shadow-2xl"
            style={{ backgroundColor: 'rgba(10, 18, 32, 0.72)' }}
          >
            <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-wider text-white mb-3">
              FANTASY ISLAND
            </h1>
            <p className="text-sm sm:text-base text-slate-200/90 leading-relaxed mb-7 max-w-md">
              Explore a sunlit archipelago of emerald forests, cascading falls, coastal villages, luminous caverns, and a royal citadel.
            </p>
            <button
              type="button"
              onClick={handleStartExploration}
              className="px-8 py-3.5 text-sm font-semibold tracking-wider text-slate-950 bg-amber-300 hover:bg-amber-200 active:scale-[0.98] rounded-lg shadow-lg transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              START EXPLORATION
            </button>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-300/80">
              <span>WASD Move</span>
              <span aria-hidden="true">·</span>
              <span>Mouse Look</span>
              <span aria-hidden="true">·</span>
              <span>Space Jump</span>
              <span aria-hidden="true">·</span>
              <span>E Interact</span>
            </div>
          </div>
        </div>
      )}

      {/* IN-GAME MINIMAL HUD */}
      {started && (
        <div className="fixed inset-0 z-10 pointer-events-none">
          {/* Top-Left: Location Indicator & Crystal Progress */}
          <div className="absolute top-5 left-5 flex flex-col gap-1">
            <div
              className="px-4 py-2.5 rounded-lg border border-white/15"
              style={{ backgroundColor: 'rgba(12, 20, 34, 0.68)' }}
            >
              <div className="flex items-center gap-2 text-slate-100">
                <Compass className="h-4 w-4 text-amber-300 shrink-0" />
                <span className="font-display text-base font-semibold tracking-wide whitespace-nowrap">
                  {hud.zone.name}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-300/85">
                <span className="truncate max-w-[220px]">{hud.zone.subtitle}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular text-cyan-200 whitespace-nowrap">
                  {hud.crystalsCollected}/{hud.totalCrystals} Crystals
                </span>
              </div>
            </div>
          </div>

          {/* Top-Right: Compact Circular Minimap */}
          {showMinimap && !hudCollapsed && (
            <div className="absolute top-5 right-5 flex flex-col items-end gap-2">
              <Minimap
                playerX={hud.playerX}
                playerZ={hud.playerZ}
                playerYaw={hud.playerYaw}
              />
            </div>
          )}

          {/* Crystal Collected Toast */}
          {crystalNotice && (
            <div
              className="absolute top-20 left-1/2 -translate-x-1/2 px-5 py-2 rounded-lg border border-cyan-300/35 text-sm font-medium text-cyan-100 shadow-lg"
              style={{ backgroundColor: 'rgba(12, 26, 42, 0.85)' }}
            >
              Crystal Attuned: {crystalNotice}
            </div>
          )}

          {/* Center Crosshair & Interaction Prompt (Never blocks viewport) */}
          {!activeSign && (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {pointerLocked && <div className="h-1.5 w-1.5 rounded-full bg-white/85 shadow-sm" />}
              {hud.activePrompt && (
                <div
                  className="mt-6 px-4 py-1.5 rounded-lg border border-amber-200/35 text-xs font-medium text-amber-100 shadow-md"
                  style={{ backgroundColor: 'rgba(12, 20, 34, 0.84)' }}
                >
                  Press E — {hud.activePrompt}
                </div>
              )}
            </div>
          )}

          {/* Collapsible Bottom Controls Dock */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto">
            {!pointerLocked && !hudCollapsed && (
              <div
                className="mb-2 flex flex-wrap items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 shadow-md"
                style={{ backgroundColor: 'rgba(12, 20, 34, 0.78)' }}
              >
                <span className="text-[11px] text-slate-300 pr-1.5 border-r border-white/15">
                  Click view or drag to look · Fast Travel:
                </span>
                {MINIMAP_LANDMARKS.map((lm) => (
                  <button
                    key={lm.id}
                    type="button"
                    onClick={() => handleFastTravel(lm.id)}
                    className="px-2 py-0.5 text-[11px] text-slate-200 hover:text-amber-200 hover:bg-white/10 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {lm.label}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setHudCollapsed((prev) => !prev)}
              className="mb-1.5 flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium text-slate-200 hover:text-white border border-white/15 transition-colors cursor-pointer"
              style={{ backgroundColor: 'rgba(12, 20, 34, 0.72)' }}
            >
              {hudCollapsed ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" />
                  <span>Show Controls</span>
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />
                  <span>Hide Controls</span>
                </>
              )}
            </button>

            {!hudCollapsed && (
              <div
                className="flex items-center gap-4 px-5 py-2.5 rounded-xl border border-white/15 shadow-lg text-xs text-slate-200"
                style={{ backgroundColor: 'rgba(12, 20, 34, 0.76)' }}
              >
                <div className="hidden sm:flex items-center gap-2.5 whitespace-nowrap">
                  <span>WASD Move</span>
                  <span aria-hidden="true" className="text-slate-500">·</span>
                  <span>Shift Sprint</span>
                  <span aria-hidden="true" className="text-slate-500">·</span>
                  <span>Space Jump</span>
                  <span aria-hidden="true" className="text-slate-500">·</span>
                  <span>E Interact</span>
                  <span aria-hidden="true" className="text-slate-500">·</span>
                  <span>M Map</span>
                  <span aria-hidden="true" className="text-slate-500">·</span>
                  <span>H HUD</span>
                </div>
                <div className="flex items-center gap-2 border-l border-white/15 pl-3">
                  <button
                    type="button"
                    onClick={handleToggleMute}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:bg-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    aria-label={muted ? 'Unmute audio' : 'Mute audio'}
                  >
                    {muted ? <VolumeX className="h-3.5 w-3.5 text-slate-400" /> : <Volume2 className="h-3.5 w-3.5 text-amber-300" />}
                    <span>{muted ? 'Muted' : 'Audio'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Signboard Reading Modal */}
      {activeSign && <SignboardModal sign={activeSign} onClose={handleCloseSignboard} />}
    </div>
  );
}
