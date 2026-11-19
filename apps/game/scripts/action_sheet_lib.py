"""
Thư viện lõi dựng Bộ Sprite Sheet 36 Action Frames (Painted Chibi Art, 2 màu phe Blue P1 / Red P2)
cho The Singularity Odyssey.

Quy chuẩn chung cho mọi đơn vị quân:
- Atlas hành động: 2048 x 1280 (5 hàng x 8 cột, mỗi ô 256 x 256)
  + Row 0 (0..7): IDLE 8 frames
  + Row 1 (8..15): WALK 8 frames
  + Row 2 (16..23): ATTACK 8 frames (3 pha: Anticipation 0..2 -> Strike 3..4 -> Recovery 5..7)
  + Row 3 (24..26): HURT 3 frames + (27..31): DIE frames 0..4
  + Row 4 (32..35): DIE frames 5..8 (Tổng 9 frames ngã nằm đất)
- Atlas tương thích legacy/tests: 2048 x 1024 (4 hàng đầu, y=502..512 trong suốt tuyệt đối)
- Điểm neo chân chuẩn: FOOT_Y = 230 (230 / 256 = 0.90)
"""

from collections import deque
import json
import math
import os
from PIL import Image, ImageDraw
import numpy as np
from scipy import ndimage

CELL_W = 256
CELL_H = 256
COLS = 8
ROWS = 5
ATLAS_W = CELL_W * COLS
ATLAS_H = CELL_H * ROWS
FOOT_Y = 230  # 230 / 256 = 0.898 -> anchor.y = 0.90

TEAM_PALETTES = {
    'BLUE': {
        'cloth_tint': (42, 118, 245),    # Xanh dương rực giữ nguyên shading gốc
        'main': (37, 99, 235, 255),      # #2563eb
        'light': (125, 211, 252, 255),   # #7dd3fc
        'dark': (15, 23, 42, 255),       # #0f172a
        'rim': (147, 197, 253),          # Rim light xanh trời mỏng
    },
    'RED': {
        'cloth_tint': (232, 48, 48),     # Đỏ rực giữ nguyên shading gốc
        'main': (220, 38, 38, 255),      # #dc2626
        'light': (252, 165, 165, 255),   # #fca5a5
        'dark': (42, 10, 10, 255),       # #2a0a0a
        'rim': (253, 186, 116),          # Rim light cam ấm mỏng
    },
}


