"""
Generator cho Bộ Sprite Sheet 36 Action Frames chuẩn (Painted Chibi Art) của Caveman:
- Row 0 (0..7): IDLE 8 frames (Thủ thế thở đều)
- Row 1 (8..15): WALK 8 frames (Chu kỳ 2 bước chân đầy đủ, không trùng tư thế, giữ chùy vác vai)
- Row 2 (16..23): ATTACK 8 frames (3 pha: Anticipation 0..2 -> Strike 3..4 -> Recovery 5..7)
- Row 3 (24..26): HURT 3 frames + (27..31): DIE frames 0..4
- Row 4 (32..35): DIE frames 5..8 (Tổng 9 frame ngã: giật lùi -> quỵ gối -> ngã ngửa -> nảy nhẹ -> nằm đất)
- Xuất 2 bản màu phe:
  + caveman_action_atlas.png (2048x1280 - Băng đô & đai lưng Xanh P1 + Outline tối + Rim light)
  + caveman_action_atlas_red.png (2048x1280 - Băng đô & đai lưng Đỏ P2 + Outline tối + Rim light)
  + caveman_atlas.png (2048x1024 - 4 hàng đầu để tương thích test EVAL-04 / BUG-03)
"""

from collections import deque
import math
from PIL import Image, ImageDraw
import numpy as np
from scipy import ndimage

CELL_W = 256
CELL_H = 256
COLS = 8
ROWS = 5
ATLAS_W = CELL_W * COLS
ATLAS_H = CELL_H * ROWS
FOOT_Y = 230  # 230 / 256 = 0.90

CONCEPT_PATH = 'd:/toptop_duan/apps/game/public/concepts/prehistoric_concept_sheet.jpg'
OUT_ACTION_ATLAS_BLUE = 'd:/toptop_duan/apps/game/public/sprites/prehistoric/caveman_action_atlas.png'
OUT_ACTION_ATLAS_RED = 'd:/toptop_duan/apps/game/public/sprites/prehistoric/caveman_action_atlas_red.png'
OUT_MAIN_ATLAS = 'd:/toptop_duan/apps/game/public/sprites/prehistoric/caveman_atlas.png'
OUT_CONTACT = 'C:/Users/duong/.gemini/antigravity/brain/92018906-b2f6-4dc4-963e-109777019bad/scratch/caveman_v2_contact.png'

sheet_im = Image.open(CONCEPT_PATH).convert('RGBA')
sheet_arr = np.array(sheet_im)[500:768, 0:370].copy()


def extract_clean_sprite(box):
    x0, y0, x1, y1 = box
    sub = sheet_arr[y0:y1+1, x0:x1+1].copy()
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
    interior_white = (r > 235) & (g > 235) & (b > 232)
    bg_mask = bg_mask | interior_white
    brightness = (r + g + b) / 3.0
    edge = ndimage.binary_dilation(bg_mask, iterations=1) & (~bg_mask)
    edge_alpha = np.clip((242.0 - brightness) / 55.0, 0.0, 1.0)
    alpha = np.where(bg_mask, 0.0, np.where(edge, edge_alpha, 1.0))
    sub[:, :, 3] = (alpha * 255).astype(np.uint8)
    return sub


W0_BASE = extract_clean_sprite((54, 45, 119, 125))
W1_BASE = extract_clean_sprite((131, 46, 192, 125))
W2_BASE = extract_clean_sprite((205, 46, 262, 125))
W3_BASE = extract_clean_sprite((272, 45, 338, 125))
A1_BASE = extract_clean_sprite((42, 137, 127, 234))
A2_BASE = extract_clean_sprite((145, 146, 245, 236))
A3_BASE = extract_clean_sprite((253, 146, 356, 233))

