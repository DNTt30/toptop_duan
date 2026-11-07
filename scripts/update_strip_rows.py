# -*- coding: utf-8 -*-
with open('apps/game/src/ui/PreviewGallery.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace rowOffset calculations
# 1. In handleWindowMouseMove:
old_window_move = """      const op = studioDragRef.current;
      const clipKey = studioClip === 'walk' ? 'walkFrames' : 'attackFrames';
      const rowOffset = studioClip === 'walk' ? 0 : 106;"""

new_window_move = """      const op = studioDragRef.current;
      const clipKey = studioClip === 'walk' ? 'walkFrames' : 'attackFrames';
      const rowOffset = 0;"""

text = text.replace(old_window_move, new_window_move, 1)

# 2. In handleStripMouseDown:
old_strip_mouse = """    const frames = studioClip === 'walk' ? studioUnitConfig.walkFrames : studioUnitConfig.attackFrames;
    const rowOffset = studioClip === 'walk' ? 0 : 106;"""

new_strip_mouse = """    const frames = studioClip === 'walk' ? studioUnitConfig.walkFrames : studioUnitConfig.attackFrames;
    const rowOffset = 0;"""

text = text.replace(old_strip_mouse, new_strip_mouse, 1)

# 3. In handleStripMouseMove:
old_strip_move = """    const frames = studioClip === 'walk' ? studioUnitConfig.walkFrames : studioUnitConfig.attackFrames;
    const rowOffset = studioClip === 'walk' ? 0 : 106;
    const tol = 8;"""

new_strip_move = """    const frames = studioClip === 'walk' ? studioUnitConfig.walkFrames : studioUnitConfig.attackFrames;
    const rowOffset = 0;
    const tol = 8;"""

text = text.replace(old_strip_move, new_strip_move, 1)

# 4. In Strip Canvas useEffect:
old_strip_draw = """    const colIdx = TYPE_INDEX_MAP[currentUnitConfig.type] || 0;
    const stripX = colIdx * 344;
    const stripY = 542 + (studioClip === 'walk' ? 0 : 106);
    const stripH = studioClip === 'walk' ? 106 : 117;

    // 1. Vẽ dải ảnh gốc (phóng to 2x: 344x110 -> 688x220)
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheetImg, stripX, stripY, 344, stripH, 0, 0, 688, stripH * 2);"""

new_strip_draw = """    const colIdx = TYPE_INDEX_MAP[currentUnitConfig.type] || 0;
    const stripX = colIdx * 344;
    const rowBaseY = studioClip === 'walk' ? 544 : 620;
    const stripH = studioClip === 'walk' ? 90 : 120;

    // 1. Vẽ dải ảnh gốc (phóng to 2x: 344x120 -> 688x240, lấy trọn vẹn chi tiết vũ khí và chùy vung)
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheetImg, stripX, rowBaseY, 344, stripH, 0, 0, 688, stripH * 2);"""

text = text.replace(old_strip_draw, new_strip_draw, 1)

# In Strip Canvas bx, by:
text = text.replace(
    "const by = (fb.y - (studioClip === 'walk' ? 0 : 106)) * 2;",
    "const by = fb.y * 2;"
)

# 5. In Live Stage useEffect:
old_live_crop = """        const colIdx = TYPE_INDEX_MAP[currentUnitConfig.type] || 0;
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
        const drawY = groundLineY - footYFromTop * studioUnitConfig.scale + (curBox.dy || 0);"""

new_live_crop = """        const colIdx = TYPE_INDEX_MAP[currentUnitConfig.type] || 0;
        const rowBaseY = studioClip === 'walk' ? 544 : 620;
        const sx = colIdx * 344 + curBox.x;
        const sy = rowBaseY + curBox.y;
        const sw = curBox.w;
        const sh = curBox.h;

        const dw = sw * studioUnitConfig.scale;
        const dh = sh * studioUnitConfig.scale;

        const centerX = canvas.width / 2;
        const drawX = centerX - dw / 2 + (curBox.dx || 0);
        const footYFromTop = (studioClip === 'walk' ? 81 : 115) - curBox.y;
        const drawY = groundLineY - footYFromTop * studioUnitConfig.scale + (curBox.dy || 0);"""

text = text.replace(old_live_crop, new_live_crop, 1)

# Also update Strip canvas height attribute to 240
text = text.replace(
    'ref={studioStripCanvasRef}\n                  width={688}\n                  height={220}',
    'ref={studioStripCanvasRef}\n                  width={688}\n                  height={240}'
)

with open('apps/game/src/ui/PreviewGallery.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print("Updated PreviewGallery with 620 Attack strip start and 100% full details!")
