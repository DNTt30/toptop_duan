# -*- coding: utf-8 -*-
import sys

# Load current PreviewGallery.tsx
with open('apps/game/src/ui/PreviewGallery.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Update StudioDragMode type definition
old_drag_type = """  type StudioDragMode = 'NONE' | 'MOVE_BOX' | 'RESIZE_RIGHT' | 'RESIZE_LEFT' | 'DRAG_BASELINE' | 'DRAG_LIVE_DY';"""
new_drag_type = """  type StudioDragMode =
    | 'NONE'
    | 'MOVE_BOX'
    | 'RESIZE_RIGHT'
    | 'RESIZE_LEFT'
    | 'RESIZE_TOP'
    | 'RESIZE_BOTTOM'
    | 'RESIZE_NW'
    | 'RESIZE_NE'
    | 'RESIZE_SW'
    | 'RESIZE_SE'
    | 'DRAG_BASELINE'
    | 'DRAG_LIVE_DY';"""

assert old_drag_type in text, 'old_drag_type not found'
text = text.replace(old_drag_type, new_drag_type, 1)

# 2. Update the canvas mouse handlers and render loops block
start_marker = "  // ========================================================================="
end_marker = "  const handleSelectAge = (ageId: number) => {"

idx_start = text.find(start_marker)
idx_end = text.find(end_marker)
assert idx_start != -1 and idx_end != -1, f"Markers not found: {idx_start}, {idx_end}"

new_canvas_block = '''  // =========================================================================
  // STUDIO: MOUSE DRAG & RESIZE ENGINE CHO DẢI STRIP VÀ SÂN KHẤU LIVE
  // =========================================================================
  useEffect(() => {
    if (activeTab !== 'MANUAL_STUDIO') return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      if (studioDragRef.current.mode === 'NONE') return;

      const op = studioDragRef.current;
      const clipKey = studioClip === 'walk' ? 'walkFrames' : 'attackFrames';
      const rowOffset = studioClip === 'walk' ? 0 : 106;

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
      } else if (op.mode === 'MOVE_BOX') {
        const canvas = studioStripCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cx = (e.clientX - rect.left) * (688 / rect.width);
        const cy = (e.clientY - rect.top) * (220 / rect.height);
        const deltaX = (cx - op.startX) / 2;
        const deltaY = (cy - op.startY) / 2;
        const init = op.initialBox;
        const newX = Math.round(Math.max(0, Math.min(344 - init.w, init.x + deltaX)));
        const newY = Math.round(Math.max(rowOffset, Math.min(rowOffset + 115 - init.h, init.y + deltaY)));
        setStudioUnitConfig((prev) => {
          const updated = [...prev[clipKey]];
          if (updated[op.frameIdx]) {
            updated[op.frameIdx] = { ...updated[op.frameIdx]!, x: newX, y: newY };
          }
          return { ...prev, [clipKey]: updated };
        });
      } else if (op.mode === 'RESIZE_RIGHT') {
        const canvas = studioStripCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cx = (e.clientX - rect.left) * (688 / rect.width);
        const deltaX = (cx - op.startX) / 2;
        const init = op.initialBox;
        const newW = Math.round(Math.max(15, Math.min(344 - init.x, init.w + deltaX)));
        setStudioUnitConfig((prev) => {
          const updated = [...prev[clipKey]];
          if (updated[op.frameIdx]) {
            updated[op.frameIdx] = { ...updated[op.frameIdx]!, w: newW };
          }
          return { ...prev, [clipKey]: updated };
        });
      } else if (op.mode === 'RESIZE_LEFT') {
        const canvas = studioStripCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cx = (e.clientX - rect.left) * (688 / rect.width);
        const deltaX = (cx - op.startX) / 2;
        const init = op.initialBox;
        const rightAnchor = init.x + init.w;
        const newX = Math.max(0, Math.min(rightAnchor - 15, Math.round(init.x + deltaX)));
        const newW = rightAnchor - newX;
        setStudioUnitConfig((prev) => {
          const updated = [...prev[clipKey]];
          if (updated[op.frameIdx]) {
            updated[op.frameIdx] = { ...updated[op.frameIdx]!, x: newX, w: newW };
          }
          return { ...prev, [clipKey]: updated };
        });
      } else if (op.mode === 'RESIZE_BOTTOM') {
        const canvas = studioStripCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cy = (e.clientY - rect.top) * (220 / rect.height);
        const deltaY = (cy - op.startY) / 2;
        const init = op.initialBox;
        const newH = Math.round(Math.max(15, Math.min(115, init.h + deltaY)));
        setStudioUnitConfig((prev) => {
          const updated = [...prev[clipKey]];
          if (updated[op.frameIdx]) {
            updated[op.frameIdx] = { ...updated[op.frameIdx]!, h: newH };
          }
          return { ...prev, [clipKey]: updated };
        });
      } else if (op.mode === 'RESIZE_TOP') {
        const canvas = studioStripCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cy = (e.clientY - rect.top) * (220 / rect.height);
        const deltaY = (cy - op.startY) / 2;
        const init = op.initialBox;
        const bottomAnchor = init.y + init.h;
        const newY = Math.max(rowOffset, Math.min(bottomAnchor - 15, Math.round(init.y + deltaY)));
        const newH = bottomAnchor - newY;
        setStudioUnitConfig((prev) => {
          const updated = [...prev[clipKey]];
          if (updated[op.frameIdx]) {
            updated[op.frameIdx] = { ...updated[op.frameIdx]!, y: newY, h: newH };
          }
          return { ...prev, [clipKey]: updated };
        });
      } else if (op.mode === 'RESIZE_SE') {
        const canvas = studioStripCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cx = (e.clientX - rect.left) * (688 / rect.width);
        const cy = (e.clientY - rect.top) * (220 / rect.height);
        const deltaX = (cx - op.startX) / 2;
        const deltaY = (cy - op.startY) / 2;
        const init = op.initialBox;
        const newW = Math.round(Math.max(15, Math.min(344 - init.x, init.w + deltaX)));
        const newH = Math.round(Math.max(15, Math.min(115, init.h + deltaY)));
        setStudioUnitConfig((prev) => {
          const updated = [...prev[clipKey]];
          if (updated[op.frameIdx]) {
            updated[op.frameIdx] = { ...updated[op.frameIdx]!, w: newW, h: newH };
          }
          return { ...prev, [clipKey]: updated };
        });
      } else if (op.mode === 'RESIZE_SW') {
        const canvas = studioStripCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cx = (e.clientX - rect.left) * (688 / rect.width);
        const cy = (e.clientY - rect.top) * (220 / rect.height);
        const deltaX = (cx - op.startX) / 2;
        const deltaY = (cy - op.startY) / 2;
        const init = op.initialBox;
        const rightAnchor = init.x + init.w;
        const newX = Math.max(0, Math.min(rightAnchor - 15, Math.round(init.x + deltaX)));
        const newW = rightAnchor - newX;
        const newH = Math.round(Math.max(15, Math.min(115, init.h + deltaY)));
        setStudioUnitConfig((prev) => {
          const updated = [...prev[clipKey]];
          if (updated[op.frameIdx]) {
            updated[op.frameIdx] = { ...updated[op.frameIdx]!, x: newX, w: newW, h: newH };
          }
          return { ...prev, [clipKey]: updated };
        });
      } else if (op.mode === 'RESIZE_NE') {
        const canvas = studioStripCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cx = (e.clientX - rect.left) * (688 / rect.width);
        const cy = (e.clientY - rect.top) * (220 / rect.height);
        const deltaX = (cx - op.startX) / 2;
        const deltaY = (cy - op.startY) / 2;
        const init = op.initialBox;
        const bottomAnchor = init.y + init.h;
        const newY = Math.max(rowOffset, Math.min(bottomAnchor - 15, Math.round(init.y + deltaY)));
        const newH = bottomAnchor - newY;
        const newW = Math.round(Math.max(15, Math.min(344 - init.x, init.w + deltaX)));
        setStudioUnitConfig((prev) => {
          const updated = [...prev[clipKey]];
          if (updated[op.frameIdx]) {
            updated[op.frameIdx] = { ...updated[op.frameIdx]!, y: newY, h: newH, w: newW };
          }
          return { ...prev, [clipKey]: updated };
        });
      } else if (op.mode === 'RESIZE_NW') {
        const canvas = studioStripCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cx = (e.clientX - rect.left) * (688 / rect.width);
        const cy = (e.clientY - rect.top) * (220 / rect.height);
        const deltaX = (cx - op.startX) / 2;
        const deltaY = (cy - op.startY) / 2;
        const init = op.initialBox;
        const rightAnchor = init.x + init.w;
        const bottomAnchor = init.y + init.h;
        const newX = Math.max(0, Math.min(rightAnchor - 15, Math.round(init.x + deltaX)));
        const newW = rightAnchor - newX;
        const newY = Math.max(rowOffset, Math.min(bottomAnchor - 15, Math.round(init.y + deltaY)));
        const newH = bottomAnchor - newY;
        setStudioUnitConfig((prev) => {
          const updated = [...prev[clipKey]];
          if (updated[op.frameIdx]) {
            updated[op.frameIdx] = { ...updated[op.frameIdx]!, x: newX, w: newW, y: newY, h: newH };
          }
          return { ...prev, [clipKey]: updated };
        });
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
      }
    };

    const handleWindowMouseUp = () => {
      if (studioDragRef.current.mode !== 'NONE') {
        studioDragRef.current.mode = 'NONE';
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
    if (Math.abs(cy - baselineScreenY) <= 8) {
      studioDragRef.current = {
        mode: 'DRAG_BASELINE',
        startX: cx,
        startY: cy,
        frameIdx: selectedStudioFrameIdx,
        initialBox: { x: 0, y: 0, w: 0, h: 0, dx: 0, dy: 0 },
        initialBaseline: studioUnitConfig.groundBaselineY,
      };
      return;
    }

    const frames = studioClip === 'walk' ? studioUnitConfig.walkFrames : studioUnitConfig.attackFrames;
    const rowOffset = studioClip === 'walk' ? 0 : 106;

    // Kiểm tra active frame trước, sau đó các frame khác
    const checkOrder = [
      selectedStudioFrameIdx,
      ...frames.map((_, i) => i).filter((i) => i !== selectedStudioFrameIdx),
    ];

    const tol = 8;
    for (const i of checkOrder) {
      const fb = frames[i];
      if (!fb) continue;
      const bx = fb.x * 2;
      const by = (fb.y - rowOffset) * 2;
      const bw = fb.w * 2;
      const bh = fb.h * 2;

      // 4 góc
      if (Math.abs(cx - bx) <= tol && Math.abs(cy - by) <= tol) {
        setSelectedStudioFrameIdx(i);
        studioDragRef.current = { mode: 'RESIZE_NW', startX: cx, startY: cy, frameIdx: i, initialBox: { ...fb }, initialBaseline: studioUnitConfig.groundBaselineY };
        return;
      }
      if (Math.abs(cx - (bx + bw)) <= tol && Math.abs(cy - by) <= tol) {
        setSelectedStudioFrameIdx(i);
        studioDragRef.current = { mode: 'RESIZE_NE', startX: cx, startY: cy, frameIdx: i, initialBox: { ...fb }, initialBaseline: studioUnitConfig.groundBaselineY };
        return;
      }
      if (Math.abs(cx - bx) <= tol && Math.abs(cy - (by + bh)) <= tol) {
        setSelectedStudioFrameIdx(i);
        studioDragRef.current = { mode: 'RESIZE_SW', startX: cx, startY: cy, frameIdx: i, initialBox: { ...fb }, initialBaseline: studioUnitConfig.groundBaselineY };
        return;
      }
      if (Math.abs(cx - (bx + bw)) <= tol && Math.abs(cy - (by + bh)) <= tol) {
        setSelectedStudioFrameIdx(i);
        studioDragRef.current = { mode: 'RESIZE_SE', startX: cx, startY: cy, frameIdx: i, initialBox: { ...fb }, initialBaseline: studioUnitConfig.groundBaselineY };
        return;
      }

      // 4 mép
      if (Math.abs(cy - by) <= tol && cx >= bx - tol && cx <= bx + bw + tol) {
        setSelectedStudioFrameIdx(i);
        studioDragRef.current = { mode: 'RESIZE_TOP', startX: cx, startY: cy, frameIdx: i, initialBox: { ...fb }, initialBaseline: studioUnitConfig.groundBaselineY };
        return;
      }
      if (Math.abs(cy - (by + bh)) <= tol && cx >= bx - tol && cx <= bx + bw + tol) {
        setSelectedStudioFrameIdx(i);
        studioDragRef.current = { mode: 'RESIZE_BOTTOM', startX: cx, startY: cy, frameIdx: i, initialBox: { ...fb }, initialBaseline: studioUnitConfig.groundBaselineY };
        return;
      }
      if (Math.abs(cx - bx) <= tol && cy >= by - tol && cy <= by + bh + tol) {
        setSelectedStudioFrameIdx(i);
        studioDragRef.current = { mode: 'RESIZE_LEFT', startX: cx, startY: cy, frameIdx: i, initialBox: { ...fb }, initialBaseline: studioUnitConfig.groundBaselineY };
        return;
      }
      if (Math.abs(cx - (bx + bw)) <= tol && cy >= by - tol && cy <= by + bh + tol) {
        setSelectedStudioFrameIdx(i);
        studioDragRef.current = { mode: 'RESIZE_RIGHT', startX: cx, startY: cy, frameIdx: i, initialBox: { ...fb }, initialBaseline: studioUnitConfig.groundBaselineY };
        return;
      }

      // Thân frame
      if (cx >= bx && cx <= bx + bw && cy >= by && cy <= by + bh) {
        setSelectedStudioFrameIdx(i);
        studioDragRef.current = { mode: 'MOVE_BOX', startX: cx, startY: cy, frameIdx: i, initialBox: { ...fb }, initialBaseline: studioUnitConfig.groundBaselineY };
        return;
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
    if (Math.abs(cy - baselineScreenY) <= 6) {
      canvas.style.cursor = 'ns-resize';
      return;
    }

    const frames = studioClip === 'walk' ? studioUnitConfig.walkFrames : studioUnitConfig.attackFrames;
    const rowOffset = studioClip === 'walk' ? 0 : 106;
    const tol = 8;

    for (let i = 0; i < frames.length; i++) {
      const fb = frames[i]!;
      const bx = fb.x * 2;
      const by = (fb.y - rowOffset) * 2;
      const bw = fb.w * 2;
      const bh = fb.h * 2;

      // 4 góc
      if ((Math.abs(cx - bx) <= tol && Math.abs(cy - by) <= tol) || (Math.abs(cx - (bx + bw)) <= tol && Math.abs(cy - (by + bh)) <= tol)) {
        canvas.style.cursor = 'nwse-resize';
        return;
      }
      if ((Math.abs(cx - (bx + bw)) <= tol && Math.abs(cy - by) <= tol) || (Math.abs(cx - bx) <= tol && Math.abs(cy - (by + bh)) <= tol)) {
        canvas.style.cursor = 'nesw-resize';
        return;
      }

      // 4 mép
      if (Math.abs(cy - by) <= tol || Math.abs(cy - (by + bh)) <= tol) {
        if (cx >= bx - tol && cx <= bx + bw + tol) {
          canvas.style.cursor = 'ns-resize';
          return;
        }
      }
      if (Math.abs(cx - bx) <= tol || Math.abs(cx - (bx + bw)) <= tol) {
        if (cy >= by - tol && cy <= by + bh + tol) {
          canvas.style.cursor = 'ew-resize';
          return;
        }
      }

      // Thân frame
      if (cx >= bx && cx <= bx + bw && cy >= by && cy <= by + bh) {
        canvas.style.cursor = 'move';
        return;
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
  };

  const handleLiveMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (studioDragRef.current.mode !== 'NONE') return;
    const canvas = studioLiveCanvasRef.current;
    if (!canvas) return;
    canvas.style.cursor = 'ns-resize';
  };

  // Vòng lặp vẽ dải Strip gốc và các Bounding Box trên Studio (Gọn gàng, không che khuất hình)
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

    // 2. Đường sàn đất Ground Baseline Y (Thanh mảnh, nhãn góc phải, không che art)
    const baselineScreenY = studioUnitConfig.groundBaselineY * 2;
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, baselineScreenY);
    ctx.lineTo(688, baselineScreenY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#22c55e';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('SÀN: ' + studioUnitConfig.groundBaselineY + 'px', 680, baselineScreenY - 3);
    ctx.textAlign = 'left';

    // 3. Khung cắt Frame (Bounding Boxes với 8 tay cầm nhỏ gọn kiểu Figma/Photoshop)
    const frames = studioClip === 'walk' ? studioUnitConfig.walkFrames : studioUnitConfig.attackFrames;
    frames.forEach((fb, idx) => {
      const isSel = idx === selectedStudioFrameIdx;
      const bx = fb.x * 2;
      const by = (fb.y - (studioClip === 'walk' ? 0 : 106)) * 2;
      const bw = fb.w * 2;
      const bh = fb.h * 2;

      if (isSel) {
        ctx.fillStyle = 'rgba(250, 204, 21, 0.08)';
        ctx.fillRect(bx, by, bw, bh);

        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, bw, bh);

        // 8 tay cầm nhỏ gọn (6x6 px) ở 4 góc và 4 mép
        const sz = 6;
        const hsz = 3;
        const drawHandle = (hx: number, hy: number) => {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(hx - hsz, hy - hsz, sz, sz);
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 1;
          ctx.strokeRect(hx - hsz, hy - hsz, sz, sz);
        };

        // 4 góc
        drawHandle(bx, by);
        drawHandle(bx + bw, by);
        drawHandle(bx, by + bh);
        drawHandle(bx + bw, by + bh);

        // 4 mép
        drawHandle(bx + bw / 2, by);
        drawHandle(bx + bw / 2, by + bh);
        drawHandle(bx, by + bh / 2);
        drawHandle(bx + bw, by + bh / 2);

        // Nhãn kích thước nhỏ gọn góc trên (không che art)
        ctx.fillStyle = '#facc15';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('F' + (idx + 1) + ' [' + fb.w + '×' + fb.h + ']', bx + 2, Math.max(10, by - 4));
      } else {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, bw, bh);

        ctx.fillStyle = 'rgba(56, 189, 248, 0.7)';
        ctx.font = '9px monospace';
        ctx.fillText('F' + (idx + 1), bx + 2, by + 10);
      }
    });
  }, [activeTab, selectedAge, currentUnitConfig.type, studioClip, studioUnitConfig, selectedStudioFrameIdx]);

  // Vòng lặp phát animation trực tiếp trên Live Stage Studio (Gọn gàng)
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
      ctx.lineWidth = 2;
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
        const baselineOffset = (curBox.y - (studioClip === 'walk' ? 0 : 106));
        const footYFromTop = studioUnitConfig.groundBaselineY - baselineOffset;
        const drawY = groundLineY - footYFromTop * studioUnitConfig.scale + (curBox.dy || 0);

        try {
          ctx.drawImage(sheetImg, sx, sy, sw, sh, drawX, drawY, dw, dh);
        } catch {
          // ignore
        }

        // Nhãn góc nhỏ gọn
        ctx.fillStyle = studioLiveFreeze ? '#facc15' : '#38bdf8';
        ctx.font = 'bold 11px monospace';
        const statusText = 'F' + (activeIdx + 1) + ' [' + curBox.w + '×' + curBox.h + ']' + (studioLiveFreeze ? ' (dy=' + (curBox.dy || 0) + ')' : '');
        ctx.fillText(statusText, 12, 20);
      }

      animId = requestAnimationFrame(renderLive);
    };

    animId = requestAnimationFrame(renderLive);
    return () => cancelAnimationFrame(animId);
  }, [activeTab, selectedAge, currentUnitConfig.type, studioClip, studioUnitConfig, playbackSpeed, studioLiveFreeze, selectedStudioFrameIdx]);
'''

text = text[:idx_start] + new_canvas_block + '\n\n' + text[idx_end:]

with open('apps/game/src/ui/PreviewGallery.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print('Updated Canvas & Drag Engine with 8 handles and clean text!')
