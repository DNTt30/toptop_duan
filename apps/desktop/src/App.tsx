import type {
  AppSetting,
  DemoTriggerGiftResult,
  ManagerStateSnapshot,
  StorageHealthReport,
} from '@buddhalive/shared';
import React, { useEffect, useState } from 'react';
import { CharacterTab, type CharacterItem } from './components/CharacterTab';
import { AnimationTab } from './components/AnimationTab';
import { GiftRuleTab } from './components/GiftRuleTab';
import { LiveConnectionTab } from './components/LiveConnectionTab';
import { SettingsTab } from './components/SettingsTab';

export type ManagerTabId = 'DASHBOARD' | 'CHARACTERS' | 'ANIMATIONS' | 'RULES' | 'LIVE_CONNECTION' | 'SETTINGS';

interface DesktopBridge {
  getStorageHealth: () => Promise<StorageHealthReport>;
  updateFpsLimit: (fps: 30 | 60) => Promise<AppSetting>;
  reportVerificationComplete: (payload: {
    rendererIsolationOk: boolean;
    health: StorageHealthReport;
    updatedFpsJson?: string;
    demoExecutionOk?: boolean;
  }) => Promise<void>;
  isAutomatedVerifyMode: () => boolean;

  getServerInfo?: () => Promise<{ overlayUrl: string; port: number }>;
  getManagerState?: () => Promise<ManagerStateSnapshot>;
  triggerDemoGift?: (params: {
    senderName: string;
    giftCount?: number;
    externalEventId?: string | null;
  }) => Promise<DemoTriggerGiftResult>;
  approveOverlayPair?: (params: {
    pairingId: string;
    code: string;
  }) => Promise<{ ok: boolean }>;
  revokeOverlaySessions?: () => Promise<{ ok: boolean; count: number }>;
  onManagerStateUpdate?: (
    callback: (snapshot: ManagerStateSnapshot) => void
  ) => () => void;

  listCharacters?: () => Promise<CharacterItem[]>;
  createCharacter?: (params: any) => Promise<CharacterItem>;
  updateCharacter?: (id: string, data: any) => Promise<CharacterItem | null>;
  setActiveCharacter?: (id: string) => Promise<CharacterItem | null>;
  deleteCharacter?: (id: string) => Promise<{ ok: boolean; error?: string }>;

  // S5 Bridge methods
  queueControl?: (params: { action: 'PAUSE' | 'RESUME' | 'SKIP' | 'CLEAR'; reason?: string }) => Promise<any>;
  runDemoScenario?: (scenario: string) => Promise<any>;
  stopDemoScenario?: () => Promise<any>;
  getQueueMetrics?: () => Promise<any>;

  // S6 Bridge methods
  createBackup?: (params?: { scope?: 'DATABASE_ONLY' | 'FULL_DATA_BUNDLE' }) => Promise<any>;
  pickAndRestoreBackup?: () => Promise<any>;
  getDiagnostics?: () => Promise<any>;
  exportDiagnostics?: () => Promise<any>;

  // S9 Bridge methods: Live Provider (T-30 & T-31)
  getLiveConfig?: () => Promise<any>;
  saveLiveConfig?: (config: any) => Promise<{ ok: boolean; config?: any; error?: string }>;
  saveLiveApiKey?: (payload: { provider: 'EULERSTREAM'; apiKey: string }) => Promise<{ ok: boolean; error?: string }>;
  clearLiveApiKey?: (provider: 'EULERSTREAM') => Promise<{ ok: boolean }>;
  getLiveConnectionSummary?: () => Promise<any>;
  connectLive?: () => Promise<{ ok: boolean; state: string; error?: string; message?: string }>;
  disconnectLive?: () => Promise<{ ok: boolean; state: string; message?: string }>;
}

declare global {
  interface Window {
    buddhaDesktop: DesktopBridge;
  }
}

