import React from 'react';
import type { StorageHealthReport } from '@buddhalive/shared';

interface SettingsTabProps {
  health: StorageHealthReport | null;
  fpsValue: string;
  onFpsChange: (fps: 30 | 60) => Promise<void>;
  pairedOverlaySessions: number;
  onRevokeSessions: () => Promise<void>;
}

export function SettingsTab({
  health,
  fpsValue,
  onFpsChange,
  pairedOverlaySessions,
  onRevokeSessions,
}: SettingsTabProps): React.ReactElement {
  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px 0', color: '#f8fafc' }}>
        Cài đặt & Bảo mật Hệ thống
      </h2>
      <p style={{ margin: '0 0 20px 0', fontSize: 13, color: '#94a3b8' }}>
        Cấu hình hiệu năng hiển thị, quản lý phiên kết nối OBS Studio và kiểm tra độ bền vững lưu trữ SQLite.
      </p>

      {/* Overlay FPS Setting */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 10px 0', color: '#38bdf8' }}>
          Hiệu năng Overlay (FPS Limit)
        </h3>
        <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 12px 0' }}>
          Giới hạn tốc độ khung hình cho Three.js Canvas trên OBS Browser Source để tiết kiệm tài nguyên CPU/GPU.
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={() => onFpsChange(30)}
            data-testid="btn-fps-30"
            style={{
              background: fpsValue === '30' ? '#2563eb' : '#334155',
              color: '#fff',
              border: 'none',
              padding: '8px 18px',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {fpsValue === '30' ? '✓ 30 FPS (Đang chọn)' : '30 FPS'}
          </button>
          <button
            type="button"
            onClick={() => onFpsChange(60)}
            data-testid="btn-fps-60"
            style={{
              background: fpsValue === '60' ? '#2563eb' : '#334155',
              color: '#fff',
              border: 'none',
              padding: '8px 18px',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {fpsValue === '60' ? '✓ 60 FPS (Đang chọn)' : '60 FPS'}
          </button>
        </div>
      </div>

      {/* OBS Session Security */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 10px 0', color: '#38bdf8' }}>
          Bảo mật Ghép nối OBS Studio
        </h3>
        <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 12px 0' }}>
          Phiên làm việc được mã hóa bằng Windows DPAPI (hoặc Dev Secret). Thu hồi phiên sẽ buộc toàn bộ OBS Browser Source phải ghép nối lại bằng mã xác nhận mới.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: '#f8fafc' }}>
            Số phiên OBS đang được cấp quyền: <strong>{pairedOverlaySessions}</strong>
          </span>
          <button
            type="button"
            onClick={onRevokeSessions}
            data-testid="btn-revoke-sessions-tab"
            style={{
              background: '#b91c1c',
              color: '#fff',
              border: 'none',
              padding: '8px 16px',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Thu hồi toàn bộ token OBS
          </button>
        </div>
      </div>

      {/* Storage Health Report */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 10px 0', color: '#38bdf8' }}>
          Độ bền vững SQLite & WAL Storage (S1 Architecture)
        </h3>
        {health ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
            <div>
              <span style={{ color: '#94a3b8' }}>Journal Mode: </span>
              <strong style={{ color: health.journalMode === 'wal' ? '#34d399' : '#f87171' }}>
                {health.journalMode.toUpperCase()}
              </strong>
            </div>
            <div>
              <span style={{ color: '#94a3b8' }}>Khóa ngoại (Foreign Keys): </span>
              <strong style={{ color: health.foreignKeysEnabled ? '#34d399' : '#f87171' }}>
                {health.foreignKeysEnabled ? 'BẬT (ON)' : 'TẮT (OFF)'}
              </strong>
            </div>
            <div>
              <span style={{ color: '#94a3b8' }}>Ghi/Đọc Probe Check: </span>
              <strong style={{ color: health.readWriteProbeOk ? '#34d399' : '#f87171' }}>
                {health.readWriteProbeOk ? 'ĐẠT (PASS)' : 'LỖI'}
              </strong>
            </div>
            <div>
              <span style={{ color: '#94a3b8' }}>Số migrations đã chạy: </span>
              <strong>{health.appliedMigrations.length}</strong>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <span style={{ color: '#94a3b8' }}>Đường dẫn tệp SQLite: </span>
              <code style={{ color: '#38bdf8' }}>{health.dbFilePath}</code>
            </div>
          </div>
        ) : (
          <div style={{ color: '#64748b', fontSize: 13 }}>Đang tải báo cáo lưu trữ...</div>
        )}
      </div>

      {/* S6: Backup, Restore & Diagnostics (T-18) */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 10px 0', color: '#38bdf8' }}>
          Sao lưu, Khôi phục & Chẩn đoán Hệ thống (T-18)
        </h3>
        <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 16px 0' }}>
          Sao lưu SQLite nguyên tử qua WAL mode (VACUUM INTO), khôi phục có cơ chế Rollback tự động, và xuất chẩn đoán ẩn danh 100% token/cookie.
        </p>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <button
            type="button"
            data-testid="btn-backup-db"
            onClick={async () => {
              if (window.buddhaDesktop.createBackup) {
                const res = await window.buddhaDesktop.createBackup({ scope: 'DATABASE_ONLY' });
                alert(`✓ Đã sao lưu Database thành công!\nĐường dẫn: ${res.backupPath}\nDung lượng: ${(res.sizeBytes / 1024).toFixed(1)} KB`);
              }
            }}
            style={{
              background: '#0284c7',
              color: '#fff',
              border: 'none',
              padding: '9px 16px',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            💾 Sao lưu Database (.bak)
          </button>

          <button
            type="button"
            data-testid="btn-backup-full"
            onClick={async () => {
              if (window.buddhaDesktop.createBackup) {
                const res = await window.buddhaDesktop.createBackup({ scope: 'FULL_DATA_BUNDLE' });
                alert(`✓ Đã sao lưu Toàn bộ Bundle thành công!\nThư mục: ${res.backupPath}\nBao gồm: Database + Thư mục assets/ 3D`);
              }
            }}
            style={{
              background: '#0f766e',
              color: '#fff',
              border: 'none',
              padding: '9px 16px',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            📦 Sao lưu Toàn bộ Bundle (DB + Assets)
          </button>

          <button
            type="button"
            data-testid="btn-restore-db"
            onClick={async () => {
              if (window.buddhaDesktop.pickAndRestoreBackup) {
                if (!confirm('CẢNH BÁO: Quá trình khôi phục sẽ ghi đè cơ sở dữ liệu hiện tại bằng tệp sao lưu. Hệ thống sẽ tự động tạo bản lưu dự phòng (.pre-restore.bak). Bạn có muốn tiếp tục?')) {
                  return;
                }
                const res = await window.buddhaDesktop.pickAndRestoreBackup();
                if (res.canceled) return;
                if (res.result?.ok) {
                  alert(`✓ Khôi phục cơ sở dữ liệu thành công!\nĐã phục hồi từ: ${res.result.restoredFrom}\nBản rollback lưu tại: ${res.result.rollbackPath}`);
                  window.location.reload();
                } else {
                  alert(`✕ Khôi phục thất bại: ${res.result?.error || 'Lỗi không xác định'}\nHệ thống đã tự động rollback dữ liệu an toàn.`);
                }
              }
            }}
            style={{
              background: '#b45309',
              color: '#fff',
              border: 'none',
              padding: '9px 16px',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            🔄 Khôi phục Database (.bak)...
          </button>

          <button
            type="button"
            data-testid="btn-export-diagnostics"
            onClick={async () => {
              if (window.buddhaDesktop.exportDiagnostics) {
                const res = await window.buddhaDesktop.exportDiagnostics();
                if (res.canceled) return;
                alert(`✓ Đã xuất Báo cáo Chẩn đoán thành công!\nTệp: ${res.savedPath}`);
              }
            }}
            style={{
              background: '#475569',
              color: '#f8fafc',
              border: 'none',
              padding: '9px 16px',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            📋 Xuất Báo cáo Chẩn đoán (JSON)
          </button>
        </div>

        {/* Safety Notices */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#94a3b8' }}>
          <div><strong>Lưu ý quan trọng:</strong></div>
          <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
            <li>Tệp <code>.bak</code> độc lập chỉ chứa cấu trúc bảng và quy tắc SQLite. Để lưu cả mô hình 3D và âm thanh, hãy chọn <em>Sao lưu Toàn bộ Bundle</em>.</li>
            <li>Tuyệt đối không có token quản trị hay cookie OBS nào được lưu trong bản sao lưu để đảm bảo an toàn nếu tệp bị chia sẻ.</li>
            <li>Mọi bản sao lưu đều được kiểm tra tính hợp lệ (Magic header + PRAGMA quick_check) trước khi khôi phục.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