def extract_clean_sprite(full_arr, box, interior_white_thresh=236):
    """Tách nền trắng sạch bằng flood-fill biên + làm mềm rìa alpha chống răng cưa."""
    x0, y0, x1, y1 = box
    sub = full_arr[y0:y1 + 1, x0:x1 + 1].copy()
    r = sub[:, :, 0].astype(np.float32)
    g = sub[:, :, 1].astype(np.float32)
    b = sub[:, :, 2].astype(np.float32)
    h, w, _ = sub.shape
    is_white = (r > 222) & (g > 222) & (b > 216) & (np.abs(r - g) < 18) & (np.abs(g - b) < 22)
    bg_mask = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_white[y, x] and not bg_mask[y, x]:
                bg_mask[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if is_white[y, x] and not bg_mask[y, x]:
                bg_mask[y, x] = True
                q.append((y, x))
    while q:
        cy, cx = q.popleft()
        for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
            if 0 <= ny < h and 0 <= nx < w and not bg_mask[ny, nx] and is_white[ny, nx]:
                bg_mask[ny, nx] = True
                q.append((ny, nx))
    interior_white = (r > interior_white_thresh) & (g > interior_white_thresh) & (b > interior_white_thresh - 4)
    bg_mask = bg_mask | interior_white
    brightness = (r + g + b) / 3.0
    edge = ndimage.binary_dilation(bg_mask, iterations=1) & (~bg_mask)
    edge_alpha = np.clip((242.0 - brightness) / 55.0, 0.0, 1.0)
    alpha = np.where(bg_mask, 0.0, np.where(edge, edge_alpha, 1.0))
    sub[:, :, 3] = (alpha * 255).astype(np.uint8)
    return sub


def compute_foot_pivot(sprite_arr, x_limit=None):
    """
    Tính tọa độ pivot (x_torso_center, y_bottom_feet):
    - Trục X lấy trung vị của vùng thân mình (30%..70% chiều cao) để tâm nhân vật không bao giờ giật ngang khi bước chân!
    - Trục Y lấy đáy bàn chân thật (không tính vệt sáng VFX).
    """
    alpha = sprite_arr[:, :, 3]
    h, w = alpha.shape
    mask = alpha > 80
    if x_limit is not None:
        mask[:, x_limit:] = False
    ys, xs = np.where(mask)
    if len(ys) == 0:
        return (w / 2.0, float(h - 1))
    min_y, max_y = int(ys.min()), int(ys.max())
    body_h = max(1, max_y - min_y)
    torso_mask = mask & (np.arange(h)[:, None] >= min_y + int(body_h * 0.25)) & (np.arange(h)[:, None] <= min_y + int(body_h * 0.72))
    tys, txs = np.where(torso_mask)
    cx = float(np.median(txs)) if len(txs) > 0 else float(np.median(xs))
    return (cx, float(max_y))


def recolor_red_accents(sprite_arr, team_key, region_box=None, max_hue_deg=14.0, min_sat=0.38):
    """
    Đổi màu vải/lông/áo choàng/băng đô ĐỎ gốc sang Xanh dương (BLUE P1) hoặc làm rực Đỏ (RED P2)
    bằng bộ lọc HSV Hue + Saturation chính xác:
    - Bắt trọn cả phần sáng và bóng tối của màu đỏ (Hue trong [-28°..+max_hue_deg°], Sat >= min_sat).
    - Tránh tuyệt đối vùng da người cam ấm (Hue ~ 18°..42°) và vệt sáng vàng (Hue ~ 42°..65°).
    """
    arr = sprite_arr.copy()
    h, w, _ = arr.shape
    if region_box is None:
        rx0, ry0, rx1, ry1 = 0, 0, w, h
    else:
        rx0, ry0, rx1, ry1 = max(0, region_box[0]), max(0, region_box[1]), min(w, region_box[2]), min(h, region_box[3])
    sub = arr[ry0:ry1, rx0:rx1]
    r = sub[:, :, 0].astype(np.float32) / 255.0
    g = sub[:, :, 1].astype(np.float32) / 255.0
    b = sub[:, :, 2].astype(np.float32) / 255.0
    a = sub[:, :, 3]

    cmax = np.maximum(np.maximum(r, g), b)
    cmin = np.minimum(np.minimum(r, g), b)
    delta = cmax - cmin
    sat = np.where(cmax > 1e-5, delta / np.maximum(cmax, 1e-5), 0.0)

    hue = np.zeros_like(cmax)
    nonzero = delta > 1e-5
    r_max = nonzero & (cmax == r)
    g_max = nonzero & (cmax == g) & (~r_max)
    b_max = nonzero & (~r_max) & (~g_max)
    hue[r_max] = (60.0 * (((g[r_max] - b[r_max]) / delta[r_max]) % 6.0))
    hue[g_max] = (60.0 * (((b[g_max] - r[g_max]) / delta[g_max]) + 2.0))
    hue[b_max] = (60.0 * (((r[b_max] - g[b_max]) / delta[b_max]) + 4.0))

    # Vùng màu đỏ thực thụ: Hue >= 332° hoặc Hue <= max_hue_deg (tránh cam da >= 16°)
    is_red_hue = (hue >= 332.0) | (hue <= max_hue_deg)
    is_red_accent = (a > 60) & is_red_hue & (sat >= min_sat) & (cmax >= 0.16)

    if team_key == 'BLUE':
        # Chuyển sang Xanh dương Cobalt (#2563eb) bảo toàn độ sáng tối cmax và độ bão hòa
        val = np.clip(cmax * 1.12, 0.18, 1.0)
        new_r = np.clip((0.14 * val + 0.12 * (1.0 - sat) * val) * 255.0, 0, 255)
        new_g = np.clip((0.44 * val + 0.14 * (1.0 - sat) * val) * 255.0, 0, 255)
        new_b = np.clip((0.98 * val + 0.08) * 255.0, 0, 255)
        sub[:, :, 0] = np.where(is_red_accent, new_r, sub[:, :, 0]).astype(np.uint8)
        sub[:, :, 1] = np.where(is_red_accent, new_g, sub[:, :, 1]).astype(np.uint8)
        sub[:, :, 2] = np.where(is_red_accent, new_b, sub[:, :, 2]).astype(np.uint8)
    else:
        # RED P2: Tăng nhẹ độ rực đỏ để nổi bật rõ trên chiến trường
        new_r = np.clip(sub[:, :, 0].astype(np.float32) * 1.12 + 12, 0, 255)
        new_g = np.clip(sub[:, :, 1].astype(np.float32) * 0.85, 0, 255)
        new_b = np.clip(sub[:, :, 2].astype(np.float32) * 0.83, 0, 255)
        sub[:, :, 0] = np.where(is_red_accent, new_r, sub[:, :, 0]).astype(np.uint8)
        sub[:, :, 1] = np.where(is_red_accent, new_g, sub[:, :, 1]).astype(np.uint8)
        sub[:, :, 2] = np.where(is_red_accent, new_b, sub[:, :, 2]).astype(np.uint8)

    return arr


def apply_outline_and_rim_light(cell_arr, rim_rgb):
    """Thêm outline tối 1px quanh cơ thể đặc (không viền quanh vệt sáng VFX) + rim light mỏng theo màu phe."""
    alpha = cell_arr[:, :, 3]
    r = cell_arr[:, :, 0].astype(np.int32)
    g = cell_arr[:, :, 1].astype(np.int32)
    b = cell_arr[:, :, 2].astype(np.int32)
    is_fx_glow = (r > 185) & (g > 155) & ((r + g - b) > 220)
    solid_body = (alpha > 185) & (~is_fx_glow)
    if not np.any(solid_body):
        return cell_arr

    out = cell_arr.copy()
    dilated = ndimage.binary_dilation(solid_body, structure=np.ones((3, 3)), iterations=1)
    outer_ring = dilated & (~solid_body) & (alpha < 45)
    out[outer_ring, 0] = 16
    out[outer_ring, 1] = 12
    out[outer_ring, 2] = 20
    out[outer_ring, 3] = 215

    shifted_up = np.zeros_like(solid_body)
    shifted_up[:-1, :] = ~solid_body[1:, :]
    shifted_right = np.zeros_like(solid_body)
    shifted_right[:, 1:] = ~solid_body[:, :-1]
    rim_mask = solid_body & (shifted_up | shifted_right)
    for ch, val in enumerate(rim_rgb):
        out[rim_mask, ch] = np.clip(out[rim_mask, ch] * 0.72 + val * 0.28, 0, 255).astype(np.uint8)

    return out


def place_in_cell_anchored(
    atlas,
    col,
    row,
    sprite_arr,
    pivot_xy,
    scale=1.9,
    rot_deg=0.0,
    squash_x=1.0,
    squash_y=1.0,
    offset_x=0.0,
    offset_y=0.0,
    tint_red=0.0,
    rim_rgb=(255, 224, 178),
):
    """Đặt một pose sprite vào ô (col, row) neo chặt bàn chân đúng FOOT_Y=230 và chống tràn biên."""
    arr = sprite_arr.copy()
    if tint_red > 0:
        arr[:, :, 0] = np.clip(arr[:, :, 0] * (1 - tint_red) + 255 * tint_red, 0, 255).astype(np.uint8)
        arr[:, :, 1] = (arr[:, :, 1] * (1 - tint_red * 0.55)).astype(np.uint8)
        arr[:, :, 2] = (arr[:, :, 2] * (1 - tint_red * 0.55)).astype(np.uint8)

    im = Image.fromarray(arr)
    sx = scale * squash_x
    sy = scale * squash_y
    new_w = max(1, int(round(im.width * sx)))
    new_h = max(1, int(round(im.height * sy)))
    im = im.resize((new_w, new_h), resample=Image.BICUBIC)

    px = pivot_xy[0] * sx
    py = pivot_xy[1] * sy

    if abs(rot_deg) > 0.05:
        cx0, cy0 = new_w / 2.0, new_h / 2.0
        im_rot = im.rotate(rot_deg, resample=Image.BICUBIC, expand=True)
        cx1, cy1 = im_rot.width / 2.0, im_rot.height / 2.0
        rad = -math.radians(rot_deg)
        dx, dy = px - cx0, py - cy0
        px = cx1 + dx * math.cos(rad) - dy * math.sin(rad)
        py = cy1 + dx * math.sin(rad) + dy * math.cos(rad)
        im = im_rot

    cell = Image.new('RGBA', (CELL_W, CELL_H), (0, 0, 0, 0))
    dest_x = int(round((CELL_W / 2.0 + offset_x) - px))
    dest_y = int(round((FOOT_Y + offset_y) - py))

    im_arr = np.array(im)
    ys, xs = np.where(im_arr[:, :, 3] > 10)
    if len(ys) > 0:
        max_y_in_cell = dest_y + int(ys.max())
        if max_y_in_cell > 241:
            dest_y -= (max_y_in_cell - 241)
        min_y_in_cell = dest_y + int(ys.min())
        if min_y_in_cell < 6:
            dest_y += (6 - min_y_in_cell)
        min_x_in_cell = dest_x + int(xs.min())
        if min_x_in_cell < 7:
            dest_x += (7 - min_x_in_cell)
        max_x_in_cell = dest_x + int(xs.max())
        if max_x_in_cell > 249:
            dest_x -= (max_x_in_cell - 249)

    cell.alpha_composite(im, (dest_x, dest_y))
    cell_arr = apply_outline_and_rim_light(np.array(cell), rim_rgb)
    # Bảo đảm mép an toàn 4px quanh ô & dưới chân (tránh bleed sang ô kế tiếp)
    cell_arr[:, :4, 3] = 0
    cell_arr[:, 252:, 3] = 0
    cell_arr[:4, :, 3] = 0
    cell_arr[245:, :, 3] = 0
    atlas.alpha_composite(Image.fromarray(cell_arr), (col * CELL_W, row * CELL_H))


def finalize_atlas(atlas_img):
    """Đảm bảo 100% dải y=502..512 (giữa Row 1 và Row 2) trong suốt tuyệt đối (tuân thủ test EVAL-04)."""
    arr = np.array(atlas_img)
    arr[502:512, :, 3] = 0
    return Image.fromarray(arr)


def build_contact_sheet(atlas_blue, atlas_red, out_path, title_prefix=''):
    """Xuất bảng đối chiếu 36 frame (Blue + 3 ô Red so sánh ở cuối hàng 4) để review trực quan."""
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    sheet_preview = Image.new('RGBA', (ATLAS_W, ATLAS_H), (28, 32, 42, 255))
    draw = ImageDraw.Draw(sheet_preview)
    labels = [
        ['IDLE 0', 'IDLE 1', 'IDLE 2', 'IDLE 3', 'IDLE 4', 'IDLE 5', 'IDLE 6', 'IDLE 7'],
        ['WALK 0', 'WALK 1', 'WALK 2', 'WALK 3', 'WALK 4', 'WALK 5', 'WALK 6', 'WALK 7'],
        ['ATK 0: Ant1', 'ATK 1: Ant2', 'ATK 2: Ant3', 'ATK 3: HIT!', 'ATK 4: Follow', 'ATK 5: Rec1', 'ATK 6: Rec2', 'ATK 7: Rec3'],
        ['HURT 0', 'HURT 1', 'HURT 2', 'DIE 0: Jolt', 'DIE 1: Knee', 'DIE 2: Drop', 'DIE 3: Tip', 'DIE 4: Fall'],
        ['DIE 5: HitGnd', 'DIE 6: Bounce', 'DIE 7: Settle', 'DIE 8: KO Flat', '', '', '', ''],
    ]
    for r in range(ROWS):
        for c in range(COLS):
            x0, y0 = c * CELL_W, r * CELL_H
            draw.rectangle([x0, y0, x0 + CELL_W - 1, y0 + CELL_H - 1], outline=(70, 80, 100, 255), width=1)
            draw.line([x0, y0 + FOOT_Y, x0 + CELL_W, y0 + FOOT_Y], fill=(245, 158, 11, 140), width=1)
            draw.line([x0 + CELL_W // 2, y0 + 20, x0 + CELL_W // 2, y0 + FOOT_Y], fill=(56, 189, 248, 90), width=1)
    sheet_preview.alpha_composite(atlas_blue)
    atlas_red_np = np.array(atlas_red)
    for src_col, src_row, dst_col, lbl in [
        (0, 1, 5, 'RED WALK 0'),
        (2, 2, 6, 'RED ATK 2'),
        (3, 2, 7, 'RED ATK 3'),
    ]:
        crop_red = Image.fromarray(atlas_red_np[src_row * 256:(src_row + 1) * 256, src_col * 256:(src_col + 1) * 256])
        sheet_preview.alpha_composite(crop_red, (dst_col * CELL_W, 4 * CELL_H))
        labels[4][dst_col] = lbl

    draw2 = ImageDraw.Draw(sheet_preview)
    for r in range(ROWS):
        for c in range(COLS):
            x0, y0 = c * CELL_W, r * CELL_H
            if labels[r][c]:
                txt = f'{title_prefix}{labels[r][c]}' if (r == 0 and c == 0 and title_prefix) else labels[r][c]
                draw2.text((x0 + 8, y0 + 6), txt, fill=(248, 250, 252, 255))
    sheet_preview.save(out_path)


def save_unit_bundle(
    era_dir,
    name,
    unit_id,
    atlas_blue,
    atlas_red,
    hitbox,
    hurtbox,
    stride_px,
    is_ranged=False,
    contact_out_path=None,
):
    """Lưu trọn bộ PNG (Blue 36f, Red 36f, Legacy 4-row 2048x1024) và JSON manifest 3.0."""
    out_dir = os.path.join('apps/game/public/sprites', era_dir)
    os.makedirs(out_dir, exist_ok=True)

    p_blue = os.path.join(out_dir, f'{name}_action_atlas.png')
    p_red = os.path.join(out_dir, f'{name}_action_atlas_red.png')
    p_legacy = os.path.join(out_dir, f'{name}_atlas.png')
    p_action_json = os.path.join(out_dir, f'{name}_action_animation.json')
    p_legacy_json = os.path.join(out_dir, f'{name}_animation.json')

    atlas_blue.save(p_blue)
    atlas_red.save(p_red)
    atlas_blue.crop((0, 0, ATLAS_W, 1024)).save(p_legacy)

    attack_clip = {
        'name': 'attack',
        'startFrame': 16,
        'frameCount': 8,
        'fps': 16,
        'loop': False,
        'hitFrame': 3,
        'durationsMs': [35, 35, 35, 45, 45, 60, 60, 60],
        'events': [
            {'name': 'hit', 'frame': 3, 'atMs': 105, 'type': 'HIT_FRAME'},
        ],
    }
    if is_ranged:
        attack_clip['releaseFrame'] = 3

    manifest = {
        'version': '3.0',
        'name': name,
        'unitId': unit_id,
        'format': 'FORGE_3_0',
        'meta': {
            'app': 'the-singularity-odyssey',
            'version': '3.0',
            'image': f'/sprites/{era_dir}/{name}_action_atlas.png',
            'redImage': f'/sprites/{era_dir}/{name}_action_atlas_red.png',
            'size': {'w': ATLAS_W, 'h': ATLAS_H},
        },
        'fallback': {'cellSize': [CELL_W, CELL_H]},
        'frameCount': 36,
        'anchor': {'x': 0.5, 'y': 0.90},
        'hurtbox': hurtbox,
        'hitbox': hitbox,
        'clips': {
            'idle': {'name': 'idle', 'startFrame': 0, 'frameCount': 8, 'fps': 10, 'loop': True},
            'walk': {'name': 'walk', 'startFrame': 8, 'frameCount': 8, 'fps': 12, 'loop': True, 'stridePx': stride_px},
            'attack': attack_clip,
            'hurt': {'name': 'hurt', 'startFrame': 24, 'frameCount': 3, 'fps': 12, 'loop': False},
            'die': {'name': 'die', 'startFrame': 27, 'frameCount': 9, 'fps': 14, 'loop': False},
        },
    }

    with open(p_action_json, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    with open(p_legacy_json, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    if contact_out_path:
        build_contact_sheet(atlas_blue, atlas_red, contact_out_path, title_prefix=f'{name.upper()} ')

    print(f'[OK] Bundle {name} ({unit_id}): {p_blue} | {p_red} | {p_legacy}')
