"""
Generator cho 3 quân còn lại của Kỷ nguyên 1 (Tiền Sử / Prehistoric):
- Hunter (stone_ranged): Thợ Săn Ném Đá — 36 Action Frames (Blue P1 + Red P2)
- Dino (stone_tank): Dũng Sĩ Cưỡi Khủng Long — 36 Action Frames (ghép Dũng Sĩ cầm giáo + áo choàng lên lưng Triceratops!)
- Shaman (stone_special): Thầy Mo Nguyên Thủy — 36 Action Frames (Blue P1 + Red P2)

Tất cả dùng chung chuẩn từ action_sheet_lib.py (2048x1280 5 hàng, anchor 0.90, outline + rim light).
"""

import math
import os
from PIL import Image
import numpy as np
from scipy import ndimage

from action_sheet_lib import (
    ATLAS_W,
    ATLAS_H,
    TEAM_PALETTES,
    compute_foot_pivot,
    extract_clean_sprite,
    finalize_atlas,
    place_in_cell_anchored,
    recolor_red_accents,
    save_unit_bundle,
)

CONCEPT_PATH = 'apps/game/public/concepts/prehistoric_concept_sheet.jpg'
SCRATCH_DIR = 'C:/Users/duong/.gemini/antigravity/brain/6b599d35-f524-4033-858f-924761a0de62/scratch'

sheet_arr = np.array(Image.open(CONCEPT_PATH).convert('RGBA'))


def fade_yellow_fx(sprite_arr, alpha_mult=0.45):
    """Làm mờ riêng phần vệt sáng năng lượng / vòng xoay màu vàng mà vẫn giữ sắc vàng tươi sáng."""
    arr = sprite_arr.copy()
    r = arr[:, :, 0].astype(np.int32)
    g = arr[:, :, 1].astype(np.int32)
    b = arr[:, :, 2].astype(np.int32)
    a = arr[:, :, 3]
    is_fx = (a > 10) & (r > 175) & (g > 130) & ((r - b) > 50) & ((g - b) > 30)
    arr[is_fx, 0] = np.clip(r[is_fx] * 1.08 + 18, 0, 255).astype(np.uint8)
    arr[is_fx, 1] = np.clip(g[is_fx] * 1.08 + 14, 0, 255).astype(np.uint8)
    arr[is_fx, 2] = np.clip(b[is_fx] * 1.05 + 8, 0, 255).astype(np.uint8)
    arr[is_fx, 3] = (arr[is_fx, 3].astype(np.float32) * alpha_mult).astype(np.uint8)
    return arr


def remove_detached_ground_shadow(sprite_arr):
    """Loại bỏ bóng hình oval rời nằm dưới chân trong concept sheet (như ở Shaman walk)."""
    arr = sprite_arr.copy()
    h, w, _ = arr.shape
    labeled, n = ndimage.label(arr[:, :, 3] > 20)
    if n <= 1:
        return arr
    sizes = np.bincount(labeled.ravel())
    sizes[0] = 0
    main_lbl = int(np.argmax(sizes))
    for lbl in range(1, n + 1):
        if lbl == main_lbl:
            continue
        comp = labeled == lbl
        ys, xs = np.where(comp)
        # Bóng đất rời luôn nằm sát đáy ảnh (y > h*0.84) và có kích thước nhỏ hơn thân chính nhiều
        if ys.min() > int(h * 0.82) and len(ys) < sizes[main_lbl] * 0.25:
            arr[comp, 3] = 0
    return arr


