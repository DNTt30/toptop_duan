import React, { useEffect, useRef, useState } from 'react';
import { LANE_WIDTH } from './data/ages';
import { audioSynth } from './engine/AudioSynth';
import { GameLoop } from './engine/GameLoop';
import { NetworkSync } from './engine/NetworkSync';
import { GameRenderer } from './engine/Renderer';
import { World, type WorldSnapshot } from './engine/World';
import { CONFIG } from './data/combatFeelConfig';
import { gameSettings } from './data/settings';
import { LiveEventManager } from './live/LiveEventSource';
import { HUD } from './ui/HUD';
import { OnlineLobbyModal } from './ui/OnlineLobbyModal';
import { CustomizerStudio } from './ui/CustomizerStudio';
import { StartSettingsModal } from './ui/StartSettingsModal';

export const App: React.FC = () => {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<World>(new World());
  const liveManagerRef = useRef<LiveEventManager>(new LiveEventManager(worldRef.current));
  const networkSyncRef = useRef<NetworkSync>(new NetworkSync(worldRef.current));
  const rendererRef = useRef<GameRenderer | null>(null);
  const loopRef = useRef<GameLoop | null>(null);

  const [snapshot, setSnapshot] = useState<WorldSnapshot>(worldRef.current.getSnapshot());
  const [speed, setSpeed] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showOnlineLobby, setShowOnlineLobby] = useState<boolean>(() => {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    return params.get('mode') === 'online2p' && Boolean(params.get('room'));
  });
  const [showStartSettings, setShowStartSettings] = useState<boolean>(() => {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const hasRoom = params.get('mode') === 'online2p' && Boolean(params.get('room'));
    const shouldShow = !hasRoom && params.get('mode') !== 'live' && params.get('autostart') !== '1' && params.get('mode') !== 'preview';
    if (shouldShow) {
      worldRef.current.status = 'PAUSED';
    }
    return shouldShow;
  });
  const [isInGameSettings, setIsInGameSettings] = useState<boolean>(false);
  const [isPreview, setIsPreview] = useState<boolean>(() => {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    return params.get('mode') === 'preview' || (typeof window !== 'undefined' && window.location.pathname.includes('/preview'));
  });
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const showDebugRef = useRef<boolean>(false);
  const f3BodyRef = useRef<HTMLPreElement | null>(null);
  showDebugRef.current = showDebug;

  useEffect(() => {
    let isCancelled = false;
    const world = worldRef.current;
    const netSync = networkSyncRef.current;
    if (typeof window !== 'undefined' && import.meta.env.DEV) {
      (window as any).__world = world;
      (window as any).__netSync = netSync;
      (window as any).gameSettings = gameSettings;
    }

    // Đọc URL Search Params (?mode=solo|local2p|online2p|live&bg=transparent&room=...)
    const params = new URLSearchParams(window.location.search);
    const isTransparent = params.get('bg') === 'transparent';
    const initialMode = params.get('mode');
    const roomParam = params.get('room');

    if (initialMode === 'local2p') {
      world.setGameMode('LOCAL_2P');
    } else if (initialMode === 'online2p' || roomParam) {
      world.setGameMode('ONLINE_2P');
      if (roomParam) {
        netSync.joinRoom(roomParam);
      }
    }

    // Đăng ký nhận snapshot nhẹ cho React HUD
    const unsubscribe = world.subscribe((snap) => {
      setSnapshot(snap);
    });

    if (canvasContainerRef.current) {
      const container = canvasContainerRef.current;
      container.innerHTML = '';

      const renderer = new GameRenderer(world);
      rendererRef.current = renderer;
      renderer.playerControlledTeam =
        initialMode === 'online2p' && netSync.role === 'GUEST' ? 'RIGHT' : 'LEFT';
      if (typeof window !== 'undefined' && import.meta.env.DEV) {
        (window as any).__renderer = renderer;
      }

      const unsubscribeNet = netSync.subscribe(() => {
        renderer.playerControlledTeam =
          world.gameMode === 'ONLINE_2P' && netSync.role === 'GUEST' ? 'RIGHT' : 'LEFT';
      });

      void renderer.init(container, isTransparent).then(() => {
        if (isCancelled) {
          renderer.destroy();
          return;
        }

        // Bộ đệm đối chiếu giá trị cũ để dồn ghi DOM 1 lần cuối frame (chỉ chạm DOM khi đổi giá trị)
        let minimapFrontEl: HTMLElement | null = null;
        let minimapCamEl: HTMLElement | null = null;
        let prevFrontPx = -1;
        let prevCamPx = -1;
        let prevF3Text = '';
        let lastF3UpdateMs = 0;

        const loop = new GameLoop(
          (dt) => world.update(dt),
          (interp, frameDt) => renderer.render(interp, frameDt),
          () => {
            let touches = 0;
            if (!minimapFrontEl || !minimapFrontEl.isConnected) {
              minimapFrontEl = document.querySelector('[data-hud-role="minimap-frontline"]');
            }
            if (!minimapCamEl || !minimapCamEl.isConnected) {
              minimapCamEl = document.querySelector('[data-hud-role="minimap-cam"]');
            }

            const frontPx = Math.round((world.frontlineX / LANE_WIDTH) * 360);
            if (minimapFrontEl && frontPx !== prevFrontPx) {
              prevFrontPx = frontPx;
              minimapFrontEl.style.transform = `translate3d(${frontPx}px, 0, 0)`;
              touches++;
            }

            const camPx = Math.round((renderer.cameraX / LANE_WIDTH) * 360);
            if (minimapCamEl && camPx !== prevCamPx) {
              prevCamPx = camPx;
              minimapCamEl.style.transform = `translate3d(${camPx}px, 0, 0)`;
              touches++;
            }

            if (showDebugRef.current && f3BodyRef.current) {
              const nowMs = performance.now();
              if (nowMs - lastF3UpdateMs >= 120 || prevF3Text === '') {
                lastF3UpdateMs = nowMs;
                const p = loop.perfStats;
                const rs = renderer.getDebugStats();
                const txt =
                  `FPS: ${Math.round(p.fps)} | Frame: ${p.frameTimeMs.toFixed(2)} ms\n` +
                  `Logic: ${p.logicTimeMs.toFixed(2)} ms | Render: ${p.renderTimeMs.toFixed(2)} ms | HUD/DOM: ${p.hudDomTimeMs.toFixed(2)} ms\n` +
                  `DOM/frame: ${p.domTouchesPerFrame} | GC pause: ${p.gcPauseMs.toFixed(2)} ms | Steps bù: ${p.simSteps}/${CONFIG.loop.maxStepsPerFrame} (Drop: ${p.droppedSteps})\n` +
                  `Entities: ${rs.entities} (U:${rs.units} P:${rs.projectiles}) | Dmg: ${rs.floatingTexts}\n` +
                  `Hạt: ${rs.particles}/${rs.maxParticles} | Slash: ${rs.slashes} | Orb: ${rs.rewardOrbs}/${CONFIG.death.orbPoolSize} | VRAM: ${rs.vramMb.toFixed(2)} MB`;
                if (txt !== prevF3Text) {
                  prevF3Text = txt;
                  f3BodyRef.current.textContent = txt;
                  touches++;
                }
              }
            } else if (!showDebugRef.current && prevF3Text !== '') {
              prevF3Text = '';
            }

            if (touches > 0) {
              loop.recordDomUpdate(touches, 0);
            }
          }
        );
        world.onHudNotifyMeasured = (touches, ms) => {
          loop.recordDomUpdate(touches, ms);
        };
        loopRef.current = loop;
        loop.start();
      });

      // Lưu cleanup cho subscription mạng
      (renderer as any)._unsubNet = unsubscribeNet;
    }

    // Khởi tạo và phát nhạc nền BGM
    audioSynth.initBGM('/audio/theme.mp4');
    audioSynth.playBGM();

    // Lắng nghe phím tắt điều khiển:
    // P1 (Phe Trái - Xanh): [1-4], [Space] Ulti, [E] Lên Thời Kỳ
    // P2 (Phe Phải - Đỏ): [Numpad 1-4] hoặc [J, K, L, ;], [Enter] Ulti, [O] Lên Thời Kỳ
    const handleKeyDown = (e: KeyboardEvent) => {
      // Bỏ qua nếu đang gõ input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === CONFIG.loop.debugToggleKey) {
        e.preventDefault();
        setShowDebug((prev) => !prev);
        return;
      }
      if (world.status !== 'PLAYING') return;

      const playerAgeConfig = world.playerAge.getConfig();
      const botAgeConfig = world.botAge.getConfig();
      const isOnline = world.gameMode === 'ONLINE_2P';
      const isGuest = isOnline && netSync.role === 'GUEST';

      // --- ĐIỀU KHIỂN PHE TRÁI (P1) ---
      if (!isGuest) {
        if (e.key === '1') {
          const u = playerAgeConfig.units[0];
          if (u && world.spawnPlayerUnit(u)) {
            if (isOnline) netSync.sendAction('SPAWN', { unitId: u.id, unitIndex: 0 });
          }
        } else if (e.key === '2') {
          const u = playerAgeConfig.units[1];
          if (u && world.spawnPlayerUnit(u)) {
            if (isOnline) netSync.sendAction('SPAWN', { unitId: u.id, unitIndex: 1 });
          }
        } else if (e.key === '3') {
          const u = playerAgeConfig.units[2];
          if (u && world.spawnPlayerUnit(u)) {
            if (isOnline) netSync.sendAction('SPAWN', { unitId: u.id, unitIndex: 2 });
          }
        } else if (e.key === '4') {
          const u = playerAgeConfig.units[3];
          if (u && world.spawnPlayerUnit(u)) {
            if (isOnline) netSync.sendAction('SPAWN', { unitId: u.id, unitIndex: 3 });
          }
        } else if (e.key === ' ' || e.key === 'Spacebar') {
          if (world.triggerUltimate('LEFT')) {
            if (isOnline) netSync.sendAction('ULTIMATE', {});
          }
        } else if (e.key === 'e' || e.key === 'E') {
          if (world.ageUpPlayer()) {
            if (isOnline) netSync.sendAction('AGE_UP', {});
          }
        }
      }

      // --- ĐIỀU KHIỂN PHE PHẢI (P2 / GUEST) ---
      if (world.gameMode === 'LOCAL_2P' || isGuest) {
        if (e.key === 'j' || e.key === 'J' || e.code === 'Numpad1' || e.key === '7') {
          const u = botAgeConfig.units[0];
          if (u && world.spawnRightUnit(u)) {
            if (isOnline) netSync.sendAction('SPAWN', { unitId: u.id, unitIndex: 0 });
          }
        } else if (e.key === 'k' || e.key === 'K' || e.code === 'Numpad2' || e.key === '8') {
          const u = botAgeConfig.units[1];
          if (u && world.spawnRightUnit(u)) {
            if (isOnline) netSync.sendAction('SPAWN', { unitId: u.id, unitIndex: 1 });
          }
        } else if (e.key === 'l' || e.key === 'L' || e.code === 'Numpad3' || e.key === '9') {
          const u = botAgeConfig.units[2];
          if (u && world.spawnRightUnit(u)) {
            if (isOnline) netSync.sendAction('SPAWN', { unitId: u.id, unitIndex: 2 });
          }
        } else if (e.key === ';' || e.code === 'Numpad4' || e.key === '0') {
          const u = botAgeConfig.units[3];
          if (u && world.spawnRightUnit(u)) {
            if (isOnline) netSync.sendAction('SPAWN', { unitId: u.id, unitIndex: 3 });
          }
        } else if (e.key === 'Enter' || e.key === 'p' || e.key === 'P') {
          if (world.triggerUltimate('RIGHT')) {
            if (isOnline) netSync.sendAction('ULTIMATE', {});
          }
        } else if (e.key === 'o' || e.key === 'O') {
          if (world.ageUpRight()) {
            if (isOnline) netSync.sendAction('AGE_UP', {});
          }
        }
      }

      // Di chuyển Camera
      if (e.key === 'ArrowLeft') {
        rendererRef.current?.moveCameraManual(-300);
      } else if (e.key === 'ArrowRight') {
        rendererRef.current?.moveCameraManual(300);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      isCancelled = true;
      audioSynth.pauseBGM();
      window.removeEventListener('keydown', handleKeyDown);
      unsubscribe();
      world.onHudNotifyMeasured = undefined;
      loopRef.current?.stop();
      (rendererRef.current as any)?._unsubNet?.();
      rendererRef.current?.destroy();
      rendererRef.current = null;
      netSync.disconnect();
    };
  }, []);

  const handleSetSpeed = (newSpeed: number) => {
    setSpeed(newSpeed);
    loopRef.current?.setSpeed(newSpeed);
  };

  const handleToggleMute = () => {
    const next = audioSynth.toggleMute();
    setIsMuted(next);
  };

  const handleOpenOnlineLobby = (role: 'HOST' | 'GUEST', roomCode?: string) => {
    setShowStartSettings(false);
    setShowOnlineLobby(true);
    const nickname = gameSettings.getNickname();

    if (roomCode === 'RANDOM') {
      networkSyncRef.current.matchmakeRandom(nickname);
    } else if (role === 'HOST') {
      networkSyncRef.current.hostRoom(roomCode, nickname);
    } else if (roomCode) {
      networkSyncRef.current.joinRoom(roomCode, nickname);
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: '#090d16',
      }}
    >
      {/* Container chứa Canvas render của PixiJS v8 */}
      <div
        ref={canvasContainerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      />

      {/* Lớp HUD React tương tác */}
      <HUD
        world={worldRef.current}
        snapshot={snapshot}
        liveManager={liveManagerRef.current}
        networkSync={networkSyncRef.current}
        speed={speed}
        onSetSpeed={handleSetSpeed}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        onOpenSettings={() => {
          worldRef.current.status = 'PAUSED';
          setIsInGameSettings(true);
          setShowStartSettings(true);
        }}
        onReturnToMainMenu={() => {
          worldRef.current.status = 'PAUSED';
          setIsInGameSettings(false);
          setShowStartSettings(true);
        }}
        onOpenOnlineLobby={handleOpenOnlineLobby}
      />

      {/* Màn hình Cài Đặt & Chọn Chế Độ Chơi khi vào game */}
      <StartSettingsModal
        isOpen={showStartSettings}
        inGameOnly={isInGameSettings}
        onClose={() => {
          setShowStartSettings(false);
          setIsInGameSettings(false);
          if (worldRef.current.status === 'PAUSED') {
            worldRef.current.status = 'PLAYING';
          }
        }}
        onReturnToMainMenu={() => {
          worldRef.current.status = 'PAUSED';
          setIsInGameSettings(false);
          setShowStartSettings(true);
        }}
        world={worldRef.current}
        snapshot={snapshot}
        networkSync={networkSyncRef.current}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        speed={speed}
        onSetSpeed={handleSetSpeed}
        onOpenOnlineLobby={handleOpenOnlineLobby}
        onOpenPreview={() => {
          setShowStartSettings(false);
          setIsPreview(true);
        }}
      />

      {/* Sảnh Chờ Đấu Online P2P (Online Battle Lobby) */}
      <OnlineLobbyModal
        isOpen={showOnlineLobby}
        onClose={() => {
          setShowOnlineLobby(false);
          if (worldRef.current.status === 'PAUSED') {
            setIsInGameSettings(false);
            setShowStartSettings(true);
          }
        }}
        world={worldRef.current}
        networkSync={networkSyncRef.current}
      />

      {/* Xưởng Tùy Biến Vũ Khí Pixel nếu mode=preview hoặc truy cập /preview */}
      {isPreview && (
        <CustomizerStudio
          onBackToGame={() => {
            setIsPreview(false);
            if (worldRef.current.status === 'PAUSED') {
              setIsInGameSettings(false);
              setShowStartSettings(true);
            }
          }}
        />
      )}

      {/* Bảng Debug Hiệu Năng Mở Rộng (Phím F3 — Dồn ghi DOM 1 lần cuối frame, 0 React re-render) */}
      {showDebug && (
        <div
          data-testid="f3-debug-panel"
          style={{
            position: 'fixed',
            top: '86px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            pointerEvents: 'none',
            background: 'rgba(10, 14, 24, 0.90)',
            border: '1px solid rgba(56, 189, 248, 0.55)',
            borderRadius: '8px',
            padding: '8px 14px',
            fontFamily: 'Consolas, Menlo, monospace',
            fontSize: '12px',
            lineHeight: 1.5,
            color: '#e2e8f0',
            minWidth: '410px',
          }}
        >
          <div style={{ color: '#38bdf8', fontWeight: 700, marginBottom: '2px' }}>
            DEBUG F3 ({CONFIG.loop.fixedHz}Hz Fixed • Max {CONFIG.loop.maxStepsPerFrame} Steps/Frame)
          </div>
          <pre
            ref={f3BodyRef}
            style={{
              margin: 0,
              fontFamily: 'inherit',
              fontSize: 'inherit',
              lineHeight: 'inherit',
              whiteSpace: 'pre',
            }}
          >
            {`FPS: -- | Frame: -- ms\nLogic: -- ms | Render: -- ms | HUD/DOM: -- ms\nDOM/frame: 0 | GC pause: 0.00 ms | Steps bù: 0/${CONFIG.loop.maxStepsPerFrame}`}
          </pre>
        </div>
      )}
    </div>
  );
};
