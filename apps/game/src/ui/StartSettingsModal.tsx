import React, { useEffect, useState } from 'react';
import { type BotDifficulty } from '../engine/BotAI';
import { gameSettings } from '../data/settings';
import { type NetworkSync } from '../engine/NetworkSync';
import { type GameMode, type World, type WorldSnapshot } from '../engine/World';

interface StartSettingsModalProps {
  isOpen: boolean;
  inGameOnly?: boolean;
  onClose: () => void;
  onReturnToMainMenu?: () => void;
  world: World;
  snapshot: WorldSnapshot;
  networkSync?: NetworkSync;
  isMuted: boolean;
  onToggleMute: () => void;
  speed: number;
  onSetSpeed: (speed: number) => void;
  onOpenOnlineLobby: (role: 'HOST' | 'GUEST', roomCode?: string) => void;
  onOpenPreview?: () => void;
}

type MenuView = 'MAIN' | 'SELECT_MODE' | 'SELECT_DIFFICULTY' | 'INSTRUCTIONS' | 'SETTINGS';

export const StartSettingsModal: React.FC<StartSettingsModalProps> = ({
  isOpen,
  inGameOnly = false,
  onClose,
  onReturnToMainMenu,
  world,
  snapshot,
  networkSync,
  isMuted,
  onToggleMute,
  speed,
  onSetSpeed,
  onOpenOnlineLobby,
  onOpenPreview,
}) => {
  const [menuView, setMenuView] = useState<MenuView>('MAIN');
  const [selectedMode, setSelectedMode] = useState<GameMode>(snapshot.gameMode || 'SOLO');
  const [botDiff, setBotDiff] = useState<BotDifficulty>(world.botAI.difficulty || 'NORMAL');
  const [roomCodeInput, setRoomCodeInput] = useState<string>('');
  const [nickname, setNickname] = useState<string>(() => {
    return gameSettings.getNickname();
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && !inGameOnly) {
      setMenuView('MAIN');
      setErrorMsg(null);
    }
  }, [isOpen, inGameOnly]);

  if (!isOpen) return null;

  const handleSelectModeAndProceed = (mode: GameMode) => {
    setSelectedMode(mode);
    world.setGameMode(mode);
    setErrorMsg(null);
    if (mode !== 'ONLINE_2P') {
      networkSync?.disconnect();
      world.setGameMode(mode);
    }
    if (mode === 'SOLO') {
      setMenuView('SELECT_DIFFICULTY');
    } else if (mode === 'LOCAL_2P') {
      // 2 Người Cùng Máy -> Reset sạch ván cũ (tường thành trống 0 pháo) và bắt đầu ngay!
      world.reset();
      world.setGameMode('LOCAL_2P');
      onClose();
    }
  };

  const handleSelectDiffAndStart = (diff: BotDifficulty) => {
    setBotDiff(diff);
    world.setBotDifficulty(diff);
    // Reset sạch hoàn toàn dữ liệu ván trước (pháo trên thành, lính, vàng, kỷ nguyên)
    world.reset();
    world.setGameMode('SOLO');
    world.setBotDifficulty(diff);
    onClose();
  };

  // Nếu bấm nút Cài Đặt từ trong trận đấu -> Chỉ hiện duy nhất 1 bảng Cài Đặt gọn gàng!
  if (inGameOnly) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(3, 7, 18, 0.72)',
          backdropFilter: 'blur(6px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          boxSizing: 'border-box',
          userSelect: 'none',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '400px',
            background: 'rgba(15, 23, 42, 0.96)',
            border: '1.5px solid rgba(56, 189, 248, 0.4)',
            borderRadius: '22px',
            padding: '24px 26px',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.85)',
            color: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: '#38bdf8', letterSpacing: '0.5px' }}>
              ⚙️ CÀI ĐẶT TRẬN ĐẤU
            </h2>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: 'none',
                color: '#cbd5e1',
                borderRadius: '50%',
                width: '30px',
                height: '30px',
                cursor: 'pointer',
                fontWeight: 900,
              }}
            >
              ✕
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'rgba(30, 41, 59, 0.75)',
              padding: '12px 14px',
              borderRadius: '12px',
            }}
          >
            <span style={{ fontWeight: 700, fontSize: '14px', color: '#e2e8f0' }}>Âm Thanh & Nhạc Nền</span>
            <button
              type="button"
              onClick={onToggleMute}
              style={{
                background: isMuted ? '#ef4444' : '#16a34a',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '6px 14px',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              {isMuted ? '🔇 Đang Tắt' : '🔊 Đang Bật'}
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'rgba(30, 41, 59, 0.75)',
              padding: '12px 14px',
              borderRadius: '12px',
            }}
          >
            <span style={{ fontWeight: 700, fontSize: '14px', color: '#e2e8f0' }}>Tốc Độ Trận Đấu</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[1.0, 1.5, 2.0].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSetSpeed(s)}
                  style={{
                    background: speed === s ? '#2563eb' : '#334155',
                    color: '#fff',
                    border: speed === s ? '1px solid #60a5fa' : 'none',
                    borderRadius: '8px',
                    padding: '6px 11px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          {snapshot.gameMode === 'SOLO' && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(30, 41, 59, 0.75)',
                padding: '12px 14px',
                borderRadius: '12px',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: '14px', color: '#e2e8f0' }}>Độ Khó Máy (Bot)</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                {(['EASY', 'NORMAL', 'HARD'] as BotDifficulty[]).map((d) => {
                  const labels: Record<BotDifficulty, string> = { EASY: 'Dễ', NORMAL: 'Vừa', HARD: 'Khó' };
                  const active = world.botAI.difficulty === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        setBotDiff(d);
                        world.setBotDifficulty(d);
                      }}
                      style={{
                        background: active ? '#d97706' : '#334155',
                        color: '#fff',
                        border: active ? '1px solid #fde047' : 'none',
                        borderRadius: '8px',
                        padding: '6px 10px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      {labels[d]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                padding: '11px',
                fontWeight: 800,
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              ▶️ Tiếp Tục Trận Đấu
            </button>

            <button
              type="button"
              onClick={() => {
                const currentMode = world.gameMode;
                const currentDiff = world.botAI.difficulty;
                world.reset();
                world.setGameMode(currentMode);
                world.setBotDifficulty(currentDiff);
                onClose();
              }}
              style={{
                background: 'rgba(245, 158, 11, 0.18)',
                color: '#fbbf24',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                borderRadius: '12px',
                padding: '10px',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              🔄 Chơi Lại Ván Mới
            </button>

            {onReturnToMainMenu && (
              <button
                type="button"
                onClick={() => {
                  setMenuView('MAIN');
                  onReturnToMainMenu();
                }}
                style={{
                  background: 'transparent',
                  color: '#94a3b8',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderRadius: '12px',
                  padding: '9px',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                🏠 Về Màn Hình Chính
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const handleHostLobby = () => {
    onOpenOnlineLobby('HOST');
  };

  const handleJoinLobby = () => {
    if (!roomCodeInput.trim()) {
      setErrorMsg('⚠️ Vui lòng nhập mã phòng (Ví dụ: SING-2511)!');
      return;
    }
    setErrorMsg(null);
    onOpenOnlineLobby('GUEST', roomCodeInput.trim().toUpperCase());
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'radial-gradient(ellipse at center, rgba(15, 23, 42, 0.72) 0%, rgba(3, 7, 18, 0.94) 100%)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        boxSizing: 'border-box',
        userSelect: 'none',
        fontFamily: '"Cinzel", "Palatino Linotype", "Times New Roman", serif, system-ui',
      }}
    >
      {/* 1. TIÊU ĐỀ HOÀNG KIM "AGE OF WAR" THEO ĐÚNG NGUYÊN BẢN */}
      <div style={{ textAlign: 'center', marginBottom: '18px', position: 'relative' }}>
        <h1
          style={{
            margin: 0,
            fontSize: 'clamp(54px, 7.5vw, 88px)',
            fontWeight: 900,
            letterSpacing: '6px',
            textTransform: 'uppercase',
            background: 'linear-gradient(180deg, #ffffff 0%, #fef08a 25%, #eab308 55%, #ca8a04 78%, #713f12 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0 6px 4px rgba(0, 0, 0, 0.95)) drop-shadow(0 0 25px rgba(234, 179, 8, 0.55))',
            lineHeight: 1.05,
          }}
        >
          AGE OF WAR
        </h1>
        <div
          style={{
            fontSize: 'clamp(12px, 1.4vw, 16px)',
            fontWeight: 800,
            letterSpacing: '4px',
            color: '#38bdf8',
            textTransform: 'uppercase',
            marginTop: '6px',
            textShadow: '0 0 10px rgba(56, 189, 248, 0.8), 0 2px 4px #000',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          THE SINGULARITY ODYSSEY — CHIẾN TRANH TIẾN HÓA 6 KỶ NGUYÊN
        </div>
      </div>

      {/* 2. HÌNH TƯỢNG ANH HÙNG ĐỨNG TRÊN NÓC MENU */}
      <div
        style={{
          width: '72px',
          height: '72px',
          marginBottom: '-16px',
          zIndex: 2,
          filter: 'drop-shadow(0 4px 10px rgba(0, 0, 0, 0.8))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img
          src="/assets/units/age1_unit_melee.png"
          alt="Hero Soldier"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            transform: 'scale(1.25)',
          }}
          onError={(e) => {
            (e.currentTarget as HTMLElement).style.display = 'none';
          }}
        />
      </div>

      {/* 3. KHUNG MENU TRUNG TÂM PHONG CÁCH BÁN TRONG SUỐT AGE OF WAR */}
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          background: 'rgba(255, 255, 255, 0.82)',
          border: '2px solid rgba(255, 255, 255, 0.95)',
          borderRadius: '32px',
          padding: '32px 36px 24px 36px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7), inset 0 0 20px rgba(255, 255, 255, 0.5)',
          color: '#0f172a',
          textAlign: 'center',
          boxSizing: 'border-box',
          backdropFilter: 'blur(12px)',
          transition: 'all 0.25s ease',
        }}
      >
        {/* ========================================================= */}
        {/* VIEW 1: MENU CHÍNH                                        */}
        {/* ========================================================= */}
        {menuView === 'MAIN' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <button
              type="button"
              onClick={() => setMenuView('SELECT_MODE')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#0f172a',
                fontSize: '32px',
                fontWeight: 900,
                letterSpacing: '1px',
                cursor: 'pointer',
                padding: '8px 16px',
                textShadow: '0 2px 4px rgba(255, 255, 255, 0.8)',
                transition: 'transform 0.15s, color 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.1)';
                e.currentTarget.style.color = '#ca8a04';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.color = '#0f172a';
              }}
            >
              Play
            </button>

            <button
              type="button"
              onClick={() => setMenuView('INSTRUCTIONS')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#334155',
                fontSize: '26px',
                fontWeight: 900,
                cursor: 'pointer',
                padding: '6px 16px',
                transition: 'transform 0.15s, color 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.08)';
                e.currentTarget.style.color = '#ca8a04';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.color = '#334155';
              }}
            >
              Instructions
            </button>

            {onOpenPreview && (
              <button
                type="button"
                onClick={onOpenPreview}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#475569',
                  fontSize: '22px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  padding: '6px 16px',
                  transition: 'transform 0.15s, color 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.06)';
                  e.currentTarget.style.color = '#0284c7';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.color = '#475569';
                }}
              >
                Gallery & Studio
              </button>
            )}

            <button
              type="button"
              onClick={() => setMenuView('SETTINGS')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                fontSize: '18px',
                fontWeight: 700,
                cursor: 'pointer',
                padding: '4px 16px',
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              ⚙️ Cài Đặt Âm Thanh
            </button>
          </div>
        )}

        {/* ========================================================= */}
        {/* VIEW 2: CHỌN CHẾ ĐỘ CHIẾN ĐẤU                             */}
        {/* ========================================================= */}
        {menuView === 'SELECT_MODE' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h2 style={{ margin: '0 0 10px 0', fontSize: '24px', fontWeight: 900, color: '#0f172a' }}>
              CHỌN CHẾ ĐỘ
            </h2>

            <button
              type="button"
              onClick={() => handleSelectModeAndProceed('SOLO')}
              style={{
                background: '#f8fafc',
                border: '2px solid #cbd5e1',
                borderRadius: '16px',
                padding: '14px',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#eab308';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(234, 179, 8, 0.25)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#cbd5e1';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <span style={{ fontSize: '28px' }}>🤖</span>
              <div>
                <div style={{ fontWeight: 900, fontSize: '18px', color: '#0f172a' }}>Chơi Đơn (vs Máy)</div>
                <div style={{ fontSize: '12px', color: '#64748b', fontFamily: 'system-ui' }}>
                  Vượt 6 Kỷ Nguyên, nâng cấp máy bắn đá & tháp canh đè bẹp Bot
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleSelectModeAndProceed('LOCAL_2P')}
              style={{
                background: '#f8fafc',
                border: '2px solid #cbd5e1',
                borderRadius: '16px',
                padding: '14px',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#38bdf8';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(56, 189, 248, 0.25)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#cbd5e1';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <span style={{ fontSize: '28px' }}>👥</span>
              <div>
                <div style={{ fontWeight: 900, fontSize: '18px', color: '#0f172a' }}>2 Người Cùng Máy</div>
                <div style={{ fontSize: '12px', color: '#64748b', fontFamily: 'system-ui' }}>
                  P1 (Phím 1-4, E, Space) đối đầu P2 (Phím Numpad / JKL;)
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedMode('ONLINE_2P');
                world.setGameMode('ONLINE_2P');
              }}
              style={{
                background: selectedMode === 'ONLINE_2P' ? '#eff6ff' : '#f8fafc',
                border: selectedMode === 'ONLINE_2P' ? '2px solid #2563eb' : '2px solid #cbd5e1',
                borderRadius: '16px',
                padding: '14px',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <span style={{ fontSize: '28px' }}>🌐</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 900, fontSize: '18px', color: '#0f172a' }}>Đấu Online P2P</div>
                <div style={{ fontSize: '12px', color: '#64748b', fontFamily: 'system-ui' }}>
                  Tạo phòng và gửi link/mã cho bạn bè cùng chơi
                </div>
              </div>
            </button>

            {/* Khung Online P2P nếu được chọn */}
            {selectedMode === 'ONLINE_2P' && (
              <div style={{ background: '#f1f5f9', padding: '12px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  type="button"
                  onClick={handleHostLobby}
                  style={{
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontFamily: 'system-ui',
                  }}
                >
                  🚀 Tạo Phòng Mới
                </button>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    placeholder="MÃ PHÒNG (VD: SING-2511)"
                    value={roomCodeInput}
                    onChange={(e) => setRoomCodeInput(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      fontWeight: 800,
                      textAlign: 'center',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleJoinLobby}
                    style={{
                      background: '#0d9488',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '8px 14px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontFamily: 'system-ui',
                    }}
                  >
                    Vào
                  </button>
                </div>
              </div>
            )}

            {errorMsg && (
              <div style={{ color: '#dc2626', fontSize: '13px', fontWeight: 700, fontFamily: 'system-ui' }}>
                {errorMsg}
              </div>
            )}

            <button
              type="button"
              onClick={() => setMenuView('MAIN')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                fontSize: '15px',
                fontWeight: 700,
                cursor: 'pointer',
                marginTop: '6px',
                fontFamily: 'system-ui',
              }}
            >
              ⬅️ Quay Lại
            </button>
          </div>
        )}

        {/* ========================================================= */}
        {/* VIEW 3: CHỌN ĐỘ KHÓ (SOLO)                                */}
        {/* ========================================================= */}
        {menuView === 'SELECT_DIFFICULTY' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '24px', fontWeight: 900, color: '#0f172a' }}>
              CHỌN ĐỘ KHÓ
            </h2>
            <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#64748b', fontFamily: 'system-ui' }}>
              Chọn cấp độ thử thách đối đầu cùng Trí Tuệ Nhân Tạo Bot AI
            </p>

            <button
              type="button"
              onClick={() => handleSelectDiffAndStart('EASY')}
              style={{
                background: '#f8fafc',
                border: '2px solid #22c55e',
                borderRadius: '16px',
                padding: '14px',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.03)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(34, 197, 94, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <span style={{ fontSize: '28px' }}>🟢</span>
              <div>
                <div style={{ fontWeight: 900, fontSize: '18px', color: '#15803d' }}>Dễ (Easy)</div>
                <div style={{ fontSize: '12px', color: '#64748b', fontFamily: 'system-ui' }}>
                  Bot tấn công vừa phải, thích hợp làm quen và trải nghiệm
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleSelectDiffAndStart('NORMAL')}
              style={{
                background: '#f8fafc',
                border: '2px solid #eab308',
                borderRadius: '16px',
                padding: '14px',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.03)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(234, 179, 8, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <span style={{ fontSize: '28px' }}>🟡</span>
              <div>
                <div style={{ fontWeight: 900, fontSize: '18px', color: '#a16207' }}>Vừa (Normal)</div>
                <div style={{ fontSize: '12px', color: '#64748b', fontFamily: 'system-ui' }}>
                  Bot ra quân dồn dập, tích cực nâng cấp máy bắn đá & tháp thành
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleSelectDiffAndStart('HARD')}
              style={{
                background: '#f8fafc',
                border: '2px solid #ef4444',
                borderRadius: '16px',
                padding: '14px',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.03)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(239, 68, 68, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <span style={{ fontSize: '28px' }}>🔴</span>
              <div>
                <div style={{ fontWeight: 900, fontSize: '18px', color: '#b91c1c' }}>Khó & Địa Ngục (Hard)</div>
                <div style={{ fontSize: '12px', color: '#64748b', fontFamily: 'system-ui' }}>
                  Bot lên thời kỳ cực nhanh, phản xạ tức thì, thử thách tột đỉnh
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMenuView('SELECT_MODE')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                fontSize: '15px',
                fontWeight: 700,
                cursor: 'pointer',
                marginTop: '6px',
                fontFamily: 'system-ui',
              }}
            >
              ⬅️ Quay Lại Chọn Chế Độ
            </button>
          </div>
        )}

        {/* ========================================================= */}
        {/* VIEW 4: HƯỚNG DẪN CHƠI (INSTRUCTIONS)                     */}
        {/* ========================================================= */}
        {menuView === 'INSTRUCTIONS' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left', fontFamily: 'system-ui' }}>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '22px', fontWeight: 900, color: '#0f172a', textAlign: 'center' }}>
              HƯỚNG DẪN CHIẾN ĐẤU
            </h2>

            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', fontSize: '13px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div><strong>⚔️ Điều Khiển Phe 1 (P1 - Xanh):</strong></div>
              <div>• Phím <strong>1, 2, 3, 4</strong>: Mua Lính theo kỷ nguyên</div>
              <div>• Phím <strong>E</strong>: Tiến Hóa Lên Kỷ Nguyên Tiếp Theo</div>
              <div>• Phím <strong>Space</strong>: Kích Hoạt Tuyệt Chiêu Kỷ Nguyên</div>
              <div>• Phím <strong>T</strong>: Mở Menu Nâng Cấp Tháp & Máy Bắn Đá</div>
            </div>

            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', fontSize: '13px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div><strong>🪨 Máy Bắn Đá & Tháp Canh (Turrets):</strong></div>
              <div>• Máy bắn đá trên nóc thành tự động ném đá khi kẻ địch vào tầm.</div>
              <div>• Dùng vàng nâng cấp tháp để tăng +25% sát thương hoặc mở thêm ô tháp (tối đa 3 máy bắn đá cùng lúc!).</div>
            </div>

            <button
              type="button"
              onClick={() => setMenuView('MAIN')}
              style={{
                background: '#0f172a',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                padding: '10px',
                fontWeight: 800,
                cursor: 'pointer',
                marginTop: '8px',
                textAlign: 'center',
              }}
            >
              ⬅️ Đã Hiểu, Quay Lại
            </button>
          </div>
        )}

        {/* ========================================================= */}
        {/* VIEW 5: CÀI ĐẶT & ÂM THANH (SETTINGS)                     */}
        {/* ========================================================= */}
        {menuView === 'SETTINGS' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontFamily: 'system-ui' }}>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '22px', fontWeight: 900, color: '#0f172a' }}>
              CÀI ĐẶT GAME
            </h2>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '12px', borderRadius: '12px' }}>
              <span style={{ fontWeight: 800, color: '#334155' }}>Âm Thanh & Nhạc Nền:</span>
              <button
                type="button"
                onClick={onToggleMute}
                style={{
                  background: isMuted ? '#ef4444' : '#22c55e',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '6px 14px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {isMuted ? '🔇 Đang Tắt' : '🔊 Đang Bật'}
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '12px', borderRadius: '12px' }}>
              <span style={{ fontWeight: 800, color: '#334155' }}>Tốc Độ Trận Đấu:</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                {[1.0, 1.5, 2.0].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onSetSpeed(s)}
                    style={{
                      background: speed === s ? '#2563eb' : '#e2e8f0',
                      color: speed === s ? '#fff' : '#0f172a',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMenuView('MAIN')}
              style={{
                background: '#0f172a',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                padding: '10px',
                fontWeight: 800,
                cursor: 'pointer',
                marginTop: '8px',
              }}
            >
              ⬅️ Quay Lại
            </button>
          </div>
        )}

        {/* FOOTER BẢN QUYỀN KÍNH TẶNG */}
        <div
          style={{
            marginTop: '20px',
            fontSize: '11px',
            color: '#64748b',
            letterSpacing: '0.5px',
            fontWeight: 700,
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          A tribute to Age of War by Louissi & The Singularity Odyssey
        </div>
      </div>
    </div>
  );
};