PIVOT_W0 = (38.6, 80.0)
PIVOT_W1 = (35.0, 79.0)
PIVOT_W2 = (30.4, 79.0)
PIVOT_W3 = (36.1, 80.0)
PIVOT_A1 = (46.7, 96.0)
PIVOT_A2 = (38.1, 89.0)
PIVOT_A3 = (37.2, 87.0)

# Tách A2_coil & ghép chân trụ W0 vào
a2_r, a2_g, a2_b = A2_BASE[:, :, 0].astype(int), A2_BASE[:, :, 1].astype(int), A2_BASE[:, :, 2].astype(int)
yy2, xx2 = np.mgrid[0:A2_BASE.shape[0], 0:A2_BASE.shape[1]]
body_right_x = np.where(yy2 < 18, 46, np.where(yy2 < 68, 56, 51))
is_a2_wave = (
    (xx2 > body_right_x)
    | ((xx2 >= 42) & (yy2 < 22) & (a2_r > 165) & (a2_g > 125))
    | ((xx2 >= 38) & (yy2 >= 80) & (a2_r > 175) & (a2_g > 135))
)
A2_coil_raw = A2_BASE.copy()
A2_coil_raw[is_a2_wave, 3] = 0

a2_canvas = Image.new('RGBA', (101, 91), (0, 0, 0, 0))
w0_legs = W0_BASE.copy()
w0_legs[:43, :, 3] = 0
w0_legs[:56, :24, 3] = 0
w0_legs[:58, 46:, 3] = 0
a2_canvas.alpha_composite(Image.fromarray(w0_legs), (0, 9))
a2_upper = A2_coil_raw.copy()
a2_upper[56:, :, 3] = 0
a2_canvas.alpha_composite(Image.fromarray(a2_upper), (0, 0))
A2_COIL_BASE = np.array(a2_canvas)

# Tách A3 thành A3_clean & A3_with_wave & A3_faded_slash
a3_r, a3_g, a3_b = A3_BASE[:, :, 0].astype(int), A3_BASE[:, :, 1].astype(int), A3_BASE[:, :, 2].astype(int)
yy3, xx3 = np.mgrid[0:A3_BASE.shape[0], 0:A3_BASE.shape[1]]
y_club_center = 50.0 - (xx3 - 52.0) * 0.48
dist_from_club = np.abs(yy3 - y_club_center)
in_a3_body = (xx3 < 52) & (yy3 >= 16)
is_slash_bright = (a3_r > 168) & (a3_g > 122) & ((a3_r - a3_b) > 35)
in_a3_club = (xx3 >= 48) & (xx3 <= 95) & (dist_from_club <= 9.5) & (~is_slash_bright)
keep_a3 = ndimage.binary_closing(in_a3_body | in_a3_club, structure=np.ones((2, 2)))
keep_a3[:16, :] = False
A3_CLEAN_BASE = A3_BASE.copy()
A3_CLEAN_BASE[~keep_a3, 3] = 0

A2_wave = A2_BASE.copy()
A2_wave[~is_a2_wave, 3] = 0
A3_impact = np.zeros((94, 108, 4), dtype=np.uint8)
p_im = Image.fromarray(A3_impact)
p_im.alpha_composite(Image.fromarray(A3_CLEAN_BASE), (0, 4))
wave_crop = A2_wave[:, 52:, :].copy()
p_im.alpha_composite(Image.fromarray(wave_crop), (52, 2))
A3_WAVE_BASE = np.array(p_im)
PIVOT_A3_WAVE = (PIVOT_A3[0], PIVOT_A3[1] + 4.0)

A3_FADED_BASE = A3_BASE.copy()
slash_only = ~keep_a3
A3_FADED_BASE[slash_only, 3] = (A3_FADED_BASE[slash_only, 3].astype(np.float32) * 0.42).astype(np.uint8)

# Tách riêng cây chùy gai gỗ (A1_club)
A1_club = A1_BASE[:50, :44].copy()
yy1, xx1 = np.mgrid[0:50, 0:44]
A1_club[(xx1 > 20) & (yy1 > 32), 3] = 0
A1_club_im = Image.fromarray(A1_club)


