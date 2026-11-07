import React, { useEffect, useRef, useState } from 'react';
import { AGES_DATA } from '../data/ages';
import { SPRITE_CONFIGS } from '../data/sprites';
import { spriteLoader } from '../engine/SpriteLoader';
import { gameSettings, STORAGE_KEYS } from '../data/settings';

interface CustomizerStudioProps {
  onBackToGame: () => void;
}

// Bảng màu 16 màu Pixel Art kinh điển
const PIXEL_PALETTE = [
  '#000000', '#1c1917', '#44403c', '#78716c',
  '#ffffff', '#f8fafc', '#f59e0b', '#d97706',
  '#92400e', '#451a03', '#ef4444', '#b91c1c',
  '#10b981', '#047857', '#3b82f6', '#1d4ed8',
];

// Cây gậy gỗ 32x32 mẫu ban đầu
function createDefaultClubTemplate(): string[][] {
  const grid: string[][] = Array.from({ length: 32 }, () => Array(32).fill(''));
  // Vẽ một cây gậy gỗ thô sơ đường chéo từ (8, 24) lên (24, 8)
  for (let i = 0; i < 18; i++) {
    const x = 7 + i;
    const y = 24 - i;
    grid[y]![x] = '#78350f'; // Màu nâu gỗ chính
    grid[y]![x + 1] = '#92400e';
    grid[y + 1]![x] = '#451a03'; // Bóng đổ
    if (i >= 12) {
      // Đầu gậy to bản bọc đá
      grid[y - 1]![x] = '#57534e';
      grid[y - 1]![x + 1] = '#78716c';
      grid[y]![x + 2] = '#44403c';
    }
  }
  return grid;
}

