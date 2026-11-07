import React, { useEffect, useRef, useState } from 'react';
import { AGES_DATA, type TurretConfig } from '../data/ages';
import { UPGRADE_CONFIG } from '../data/upgrades';
import { type ConnectionState, type NetworkRole, type NetworkSync } from '../engine/NetworkSync';
import { type World, type WorldSnapshot } from '../engine/World';
import { type LiveEventManager } from '../live/LiveEventSource';

interface HUDProps {
  world: World;
  snapshot: WorldSnapshot;
  liveManager: LiveEventManager;
  networkSync?: NetworkSync;
  speed: number;
  onSetSpeed: (speed: number) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onSelectAgePreview?: (ageId: number) => void;
  onOpenSettings?: () => void;
  onReturnToMainMenu?: () => void;
  onOpenOnlineLobby?: (role: 'HOST' | 'GUEST', roomCode?: string) => void;
}

export type MenuTab = 'TURRETS' | 'EVOLVE' | null;

export const HUD: React.FC<HUDProps> = ({
  world,
  snapshot,
  networkSync,
  isMuted,
  onToggleMute,
  onOpenSettings,
  onReturnToMainMenu,
}) => {
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [activeMenuTab, setActiveMenuTab] = useState<MenuTab>(null);
  const [showP2Turrets, setShowP2Turrets] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [goldPop, setGoldPop] = useState(false);

  // Trạng thái mạng Online P2P
  const [netState, setNetState] = useState<ConnectionState>(networkSync?.connectionState || 'DISCONNECTED');
  const [netRole, setNetRole] = useState<NetworkRole>(networkSync?.role || 'SOLO');
  const [netPing, setNetPing] = useState<number>(networkSync?.pingMs || 0);
  const [showOnlineModal, setShowOnlineModal] = useState<boolean>(false);
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');

  // Tự động nhận diện màn hình Dọc (9:16 Portrait - TikTok LIVE 720x1280) vs Ngang (16:9 1280x720)
  const [isPortrait, setIsPortrait] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.location) return false;
    const p = new URLSearchParams(window.location.search || '');
    return p.get('layout') === 'portrait' || (window.innerHeight || 0) > (window.innerWidth || 0);
  });

  useEffect(() => {
    const handleResize = () => {
      if (typeof window === 'undefined' || !window.location) return;
      const p = new URLSearchParams(window.location.search || '');
      setIsPortrait(p.get('layout') === 'portrait' || (window.innerHeight || 0) > (window.innerWidth || 0));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!networkSync) return;
    return networkSync.subscribe((state, role, ping) => {
      setNetState(state);
      setNetRole(role);
      setNetPing(ping);
    });
  }, [networkSync]);

  const prevGoldRef = useRef(snapshot.playerGold);
  const prevPlayerAgeRef = useRef(snapshot.playerAge);
  const prevBotAgeRef = useRef(snapshot.botAge);
  const prevUltiReadyRef = useRef(snapshot.playerUltiCooldownPercent <= 0);

  const playerAgeConfig = AGES_DATA[snapshot.playerAge] || AGES_DATA[1]!;
  const botAgeConfig = AGES_DATA[snapshot.botAge] || AGES_DATA[1]!;
  const nextAgeConfig = AGES_DATA[snapshot.playerAge + 1];
  const rightNextAgeConfig = AGES_DATA[snapshot.botAge + 1];

  const isOnline = snapshot.gameMode === 'ONLINE_2P';
  const isGuestRole = isOnline && netRole === 'GUEST';

  const canAgeUp = world.playerEconomy.canAgeUp(snapshot.playerAge);
  const canRightAgeUp = world.botEconomy.canAgeUp(snapshot.botAge);
  const ultiReady = snapshot.playerUltiCooldownPercent <= 0;
  const rightUltiReady = snapshot.botUltiCooldownPercent <= 0;
  const myBaseHp = isGuestRole ? snapshot.botBaseHp : snapshot.playerBaseHp;
  const isBaseCritical = myBaseHp <= 200 && myBaseHp > 0;

  // Trạng thái Vũ Khí Thành của phe người chơi hiện tại (LEFT khi Solo/Host/P1, RIGHT khi Guest)
  const myAge = isGuestRole ? snapshot.botAge : snapshot.playerAge;
  const myAgeConfig = isGuestRole ? botAgeConfig : playerAgeConfig;
  const myNextAgeConfig = isGuestRole ? rightNextAgeConfig : nextAgeConfig;
  const myGold = isGuestRole ? snapshot.rightGold : snapshot.playerGold;
  const myXp = isGuestRole ? snapshot.rightXp : snapshot.playerXp;
  const myCanAgeUp = isGuestRole ? canRightAgeUp : canAgeUp;
  const myTurretManager = isGuestRole ? world.botTurrets : world.playerTurrets;

  const turretCurrentLvl = isGuestRole ? snapshot.rightTurretLevel : snapshot.playerTurretLevel;
  const turretSlotsCount = isGuestRole ? snapshot.rightTurretSlotsCount : snapshot.playerTurretSlotsCount;
  const turretUpgradeCost = UPGRADE_CONFIG.getTurretUpgradeCost(turretCurrentLvl, myAge);
  const canAffordTurretUpgrade =
    turretCurrentLvl < UPGRADE_CONFIG.turret.maxLevel &&
    turretUpgradeCost !== null &&
    myGold >= turretUpgradeCost;

  const nextSlotCost = UPGRADE_CONFIG.getAddSlotCost(turretSlotsCount, myAge);
  const canAddSlot = turretSlotsCount < 3;
  const canAffordAddSlot = canAddSlot && myGold >= nextSlotCost;

  const canAffordTurretAction = canAffordTurretUpgrade || canAffordAddSlot;

  // Trạng thái Vũ Khí Thành riêng cho P2 (PHE ĐỎ) trong chế độ LOCAL_2P
  const rightTurretLvl = snapshot.rightTurretLevel;
  const rightTurretSlotsCount = snapshot.rightTurretSlotsCount;
  const rightTurretUpgradeCost = UPGRADE_CONFIG.getTurretUpgradeCost(rightTurretLvl, snapshot.botAge);
  const canAffordRightTurretUpgrade =
    rightTurretLvl < UPGRADE_CONFIG.turret.maxLevel &&
    rightTurretUpgradeCost !== null &&
    snapshot.rightGold >= rightTurretUpgradeCost;
  const rightNextSlotCost = UPGRADE_CONFIG.getAddSlotCost(rightTurretSlotsCount, snapshot.botAge);
  const canAddRightSlot = rightTurretSlotsCount < 3;
  const canAffordAddRightSlot = canAddRightSlot && snapshot.rightGold >= rightNextSlotCost;

  // Hiệu ứng nhảy số vàng khi nhận thưởng
  useEffect(() => {
    if (snapshot.playerGold > prevGoldRef.current) {
      setGoldPop(true);
      const timer = setTimeout(() => setGoldPop(false), 250);
      prevGoldRef.current = snapshot.playerGold;
      return () => clearTimeout(timer);
    }
    prevGoldRef.current = snapshot.playerGold;
  }, [snapshot.playerGold]);

  // Toast thông báo các sự kiện quan trọng
  useEffect(() => {
    if (snapshot.playerAge > prevPlayerAgeRef.current) {
      setToastMessage(`⭐ TIẾN HÓA LÊN KỶ NGUYÊN ${playerAgeConfig.name.toUpperCase()} THÀNH CÔNG!`);
      prevPlayerAgeRef.current = snapshot.playerAge;
      const t = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(t);
    }
    prevPlayerAgeRef.current = snapshot.playerAge;
  }, [snapshot.playerAge, playerAgeConfig.name]);

  useEffect(() => {
    if (snapshot.botAge > prevBotAgeRef.current) {
      setToastMessage(`⚔️ ĐỐI THỦ ĐÃ TIẾN HÓA LÊN KỶ NGUYÊN ${botAgeConfig.name.toUpperCase()}!`);
      prevBotAgeRef.current = snapshot.botAge;
      const t = setTimeout(() => setToastMessage(null), 3500);
      return () => clearTimeout(t);
    }
    prevBotAgeRef.current = snapshot.botAge;
  }, [snapshot.botAge, botAgeConfig.name]);

  useEffect(() => {
    if (ultiReady && !prevUltiReadyRef.current) {
      setToastMessage(`⚡ TUYỆT CHIÊU [${playerAgeConfig.ultimate.name.toUpperCase()}] ĐÃ SẴN SÀNG!`);
      const t = setTimeout(() => setToastMessage(null), 3000);
      prevUltiReadyRef.current = true;
      return () => clearTimeout(t);
    }
    prevUltiReadyRef.current = ultiReady;
  }, [ultiReady, playerAgeConfig.ultimate.name]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleAgeUpMySide = () => {
    if (isGuestRole) {
      if (world.ageUpRight()) {
        networkSync?.sendAction('AGE_UP', {});
        setToastMessage(`⭐ TIẾN HÓA LÊN KỶ NGUYÊN TIẾP THEO THÀNH CÔNG!`);
        setTimeout(() => setToastMessage(null), 3000);
      }
    } else {
      if (world.ageUpPlayer()) {
        if (isOnline) networkSync?.sendAction('AGE_UP', {});
        setToastMessage(`⭐ TIẾN HÓA LÊN KỶ NGUYÊN TIẾP THEO THÀNH CÔNG!`);
        setTimeout(() => setToastMessage(null), 3000);
      }
    }
  };

  const handleUpgradeMyTurret = (): boolean => {
    if (isGuestRole) {
      if (world.upgradeRightTurret()) {
        networkSync?.sendAction('UPGRADE_TURRET', {});
        return true;
      }
      return false;
    }
    if (world.upgradePlayerTurret()) {
      if (isOnline) networkSync?.sendAction('UPGRADE_TURRET', {});
      return true;
    }
    return false;
  };

  // Nâng cấp nhanh vũ khí trên thành
  const handleQuickUpgrade = () => {
    if (canAffordTurretUpgrade) {
      if (handleUpgradeMyTurret()) {
        setToastMessage(`🏰 Nâng cấp Vũ Khí Thành lên Lv${turretCurrentLvl + 1} (-${turretUpgradeCost}G)!`);
      }
    } else if (canAffordAddSlot) {
      handleBuySlot();
    } else {
      setToastMessage('⚠️ Không đủ vàng để nâng cấp vũ khí trên thành!');
    }
    setTimeout(() => setToastMessage(null), 2000);
  };

  // Mua thêm ô cắm tháp
  const handleBuySlot = () => {
    if (!canAddSlot) {
      setToastMessage('⚠️ Đã đạt giới hạn tối đa 3 ô cắm tháp!');
      setTimeout(() => setToastMessage(null), 2000);
      return;
    }
    if (!canAffordAddSlot) {
      setToastMessage(`⚠️ Cần ${nextSlotCost}G để mở thêm ô tháp (Bạn có ${myGold}G)!`);
      setTimeout(() => setToastMessage(null), 2000);
      return;
    }
    const added = isGuestRole ? world.addRightTurretSlot() : world.addPlayerTurretSlot();
    if (added) {
      if (isOnline) networkSync?.sendAction('ADD_SLOT', {});
      setToastMessage(`🏰 Mở thành công Ô Tháp thứ ${turretSlotsCount + 1} (-${nextSlotCost}G)!`);
      setTimeout(() => setToastMessage(null), 2500);
    }
  };

  // Nâng cấp nhanh Vũ Khí Thành cho P2 trong LOCAL_2P
  const handleP2QuickUpgrade = () => {
    if (canAffordRightTurretUpgrade && world.upgradeRightTurret()) {
      setToastMessage(`🏰 P2 nâng cấp Vũ Khí Thành lên Lv${rightTurretLvl + 1} (-${rightTurretUpgradeCost}G)!`);
      setTimeout(() => setToastMessage(null), 2000);
    } else if (canAffordAddRightSlot && world.addRightTurretSlot()) {
      setToastMessage(`🏰 P2 mở Ô Tháp thứ ${rightTurretSlotsCount + 1} (-${rightNextSlotCost}G)!`);
      setTimeout(() => setToastMessage(null), 2000);
    }
  };

  // Hotkeys T (Vũ Khí Thành P1/Online), G (Nâng nhanh P1/Online), I (Vũ Khí Thành P2), U (Nâng nhanh P2)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (world.status !== 'PLAYING') return;

      if (e.key === 't' || e.key === 'T') {
        setActiveMenuTab((prev) => (prev === 'TURRETS' ? null : 'TURRETS'));
      } else if (e.key === 'g' || e.key === 'G') {
        handleQuickUpgrade();
      } else if (snapshot.gameMode === 'LOCAL_2P' && (e.key === 'i' || e.key === 'I')) {
        setShowP2Turrets((prev) => !prev);
      } else if (snapshot.gameMode === 'LOCAL_2P' && (e.key === 'u' || e.key === 'U')) {
        handleP2QuickUpgrade();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    snapshot.gameMode,
    snapshot.playerGold,
    snapshot.rightGold,
    snapshot.playerAge,
    snapshot.botAge,
    snapshot.playerTurretLevel,
    snapshot.rightTurretLevel,
    turretUpgradeCost,
    turretCurrentLvl,
    rightTurretUpgradeCost,
    rightTurretLvl,
    netRole,
  ]);

  const handleSellTurret = (slotIdx: number) => {
    if (isGuestRole) {
      const refund = world.sellRightTurret(slotIdx);
      if (refund > 0) {
        networkSync?.sendAction('SELL_TURRET', { slotIndex: slotIdx });
      }
      return;
    }
    const refund = world.sellPlayerTurret(slotIdx);
    if (refund > 0 && isOnline) {
      networkSync?.sendAction('SELL_TURRET', { slotIndex: slotIdx });
    }
  };

  const handleBuildTurret = (slotIdx: number, turretConfig: TurretConfig) => {
    if (isGuestRole) {
      if (world.buildRightTurret(slotIdx, turretConfig)) {
        networkSync?.sendAction('BUILD_TURRET', { slotIndex: slotIdx, turretId: turretConfig.id });
      }
      return;
    }
    if (world.buildPlayerTurret(slotIdx, turretConfig)) {
      if (isOnline) {
        networkSync?.sendAction('BUILD_TURRET', { slotIndex: slotIdx, turretId: turretConfig.id });
      }
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '16px 24px',
        color: '#ffffff',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        boxSizing: 'border-box',
        overflow: 'hidden',
        // Viền đỏ nhấp nháy khi căn cứ nguy kịch
        boxShadow: isBaseCritical ? 'inset 0 0 60px rgba(239, 68, 68, 0.7)' : 'none',
        transition: 'box-shadow 0.3s ease',
      }}
    >
      <style>{`
        @keyframes pulseGoldGlow {
          0% { box-shadow: 0 0 6px rgba(250, 204, 21, 0.5); transform: scale(1); }
          50% { box-shadow: 0 0 18px rgba(250, 204, 21, 0.95), inset 0 0 8px rgba(250, 204, 21, 0.5); transform: scale(1.03); }
          100% { box-shadow: 0 0 6px rgba(250, 204, 21, 0.5); transform: scale(1); }
        }
        @keyframes pulseCyanGlow {
          0% { box-shadow: 0 0 6px rgba(56, 189, 248, 0.5); transform: scale(1); }
          50% { box-shadow: 0 0 16px rgba(56, 189, 248, 0.95), inset 0 0 6px rgba(56, 189, 248, 0.4); transform: scale(1.03); }
          100% { box-shadow: 0 0 6px rgba(56, 189, 248, 0.5); transform: scale(1); }
        }
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ==================================================== */}
      {/* 1. TOAST THÔNG BÁO SỰ KIỆN NÓNG GIỮA MÀN HÌNH */}
      {/* ==================================================== */}
      {toastMessage && (
        <div
          style={{
            position: 'absolute',
            top: '84px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95))',
            border: '2px solid #facc15',
            borderRadius: '24px',
            padding: '10px 24px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.7), 0 0 20px rgba(250, 204, 21, 0.4)',
            zIndex: 100,
            fontSize: '18px',
            fontWeight: 900,
            color: '#fef08a',
            textShadow: '0 2px 4px rgba(0,0,0,0.8)',
            letterSpacing: '1px',
            pointerEvents: 'auto',
            animation: 'fadeInDown 0.3s ease',
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* ==================================================== */}
      {/* 2. VÙNG HUD TRÊN (12%): MÁU CĂN CỨ 28PX, VÀNG, XP */}
      {/* ==================================================== */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '16px',
        }}
      >
        {/* KHỐI TRÁI: NGƯỜI CHƠI (PHE BẠN — GỘP TRONG NỀN MAP MỞ RỘNG) */}
        <div
          style={{
            pointerEvents: 'auto',
            background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.56) 0%, rgba(15, 23, 42, 0.28) 100%)',
            border: '1px solid rgba(56, 189, 248, 0.32)',
            borderRadius: '14px',
            padding: '8px 14px',
            boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
            minWidth: '290px',
            backdropFilter: 'blur(6px)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontWeight: 800, fontSize: '15px', color: '#38bdf8' }}>
              {isGuestRole ? '⚔️ ĐỐI THỦ (P1 HOST)' : snapshot.gameMode === 'LOCAL_2P' ? '🛡️ NGƯỜI CHƠI 1 (P1)' : '🛡️ CĂN CỨ BẠN'}
            </span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>
              {snapshot.playerUnitCount}/30 lính
            </span>
          </div>

          {/* THANH MÁU CĂN CỨ CAO 28PX ĐẬM NÉT */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '24px',
              background: 'rgba(0, 0, 0, 0.5)',
              borderRadius: '6px',
              overflow: 'hidden',
              border: 'none',
            }}
          >
            <div
              style={{
                width: `${Math.max(0, (snapshot.playerBaseHp / 1000) * 100)}%`,
                height: '100%',
                background: isBaseCritical
                  ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                  : 'linear-gradient(90deg, #16a34a, #22c55e, #4ade80)',
                transition: 'width 0.2s ease',
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '13px',
                fontWeight: 800,
                color: '#ffffff',
                textShadow: '0 1px 3px rgba(0,0,0,0.8)',
              }}
            >
              {Math.round(snapshot.playerBaseHp)} / 1000 HP
            </div>
          </div>

          {/* DÒNG TÀI NGUYÊN: VÀNG NHẢY SỐ & XP */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
            {/* Vàng số to nhảy số */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transform: goldPop ? 'scale(1.15)' : 'scale(1.0)',
                transition: 'transform 0.15s ease',
              }}
            >
              <span style={{ fontSize: '20px' }}>💰</span>
              <span
                style={{
                  fontSize: '18px',
                  fontWeight: 800,
                  color: '#facc15',
                }}
              >
                {snapshot.playerGold}
              </span>
            </div>

            {/* Kỷ nguyên & Nút Lên Kỷ Nguyên */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  background: snapshot.playerAge === 6 ? 'rgba(6, 78, 59, 0.6)' : 'rgba(30, 58, 138, 0.6)',
                  color: snapshot.playerAge === 6 ? '#34d399' : '#93c5fd',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  border: 'none',
                }}
              >
                {playerAgeConfig.name}
              </span>

              {!isGuestRole && nextAgeConfig && (
                <button
                  type="button"
                  onClick={handleAgeUpMySide}
                  disabled={!canAgeUp}
                  style={{
                    background: canAgeUp
                      ? 'linear-gradient(135deg, #eab308, #ca8a04)'
                      : 'rgba(255, 255, 255, 0.08)',
                    color: canAgeUp ? '#000000' : '#64748b',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    fontSize: '11px',
                    fontWeight: 800,
                    cursor: canAgeUp ? 'pointer' : 'not-allowed',
                  }}
                >
                  {canAgeUp ? '⭐ LÊN KỶ NGUYÊN!' : `Cần ${nextAgeConfig.xpRequired} XP`}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* KHỐI GIỮA: ĐỒNG HỒ, NÚT CÀI ĐẶT DUY NHẤT, ÂM THANH & MINIMAP MỎNG (ẨN CHẾ ĐỘ KHI TRONG TRẬN) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
          <div
            style={{
              pointerEvents: 'auto',
              background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.62) 0%, rgba(15, 23, 42, 0.34) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.16)',
              borderRadius: '18px',
              padding: '5px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 4px 14px rgba(0,0,0,0.32)',
              backdropFilter: 'blur(6px)',
            }}
          >
            <span style={{ fontWeight: 800, fontSize: '16px', color: '#f8fafc', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
              ⏱️ {formatTime(snapshot.matchTime)}
            </span>

            {snapshot.gameMode === 'ONLINE_2P' && netState === 'CONNECTED' && (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#34d399',
                  background: 'rgba(16, 185, 129, 0.2)',
                  padding: '2px 6px',
                  borderRadius: '6px',
                }}
              >
                🌐 {netPing}ms
              </span>
            )}

            {/* Nút bật/tắt âm thanh & nhạc nền */}
            <button
              type="button"
              onClick={onToggleMute}
              title={isMuted ? 'Bật âm thanh & nhạc nền' : 'Tắt âm thanh & nhạc nền'}
              style={{
                background: isMuted ? 'rgba(255,255,255,0.12)' : 'rgba(34, 197, 94, 0.28)',
                color: '#fff',
                border: 'none',
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}
            >
              {isMuted ? '🔇' : '🎵'}
            </button>

            {/* Nút Cài Đặt DUY NHẤT khi đang trong trận đấu */}
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                title="Mở Cài Đặt Trận Đấu"
                style={{
                  background: 'rgba(56, 189, 248, 0.22)',
                  color: '#e0f2fe',
                  border: '1px solid rgba(56, 189, 248, 0.4)',
                  borderRadius: '10px',
                  padding: '4px 10px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease',
                }}
              >
                ⚙️ Cài Đặt
              </button>
            )}
          </div>

          {/* ==================================================== */}
          {/* MINIMAP MỎNG HIỂN THỊ CĂN CỨ, TIỀN TUYẾN & VỊ TRÍ CAMERA */}
          {/* ==================================================== */}
          <div
            style={{
              pointerEvents: 'auto',
              width: '360px',
              height: '14px',
              background: 'rgba(15, 23, 42, 0.65)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '7px',
              position: 'relative',
              overflow: 'hidden',
              cursor: 'pointer',
              userSelect: 'none',
            }}
            title="Minimap: Click hoặc kéo chuột để di chuyển camera"
            onMouseDown={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const updateCam = (ev: MouseEvent) => {
                const clickX = Math.max(0, Math.min(rect.width, ev.clientX - rect.left));
                const ratio = clickX / rect.width;
                const targetWorldX = ratio * snapshot.laneWidth - 640;
                (window as any).__renderer?.jumpCamera(targetWorldX);
              };
              updateCam(e.nativeEvent);
              const onMouseMove = (ev: MouseEvent) => updateCam(ev);
              const onMouseUp = () => {
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
              };
              window.addEventListener('mousemove', onMouseMove);
              window.addEventListener('mouseup', onMouseUp);
            }}
          >
            {/* Căn cứ Bạn (Xanh Neon) */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: `${(220 / snapshot.laneWidth) * 100}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #38bdf8, #0284c7)',
                borderRight: '1px solid #7dd3fc',
              }}
            />

            {/* Căn cứ Bot (Đỏ Neon) */}
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: 0,
                width: `${(220 / snapshot.laneWidth) * 100}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #dc2626, #ef4444)',
                borderLeft: '1px solid #f87171',
              }}
            />

            {/* Tiền tuyến (Frontline marker phát sáng nhấp nháy) */}
            <div
              style={{
                position: 'absolute',
                left: `${(snapshot.frontlineX / snapshot.laneWidth) * 100}%`,
                top: 0,
                width: '3px',
                height: '100%',
                background: '#facc15',
                boxShadow: '0 0 8px #facc15, 0 0 14px #eab308',
                transform: 'translateX(-50%)',
                zIndex: 5,
              }}
            />

            {/* Khung nhìn Camera Viewport (Cyan Frame) */}
            <div
              style={{
                position: 'absolute',
                left: `${(snapshot.cameraX / snapshot.laneWidth) * 100}%`,
                top: 0,
                width: `${(1280 / snapshot.laneWidth) * 100}%`,
                height: '100%',
                background: 'rgba(56, 189, 248, 0.20)',
                border: '1.5px solid #38bdf8',
                boxSizing: 'border-box',
                borderRadius: '3px',
                zIndex: 6,
                pointerEvents: 'none',
                boxShadow: '0 0 6px rgba(56, 189, 248, 0.6)',
              }}
            />
          </div>
        </div>

        {/* KHỐI PHẢI: ĐỐI THỦ (BOT AI) + MENU PHÂN CẤP GÓC TRÊN PHẢI */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          {/* 1. THẺ CĂN CỨ ĐỐI THỦ (GỘP TRONG NỀN MAP MỞ RỘNG) */}
          <div
            style={{
              pointerEvents: 'auto',
              background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.56) 0%, rgba(15, 23, 42, 0.28) 100%)',
              border: '1px solid rgba(248, 113, 113, 0.32)',
              borderRadius: '14px',
              padding: '8px 14px',
              boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
              minWidth: '290px',
              backdropFilter: 'blur(6px)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>
                {snapshot.botUnitCount}/30 lính
              </span>
              <span style={{ fontWeight: 800, fontSize: '15px', color: '#ef4444' }}>
                {snapshot.gameMode === 'LOCAL_2P'
                  ? '⚔️ NGƯỜI CHƠI 2 (P2)'
                  : snapshot.gameMode === 'ONLINE_2P'
                  ? netRole === 'HOST'
                    ? '⚔️ ĐỐI THỦ (P2 ONLINE)'
                    : '🛡️ BẠN (P2 GUEST)'
                  : '⚔️ ĐỐI THỦ (BOT)'}
              </span>
            </div>

            {snapshot.gameMode !== 'SOLO' && (
              <div style={{ display: 'flex', gap: '10px', marginBottom: '6px', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#facc15' }}>
                  💰 {snapshot.rightGold} Vàng
                </span>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#a855f7' }}>
                  ✨ {snapshot.rightXp} XP
                </span>
              </div>
            )}

            {/* MÁU CĂN CỨ BOT CAO 28PX */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: '24px',
                background: 'rgba(0, 0, 0, 0.5)',
                borderRadius: '6px',
                overflow: 'hidden',
                border: 'none',
              }}
            >
              <div
                style={{
                  width: `${Math.max(0, (snapshot.botBaseHp / 1000) * 100)}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #dc2626, #ef4444, #f87171)',
                  transition: 'width 0.2s ease',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '13px',
                  fontWeight: 800,
                  color: '#ffffff',
                  textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                }}
              >
                {Math.round(snapshot.botBaseHp)} / 1000 HP
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  background: 'rgba(127, 29, 29, 0.5)',
                  color: '#fca5a5',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  border: 'none',
                }}
              >
                Thời: {botAgeConfig.name}
              </span>
              {isGuestRole && rightNextAgeConfig ? (
                <button
                  type="button"
                  onClick={handleAgeUpMySide}
                  disabled={!canRightAgeUp}
                  style={{
                    background: canRightAgeUp
                      ? 'linear-gradient(135deg, #eab308, #ca8a04)'
                      : 'rgba(255, 255, 255, 0.08)',
                    color: canRightAgeUp ? '#000000' : '#64748b',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    fontSize: '11px',
                    fontWeight: 800,
                    cursor: canRightAgeUp ? 'pointer' : 'not-allowed',
                  }}
                >
                  {canRightAgeUp ? '⭐ LÊN KỶ NGUYÊN!' : `Cần ${rightNextAgeConfig.xpRequired} XP`}
                </button>
              ) : (
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8' }}>
                  Chiêu cuối: {snapshot.botUltiCooldownPercent <= 0 ? '🟢 Sẵn sàng' : `${Math.round(snapshot.botUltiCooldownPercent * 100)}%`}
                </span>
              )}
            </div>
          </div>

          {/* 2. MENU GÓC TRÊN PHẢI: VŨ KHÍ TRÊN THÀNH [T] & LÊN KỶ NGUYÊN [E] */}
          <div
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              gap: '6px',
              background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.58) 0%, rgba(15, 23, 42, 0.32) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              borderRadius: '12px',
              padding: '4px 8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              backdropFilter: 'blur(6px)',
            }}
          >
            {/* Tab Vũ Khí Thành [T] */}
            <button
              type="button"
              onClick={() => setActiveMenuTab(activeMenuTab === 'TURRETS' ? null : 'TURRETS')}
              style={{
                background:
                  activeMenuTab === 'TURRETS'
                    ? 'rgba(15, 118, 110, 0.4)'
                    : canAffordTurretAction
                    ? 'rgba(16, 185, 129, 0.25)'
                    : 'transparent',
                color: canAffordTurretAction || activeMenuTab === 'TURRETS' ? '#6ee7b7' : '#94a3b8',
                border: 'none',
                borderRadius: '8px',
                padding: '6px 10px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Quản lý và nâng cấp vũ khí trên thành phòng thủ (Phím T)"
            >
              <span>🏰 Vũ Khí Thành (Lv {turretCurrentLvl}/3)</span>
              <span style={{ fontSize: '10px', opacity: 0.8, color: '#fef08a' }}>[T]</span>
            </button>

            {/* Tab Evolve (E) - Pulse vàng kim khi đủ XP */}
            <button
              type="button"
              onClick={() => {
                if (myCanAgeUp) {
                  handleAgeUpMySide();
                } else {
                  setActiveMenuTab(activeMenuTab === 'EVOLVE' ? null : 'EVOLVE');
                }
              }}
              style={{
                background: myCanAgeUp
                  ? 'linear-gradient(135deg, #eab308, #ca8a04)'
                  : activeMenuTab === 'EVOLVE'
                  ? 'rgba(59, 130, 246, 0.3)'
                  : 'transparent',
                color: myCanAgeUp ? '#000000' : '#94a3b8',
                border: 'none',
                borderRadius: '8px',
                padding: '6px 10px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Tiến hóa lên kỷ nguyên tiếp theo (Phím E)"
            >
              <span>⭐ Lên Kỷ Nguyên</span>
              <span style={{ fontSize: '10px', opacity: 0.8 }}>[{isGuestRole ? 'O' : 'E'}]</span>
            </button>
          </div>

          {/* 3. DRAWER NỘI DUNG VŨ KHÍ TRÊN THÀNH & TIẾN HÓA */}
          {activeMenuTab && (
            <div
              style={{
                pointerEvents: 'auto',
                background: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '14px',
                padding: '16px',
                width: '400px',
                boxShadow: '0 20px 40px -10px rgba(0,0,0,0.8)',
                zIndex: 85,
                backdropFilter: 'blur(12px)',
                animation: 'fadeInDown 0.2s ease',
              }}
            >
              {/* TAB TURRETS: QUẢN LÝ & NÂNG CẤP VŨ KHÍ TRÊN THÀNH */}
              {activeMenuTab === 'TURRETS' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '20px' }}>🏰</span>
                      <span style={{ fontWeight: 900, fontSize: '16px', color: '#2dd4bf', textTransform: 'uppercase' }}>
                        Vũ Khí Trên Thành {isGuestRole ? '(P2 Guest)' : snapshot.gameMode === 'LOCAL_2P' ? '(P1 Xanh)' : 'Phòng Thủ'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveMenuTab(null)}
                      style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  </div>

                  {/* KHỐI 1: NÂNG CẤP CẤP ĐỘ VŨ KHÍ THÀNH */}
                  <div
                    style={{
                      background: 'rgba(15, 118, 110, 0.25)',
                      border: '1.5px solid #2dd4bf',
                      borderRadius: '12px',
                      padding: '12px',
                      marginBottom: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 900, color: '#f8fafc' }}>
                          ⚡ Cấp Độ Vũ Khí Toàn Thành: Lv {turretCurrentLvl}/3
                        </div>
                        <div style={{ fontSize: '11px', color: '#5eead4', marginTop: '2px' }}>
                          +{turretCurrentLvl * 25}% Sát thương | +{turretCurrentLvl * 10}% Tầm bắn
                        </div>
                      </div>

                      {turretCurrentLvl >= UPGRADE_CONFIG.turret.maxLevel ? (
                        <span style={{ fontSize: '11px', fontWeight: 900, color: '#4ade80' }}>
                          ✅ TỐI ĐA
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            if (handleUpgradeMyTurret()) {
                              setToastMessage(`🏰 Nâng cấp Vũ Khí Thành lên Lv${turretCurrentLvl + 1}!`);
                              setTimeout(() => setToastMessage(null), 2000);
                            }
                          }}
                          disabled={!canAffordTurretUpgrade}
                          style={{
                            background: canAffordTurretUpgrade ? 'linear-gradient(135deg, #0f766e, #0d9488)' : '#334155',
                            color: canAffordTurretUpgrade ? '#ffffff' : '#94a3b8',
                            border: canAffordTurretUpgrade ? '1.5px solid #2dd4bf' : 'none',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: 900,
                            cursor: canAffordTurretUpgrade ? 'pointer' : 'not-allowed',
                            boxShadow: canAffordTurretUpgrade ? '0 0 14px rgba(45, 212, 191, 0.4)' : 'none',
                          }}
                        >
                          Nâng Cấp ({turretUpgradeCost}G)
                        </button>
                      )}
                    </div>
                  </div>

                  {/* KHỐI 2: MỞ THÊM Ô CẮM VŨ KHÍ */}
                  <div
                    style={{
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '12px',
                      padding: '10px 12px',
                      marginBottom: '14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#cbd5e1' }}>
                        Ô Cắm Vũ Khí: <b>{turretSlotsCount}</b> / 3 Ô
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                        {canAddSlot ? `Chi phí mở ô thứ ${turretSlotsCount + 1}: ${nextSlotCost}G` : 'Đã đạt giới hạn tối đa 3 ô'}
                      </div>
                    </div>

                    {canAddSlot && (
                      <button
                        type="button"
                        onClick={handleBuySlot}
                        disabled={!canAffordAddSlot}
                        style={{
                          background: canAffordAddSlot ? 'linear-gradient(135deg, #7e22ce, #9333ea)' : '#334155',
                          color: '#fff',
                          border: canAffordAddSlot ? '1px solid #c084fc' : 'none',
                          borderRadius: '8px',
                          padding: '6px 12px',
                          fontSize: '11px',
                          fontWeight: 900,
                          cursor: canAffordAddSlot ? 'pointer' : 'not-allowed',
                        }}
                      >
                        ➕ Mở Thêm Ô ({nextSlotCost}G)
                      </button>
                    )}
                  </div>

                  {/* KHỐI 3: DANH SÁCH CÁC Ô VŨ KHÍ TRÊN THÀNH */}
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#94a3b8', marginBottom: '8px' }}>
                    🛡️ TRANG BỊ VŨ KHÍ TỪNG Ô:
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {myTurretManager.slots.map((turret, idx) => {
                      const availableTurret = myAgeConfig.turrets[0];
                      const canAfford = availableTurret && myGold >= availableTurret.cost;

                      return (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: '#1e293b',
                            borderRadius: '10px',
                            padding: '10px 12px',
                            border: turret ? '1px solid #0d9488' : '1px dashed #475569',
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: turret ? '#f8fafc' : '#94a3b8' }}>
                              Ô {idx + 1}: {turret ? turret.config.name : 'Chưa gắn vũ khí'}
                            </div>
                            {turret ? (
                              <div style={{ fontSize: '11px', color: '#5eead4' }}>
                                ST: {Math.round(turret.damage)} | Tầm: {Math.round(turret.range)}px
                              </div>
                            ) : (
                              <div style={{ fontSize: '11px', color: '#64748b' }}>
                                Vũ khí Kỷ Nguyên: {availableTurret ? availableTurret.name : 'Không có'}
                              </div>
                            )}
                          </div>

                          {turret ? (
                            <button
                              type="button"
                              onClick={() => handleSellTurret(idx)}
                              style={{
                                background: '#991b1b',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '5px 10px',
                                fontSize: '11px',
                                fontWeight: 800,
                                cursor: 'pointer',
                              }}
                              title="Bán vũ khí để thu hồi 70% vàng"
                            >
                              💰 Bán (+{Math.floor(turret.config.cost * turret.config.sellRefundRate)}G)
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={!canAfford}
                              onClick={() => {
                                if (availableTurret) handleBuildTurret(idx, availableTurret);
                              }}
                              style={{
                                background: canAfford ? '#15803d' : '#334155',
                                color: '#fff',
                                border: canAfford ? '1px solid #4ade80' : 'none',
                                borderRadius: '6px',
                                padding: '5px 10px',
                                fontSize: '11px',
                                fontWeight: 800,
                                cursor: canAfford ? 'pointer' : 'not-allowed',
                              }}
                            >
                              🛠️ Gắn Vũ Khí ({availableTurret?.cost || 0}G)
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB EVOLVE */}
              {activeMenuTab === 'EVOLVE' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontWeight: 900, fontSize: '16px', color: '#facc15' }}>
                      ⭐ TIẾN HÓA KỶ NGUYÊN (PHÍM {isGuestRole ? 'O' : 'E'})
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveMenuTab(null)}
                      style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '16px', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  </div>

                  <div style={{ fontSize: '13px', color: '#e2e8f0', marginBottom: '6px' }}>
                    Kỷ nguyên hiện tại: <b>{myAgeConfig.name}</b>
                  </div>

                  {myNextAgeConfig ? (
                    <div>
                      <div style={{ fontSize: '13px', color: '#38bdf8', marginBottom: '8px' }}>
                        Kỷ nguyên tiếp theo: <b>{myNextAgeConfig.name}</b>
                      </div>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '10px' }}>
                        Tiến độ XP: <b>{myXp}</b> / {myNextAgeConfig.xpRequired} XP
                      </div>

                      {/* Thanh tiến trình XP */}
                      <div
                        style={{
                          width: '100%',
                          height: '10px',
                          background: '#090d16',
                          borderRadius: '5px',
                          overflow: 'hidden',
                          marginBottom: '12px',
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(100, (myXp / myNextAgeConfig.xpRequired) * 100)}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #38bdf8, #facc15)',
                          }}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={handleAgeUpMySide}
                        disabled={!myCanAgeUp}
                        style={{
                          width: '100%',
                          background: myCanAgeUp
                            ? 'linear-gradient(135deg, #eab308, #ca8a04)'
                            : '#334155',
                          color: myCanAgeUp ? '#000000' : '#94a3b8',
                          border: myCanAgeUp ? '2px solid #fef08a' : 'none',
                          borderRadius: '8px',
                          padding: '10px',
                          fontSize: '14px',
                          fontWeight: 900,
                          cursor: myCanAgeUp ? 'pointer' : 'not-allowed',
                          boxShadow: myCanAgeUp ? '0 0 16px rgba(250, 204, 21, 0.7)' : 'none',
                        }}
                      >
                        {myCanAgeUp ? `⭐ BẮT ĐẦU TIẾN HÓA (PHÍM ${isGuestRole ? 'O' : 'E'})` : `Cần thêm ${myNextAgeConfig.xpRequired - myXp} XP`}
                      </button>
                    </div>
                  ) : (
                    <div style={{ color: '#34d399', fontWeight: 800, textAlign: 'center', padding: '8px 0' }}>
                      🌌 Bạn đã đạt kỷ nguyên Tối Thượng (AI Singularity)!
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ==================================================== */}
      {/* 3. BẢNG TOP VIEWER ĐÓNG GÓP (BÊN CẠNH TRÁI) */}
      {/* ==================================================== */}
      {showLeaderboard && (
        <div
          style={{
            position: 'absolute',
            top: '160px',
            left: '24px',
            pointerEvents: 'auto',
            background: 'rgba(15, 23, 42, 0.94)',
            border: '1.5px solid #facc15',
            borderRadius: '16px',
            padding: '14px',
            width: '240px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.7)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '15px', fontWeight: 900, color: '#facc15' }}>👑 TOP GỌI QUÂN LIVE</span>
            <button
              type="button"
              onClick={() => setShowLeaderboard(false)}
              style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '14px', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>🥇 @SuperFan</span>
              <span style={{ color: '#facc15', fontWeight: 800 }}>18 lính</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>🥈 @DragonKnight</span>
              <span style={{ color: '#e2e8f0', fontWeight: 800 }}>12 lính</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>🥉 @AiMaster</span>
              <span style={{ color: '#d97706', fontWeight: 800 }}>9 lính</span>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* 4. THANH HÀNH ĐỘNG ĐÁY MÀN HÌNH (THẺ MUA QUÂN & CHIÊU CUỐI) */}
      {/* ==================================================== */}
      <div
        style={{
          display: 'flex',
          justifyContent: snapshot.gameMode === 'LOCAL_2P' ? 'space-between' : 'center',
          alignItems: 'flex-end',
          gap: '16px',
          width: '100%',
        }}
      >
        {/* 4 THẺ MUA QUÂN & CHIÊU CUỐI — THÍCH ỨNG THEO CHẾ ĐỘ CHƠI (SOLO, LOCAL 2P, ONLINE 2P) */}
        {snapshot.gameMode === 'LOCAL_2P' ? (
          // ==========================================
          // BỐ CỤC 2 NGƯỜI CHƠI CÙNG MÁY (LOCAL 2P)
          // ==========================================
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              width: '100%',
              gap: isPortrait ? '8px' : '16px',
              pointerEvents: 'auto',
            }}
          >
            {/* CỤM ĐIỀU KHIỂN P1 (PHE XANH) */}
            <div
              style={{
                flex: 1,
                background: 'rgba(15, 23, 42, 0.88)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: '14px',
                padding: '8px 12px',
                boxShadow: '0 8px 20px -5px rgba(0,0,0,0.5)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontWeight: 800, fontSize: '12px', color: '#60a5fa' }}>🛡️ P1 (PHE XANH) — 💰 {snapshot.playerGold}G</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => world.ageUpPlayer()}
                    disabled={!canAgeUp}
                    style={{
                      background: canAgeUp ? '#d97706' : 'rgba(255, 255, 255, 0.06)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '2px 8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: canAgeUp ? 'pointer' : 'not-allowed',
                    }}
                  >
                    [E] Tiến Hóa
                  </button>
                  <button
                    type="button"
                    onClick={() => world.triggerUltimate('LEFT')}
                    disabled={!ultiReady}
                    style={{
                      background: ultiReady ? '#ea580c' : 'rgba(255, 255, 255, 0.06)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '2px 8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: ultiReady ? 'pointer' : 'not-allowed',
                    }}
                  >
                    [SPACE] Ulti
                  </button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                {playerAgeConfig.units.map((unit, idx) => {
                  const canAfford = snapshot.playerGold >= unit.cost;
                  const unitTypeIcons: Record<string, string> = { MELEE: '⚔️', RANGED: '🏹', TANK: '🛡️', SPECIAL: '✨' };
                  const portraitSrc = `/assets/units/age${snapshot.playerAge}_unit_${unit.type.toLowerCase()}.png`;
                  return (
                    <button
                      key={unit.id}
                      type="button"
                      onClick={() => world.spawnPlayerUnit(unit)}
                      disabled={!canAfford}
                      title={`${unit.name} (${unit.cost}G)`}
                      style={{
                        height: isPortrait ? '74px' : '86px',
                        background: canAfford ? 'rgba(30, 41, 59, 0.78)' : 'rgba(15, 23, 42, 0.45)',
                        border: canAfford ? '1px solid rgba(56, 189, 248, 0.45)' : '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: '10px',
                        padding: '4px',
                        color: canAfford ? '#fff' : '#64748b',
                        cursor: canAfford ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ background: '#38bdf8', color: '#000', borderRadius: '4px', padding: '0 4px', fontSize: '9px', fontWeight: 800 }}>
                        [{idx + 1}]
                      </span>
                      <img
                        src={portraitSrc}
                        alt={unit.name}
                        style={{
                          width: isPortrait ? '32px' : '40px',
                          height: isPortrait ? '32px' : '40px',
                          objectFit: 'contain',
                          filter: canAfford ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.65))' : 'grayscale(1) opacity(0.55)',
                        }}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const sib = e.currentTarget.nextElementSibling as HTMLElement | null;
                          if (sib) sib.style.display = 'inline';
                        }}
                      />
                      <span style={{ display: 'none', fontSize: isPortrait ? '14px' : '16px' }}>{unitTypeIcons[unit.type] || '⚔️'}</span>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: canAfford ? '#facc15' : '#ef4444' }}>
                        {unit.cost}G
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* CỤM ĐIỀU KHIỂN P2 (PHE ĐỎ) */}
            <div
              style={{
                flex: 1,
                position: 'relative',
                background: 'rgba(15, 23, 42, 0.88)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: '14px',
                padding: '8px 12px',
                boxShadow: '0 8px 20px -5px rgba(0,0,0,0.5)',
                backdropFilter: 'blur(8px)',
              }}
            >
              {/* NGĂN KÉO QUẢN LÝ PHÁO THÀNH CHO P2 (LOCAL_2P) */}
              {showP2Turrets && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 8px)',
                    right: 0,
                    width: 'min(390px, 94vw)',
                    background: 'rgba(15, 23, 42, 0.96)',
                    border: '1.5px solid rgba(248, 113, 113, 0.45)',
                    borderRadius: '14px',
                    padding: '14px',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.85)',
                    zIndex: 90,
                    backdropFilter: 'blur(12px)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontWeight: 900, fontSize: '14px', color: '#f87171', textTransform: 'uppercase' }}>
                      🏰 Pháo Thành P2 (Lv {rightTurretLvl}/3)
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowP2Turrets(false)}
                      style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '16px', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                    <button
                      type="button"
                      disabled={!canAffordRightTurretUpgrade}
                      onClick={() => world.upgradeRightTurret()}
                      style={{
                        flex: 1,
                        background: canAffordRightTurretUpgrade ? 'linear-gradient(135deg, #b91c1c, #dc2626)' : '#334155',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '6px 8px',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: canAffordRightTurretUpgrade ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {rightTurretLvl >= UPGRADE_CONFIG.turret.maxLevel
                        ? '⚡ TỐI ĐA LV3'
                        : `[U] Nâng Pháo (${rightTurretUpgradeCost}G)`}
                    </button>

                    {canAddRightSlot && (
                      <button
                        type="button"
                        disabled={!canAffordAddRightSlot}
                        onClick={() => world.addRightTurretSlot()}
                        style={{
                          flex: 1,
                          background: canAffordAddRightSlot ? 'linear-gradient(135deg, #7e22ce, #9333ea)' : '#334155',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '6px 8px',
                          fontSize: '11px',
                          fontWeight: 800,
                          cursor: canAffordAddRightSlot ? 'pointer' : 'not-allowed',
                        }}
                      >
                        ➕ Mở Ô {rightTurretSlotsCount + 1} ({rightNextSlotCost}G)
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {world.botTurrets.slots.map((turret, idx) => {
                      const availableTurret = botAgeConfig.turrets[0];
                      const canAfford = availableTurret && snapshot.rightGold >= availableTurret.cost;
                      return (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: '#1e293b',
                            borderRadius: '8px',
                            padding: '7px 10px',
                            border: turret ? '1px solid #ef4444' : '1px dashed #475569',
                          }}
                        >
                          <div style={{ fontSize: '12px', fontWeight: 800, color: turret ? '#f8fafc' : '#94a3b8' }}>
                            Ô {idx + 1}: {turret ? turret.config.name : 'Trống'}
                          </div>
                          {turret ? (
                            <button
                              type="button"
                              onClick={() => world.sellRightTurret(idx)}
                              style={{
                                background: '#991b1b',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '4px 8px',
                                fontSize: '11px',
                                fontWeight: 800,
                                cursor: 'pointer',
                              }}
                            >
                              💰 Bán (+{Math.floor(turret.config.cost * turret.config.sellRefundRate)}G)
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={!canAfford}
                              onClick={() => {
                                if (availableTurret) world.buildRightTurret(idx, availableTurret);
                              }}
                              style={{
                                background: canAfford ? '#15803d' : '#334155',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '4px 8px',
                                fontSize: '11px',
                                fontWeight: 800,
                                cursor: canAfford ? 'pointer' : 'not-allowed',
                              }}
                            >
                              🛠️ Gắn ({availableTurret?.cost || 0}G)
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '4px' }}>
                <span style={{ fontWeight: 800, fontSize: '12px', color: '#f87171' }}>⚔️ P2 (PHE ĐỎ) — 💰 {snapshot.rightGold}G</span>
                <div style={{ display: 'flex', gap: '5px' }}>
                  <button
                    type="button"
                    onClick={() => setShowP2Turrets((prev) => !prev)}
                    style={{
                      background:
                        showP2Turrets || canAffordRightTurretUpgrade || canAffordAddRightSlot
                          ? 'rgba(239, 68, 68, 0.28)'
                          : 'rgba(255, 255, 255, 0.08)',
                      color: '#fca5a5',
                      border: '1px solid rgba(248, 113, 113, 0.35)',
                      borderRadius: '6px',
                      padding: '2px 7px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                    title="Quản lý Pháo Thành P2 (Phím I mở ngăn pháo, Phím U nâng cấp nhanh)"
                  >
                    [I] 🏰 Pháo Thành (Lv {rightTurretLvl})
                  </button>
                  <button
                    type="button"
                    onClick={() => world.ageUpRight()}
                    disabled={!canRightAgeUp}
                    style={{
                      background: canRightAgeUp ? '#d97706' : 'rgba(255, 255, 255, 0.06)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '2px 8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: canRightAgeUp ? 'pointer' : 'not-allowed',
                    }}
                  >
                    [O] Tiến Hóa
                  </button>
                  <button
                    type="button"
                    onClick={() => world.triggerUltimate('RIGHT')}
                    disabled={!rightUltiReady}
                    style={{
                      background: rightUltiReady ? '#ea580c' : 'rgba(255, 255, 255, 0.06)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '2px 8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: rightUltiReady ? 'pointer' : 'not-allowed',
                    }}
                  >
                    [ENTER] Ulti
                  </button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                {botAgeConfig.units.map((unit, idx) => {
                  const canAfford = snapshot.rightGold >= unit.cost;
                  const p2Hotkeys = ['J', 'K', 'L', ';'];
                  const unitTypeIcons: Record<string, string> = { MELEE: '⚔️', RANGED: '🏹', TANK: '🛡️', SPECIAL: '✨' };
                  const portraitSrc = `/assets/units/age${snapshot.botAge}_unit_${unit.type.toLowerCase()}.png`;
                  return (
                    <button
                      key={unit.id}
                      type="button"
                      onClick={() => world.spawnRightUnit(unit)}
                      disabled={!canAfford}
                      title={`${unit.name} (${unit.cost}G)`}
                      style={{
                        height: isPortrait ? '74px' : '86px',
                        background: canAfford ? 'rgba(30, 41, 59, 0.78)' : 'rgba(15, 23, 42, 0.45)',
                        border: canAfford ? '1px solid rgba(239, 68, 68, 0.45)' : '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: '10px',
                        padding: '4px',
                        color: canAfford ? '#fff' : '#64748b',
                        cursor: canAfford ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ background: '#ef4444', color: '#fff', borderRadius: '4px', padding: '0 4px', fontSize: '9px', fontWeight: 800 }}>
                        [{p2Hotkeys[idx]}]
                      </span>
                      <img
                        src={portraitSrc}
                        alt={unit.name}
                        style={{
                          width: isPortrait ? '32px' : '40px',
                          height: isPortrait ? '32px' : '40px',
                          objectFit: 'contain',
                          transform: 'scaleX(-1)',
                          filter: canAfford ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.65))' : 'grayscale(1) opacity(0.55)',
                        }}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const sib = e.currentTarget.nextElementSibling as HTMLElement | null;
                          if (sib) sib.style.display = 'inline';
                        }}
                      />
                      <span style={{ display: 'none', fontSize: isPortrait ? '14px' : '16px' }}>{unitTypeIcons[unit.type] || '⚔️'}</span>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: canAfford ? '#facc15' : '#ef4444' }}>
                        {unit.cost}G
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          // ==========================================
          // BỐ CỤC CHƠI ĐƠN (SOLO) & ONLINE P2P
          // ==========================================
          <>
            <div
              style={{
                pointerEvents: 'auto',
                display: 'flex',
                gap: isPortrait ? '8px' : '10px',
                background: 'rgba(15, 23, 42, 0.85)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '16px',
                padding: isPortrait ? '6px 8px' : '8px 12px',
                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
                backdropFilter: 'blur(10px)',
              }}
            >
              {(snapshot.gameMode === 'ONLINE_2P' && netRole === 'GUEST' ? botAgeConfig : playerAgeConfig).units.map((unit, idx) => {
                const isGuestRole = snapshot.gameMode === 'ONLINE_2P' && netRole === 'GUEST';
                const userGold = isGuestRole ? snapshot.rightGold : snapshot.playerGold;
                const userQueue = isGuestRole ? snapshot.rightQueue : snapshot.playerQueue;
                const hotkey = `${idx + 1}`;
                const canAfford = userGold >= unit.cost;
                const queuedCount = userQueue.filter((q) => q.unitId === unit.id).length;
                const isFirstInQueue = userQueue[0]?.unitId === unit.id;
                const progress = isFirstInQueue ? userQueue[0]!.progress / userQueue[0]!.duration : 0;

                const unitTypeIcons: Record<string, string> = {
                  MELEE: '⚔️',
                  RANGED: '🏹',
                  TANK: '🛡️',
                  SPECIAL: '✨',
                };
                const cardAgeNum = isGuestRole ? snapshot.botAge : snapshot.playerAge;
                const portraitSrc = `/assets/units/age${cardAgeNum}_unit_${unit.type.toLowerCase()}.png`;

                const handleSpawnClick = () => {
                  if (isGuestRole) {
                    if (world.spawnRightUnit(unit)) {
                      networkSync?.sendAction('SPAWN', { unitId: unit.id, unitIndex: idx });
                    }
                  } else {
                    if (world.spawnPlayerUnit(unit)) {
                      if (snapshot.gameMode === 'ONLINE_2P') {
                        networkSync?.sendAction('SPAWN', { unitId: unit.id, unitIndex: idx });
                      }
                    }
                  }
                };

                return (
                  <button
                    key={unit.id}
                    type="button"
                    onClick={handleSpawnClick}
                    disabled={!canAfford}
                    title={`${unit.name} — Sát thương ${unit.damage} | Máu ${unit.hp}`}
                    style={{
                      position: 'relative',
                      width: isPortrait ? '78px' : '118px',
                      height: isPortrait ? '94px' : '112px',
                      background: canAfford
                        ? 'linear-gradient(180deg, rgba(30, 41, 59, 0.82) 0%, rgba(15, 23, 42, 0.88) 100%)'
                        : 'rgba(15, 23, 42, 0.5)',
                      border: canAfford ? '1px solid rgba(56, 189, 248, 0.45)' : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '12px',
                      padding: isPortrait ? '4px' : '6px',
                      color: canAfford ? '#ffffff' : '#64748b',
                      cursor: canAfford ? 'pointer' : 'not-allowed',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      overflow: 'hidden',
                      transition: 'transform 0.12s ease, background 0.15s ease',
                    }}
                  >
                    {isFirstInQueue && (
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          width: `${progress * 100}%`,
                          height: '3px',
                          background: '#38bdf8',
                          transition: 'width 0.1s linear',
                        }}
                      />
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                      <span
                        style={{
                          background: isGuestRole ? 'rgba(239, 68, 68, 0.35)' : 'rgba(56, 189, 248, 0.32)',
                          color: isGuestRole ? '#fca5a5' : '#7dd3fc',
                          borderRadius: '4px',
                          padding: '1px 5px',
                          fontSize: '10px',
                          fontWeight: 800,
                        }}
                      >
                        [{hotkey}]
                      </span>
                      {queuedCount > 0 ? (
                        <span
                          style={{
                            background: '#f59e0b',
                            color: '#000',
                            borderRadius: '8px',
                            padding: '1px 5px',
                            fontSize: '9px',
                            fontWeight: 800,
                          }}
                        >
                          x{queuedCount}
                        </span>
                      ) : (
                        <span style={{ fontSize: '10px', opacity: 0.8 }}>{unitTypeIcons[unit.type] || '⚔️'}</span>
                      )}
                    </div>

                    <div style={{ textAlign: 'center', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <img
                        src={portraitSrc}
                        alt={unit.name}
                        style={{
                          width: isPortrait ? '38px' : '48px',
                          height: isPortrait ? '38px' : '48px',
                          objectFit: 'contain',
                          filter: canAfford
                            ? 'drop-shadow(0 3px 5px rgba(0, 0, 0, 0.75))'
                            : 'grayscale(1) opacity(0.5)',
                        }}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                          if (fallback) fallback.style.display = 'block';
                        }}
                      />
                      <div style={{ display: 'none', fontSize: isPortrait ? '18px' : '22px' }}>
                        {unitTypeIcons[unit.type] || '⚔️'}
                      </div>
                      <div
                        style={{
                          fontSize: isPortrait ? '9.5px' : '11px',
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          width: '100%',
                          marginTop: '2px',
                        }}
                      >
                        {unit.name}
                      </div>
                    </div>

                    <div style={{ textAlign: 'center', width: '100%' }}>
                      {canAfford ? (
                        <span style={{ fontSize: isPortrait ? '11px' : '12px', fontWeight: 800, color: '#facc15' }}>
                          💰 {unit.cost}
                        </span>
                      ) : (
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#f87171' }}>
                          -{unit.cost - userGold}G
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* NÚT ULTIMATE HÌNH TRÒN */}
            <div style={{ textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  const isGuestRole = snapshot.gameMode === 'ONLINE_2P' && netRole === 'GUEST';
                  if (isGuestRole) {
                    if (world.triggerUltimate('RIGHT')) {
                      networkSync?.sendAction('ULTIMATE', {});
                    }
                  } else {
                    if (world.triggerUltimate('LEFT')) {
                      if (snapshot.gameMode === 'ONLINE_2P') networkSync?.sendAction('ULTIMATE', {});
                    }
                  }
                }}
                disabled={snapshot.gameMode === 'ONLINE_2P' && netRole === 'GUEST' ? !rightUltiReady : !ultiReady}
                style={{
                  pointerEvents: 'auto',
                  position: 'relative',
                  width: isPortrait ? '68px' : '88px',
                  height: isPortrait ? '68px' : '88px',
                  borderRadius: '50%',
                  background: (snapshot.gameMode === 'ONLINE_2P' && netRole === 'GUEST' ? rightUltiReady : ultiReady)
                    ? 'linear-gradient(135deg, #ea580c, #c2410c)'
                    : 'rgba(255, 255, 255, 0.04)',
                  border: (snapshot.gameMode === 'ONLINE_2P' && netRole === 'GUEST' ? rightUltiReady : ultiReady)
                    ? '1.5px solid #fde047'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#ffffff',
                  cursor: (snapshot.gameMode === 'ONLINE_2P' && netRole === 'GUEST' ? rightUltiReady : ultiReady)
                    ? 'pointer'
                    : 'not-allowed',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ fontSize: isPortrait ? '22px' : '28px' }}>☄️</span>
                <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.5px' }}>[SPACE]</span>
              </button>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: ultiReady ? '#fef08a' : '#64748b',
                  marginTop: '4px',
                }}
              >
                {(snapshot.gameMode === 'ONLINE_2P' && netRole === 'GUEST' ? botAgeConfig : playerAgeConfig).ultimate.name}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ==================================================== */}
      {/* 5. MODAL KẾT NỐI ONLINE P2P */}
      {/* ==================================================== */}
      {showOnlineModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.78)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(8px)',
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              background: '#0f172a',
              border: '2px solid #059669',
              borderRadius: '20px',
              padding: '24px',
              maxWidth: '480px',
              width: '92%',
              boxShadow: '0 12px 36px rgba(0, 0, 0, 0.8)',
              color: '#fff',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#34d399' }}>
                🌐 CHƠI 2 NGƯỜI QUA MẠNG (ONLINE P2P)
              </h3>
              <button
                type="button"
                onClick={() => setShowOnlineModal(false)}
                style={{
                  background: '#334155',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '50%',
                  width: '28px',
                  height: '28px',
                  cursor: 'pointer',
                  fontWeight: 900,
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                background: netState === 'CONNECTED' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(51, 65, 85, 0.5)',
                border: netState === 'CONNECTED' ? '1px solid #22c55e' : '1px solid #475569',
                borderRadius: '10px',
                padding: '10px 14px',
                marginBottom: '16px',
                fontSize: '13px',
              }}
            >
              <div>
                <strong>Trạng thái: </strong>
                {netState === 'CONNECTED' && (
                  <span style={{ color: '#4ade80' }}>
                    🟢 Đã kết nối ({netPing}ms) — {netRole === 'HOST' ? 'Bạn là HOST (Phe Xanh)' : 'Bạn là GUEST (Phe Đỏ)'}
                  </span>
                )}
                {netState === 'HOSTING' && (
                  <span style={{ color: '#facc15' }}>
                    ⏳ Đang chờ người chơi 2 gia nhập mã: <strong>{networkSync?.roomId}</strong>
                  </span>
                )}
                {netState === 'CONNECTING' && (
                  <span style={{ color: '#38bdf8' }}>
                    🔄 Đang kết nối vào phòng {networkSync?.roomId}...
                  </span>
                )}
                {netState === 'DISCONNECTED' && (
                  <span style={{ color: '#94a3b8' }}>Chưa kết nối. Chọn tạo phòng hoặc nhập mã bên dưới.</span>
                )}
              </div>
            </div>

            {/* Lựa chọn 1: Làm Host tạo phòng */}
            <div style={{ marginBottom: '16px', padding: '12px', background: '#1e293b', borderRadius: '12px' }}>
              <div style={{ fontSize: '14px', fontWeight: 800, marginBottom: '6px', color: '#60a5fa' }}>
                1. Tạo phòng mới (Bạn là Phe Trái / Xanh)
              </div>
              <button
                type="button"
                onClick={() => {
                  if (networkSync) {
                    const code = networkSync.hostRoom();
                    setToastMessage(`Đã tạo phòng: ${code}`);
                  }
                }}
                style={{
                  width: '100%',
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px',
                  fontWeight: 800,
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                🚀 Tạo Phòng & Lấy Mã Đấu
              </button>
              {networkSync?.roomId && (
                <div style={{ marginTop: '8px', textAlign: 'center', fontSize: '13px' }}>
                  Mã phòng của bạn: <strong style={{ color: '#facc15', fontSize: '16px', letterSpacing: '1px' }}>{networkSync.roomId}</strong>
                </div>
              )}
            </div>

            {/* Lựa chọn 2: Nhập mã phòng để đấu */}
            <div style={{ padding: '12px', background: '#1e293b', borderRadius: '12px' }}>
              <div style={{ fontSize: '14px', fontWeight: 800, marginBottom: '6px', color: '#f87171' }}>
                2. Vào phòng có sẵn (Bạn là Phe Phải / Đỏ)
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Ví dụ: SING-1234"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  style={{
                    flex: 1,
                    background: '#0f172a',
                    border: '1px solid #475569',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#fff',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (joinCodeInput.trim() && networkSync) {
                      networkSync.joinRoom(joinCodeInput.trim());
                      setToastMessage(`Đang vào phòng ${joinCodeInput}...`);
                    }
                  }}
                  style={{
                    background: '#dc2626',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  👉 Vào Phòng
                </button>
              </div>
            </div>

            <div style={{ marginTop: '16px', textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => setShowOnlineModal(false)}
                style={{
                  background: '#475569',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 20px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ==================================================== */}
      {/* 6. MÀN HÌNH KẾT THÚC TRẬN ĐẤU (CHIẾN THẮNG / THẤT BẠI) */}
      {/* ==================================================== */}
      {(snapshot.status === 'VICTORY' || snapshot.status === 'DEFEAT') && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(3, 7, 18, 0.78)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1200,
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.96)',
              border: snapshot.status === 'VICTORY' ? '2px solid #facc15' : '2px solid #ef4444',
              borderRadius: '24px',
              padding: '28px 36px',
              maxWidth: '420px',
              width: '90%',
              textAlign: 'center',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.85)',
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '8px' }}>
              {snapshot.status === 'VICTORY' ? '🏆' : '💥'}
            </div>
            <h2
              style={{
                margin: '0 0 8px 0',
                fontSize: '30px',
                fontWeight: 900,
                color: snapshot.status === 'VICTORY' ? '#facc15' : '#f87171',
                letterSpacing: '1px',
              }}
            >
              {snapshot.status === 'VICTORY' ? 'CHIẾN THẮNG!' : 'THẤT BẠI!'}
            </h2>
            <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#cbd5e1' }}>
              Thời gian trận đấu: <b>{formatTime(snapshot.matchTime)}</b> • Kỷ nguyên đạt được: <b>{playerAgeConfig.name}</b>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                type="button"
                onClick={() => {
                  const mode = world.gameMode;
                  const diff = world.botAI.difficulty;
                  world.reset();
                  world.setGameMode(mode);
                  world.setBotDifficulty(diff);
                }}
                style={{
                  background: 'linear-gradient(135deg, #eab308, #ca8a04)',
                  color: '#000',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '12px',
                  fontSize: '15px',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                🔄 Chơi Ván Mới
              </button>
              {onReturnToMainMenu && (
                <button
                  type="button"
                  onClick={onReturnToMainMenu}
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    color: '#e2e8f0',
                    border: '1px solid rgba(255,255,255,0.16)',
                    borderRadius: '12px',
                    padding: '10px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  🏠 Về Màn Hình Chính
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