TEAM_PALETTES = {
    'BLUE': {
        'cloth_tint': (42, 118, 245),    # Xanh dương rực giữ nguyên shading gốc của khố & vòng tay
        'main': (37, 99, 235, 255),      # #2563eb
        'light': (125, 211, 252, 255),   # #7dd3fc
        'dark': (15, 23, 42, 255),       # #0f172a
        'rim': (147, 197, 253),          # Rim light xanh trời mỏng
    },
    'RED': {
        'cloth_tint': (232, 48, 48),     # Đỏ rực giữ nguyên shading gốc của khố & vòng tay
        'main': (220, 38, 38, 255),      # #dc2626
        'light': (252, 165, 165, 255),   # #fca5a5
        'dark': (42, 10, 10, 255),       # #2a0a0a
        'rim': (253, 186, 116),          # Rim light cam ấm mỏng
    },
}


def tint_cloth_region(arr, x0, y0, x1, y1, target_rgb):
    """
    Nhuộm màu khố lông báo theo màu phe nhưng BẢO TOÀN 100% độ sáng tối & nét viền đen,
    chỉ ăn vào vùng lông thú/vải nâu sẫm (tránh tuyệt đối vùng da ngực/tay ấm r-b > 38).
    """
    h, w, _ = arr.shape
    rx0, ry0 = max(0, x0), max(0, y0)
    rx1, ry1 = min(w, x1), min(h, y1)
    if rx1 <= rx0 or ry1 <= ry0:
        return
    sub = arr[ry0:ry1, rx0:rx1]
    r = sub[:, :, 0].astype(np.float32)
    g = sub[:, :, 1].astype(np.float32)
    b = sub[:, :, 2].astype(np.float32)
    a = sub[:, :, 3]
    lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
    is_dark_ink = lum < 0.17
    # Vùng da (kể cả bóng đổ trên cơ ngực) luôn có độ ấm đỏ > xanh dương rất cao
    is_warm_skin = (r > 132) & (((r - b) > 36) | ((r - g) > 32))
    mask = (a > 120) & (~is_dark_ink) & (~is_warm_skin) & (r < 165)
    gain = np.clip(lum * 2.4, 0.30, 1.15)
    for ch, tval in enumerate(target_rgb):
        sub[:, :, ch] = np.where(mask, np.clip(tval * gain, 0, 255), sub[:, :, ch]).astype(np.uint8)


def paint_team_accents(sprite_arr, brow_arc, loin_box, cuff_boxes, team_key):
    """
    Phân biệt phe bằng màu khố/vòng tay (giữ shading gốc) + dải băng đô ôm cong đỉnh trán (KHÔNG che mắt!).
    brow_arc = (x0, y_mid, x1, bend_dy)
    """
    pal = TEAM_PALETTES[team_key]
    arr = sprite_arr.copy()

    # 1. Nhuộm lại dải khố da báo & các vòng cổ tay theo màu phe
    lx0, ly0, lx1, ly1 = loin_box
    tint_cloth_region(arr, lx0, ly0, lx1, ly1, pal['cloth_tint'])
    for cx0, cy0, cx1, cy1 in cuff_boxes:
        tint_cloth_region(arr, cx0, cy0, cx1, cy1, pal['cloth_tint'])

    # 2. Vẽ băng đô ôm cong ngay trên chân tóc đỉnh trán (y_mid nằm trong vùng tóc, trên lông mày)
    im = Image.fromarray(arr)
    draw = ImageDraw.Draw(im)
    bx0, by_mid, bx1, bend = brow_arc
    # Đuôi nơ băng đô ngắn gọn gàng phía sau gáy
    draw.polygon(
        [(bx0 + 1, by_mid + 1), (bx0 - 5, by_mid - 2), (bx0 - 4, by_mid + 1), (bx0 + 2, by_mid + 3)],
        fill=pal['main'],
        outline=pal['dark'],
    )
    draw.polygon(
        [(bx0 + 1, by_mid + 2), (bx0 - 4, by_mid + 4), (bx0 - 2, by_mid + 6), (bx0 + 2, by_mid + 3)],
        fill=pal['main'],
        outline=pal['dark'],
    )
    # Dải băng trán cong nhẹ ôm đầu (dày 3px)
    mx = (bx0 + bx1) / 2.0
    poly_top = [(bx0, by_mid), (mx, by_mid - bend), (bx1, by_mid + 1)]
    poly_bot = [(bx1, by_mid + 3), (mx, by_mid + 3 - bend), (bx0, by_mid + 3)]
    draw.polygon(poly_top + poly_bot, fill=pal['main'], outline=pal['dark'])
    draw.line([bx0 + 2, by_mid + 1, int(mx), int(by_mid - bend + 1), bx1 - 2, by_mid + 1], fill=pal['light'], width=1)

    return np.array(im)