# =====================================================================
# 1. HUNTER (stone_ranged) — THỢ SĂN NÉM ĐÁ
# =====================================================================
def build_hunter():
    w0 = extract_clean_sprite(sheet_arr, (403, 550, 457, 626))
    w1 = extract_clean_sprite(sheet_arr, (470, 551, 523, 627))
    w2 = extract_clean_sprite(sheet_arr, (539, 550, 596, 627))
    w3 = extract_clean_sprite(sheet_arr, (603, 549, 668, 626))
    a1 = extract_clean_sprite(sheet_arr, (407, 653, 461, 734))
    a2 = extract_clean_sprite(sheet_arr, (478, 656, 573, 734))
    a3 = extract_clean_sprite(sheet_arr, (578, 646, 681, 734))
    a3_faded = fade_yellow_fx(a3, 0.42)
    a2_faded = fade_yellow_fx(a2, 0.28)

    # Tính pivot chuẩn cho từng dáng (cố định trọng tâm bàn chân theo phần thân người, không lệch theo vòng sáng)
    piv_w0 = compute_foot_pivot(w0)
    piv_w1 = compute_foot_pivot(w1)
    piv_w2 = compute_foot_pivot(w2)
    piv_w3 = compute_foot_pivot(w3)
    piv_a1 = compute_foot_pivot(a1)
    # A2 & A3 có vòng sáng vàng vươn xa sang phải/dưới -> tính pivot bàn chân từ vùng thân người (x < 54)
    piv_a2 = (36.0, float(np.where(a2[:, :55, 3] > 80)[0].max()))
    piv_a3 = (41.0, float(np.where(a3[:, :62, 3] > 80)[0].max()))

    def make_team(team_key):
        rim = TEAM_PALETTES[team_key]['rim']
        pw0 = recolor_red_accents(w0, team_key, max_hue_deg=13.5, min_sat=0.42)
        pw1 = recolor_red_accents(w1, team_key, max_hue_deg=13.5, min_sat=0.42)
        pw2 = recolor_red_accents(w2, team_key, max_hue_deg=13.5, min_sat=0.42)
        pw3 = recolor_red_accents(w3, team_key, max_hue_deg=13.5, min_sat=0.42)
        pa1 = recolor_red_accents(a1, team_key, max_hue_deg=13.5, min_sat=0.42)
        pa2 = recolor_red_accents(a2, team_key, max_hue_deg=13.5, min_sat=0.42)
        pa3 = recolor_red_accents(a3, team_key, max_hue_deg=13.5, min_sat=0.42)
        pa3f = recolor_red_accents(a3_faded, team_key, max_hue_deg=13.5, min_sat=0.42)
        pa2f = recolor_red_accents(a2_faded, team_key, max_hue_deg=13.5, min_sat=0.42)

        atlas = Image.new('RGBA', (ATLAS_W, ATLAS_H), (0, 0, 0, 0))
        SC_W = 2.02
        SC_A = 1.94

        # ROW 0: IDLE (8 frames) — Thủ dây ná thở đều
        idle_specs = [
            (pa1, piv_a1, SC_A, -1.2, 1.01, 0.99, 0.0, 0.0),
            (pa1, piv_a1, SC_A, -2.2, 1.02, 0.98, 0.0, 0.0),
            (pa1, piv_a1, SC_A, -0.8, 1.01, 0.99, 0.0, 0.0),
            (pa1, piv_a1, SC_A, +0.6, 1.00, 1.00, +0.5, 0.0),
            (pa1, piv_a1, SC_A, +1.8, 0.99, 1.01, +1.0, 0.0),
            (pa1, piv_a1, SC_A, +0.8, 0.99, 1.01, +0.5, 0.0),
            (pa1, piv_a1, SC_A,  0.0, 1.00, 1.00, 0.0, 0.0),
            (pa1, piv_a1, SC_A, -0.8, 1.01, 0.99, 0.0, 0.0),
        ]
        for i, (sp, piv, sc, r, sx, sy, ox, oy) in enumerate(idle_specs):
            place_in_cell_anchored(atlas, i, 0, sp, piv, sc, r, sx, sy, ox, oy, rim_rgb=rim)

        # ROW 1: WALK (8 frames) — 2 nhịp chạy bước dài nhanh nhẹn
        walk_specs = [
            (pw0, piv_w0, SC_W, -1.0, 1.00, 1.00,  0.0,  0.0),
            (pw1, piv_w1, SC_W, -2.5, 1.02, 0.98, +1.0, +1.0),
            (pw2, piv_w2, SC_W, -1.2, 1.00, 1.00,  0.0, -2.0),
            (pw3, piv_w3, SC_W, +1.0, 0.99, 1.02, -1.0, -3.0),
            (pw0, piv_w0, SC_W, -1.5, 1.01, 0.99, +0.5,  0.0),
            (pw1, piv_w1, SC_W, -3.0, 1.02, 0.98, +1.5, +1.0),
            (pw2, piv_w2, SC_W, -0.8, 1.00, 1.00,  0.0, -2.5),
            (pw3, piv_w3, SC_W, +1.4, 0.99, 1.02, -1.0, -3.5),
        ]
        for i, (sp, piv, sc, r, sx, sy, ox, oy) in enumerate(walk_specs):
            place_in_cell_anchored(atlas, i, 1, sp, piv, sc, r, sx, sy, ox, oy, rim_rgb=rim)

        # ROW 2: ATTACK (8 frames) — 3 Pha: Anticipation (kéo/xoay ná) -> Strike/Release (frame 3) -> Recovery
        atk_specs = [
            (pa1,  piv_a1, SC_A, +2.0, 1.01, 0.99, -2.0, 0.0),  # 0: Ant1 thủ
            (pa2f, piv_a2, SC_A, +4.5, 0.99, 1.02, -5.0, 0.0),  # 1: Ant2 bắt đầu xoay ná
            (pa2,  piv_a2, SC_A, +3.0, 0.98, 1.03, -4.0, 0.0),  # 2: Ant3 xoay ná cực nhanh
            (pa3,  piv_a3, SC_A, -2.5, 1.03, 0.97, +6.0, 0.0),  # 3: RELEASE! Phóng đá cực mạnh
            (pa3,  piv_a3, SC_A, -4.5, 1.04, 0.96, +8.0, 0.0),  # 4: Follow-through vung tay
            (pa3f, piv_a3, SC_A, -1.5, 1.01, 0.99, +4.0, 0.0),  # 5: Rec1 vòng sáng tan dần
            (pa2f, piv_a2, SC_A, +1.0, 1.00, 1.00, +1.0, 0.0),  # 6: Rec2 thu dây ná
            (pa1,  piv_a1, SC_A, -0.5, 1.00, 1.00,  0.0, 0.0),  # 7: Rec3 về thế thủ
        ]
        for i, (sp, piv, sc, r, sx, sy, ox, oy) in enumerate(atk_specs):
            place_in_cell_anchored(atlas, i, 2, sp, piv, sc, r, sx, sy, ox, oy, rim_rgb=rim)

        # ROW 3: HURT (0..2)
        place_in_cell_anchored(atlas, 0, 3, pa1, piv_a1, SC_A, +8.0,  1.02, 0.98, -4.0, 0.0, tint_red=0.14, rim_rgb=rim)
        place_in_cell_anchored(atlas, 1, 3, pw2, piv_w2, SC_W, +14.0, 1.03, 0.97, -7.0, 0.0, tint_red=0.22, rim_rgb=rim)
        place_in_cell_anchored(atlas, 2, 3, pa1, piv_a1, SC_A, +4.0,  1.01, 0.99, -2.0, 0.0, tint_red=0.08, rim_rgb=rim)

        # ROW 3 (3..7) + ROW 4 (0..3): DIE (9 frames)
        die_specs = [
            (3, 3, pa1, piv_a1, SC_A, +14.0, 0.99, 0.99,  +4.0,  0.0, 0.18),
            (4, 3, pw1, piv_w1, SC_W, +26.0, 1.02, 0.94, +14.0, +4.0, 0.16),
            (5, 3, pw1, piv_w1, SC_W, +40.0, 1.03, 0.92, +26.0, +5.0, 0.14),
            (6, 3, pw2, piv_w2, SC_W, +56.0, 1.00, 0.98, +38.0, +2.0, 0.11),
            (7, 3, pw2, piv_w2, SC_W, +72.0, 1.00, 0.98, +52.0, -2.0, 0.08),
            (0, 4, pw2, piv_w2, SC_W, +84.0, 1.03, 0.94, +62.0, -6.0, 0.06),
            (1, 4, pw2, piv_w2, SC_W, +87.0, 1.01, 0.97, +65.0, -8.0, 0.04),
            (2, 4, pw0, piv_w0, SC_W, +90.0, 1.03, 0.93, +68.0, -8.0, 0.02),
            (3, 4, pw0, piv_w0, SC_W, +90.0, 1.04, 0.92, +68.0, -8.0, 0.00),
        ]
        for c, row, sp, piv, sc, r, sx, sy, ox, oy, tr in die_specs:
            place_in_cell_anchored(atlas, c, row, sp, piv, sc, r, sx, sy, ox, oy, tint_red=tr, rim_rgb=rim)

        return finalize_atlas(atlas)

    blue = make_team('BLUE')
    red = make_team('RED')
    save_unit_bundle(
        era_dir='prehistoric',
        name='hunter',
        unit_id='stone_ranged',
        atlas_blue=blue,
        atlas_red=red,
        hitbox={'x': -30, 'y': -180, 'width': 60, 'height': 180},
        hurtbox={'width': 58, 'height': 125, 'offsetX': 0, 'offsetY': -62},
        stride_px=60,
        is_ranged=True,
        contact_out_path=os.path.join(SCRATCH_DIR, 'hunter_v2_contact.png'),
    )


