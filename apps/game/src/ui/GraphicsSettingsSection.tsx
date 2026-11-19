import React, { useEffect, useState } from 'react';
import {
  GRAPHICS_QUALITY_LABELS,
  GRAPHICS_TOGGLE_LABELS,
  SHAKE_INTENSITY_LEVELS,
  graphicsSettings,
  type GraphicsOptions,
} from '../data/graphicsSettings';

interface GraphicsSettingsSectionProps {
  theme: 'dark' | 'light';
}

export const GraphicsSettingsSection: React.FC<GraphicsSettingsSectionProps> = ({ theme }) => {
  const [opts, setOpts] = useState<Readonly<GraphicsOptions>>(() => graphicsSettings.get());
  const [expanded, setExpanded] = useState<boolean>(false);

  useEffect(() => {
    return graphicsSettings.subscribe((next) => setOpts({ ...next }));
  }, []);

  const isDark = theme === 'dark';
  const titleColor = isDark ? '#e2e8f0' : '#334155';
  const subTextColor = isDark ? '#94a3b8' : '#64748b';
  const pillOffBg = isDark ? '#334155' : '#e2e8f0';
  const pillOffColor = isDark ? '#cbd5e1' : '#334155';
  const dividerCol = isDark ? 'rgba(148, 163, 184, 0.14)' : 'rgba(15, 23, 42, 0.08)';
  const currentQuality = graphicsSettings.getQuality();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Hàng chính: Đồ Họa [Thấp | Trung bình | Cao] + nút Tùy chỉnh */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span style={{ fontWeight: isDark ? 700 : 800, fontSize: '14px', color: titleColor }}>
          Đồ Họa
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {GRAPHICS_QUALITY_LABELS.map((q) => {
            const active = currentQuality === q.value;
            return (
              <button
                key={q.value}
                type="button"
                onClick={() => graphicsSettings.setQuality(q.value)}
                style={{
                  background: active ? '#2563eb' : pillOffBg,
                  color: active ? '#fff' : pillOffColor,
                  border: active ? '1px solid #60a5fa' : 'none',
                  borderRadius: '7px',
                  padding: '5px 9px',
                  fontWeight: 800,
                  fontSize: '11.5px',
                  cursor: 'pointer',
                }}
              >
                {q.label}
              </button>
            );
          })}
          <button
            type="button"
            title="Tùy chỉnh chi tiết từng hiệu ứng"
            onClick={() => setExpanded((v) => !v)}
            style={{
              background: expanded ? (isDark ? 'rgba(56, 189, 248, 0.2)' : 'rgba(37, 99, 235, 0.12)') : pillOffBg,
              color: expanded ? (isDark ? '#38bdf8' : '#2563eb') : pillOffColor,
              border: 'none',
              borderRadius: '7px',
              padding: '5px 8px',
              fontWeight: 800,
              fontSize: '11.5px',
              cursor: 'pointer',
            }}
          >
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* Chi tiết từng hiệu ứng (chỉ hiện khi bấm mở rộng) */}
      {expanded && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            paddingTop: '8px',
            borderTop: `1px solid ${dividerCol}`,
            maxHeight: '240px',
            overflowY: 'auto',
          }}
        >
          {GRAPHICS_TOGGLE_LABELS.map(({ key, label }) => {
            const enabled = opts[key];
            return (
              <div
                key={key}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: subTextColor }}>{label}</span>
                <button
                  type="button"
                  onClick={() => graphicsSettings.set(key, !enabled)}
                  style={{
                    background: enabled ? '#16a34a' : pillOffBg,
                    color: enabled ? '#fff' : pillOffColor,
                    border: 'none',
                    borderRadius: '7px',
                    padding: '4px 11px',
                    fontWeight: 800,
                    fontSize: '11.5px',
                    cursor: 'pointer',
                    minWidth: '52px',
                  }}
                >
                  {enabled ? 'Bật' : 'Tắt'}
                </button>
              </div>
            );
          })}

          {opts.screenShake && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
                paddingTop: '2px',
              }}
            >
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: subTextColor }}>Độ rung màn hình</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                {SHAKE_INTENSITY_LEVELS.map((lvl) => {
                  const active = Math.abs(opts.shakeIntensity - lvl.value) < 0.05;
                  return (
                    <button
                      key={lvl.value}
                      type="button"
                      onClick={() => graphicsSettings.set('shakeIntensity', lvl.value)}
                      style={{
                        background: active ? '#2563eb' : pillOffBg,
                        color: active ? '#fff' : pillOffColor,
                        border: active ? '1px solid #60a5fa' : 'none',
                        borderRadius: '7px',
                        padding: '4px 9px',
                        fontWeight: 800,
                        fontSize: '11.5px',
                        cursor: 'pointer',
                      }}
                    >
                      {lvl.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