def build_team_poses(team_key):
    w0 = paint_team_accents(W0_BASE, (27, 7, 48, 2), (22, 48, 52, 63), [], team_key)
    w1 = paint_team_accents(W1_BASE, (24, 6, 44, 2), (20, 48, 49, 62), [], team_key)
    w2 = paint_team_accents(W2_BASE, (20, 6, 40, 2), (17, 47, 45, 62), [], team_key)
    w3 = paint_team_accents(W3_BASE, (25, 7, 46, 2), (20, 48, 49, 63), [], team_key)
    a1 = paint_team_accents(A1_BASE, (34, 18, 55, 2), (29, 65, 62, 83), [], team_key)
    a2_coil = paint_team_accents(A2_COIL_BASE, (26, 13, 47, 2), (25, 57, 54, 72), [], team_key)
    a3_base = paint_team_accents(A3_BASE, (27, 19, 48, 2), (21, 52, 51, 69), [], team_key)
    a3_clean = paint_team_accents(A3_CLEAN_BASE, (27, 19, 48, 2), (21, 52, 51, 69), [], team_key)
    a3_wave = paint_team_accents(A3_WAVE_BASE, (27, 19, 48, 2), (21, 56, 51, 73), [], team_key)
    a3_faded = paint_team_accents(A3_FADED_BASE, (27, 19, 48, 2), (21, 52, 51, 69), [], team_key)
    return {
        'W0': w0, 'W1': w1, 'W2': w2, 'W3': w3,
        'A1': a1, 'A2_coil': a2_coil,
        'A3': a3_base, 'A3_clean': a3_clean, 'A3_with_wave': a3_wave, 'A3_faded': a3_faded,
    }


