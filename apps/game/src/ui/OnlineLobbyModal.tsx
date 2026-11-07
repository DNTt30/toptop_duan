import React, { useEffect, useState } from 'react';
import { audioSynth } from '../engine/AudioSynth';
import { type ConnectionState, type NetworkRole, type NetworkSync } from '../engine/NetworkSync';
import { type World } from '../engine/World';

interface OnlineLobbyModalProps {
  isOpen: boolean;
  onClose: () => void;
  world: World;
  networkSync: NetworkSync;
}

export const OnlineLobbyModal: React.FC<OnlineLobbyModalProps> = ({
  isOpen,
  onClose,
  world,
  networkSync,
}) => {
  const [netState, setNetState] = useState<ConnectionState>(networkSync.connectionState);
  const [netRole, setNetRole] = useState<NetworkRole>(networkSync.role);
  const [netPing, setNetPing] = useState<number>(networkSync.pingMs);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Lắng nghe thay đổi trạng thái mạng
  useEffect(() => {
    const unsub = networkSync.subscribe((state, role, ping) => {
      setNetState(state);
      setNetRole(role);
      setNetPing(ping);

      // Khi chuyển sang CONNECTED (đối thủ vừa kết nối vào)
      if (state === 'CONNECTED') {
        audioSynth.playUpgrade();
      }
    });

    // Lắng nghe tín hiệu bắt đầu trận đấu từ Host
    const unsubStart = networkSync.onMatchStart(() => {
      onClose();
    });

    return () => {
      unsub();
      unsubStart();
    };
  }, [networkSync, onClose]);

  // Tự động đếm ngược 5 giây khi cả 2 đã kết nối
  useEffect(() => {
    if (netState === 'CONNECTED' && countdown === null) {
      setCountdown(5);
    } else if (netState !== 'CONNECTED') {
      setCountdown(null);
    }
  }, [netState, countdown]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      if (netRole === 'HOST') {
        networkSync.startMatch();
      }
      onClose();
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, netRole, networkSync, onClose]);

  if (!isOpen) return null;

  const handleCopyCode = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(networkSync.roomId);
      setCopiedText('Đã copy mã!');
      setTimeout(() => setCopiedText(null), 2000);
    }
  };

  const handleCopyLink = () => {
    if (typeof window !== 'undefined' && navigator.clipboard) {
      const url = `${window.location.origin}${window.location.pathname}?mode=online2p&room=${networkSync.roomId}`;
      navigator.clipboard.writeText(url);
      setCopiedText('Đã copy link!');
      setTimeout(() => setCopiedText(null), 2000);
    }
  };

  const handleCancelLobby = () => {
    networkSync.disconnect();
    world.setGameMode('SOLO');
    onClose();
  };

  const handleStartNow = () => {
    networkSync.startMatch();
    onClose();
  };

  const isHost = netRole === 'HOST';
  const isConnected = netState === 'CONNECTED';

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(7, 11, 20, 0.90)',
        backdropFilter: 'blur(16px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        boxSizing: 'border-box',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '640px',
          background: 'rgba(15, 23, 42, 0.96)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '20px',
          padding: '24px 28px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.85)',
          color: '#ffffff',
          boxSizing: 'border-box',
        }}
      >
        {/* TIÊU ĐỀ SẢNH */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '24px' }}>🏰</span>
            <h2
              style={{
                margin: 0,
                fontSize: '22px',
                fontWeight: 900,
                background: 'linear-gradient(90deg, #38bdf8, #818cf8, #f43f5e)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
              }}
            >
              Sảnh Đợi Online (Lobby)
            </h2>
          </div>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px' }}>
            Kết nối P2P 1v1 {netPing > 0 ? `• Độ trễ ${netPing}ms` : ''}
          </p>
        </div>

        {/* KHUNG MÃ PHÒNG GỌN GÀNG PHẲNG */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '14px 18px',
            marginBottom: '20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Mã Phòng Thi Đấu:
          </span>
          <span
            style={{
              fontSize: '28px',
              fontWeight: 900,
              color: '#facc15',
              letterSpacing: '3px',
              fontFamily: 'monospace',
            }}
          >
            {networkSync.roomId || 'ĐANG TẠO...'}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={handleCopyCode}
              style={{
                background: 'rgba(250, 204, 21, 0.12)',
                color: '#facc15',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              📋 Copy Mã
            </button>
            <button
              type="button"
              onClick={handleCopyLink}
              style={{
                background: 'rgba(56, 189, 248, 0.12)',
                color: '#38bdf8',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              🔗 Copy Link
            </button>
          </div>
          {copiedText && (
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#4ade80' }}>
              ✓ {copiedText}
            </span>
          )}
        </div>

        {/* 2 CỘT NGƯỜI CHƠI ĐỐI KHÁNG TRONG PHÒNG */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '20px',
          }}
        >
          {/* CỘT 1: CHỦ PHÒNG (HOST - PHE XANH TRÁI) */}
          <div
            style={{
              background: 'rgba(59, 130, 246, 0.06)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              borderRadius: '12px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                background: 'rgba(59, 130, 246, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px',
              }}
            >
              👑
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '14px', color: '#93c5fd' }}>
                Chủ Phòng (P1)
              </div>
              <div style={{ fontSize: '11px', color: '#60a5fa', fontWeight: 600 }}>
                {isHost ? '⭐️ Bạn (Host)' : 'Đối Thủ (Host)'}
              </div>
            </div>
            <div
              style={{
                background: 'rgba(34, 197, 94, 0.15)',
                color: '#4ade80',
                borderRadius: '12px',
                padding: '2px 8px',
                fontSize: '10px',
                fontWeight: 700,
              }}
            >
              ✅ SẴN SÀNG
            </div>
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>Phe Xanh (Trái)</span>
          </div>

          {/* Ở GIỮA: VS */}
          <div style={{ textAlign: 'center' }}>
            <span
              style={{
                fontSize: '18px',
                fontWeight: 900,
                color: '#f43f5e',
                letterSpacing: '1px',
              }}
            >
              VS
            </span>
          </div>

          {/* CỘT 2: KHÁCH (GUEST - PHE ĐỎ PHẢI) */}
          <div
            style={{
              background: isConnected ? 'rgba(239, 68, 68, 0.06)' : 'rgba(255, 255, 255, 0.02)',
              border: isConnected ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '12px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              textAlign: 'center',
              transition: 'all 0.2s ease',
            }}
          >
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                background: isConnected ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px',
              }}
            >
              {isConnected ? '⚔️' : '⏳'}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '14px', color: isConnected ? '#fca5a5' : '#94a3b8' }}>
                Người Chơi 2 (P2)
              </div>
              <div style={{ fontSize: '11px', color: isConnected ? '#f87171' : '#64748b', fontWeight: 600 }}>
                {!isHost ? '⭐️ Bạn (Guest)' : isConnected ? 'Đối Thủ (Guest)' : 'Đang Đợi...'}
              </div>
            </div>
            <div
              style={{
                background: isConnected ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                color: isConnected ? '#4ade80' : '#fbbf24',
                borderRadius: '12px',
                padding: '2px 8px',
                fontSize: '10px',
                fontWeight: 700,
              }}
            >
              {isConnected ? '✅ ĐÃ THAM GIA' : '⏳ ĐANG ĐỢI...'}
            </div>
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>Phe Đỏ (Phải)</span>
          </div>
        </div>

        {/* KHU VỰC THÔNG BÁO TRẠNG THÁI & NÚT HÀNH ĐỘNG */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {isConnected ? (
            /* ĐÃ KẾT NỐI THÀNH CÔNG */
            <div
              style={{
                background: 'rgba(34, 197, 94, 0.08)',
                border: '1px solid rgba(34, 197, 94, 0.2)',
                borderRadius: '12px',
                padding: '12px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#4ade80', marginBottom: '4px' }}>
                🎉 Đã kết nối thành công!
              </div>
              <div style={{ fontSize: '12px', color: '#cbd5e1', marginBottom: '10px' }}>
                {countdown !== null && countdown > 0
                  ? `Trận đấu sẽ tự động bắt đầu sau ${countdown}s...`
                  : 'Đang bắt đầu trận đấu...'}
              </div>

              {isHost ? (
                <button
                  type="button"
                  onClick={handleStartNow}
                  style={{
                    width: '100%',
                    background: 'linear-gradient(135deg, #059669, #10b981)',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '10px',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                  }}
                >
                  ⚔️ Bắt Đầu Trận Đấu Ngay!
                </button>
              ) : (
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#facc15' }}>
                  ⏳ Đang đợi Chủ Phòng bấm bắt đầu...
                </div>
              )}
            </div>
          ) : (
            /* ĐANG ĐỢI KẾT NỐI */
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '10px',
                padding: '10px',
                textAlign: 'center',
                color: '#94a3b8',
                fontSize: '12px',
              }}
            >
              {isHost ? (
                <span>
                  📡 Hãy gửi <b>Mã Phòng</b> hoặc <b>Link Mời</b> cho đối thủ để họ vào sảnh!
                </span>
              ) : (
                <span>
                  🔄 Đang kết nối với Chủ Phòng (Mã: <b>{networkSync.roomId}</b>)...
                </span>
              )}
            </div>
          )}

          {/* NÚT HỦY PHÒNG / THOÁT SẢNH */}
          <button
            type="button"
            onClick={handleCancelLobby}
            style={{
              background: 'transparent',
              border: 'none',
              borderRadius: '8px',
              padding: '8px',
              color: '#64748b',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
          >
            ← Hủy Phòng & Quay Lại Menu Chính
          </button>
        </div>
      </div>
    </div>
  );
};
