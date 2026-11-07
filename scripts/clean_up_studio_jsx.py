# -*- coding: utf-8 -*-
import sys

new_columns = '''{/* CỘT TRÁI: DẢI CONCEPT VÀ ĐIỀU KHIỂN CẮT FRAME */}
            <div style={{ background: '#131d31', borderRadius: '16px', padding: '16px', border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Header điều khiển dải & thông số gọn gàng */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => { setStudioClip('walk'); setSelectedStudioFrameIdx(0); }}
                    style={{
                      background: studioClip === 'walk' ? '#0284c7' : '#1e293b',
                      color: '#fff',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      padding: '6px 14px',
                      fontSize: '13px',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    Walk ({studioUnitConfig.walkFrames.length}F)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setStudioClip('attack'); setSelectedStudioFrameIdx(0); }}
                    style={{
                      background: studioClip === 'attack' ? '#ef4444' : '#1e293b',
                      color: '#fff',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      padding: '6px 14px',
                      fontSize: '13px',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    Attack ({studioUnitConfig.attackFrames.length}F)
                  </button>
                </div>

                {/* Thông số gọn gàng của Frame đang chọn */}
                {(() => {
                  const frames = studioClip === 'walk' ? studioUnitConfig.walkFrames : studioUnitConfig.attackFrames;
                  const cur = frames[selectedStudioFrameIdx] || frames[0];
                  if (!cur) return null;
                  return (
                    <div style={{ background: '#090d16', border: '1px solid #334155', padding: '4px 12px', borderRadius: '8px', fontSize: '12px', fontFamily: 'monospace', color: '#facc15' }}>
                      F{selectedStudioFrameIdx + 1}: X={cur.x} Y={cur.y} W={cur.w} H={cur.h} | Sàn={studioUnitConfig.groundBaselineY} | dy={cur.dy || 0}
                    </div>
                  );
                })()}

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const frames = studioClip === 'walk' ? [...studioUnitConfig.walkFrames] : [...studioUnitConfig.attackFrames];
                      const last = frames[frames.length - 1] || { x: 10, y: studioClip === 'walk' ? 0 : 106, w: 80, h: 90 };
                      frames.push({ x: Math.min(260, last.x + last.w + 6), y: last.y, w: last.w, h: last.h, dx: 0, dy: 0 });
                      setStudioUnitConfig({
                        ...studioUnitConfig,
                        [studioClip === 'walk' ? 'walkFrames' : 'attackFrames']: frames,
                      });
                      setSelectedStudioFrameIdx(frames.length - 1);
                    }}
                    style={{ background: '#1e293b', color: '#38bdf8', border: '1px solid #334155', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    + Thêm Frame
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const frames = studioClip === 'walk' ? [...studioUnitConfig.walkFrames] : [...studioUnitConfig.attackFrames];
                      if (frames.length <= 1) return;
                      frames.splice(selectedStudioFrameIdx, 1);
                      setStudioUnitConfig({
                        ...studioUnitConfig,
                        [studioClip === 'walk' ? 'walkFrames' : 'attackFrames']: frames,
                      });
                      setSelectedStudioFrameIdx(Math.max(0, selectedStudioFrameIdx - 1));
                    }}
                    style={{ background: '#1e293b', color: '#f87171', border: '1px solid #334155', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Xóa
                  </button>
                </div>
              </div>

              {/* Dải Concept Canvas (688 x 220) */}
              <div style={{ background: '#090d16', borderRadius: '12px', overflow: 'hidden', border: '1px solid #334155', padding: '4px' }}>
                <canvas
                  ref={studioStripCanvasRef}
                  width={688}
                  height={220}
                  style={{ width: '100%', height: 'auto', display: 'block', cursor: 'crosshair', userSelect: 'none' }}
                  onMouseDown={handleStripMouseDown}
                  onMouseMove={handleStripMouseMove}
                />
              </div>

              {/* Chọn Frame nhanh */}
              <div style={{ display: 'flex', gap: '6px' }}>
                {(studioClip === 'walk' ? studioUnitConfig.walkFrames : studioUnitConfig.attackFrames).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedStudioFrameIdx(i)}
                    style={{
                      flex: 1,
                      padding: '6px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: selectedStudioFrameIdx === i ? '2px solid #facc15' : '1px solid #334155',
                      background: selectedStudioFrameIdx === i ? '#854d0e' : '#1e293b',
                      color: '#fff',
                    }}
                  >
                    F{i + 1}
                  </button>
                ))}
              </div>

              {/* BẢNG ĐIỀU KHIỂN NUDGE 5 THÔNG SỐ (X, W, H, SÀN, DY) */}
              {(() => {
                const frames = studioClip === 'walk' ? studioUnitConfig.walkFrames : studioUnitConfig.attackFrames;
                const cur = frames[selectedStudioFrameIdx] || frames[0];
                if (!cur) return null;

                const updateCur = (delta: Partial<FrameBox>) => {
                  const updated = [...frames];
                  updated[selectedStudioFrameIdx] = { ...cur, ...delta };
                  setStudioUnitConfig({
                    ...studioUnitConfig,
                    [studioClip === 'walk' ? 'walkFrames' : 'attackFrames']: updated,
                  });
                };

                return (
                  <div style={{ background: '#090d16', borderRadius: '12px', padding: '12px', border: '1px solid #1e293b', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                    {/* 1. X */}
                    <div style={{ background: '#1e293b', padding: '8px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 700 }}>Vị trí X ({cur.x}px)</div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button type="button" onClick={() => updateCur({ x: Math.max(0, cur.x - 5) })} style={{ flex: 1, padding: '4px', background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>-5</button>
                        <button type="button" onClick={() => updateCur({ x: Math.max(0, cur.x - 1) })} style={{ flex: 1, padding: '4px', background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>-1</button>
                        <button type="button" onClick={() => updateCur({ x: Math.min(344 - cur.w, cur.x + 1) })} style={{ flex: 1, padding: '4px', background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>+1</button>
                        <button type="button" onClick={() => updateCur({ x: Math.min(344 - cur.w, cur.x + 5) })} style={{ flex: 1, padding: '4px', background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>+5</button>
                      </div>
                    </div>

                    {/* 2. W (Chiều rộng) */}
                    <div style={{ background: '#1e293b', padding: '8px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 700 }}>Rộng W ({cur.w}px)</div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button type="button" onClick={() => updateCur({ w: Math.max(15, cur.w - 5) })} style={{ flex: 1, padding: '4px', background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>-5</button>
                        <button type="button" onClick={() => updateCur({ w: Math.max(15, cur.w - 1) })} style={{ flex: 1, padding: '4px', background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>-1</button>
                        <button type="button" onClick={() => updateCur({ w: Math.min(180, cur.w + 1) })} style={{ flex: 1, padding: '4px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>+1</button>
                        <button type="button" onClick={() => updateCur({ w: Math.min(180, cur.w + 5) })} style={{ flex: 1, padding: '4px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>+5</button>
                      </div>
                    </div>

                    {/* 3. H (Chiều cao) */}
                    <div style={{ background: '#1e293b', padding: '8px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ fontSize: '11px', color: '#facc15', fontWeight: 700 }}>Cao H ({cur.h}px)</div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button type="button" onClick={() => updateCur({ h: Math.max(15, cur.h - 5) })} style={{ flex: 1, padding: '4px', background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>-5</button>
                        <button type="button" onClick={() => updateCur({ h: Math.max(15, cur.h - 1) })} style={{ flex: 1, padding: '4px', background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>-1</button>
                        <button type="button" onClick={() => updateCur({ h: Math.min(120, cur.h + 1) })} style={{ flex: 1, padding: '4px', background: '#854d0e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>+1</button>
                        <button type="button" onClick={() => updateCur({ h: Math.min(120, cur.h + 5) })} style={{ flex: 1, padding: '4px', background: '#854d0e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>+5</button>
                      </div>
                    </div>

                    {/* 4. Ground Baseline Y */}
                    <div style={{ background: '#1e293b', padding: '8px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ fontSize: '11px', color: '#22c55e', fontWeight: 700 }}>Sàn ({studioUnitConfig.groundBaselineY}px)</div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button type="button" onClick={() => setStudioUnitConfig({ ...studioUnitConfig, groundBaselineY: Math.max(50, studioUnitConfig.groundBaselineY - 2) })} style={{ flex: 1, padding: '4px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>▲ Nâng</button>
                        <button type="button" onClick={() => setStudioUnitConfig({ ...studioUnitConfig, groundBaselineY: Math.min(115, studioUnitConfig.groundBaselineY + 2) })} style={{ flex: 1, padding: '4px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>▼ Hạ</button>
                      </div>
                    </div>

                    {/* 5. dy bù chân */}
                    <div style={{ background: '#1e293b', padding: '8px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ fontSize: '11px', color: '#a855f7', fontWeight: 700 }}>Bù Chân dy ({cur.dy || 0}px)</div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button type="button" onClick={() => updateCur({ dy: (cur.dy || 0) - 2 })} style={{ flex: 1, padding: '4px', background: '#7e22ce', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>▲ Nâng</button>
                        <button type="button" onClick={() => updateCur({ dy: (cur.dy || 0) + 2 })} style={{ flex: 1, padding: '4px', background: '#7e22ce', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>▼ Chạm Sàn</button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* CỘT PHẢI: SÂN KHẤU HOẠT HỌA TRỰC TIẾP (LIVE PREVIEW) */}
            <div style={{ background: '#131d31', borderRadius: '16px', padding: '16px', border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', fontWeight: 800, color: '#38bdf8' }}>
                  📺 LIVE PREVIEW (60 FPS)
                </span>
                <button
                  type="button"
                  onClick={() => setStudioLiveFreeze(!studioLiveFreeze)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: studioLiveFreeze ? '1.5px solid #facc15' : '1px solid #475569',
                    background: studioLiveFreeze ? '#854d0e' : '#1e293b',
                    color: '#fff',
                    fontSize: '11px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {studioLiveFreeze ? '⏸️ Tạm Dừng (Kéo Chân)' : '▶️ Hoạt Ảnh (Click Tạm Dừng)'}
                </button>
              </div>

              <div style={{ background: '#090d16', borderRadius: '12px', overflow: 'hidden', border: '1px solid #334155' }}>
                <canvas
                  ref={studioLiveCanvasRef}
                  width={400}
                  height={320}
                  style={{ width: '100%', height: 'auto', display: 'block', cursor: 'ns-resize', userSelect: 'none' }}
                  onMouseDown={handleLiveMouseDown}
                  onMouseMove={handleLiveMouseMove}
                />
              </div>

              {/* Tốc độ phát */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#090d16', padding: '8px 12px', borderRadius: '8px' }}>
                <span style={{ fontSize: '12px', color: '#cbd5e1' }}>Tốc độ:</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {[0.5, 1.0, 1.5, 2.0].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => { setPlaybackSpeed(spd); setStudioLiveFreeze(false); }}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        border: (!studioLiveFreeze && playbackSpeed === spd) ? '1px solid #38bdf8' : '1px solid #334155',
                        background: (!studioLiveFreeze && playbackSpeed === spd) ? '#0284c7' : '#1e293b',
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>'''

with open('apps/game/src/ui/PreviewGallery.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

start_kw = "{/* CỘT TRÁI: DẢI CONCEPT VÀ ĐIỀU KHIỂN CẮT FRAME */}"
end_kw = "{/* Modal Xuất JSON */}"

idx_start = text.find(start_kw)
idx_end = text.find(end_kw)
assert idx_start != -1 and idx_end != -1, f"Keywords not found: {idx_start}, {idx_end}"

text = text[:idx_start] + new_columns + '\n\n          ' + text[idx_end:]

# Also simplify header of Studio (remove "CHỈNH TỪNG PIXEL & CHÂN CHẠM SÀN" badge to unclutter)
text = text.replace(
    '<span style={{ background: \'#0284c7\', color: \'#fff\', padding: \'2px 8px\', borderRadius: \'6px\', fontSize: \'12px\', fontWeight: 800 }}>\n                  CHỈNH TỪNG PIXEL & CHÂN CHẠM SÀN\n                </span>',
    ''
)

with open('apps/game/src/ui/PreviewGallery.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print('Cleaned up columns and simplified text successfully!')
