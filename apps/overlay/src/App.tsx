import {
  type OverlayCancelActionPayload,
  type OverlayExecuteActionPayload,
  type OverlayStateSnapshot,
} from '@buddhalive/shared';
import React, { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { templeAudio } from './stage/temple-audio';
import { ThreeStage } from './stage/three-stage';

export type OverlayVisualState =
  | 'PAIRING_REQUIRED'
  | 'HIDDEN_STANDBY'
  | 'PLAYING'
  | 'FALLBACK_2D';

export function App(): React.ReactElement {
  const [visualState, setVisualState] = useState<OverlayVisualState>('HIDDEN_STANDBY');
  const [activeAction, setActiveAction] = useState<OverlayExecuteActionPayload | null>(null);
  const [lastCompletionMode, setLastCompletionMode] = useState<string>('');
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState<boolean>(false);

  // Cấu hình bối cảnh Điện Phật Vàng / Đình Làng / Nhà Cổ / Chùa & Âm thanh
  type BgMode = 'GOLDEN_TEMPLE' | 'COMMUNAL_HALL' | 'TEMPLE' | 'TRANSPARENT';
  const [bgMode, setBgMode] = useState<BgMode>('GOLDEN_TEMPLE');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [welcomeUser, setWelcomeUser] = useState<string | null>(null);
  const [meritCount, setMeritCount] = useState<number>(108);
  const [showMoreMenu, setShowMoreMenu] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<ThreeStage | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Khởi tạo Three.js stage khi mount
  useEffect(() => {
    if (containerRef.current && !stageRef.current) {
      stageRef.current = new ThreeStage(containerRef.current);
      stageRef.current.setBackgroundMode(bgMode);
    }
    return () => {
      stageRef.current?.destroy();
      stageRef.current = null;
    };
  }, []);

  // Tự động phát nhạc thiền thư giãn theo bối cảnh ngay khi người dùng tương tác lần đầu
  useEffect(() => {
    const handleFirstGesture = () => {
      if (!isMuted) {
        templeAudio.switchTheme(bgMode);
      }
    };
    window.addEventListener('click', handleFirstGesture, { once: true });
    window.addEventListener('keydown', handleFirstGesture, { once: true });
    return () => {
      window.removeEventListener('click', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
    };
  }, [isMuted, bgMode]);

  // Đồng bộ bối cảnh 3D (camera, góc nghiêng sàn, bồ đoàn) và âm thanh khi chuyển đổi nền
  useEffect(() => {
    stageRef.current?.setBackgroundMode(bgMode);
    templeAudio.switchTheme(bgMode);
  }, [bgMode]);

  const sampleNames = ['Minh Anh', 'Tuệ Quang', 'Quang Linh', 'Diệu Âm', 'Tâm An', 'Thiện Nhân'];
  const [sampleIdx, setSampleIdx] = useState(0);

  // Kịch Bản 1: Xử lý sự kiện chào mừng khi có Phật tử vào phòng live
  const handleTriggerWelcome = (name?: string) => {
    const chosenName = name || sampleNames[sampleIdx % sampleNames.length] || 'Đạo Hữu';
    setSampleIdx((i) => i + 1);
    setWelcomeUser(chosenName);
    stageRef.current?.triggerWelcomeArrival(chosenName);
    setTimeout(() => {
      setWelcomeUser(null);
    }, 4500);
  };

  // Kịch Bản 2: Thử nghiệm kịch bản Phật tử đứng dậy dâng hương bạch Phật
  const handleSimulateIncense = () => {
    const chosenName = sampleNames[(sampleIdx - 1 + sampleNames.length) % sampleNames.length] || 'Minh Anh';
    setActiveAction({
      executionId: `sim_${Date.now()}`,
      source: 'DEMO',
      characterId: 'char_default',
      characterName: 'Thích Ca Mâu Ni Phật',
      modelUrl: 'sample-character.glb',
      clipName: 'Pray',
      scale: 1,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      loopMode: 'ONCE',
      repeatCount: 1,
      expectedDurationMs: 4000,
      caption: `${chosenName} dâng nén tâm hương cúng dường Phật`,
      senderName: chosenName,
      giftCount: 1,
      giftName: 'Nén Hương Trầm',
      showDemoBadge: true,
      fallback2dEnabled: false,
    });
    setVisualState('PLAYING');

    stageRef.current?.playAction({
      modelUrl: 'sample-character.glb',
      clipName: 'Pray',
      scale: 1,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      durationMs: 4000,
      senderName: chosenName,
      giftName: 'Nén Hương Trầm',
      giftCount: 1,
      onStarted: () => {},
      onCompleted: () => {
        setActiveAction(null);
        setVisualState('HIDDEN_STANDBY');
      },
      onError: () => {
        setActiveAction(null);
        setVisualState('HIDDEN_STANDBY');
      },
    });
  };

  // Kịch Bản 3: Thử nghiệm Đại Lễ Dâng Sen & Ngũ Thể Đầu Địa (3 lạy sát đất)
  const handleSimulateOfferLotus = () => {
    const chosenName = sampleNames[(sampleIdx - 1 + sampleNames.length) % sampleNames.length] || 'Tuệ Quang';
    setActiveAction({
      executionId: `sim_lotus_${Date.now()}`,
      source: 'DEMO',
      characterId: 'char_default',
      characterName: 'Thích Ca Mâu Ni Phật',
      modelUrl: 'sample-character.glb',
      clipName: 'Pray',
      scale: 1,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      loopMode: 'ONCE',
      repeatCount: 1,
      expectedDurationMs: 6000,
      caption: `Đại Lễ Cúng Dường Hoa Sen Vàng — ${chosenName} Ngũ Thể Đầu Địa`,
      senderName: chosenName,
      giftCount: 10,
      giftName: 'Đại Hoa Sen Vàng',
      showDemoBadge: true,
      fallback2dEnabled: false,
    });
    setVisualState('PLAYING');

    stageRef.current?.playAction({
      modelUrl: 'sample-character.glb',
      clipName: 'Pray',
      scale: 1,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      durationMs: 6000,
      senderName: chosenName,
      giftName: 'Đại Hoa Sen Vàng',
      giftCount: 10,
      onStarted: () => {},
      onCompleted: () => {
        setActiveAction(null);
        setVisualState('HIDDEN_STANDBY');
      },
      onError: () => {
        setActiveAction(null);
        setVisualState('HIDDEN_STANDBY');
      },
    });
  };

  // Kịch Bản 4: Thả Đèn Hoa Đăng Cầu Nguyện
  const handleSimulateReleaseLantern = () => {
    const chosenName = sampleNames[(sampleIdx - 1 + sampleNames.length) % sampleNames.length] || 'Diệu Âm';
    stageRef.current?.triggerReleaseLantern(chosenName);
  };

  // Kịch Bản 5: Trợ Niệm Đồng Tu (Khi Comment "A Di Đà Phật")
  const handleTriggerChanting = (name?: string) => {
    const chosenName = name || sampleNames[(sampleIdx - 1 + sampleNames.length) % sampleNames.length] || 'Đồng Tu';
    setMeritCount((c) => c + 1);
    stageRef.current?.triggerChanting(chosenName);
  };

  // Kịch Bản 6: Đại Lễ Nhiễu Phật (Kinh Hành Tập Thể)
  const handleSimulateCircumambulation = () => {
    stageRef.current?.triggerCircumambulation();
  };

  // Khởi tạo và quản lý kết nối Socket.IO
  useEffect(() => {
    let isMounted = true;
    let pollInterval: NodeJS.Timeout | null = null;

    const startPairingFlow = async () => {
      try {
        const reqRes = await fetch('/api/overlay/pair/request', { method: 'POST' });
        const reqData = await reqRes.json();
        if (!reqData.ok || !isMounted) return;

        const { pairingId, code, claimSecret } = reqData.data;
        setPairingCode(code);
        setVisualState('PAIRING_REQUIRED');

        // Polling claim endpoint mỗi 1.5 giây
        pollInterval = setInterval(async () => {
          try {
            const claimRes = await fetch('/api/overlay/pair/claim', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pairingId, claimSecret }),
            });
            const claimData = await claimRes.json();
            if (claimData.ok) {
              if (pollInterval) clearInterval(pollInterval);
              setPairingCode(null);
              setVisualState('HIDDEN_STANDBY');
              socketRef.current?.connect();
            }
          } catch {
            // Tiếp tục poll
          }
        }, 1500);
      } catch (err) {
        console.error('Failed to initiate pairing flow:', err);
      }
    };

    const socket = io({
      path: '/socket.io',
      auth: {
        protocolVersion: '1.0',
        clientType: 'OVERLAY',
        instanceId: 'ovl_browser',
      },
      withCredentials: true,
      autoConnect: true,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      if (!isMounted) return;
      setSocketConnected(true);
      setVisualState('HIDDEN_STANDBY');
      if (pollInterval) clearInterval(pollInterval);

      const webgl = stageRef.current?.isWebGLSupported() ?? true;
      socket.emit('overlay:telemetry', {
        readyToPlay: true,
        webglAvailable: webgl,
        fps: 60,
      });
    });

    socket.on('connect_error', (error) => {
      if (!isMounted) return;
      setSocketConnected(false);
      if (error.message.includes('OVERLAY_PAIRING_REQUIRED')) {
        void startPairingFlow();
      }
    });

    socket.on('system:state_snapshot', (_snapshot: OverlayStateSnapshot) => {
      if (!isMounted) return;
      if (visualState !== 'PAIRING_REQUIRED') {
        stageRef.current?.clearModel();
      }
    });

    // Lắng nghe sự kiện người xem tham gia hoặc theo dõi (Join / Follow / Member) — Kịch Bản 1
    socket.on('live:member_join', (data: { nickname?: string; uniqueId?: string }) => {
      if (!isMounted) return;
      const name = data.nickname || data.uniqueId || 'Đạo Hữu';
      handleTriggerWelcome(name);
    });

    // Lắng nghe bình luận trợ niệm (Kịch Bản 5: Trợ Niệm Đồng Tu)
    socket.on('live:chat', (data: { comment?: string; nickname?: string }) => {
      if (!isMounted) return;
      const comment = (data.comment || '').toLowerCase();
      if (
        comment.includes('a di đà phật') ||
        comment.includes('a di da phat') ||
        comment.includes('nam mo') ||
        comment.includes('nam mô') ||
        comment.includes('di đà')
      ) {
        handleTriggerChanting(data.nickname || 'Đồng Tu');
      }
    });

    socket.on('overlay:execute_action', (action: OverlayExecuteActionPayload) => {
      if (!isMounted) return;
      setActiveAction(action);
      setVisualState('PLAYING');

      const startTime = Date.now();

      stageRef.current?.playAction({
        modelUrl: action.modelUrl,
        clipName: action.clipName,
        scale: action.scale,
        position: action.position,
        rotation: action.rotation,
        durationMs: action.expectedDurationMs,
        senderName: action.senderName,
        giftName: action.giftName,
        giftCount: action.giftCount,
        onStarted: () => {
          socket.emit('overlay:execution_started', {
            executionId: action.executionId,
          });
        },
        onCompleted: () => {
          if (!isMounted) return;
          const actualDurationMs = Date.now() - startTime;
          setLastCompletionMode('PRIMARY_3D');
          setActiveAction(null);
          setVisualState('HIDDEN_STANDBY');
          socket.emit('overlay:execution_completed', {
            executionId: action.executionId,
            completionMode: 'PRIMARY_3D',
            actualDurationMs,
          });
        },
        onError: (code, message) => {
          if (!isMounted) return;
          console.warn('3D model action failed:', code, message);

          if (action.fallback2dEnabled) {
            setVisualState('FALLBACK_2D');
            socket.emit('overlay:execution_started', {
              executionId: action.executionId,
            });
            const fallbackDuration = 3500;
            setTimeout(() => {
              if (!isMounted) return;
              const actualDurationMs = Date.now() - startTime;
              setLastCompletionMode('FALLBACK_2D');
              setActiveAction(null);
              setVisualState('HIDDEN_STANDBY');
              socket.emit('overlay:execution_completed', {
                executionId: action.executionId,
                completionMode: 'FALLBACK_2D',
                actualDurationMs,
                fallbackReasonCode: code,
                fallbackReasonMessage: message,
              });
            }, fallbackDuration);
          } else {
            setActiveAction(null);
            setVisualState('HIDDEN_STANDBY');
            socket.emit('overlay:execution_failed', {
              executionId: action.executionId,
              errorCode: code,
              errorMessage: message,
            });
          }
        },
      });
    });

    socket.on('overlay:cancel_action', (cancel: OverlayCancelActionPayload) => {
      stageRef.current?.clearModel();
      setActiveAction(null);
      setVisualState('HIDDEN_STANDBY');
      socket.emit('overlay:action_cancelled', {
        executionId: cancel.executionId,
      });
    });

    return () => {
      isMounted = false;
      if (pollInterval) clearInterval(pollInterval);
      socket.disconnect();
    };
  }, []);

  const toggleSound = () => {
    const next = !isMuted;
    setIsMuted(next);
    templeAudio.setMuted(next);
    if (!next) {
      templeAudio.playTempleBell(0.4);
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: '#020617',
      }}
      data-overlay-state={visualState}
      data-active-execution-id={activeAction?.executionId || ''}
      data-sender-name={activeAction?.senderName || ''}
      data-active-clip={activeAction?.clipName || ''}
      data-last-completion-mode={lastCompletionMode}
    >
      {/* 1. Bối cảnh Chính Điện Chùa Vàng / Đình Làng / Nhà Cổ (Grand Hall Background Layer) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundImage:
            bgMode === 'GOLDEN_TEMPLE'
              ? 'url(/backgrounds/golden_temple_grand_hall.jpg)'
              : bgMode === 'COMMUNAL_HALL'
              ? 'url(/backgrounds/communal_house_hall.jpg)'
              : bgMode === 'TEMPLE'
              ? 'url(/backgrounds/temple_golden_hour.jpg)'
              : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center center',
          opacity: bgMode !== 'TRANSPARENT' ? 1.0 : 0.0,
          transition: 'opacity 0.6s ease-in-out',
          pointerEvents: 'none',
        }}
      />

      {/* Ánh sáng vàng ấm thanh tịnh */}
      {bgMode !== 'TRANSPARENT' && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background:
              'radial-gradient(circle at 50% 35%, rgba(254, 240, 138, 0.08) 0%, rgba(15, 23, 42, 0.12) 85%)',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* 2. Three.js 3D Canvas (Tượng Phật Vàng, Đài Sen, Hào Quang, Cánh Sen Rơi) */}
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />

      {/* 2.5A. Bảng Trạng Thái Trực Tiếp (Top-Left Live Badge - Chuẩn Golden Lotus) */}
      <div
        data-testid="live-status-badge"
        style={{
          position: 'absolute',
          top: '20px',
          left: '24px',
          background: 'rgba(20, 14, 10, 0.88)',
          border: '1.5px solid #d97706',
          borderRadius: '30px',
          padding: '8px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.65), 0 0 16px rgba(245, 158, 11, 0.25)',
          zIndex: 70,
          fontFamily: "'Segoe UI', system-ui, sans-serif",
          backdropFilter: 'blur(10px)',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, #f59e0b, #78350f)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 10px rgba(245, 158, 11, 0.6)',
          }}
        >
          <span style={{ fontSize: '18px' }}>🪷</span>
        </div>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#fef08a', letterSpacing: '0.5px' }}>
            BuddhaLive Studio
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#fde68a', fontWeight: 600 }}>
            <span
              style={{
                display: 'inline-block',
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: '#ef4444',
                boxShadow: '0 0 6px #ef4444',
              }}
            />
            <span>LIVE</span>
          </div>
        </div>
      </div>

      {/* 2.5B. Bảng Công Đức Niệm Phật (Top-Right Merit Plaque - Chuẩn Vạn Biến Niệm Phật) */}
      <div
        data-testid="merit-counter-badge"
        style={{
          position: 'absolute',
          top: '20px',
          right: '24px',
          background: 'rgba(20, 14, 10, 0.88)',
          border: '1.5px solid #d97706',
          borderRadius: '30px',
          padding: '8px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.65), 0 0 16px rgba(245, 158, 11, 0.25)',
          zIndex: 70,
          fontFamily: "'Segoe UI', system-ui, sans-serif",
          backdropFilter: 'blur(10px)',
        }}
      >
        <span style={{ fontSize: '24px', filter: 'drop-shadow(0 0 6px #fbbf24)' }}>🙏</span>
        <div>
          <div style={{ fontSize: '11px', color: '#fde68a', fontWeight: 700, letterSpacing: '1px' }}>
            VẠN BIẾN NIỆM PHẬT
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#fff', textShadow: '0 0 8px #fbbf24' }}>
            {meritCount.toLocaleString()} <span style={{ fontSize: '13px', color: '#fef08a', fontWeight: 600 }}>biến</span>
          </div>
        </div>
        <span style={{ fontSize: '18px', marginLeft: '4px' }}>🪷</span>
      </div>

      {/* 3. Màn hình Ghép Nối OBS Browser Source */}
      {visualState === 'PAIRING_REQUIRED' && (
        <div
          data-testid="pairing-dialog"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(15, 23, 42, 0.94)',
            border: '2px solid #fbbf24',
            borderRadius: '20px',
            padding: '36px 44px',
            color: '#f8fafc',
            textAlign: 'center',
            boxShadow: '0 25px 50px rgba(0,0,0,0.8), 0 0 25px rgba(251, 191, 36, 0.3)',
            fontFamily: "'Segoe UI', system-ui, sans-serif",
            backdropFilter: 'blur(10px)',
          }}
        >
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#fef08a', marginBottom: '8px' }}>
            🌸 BuddhaLive Studio — Ghép Nối OBS
          </div>
          <div style={{ fontSize: '14px', color: '#cbd5e1', marginBottom: '22px' }}>
            Vui lòng nhập mã này vào Desktop Manager để cấp phép hiển thị
          </div>
          <div
            data-testid="pairing-code"
            style={{
              fontSize: '48px',
              fontWeight: 800,
              letterSpacing: '8px',
              color: '#fef08a',
              background: 'rgba(0,0,0,0.5)',
              padding: '12px 28px',
              borderRadius: '12px',
              display: 'inline-block',
              fontFamily: 'monospace',
              border: '1px solid #eab308',
            }}
          >
            {pairingCode || '------'}
          </div>
        </div>
      )}

      {/* 4. Banner Chào Đón Phật Tử Vào Live (User Join / Follow Banner) */}
      {welcomeUser && (
        <div
          style={{
            position: 'absolute',
            top: '36px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'linear-gradient(135deg, rgba(30, 27, 75, 0.90), rgba(67, 24, 255, 0.85))',
            border: '2px solid #38bdf8',
            borderRadius: '30px',
            padding: '12px 32px',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 10px 30px rgba(56, 189, 248, 0.4)',
            fontFamily: "'Segoe UI', system-ui, sans-serif",
            animation: 'fadeInDown 0.4s ease-out',
            zIndex: 50,
          }}
        >
          <span style={{ fontSize: '24px' }}>🪷</span>
          <div>
            <div style={{ fontSize: '13px', color: '#7dd3fc', fontWeight: 600 }}>
              HOAN HỶ ĐÓN MỪNG ĐẠO HỮU
            </div>
            <div style={{ fontSize: '17px', fontWeight: 700, color: '#fef08a' }}>
              Chào mừng <span style={{ color: '#fff' }}>{welcomeUser}</span> đến với Đạo Tràng — A Di Đà Phật
            </div>
          </div>
        </div>
      )}

      {/* 5. Banner Tri Ân Người Tặng Quà Phong Cách Hoàng Gia (Gift Banner)
          Thiết kế thanh thoát nằm ở góc trên bên trái, bên dưới live badge,
          không che khuất tượng Phật và đạo tràng (Chuẩn tham chiếu thiết kế) */}
      {visualState === 'PLAYING' && activeAction && (
        <div
          data-testid="sender-banner"
          style={{
            position: 'absolute',
            top: '86px',
            left: '24px',
            background:
              'linear-gradient(135deg, rgba(30, 18, 10, 0.94) 0%, rgba(88, 28, 135, 0.90) 50%, rgba(180, 83, 9, 0.92) 100%)',
            border: '1.5px solid #fbbf24',
            borderRadius: '32px',
            padding: '8px 20px 8px 10px',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 8px 28px rgba(0,0,0,0.7), 0 0 20px rgba(245, 158, 11, 0.4)',
            fontFamily: "'Segoe UI', system-ui, sans-serif",
            backdropFilter: 'blur(10px)',
            zIndex: 65,
            animation: 'slideInLeft 0.35s ease-out',
          }}
        >
          {/* Avatar Phật Tử */}
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              border: '2px solid #fbbf24',
              background: 'radial-gradient(circle, #fde047 0%, #b45309 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              boxShadow: '0 0 10px rgba(251, 191, 36, 0.6)',
            }}
          >
            <span style={{ fontSize: '22px' }}>🧕</span>
          </div>

          <div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#fef08a' }}>
              {activeAction.senderName || 'Phật Tử'}
            </div>
            <div style={{ fontSize: '12px', color: '#fed7aa', fontWeight: 500 }}>
              đã tặng <span style={{ color: '#fff', fontWeight: 700 }}>{activeAction.giftName || 'Hoa Sen'}</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '6px' }}>
            <span style={{ fontSize: '24px', filter: 'drop-shadow(0 0 8px #f43f5e)' }}>🪷</span>
            <span
              style={{
                fontSize: '22px',
                fontWeight: 900,
                color: '#fbbf24',
                fontStyle: 'italic',
                textShadow: '0 0 8px #f59e0b',
              }}
            >
              x{activeAction.giftCount || 1}
            </span>
          </div>

          {activeAction.showDemoBadge && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 800,
                background: '#f59e0b',
                color: '#000',
                padding: '2px 8px',
                borderRadius: '12px',
                marginLeft: '4px',
              }}
            >
              DEMO
            </span>
          )}
        </div>
      )}

      {/* 6. Bảng Tri Ân Dự Phòng 2D */}
      {visualState === 'FALLBACK_2D' && activeAction && (
        <div
          data-testid="fallback-2d-alert"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'linear-gradient(135deg, rgba(88, 28, 135, 0.96), rgba(59, 7, 100, 0.96))',
            border: '3px solid #fbbf24',
            borderRadius: '28px',
            padding: '32px 56px',
            color: '#fff',
            textAlign: 'center',
            boxShadow: '0 25px 60px rgba(251, 191, 36, 0.45)',
            fontFamily: "'Segoe UI', system-ui, sans-serif",
            backdropFilter: 'blur(12px)',
          }}
        >
          <div style={{ fontSize: '46px', marginBottom: '10px' }}>🪷</div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#fef08a', marginBottom: '8px' }}>
            Tri Ân Công Đức Cúng Dường
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
            {activeAction.caption}
          </div>
          <div style={{ fontSize: '13px', color: '#fbcfe8' }}>
            🙏 Nam Mô A Di Đà Phật • (Chế độ dự phòng 2D) 🙏
          </div>
        </div>
      )}

      {/* 7. Thanh Điều Hướng Trang Trí Phía Dưới (Bottom Interaction Bar - Chuẩn Thiết Kế Hoàng Gia) */}
      <div
        data-testid="bottom-nav-bar"
        style={{
          position: 'absolute',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          zIndex: 100,
          background: 'rgba(20, 14, 10, 0.90)',
          padding: '8px 18px',
          borderRadius: '36px',
          border: '1.5px solid #d97706',
          boxShadow: '0 10px 30px rgba(0,0,0,0.75), 0 0 20px rgba(245, 158, 11, 0.3)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <button
          type="button"
          onClick={() =>
            setBgMode((m) =>
              m === 'GOLDEN_TEMPLE'
                ? 'COMMUNAL_HALL'
                : m === 'COMMUNAL_HALL'
                ? 'TEMPLE'
                : m === 'TEMPLE'
                ? 'TRANSPARENT'
                : 'GOLDEN_TEMPLE'
            )
          }
          style={{
            background:
              bgMode === 'GOLDEN_TEMPLE'
                ? 'linear-gradient(135deg, #b45309, #78350f)'
                : bgMode === 'COMMUNAL_HALL'
                ? 'linear-gradient(135deg, #854d0e, #581c87)'
                : bgMode === 'TEMPLE'
                ? 'linear-gradient(135deg, #92400e, #451a03)'
                : '#334155',
            color: '#fff',
            border: '1px solid #fbbf24',
            borderRadius: '20px',
            padding: '7px 16px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          }}
          title="Chuyển đổi bối cảnh: Điện Phật Vàng, Đình Làng, Chùa Hoàng Hôn, OBS Trong Suốt"
        >
          <span>🎁</span>
          <span>
            {bgMode === 'GOLDEN_TEMPLE'
              ? 'Điện Phật Vàng'
              : bgMode === 'COMMUNAL_HALL'
              ? 'Sảnh Đình Làng'
              : bgMode === 'TEMPLE'
              ? 'Bối Cảnh Chùa'
              : 'Nền OBS'}
          </span>
        </button>

        <button
          type="button"
          onClick={toggleSound}
          style={{
            background: isMuted ? '#475569' : 'linear-gradient(135deg, #15803d, #166534)',
            color: '#fff',
            border: isMuted ? '1px solid #64748b' : '1px solid #4ade80',
            borderRadius: '20px',
            padding: '7px 16px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          }}
          title="Bật/Tắt tiếng Nhạc Thiền Thư Giãn theo từng bối cảnh"
        >
          <span>{isMuted ? '🔕' : '🌿'}</span>
          <span>
            {isMuted
              ? 'Âm Tắt'
              : bgMode === 'COMMUNAL_HALL'
              ? 'Nhạc Đình Làng'
              : bgMode === 'TEMPLE'
              ? 'Nhạc Hồ Sen'
              : 'Nhạc Thiền 432Hz'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTriggerWelcome()}
          style={{
            background: 'linear-gradient(135deg, #4f46e5, #3730a3)',
            color: '#fff',
            border: '1px solid #818cf8',
            borderRadius: '20px',
            padding: '7px 16px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          }}
          title="Tạo thêm 1 Phật tử bước vào đạo tràng ngồi đài sen hồng"
        >
          <span>🪷</span>
          <span>Thêm Phật Tử</span>
        </button>

        <button
          type="button"
          onClick={handleSimulateIncense}
          style={{
            background: 'linear-gradient(135deg, #d97706, #92400e)',
            color: '#fff',
            border: '1px solid #fde047',
            borderRadius: '20px',
            padding: '7px 16px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          }}
          title="Kịch Bản 2: Phật tử đứng dậy bước lên lư đồng thắp nén hương dâng Phật"
        >
          <span>🕯️</span>
          <span>Thắp Hương</span>
        </button>

        <button
          type="button"
          onClick={handleSimulateOfferLotus}
          style={{
            background: 'linear-gradient(135deg, #db2777, #9d174d)',
            color: '#fff',
            border: '1px solid #f472b6',
            borderRadius: '20px',
            padding: '7px 16px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          }}
          title="Kịch Bản 3: Đại Lễ Dâng Sen & Ngũ Thể Đầu Địa (3 lạy sát đất)"
        >
          <span>💖</span>
          <span>Dâng Sen & Lạy</span>
        </button>

        <button
          type="button"
          onClick={() => setShowMoreMenu((prev) => !prev)}
          style={{
            background: showMoreMenu ? '#78350f' : 'rgba(255, 255, 255, 0.1)',
            color: '#fef08a',
            border: '1px solid #d97706',
            borderRadius: '20px',
            padding: '7px 14px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
          title="Mở thêm kịch bản tâm linh: Thả Hoa Đăng, Niệm Phật, Nhiễu Phật"
        >
          <span>•••</span>
          <span>Xem Thêm</span>
        </button>
      </div>

      {/* Menu Popup Mở Rộng Khi Chọn "Xem Thêm" */}
      {showMoreMenu && (
        <div
          data-testid="more-actions-menu"
          style={{
            position: 'absolute',
            bottom: '72px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: '10px',
            zIndex: 101,
            background: 'rgba(20, 14, 10, 0.94)',
            padding: '8px 16px',
            borderRadius: '24px',
            border: '1.5px solid #d97706',
            boxShadow: '0 10px 30px rgba(0,0,0,0.8), 0 0 16px rgba(245, 158, 11, 0.3)',
            backdropFilter: 'blur(12px)',
            animation: 'fadeInUp 0.25s ease-out',
          }}
        >
          <button
            type="button"
            onClick={() => {
              handleSimulateReleaseLantern();
            }}
            style={{
              background: 'linear-gradient(135deg, #0d9488, #115e59)',
              color: '#fff',
              border: '1px solid #2dd4bf',
              borderRadius: '16px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Kịch Bản 4: Thả Đèn Hoa Đăng Cầu Nguyện Trên Hồ Sen (Có chống spam lag)"
          >
            <span>🏮</span>
            <span>Thả Hoa Đăng</span>
          </button>

          <button
            type="button"
            onClick={() => {
              handleTriggerChanting();
            }}
            style={{
              background: 'linear-gradient(135deg, #ca8a04, #854d0e)',
              color: '#fff',
              border: '1px solid #facc15',
              borderRadius: '16px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Kịch Bản 5: Trợ Niệm Đồng Tu (Hào quang & Câu niệm A Di Đà Phật bay lên)"
          >
            <span>🙏</span>
            <span>Niệm Phật</span>
          </button>

          <button
            type="button"
            onClick={() => {
              handleSimulateCircumambulation();
            }}
            style={{
              background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
              color: '#fff',
              border: '1px solid #a78bfa',
              borderRadius: '16px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Kịch Bản 6: Đại Lễ Nhiễu Phật (Đoàn Phật tử đứng dậy đi kinh hành)"
          >
            <span>🚶</span>
            <span>Nhiễu Phật</span>
          </button>
        </div>
      )}
    </div>
  );
}