export function App(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<ManagerTabId>('DASHBOARD');
  const [health, setHealth] = useState<StorageHealthReport | null>(null);
  const [managerState, setManagerState] = useState<ManagerStateSnapshot | null>(null);
  const [characters, setCharacters] = useState<CharacterItem[]>([]);
  const [fpsValue, setFpsValue] = useState<string>('60');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Demo Gift Form State
  const [senderName, setSenderName] = useState<string>('Minh Anh');
  const [giftCount, setGiftCount] = useState<number>(1);
  const [demoStatusMsg, setDemoStatusMsg] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);

  const refreshCharacters = async () => {
    try {
      if (window.buddhaDesktop.listCharacters) {
        const list = await window.buddhaDesktop.listCharacters();
        setCharacters(list || []);
      }
    } catch (err: any) {
      console.error('Failed to load characters:', err);
    }
  };

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        const winAny = window as unknown as Record<string, unknown>;
        const rendererIsolationOk =
          typeof winAny.process === 'undefined' &&
          typeof winAny.require === 'undefined';

        const report = await window.buddhaDesktop.getStorageHealth();
        if (!active) return;
        setHealth(report);

        if (window.buddhaDesktop.getManagerState) {
          const state = await window.buddhaDesktop.getManagerState();
          if (active) setManagerState(state);
        }

        await refreshCharacters();

        // Đăng ký nhận snapshot real-time từ Backend
        let unsubscribe: (() => void) | undefined;
        if (window.buddhaDesktop.onManagerStateUpdate) {
          unsubscribe = window.buddhaDesktop.onManagerStateUpdate((snap) => {
            if (active) setManagerState(snap);
          });
        }

        // Tự động quét cập nhật trạng thái kết nối & yêu cầu ghép nối mỗi 2 giây
        const statePollInterval = setInterval(async () => {
          if (!active) return;
          try {
            if (window.buddhaDesktop.getManagerState) {
              const snap = await window.buddhaDesktop.getManagerState();
              if (active) setManagerState(snap);
            }
          } catch {
            // Bỏ qua lỗi polling ngầm
          }
        }, 2000);

        // Tự động kiểm thử nếu chạy trong test mode
        if (window.buddhaDesktop.isAutomatedVerifyMode()) {
          const updated = await window.buddhaDesktop.updateFpsLimit(30);
          if (!active) return;
          setFpsValue(updated.valueJson);

          let demoOk = false;
          if (window.buddhaDesktop.triggerDemoGift) {
            const demoRes = await window.buddhaDesktop.triggerDemoGift({
              senderName: 'Minh Anh',
              giftCount: 1,
            });
            demoOk = demoRes.processStatus === 'MATCHED';
          }

          await window.buddhaDesktop.reportVerificationComplete({
            rendererIsolationOk,
            health: report,
            updatedFpsJson: updated.valueJson,
            demoExecutionOk: demoOk,
          });
        }

        return () => {
          clearInterval(statePollInterval);
          unsubscribe?.();
        };
      } catch (err: unknown) {
        if (!active) return;
        setErrorMsg(err instanceof Error ? err.message : String(err));
      }
    };

    void bootstrap();
    return () => {
      active = false;
    };
  }, []);

  const handleSendDemoGift = async () => {
    if (!window.buddhaDesktop.triggerDemoGift) return;
    try {
      setDemoStatusMsg('Đang gửi quà demo...');
      const res = await window.buddhaDesktop.triggerDemoGift({
        senderName,
        giftCount,
      });
      setDemoStatusMsg(
        res.duplicate
          ? 'Sự kiện bị từ chối do trùng lặp (SQLite UNIQUE)'
          : `Đã gửi thành công! Execution ID: ${res.executionId?.slice(0, 8)}...`
      );
      if (window.buddhaDesktop.getManagerState) {
        const refreshed = await window.buddhaDesktop.getManagerState();
        setManagerState(refreshed);
      }
    } catch (err: any) {
      setDemoStatusMsg(`Lỗi gửi: ${err?.message || String(err)}`);
    }
  };

  const handleApprovePair = async (pairingId: string, code: string) => {
    if (!window.buddhaDesktop.approveOverlayPair) return;
    try {
      await window.buddhaDesktop.approveOverlayPair({ pairingId, code });
      if (window.buddhaDesktop.getManagerState) {
        const refreshed = await window.buddhaDesktop.getManagerState();
        setManagerState(refreshed);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || String(err));
    }
  };

  const handleRevokeSessions = async () => {
    if (!window.buddhaDesktop.revokeOverlaySessions) return;
    try {
      const res = await window.buddhaDesktop.revokeOverlaySessions();
      setDemoStatusMsg(`Đã thu hồi ${res.count} phiên OBS Overlay`);
      if (window.buddhaDesktop.getManagerState) {
        const refreshed = await window.buddhaDesktop.getManagerState();
        setManagerState(refreshed);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || String(err));
    }
  };

  const handleCopyOverlayUrl = () => {
    const url = managerState?.overlayUrl || 'http://127.0.0.1:3721/overlay';
    void navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleToggleFps = async (target: 30 | 60) => {
    try {
      const updated = await window.buddhaDesktop.updateFpsLimit(target);
      setFpsValue(updated.valueJson);
      const refreshed = await window.buddhaDesktop.getStorageHealth();
      setHealth(refreshed);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  // S5 Handlers: Queue Control & Demo Scenarios
  const handleQueueControl = async (action: 'PAUSE' | 'RESUME' | 'SKIP' | 'CLEAR') => {
    if (action === 'CLEAR') {
      if (!confirm('Bạn có chắc chắn muốn hủy toàn bộ các lượt đang xếp hàng QUEUED? (Lượt đang diễn vẫn chạy bình thường)')) {
        return;
      }
    }
    if (!window.buddhaDesktop.queueControl) return;
    try {
      setDemoStatusMsg(`Đang thực hiện lệnh ${action}...`);
      const res = await window.buddhaDesktop.queueControl({
        action,
        reason: `Lệnh ${action} từ giao diện điều hành`,
      });
      setDemoStatusMsg(res.message || `Lệnh ${action} thực hiện thành công`);
      if (window.buddhaDesktop.getManagerState) {
        const refreshed = await window.buddhaDesktop.getManagerState();
        setManagerState(refreshed);
      }
    } catch (err: any) {
      setErrorMsg(`Lỗi ${action}: ${err?.message || String(err)}`);
    }
  };

  const handleRunScenario = async (scenario: string) => {
    if (!window.buddhaDesktop.runDemoScenario) return;
    try {
      setDemoStatusMsg(`Đang khởi động kịch bản ${scenario}...`);
      const res = await window.buddhaDesktop.runDemoScenario(scenario);
      setDemoStatusMsg(res?.description || `Đã bắt đầu kịch bản ${scenario}`);
      if (window.buddhaDesktop.getManagerState) {
        const refreshed = await window.buddhaDesktop.getManagerState();
        setManagerState(refreshed);
      }
    } catch (err: any) {
      setErrorMsg(`Lỗi kịch bản: ${err?.message || String(err)}`);
    }
  };

  const handleStopScenario = async () => {
    if (!window.buddhaDesktop.stopDemoScenario) return;
    try {
      await window.buddhaDesktop.stopDemoScenario();
      setDemoStatusMsg('Đã dừng kịch bản mô phỏng');
      if (window.buddhaDesktop.getManagerState) {
        const refreshed = await window.buddhaDesktop.getManagerState();
        setManagerState(refreshed);
      }
    } catch (err: any) {
      setErrorMsg(`Lỗi dừng kịch bản: ${err?.message || String(err)}`);
    }
  };

  const overlayUrl = managerState?.overlayUrl || 'http://127.0.0.1:3721/overlay';

  return (
    <main style={{ maxWidth: 1040, margin: '20px auto', padding: '0 24px', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, margin: '0 0 6px 0', color: '#f8fafc' }}>
            🌸 BuddhaLive Studio — Desktop Manager
          </h1>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>
            Hệ thống Livestream Tương tác Windows 11 · Giai đoạn S5: Bàn Điều Khiển Queue Monitor & Ranh Giới TikTok Adapter
          </div>
        </div>
        <div style={{ textAlign: 'right', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span
            data-testid="badge-engine-status"
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: 20,
              background: managerState?.isPaused ? '#7c2d12' : managerState?.activeExecution ? '#1e3a8a' : '#065f46',
              color: managerState?.isPaused ? '#fdba74' : managerState?.activeExecution ? '#93c5fd' : '#34d399',
            }}
          >
            ● Engine: {managerState?.engineStatus || (managerState?.isPaused ? 'PAUSED' : 'IDLE')}
          </span>
          <span
            data-testid="badge-tiktok-status"
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: 20,
              background: '#334155',
              color: '#94a3b8',
            }}
          >
            ● TikTok: {managerState?.tiktokAdapterStatus || 'DISCONNECTED'}
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: 20,
              background: '#065f46',
              color: '#34d399',
            }}
          >
            ● Backend ONLINE
          </span>
        </div>
      </header>

      {/* Navigation Tabs Bar */}
      <nav
        style={{
          display: 'flex',
          gap: 6,
          background: '#1e293b',
          padding: 6,
          borderRadius: 8,
          marginBottom: 20,
          border: '1px solid #334155',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('DASHBOARD')}
          data-testid="tab-dashboard"
          style={{
            flex: 1,
            padding: '8px 12px',
            border: 'none',
            borderRadius: 6,
            background: activeTab === 'DASHBOARD' ? '#2563eb' : 'transparent',
            color: activeTab === 'DASHBOARD' ? '#fff' : '#94a3b8',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          📊 Tổng quan & Demo
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('CHARACTERS');
            void refreshCharacters();
          }}
          data-testid="tab-characters"
          style={{
            flex: 1,
            padding: '8px 12px',
            border: 'none',
            borderRadius: 6,
            background: activeTab === 'CHARACTERS' ? '#2563eb' : 'transparent',
            color: activeTab === 'CHARACTERS' ? '#fff' : '#94a3b8',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          🎭 Nhân vật 3D ({characters.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('ANIMATIONS');
            void refreshCharacters();
          }}
          data-testid="tab-animations"
          style={{
            flex: 1,
            padding: '8px 12px',
            border: 'none',
            borderRadius: 6,
            background: activeTab === 'ANIMATIONS' ? '#2563eb' : 'transparent',
            color: activeTab === 'ANIMATIONS' ? '#fff' : '#94a3b8',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          🎬 Hoạt ảnh (Animations)
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('RULES');
            void refreshCharacters();
          }}
          data-testid="tab-rules"
          style={{
            flex: 1,
            padding: '8px 12px',
            border: 'none',
            borderRadius: 6,
            background: activeTab === 'RULES' ? '#2563eb' : 'transparent',
            color: activeTab === 'RULES' ? '#fff' : '#94a3b8',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          🎁 Quy tắc quà (Gift Rules)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('LIVE_CONNECTION')}
          data-testid="tab-live-connection"
          style={{
            flex: 1,
            padding: '8px 12px',
            border: 'none',
            borderRadius: 6,
            background: activeTab === 'LIVE_CONNECTION' ? '#2563eb' : 'transparent',
            color: activeTab === 'LIVE_CONNECTION' ? '#fff' : '#94a3b8',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          📡 Kết Nối LIVE
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('SETTINGS')}
          data-testid="tab-settings"
          style={{
            flex: 1,
            padding: '8px 12px',
            border: 'none',
            borderRadius: 6,
            background: activeTab === 'SETTINGS' ? '#2563eb' : 'transparent',
            color: activeTab === 'SETTINGS' ? '#fff' : '#94a3b8',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          ⚙ Cài đặt & Bảo mật
        </button>
      </nav>

      {errorMsg && (
        <div
          data-testid="s1-error"
          style={{ background: '#7f1d1d', color: '#fecaca', padding: 12, borderRadius: 8, marginBottom: 16 }}
        >
          {errorMsg}
        </div>
      )}

      {/* Tab 1: DASHBOARD */}
      {activeTab === 'DASHBOARD' && (
        <div>
          {/* OBS Overlay URL & Pairing Bar */}
          <section
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 12,
              padding: '16px 20px',
              marginBottom: 20,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>
                  Đường dẫn nhúng OBS Browser Source (URL sạch, không token):
                </div>
                <code style={{ fontSize: 15, color: '#38bdf8', fontWeight: 600 }}>{overlayUrl}</code>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={handleCopyOverlayUrl}
                  data-testid="btn-copy-url"
                  style={{
                    background: copiedUrl ? '#16a34a' : '#2563eb',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  {copiedUrl ? '✓ Đã sao chép' : 'Sao chép URL OBS'}
                </button>
                <button
                  type="button"
                  onClick={handleRevokeSessions}
                  style={{
                    background: '#475569',
                    color: '#f8fafc',
                    border: 'none',
                    padding: '8px 14px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  Thu hồi phiên OBS ({managerState?.pairedOverlaySessions ?? 0})
                </button>
              </div>
            </div>

            {/* Pairing Requests Warning */}
            {managerState && managerState.pendingPairRequests.length > 0 && (
              <div
                data-testid="pending-pair-box"
                style={{
                  marginTop: 16,
                  background: '#451a03',
                  border: '1px solid #f59e0b',
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                <div style={{ fontWeight: 600, color: '#fef08a', marginBottom: 8 }}>
                  🔔 Có yêu cầu ghép nối mới từ OBS Studio:
                </div>
                {managerState.pendingPairRequests.map((req) => (
                  <div
                    key={req.pairingId}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
                  >
                    <div>
                      Mã xác nhận: <strong style={{ fontSize: 18, color: '#fff' }}>{req.code}</strong>
                    </div>
                    <button
                      type="button"
                      data-testid="btn-approve-pair"
                      onClick={() => handleApprovePair(req.pairingId, req.code)}
                      style={{
                        background: '#16a34a',
                        color: '#fff',
                        border: 'none',
                        padding: '6px 14px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      ✓ Cho phép kết nối
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* S5: Queue Monitor & Control Panel (T-14) */}
          <section
            data-testid="queue-monitor-panel"
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 12,
              padding: 20,
              marginBottom: 20,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 17, margin: '0 0 4px 0', color: '#f8fafc' }}>
                  📊 Bàn Giám Sát & Điều Khiển Hàng Đợi (Queue Monitor)
                </h2>
                <div style={{ fontSize: 13, color: '#94a3b8' }}>
                  Theo dõi thời gian thực qua Socket.IO: Số lượng lượt chờ, đang diễn, hoàn tất, lỗi và trạng thái Engine
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: '#94a3b8' }}>Trạng thái Engine:</span>
                <span
                  data-testid="engine-status"
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    padding: '4px 12px',
                    borderRadius: 6,
                    background: managerState?.isPaused ? '#831843' : managerState?.activeExecution ? '#1e3a8a' : '#065f46',
                    color: managerState?.isPaused ? '#fbcfe8' : managerState?.activeExecution ? '#bfdbfe' : '#34d399',
                  }}
                >
                  {managerState?.engineStatus || (managerState?.isPaused ? 'PAUSED' : 'IDLE')}
                </span>
              </div>
            </div>

            {/* 4 Metric Badges */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
              <div
                style={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  padding: '12px 16px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>ĐANG CHỜ (QUEUED)</div>
                <div data-testid="metric-queued" style={{ fontSize: 24, fontWeight: 700, color: '#38bdf8' }}>
                  {managerState?.queueMetrics?.queued ?? managerState?.queuedCount ?? 0}
                </div>
              </div>
              <div
                style={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  padding: '12px 16px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>ĐANG DIỄN (PLAYING)</div>
                <div data-testid="metric-playing" style={{ fontSize: 24, fontWeight: 700, color: '#a855f7' }}>
                  {managerState?.queueMetrics?.playing ?? (managerState?.activeExecution ? 1 : 0)}
                </div>
              </div>
              <div
                style={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  padding: '12px 16px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>HOÀN TẤT (COMPLETED)</div>
                <div data-testid="metric-completed" style={{ fontSize: 24, fontWeight: 700, color: '#4ade80' }}>
                  {managerState?.queueMetrics?.completed ?? 0}
                </div>
              </div>
              <div
                style={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  padding: '12px 16px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>LỖI / HỦY (FAILED/CANCEL)</div>
                <div data-testid="metric-failed" style={{ fontSize: 24, fontWeight: 700, color: '#f87171' }}>
                  {managerState?.queueMetrics?.failed ?? 0}
                </div>
              </div>
            </div>

            {/* 4 Control Buttons (PAUSE, RESUME, SKIP, CLEAR) */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                data-testid="btn-queue-pause"
                onClick={() => handleQueueControl('PAUSE')}
                disabled={Boolean(managerState?.isPaused)}
                style={{
                  flex: 1,
                  background: managerState?.isPaused ? '#334155' : '#d97706',
                  color: managerState?.isPaused ? '#64748b' : '#fff',
                  border: 'none',
                  padding: '10px 16px',
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: managerState?.isPaused ? 'not-allowed' : 'pointer',
                  opacity: managerState?.isPaused ? 0.6 : 1,
                }}
              >
                ⏸ TẠM DỪNG (PAUSE)
              </button>
              <button
                type="button"
                data-testid="btn-queue-resume"
                onClick={() => handleQueueControl('RESUME')}
                disabled={!managerState?.isPaused}
                style={{
                  flex: 1,
                  background: !managerState?.isPaused ? '#334155' : '#16a34a',
                  color: !managerState?.isPaused ? '#64748b' : '#fff',
                  border: 'none',
                  padding: '10px 16px',
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: !managerState?.isPaused ? 'not-allowed' : 'pointer',
                  opacity: !managerState?.isPaused ? 0.6 : 1,
                }}
              >
                ▶ TIẾP TỤC (RESUME)
              </button>
              <button
                type="button"
                data-testid="btn-queue-skip"
                onClick={() => handleQueueControl('SKIP')}
                disabled={!managerState?.activeExecution}
                style={{
                  flex: 1,
                  background: !managerState?.activeExecution ? '#334155' : '#e11d48',
                  color: !managerState?.activeExecution ? '#64748b' : '#fff',
                  border: 'none',
                  padding: '10px 16px',
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: !managerState?.activeExecution ? 'not-allowed' : 'pointer',
                  opacity: !managerState?.activeExecution ? 0.6 : 1,
                }}
              >
                ⏭ BỎ QUA LƯỢT HIỆN TẠI (SKIP)
              </button>
              <button
                type="button"
                data-testid="btn-queue-clear"
                onClick={() => handleQueueControl('CLEAR')}
                disabled={(managerState?.queuedCount ?? 0) === 0}
                style={{
                  flex: 1,
                  background: (managerState?.queuedCount ?? 0) === 0 ? '#334155' : '#475569',
                  color: (managerState?.queuedCount ?? 0) === 0 ? '#64748b' : '#fca5a5',
                  border: 'none',
                  padding: '10px 16px',
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: (managerState?.queuedCount ?? 0) === 0 ? 'not-allowed' : 'pointer',
                  opacity: (managerState?.queuedCount ?? 0) === 0 ? 0.6 : 1,
                }}
              >
                🗑 XÓA HÀNG ĐỢI (CLEAR)
              </button>
            </div>
          </section>

          {/* S5: Demo Multi-Scenario Simulator Panel (T-15) */}
          <section
            data-testid="demo-scenarios-panel"
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 12,
              padding: 20,
              marginBottom: 20,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h2 style={{ fontSize: 17, margin: '0 0 4px 0', color: '#f8fafc' }}>
                  🎯 Kịch Bản Mô Phỏng Thực Chiến (Demo Scenarios)
                </h2>
                <div style={{ fontSize: 13, color: '#94a3b8' }}>
                  Kiểm thử tự động tải hàng đợi, gộp combo, chen hàng VIP và xử lý tràn hàng đợi
                </div>
              </div>
              <button
                type="button"
                data-testid="btn-stop-scenario"
                onClick={handleStopScenario}
                style={{
                  background: '#334155',
                  color: '#f87171',
                  border: '1px solid #475569',
                  padding: '6px 14px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ⏹ Dừng Kịch Bản
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <button
                type="button"
                data-testid="btn-scenario-single-burst"
                onClick={() => handleRunScenario('SINGLE_BURST')}
                style={{
                  background: '#0f172a',
                  border: '1px solid #3b82f6',
                  color: '#93c5fd',
                  padding: '10px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 14, marginBottom: 4 }}>⚡ Gộp Combo</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>1 Người gửi 5 quà dồn (1200ms)</div>
              </button>

              <button
                type="button"
                data-testid="btn-scenario-concurrent"
                onClick={() => handleRunScenario('CONCURRENT_SENDERS')}
                style={{
                  background: '#0f172a',
                  border: '1px solid #10b981',
                  color: '#6ee7b7',
                  padding: '10px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 14, marginBottom: 4 }}>👥 Đồng Thời</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>5 Người gửi cùng lúc (FIFO)</div>
              </button>

              <button
                type="button"
                data-testid="btn-scenario-vip"
                onClick={() => handleRunScenario('VIP_INTERRUPT')}
                style={{
                  background: '#0f172a',
                  border: '1px solid #f59e0b',
                  color: '#fcd34d',
                  padding: '10px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 14, marginBottom: 4 }}>👑 VIP Chen Ngang</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>Quà VIP chen trước quà thường</div>
              </button>

              <button
                type="button"
                data-testid="btn-scenario-overload"
                onClick={() => handleRunScenario('QUEUE_OVERLOAD')}
                style={{
                  background: '#0f172a',
                  border: '1px solid #ef4444',
                  color: '#fca5a5',
                  padding: '10px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 14, marginBottom: 4 }}>💥 Quá Tải 35 Lượt</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>Kiểm tra trần 30 & Eviction</div>
              </button>
            </div>
          </section>

          {/* Main Grid: Demo Control & Live Execution */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            {/* Card 1: Gửi Quà Demo */}
            <section
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 12,
                padding: 20,
              }}
            >
              <h2 style={{ fontSize: 17, margin: '0 0 14px 0', color: '#f8fafc' }}>
                🎁 Gửi Quà Tặng Demo (Thực nghiệm)
              </h2>
              <div style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 16 }}>
                Nhân vật: <strong>{managerState?.sampleCharacter?.name || 'Tiểu Sa Di'}</strong> | Quà: <strong>Hoa Sen (10 xu)</strong>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>
                  Tên người tặng:
                </label>
                <input
                  type="text"
                  data-testid="input-sender-name"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '8px 12px',
                    borderRadius: 6,
                    background: '#0f172a',
                    border: '1px solid #475569',
                    color: '#fff',
                    fontSize: 14,
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>
                  Số lượng quà:
                </label>
                <input
                  type="number"
                  data-testid="input-gift-count"
                  min={1}
                  max={99}
                  value={giftCount}
                  onChange={(e) => setGiftCount(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '8px 12px',
                    borderRadius: 6,
                    background: '#0f172a',
                    border: '1px solid #475569',
                    color: '#fff',
                    fontSize: 14,
                  }}
                />
              </div>

              <button
                type="button"
                data-testid="btn-demo-gift"
                onClick={handleSendDemoGift}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: '#000',
                  fontWeight: 700,
                  fontSize: 15,
                  border: 'none',
                  padding: '12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
                }}
              >
                🚀 Bấm Gửi Quà Demo
              </button>

              {demoStatusMsg && (
                <div data-testid="demo-status-msg" style={{ fontSize: 13, color: '#38bdf8', marginTop: 12 }}>
                  {demoStatusMsg}
                </div>
              )}
            </section>

            {/* Card 2: Trạng thái Thực thi Trực tiếp (Live Execution) */}
            <section
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 12,
                padding: 20,
              }}
            >
              <h2 style={{ fontSize: 17, margin: '0 0 14px 0', color: '#f8fafc' }}>
                ⚡ Trạng thái Điều Phối Trực Tiếp
              </h2>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>Lượt đang hiển thị:</div>
                {managerState?.activeExecution ? (
                  <div
                    data-testid="active-execution-badge"
                    style={{
                      background: '#0f172a',
                      border: '1px solid #3b82f6',
                      borderRadius: 8,
                      padding: 10,
                      marginTop: 6,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: '#fff' }}>
                        {managerState.activeExecution.caption}
                      </span>
                      <span
                        style={{
                          background: '#1d4ed8',
                          color: '#fff',
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 10,
                        }}
                      >
                        {managerState.activeExecution.status}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: '#64748b', fontSize: 13, marginTop: 6 }}>
                    Không có lượt nào đang diễn (Standby)
                  </div>
                )}
              </div>

              <div style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 10 }}>
                Hàng đợi đang chờ: <strong>{managerState?.queuedCount ?? 0}</strong> lượt
              </div>

              <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 6 }}>Lịch sử gần đây:</div>
              <div style={{ maxHeight: 120, overflowY: 'auto' }}>
                {managerState?.recentExecutions && managerState.recentExecutions.length > 0 ? (
                  managerState.recentExecutions.map((e) => (
                    <div
                      key={e.id}
                      style={{
                        fontSize: 12,
                        padding: '4px 0',
                        borderBottom: '1px solid #334155',
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ color: '#cbd5e1' }}>{e.caption}</span>
                      <span
                        style={{
                          fontWeight: 600,
                          color:
                            e.status === 'COMPLETED'
                              ? '#4ade80'
                              : e.status === 'COMPLETED_WITH_FALLBACK'
                                ? '#fbbf24'
                                : '#94a3b8',
                        }}
                      >
                        {e.status}
                      </span>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 12, color: '#64748b' }}>Chưa có sự kiện nào</div>
                )}
              </div>
            </section>
          </div>

          {/* S1 Health Card */}
          {health && (
            <section
              data-testid="s1-health-card"
              data-storage-ok={String(health.ok)}
              style={{
                background: '#1e293b',
                padding: 16,
                borderRadius: 10,
                border: '1px solid #334155',
                fontSize: 13,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong>Cấu hình Hệ thống & Bộ nhớ SQLite WAL:</strong>
                <span style={{ color: health.ok ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                  {health.ok ? '✓ SẴN SÀNG (OK)' : 'LỖI'}
                </span>
              </div>
              <div style={{ color: '#94a3b8', fontSize: 12 }}>
                DB: <code>{health.dbFilePath}</code> | Journal: <code>{health.journalMode}</code> | ForeignKeys: <code>{String(health.foreignKeysEnabled)}</code> | Migrations: <code>{health.appliedMigrations.length}</code>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  data-testid="btn-fps-30"
                  onClick={() => void handleToggleFps(30)}
                  style={{ padding: '4px 12px', cursor: 'pointer', background: '#334155', color: '#fff', border: 'none', borderRadius: 4 }}
                >
                  Set 30 FPS
                </button>
                <button
                  type="button"
                  data-testid="btn-fps-60"
                  onClick={() => void handleToggleFps(60)}
                  style={{ padding: '4px 12px', cursor: 'pointer', background: '#334155', color: '#fff', border: 'none', borderRadius: 4 }}
                >
                  Set 60 FPS
                </button>
                <span style={{ fontSize: 12, color: '#cbd5e1', alignSelf: 'center' }}>
                  Hiện tại: {fpsValue} FPS
                </span>
              </div>
            </section>
          )}
        </div>
      )}

      {/* Tab 2: CHARACTERS */}
      {activeTab === 'CHARACTERS' && (
        <CharacterTab characters={characters} onRefresh={refreshCharacters} />
      )}

      {/* Tab 3: ANIMATIONS */}
      {activeTab === 'ANIMATIONS' && (
        <AnimationTab characters={characters} />
      )}

      {/* Tab 4: GIFT RULES */}
      {activeTab === 'RULES' && (
        <GiftRuleTab characters={characters} />
      )}

      {/* Tab 5: LIVE CONNECTION (T-30) */}
      {activeTab === 'LIVE_CONNECTION' && (
        <LiveConnectionTab />
      )}

      {/* Tab 6: SETTINGS */}
      {activeTab === 'SETTINGS' && (
        <SettingsTab
          health={health}
          fpsValue={fpsValue}
          onFpsChange={handleToggleFps}
          pairedOverlaySessions={managerState?.pairedOverlaySessions ?? 0}
          onRevokeSessions={handleRevokeSessions}
        />
      )}
    </main>
  );
}
