import sys

with open('apps/game/src/ui/PreviewGallery.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Strip Canvas & Banner Replacement
old_strip_section = """              {/* Dải Concept Canvas (688 x 220) */}
              <div style={{ background: '#090d16', borderRadius: '12px', overflow: 'hidden', border: '1px solid #334155', padding: '4px' }}>
                <canvas
                  ref={studioStripCanvasRef}
                  width={688}
                  height={220}
                  style={{ width: '100%', height: 'auto', display: 'block', cursor: 'crosshair' }}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickX = (e.clientX - rect.left) * (688 / rect.width);
                    const frames = studioClip === 'walk' ? studioUnitConfig.walkFrames : studioUnitConfig.attackFrames;
                    const hitIdx = frames.findIndex((f) => clickX >= f.x * 2 && clickX <= (f.x + f.w) * 2);
                    if (hitIdx !== -1) {
                      setSelectedStudioFrameIdx(hitIdx);
                    }
                  }}
                />
              </div>"""

new_strip_section = """              {/* Thanh Thông Báo Trạng Thái Chuột */}
              <div
                style={{
                  background: 'linear-gradient(90deg, #1e293b, #0f172a)',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  border: '1px solid #38bdf8',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                  <span style={{ color: '#facc15', fontWeight: 900 }}>🖱️ THAO TÁC CHUỘT:</span>
                  <span style={{ color: '#f8fafc', fontWeight: 700 }}>{mouseTip}</span>
                </div>
                <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: '#94a3b8' }}>
                  <span style={{ background: '#1e3a5f', padding: '2px 8px', borderRadius: '4px', color: '#38bdf8', fontWeight: 700 }}>
                    ✋ Kéo Thân = Đổi X
                  </span>
                  <span style={{ background: '#1e3a5f', padding: '2px 8px', borderRadius: '4px', color: '#facc15', fontWeight: 700 }}>
                    ↔ Kéo 2 Mép = Co Giãn W
                  </span>
                  <span style={{ background: '#1e3a5f', padding: '2px 8px', borderRadius: '4px', color: '#22c55e', fontWeight: 700 }}>
                    ↕ Kéo Vạch Xanh = Nâng/Hạ Sàn
                  </span>
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
              </div>"""

assert old_strip_section in text, 'old_strip_section not found'
text = text.replace(old_strip_section, new_strip_section, 1)

# 2. Live Canvas & Speed Controls Replacement
old_live_section = """                <canvas
                  ref={studioLiveCanvasRef}
                  width={400}
                  height={320}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />
              </div>

              {/* Tốc độ phát */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#090d16', padding: '10px 14px', borderRadius: '10px' }}>
                <span style={{ fontSize: '13px', color: '#cbd5e1' }}>Tốc độ phát:</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[0.5, 1.0, 1.5, 2.0].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => setPlaybackSpeed(spd)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        border: playbackSpeed === spd ? '1px solid #38bdf8' : '1px solid #334155',
                        background: playbackSpeed === spd ? '#0284c7' : '#1e293b',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>"""

new_live_section = """                <canvas
                  ref={studioLiveCanvasRef}
                  width={400}
                  height={320}
                  style={{ width: '100%', height: 'auto', display: 'block', cursor: 'ns-resize', userSelect: 'none' }}
                  onMouseDown={handleLiveMouseDown}
                  onMouseMove={handleLiveMouseMove}
                />
              </div>

              {/* Tốc độ phát & Đóng băng kéo chân */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#090d16', padding: '10px 14px', borderRadius: '10px', border: '1px solid #1e293b' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setStudioLiveFreeze(!studioLiveFreeze)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: studioLiveFreeze ? '2px solid #facc15' : '1px solid #475569',
                      background: studioLiveFreeze ? '#854d0e' : '#1e293b',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {studioLiveFreeze ? '⏸️ Đang Đóng Băng Frame' : '▶️ Đang Chạy Hoạt Ảnh'}
                  </button>
                  <span style={{ fontSize: '11px', color: studioLiveFreeze ? '#facc15' : '#94a3b8' }}>
                    {studioLiveFreeze ? 'Kéo chuột trên nhân vật để chạm sàn' : 'Bấm để đóng băng và kéo chân'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#cbd5e1', marginRight: '4px' }}>Tốc độ:</span>
                  {[0.5, 1.0, 1.5, 2.0].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => { setPlaybackSpeed(spd); setStudioLiveFreeze(false); }}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: (!studioLiveFreeze && playbackSpeed === spd) ? '1px solid #38bdf8' : '1px solid #334155',
                        background: (!studioLiveFreeze && playbackSpeed === spd) ? '#0284c7' : '#1e293b',
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>"""

assert old_live_section in text, 'old_live_section not found'
text = text.replace(old_live_section, new_live_section, 1)

with open('apps/game/src/ui/PreviewGallery.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print('Updated Strip & Live Canvas JSX successfully!')