# =====================================================================
# 2. DINO (stone_tank) — DŨNG SĨ CƯỠI KHỦNG LONG
# =====================================================================
def extract_big_rider():
    """Trích Dũng Sĩ cầm giáo áo choàng đỏ từ tranh lớn phía trên để ghép khít lên yên Triceratops."""
    # Vùng ảnh lớn chứa trọn vẹn Dũng Sĩ + áo choàng + giáo đá: x=708..1005, y=18..228
    sub = extract_clean_sprite(sheet_arr, (708, 18, 1005, 228), interior_white_thresh=238)
    h, w, _ = sub.shape
    yy, xx = np.mgrid[0:h, 0:w]
    r = sub[:, :, 0].astype(np.int32)
    g = sub[:, :, 1].astype(np.int32)
    b = sub[:, :, 2].astype(np.int32)

    # Xóa phần mào/lưng khủng long xanh lá ở góc dưới phải (y > 130, x > 205) và phần yên đá xám dưới bụng (y > 176)
    is_dino_green = (g > r + 5) & (g > b + 6) & (yy > 120)
    # Vùng mào khủng long (kể cả viền đen & gai sừng trắng trên mào) nằm dưới đường chéo từ (208, 165) -> (265, 130)
    in_frill_zone = (xx > 208) & (yy > 152 - (xx - 208) * 0.35)
    # Phần yên đá bên trái dưới áo choàng
    in_saddle_rock = (xx < 145) & (yy > 176)
    # Cắt gọn phần chân đùi dưới yên để ôm khít lên lưng khủng long mini
    below_waist = yy > 195
    drop = is_dino_green | in_frill_zone | in_saddle_rock | below_waist
    sub[drop, 3] = 0

    # Giữ lại thành phần liên thông lớn nhất (Dũng Sĩ + giáo + áo choàng)
    labeled, n = ndimage.label(sub[:, :, 3] > 20)
    if n > 0:
        sizes = np.bincount(labeled.ravel())
        sizes[0] = 0
        main_lbl = int(np.argmax(sizes))
        for lbl in range(1, n + 1):
            if lbl != main_lbl and sizes[lbl] < 120:
                sub[labeled == lbl, 3] = 0

    # Điểm ngồi hông của Dũng Sĩ trong crop (708..1005, 18..228): x ~ 875-708 = 167, y ~ 195-18 = 177
    return sub, (167.0, 177.0)