def make_armed_walk(walk_arr, pivot_xy, club_angle_deg, shoulder_dx=-30, shoulder_dy=-53):
    base_im = Image.fromarray(walk_arr)
    canvas = Image.new('RGBA', (144, 136), (0, 0, 0, 0))
    target_px, target_py = 72.0, 118.0
    bx = int(round(target_px - pivot_xy[0]))
    by = int(round(target_py - pivot_xy[1]))

    rot_club = A1_club_im.rotate(club_angle_deg, resample=Image.BICUBIC, expand=True)
    cx = int(round(target_px + shoulder_dx - rot_club.width // 2))
    cy = int(round(target_py + shoulder_dy - rot_club.height + 10))
    canvas.alpha_composite(rot_club, (cx, cy))
    canvas.alpha_composite(base_im, (bx, by))
    return np.array(canvas), (target_px, target_py)


def apply_outline_and_rim_light(cell_arr, rim_rgb):
    """
    Hạng mục 8: Thêm outline tối 1-2px và rim light mỏng lên phần cơ thể đặc (không viền đen quanh vệt chém mờ).
    """
    alpha = cell_arr[:, :, 3]
    r = cell_arr[:, :, 0].astype(np.int32)
    g = cell_arr[:, :, 1].astype(np.int32)
    b = cell_arr[:, :, 2].astype(np.int32)
    # Loại trừ các pixel vàng/trắng sáng rực của hiệu ứng vệt chém (attack smear/wave) khỏi outline đen
    is_slash_fx = (r > 185) & (g > 155) & ((r + g - b) > 220)
    solid_body = (alpha > 190) & (~is_slash_fx)
    if not np.any(solid_body):
        return cell_arr

    out = cell_arr.copy()
    dilated = ndimage.binary_dilation(solid_body, structure=np.ones((3, 3)), iterations=1)
    # Chỉ vẽ outline vào vùng nền trong suốt (alpha < 45) quanh cơ thể
    outer_ring = dilated & (~solid_body) & (alpha < 45)
    out[outer_ring, 0] = 16
    out[outer_ring, 1] = 12
    out[outer_ring, 2] = 20
    out[outer_ring, 3] = 215

    # Rim light mỏng 1px ở mép trên-phải cơ thể
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
    scale=1.92,
    rot_deg=0.0,
    squash_x=1.0,
    squash_y=1.0,
    offset_x=0.0,
    offset_y=0.0,
    tint_red=0.0,
    rim_rgb=(255, 224, 178),
):
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
        min_x_in_cell = dest_x + int(xs.min())
        if min_x_in_cell < 7:
            dest_x += (7 - min_x_in_cell)
        max_x_in_cell = dest_x + int(xs.max())
        if max_x_in_cell > 249:
            dest_x -= (max_x_in_cell - 249)

    cell.alpha_composite(im, (dest_x, dest_y))
    cell_arr = apply_outline_and_rim_light(np.array(cell), rim_rgb)
    cell_arr[:, :4, 3] = 0
    cell_arr[:, 252:, 3] = 0
    cell_arr[:4, :, 3] = 0
    cell_arr[245:, :, 3] = 0
    atlas.alpha_composite(Image.fromarray(cell_arr), (col * CELL_W, row * CELL_H))


def generate_atlas_for_team(team_key):
    poses = build_team_poses(team_key)
    rim_rgb = TEAM_PALETTES[team_key]['rim']
    atlas = Image.new('RGBA', (ATLAS_W, ATLAS_H), (0, 0, 0, 0))

    SCALE_WALK = 1.92
    SCALE_A1 = 1.80
    SCALE_A2 = 1.82
    SCALE_A3 = 1.86

    # HÀNG 0: IDLE (8 frames 0..7)
    idle_specs = [
        (poses['A1'], PIVOT_A1, SCALE_A1, -1.5, 1.01, 0.99,  0.0, 0.0),
        (poses['A1'], PIVOT_A1, SCALE_A1, -2.5, 1.02, 0.98,  0.0, 0.0),
        (poses['A1'], PIVOT_A1, SCALE_A1, -1.0, 1.01, 0.99,  0.0, 0.0),
        (poses['A1'], PIVOT_A1, SCALE_A1, +0.5, 1.00, 1.00, +0.5, 0.0),
        (poses['A1'], PIVOT_A1, SCALE_A1, +2.0, 0.99, 1.01, +1.0, 0.0),
        (poses['A1'], PIVOT_A1, SCALE_A1, +1.0, 0.99, 1.01, +0.5, 0.0),
        (poses['A1'], PIVOT_A1, SCALE_A1,  0.0, 1.00, 1.00,  0.0, 0.0),
        (poses['A1'], PIVOT_A1, SCALE_A1, -1.0, 1.01, 0.99,  0.0, 0.0),
    ]
    for i, (sp, piv, sc, r_deg, sx, sy, ox, oy) in enumerate(idle_specs):
        place_in_cell_anchored(
            atlas, col=i, row=0, sprite_arr=sp, pivot_xy=piv,
            scale=sc, rot_deg=r_deg, squash_x=sx, squash_y=sy, offset_x=ox, offset_y=oy, rim_rgb=rim_rgb,
        )

    # HÀNG 1: WALK (8 frames 8..15)
    walk_specs = [
        (poses['W0'], PIVOT_W0, +6,  -30, -53,  0.0, 1.00, 1.00, 0.0,  0.0),
        (poses['W1'], PIVOT_W1, +10, -30, -52, -0.8, 1.01, 0.99, 0.0,  0.0),
        (poses['W2'], PIVOT_W2, +5,  -30, -53,  0.0, 1.00, 1.00, 0.0, -1.0),
        (poses['W3'], PIVOT_W3, +2,  -29, -54, +0.8, 0.99, 1.01, 0.0, -1.0),
        (poses['W0'], PIVOT_W0, +7,  -30, -53,  0.0, 1.00, 1.00, 0.0,  0.0),
        (poses['W1'], PIVOT_W1, +11, -30, -52, -0.8, 1.01, 0.99, 0.0,  0.0),
        (poses['W2'], PIVOT_W2, +4,  -30, -53,  0.0, 1.00, 1.00, 0.0, -1.0),
        (poses['W3'], PIVOT_W3, +1,  -29, -54, +0.8, 0.99, 1.01, 0.0, -1.0),
    ]
    for idx, (ws, piv, c_ang, sdx, sdy, r_deg, sx, sy, ox, oy) in enumerate(walk_specs):
        armed, armed_piv = make_armed_walk(ws, piv, club_angle_deg=c_ang, shoulder_dx=sdx, shoulder_dy=sdy)
        place_in_cell_anchored(
            atlas, col=idx, row=1, sprite_arr=armed, pivot_xy=armed_piv,
            scale=SCALE_WALK, rot_deg=r_deg, squash_x=sx, squash_y=sy, offset_x=ox, offset_y=oy, rim_rgb=rim_rgb,
        )

    # HÀNG 2: ATTACK (8 frames 16..23) — 3 Pha (Anticipation 0..2 -> Strike 3..4 -> Recovery 5..7)
    attack_specs = [
        # Pha 1 Anticipation (kéo gậy lấy đà về sau):
        (poses['A1'],           PIVOT_A1,      SCALE_A1, -1.5, 1.01, 0.99,  0.0, 0.0),
        (poses['A1'],           PIVOT_A1,      SCALE_A1, +3.5, 0.99, 1.01, -3.0, 0.0),
        (poses['A2_coil'],      PIVOT_A2,      SCALE_A2, +5.5, 0.98, 1.03, -6.0, 0.0),
        # Pha 2 Strike (vung chém nhanh + Impact frame 3):
        (poses['A3'],           PIVOT_A3,      SCALE_A3, -2.0, 1.02, 0.98, +6.0, 0.0),
        (poses['A3_with_wave'], PIVOT_A3_WAVE, SCALE_A3, -3.5, 1.03, 0.97, +8.0, 0.0),
        # Pha 3 Recovery (thu gậy về vai & thế thủ):
        (poses['A3_faded'],     PIVOT_A3,      SCALE_A3, -1.0, 1.01, 0.99, +4.0, 0.0),
        (poses['A3_clean'],     PIVOT_A3,      SCALE_A3, +2.0, 1.00, 1.00, +2.0, 0.0),
        (poses['A1'],           PIVOT_A1,      SCALE_A1, -1.0, 1.00, 1.00,  0.0, 0.0),
    ]
    for idx, (sp, piv, sc, r_deg, sx, sy, ox, oy) in enumerate(attack_specs):
        place_in_cell_anchored(
            atlas, col=idx, row=2, sprite_arr=sp, pivot_xy=piv,
            scale=sc, rot_deg=r_deg, squash_x=sx, squash_y=sy, offset_x=ox, offset_y=oy, rim_rgb=rim_rgb,
        )

    # HÀNG 3: HURT (3 frames 24..26) & DIE (5 frames đầu 27..31)
    place_in_cell_anchored(atlas, col=0, row=3, sprite_arr=poses['A1'],      pivot_xy=PIVOT_A1, scale=SCALE_A1, rot_deg=+7.0,  squash_x=1.02, squash_y=0.98, offset_x=-4.0, tint_red=0.14, rim_rgb=rim_rgb)
    place_in_cell_anchored(atlas, col=1, row=3, sprite_arr=poses['A2_coil'], pivot_xy=PIVOT_A2, scale=SCALE_A2, rot_deg=+12.0, squash_x=1.03, squash_y=0.97, offset_x=-7.0, tint_red=0.20, rim_rgb=rim_rgb)
    place_in_cell_anchored(atlas, col=2, row=3, sprite_arr=poses['A1'],      pivot_xy=PIVOT_A1, scale=SCALE_A1, rot_deg=+4.0,  squash_x=1.01, squash_y=0.99, offset_x=-2.0, tint_red=0.08, rim_rgb=rim_rgb)

    # HÀNG 3 (cols 3..7) + HÀNG 4 (cols 0..3): DIE 9 frames (Giật lùi -> Quỵ gối -> Ngã ngửa -> Nảy đất -> Nằm bất động)
    die_specs = [
        # (col, row, sprite, pivot, scale, rot_deg, sx, sy, ox, oy, tint_red)
        (3, 3, poses['A1'],      PIVOT_A1,   SCALE_A1,   +12.0, 0.99, 0.99,  +4.0,  0.0, 0.18),  # DIE 0: Giật lùi
        (4, 3, poses['A2_coil'], PIVOT_A2,   SCALE_A2,   +24.0, 1.02, 0.94, +14.0, +4.0, 0.16),  # DIE 1: Khuỵu gối
        (5, 3, poses['A2_coil'], PIVOT_A2,   SCALE_A2,   +38.0, 1.03, 0.92, +26.0, +6.0, 0.14),  # DIE 2: Quỵ xuống
        (6, 3, poses['W1'],      PIVOT_W1,   SCALE_WALK, +54.0, 1.00, 0.98, +38.0, +2.0, 0.11),  # DIE 3: Bật ngửa
        (7, 3, poses['W1'],      PIVOT_W1,   SCALE_WALK, +70.0, 1.00, 0.98, +52.0, -2.0, 0.08),  # DIE 4: Ngã giữa chừng
        (0, 4, poses['W1'],      PIVOT_W1,   SCALE_WALK, +83.0, 1.03, 0.94, +62.0, -6.0, 0.06),  # DIE 5: Đập lưng xuống sàn
        (1, 4, poses['W1'],      PIVOT_W1,   SCALE_WALK, +87.0, 1.01, 0.97, +65.0, -8.0, 0.04),  # DIE 6: Nảy nhẹ
        (2, 4, poses['W0'],      PIVOT_W0,   SCALE_WALK, +90.0, 1.03, 0.93, +68.0, -8.0, 0.02),  # DIE 7: Thả lỏng nằm ngang
        (3, 4, poses['W0'],      PIVOT_W0,   SCALE_WALK, +90.0, 1.04, 0.92, +68.0, -8.0, 0.00),  # DIE 8: Bất động trên đất
    ]
    for col, row, sp, piv, sc, r_deg, sx, sy, ox, oy, tr in die_specs:
        place_in_cell_anchored(
            atlas, col=col, row=row, sprite_arr=sp, pivot_xy=piv,
            scale=sc, rot_deg=r_deg, squash_x=sx, squash_y=sy, offset_x=ox, offset_y=oy, tint_red=tr, rim_rgb=rim_rgb,
        )

    # Đảm bảo 100% dải y=502..512 trong suốt tuyệt đối (tuân thủ test BUG-03 & EVAL-04)
    atlas_np = np.array(atlas)
    atlas_np[502:512, :, 3] = 0
    return Image.fromarray(atlas_np)


atlas_blue = generate_atlas_for_team('BLUE')
atlas_red = generate_atlas_for_team('RED')

atlas_blue.save(OUT_ACTION_ATLAS_BLUE)
atlas_red.save(OUT_ACTION_ATLAS_RED)

# Giữ caveman_atlas.png kích thước 2048x1024 (4 hàng đầu) cho unit tests EVAL-04 & BUG-03
atlas_blue.crop((0, 0, ATLAS_W, 1024)).save(OUT_MAIN_ATLAS)

# Xuất Contact Sheet 36 frame (Row 0..4) để kiểm tra trực quan
sheet_preview = Image.new('RGBA', (ATLAS_W, ATLAS_H), (28, 32, 42, 255))
draw = ImageDraw.Draw(sheet_preview)
labels = [
    ['IDLE 0', 'IDLE 1', 'IDLE 2', 'IDLE 3', 'IDLE 4', 'IDLE 5', 'IDLE 6', 'IDLE 7'],
    ['WALK 0', 'WALK 1', 'WALK 2', 'WALK 3', 'WALK 4', 'WALK 5', 'WALK 6', 'WALK 7'],
    ['ATK 0: Ant1', 'ATK 1: Ant2', 'ATK 2: Ant3', 'ATK 3: HIT!', 'ATK 4: Smash', 'ATK 5: Rec1', 'ATK 6: Rec2', 'ATK 7: Rec3'],
    ['HURT 0', 'HURT 1', 'HURT 2', 'DIE 0: Jolt', 'DIE 1: Knee', 'DIE 2: Drop', 'DIE 3: Tip54°', 'DIE 4: Fall70°'],
    ['DIE 5: HitGnd', 'DIE 6: Bounce', 'DIE 7: Settle', 'DIE 8: KO Flat', '', '', '', ''],
]
for r in range(ROWS):
    for c in range(COLS):
        x0, y0 = c * CELL_W, r * CELL_H
        draw.rectangle([x0, y0, x0 + CELL_W - 1, y0 + CELL_H - 1], outline=(70, 80, 100, 255), width=1)
        draw.line([x0, y0 + FOOT_Y, x0 + CELL_W, y0 + FOOT_Y], fill=(245, 158, 11, 140), width=1)
        draw.line([x0 + CELL_W // 2, y0 + 20, x0 + CELL_W // 2, y0 + FOOT_Y], fill=(56, 189, 248, 90), width=1)
sheet_preview.alpha_composite(atlas_blue)
# Vẽ 1 ô so sánh Phe Đỏ vào cuối Row 4 (cột 5,6,7) trên contact sheet để tiện kiểm tra song song
atlas_red_np = np.array(atlas_red)
for idx, (src_col, src_row, dst_col, lbl) in enumerate([
    (0, 1, 5, 'RED WALK 0'),
    (2, 2, 6, 'RED ATK 2'),
    (3, 2, 7, 'RED ATK 3'),
]):
    crop_red = Image.fromarray(atlas_red_np[src_row*256:(src_row+1)*256, src_col*256:(src_col+1)*256])
    sheet_preview.alpha_composite(crop_red, (dst_col * CELL_W, 4 * CELL_H))
    labels[4][dst_col] = lbl

draw2 = ImageDraw.Draw(sheet_preview)
for r in range(ROWS):
    for c in range(COLS):
        x0, y0 = c * CELL_W, r * CELL_H
        if labels[r][c]:
            draw2.text((x0 + 8, y0 + 6), labels[r][c], fill=(248, 250, 252, 255))
sheet_preview.save(OUT_CONTACT)
print('SAVED 36-FRAME TEAM ATLASES:', OUT_ACTION_ATLAS_BLUE, OUT_ACTION_ATLAS_RED, OUT_MAIN_ATLAS)
