# -*- coding: utf-8 -*-
import sys

new_block = '''  // =========================================================================
  // STUDIO: MOUSE DRAG & RESIZE ENGINE CHO DẢI STRIP VÀ SÂN KHẤU LIVE
  // =========================================================================
  useEffect(() => {
    if (activeTab !== 'MANUAL_STUDIO') return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      if (studioDragRef.current.mode === 'NONE') return;

      const op = studioDragRef.current;
      const clipKey = studioClip === 'walk' ? 'walkFrames' : 'attackFrames';

      if (op.mode === 'DRAG_BASELINE') {
        const canvas = studioStripCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cy = (e.clientY - rect.top) * (220 / rect.height);
        const deltaY = (cy - op.startY) / 2;
        const newBaseline = Math.round(Math.max(50, Math.min(115, op.initialBaseline + deltaY)));
        setStudioUnitConfig((prev) => ({
          ...prev,
          groundBaselineY: newBaseline,
        }));
        setMouseTip('Đang kéo đường sàn đất: Y = ' + newBaseline + 'px');
      } else if (op.mode === 'MOVE_BOX') {
        const canvas = studioStripCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cx = (e.clientX - rect.left) * (688 / rect.width);
        const deltaX = (cx - op.startX) / 2;
        const init = op.initialBox;
        const newX = Math.round(Math.max(0, Math.min(344 - init.w, init.x + deltaX)));
        setStudioUnitConfig((prev) => {
          const updated = [...prev[clipKey]];
          if (updated[op.frameIdx]) {
            updated[op.frameIdx] = { ...updated[op.frameIdx]!, x: newX };
          }
          return { ...prev, [clipKey]: updated };
        });
        setMouseTip('Đang kéo di chuyển Frame ' + (op.frameIdx + 1) + ': X = ' + newX + 'px');
      } else if (op.mode === 'RESIZE_RIGHT') {
        const canvas = studioStripCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cx = (e.clientX - rect.left) * (688 / rect.width);
        const deltaX = (cx - op.startX) / 2;
        const init = op.initialBox;
        const newW = Math.round(Math.max(25, Math.min(344 - init.x, init.w + deltaX)));
        setStudioUnitConfig((prev) => {
          const updated = [...prev[clipKey]];
          if (updated[op.frameIdx]) {
            updated[op.frameIdx] = { ...updated[op.frameIdx]!, w: newW };
          }
          return { ...prev, [clipKey]: updated };
        });
        setMouseTip('Đang kéo mép phải Frame ' + (op.frameIdx + 1) + ': W = ' + newW + 'px (Chống mất 1/5 người)');
      } else if (op.mode === 'RESIZE_LEFT') {
        const canvas = studioStripCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cx = (e.clientX - rect.left) * (688 / rect.width);
        const deltaX = (cx - op.startX) / 2;
        const init = op.initialBox;
        const rightAnchor = init.x + init.w;
        const newX = Math.max(0, Math.min(rightAnchor - 25, Math.round(init.x + deltaX)));
        const newW = rightAnchor - newX;
        setStudioUnitConfig((prev) => {
          const updated = [...prev[clipKey]];
          if (updated[op.frameIdx]) {
            updated[op.frameIdx] = { ...updated[op.frameIdx]!, x: newX, w: newW };
          }
          return { ...prev, [clipKey]: updated };
        });
        setMouseTip('Đang kéo mép trái Frame ' + (op.frameIdx + 1) + ': X = ' + newX + 'px, W = ' + newW + 'px');
      } else if (op.mode === 'DRAG_LIVE_DY') {
        const canvas = studioLiveCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cy = (e.clientY - rect.top) * (320 / rect.height);
        const deltaY = cy - op.startY;
        const init = op.initialBox;
        const newDy = Math.round((init.dy || 0) + deltaY);
        setStudioUnitConfig((prev) => {
          const updated = [...prev[clipKey]];
          if (updated[op.frameIdx]) {
            updated[op.frameIdx] = { ...updated[op.frameIdx]!, dy: newDy };
          }
          return { ...prev, [clipKey]: updated };
        });
        setMouseTip('Đang kéo chân Frame ' + (op.frameIdx + 1) + ' chạm sàn: dy = ' + newDy + 'px');
      }
    };

    const handleWindowMouseUp = () => {
      if (studioDragRef.current.mode !== 'NONE') {
        studioDragRef.current.mode = 'NONE';
        setMouseTip('✅ Đã thả chuột — Tọa độ frame đã được cập nhật thành công!');
      }
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [activeTab, studioClip]);

  const handleStripMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = studioStripCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (688 / rect.width);
    const cy = (e.clientY - rect.top) * (220 / rect.height);

    const baselineScreenY = studioUnitConfig.groundBaselineY * 2;
    // 1. Kiểm tra trúng đường sàn
    if (Math.abs(cy - baselineScreenY) <= 12) {
      studioDragRef.current = {
        mode: 'DRAG_BASELINE',
        startX: cx,
        startY: cy,
        frameIdx: selectedStudioFrameIdx,
        initialBox: { x: 0, y: 0, w: 0, h: 0, dx: 0, dy: 0 },
        initialBaseline: studioUnitConfig.groundBaselineY,
      };
      setMouseTip('↕ Đang kéo nâng/hạ đường sàn: Y = ' + studioUnitConfig.groundBaselineY + 'px');
      return;
    }

    const frames = studioClip === 'walk' ? studioUnitConfig.walkFrames : studioUnitConfig.attackFrames;
    const rowOffset = studioClip === 'walk' ? 0 : 106;

    // Kiểm tra active frame trước
    const checkOrder = [
      selectedStudioFrameIdx,
      ...frames.map((_, i) => i).filter((i) => i !== selectedStudioFrameIdx),
    ];

    for (const i of checkOrder) {
      const fb = frames[i];
      if (!fb) continue;
      const bx = fb.x * 2;
      const by = (fb.y - rowOffset) * 2;
      const bw = fb.w * 2;
      const bh = fb.h * 2;

      if (cy >= by - 12 && cy <= by + bh + 12) {
        // Mép phải
        if (Math.abs(cx - (bx + bw)) <= 12) {
          setSelectedStudioFrameIdx(i);
          studioDragRef.current = {
            mode: 'RESIZE_RIGHT',
            startX: cx,
            startY: cy,
            frameIdx: i,
            initialBox: { ...fb },
            initialBaseline: studioUnitConfig.groundBaselineY,
          };
          setMouseTip('↔ Đang kéo mép phải Frame ' + (i + 1) + ': W = ' + fb.w + 'px');
          return;
        }
        // Mép trái
        if (Math.abs(cx - bx) <= 12) {
          setSelectedStudioFrameIdx(i);
          studioDragRef.current = {
            mode: 'RESIZE_LEFT',
            startX: cx,
            startY: cy,
            frameIdx: i,
            initialBox: { ...fb },
            initialBaseline: studioUnitConfig.groundBaselineY,
          };
          setMouseTip('↔ Đang kéo mép trái Frame ' + (i + 1) + ': X = ' + fb.x + 'px');
          return;
        }
        // Thân frame
        if (cx >= bx && cx <= bx + bw) {
          setSelectedStudioFrameIdx(i);
          studioDragRef.current = {
            mode: 'MOVE_BOX',
            startX: cx,
            startY: cy,
            frameIdx: i,
            initialBox: { ...fb },
            initialBaseline: studioUnitConfig.groundBaselineY,
          };
          setMouseTip('✋ Đang kéo di chuyển vị trí Frame ' + (i + 1) + ': X = ' + fb.x + 'px');
          return;
        }
      }
    }
  };

  const handleStripMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (studioDragRef.current.mode !== 'NONE') return;
    const canvas = studioStripCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (688 / rect.width);
    const cy = (e.clientY - rect.top) * (220 / rect.height);

    const baselineScreenY = studioUnitConfig.groundBaselineY * 2;
    if (Math.abs(cy - baselineScreenY) <= 10) {
      canvas.style.cursor = 'ns-resize';
      setMouseTip('↕ Đường sàn đất (Y=' + studioUnitConfig.groundBaselineY + 'px) — Nhấn giữ chuột để kéo nâng/hạ');
      return;
    }

    const frames = studioClip === 'walk' ? studioUnitConfig.walkFrames : studioUnitConfig.attackFrames;
    const rowOffset = studioClip === 'walk' ? 0 : 106;

    for (let i = 0; i < frames.length; i++) {
      const fb = frames[i]!;
      const bx = fb.x * 2;
      const by = (fb.y - rowOffset) * 2;
      const bw = fb.w * 2;
      const bh = fb.h * 2;

      if (cy >= by - 10 && cy <= by + bh + 10) {
        if (Math.abs(cx - (bx + bw)) <= 10 || Math.abs(cx - bx) <= 10) {
          canvas.style.cursor = 'ew-resize';
          setMouseTip('↔ Mép Frame ' + (i + 1) + ' — Nhấn giữ chuột để kéo co giãn chiều rộng W');
          return;
        }
        if (cx >= bx && cx <= bx + bw) {
          canvas.style.cursor = 'grab';
          setMouseTip('✋ Thân Frame ' + (i + 1) + ' — Nhấn giữ chuột để kéo di chuyển vị trí X');
          return;
        }
      }
    }

    canvas.style.cursor = 'crosshair';
  };

  const handleLiveMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = studioLiveCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cy = (e.clientY - rect.top) * (320 / rect.height);
    const frames = studioClip === 'walk' ? studioUnitConfig.walkFrames : studioUnitConfig.attackFrames;
    const cur = frames[selectedStudioFrameIdx] || frames[0];
    if (!cur) return;

    setStudioLiveFreeze(true);
    studioDragRef.current = {
      mode: 'DRAG_LIVE_DY',
      startX: 0,
      startY: cy,
      frameIdx: selectedStudioFrameIdx,
      initialBox: { ...cur },
      initialBaseline: studioUnitConfig.groundBaselineY,
    };
    setMouseTip('↕ Đang kéo chân Frame ' + (selectedStudioFrameIdx + 1) + ' chạm sàn: dy=' + (cur.dy || 0) + 'px');
  };

  const handleLiveMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (studioDragRef.current.mode !== 'NONE') return;
    const canvas = studioLiveCanvasRef.current;
    if (!canvas) return;
    canvas.style.cursor = 'ns-resize';
    setMouseTip('🖱️ Nhấn giữ và kéo chuột lên/xuống trên nhân vật để chân chạm đúng vạch sàn đất');
  };

  // Vòng lặp vẽ dải Strip gốc và các Bounding Box trên Studio
  useEffect(() => {
    if (activeTab !== 'MANUAL_STUDIO') return;

    const canvas = studioStripCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const sheetSrc = `/concepts/${SHEET_NAME_MAP[selectedAge] || 'prehistoric'}_concept_sheet.jpg`;
    const sheetImg = loadedImagesRef.current.get(sheetSrc);
    if (!sheetImg || !sheetImg.complete) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const colIdx = TYPE_INDEX_MAP[currentUnitConfig.type] || 0;
    const stripX = colIdx * 344;
    const stripY = 542 + (studioClip === 'walk' ? 0 : 106);
    const stripH = studioClip === 'walk' ? 106 : 117;

    // 1. Vẽ dải ảnh gốc (phóng to 2x: 344x110 -> 688x220)
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheetImg, stripX, stripY, 344, stripH, 0, 0, 688, stripH * 2);

    // 2. Vẽ đường sàn đất Ground Baseline Y (màu xanh lục phát quang)
    const baselineScreenY = studioUnitConfig.groundBaselineY * 2;
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(0, baselineScreenY);
    ctx.lineTo(688, baselineScreenY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Huy hiệu giữa đường sàn
    const badgeW = 280;
    const badgeX = (688 - badgeW) / 2;
    ctx.fillStyle = 'rgba(21, 128, 61, 0.9)';
    ctx.fillRect(badgeX, baselineScreenY - 11, badgeW, 22);
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 1;
    ctx.strokeRect(badgeX, baselineScreenY - 11, badgeW, 22);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('↕ KÉO ĐƯỜNG SÀN CHÂN (Baseline Y=' + studioUnitConfig.groundBaselineY + 'px)', 344, baselineScreenY + 4);
    ctx.textAlign = 'left';

    // 3. Vẽ các khung cắt Frame (Bounding Boxes)
    const frames = studioClip === 'walk' ? studioUnitConfig.walkFrames : studioUnitConfig.attackFrames;
    frames.forEach((fb, idx) => {
      const isSel = idx === selectedStudioFrameIdx;
      const bx = fb.x * 2;
      const by = (fb.y - (studioClip === 'walk' ? 0 : 106)) * 2;
      const bw = fb.w * 2;
      const bh = fb.h * 2;

      if (isSel) {
        ctx.fillStyle = 'rgba(250, 204, 21, 0.15)';
        ctx.fillRect(bx, by, bw, bh);

        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 3;
        ctx.strokeRect(bx, by, bw, bh);

        // Tay cầm kéo mép trái
        const handleH = Math.min(36, bh - 10);
        const handleY = by + (bh - handleH) / 2;
        ctx.fillStyle = '#facc15';
        ctx.fillRect(bx - 4, handleY, 8, handleH);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx - 4, handleY, 8, handleH);

        // Tay cầm kéo mép phải
        ctx.fillStyle = '#facc15';
        ctx.fillRect(bx + bw - 4, handleY, 8, handleH);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx + bw - 4, handleY, 8, handleH);

        // Nhãn Frame đang chọn
        const tagText = 'F' + (idx + 1) + ' [X=' + fb.x + ' W=' + fb.w + '] ✋ Kéo | ↔ Giãn';
        ctx.fillStyle = '#facc15';
        ctx.fillRect(bx, Math.max(0, by - 18), 160, 18);
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 10px system-ui';
        ctx.fillText(tagText, bx + 4, Math.max(12, by - 5));
      } else {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx, by, bw, bh);

        ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
        ctx.fillRect(bx, by, 36, 16);
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 10px system-ui';
        ctx.fillText('F' + (idx + 1), bx + 6, by + 12);
      }
    });
  }, [activeTab, selectedAge, currentUnitConfig.type, studioClip, studioUnitConfig, selectedStudioFrameIdx]);

  // Vòng lặp phát animation trực tiếp trên Live Stage Studio
  useEffect(() => {
    if (activeTab !== 'MANUAL_STUDIO') return;

    let animId: number;
    let lastTime = performance.now();
    let timer = 0;
    let frameIdx = 0;

    const canvas = studioLiveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const sheetSrc = `/concepts/${SHEET_NAME_MAP[selectedAge] || 'prehistoric'}_concept_sheet.jpg`;
    const sheetImg = loadedImagesRef.current.get(sheetSrc);

    const renderLive = (time: number) => {
      const dt = Math.min(0.08, (time - lastTime) / 1000);
      lastTime = time;

      const frames = studioClip === 'walk' ? studioUnitConfig.walkFrames : studioUnitConfig.attackFrames;
      const fps = 10 * playbackSpeed;

      if (frames.length > 0 && !studioLiveFreeze) {
        timer += dt;
        if (timer >= 1 / fps) {
          timer -= 1 / fps;
          frameIdx = (frameIdx + 1) % frames.length;
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Nền Grid
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Vạch sàn đất chuẩn
      const groundLineY = 250;
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, groundLineY);
      ctx.lineTo(canvas.width, groundLineY);
      ctx.stroke();

      // Hào quang sàn
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.2)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(0, groundLineY);
      ctx.lineTo(canvas.width, groundLineY);
      ctx.stroke();

      // Bóng đổ
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(canvas.width / 2, groundLineY + 3, 50, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // Vẽ Frame hiện tại từ Concept Sheet
      if (sheetImg && sheetImg.complete && frames.length > 0) {
        const activeIdx = studioLiveFreeze
          ? Math.min(frames.length - 1, Math.max(0, selectedStudioFrameIdx))
          : (frameIdx % frames.length);
        const curBox = frames[activeIdx]!;
        const colIdx = TYPE_INDEX_MAP[currentUnitConfig.type] || 0;
        const sx = colIdx * 344 + curBox.x;
        const sy = 542 + curBox.y;
        const sw = curBox.w;
        const sh = curBox.h;

        const dw = sw * studioUnitConfig.scale;
        const dh = sh * studioUnitConfig.scale;

        const centerX = canvas.width / 2;
        const drawX = centerX - dw / 2 + (curBox.dx || 0);
        // Canh chân chạm đúng groundLineY dựa trên groundBaselineY và dy
        const baselineOffset = (curBox.y - (studioClip === 'walk' ? 0 : 106));
        const footYFromTop = studioUnitConfig.groundBaselineY - baselineOffset;
        const drawY = groundLineY - footYFromTop * studioUnitConfig.scale + (curBox.dy || 0);

        try {
          ctx.drawImage(sheetImg, sx, sy, sw, sh, drawX, drawY, dw, dh);
        } catch {
          // ignore
        }

        // Vẽ đường crosshair chân và nhãn trạng thái
        if (studioLiveFreeze) {
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 2]);
          ctx.beginPath();
          ctx.moveTo(centerX - 40, groundLineY + (curBox.dy || 0));
          ctx.lineTo(centerX + 40, groundLineY + (curBox.dy || 0));
          ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.fillStyle = studioLiveFreeze ? '#facc15' : '#38bdf8';
        ctx.font = 'bold 13px system-ui';
        const statusText = studioLiveFreeze
          ? '⏸️ ĐÓNG BĂNG FRAME ' + (activeIdx + 1) + ' (dy=' + (curBox.dy || 0) + 'px) — Kéo chuột để chạm sàn'
          : '▶️ Đang phát: Frame ' + (activeIdx + 1) + ' / ' + frames.length;
        ctx.fillText(statusText, 16, 28);
      }

      animId = requestAnimationFrame(renderLive);
    };

    animId = requestAnimationFrame(renderLive);
    return () => cancelAnimationFrame(animId);
  }, [activeTab, selectedAge, currentUnitConfig.type, studioClip, studioUnitConfig, playbackSpeed, studioLiveFreeze, selectedStudioFrameIdx]);
'''

with open('apps/game/src/ui/PreviewGallery.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

start_marker = '  // =========================================================================\n  // STUDIO: MOUSE DRAG & RESIZE ENGINE CHO DẢI STRIP VÀ SÂN KHẤU LIVE'
end_marker = '  const handleSelectAge = (ageId: number) => {'

idx_start = text.find(start_marker)
idx_end = text.find(end_marker)
assert idx_start != -1 and idx_end != -1, f"Markers not found: {idx_start}, {idx_end}"

text = text[:idx_start] + new_block + '\n\n' + text[idx_end:]

with open('apps/game/src/ui/PreviewGallery.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print('Cleanly replaced canvas block!')