def compose_mounted_dino(dino_arr, dino_pivot, rider_arr, rider_seat_xy, saddle_xy, rider_scale=0.285, rider_rot_deg=0.0):
    """Ghép Dũng Sĩ cầm giáo ngồi chặt lên yên của Triceratops."""
    canvas_w, canvas_h = 180, 145
    canvas = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    target_px, target_py = 90.0, 132.0
    dx = int(round(target_px - dino_pivot[0]))
    dy = int(round(target_py - dino_pivot[1]))

    # 1. Đặt khủng long lên canvas trước
    canvas.alpha_composite(Image.fromarray(dino_arr), (dx, dy))

    # 2. Scale & xoay Dũng Sĩ quanh điểm ngồi trên yên
    r_im = Image.fromarray(rider_arr)
    rw = max(1, int(round(r_im.width * rider_scale)))
    rh = max(1, int(round(r_im.height * rider_scale)))
    r_im = r_im.resize((rw, rh), resample=Image.BICUBIC)
    rx = rider_seat_xy[0] * rider_scale
    ry = rider_seat_xy[1] * rider_scale

    if abs(rider_rot_deg) > 0.05:
        cx0, cy0 = rw / 2.0, rh / 2.0
        r_rot = r_im.rotate(rider_rot_deg, resample=Image.BICUBIC, expand=True)
        cx1, cy1 = r_rot.width / 2.0, r_rot.height / 2.0
        rad = -math.radians(rider_rot_deg)
        ox, oy = rx - cx0, ry - cy0
        rx = cx1 + ox * math.cos(rad) - oy * math.sin(rad)
        ry = cy1 + ox * math.sin(rad) + oy * math.cos(rad)
        r_im = r_rot

    seat_canvas_x = dx + saddle_xy[0]
    seat_canvas_y = dy + saddle_xy[1]
    paste_rx = int(round(seat_canvas_x - rx))
    paste_ry = int(round(seat_canvas_y - ry))
    canvas.alpha_composite(r_im, (paste_rx, paste_ry))

    return np.array(canvas), (target_px, target_py)


