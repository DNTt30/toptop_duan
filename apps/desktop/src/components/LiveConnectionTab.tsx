import React, { useEffect, useState } from 'react';
import type {
  LiveConnectionHistoryItem,
  LiveConnectionState,
  LiveConnectionSummary,
  LiveDiagnosticsReport,
  LiveEventTrace,
  LiveProviderConfig,
  LiveSupportedProvider,
} from '@buddhalive/shared';
import {
  EulerStreamConfigSchema,
  LiveProviderApiKeyPayloadSchema,
  TikFinityConfigSchema,
} from '@buddhalive/shared';

interface LiveConnectionTabProps {
  onRefreshGlobalState?: () => Promise<void>;
}

export function LiveConnectionTab({ onRefreshGlobalState }: LiveConnectionTabProps): React.ReactElement {
  // Provider Selection: TikFinity (mặc định) hoặc EulerStream
  const [selectedProvider, setSelectedProvider] = useState<LiveSupportedProvider>('TIKFINITY');

  // Form states - TikFinity
  const [tikfinityUrl, setTikfinityUrl] = useState<string>('ws://127.0.0.1:21213');
  const [tikfinityStreamer, setTikfinityStreamer] = useState<string>('');
  const [tikfinityAutoConnect, setTikfinityAutoConnect] = useState<boolean>(false);

  // Form states - EulerStream
  const [eulerUrl, setEulerUrl] = useState<string>('wss://ws.eulerstream.com');
  const [eulerStreamer, setEulerStreamer] = useState<string>('');
  const [eulerAutoConnect, setEulerAutoConnect] = useState<boolean>(false);
  const [eulerApiKey, setEulerApiKey] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [isEditingApiKey, setIsEditingApiKey] = useState<boolean>(false);

  // Status & Feedback
  const [connectionSummary, setConnectionSummary] = useState<LiveConnectionSummary | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // T33-A / T33-C: Diagnostics & Observability states
  const [diagnostics, setDiagnostics] = useState<LiveDiagnosticsReport | null>(null);
  const [eventTraces, setEventTraces] = useState<LiveEventTrace[]>([]);
  const [exportedReport, setExportedReport] = useState<string | null>(null);
  const [isExportCopied, setIsExportCopied] = useState<boolean>(false);

  const loadDiagnostics = async () => {
    try {
      const bridge = (window as any).buddhaDesktop;
      if (!bridge) return;
      if (bridge.getLiveDiagnostics) {
        const diag: LiveDiagnosticsReport = await bridge.getLiveDiagnostics();
        setDiagnostics(diag);
      }
      if (bridge.getLiveTraces) {
        const traces: LiveEventTrace[] = await bridge.getLiveTraces();
        setEventTraces(traces || []);
      }
    } catch {
      // ignore
    }
  };

  const handleExportDiagnostics = async (format: 'markdown' | 'json' = 'markdown') => {
    try {
      const bridge = (window as any).buddhaDesktop;
      if (!bridge || !bridge.exportLiveDiagnostics) return;
      const report: string = await bridge.exportLiveDiagnostics(format);
      setExportedReport(report);
      setIsExportCopied(false);
      setFeedback({
        type: 'success',
        text: `Đã xuất báo cáo chẩn đoán dạng ${format.toUpperCase()} thành công (100% bí mật được khử khuẩn).`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: `Lỗi xuất báo cáo: ${err.message || String(err)}` });
    }
  };

  // Load config & summary from Backend on mount
  const loadSavedConfig = async () => {
    try {
      setIsLoading(true);
      const bridge = (window as any).buddhaDesktop;
      if (!bridge) return;

      if (bridge.getLiveConnectionSummary) {
        const summary: LiveConnectionSummary = await bridge.getLiveConnectionSummary();
        setConnectionSummary(summary);
      }

      if (bridge.getLiveConfig) {
        const config: LiveProviderConfig | null = await bridge.getLiveConfig();
        if (config) {
          setSelectedProvider(config.provider);
          if (config.provider === 'TIKFINITY') {
            setTikfinityUrl(config.endpointUrl || 'ws://127.0.0.1:21213');
            setTikfinityStreamer(config.streamerUsername || '');
            setTikfinityAutoConnect(Boolean(config.autoConnectOnStart));
          } else if (config.provider === 'EULERSTREAM') {
            setEulerUrl(config.endpointUrl || 'wss://ws.eulerstream.com');
            setEulerStreamer(config.streamerUsername || '');
            setEulerAutoConnect(Boolean(config.autoConnectOnStart));
            setIsEditingApiKey(!config.hasApiKey);
          }
        } else {
          // Chưa có config, mặc định cho phép nhập API Key nếu chọn EulerStream
          setIsEditingApiKey(true);
        }
      }

      await loadDiagnostics();
    } catch (err: any) {
      setFeedback({ type: 'error', text: `Lỗi tải cấu hình kết nối: ${err.message || String(err)}` });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSavedConfig();
  }, []);

  // Xử lý lưu cấu hình TikFinity
  const handleSaveTikFinity = async () => {
    setFeedback(null);
    try {
      // Validate schema
      const rawConfig = {
        provider: 'TIKFINITY',
        endpointUrl: tikfinityUrl.trim(),
        streamerUsername: tikfinityStreamer.trim(),
        autoConnectOnStart: tikfinityAutoConnect,
        hasApiKey: false,
      };

      const validated = TikFinityConfigSchema.safeParse(rawConfig);
      if (!validated.success) {
        const firstErr = validated.error.issues[0]?.message || 'Cấu hình TikFinity không hợp lệ';
        setFeedback({ type: 'error', text: firstErr });
        return;
      }

      const bridge = (window as any).buddhaDesktop;
      if (bridge?.saveLiveConfig) {
        const res = await bridge.saveLiveConfig(validated.data);
        if (!res.ok) {
          setFeedback({ type: 'error', text: res.error || 'Lỗi khi lưu cấu hình TikFinity' });
          return;
        }
      }

      setFeedback({ type: 'success', text: '✓ Đã lưu cấu hình TikFinity thành công! Sẵn sàng kết nối qua cổng 21213.' });
      await loadSavedConfig();
      if (onRefreshGlobalState) void onRefreshGlobalState();
    } catch (err: any) {
      setFeedback({ type: 'error', text: `Lỗi hệ thống: ${err.message || String(err)}` });
    }
  };

  // Xử lý lưu cấu hình EulerStream (bao gồm API Key an toàn)
  const handleSaveEulerStream = async () => {
    setFeedback(null);
    try {
      const trimmedStreamer = eulerStreamer.trim();
      const trimmedUrl = eulerUrl.trim();
      const hasKeyCurrently = connectionSummary?.hasApiKey || false;

      // 1. Kiểm tra API Key nếu đang ở chế độ chỉnh sửa hoặc chưa có key
      if (isEditingApiKey || !hasKeyCurrently) {
        const trimmedKey = eulerApiKey.trim();
        const keyValidated = LiveProviderApiKeyPayloadSchema.safeParse({
          provider: 'EULERSTREAM',
          apiKey: trimmedKey,
        });

        if (!keyValidated.success) {
          const firstErr = keyValidated.error.issues[0]?.message || 'API Key EulerStream không hợp lệ (tối thiểu 8 ký tự)';
          setFeedback({ type: 'error', text: firstErr });
          return;
        }

        const bridge = (window as any).buddhaDesktop;
        if (bridge?.saveLiveApiKey) {
          const keyRes = await bridge.saveLiveApiKey(keyValidated.data);
          if (!keyRes.ok) {
            setFeedback({ type: 'error', text: keyRes.error || 'Lỗi mã hóa API Key qua DPAPI' });
            return;
          }
        }
        // Xóa sạch biến tạm trong state React sau khi đã gửi tới Backend
        setEulerApiKey('');
        setIsEditingApiKey(false);
      }

      // 2. Validate EulerStream Config
      const rawConfig = {
        provider: 'EULERSTREAM',
        endpointUrl: trimmedUrl,
        streamerUsername: trimmedStreamer,
        autoConnectOnStart: eulerAutoConnect,
        hasApiKey: true,
      };

      const validated = EulerStreamConfigSchema.safeParse(rawConfig);
      if (!validated.success) {
        const firstErr = validated.error.issues[0]?.message || 'Cấu hình EulerStream không hợp lệ';
        setFeedback({ type: 'error', text: firstErr });
        return;
      }

      const bridge = (window as any).buddhaDesktop;
      if (bridge?.saveLiveConfig) {
        const res = await bridge.saveLiveConfig(validated.data);
        if (!res.ok) {
          setFeedback({ type: 'error', text: res.error || 'Lỗi khi lưu cấu hình EulerStream' });
          return;
        }
      }

      setFeedback({ type: 'success', text: '✓ Đã lưu cấu hình EulerStream và mã hóa API Key bằng Windows DPAPI an toàn!' });
      await loadSavedConfig();
      if (onRefreshGlobalState) void onRefreshGlobalState();
    } catch (err: any) {
      setFeedback({ type: 'error', text: `Lỗi hệ thống: ${err.message || String(err)}` });
    }
  };

  // Xóa API Key EulerStream
  const handleClearApiKey = async () => {
    if (!confirm('Bạn có chắc chắn muốn xóa API Key EulerStream đã lưu? Bạn sẽ cần nhập lại khóa để kết nối.')) {
      return;
    }
    try {
      const bridge = (window as any).buddhaDesktop;
      if (bridge?.clearLiveApiKey) {
        await bridge.clearLiveApiKey('EULERSTREAM');
      }
      setIsEditingApiKey(true);
      setEulerApiKey('');
      setFeedback({ type: 'info', text: 'Đã xóa API Key EulerStream khỏi kho lưu trữ bảo mật.' });
      await loadSavedConfig();
    } catch (err: any) {
      setFeedback({ type: 'error', text: `Lỗi xóa API Key: ${err.message || String(err)}` });
    }
  };

  // Khởi động kết nối LIVE thực tế qua Backend (T-31)
  const handleConnectLive = async () => {
    setFeedback(null);
    setIsLoading(true);
    try {
      const bridge = (window as any).buddhaDesktop;
      if (bridge?.connectLive) {
        const res = await bridge.connectLive();
        if (!res.ok) {
          setFeedback({ type: 'error', text: res.error || 'Lỗi khi khởi động kết nối LIVE' });
        } else {
          setFeedback({ type: 'success', text: `✓ Bắt đầu kết nối tới Live Provider...` });
        }
      }
      await loadSavedConfig();
      if (onRefreshGlobalState) void onRefreshGlobalState();
    } catch (err: any) {
      setFeedback({ type: 'error', text: `Lỗi kết nối: ${err.message || String(err)}` });
    } finally {
      setIsLoading(false);
    }
  };

  // Ngắt kết nối LIVE chủ động (T-31)
  const handleDisconnectLive = async () => {
    setFeedback(null);
    setIsLoading(true);
    try {
      const bridge = (window as any).buddhaDesktop;
      if (bridge?.disconnectLive) {
        await bridge.disconnectLive();
        setFeedback({ type: 'info', text: 'Đã ngắt kết nối phiên LIVE thành công.' });
      }
      await loadSavedConfig();
      if (onRefreshGlobalState) void onRefreshGlobalState();
    } catch (err: any) {
      setFeedback({ type: 'error', text: `Lỗi ngắt kết nối: ${err.message || String(err)}` });
    } finally {
      setIsLoading(false);
    }
  };

  // Helper hiển thị nhãn trạng thái kết nối
  const getStateBadge = (state?: LiveConnectionState) => {
    switch (state) {
      case 'RECEIVING_EVENTS':
        return { text: '● ĐANG NHẬN SỰ KIỆN LIVE', bg: '#064e3b', color: '#34d399', border: '#059669' };
      case 'CONNECTED':
        return { text: '● ĐÃ KẾT NỐI SOCKET', bg: '#065f46', color: '#6ee7b7', border: '#10b981' };
      case 'CONNECTING':
        return { text: '◌ ĐANG BẮT TAY KẾT NỐI...', bg: '#713f12', color: '#fde047', border: '#eab308' };
      case 'RECONNECTING':
        return { text: '◌ ĐANG KẾT NỐI LẠI (BACKOFF)...', bg: '#7c2d12', color: '#fdba74', border: '#f97316' };
      case 'CONFIGURED':
        return { text: '✓ ĐÃ LƯU CẤU HÌNH (SẴN SÀNG)', bg: '#0c4a6e', color: '#7dd3fc', border: '#0284c7' };
      case 'ERROR':
        return { text: '✕ LỖI KẾT NỐI', bg: '#7f1d1d', color: '#fca5a5', border: '#ef4444' };
      case 'DISCONNECTED':
      default:
        return { text: '○ CHƯA KẾT NỐI (DISCONNECTED)', bg: '#1e293b', color: '#94a3b8', border: '#475569' };
    }
  };

  const currentBadge = getStateBadge(connectionSummary?.state);

  return (
    <div style={{ color: '#f8fafc' }} data-testid="live-connection-container">
      {/* Tab Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px 0', color: '#f8fafc' }}>
          📡 Cài đặt & Quản lý Kết nối Livestream (TikTok LIVE)
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>
          Cấu hình Provider trung gian để tiếp nhận quà tặng và tương tác realtime.
          Không dùng thư viện reverse engineering; bảo đảm an toàn tài khoản và hiệu năng hệ thống.
        </p>
      </div>

      {/* Trạng thái Kết nối Thực tế từ Backend (Connection Monitor) */}
      <div
        data-testid="live-connection-status-card"
        style={{
          background: '#0f172a',
          border: `1px solid ${currentBadge.border}`,
          borderRadius: 8,
          padding: 16,
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>Trạng thái Kết nối từ Backend:</span>
            <span
              data-testid="badge-live-connection-state"
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: '4px 12px',
                borderRadius: 20,
                background: currentBadge.bg,
                color: currentBadge.color,
                border: `1px solid ${currentBadge.border}`,
              }}
            >
              {currentBadge.text}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {['CONNECTING', 'CONNECTED', 'RECEIVING_EVENTS', 'RECONNECTING'].includes(connectionSummary?.state || '') ? (
              <button
                type="button"
                data-testid="btn-disconnect-live"
                onClick={() => void handleDisconnectLive()}
                disabled={isLoading}
                style={{
                  background: '#7f1d1d',
                  color: '#fca5a5',
                  border: '1px solid #ef4444',
                  padding: '5px 14px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ⏹ Ngắt Kết Nối
              </button>
            ) : (
              <button
                type="button"
                data-testid="btn-connect-live"
                onClick={() => void handleConnectLive()}
                disabled={isLoading || connectionSummary?.state === 'DISCONNECTED'}
                style={{
                  background: connectionSummary?.state === 'DISCONNECTED' ? '#334155' : '#15803d',
                  color: connectionSummary?.state === 'DISCONNECTED' ? '#94a3b8' : '#fff',
                  border: 'none',
                  padding: '5px 14px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: connectionSummary?.state === 'DISCONNECTED' ? 'not-allowed' : 'pointer',
                }}
              >
                ⚡ Kết Nối LIVE
              </button>
            )}
            <button
              type="button"
              data-testid="btn-refresh-live-status"
              onClick={() => void loadSavedConfig()}
              style={{
                background: '#1e293b',
                color: '#cbd5e1',
                border: '1px solid #334155',
                padding: '5px 12px',
                borderRadius: 6,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              ↻ Đồng Bộ
            </button>
          </div>
        </div>

        {['CONNECTING', 'CONNECTED', 'RECEIVING_EVENTS', 'RECONNECTING'].includes(connectionSummary?.state || '') && (
          <div
            data-testid="live-active-guard-banner"
            style={{
              background: '#042f2e',
              border: '1px solid #0d9488',
              borderRadius: 6,
              padding: '6px 10px',
              marginBottom: 12,
              fontSize: 12,
              color: '#5eead4',
            }}
          >
            🔒 <strong>Phiên LIVE Đang Hoạt Động:</strong> Tính năng phát Demo giả được tự động khóa ở Backend để ngăn chặn can thiệp nhầm vào luồng stream thật.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, fontSize: 12 }}>
          <div style={{ background: '#1e293b', padding: 10, borderRadius: 6, border: '1px solid #334155' }}>
            <div style={{ color: '#94a3b8', marginBottom: 4 }}>Provider Được Chọn:</div>
            <strong data-testid="text-active-provider" style={{ color: '#38bdf8', fontSize: 13 }}>
              {connectionSummary?.provider !== 'NONE' ? connectionSummary?.provider : 'Chưa cấu hình'}
            </strong>
          </div>
          <div style={{ background: '#1e293b', padding: 10, borderRadius: 6, border: '1px solid #334155' }}>
            <div style={{ color: '#94a3b8', marginBottom: 4 }}>Điểm Cuối WebSocket:</div>
            <div
              data-testid="text-active-endpoint"
              style={{
                color: '#f8fafc',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontFamily: 'monospace',
              }}
              title={connectionSummary?.endpointUrl || 'Chưa thiết lập'}
            >
              {connectionSummary?.endpointUrl || '(Trống)'}
            </div>
          </div>
          <div style={{ background: '#1e293b', padding: 10, borderRadius: 6, border: '1px solid #334155' }}>
            <div style={{ color: '#94a3b8', marginBottom: 4 }}>Sự Kiện LIVE Đã Nhận:</div>
            <strong data-testid="text-events-count" style={{ color: '#4ade80', fontSize: 13 }}>
              {connectionSummary?.eventsReceived ?? 0} sự kiện
            </strong>
          </div>
          <div style={{ background: '#1e293b', padding: 10, borderRadius: 6, border: '1px solid #334155' }}>
            <div style={{ color: '#94a3b8', marginBottom: 4 }}>Sự Kiện Gần Nhất:</div>
            <div style={{ color: '#cbd5e1', fontSize: 11 }}>
              {connectionSummary?.lastEventAt ? new Date(connectionSummary.lastEventAt).toLocaleTimeString() : 'Chưa có'}
            </div>
          </div>
        </div>

        {connectionSummary?.lastError && (
          <div
            data-testid="live-last-error-banner"
            style={{
              marginTop: 12,
              background: '#450a0a',
              border: '1px solid #b91c1c',
              borderRadius: 6,
              padding: 10,
              fontSize: 12,
              color: '#fca5a5',
            }}
          >
            <strong>✕ Chi tiết lỗi gần nhất:</strong> {connectionSummary.lastError}
          </div>
        )}
      </div>

      {/* Thông báo phản hồi Feedback (Toast / Alert) */}
      {feedback && (
        <div
          data-testid="live-feedback-alert"
          style={{
            background:
              feedback.type === 'success' ? '#064e3b' : feedback.type === 'error' ? '#450a0a' : '#1e293b',
            border:
              feedback.type === 'success' ? '1px solid #059669' : feedback.type === 'error' ? '1px solid #b91c1c' : '1px solid #3b82f6',
            color:
              feedback.type === 'success' ? '#6ee7b7' : feedback.type === 'error' ? '#fca5a5' : '#93c5fd',
            padding: '10px 14px',
            borderRadius: 6,
            marginBottom: 20,
            fontSize: 13,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Provider Selector: Lựa chọn TikFinity hoặc EulerStream */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#cbd5e1', marginBottom: 10 }}>
          1. Chọn Nền Tảng Live Provider:
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Option 1: TikFinity */}
          <div
            data-testid="provider-card-tikfinity"
            onClick={() => setSelectedProvider('TIKFINITY')}
            style={{
              background: selectedProvider === 'TIKFINITY' ? '#1e293b' : '#0f172a',
              border: selectedProvider === 'TIKFINITY' ? '2px solid #2563eb' : '1px solid #334155',
              borderRadius: 8,
              padding: 16,
              cursor: 'pointer',
              position: 'relative',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>💻</span>
                <strong style={{ fontSize: 15, color: '#f8fafc' }}>TikFinity Desktop</strong>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  background: '#065f46',
                  color: '#34d399',
                  padding: '2px 8px',
                  borderRadius: 12,
                }}
              >
                KHUYẾN NGHỊ · LOCAL
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
              Kết nối trực tiếp qua mạng nội bộ loopback (<code>ws://127.0.0.1:21213</code>).
              Không cần API Key, không qua đám mây trung gian, bảo mật tuyệt đối cho streamer.
            </p>
          </div>

          {/* Option 2: EulerStream */}
          <div
            data-testid="provider-card-eulerstream"
            onClick={() => setSelectedProvider('EULERSTREAM')}
            style={{
              background: selectedProvider === 'EULERSTREAM' ? '#1e293b' : '#0f172a',
              border: selectedProvider === 'EULERSTREAM' ? '2px solid #7c3aed' : '1px solid #334155',
              borderRadius: 8,
              padding: 16,
              cursor: 'pointer',
              position: 'relative',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>☁️</span>
                <strong style={{ fontSize: 15, color: '#f8fafc' }}>EulerStream Cloud (BYOK)</strong>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  background: '#4c1d95',
                  color: '#c4b5fd',
                  padding: '2px 8px',
                  borderRadius: 12,
                }}
              >
                ĐÁM MÂY · BYOK
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
              Kết nối tới cụm máy chủ EulerStream (<code>wss://ws.eulerstream.com</code>).
              Yêu cầu nhập API Key cá nhân của bạn; khóa được bảo vệ mã hóa bằng Windows DPAPI.
            </p>
          </div>
        </div>
      </div>

      {/* Form cấu hình riêng theo Provider */}
      <div
        data-testid="live-config-form-section"
        style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: 8,
          padding: 20,
          marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: '#38bdf8', marginBottom: 16 }}>
          2. Cấu hình Chi Tiết: {selectedProvider === 'TIKFINITY' ? 'TikFinity Local WebSocket' : 'EulerStream Cloud Gateway'}
        </div>

        {/* ================= TIKFINITY FORM ================= */}
        {selectedProvider === 'TIKFINITY' && (
          <div data-testid="form-tikfinity">
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#cbd5e1' }}>
                Địa chỉ WebSocket TikFinity (Loopback):
              </label>
              <input
                type="text"
                data-testid="input-tikfinity-endpoint"
                value={tikfinityUrl}
                onChange={(e) => setTikfinityUrl(e.target.value)}
                placeholder="ws://127.0.0.1:21213"
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 6,
                  padding: '8px 12px',
                  color: '#f8fafc',
                  fontFamily: 'monospace',
                  fontSize: 13,
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Bắt buộc phải là địa chỉ nội bộ (<code>127.0.0.1</code> hoặc <code>localhost</code>). Cổng mặc định của TikFinity là 21213.
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#cbd5e1' }}>
                Tên Kênh TikTok (Ghi chú tùy chọn):
              </label>
              <input
                type="text"
                data-testid="input-tikfinity-streamer"
                value={tikfinityStreamer}
                onChange={(e) => setTikfinityStreamer(e.target.value)}
                placeholder="Ví dụ: @kenh_cua_ban (TikFinity tự đồng bộ theo phiên đăng nhập)"
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 6,
                  padding: '8px 12px',
                  color: '#f8fafc',
                  fontSize: 13,
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: '#cbd5e1' }}>
                <input
                  type="checkbox"
                  data-testid="checkbox-tikfinity-autoconnect"
                  checked={tikfinityAutoConnect}
                  onChange={(e) => setTikfinityAutoConnect(e.target.checked)}
                />
                Tự động kết nối tới TikFinity khi khởi động BuddhaLive Studio
              </label>
            </div>

            {/* Hướng dẫn vận hành TikFinity */}
            <div
              style={{
                background: '#0f172a',
                border: '1px solid #059669',
                borderRadius: 6,
                padding: 14,
                marginBottom: 20,
                fontSize: 12,
                lineHeight: 1.6,
                color: '#cbd5e1',
              }}
            >
              <strong style={{ color: '#34d399', display: 'block', marginBottom: 4 }}>
                💡 Hướng dẫn kết nối TikFinity Desktop trong 3 bước:
              </strong>
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                <li>Tải và cài đặt ứng dụng <strong>TikFinity Desktop</strong> từ trang chủ chính thức.</li>
                <li>Đăng nhập tài khoản TikTok của bạn trên TikFinity.</li>
                <li>Vào mục <strong>Settings / WebSockets</strong> trên TikFinity và kích hoạt Server cổng <strong>21213</strong>.</li>
              </ol>
            </div>

            <button
              type="button"
              data-testid="btn-save-tikfinity-config"
              onClick={() => void handleSaveTikFinity()}
              disabled={isLoading}
              style={{
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                padding: '10px 24px',
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              💾 Lưu Cấu Hình TikFinity
            </button>
          </div>
        )}

        {/* ================= EULERSTREAM FORM ================= */}
        {selectedProvider === 'EULERSTREAM' && (
          <div data-testid="form-eulerstream">
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#cbd5e1' }}>
                Điểm Cuối WebSocket EulerStream (Cloud):
              </label>
              <input
                type="text"
                data-testid="input-euler-endpoint"
                value={eulerUrl}
                onChange={(e) => setEulerUrl(e.target.value)}
                placeholder="wss://ws.eulerstream.com"
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 6,
                  padding: '8px 12px',
                  color: '#f8fafc',
                  fontFamily: 'monospace',
                  fontSize: 13,
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#cbd5e1' }}>
                Tên Kênh TikTok LIVE (Streamer Username) <span style={{ color: '#ef4444' }}>*</span>:
              </label>
              <input
                type="text"
                data-testid="input-euler-streamer"
                value={eulerStreamer}
                onChange={(e) => setEulerStreamer(e.target.value)}
                placeholder="Ví dụ: @buddhalive_stream (bắt buộc)"
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 6,
                  padding: '8px 12px',
                  color: '#f8fafc',
                  fontSize: 13,
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Kênh TikTok phải đang trong phiên phát trực tiếp (LIVE) khi EulerStream kết nối.
              </div>
            </div>

            {/* API Key Management with Windows DPAPI */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1' }}>
                  EulerStream API Key (Bring Your Own Key) <span style={{ color: '#ef4444' }}>*</span>:
                </label>
                {connectionSummary?.hasApiKey && !isEditingApiKey && (
                  <span
                    data-testid="badge-api-key-dpapi"
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      background: '#1e3a8a',
                      color: '#93c5fd',
                      padding: '2px 8px',
                      borderRadius: 12,
                    }}
                  >
                    🔒 ĐÃ BẢO VỆ BỞI WINDOWS DPAPI
                  </span>
                )}
              </div>

              {connectionSummary?.hasApiKey && !isEditingApiKey ? (
                /* Khóa đã lưu - Không bao giờ hiển thị plaintext! */
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    type="password"
                    data-testid="input-euler-apikey-masked"
                    value="••••••••••••••••••••••••••••••••"
                    disabled
                    style={{
                      flex: 1,
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: 6,
                      padding: '8px 12px',
                      color: '#64748b',
                      fontFamily: 'monospace',
                      fontSize: 13,
                    }}
                  />
                  <button
                    type="button"
                    data-testid="btn-change-apikey"
                    onClick={() => setIsEditingApiKey(true)}
                    style={{
                      background: '#334155',
                      color: '#f8fafc',
                      border: 'none',
                      padding: '8px 14px',
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Đổi Khóa Mới
                  </button>
                  <button
                    type="button"
                    data-testid="btn-clear-apikey"
                    onClick={() => void handleClearApiKey()}
                    style={{
                      background: '#450a0a',
                      color: '#fca5a5',
                      border: '1px solid #b91c1c',
                      padding: '8px 14px',
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Xóa Khóa
                  </button>
                </div>
              ) : (
                /* Đang nhập hoặc đổi khóa mới */
                <div>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      data-testid="input-euler-apikey"
                      value={eulerApiKey}
                      onChange={(e) => setEulerApiKey(e.target.value)}
                      placeholder="Dán API Key EulerStream của bạn tại đây..."
                      style={{
                        width: '100%',
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: 6,
                        padding: '8px 40px 8px 12px',
                        color: '#f8fafc',
                        fontFamily: 'monospace',
                        fontSize: 13,
                        boxSizing: 'border-box',
                      }}
                    />
                    <button
                      type="button"
                      data-testid="btn-toggle-show-apikey"
                      onClick={() => setShowApiKey(!showApiKey)}
                      style={{
                        position: 'absolute',
                        right: 8,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'transparent',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        fontSize: 14,
                      }}
                    >
                      {showApiKey ? '🙈' : '👁️'}
                    </button>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    Khóa được mã hóa bằng DPAPI (Windows safeStorage) ngay khi lưu. Tuyệt đối không hiển thị lại sau khi lưu.
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: '#cbd5e1' }}>
                <input
                  type="checkbox"
                  data-testid="checkbox-euler-autoconnect"
                  checked={eulerAutoConnect}
                  onChange={(e) => setEulerAutoConnect(e.target.checked)}
                />
                Tự động kết nối tới EulerStream khi khởi động BuddhaLive Studio
              </label>
            </div>

            {/* Hướng dẫn EulerStream */}
            <div
              style={{
                background: '#0f172a',
                border: '1px solid #7c3aed',
                borderRadius: 6,
                padding: 14,
                marginBottom: 20,
                fontSize: 12,
                lineHeight: 1.6,
                color: '#cbd5e1',
              }}
            >
              <strong style={{ color: '#c4b5fd', display: 'block', marginBottom: 4 }}>
                💡 Hướng dẫn cấu hình EulerStream Cloud:
              </strong>
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                <li>Truy cập <strong>eulerstream.com</strong>, tạo tài khoản và lấy API Key cá nhân.</li>
                <li>Nhập chính xác tên kênh TikTok (kênh phải đang ở trạng thái phát trực tiếp).</li>
                <li>Bấm nút lưu bên dưới. Khóa API sẽ được mã hóa an toàn trên máy của bạn.</li>
              </ol>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                data-testid="btn-save-euler-config"
                onClick={() => void handleSaveEulerStream()}
                disabled={isLoading}
                style={{
                  background: '#7c3aed',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 24px',
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                💾 Lưu Cấu Hình & Khóa EulerStream
              </button>
              {isEditingApiKey && connectionSummary?.hasApiKey && (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingApiKey(false);
                    setEulerApiKey('');
                  }}
                  style={{
                    background: '#334155',
                    color: '#cbd5e1',
                    border: 'none',
                    padding: '10px 16px',
                    borderRadius: 6,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Hủy Đổi Khóa
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* T33-A & T33-C: Chẩn Đoán & Giám Sát Kết Nối (Live Diagnostics & Observability) */}
      <div
        data-testid="section-diagnostics"
        style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: 8,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
              🔍 Chẩn Đoán & Giám Sát Kết Nối (Live Diagnostics & Observability)
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              Giám sát tình trạng Provider, OBS Studio, Lịch sử kết nối & Event Traces (T33-A, T33-C)
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              data-testid="btn-refresh-diagnostics"
              onClick={() => void loadDiagnostics()}
              style={{
                background: '#334155',
                color: '#cbd5e1',
                border: 'none',
                padding: '7px 14px',
                borderRadius: 6,
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              🔄 Làm Mới
            </button>
            <button
              type="button"
              data-testid="btn-export-diagnostics"
              onClick={() => void handleExportDiagnostics('markdown')}
              style={{
                background: '#0284c7',
                color: '#fff',
                border: 'none',
                padding: '7px 14px',
                borderRadius: 6,
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              📥 Xuất Báo Cáo (Markdown)
            </button>
            <button
              type="button"
              data-testid="btn-export-json-diagnostics"
              onClick={() => void handleExportDiagnostics('json')}
              style={{
                background: '#475569',
                color: '#cbd5e1',
                border: 'none',
                padding: '7px 14px',
                borderRadius: 6,
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              📥 Xuất JSON
            </button>
          </div>
        </div>

        {/* 4 Thẻ chỉ số trạng thái chẩn đoán chính */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: 6,
              padding: 12,
            }}
          >
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>
              Trạng thái Live Provider
            </div>
            <div
              data-testid="diagnostic-provider-status"
              style={{
                fontSize: 14,
                fontWeight: 700,
                marginTop: 4,
                color:
                  (diagnostics?.providerStatus || connectionSummary?.state) === 'RECEIVING_EVENTS'
                    ? '#22c55e'
                    : (diagnostics?.providerStatus || connectionSummary?.state) === 'CONNECTED'
                    ? '#38bdf8'
                    : (diagnostics?.providerStatus || connectionSummary?.state) === 'ERROR'
                    ? '#ef4444'
                    : '#cbd5e1',
              }}
            >
              {diagnostics?.providerStatus || connectionSummary?.state || 'DISCONNECTED'}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              Kênh: @{diagnostics?.streamerUsername || connectionSummary?.streamerUsername || 'none'}
            </div>
          </div>

          <div
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: 6,
              padding: 12,
            }}
          >
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>
              Trạng thái OBS WebSocket
            </div>
            <div
              data-testid="diagnostic-obs-status"
              style={{
                fontSize: 14,
                fontWeight: 700,
                marginTop: 4,
                color:
                  diagnostics?.obsStatus === 'IDENTIFIED'
                    ? '#22c55e'
                    : diagnostics?.obsStatus === 'ERROR'
                    ? '#ef4444'
                    : '#94a3b8',
              }}
            >
              {diagnostics?.obsStatus || 'DISCONNECTED'}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              Cổng v5: 4455 (SHA-256 challenge)
            </div>
          </div>

          <div
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: 6,
              padding: 12,
            }}
          >
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>
              Sự Kiện / Reconnect
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', marginTop: 4 }}>
              {diagnostics?.eventsReceived ?? connectionSummary?.eventsReceived ?? 0} sự kiện
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              Tái kết nối: {diagnostics?.reconnectCount ?? 0} lần
            </div>
          </div>

          <div
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: 6,
              padding: 12,
            }}
          >
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>
              Mã Lỗi Gần Nhất
            </div>
            <div
              data-testid="diagnostic-last-error-code"
              style={{
                fontSize: 13,
                fontWeight: 700,
                marginTop: 4,
                color: diagnostics?.lastErrorCode ? '#ef4444' : '#22c55e',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {diagnostics?.lastErrorCode || 'NONE (Bình thường)'}
            </div>
            <div
              style={{
                fontSize: 11,
                color: '#64748b',
                marginTop: 2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {diagnostics?.lastErrorMessage || 'Không có lỗi'}
            </div>
          </div>
        </div>

        {/* System Health Strip */}
        {diagnostics?.systemHealth && (
          <div
            style={{
              display: 'flex',
              gap: 16,
              padding: '8px 12px',
              background: '#0f172a',
              borderRadius: 6,
              border: '1px solid #1e293b',
              marginBottom: 16,
              fontSize: 12,
              color: '#94a3b8',
              flexWrap: 'wrap',
            }}
          >
            <div>
              SQLite WAL Mode:{' '}
              <strong
                style={{
                  color: diagnostics.systemHealth.sqliteWalActive ? '#22c55e' : '#f59e0b',
                }}
              >
                {diagnostics.systemHealth.sqliteWalActive ? '✓ Đang bật' : '✕ Tắt'}
              </strong>
            </div>
            <div>
              Overlays Sẵn Sàng:{' '}
              <strong style={{ color: '#f8fafc' }}>
                {diagnostics.systemHealth.overlayReadyCount}
              </strong>
            </div>
            <div>
              Hàng Đợi Execution:{' '}
              <strong style={{ color: '#f8fafc' }}>
                {diagnostics.systemHealth.queueLength}
              </strong>
            </div>
            <div>
              Nhân Vật 3D:{' '}
              <strong style={{ color: '#cbd5e1' }}>
                {diagnostics.systemHealth.activeCharacterId || 'Chưa chọn'}
              </strong>
            </div>
          </div>
        )}

        {/* Modal / Khung hiển thị Báo Cáo đã xuất */}
        {exportedReport && (
          <div
            data-testid="box-exported-report"
            style={{
              background: '#0f172a',
              border: '1px solid #0284c7',
              borderRadius: 6,
              padding: 14,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <strong style={{ color: '#38bdf8', fontSize: 13 }}>
                📄 Xem Trước Báo Cáo Chẩn Đoán (Đã khử khuẩn toàn bộ bí mật):
              </strong>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(exportedReport);
                    setIsExportCopied(true);
                  }}
                  style={{
                    background: isExportCopied ? '#15803d' : '#334155',
                    color: '#fff',
                    border: 'none',
                    padding: '4px 10px',
                    borderRadius: 4,
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  {isExportCopied ? '✓ Đã Sao Chép' : '📋 Sao Chép'}
                </button>
                <button
                  type="button"
                  onClick={() => setExportedReport(null)}
                  style={{
                    background: '#334155',
                    color: '#cbd5e1',
                    border: 'none',
                    padding: '4px 8px',
                    borderRadius: 4,
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  ✕ Đóng
                </button>
              </div>
            </div>
            <pre
              style={{
                margin: 0,
                maxHeight: 220,
                overflowY: 'auto',
                fontSize: 11,
                fontFamily: 'Consolas, monospace',
                color: '#cbd5e1',
                background: '#020617',
                padding: 10,
                borderRadius: 4,
              }}
            >
              {exportedReport}
            </pre>
          </div>
        )}

        {/* Lịch Sử Chuyển Đổi Trạng Thái Kết Nối (Connection History) */}
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: '#cbd5e1',
              marginBottom: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>📜 Lịch Sử Chuyển Đổi Trạng Thái Kết Nối (Tối đa 50 sự kiện gần nhất):</span>
          </div>
          <div
            style={{
              maxHeight: 160,
              overflowY: 'auto',
              background: '#0f172a',
              borderRadius: 6,
              border: '1px solid #334155',
            }}
          >
            <table
              data-testid="table-connection-history"
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, color: '#cbd5e1' }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid #334155',
                    textAlign: 'left',
                    background: '#1e293b',
                  }}
                >
                  <th style={{ padding: '6px 8px', color: '#94a3b8' }}>Thời Gian</th>
                  <th style={{ padding: '6px 8px', color: '#94a3b8' }}>Provider</th>
                  <th style={{ padding: '6px 8px', color: '#94a3b8' }}>Trạng Thái</th>
                  <th style={{ padding: '6px 8px', color: '#94a3b8' }}>Mã Lỗi</th>
                  <th style={{ padding: '6px 8px', color: '#94a3b8' }}>Chi Tiết / Lý Do</th>
                </tr>
              </thead>
              <tbody>
                {!diagnostics || diagnostics.connectionHistory.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 12, textAlign: 'center', color: '#64748b' }}>
                      Chưa có lịch sử trạng thái kết nối nào được ghi nhận.
                    </td>
                  </tr>
                ) : (
                  diagnostics.connectionHistory.map((item, idx) => (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: '1px solid #1e293b',
                        background: idx % 2 === 0 ? '#0f172a' : '#141e33',
                      }}
                    >
                      <td style={{ padding: '6px 8px', color: '#94a3b8' }}>
                        {item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : '-'}
                      </td>
                      <td style={{ padding: '6px 8px' }}>{item.provider}</td>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>
                        <span
                          style={{
                            color:
                              item.state === 'RECEIVING_EVENTS'
                                ? '#22c55e'
                                : item.state === 'CONNECTED'
                                ? '#38bdf8'
                                : item.state === 'ERROR'
                                ? '#ef4444'
                                : item.state === 'RECONNECTING'
                                ? '#f59e0b'
                                : '#94a3b8',
                          }}
                        >
                          {item.state}
                        </span>
                      </td>
                      <td style={{ padding: '6px 8px', color: item.errorCode ? '#ef4444' : '#64748b' }}>
                        {item.errorCode || '-'}
                      </td>
                      <td style={{ padding: '6px 8px', color: '#94a3b8' }}>
                        {item.reason || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live Event Traces (Pipeline Ingress -> OBS Playback) */}
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: '#cbd5e1',
              marginBottom: 6,
            }}
          >
            <span>⚡ Dấu Vết Sự Kiện (Event Traces - Pipeline Ingress &rarr; OBS Playback):</span>
          </div>
          <div
            style={{
              maxHeight: 180,
              overflowY: 'auto',
              background: '#0f172a',
              borderRadius: 6,
              border: '1px solid #334155',
            }}
          >
            <table
              data-testid="table-event-traces"
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, color: '#cbd5e1' }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid #334155',
                    textAlign: 'left',
                    background: '#1e293b',
                  }}
                >
                  <th style={{ padding: '6px 8px', color: '#94a3b8' }}>Correlation ID</th>
                  <th style={{ padding: '6px 8px', color: '#94a3b8' }}>Sự Kiện</th>
                  <th style={{ padding: '6px 8px', color: '#94a3b8' }}>Người Gửi</th>
                  <th style={{ padding: '6px 8px', color: '#94a3b8' }}>Trạng Thái</th>
                  <th style={{ padding: '6px 8px', color: '#94a3b8' }}>Tiến Trình (Stages)</th>
                </tr>
              </thead>
              <tbody>
                {eventTraces.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 12, textAlign: 'center', color: '#64748b' }}>
                      Chưa có sự kiện LIVE nào được tiếp nhận qua Ingress.
                    </td>
                  </tr>
                ) : (
                  eventTraces.map((trace, idx) => (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: '1px solid #1e293b',
                        background: idx % 2 === 0 ? '#0f172a' : '#141e33',
                      }}
                    >
                      <td style={{ padding: '6px 8px', fontFamily: 'Consolas, monospace', color: '#38bdf8' }}>
                        {trace.correlationId}
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        {trace.giftName} x{trace.giftCount}
                      </td>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>{trace.senderName}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <span
                          style={{
                            color:
                              trace.status === 'COMPLETED'
                                ? '#22c55e'
                                : trace.status === 'PROCESSING'
                                ? '#38bdf8'
                                : trace.status === 'DROPPED'
                                ? '#f59e0b'
                                : '#ef4444',
                            fontWeight: 600,
                          }}
                        >
                          {trace.status}
                        </span>
                      </td>
                      <td style={{ padding: '6px 8px', color: '#94a3b8' }}>
                        {trace.steps.map((s) => s.step).join(' ➔ ')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Bảng Hướng dẫn Khắc phục Sự cố Thường gặp (Troubleshooting Matrix) */}
      <div
        style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: 8,
          padding: 16,
          fontSize: 12,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', marginBottom: 8 }}>
          🛠️ Hướng dẫn Khắc phục Sự cố Thường gặp (Troubleshooting):
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', color: '#cbd5e1' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #334155', textAlign: 'left' }}>
              <th style={{ padding: '6px 8px', color: '#94a3b8' }}>Hiện tượng / Lỗi</th>
              <th style={{ padding: '6px 8px', color: '#94a3b8' }}>Nguyên nhân tiềm năng</th>
              <th style={{ padding: '6px 8px', color: '#94a3b8' }}>Cách xử lý</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #334155' }}>
              <td style={{ padding: '8px' }}><code>ECONNREFUSED 127.0.0.1:21213</code></td>
              <td style={{ padding: '8px' }}>TikFinity Desktop chưa được mở hoặc chưa bật WebSocket.</td>
              <td style={{ padding: '8px' }}>Mở ứng dụng TikFinity Desktop &gt; Settings &gt; Bật WebSocket Server cổng 21213.</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #334155' }}>
              <td style={{ padding: '8px' }}><code>401 Unauthorized</code> (EulerStream)</td>
              <td style={{ padding: '8px' }}>API Key sai hoặc gói cước EulerStream hết hạn.</td>
              <td style={{ padding: '8px' }}>Bấm "Đổi Khóa Mới" và dán lại API Key chính xác từ EulerStream Dashboard.</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #334155' }}>
              <td style={{ padding: '8px' }}><code>Streamer Offline / Room Not Found</code></td>
              <td style={{ padding: '8px' }}>Kênh TikTok chưa bắt đầu livestream thật.</td>
              <td style={{ padding: '8px' }}>Bắt đầu phát trực tiếp trên TikTok Live Studio / điện thoại trước khi kết nối.</td>
            </tr>
            <tr>
              <td style={{ padding: '8px' }}><code>INVALID_TIKFINITY_ENDPOINT</code></td>
              <td style={{ padding: '8px' }}>Nhập URL ngoài mạng loopback.</td>
              <td style={{ padding: '8px' }}>TikFinity chỉ hỗ trợ loopback: <code>ws://127.0.0.1:21213</code> hoặc <code>ws://localhost:21213</code>.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