export const CustomizerStudio: React.FC<CustomizerStudioProps> = ({ onBackToGame }) => {
  const [grid, setGrid] = useState<string[][]>(() => {
    const saved = gameSettings.getCustomWeaponGrid();
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return createDefaultClubTemplate();
  });

  const [selectedColor, setSelectedColor] = useState<string>('#92400e');
  const [activeTool, setActiveTool] = useState<'PENCIL' | 'ERASER' | 'BUCKET'>('PENCIL');
  const [isMouseDown, setIsMouseDown] = useState<boolean>(false);
  const [previewClip, setPreviewClip] = useState<'walk' | 'attack'>('walk');
  const [previewFrameIdx, setPreviewFrameIdx] = useState<number>(0);
  const [liveSafeMode, setLiveSafeMode] = useState<boolean>(true);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    return gameSettings.subscribe((key, val) => {
      if (key === STORAGE_KEYS.CUSTOM_WEAPON_GRID && val) {
        try {
          setGrid(JSON.parse(val));
        } catch {
          // ignore
        }
      }
    });
  }, []);

  // Canvas vẽ & Live Preview refs
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [weaponDataUrl, setWeaponDataUrl] = useState<string>('');

  // Chuyển đổi grid thành dataURL ảnh 32x32
  const generateDataUrl = (currentGrid: string[][]): string => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.imageSmoothingEnabled = false;

    for (let r = 0; r < 32; r++) {
      for (let c = 0; c < 32; c++) {
        const color = currentGrid[r]?.[c];
        if (color) {
          ctx.fillStyle = color;
          ctx.fillRect(c, r, 1, 1);
        }
      }
    }
    return canvas.toDataURL('image/png');
  };

  useEffect(() => {
    const url = generateDataUrl(grid);
    setWeaponDataUrl(url);
  }, [grid]);

  // Hoạt ảnh preview Người Vượn cầm gậy 12 FPS
  useEffect(() => {
    const fps = 12;
    const frameCount = previewClip === 'walk' ? 8 : 8;
    const interval = setInterval(() => {
      setPreviewFrameIdx((prev) => (prev + 1) % frameCount);
    }, 1000 / fps);
    return () => clearInterval(interval);
  }, [previewClip]);

  // Vẽ mô hình Người Vượn + Cây gậy 32x32 bám Hand Socket lên previewCanvas
  useEffect(() => {
    const cvs = previewCanvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cvs.width, cvs.height);

    // Vẽ nền sàn giả lập
    const groundY = cvs.height - 40;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.fillRect(0, groundY, cvs.width, cvs.height - groundY);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(cvs.width, groundY);
    ctx.stroke();

    // Bóng elip Người Vượn
    const centerX = cvs.width / 2;
    const centerY = groundY - 10;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + 10, 32, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Lấy frame Người Vượn từ SpriteLoader hoặc vẽ Chibi
    const tex = spriteLoader.getFrameTexture('stone_melee', previewClip, previewFrameIdx);
    const walkBounce = previewClip === 'walk' ? Math.abs(Math.sin((previewFrameIdx / 8) * Math.PI)) * 4 : 0;
    const lungeX = previewClip === 'attack' ? Math.sin((previewFrameIdx / 8) * Math.PI) * 16 : 0;
    const actualUnitY = centerY - walkBounce;
    const actualUnitX = centerX + lungeX;

    // Vẽ nhân vật Người Vượn
    const unitH = 95;
    if (tex && tex.source) {
      // Vẽ sprite từ texture nếu có
      const imgSource = (tex.source as any).resource || (tex.source as any);
      if (imgSource && imgSource.width) {
        ctx.save();
        ctx.translate(actualUnitX, actualUnitY);
        const scale = unitH / (tex.height || 256);
        ctx.scale(scale, scale);
        ctx.drawImage(imgSource, -(tex.width || 256) * 0.5, -(tex.height || 256) * 0.9);
        ctx.restore();
      }
    } else {
      // Chibi Người Vượn Vector Pixel fallback
      ctx.fillStyle = '#78350f'; // Thân
      ctx.fillRect(actualUnitX - 18, actualUnitY - 50, 36, 40);
      ctx.fillStyle = '#d97706'; // Đầu
      ctx.beginPath();
      ctx.arc(actualUnitX, actualUnitY - 60, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a'; // Mắt
      ctx.fillRect(actualUnitX + 4, actualUnitY - 64, 4, 4);
    }

    // ==========================================
    // VẼ CÂY GẬY 32x32 GẮN CHUẨN HAND SOCKET
    // ==========================================
    if (weaponDataUrl) {
      const weaponImg = new Image();
      weaponImg.src = weaponDataUrl;
      if (weaponImg.complete) {
        ctx.save();

        let handX = actualUnitX + 16;
        let handY = actualUnitY - unitH * 0.44;
        let handRot = -0.2 + Math.sin((previewFrameIdx / 8) * Math.PI) * 0.15;

        if (previewClip === 'attack') {
          const swingProg = previewFrameIdx / 8;
          handX = actualUnitX + 18 + lungeX * 0.5;
          handY = actualUnitY - unitH * (0.42 - Math.sin(swingProg * Math.PI) * 0.14);
          handRot = -0.95 + swingProg * 2.3;
        }

        ctx.translate(handX, handY);
        ctx.rotate(handRot);

        // Kích thước vũ khí 32x32 scale lên ~36px
        const wSize = 38;
        // Điểm neo chuôi gậy ở góc (0.2, 0.85)
        ctx.drawImage(weaponImg, -wSize * 0.2, -wSize * 0.85, wSize, wSize);
        ctx.restore();
      }
    }
  }, [previewClip, previewFrameIdx, weaponDataUrl]);

  // Thao tác vẽ trên lưới 32x32
  const handlePixelAction = (r: number, c: number) => {
    if (r < 0 || r >= 32 || c < 0 || c >= 32) return;

    if (activeTool === 'BUCKET') {
      // Flood Fill thuật toán tô màu vùng
      const targetColor = grid[r]?.[c] || '';
      const fillC = selectedColor;
      if (targetColor === fillC) return;

      const newGrid = grid.map((row) => [...row]);
      const queue: [number, number][] = [[r, c]];
      const visited = new Set<string>();

      while (queue.length > 0) {
        const [cr, cc] = queue.pop()!;
        const key = `${cr},${cc}`;
        if (visited.has(key)) continue;
        visited.add(key);

        if (cr < 0 || cr >= 32 || cc < 0 || cc >= 32) continue;
        if ((newGrid[cr]?.[cc] || '') !== targetColor) continue;

        newGrid[cr]![cc] = fillC;
        queue.push([cr + 1, cc], [cr - 1, cc], [cr, cc + 1], [cr, cc - 1]);
      }
      setGrid(newGrid);
      return;
    }

    const newColor = activeTool === 'ERASER' ? '' : selectedColor;
    if (grid[r]?.[c] === newColor) return;

    setGrid((prev) => {
      const next = prev.map((row) => [...row]);
      next[r]![c] = newColor;
      return next;
    });
  };

  // Lưu vũ khí và gắn cho Người Vượn
  const handleSaveAndEquip = () => {
    // Kiểm tra lớp kiểm duyệt cơ bản
    let filledPixels = 0;
    for (let r = 0; r < 32; r++) {
      for (let c = 0; c < 32; c++) {
        if (grid[r]?.[c]) filledPixels++;
      }
    }

    if (filledPixels < 5) {
      setToastMsg('⚠️ Vũ khí cần ít nhất vài nét vẽ pixel trước khi lưu!');
      setTimeout(() => setToastMsg(null), 2500);
      return;
    }

    const dataUrl = generateDataUrl(grid);
    gameSettings.setCustomWeaponGrid(JSON.stringify(grid));
    gameSettings.setCustomWeapon(dataUrl);

    setToastMsg('✅ ĐÃ LƯU & GẮN GẬY MỚI CHO NGƯỜI VƯỢN THÀNH CÔNG!');
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleResetTemplate = () => {
    setGrid(createDefaultClubTemplate());
    setToastMsg('🔄 Đã nạp lại cây gậy gỗ mẫu!');
    setTimeout(() => setToastMsg(null), 2000);
  };

  const handleClearAll = () => {
    setGrid(Array.from({ length: 32 }, () => Array(32).fill('')));
    setToastMsg('🗑️ Đã xóa toàn bộ lưới vẽ!');
    setTimeout(() => setToastMsg(null), 2000);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: '#090d16',
        color: '#f8fafc',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* 1. THANH TIÊU ĐỀ TỐI GIẢN (HEADER) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 24px',
          background: 'rgba(15, 23, 42, 0.85)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '24px' }}>🎨</span>
          <div>
            <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#f8fafc' }}>
              XƯỞNG TÙY BIẾN VŨ KHÍ PIXEL (32x32)
            </h1>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              Tự vẽ vũ khí gậy pixel gắn trực tiếp vào Người Vượn Tiền Sử • Giữ nguyên stats chiến đấu
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Lớp kiểm duyệt Live */}
          <button
            type="button"
            onClick={() => setLiveSafeMode(!liveSafeMode)}
            style={{
              background: liveSafeMode ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.04)',
              color: liveSafeMode ? '#34d399' : '#94a3b8',
              border: 'none',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            🛡️ Live Stream Safe: {liveSafeMode ? 'BẬT' : 'TẮT'}
          </button>

          {/* Nút thoát về trận đấu */}
          <button
            type="button"
            onClick={onBackToGame}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              color: '#f8fafc',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
          >
            ← Trở Về Trận Đấu
          </button>
        </div>
      </div>

      {/* TOAST THÔNG BÁO NHẸ */}
      {toastMsg && (
        <div
          style={{
            position: 'absolute',
            top: '64px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '12px',
            padding: '8px 20px',
            fontSize: '13px',
            fontWeight: 800,
            color: '#38bdf8',
            zIndex: 100,
          }}
        >
          {toastMsg}
        </div>
      )}

      {/* 2. NỘI DUNG 2 CỘT TỐI GIẢN */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr',
          padding: '16px 24px',
          gap: '20px',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        {/* CỘT TRÁI: LƯỚI VẼ PIXEL 32x32 & THANH CÔNG CỤ */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Thanh công cụ vẽ tối giản */}
          <div
            style={{
              display: 'flex',
              gap: '6px',
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: '10px',
              padding: '4px',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTool('PENCIL')}
              style={{
                background: activeTool === 'PENCIL' ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
                color: activeTool === 'PENCIL' ? '#60a5fa' : '#94a3b8',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ✏️ Bút Vẽ
            </button>
            <button
              type="button"
              onClick={() => setActiveTool('ERASER')}
              style={{
                background: activeTool === 'ERASER' ? 'rgba(239, 68, 68, 0.3)' : 'transparent',
                color: activeTool === 'ERASER' ? '#f87171' : '#94a3b8',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              🧹 Tẩy
            </button>
            <button
              type="button"
              onClick={() => setActiveTool('BUCKET')}
              style={{
                background: activeTool === 'BUCKET' ? 'rgba(245, 158, 11, 0.3)' : 'transparent',
                color: activeTool === 'BUCKET' ? '#fbbf24' : '#94a3b8',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              🪣 Đổ Màu
            </button>
            <button
              type="button"
              onClick={handleResetTemplate}
              style={{
                background: 'transparent',
                color: '#94a3b8',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
              title="Khôi phục cây gậy gỗ mẫu ban đầu"
            >
              🪵 Gậy Mẫu
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              style={{
                background: 'transparent',
                color: '#ef4444',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
              title="Xóa trắng bảng vẽ"
            >
              🗑️ Xóa Hết
            </button>
          </div>

          {/* Bảng chọn màu 16 màu đồng bộ */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '384px' }}>
            {PIXEL_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setSelectedColor(c);
                  setActiveTool('PENCIL');
                }}
                style={{
                  width: '20px',
                  height: '20px',
                  background: c,
                  borderRadius: '4px',
                  border: selectedColor === c && activeTool !== 'ERASER' ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.15)',
                  cursor: 'pointer',
                  transform: selectedColor === c ? 'scale(1.15)' : 'scale(1.0)',
                  transition: 'transform 0.1s ease',
                }}
              />
            ))}
          </div>

          {/* LƯỚI VẼ PIXEL 32x32 CHÍNH */}
          <div
            onMouseDown={() => setIsMouseDown(true)}
            onMouseUp={() => setIsMouseDown(false)}
            onMouseLeave={() => setIsMouseDown(false)}
            style={{
              width: '384px',
              height: '384px',
              background: '#0f172a',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              display: 'grid',
              gridTemplateColumns: 'repeat(32, 1fr)',
              gridTemplateRows: 'repeat(32, 1fr)',
              userSelect: 'none',
              boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.7)',
            }}
          >
            {grid.map((row, r) =>
              row.map((cellColor, c) => (
                <div
                  key={`${r}-${c}`}
                  onMouseDown={() => handlePixelAction(r, c)}
                  onMouseEnter={() => {
                    if (isMouseDown) handlePixelAction(r, c);
                  }}
                  style={{
                    background: cellColor || 'transparent',
                    borderRight: '1px solid rgba(255, 255, 255, 0.03)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                    cursor: 'crosshair',
                  }}
                />
              ))
            )}
          </div>

          {/* NÚT LƯU & GẮN VŨ KHÍ NỔI BẬT */}
          <button
            type="button"
            onClick={handleSaveAndEquip}
            style={{
              width: '384px',
              background: 'linear-gradient(135deg, #059669, #10b981)',
              border: 'none',
              borderRadius: '10px',
              padding: '12px',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 800,
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              boxShadow: '0 4px 16px rgba(16, 185, 129, 0.3)',
            }}
          >
            💾 LƯU & GẮN CHO NGƯỜI VƯỢN
          </button>
        </div>

        {/* CỘT PHẢI: XEM TRƯỚC TRỰC TIẾP (LIVE PREVIEW) */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc' }}>
              👁️ XEM TRƯỚC TRỰC TIẾP (LIVE PREVIEW)
            </span>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
              Cây gậy 32x32 bám chuẩn xác vào bàn tay Người Vượn khi Đi và Đánh
            </div>
          </div>

          {/* Bộ chọn hoạt ảnh Walk vs Attack */}
          <div
            style={{
              display: 'flex',
              gap: '6px',
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: '8px',
              padding: '3px',
            }}
          >
            <button
              type="button"
              onClick={() => setPreviewClip('walk')}
              style={{
                background: previewClip === 'walk' ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
                color: previewClip === 'walk' ? '#60a5fa' : '#94a3b8',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              🚶 Khi Đi (Walk)
            </button>
            <button
              type="button"
              onClick={() => setPreviewClip('attack')}
              style={{
                background: previewClip === 'attack' ? 'rgba(239, 68, 68, 0.3)' : 'transparent',
                color: previewClip === 'attack' ? '#f87171' : '#94a3b8',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ⚔️ Khi Đánh (Attack)
            </button>
          </div>

          {/* Canvas Viewport xem trước */}
          <canvas
            ref={previewCanvasRef}
            width={320}
            height={260}
            style={{
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              imageRendering: 'pixelated',
            }}
          />

          {/* Thông tin hiệu năng & Socket specs */}
          <div
            style={{
              width: '320px',
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: '11px',
              color: '#94a3b8',
              lineHeight: '1.6',
            }}
          >
            <div>⚡ <b>Tốc độ render:</b> 60 FPS (Đồng bộ sub-frame)</div>
            <div>🖐️ <b>Hand Socket:</b> Bàn tay Người Vượn [x: +16, y: -42]</div>
            <div>🛡️ <b>Chỉ số:</b> Giữ nguyên 25 ST cận chiến (Không đổi stats)</div>
          </div>
        </div>
      </div>
    </div>
  );
};