def build_dino():
    dw0 = extract_clean_sprite(sheet_arr, (706, 555, 817, 624))
    dw1 = extract_clean_sprite(sheet_arr, (821, 555, 932, 622))
    dw2 = extract_clean_sprite(sheet_arr, (937, 555, 1048, 624))
    da1 = extract_clean_sprite(sheet_arr, (708, 667, 819, 733))
    da2 = extract_clean_sprite(sheet_arr, (821, 657, 934, 736))
    rider_base, rider_seat_xy = extract_big_rider()

    piv_w0 = compute_foot_pivot(dw0)
    piv_w1 = compute_foot_pivot(dw1)
    piv_w2 = compute_foot_pivot(dw2)
    piv_a1 = compute_foot_pivot(da1)
    piv_a2 = compute_foot_pivot(da2)

    # Tọa độ yên ngồi trên lưng Triceratops mini (tính từ góc trên-trái mỗi crop dino)
    SAD_W0 = (56.0, 26.0)
    SAD_W1 = (56.0, 25.0)
    SAD_W2 = (56.0, 26.0)
    SAD_A1 = (57.0, 22.0)
    SAD_A2 = (58.0, 28.0)

    def make_team(team_key):
        rim = TEAM_PALETTES[team_key]['rim']
        # Đổi màu áo choàng đỏ & cờ giáo của Dũng Sĩ sang màu phe (BLUE / RED) giữ nguyên da cơ bắp
        rider_team = recolor_red_accents(rider_base, team_key, max_hue_deg=11.5, min_sat=0.46)

        def mount(dino_sp, dino_piv, sad, r_rot=0.0):
            return compose_mounted_dino(dino_sp, dino_piv, rider_team, rider_seat_xy, sad, rider_scale=0.285, rider_rot_deg=r_rot)

        atlas = Image.new('RGBA', (ATLAS_W, ATLAS_H), (0, 0, 0, 0))
        SC = 1.62

        # ROW 0: IDLE (8 frames) — Khủng long thở nặng nề, Dũng Sĩ nhấp giáo canh chừng
        idle_specs = [
            (dw0, piv_w0, SAD_W0, -1.0,  0.0, 1.01, 0.99, 0.0, 0.0),
            (dw0, piv_w0, SAD_W0, -2.5, -0.5, 1.02, 0.98, 0.0, 0.0),
            (dw0, piv_w0, SAD_W0, -1.0,  0.0, 1.01, 0.99, 0.0, 0.0),
            (dw0, piv_w0, SAD_W0, +1.5, +0.5, 1.00, 1.00, 0.0, 0.0),
            (dw0, piv_w0, SAD_W0, +3.5, +1.0, 0.99, 1.01, 0.0, 0.0),
            (dw0, piv_w0, SAD_W0, +2.0, +0.5, 0.99, 1.01, 0.0, 0.0),
            (dw0, piv_w0, SAD_W0,  0.0,  0.0, 1.00, 1.00, 0.0, 0.0),
            (dw0, piv_w0, SAD_W0, -1.0, -0.3, 1.01, 0.99, 0.0, 0.0),
        ]
        for i, (dsp, dpiv, sad, rrot, body_r, sx, sy, ox, oy) in enumerate(idle_specs):
            comp, cpiv = mount(dsp, dpiv, sad, r_rot=rrot)
            place_in_cell_anchored(atlas, i, 0, comp, cpiv, SC, body_r, sx, sy, ox, oy, rim_rgb=rim)

        # ROW 1: WALK (8 frames) — Bước chân dậm đất uy lực của Triceratops + Dũng Sĩ nhún trên yên
        walk_specs = [
            (dw0, piv_w0, SAD_W0, -2.0,  0.0, 1.00, 1.00, 0.0,  0.0),
            (dw1, piv_w1, SAD_W1, -5.0, -1.2, 1.02, 0.98, +1.0, +1.5),
            (dw2, piv_w2, SAD_W2, -1.5, +0.8, 0.99, 1.01, 0.0, -1.5),
            (dw1, piv_w1, SAD_W1, +2.0, -0.5, 1.01, 0.99, -0.5, +0.5),
            (dw0, piv_w0, SAD_W0, -2.5,  0.0, 1.00, 1.00, 0.0,  0.0),
            (dw1, piv_w1, SAD_W1, -6.0, -1.5, 1.02, 0.98, +1.5, +1.5),
            (dw2, piv_w2, SAD_W2, -1.0, +1.0, 0.99, 1.01, 0.0, -1.5),
            (dw0, piv_w0, SAD_W0, +1.5, +0.3, 1.00, 1.00, -0.5,  0.0),
        ]
        for i, (dsp, dpiv, sad, rrot, body_r, sx, sy, ox, oy) in enumerate(walk_specs):
            comp, cpiv = mount(dsp, dpiv, sad, r_rot=rrot)
            place_in_cell_anchored(atlas, i, 1, comp, cpiv, SC, body_r, sx, sy, ox, oy, rim_rgb=rim)

        # ROW 2: ATTACK (8 frames) — 3 Pha: Thu sừng giơ giáo -> Húc ủi cực mạnh & đâm giáo (frame 3) -> Hồi thế
        atk_specs = [
            (dw0, piv_w0, SAD_W0,  +6.0, +2.0, 0.99, 1.02, -3.0, 0.0),  # 0: Ant1 giương giáo
            (dw2, piv_w2, SAD_W2, +14.0, +4.0, 0.97, 1.03, -6.0, 0.0),  # 1: Ant2 thu đà cúi thân
            (da1, piv_a1, SAD_A1, +10.0, +2.5, 0.98, 1.02, -4.0, 0.0),  # 2: Ant3 lấy đà lao tới
            (da2, piv_a2, SAD_A2, -14.0, -3.5, 1.04, 0.96, +8.0, 0.0),  # 3: HIT! Cúi sừng húc + phóng giáo!
            (da2, piv_a2, SAD_A2, -18.0, -4.5, 1.05, 0.95, +10.0, 0.0), # 4: Follow-through ủi mạnh
            (da1, piv_a1, SAD_A1,  -8.0, -1.5, 1.02, 0.98, +5.0, 0.0),  # 5: Rec1 giảm tốc
            (dw1, piv_w1, SAD_W1,  -2.0,  0.0, 1.00, 1.00, +2.0, 0.0),  # 6: Rec2 thu giáo
            (dw0, piv_w0, SAD_W0,   0.0,  0.0, 1.00, 1.00,  0.0, 0.0),  # 7: Rec3 về thế đứng
        ]
        for i, (dsp, dpiv, sad, rrot, body_r, sx, sy, ox, oy) in enumerate(atk_specs):
            comp, cpiv = mount(dsp, dpiv, sad, r_rot=rrot)
            place_in_cell_anchored(atlas, i, 2, comp, cpiv, SC, body_r, sx, sy, ox, oy, rim_rgb=rim)

        # ROW 3: HURT (0..2)
        c_h0, p_h0 = mount(dw0, piv_w0, SAD_W0, r_rot=+10.0)
        c_h1, p_h1 = mount(dw2, piv_w2, SAD_W2, r_rot=+18.0)
        place_in_cell_anchored(atlas, 0, 3, c_h0, p_h0, SC, +5.0, 1.02, 0.98, -4.0, 0.0, tint_red=0.14, rim_rgb=rim)
        place_in_cell_anchored(atlas, 1, 3, c_h1, p_h1, SC, +9.0, 1.03, 0.97, -7.0, 0.0, tint_red=0.22, rim_rgb=rim)
        place_in_cell_anchored(atlas, 2, 3, c_h0, p_h0, SC, +3.0, 1.01, 0.99, -2.0, 0.0, tint_red=0.08, rim_rgb=rim)

        # ROW 3 (3..7) + ROW 4 (0..3): DIE (9 frames) — Khủng long khụy 4 chân đổ gục xuống đất, Dũng Sĩ gục trên yên
        c_d0, p_d0 = mount(dw0, piv_w0, SAD_W0, r_rot=+12.0)
        c_d1, p_d1 = mount(dw2, piv_w2, SAD_W2, r_rot=-12.0)
        c_d2, p_d2 = mount(dw1, piv_w1, SAD_W1, r_rot=-28.0)
        c_d3, p_d3 = mount(dw0, piv_w0, SAD_W0, r_rot=-42.0)
        die_specs = [
            (3, 3, c_d0, p_d0,  +6.0, 1.01, 0.97,  -4.0,  0.0, 0.18),  # Giật lùi trúng đòn
            (4, 3, c_d1, p_d1,  -3.0, 1.04, 0.90,   0.0, +4.0, 0.16),  # Bắt đầu khuỵu chân trước
            (5, 3, c_d1, p_d1,  -8.0, 1.07, 0.82,  +3.0, +7.0, 0.14),  # Gục đầu sừng xuống
            (6, 3, c_d2, p_d2, -13.0, 1.10, 0.74,  +6.0, +9.0, 0.11),  # Sụp thân xuống sàn
            (7, 3, c_d2, p_d2, -16.0, 1.13, 0.67,  +8.0, +10.0, 0.08), # Nằm sập bụng chạm đất
            (0, 4, c_d3, p_d3, -18.0, 1.15, 0.61, +10.0, +11.0, 0.06), # Đập ngực xuống đất
            (1, 4, c_d3, p_d3, -15.0, 1.13, 0.64, +10.0, +10.0, 0.04), # Nảy nhẹ
            (2, 4, c_d3, p_d3, -17.0, 1.16, 0.59, +11.0, +11.0, 0.02), # Thả lỏng
            (3, 4, c_d3, p_d3, -18.0, 1.17, 0.57, +11.0, +11.0, 0.00), # Bất động nằm gục
        ]
        for c, row, sp, piv, r, sx, sy, ox, oy, tr in die_specs:
            place_in_cell_anchored(atlas, c, row, sp, piv, SC, r, sx, sy, ox, oy, tint_red=tr, rim_rgb=rim)

        return finalize_atlas(atlas)

    blue = make_team('BLUE')
    red = make_team('RED')
    save_unit_bundle(
        era_dir='prehistoric',
        name='dino',
        unit_id='stone_tank',
        atlas_blue=blue,
        atlas_red=red,
        hitbox={'x': -55, 'y': -210, 'width': 110, 'height': 210},
        hurtbox={'width': 98, 'height': 155, 'offsetX': 0, 'offsetY': -78},
        stride_px=80,
        is_ranged=False,
        contact_out_path=os.path.join(SCRATCH_DIR, 'dino_v2_contact.png'),
    )


# =====================================================================
# 3. SHAMAN (stone_special) — THẦY MO NGUYÊN THỦY
# =====================================================================
def build_shaman():
    w0 = remove_detached_ground_shadow(extract_clean_sprite(sheet_arr, (1098, 535, 1141, 634)))
    w1 = remove_detached_ground_shadow(extract_clean_sprite(sheet_arr, (1161, 535, 1203, 634)))
    w2 = remove_detached_ground_shadow(extract_clean_sprite(sheet_arr, (1220, 535, 1277, 634)))
    w3 = remove_detached_ground_shadow(extract_clean_sprite(sheet_arr, (1278, 539, 1347, 634)))
    a1 = extract_clean_sprite(sheet_arr, (1089, 653, 1163, 737))
    a2 = extract_clean_sprite(sheet_arr, (1169, 650, 1255, 737))
    a3 = extract_clean_sprite(sheet_arr, (1260, 651, 1345, 737))
    a2_faded = fade_yellow_fx(a2, 0.35)
    a3_faded = fade_yellow_fx(a3, 0.42)

    piv_w0 = compute_foot_pivot(w0)
    piv_w1 = compute_foot_pivot(w1)
    piv_w2 = compute_foot_pivot(w2)
    piv_w3 = compute_foot_pivot(w3)
    piv_a1 = compute_foot_pivot(a1)
    piv_a2 = compute_foot_pivot(a2)
    piv_a3 = compute_foot_pivot(a3)

    def make_team(team_key):
        rim = TEAM_PALETTES[team_key]['rim']
        pw0 = recolor_red_accents(w0, team_key, max_hue_deg=13.5, min_sat=0.38)
        pw1 = recolor_red_accents(w1, team_key, max_hue_deg=13.5, min_sat=0.38)
        pw2 = recolor_red_accents(w2, team_key, max_hue_deg=13.5, min_sat=0.38)
        pw3 = recolor_red_accents(w3, team_key, max_hue_deg=13.5, min_sat=0.38)
        pa1 = recolor_red_accents(a1, team_key, max_hue_deg=13.5, min_sat=0.38)
        pa2 = recolor_red_accents(a2, team_key, max_hue_deg=13.5, min_sat=0.38)
        pa3 = recolor_red_accents(a3, team_key, max_hue_deg=13.5, min_sat=0.38)
        pa2f = recolor_red_accents(a2_faded, team_key, max_hue_deg=13.5, min_sat=0.38)
        pa3f = recolor_red_accents(a3_faded, team_key, max_hue_deg=13.5, min_sat=0.38)

        atlas = Image.new('RGBA', (ATLAS_W, ATLAS_H), (0, 0, 0, 0))
        SC_W = 1.90
        SC_A = 1.94

        # ROW 0: IDLE (8 frames) — Cầm trượng đầu lâu nhún thở niệm chú nhẹ
        idle_specs = [
            (pa1, piv_a1, SC_A, -1.0, 1.01, 0.99,  0.0,  0.0),
            (pa1, piv_a1, SC_A, -2.0, 1.02, 0.98,  0.0, +0.5),
            (pa1, piv_a1, SC_A, -0.5, 1.01, 0.99,  0.0,  0.0),
            (pa1, piv_a1, SC_A, +0.8, 1.00, 1.00, +0.5, -1.0),
            (pa1, piv_a1, SC_A, +2.0, 0.99, 1.01, +1.0, -2.0),
            (pa1, piv_a1, SC_A, +1.0, 0.99, 1.01, +0.5, -1.0),
            (pa1, piv_a1, SC_A,  0.0, 1.00, 1.00,  0.0,  0.0),
            (pa1, piv_a1, SC_A, -0.8, 1.01, 0.99,  0.0,  0.0),
        ]
        for i, (sp, piv, sc, r, sx, sy, ox, oy) in enumerate(idle_specs):
            place_in_cell_anchored(atlas, i, 0, sp, piv, sc, r, sx, sy, ox, oy, rim_rgb=rim)

        # ROW 1: WALK (8 frames) — Bước nhảy múa linh thiêng của Thầy Mo
        walk_specs = [
            (pw0, piv_w0, SC_W,  0.0, 1.00, 1.00,  0.0,  0.0),
            (pw1, piv_w1, SC_W, -2.0, 1.02, 0.98, +1.0, -2.0),
            (pw2, piv_w2, SC_W, -1.5, 1.00, 1.01, +1.5, -5.0),
            (pw3, piv_w3, SC_W, +1.0, 0.99, 1.02,  0.0, -3.0),
            (pw0, piv_w0, SC_W, -0.5, 1.01, 0.99,  0.0,  0.0),
            (pw1, piv_w1, SC_W, -2.5, 1.02, 0.98, +1.5, -2.5),
            (pw2, piv_w2, SC_W, -1.0, 1.00, 1.01, +1.0, -5.5),
            (pw3, piv_w3, SC_W, +1.2, 0.99, 1.02, -0.5, -2.5),
        ]
        for i, (sp, piv, sc, r, sx, sy, ox, oy) in enumerate(walk_specs):
            place_in_cell_anchored(atlas, i, 1, sp, piv, sc, r, sx, sy, ox, oy, rim_rgb=rim)

        # ROW 2: ATTACK (8 frames) — 3 Pha: Chỉ trượng -> Vỗ trống tụ phép -> Phóng bão phép (frame 3) -> Hồi thế
        atk_specs = [
            (pa1,  piv_a1, SC_A, +1.5, 1.00, 1.00, -1.0, 0.0),  # 0: Ant1 chỉ trượng định vị
            (pa2f, piv_a2, SC_A, +3.5, 0.99, 1.02, -3.0, 0.0),  # 1: Ant2 vỗ trống bắt đầu tụ khí
            (pa2,  piv_a2, SC_A, +5.0, 0.98, 1.03, -4.0, -2.0), # 2: Ant3 khí vàng bừng sáng quanh trống
            (pa3,  piv_a3, SC_A, -2.0, 1.03, 0.98, +5.0, -4.0), # 3: RELEASE! Giơ 2 tay phóng cầu phép!
            (pa3,  piv_a3, SC_A, -3.5, 1.04, 0.97, +6.0, -3.0), # 4: Follow-through duy trì uy lực
            (pa3f, piv_a3, SC_A, -1.5, 1.01, 0.99, +3.0, -1.0), # 5: Rec1 năng lượng tan dần
            (pa2f, piv_a2, SC_A, +1.0, 1.00, 1.00, +1.0,  0.0), # 6: Rec2 hạ tay
            (pa1,  piv_a1, SC_A, -0.5, 1.00, 1.00,  0.0,  0.0), # 7: Rec3 về thế cầm trượng
        ]
        for i, (sp, piv, sc, r, sx, sy, ox, oy) in enumerate(atk_specs):
            place_in_cell_anchored(atlas, i, 2, sp, piv, sc, r, sx, sy, ox, oy, rim_rgb=rim)

        # ROW 3: HURT (0..2)
        place_in_cell_anchored(atlas, 0, 3, pa1, piv_a1, SC_A, +8.0,  1.02, 0.98, -4.0, 0.0, tint_red=0.14, rim_rgb=rim)
        place_in_cell_anchored(atlas, 1, 3, pw1, piv_w1, SC_W, +14.0, 1.03, 0.97, -7.0, 0.0, tint_red=0.22, rim_rgb=rim)
        place_in_cell_anchored(atlas, 2, 3, pa1, piv_a1, SC_A, +4.0,  1.01, 0.99, -2.0, 0.0, tint_red=0.08, rim_rgb=rim)

        # ROW 3 (3..7) + ROW 4 (0..3): DIE (9 frames)
        die_specs = [
            (3, 3, pa1, piv_a1, SC_A, +13.0, 0.99, 0.99,  +4.0,  0.0, 0.18),
            (4, 3, pw1, piv_w1, SC_W, +25.0, 1.02, 0.94, +14.0, +4.0, 0.16),
            (5, 3, pw1, piv_w1, SC_W, +39.0, 1.03, 0.92, +26.0, +5.0, 0.14),
            (6, 3, pw0, piv_w0, SC_W, +55.0, 1.00, 0.98, +38.0, +2.0, 0.11),
            (7, 3, pw0, piv_w0, SC_W, +71.0, 1.00, 0.98, +52.0, -2.0, 0.08),
            (0, 4, pw0, piv_w0, SC_W, +83.0, 1.03, 0.94, +62.0, -6.0, 0.06),
            (1, 4, pw0, piv_w0, SC_W, +87.0, 1.01, 0.97, +65.0, -8.0, 0.04),
            (2, 4, pw0, piv_w0, SC_W, +90.0, 1.03, 0.93, +68.0, -8.0, 0.02),
            (3, 4, pw0, piv_w0, SC_W, +90.0, 1.04, 0.92, +68.0, -8.0, 0.00),
        ]
        for c, row, sp, piv, sc, r, sx, sy, ox, oy, tr in die_specs:
            place_in_cell_anchored(atlas, c, row, sp, piv, sc, r, sx, sy, ox, oy, tint_red=tr, rim_rgb=rim)

        return finalize_atlas(atlas)

    blue = make_team('BLUE')
    red = make_team('RED')
    save_unit_bundle(
        era_dir='prehistoric',
        name='shaman',
        unit_id='stone_special',
        atlas_blue=blue,
        atlas_red=red,
        hitbox={'x': -35, 'y': -180, 'width': 70, 'height': 180},
        hurtbox={'width': 60, 'height': 132, 'offsetX': 0, 'offsetY': -66},
        stride_px=64,
        is_ranged=True,
        contact_out_path=os.path.join(SCRATCH_DIR, 'shaman_v2_contact.png'),
    )


if __name__ == '__main__':
    build_hunter()
    build_dino()
    build_shaman()
    print('=== COMPLETED PREHISTORIC ERA (HUNTER, DINO, SHAMAN) ===')
