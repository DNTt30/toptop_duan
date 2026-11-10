"""
Generator cho Bộ Sprite Sheet Action Frames chuẩn của Caveman (The Singularity Odyssey)
Atlas Size: 2048 x 1024 (Lưới 8 cột x 4 hàng, mỗi ô 256 x 256)
Các Clip chuẩn:
- IDLE: 4 frame (Hàng 0, frames 0-3)
- WALK: 8 frame (Hàng 1, frames 8-15) - Chu kỳ bước chân thật, sải chân nhịp nhàng
- ATTACK: 8 frame (Hàng 2, frames 16-23) - Giơ chùy -> Bổ cực mạnh (Hit frame 18) -> Thu về
- HURT: 3 frame (Hàng 3, frames 24-26) - Giật nảy ngửa người
- DIE: 5 frame (Hàng 3, frames 27-31) - Khuỵu gối -> Ngã sõng soài trên đất
"""

import math
import json
import os
from PIL import Image, ImageDraw

CELL_W = 256
CELL_H = 256
COLS = 8
ROWS = 4
ATLAS_W = CELL_W * COLS
ATLAS_H = CELL_H * ROWS

# Bảng màu Caveman Tiền Sử
C_SKIN = (217, 136, 64, 255)
C_SKIN_SHADOW = (166, 90, 32, 255)
C_SKIN_HIGHLIGHT = (245, 176, 102, 255)
C_HAIR = (43, 29, 12, 255)
C_BEARD = (55, 38, 16, 255)
C_FUR = (224, 149, 32, 255)
C_FUR_SPOT = (92, 46, 11, 255)
C_WOOD = (122, 75, 32, 255)
C_WOOD_DARK = (71, 38, 12, 255)
C_STONE = (160, 165, 170, 255)
C_WHITE = (255, 255, 255, 255)
C_EYE = (20, 15, 10, 255)
C_SLASH = (255, 230, 120, 220)
C_SLASH_CORE = (255, 255, 255, 255)

def draw_caveman_frame(draw, cell_col, cell_row, pose):
    """
    Vẽ 1 frame Caveman tại tọa độ ô lưới (cell_col, cell_row)
    pose dict chứa các thông số:
    - root_x, root_y (tâm gốc chân)
    - body_y_offset, body_tilt_deg
    - leg_l_angle, leg_r_angle
    - arm_l_angle, arm_r_angle (tay cầm chùy)
    - club_angle_deg, club_offset_x, club_offset_y
    - head_tilt_deg
    - slash_effect (None hoặc 'SWING_DOWN')
    - is_dead (ngã nằm ngang)
    - eye_state ('NORMAL', 'HURT', 'CLOSED')
    """
    origin_x = cell_col * CELL_W + 128
    origin_y = cell_row * CELL_H + 230 # Đáy chân chạm vạch đất ~230px (0.90 * 256) trong ô 256

    if pose.get('is_dead', False):
        # Trạng thái ngã nằm trên đất
        progress = pose.get('death_progress', 1.0)
        # Vẽ dáng ngã dần từ đứng đến nằm
        angle = progress * 90.0 # Ngã 90 độ
        dy = progress * 20.0
        
        # Thân nằm ngang
        body_len = 65
        th = 35
        bx = origin_x + progress * 20
        by = origin_y - 20 + dy
        draw.rounded_rectangle([bx - body_len//2, by - th//2, bx + body_len//2, by + th//2], radius=8, fill=C_FUR, outline=C_HAIR, width=3)
        # Đầu nằm
        hx = bx + body_len//2 + 10
        hy = by - 5
        draw.ellipse([hx - 18, hy - 18, hx + 18, hy + 18], fill=C_SKIN, outline=C_HAIR, width=3)
        # Tóc xù xung quanh
        draw.ellipse([hx - 12, hy - 25, hx + 22, hy - 5], fill=C_HAIR)
        # Mắt dấu x
        draw.line([hx - 4, hy - 4, hx + 4, hy + 4], fill=C_EYE, width=2)
        draw.line([hx - 4, hy + 4, hx + 4, hy - 4], fill=C_EYE, width=2)
        # Chân duỗi ngang
        draw.rounded_rectangle([bx - body_len//2 - 35, by - 5, bx - body_len//2, by + 12], radius=4, fill=C_SKIN, outline=C_HAIR, width=2)
        # Chùy rơi ra bên cạnh
        cx = bx - 10
        cy = by + 15
        draw.rounded_rectangle([cx - 40, cy - 8, cx + 15, cy + 8], radius=6, fill=C_WOOD, outline=C_WOOD_DARK, width=3)
        return

    # Tọa độ cơ thể sống
    body_y = origin_y - 85 + pose.get('body_y_offset', 0)
    body_x = origin_x + pose.get('body_x_offset', 0)
    body_tilt = pose.get('body_tilt_deg', 0)

    # 1. Vẽ Chân Sau (Leg Left / Back)
    leg_l_angle = math.radians(pose.get('leg_l_angle', 0))
    ll_end_x = body_x - 12 + math.sin(leg_l_angle) * 45
    ll_end_y = body_y + 40 + math.cos(leg_l_angle) * 45
    draw.line([body_x - 12, body_y + 40, ll_end_x, ll_end_y], fill=C_SKIN_SHADOW, width=16)
    draw.rounded_rectangle([ll_end_x - 6, ll_end_y - 4, ll_end_x + 18, ll_end_y + 8], radius=3, fill=C_SKIN_SHADOW)

    # 2. Vẽ Chùy Gỗ Phía Sau Nếu Vung Cao
    club_z = pose.get('club_z', 'FRONT')
    if club_z == 'BACK':
        _draw_club(draw, body_x, body_y, pose)

    # 3. Vẽ Thân Mình (Cơ bắp + Áo da thú)
    # Lưng & ngực
    draw.ellipse([body_x - 28, body_y - 25, body_x + 28, body_y + 45], fill=C_SKIN, outline=C_HAIR, width=3)
    # Váy da hổ/thú
    draw.polygon([
        (body_x - 30, body_y + 10),
        (body_x + 30, body_y + 10),
        (body_x + 36, body_y + 52),
        (body_x - 32, body_y + 55)
    ], fill=C_FUR, outline=C_HAIR, width=3)
    # Đốm lông thú
    draw.ellipse([body_x - 15, body_y + 22, body_x - 5, body_y + 30], fill=C_FUR_SPOT)
    draw.ellipse([body_x + 8, body_y + 32, body_x + 20, body_y + 40], fill=C_FUR_SPOT)

    # Đai xương chéo ngực
    draw.line([body_x - 22, body_y - 15, body_x + 22, body_y + 25], fill=C_WHITE, width=4)

    # 4. Vẽ Chân Trước (Leg Right / Front)
    leg_r_angle = math.radians(pose.get('leg_r_angle', 0))
    lr_end_x = body_x + 10 + math.sin(leg_r_angle) * 45
    lr_end_y = body_y + 40 + math.cos(leg_r_angle) * 45
    draw.line([body_x + 10, body_y + 40, lr_end_x, lr_end_y], fill=C_SKIN, width=17)
    draw.rounded_rectangle([lr_end_x - 6, lr_end_y - 4, lr_end_x + 20, lr_end_y + 8], radius=3, fill=C_SKIN, outline=C_HAIR, width=2)

    # 5. Vẽ Đầu & Khuôn Mặt
    head_x = body_x + 4 + math.sin(math.radians(body_tilt)) * 10
    head_y = body_y - 45 - math.cos(math.radians(body_tilt)) * 5
    
    # Tóc bù xù phía sau đầu
    draw.ellipse([head_x - 32, head_y - 32, head_x + 25, head_y + 15], fill=C_HAIR)
    draw.ellipse([head_x - 25, head_y - 38, head_x + 15, head_y - 10], fill=C_HAIR)
    
    # Hộp sọ / Khuôn mặt
    draw.ellipse([head_x - 18, head_y - 20, head_x + 24, head_y + 20], fill=C_SKIN, outline=C_HAIR, width=3)
    
    # Râu xồm xoàm thời tiền sử
    draw.polygon([
        (head_x - 10, head_y + 10),
        (head_x + 26, head_y + 8),
        (head_x + 20, head_y + 32),
        (head_x + 2, head_y + 35),
        (head_x - 12, head_y + 24)
    ], fill=C_BEARD, outline=C_HAIR, width=2)
    
    # Mũi to & Lông mày nhăn
    draw.ellipse([head_x + 14, head_y - 2, head_x + 25, head_y + 8], fill=C_SKIN_HIGHLIGHT)
    draw.line([head_x + 6, head_y - 12, head_x + 22, head_y - 8], fill=C_HAIR, width=4) # Lông mày

    # Mắt
    eye_mode = pose.get('eye_state', 'NORMAL')
    if eye_mode == 'HURT':
        # Mắt nhắm tịt đau đớn > <
        draw.line([head_x + 10, head_y - 8, head_x + 16, head_y - 4], fill=C_EYE, width=2)
        draw.line([head_x + 10, head_y, head_x + 16, head_y - 4], fill=C_EYE, width=2)
    else:
        # Mắt chiến binh mở to kiên định
        draw.rectangle([head_x + 11, head_y - 7, head_x + 17, head_y - 2], fill=C_WHITE)
        draw.rectangle([head_x + 14, head_y - 6, head_x + 17, head_y - 3], fill=C_EYE)

    # 6. Vẽ Tay & Chùy Phía Trước
    if club_z != 'BACK':
        _draw_club(draw, body_x, body_y, pose)

    # 7. Vẽ Hiệu Ứng Vệt Chém (Slash FX) nếu có
    if pose.get('slash_effect') == 'SWING_DOWN':
        # Vẽ vệt cung chém màu vàng/trắng cực mạnh
        sx = body_x + 65
        sy = body_y - 20
        draw.arc([sx - 90, sy - 70, sx + 50, sy + 70], start=280, end=75, fill=C_SLASH, width=14)
        draw.arc([sx - 85, sy - 65, sx + 45, sy + 65], start=290, end=65, fill=C_SLASH_CORE, width=6)


def _draw_club(draw, body_x, body_y, pose):
    """Vẽ cánh tay và cây chùy đá to lớn thời tiền sử"""
    arm_angle = math.radians(pose.get('arm_angle', 20))
    shoulder_x = body_x + 12
    shoulder_y = body_y - 15

    # Cánh tay
    hand_x = shoulder_x + math.sin(arm_angle) * 38
    hand_y = shoulder_y + math.cos(arm_angle) * 38
    draw.line([shoulder_x, shoulder_y, hand_x, hand_y], fill=C_SKIN, width=15)
    draw.ellipse([shoulder_x - 8, shoulder_y - 8, shoulder_x + 8, shoulder_y + 8], fill=C_SKIN)

    # Chùy gỗ xoay theo góc
    club_rot = math.radians(pose.get('club_rot_deg', -30))
    # Chiều dài chùy 85px, đầu chùy phình to 38px
    c_len = 80
    club_tip_x = hand_x + math.sin(club_rot) * c_len
    club_tip_y = hand_y - math.cos(club_rot) * c_len

    # Thân chùy gỗ
    draw.line([hand_x, hand_y, club_tip_x, club_tip_y], fill=C_WOOD, width=14)
    # Đầu chùy to đập đối thủ
    head_center_x = hand_x + math.sin(club_rot) * (c_len - 15)
    head_center_y = hand_y - math.cos(club_rot) * (c_len - 15)
    draw.ellipse([head_center_x - 18, head_center_y - 18, head_center_x + 18, head_center_y + 18], fill=C_WOOD_DARK, outline=C_HAIR, width=2)
    # Gai đá nhọn đính trên chùy
    gai_x = head_center_x + math.sin(club_rot + 0.4) * 16
    gai_y = head_center_y - math.cos(club_rot + 0.4) * 16
    draw.polygon([
        (gai_x, gai_y),
        (gai_x + 10, gai_y - 8),
        (gai_x + 6, gai_y + 10)
    ], fill=C_STONE, outline=C_HAIR)

    # Bàn tay nắm chặt cán chùy
    draw.ellipse([hand_x - 9, hand_y - 9, hand_x + 9, hand_y + 9], fill=C_SKIN, outline=C_HAIR, width=2)


def generate_full_atlas():
    atlas = Image.new("RGBA", (ATLAS_W, ATLAS_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(atlas)

    # ==================== HÀNG 0: IDLE (4 Frames: 0..3) ====================
    for i in range(4):
        t = i / 4.0
        bob = math.sin(t * math.pi * 2) * 4 # Nhún người 4px
        tilt = math.sin(t * math.pi * 2) * 2
        pose = {
            'body_y_offset': bob,
            'body_tilt_deg': tilt,
            'leg_l_angle': -8,
            'leg_r_angle': 8,
            'arm_angle': 25 + bob * 1.5,
            'club_rot_deg': -25 + bob * 2,
            'club_z': 'FRONT'
        }
        draw_caveman_frame(draw, i, 0, pose)

    # ==================== HÀNG 1: WALK (8 Frames: 8..15) ====================
    # Chu kỳ bước chân thật 8 frame: chân trái bước -> co gối -> chân phải bước
    for i in range(8):
        t = i / 8.0
        phase = t * math.pi * 2
        leg_l = math.sin(phase) * 32 # Vung chân trái qua lại +-32 độ
        leg_r = -leg_l               # Chân phải đối xứng
        bob = -abs(math.sin(phase)) * 8 # Dập dềnh trọng tâm chân chạm đất
        arm = -leg_l * 0.7 + 20      # Tay vung đối nghịch với chân
        club_rot = -30 + math.cos(phase) * 12
        pose = {
            'body_y_offset': bob,
            'body_x_offset': 0,
            'body_tilt_deg': 4, # Hơi rướn người về phía trước khi tiến
            'leg_l_angle': leg_l,
            'leg_r_angle': leg_r,
            'arm_angle': arm,
            'club_rot_deg': club_rot,
            'club_z': 'FRONT'
        }
        draw_caveman_frame(draw, i, 1, pose)

    # ==================== HÀNG 2: ATTACK (8 Frames: 16..23) ====================
    # Timeline đòn đánh thần tốc:
    # Frame 0-1: Ngửa người lấy đà, vung chùy lên quá đầu (Anticipation)
    # Frame 2: BỔ CHÙY CỰC MẠNH XUỐNG ĐẤT (HIT FRAME) + Vệt chém Slash vàng
    # Frame 3: Chùy dộng đất, rướn thân (Impact)
    # Frame 4-7: Thu chùy về tư thế thủ (Recovery)
    attack_poses = [
        # Frame 16: Bắt đầu giơ chùy
        {'body_x_offset': -4, 'body_tilt_deg': -6, 'arm_angle': -10, 'club_rot_deg': -65, 'leg_l_angle': -12, 'leg_r_angle': 10, 'club_z': 'BACK'},
        # Frame 17: Giơ chùy cực cao ra sau lưng
        {'body_x_offset': -8, 'body_tilt_deg': -14, 'arm_angle': -45, 'club_rot_deg': -110, 'leg_l_angle': -15, 'leg_r_angle': 14, 'club_z': 'BACK'},
        # Frame 18: HIT FRAME! Bổ chém cực mạnh về phía trước + Vệt chém
        {'body_x_offset': 16, 'body_tilt_deg': 24, 'arm_angle': 85, 'club_rot_deg': 55, 'leg_l_angle': 18, 'leg_r_angle': -18, 'club_z': 'FRONT', 'slash_effect': 'SWING_DOWN'},
        # Frame 19: Chùy dộng sát đất, thân gập
        {'body_x_offset': 18, 'body_tilt_deg': 28, 'arm_angle': 95, 'club_rot_deg': 75, 'leg_l_angle': 20, 'leg_r_angle': -20, 'club_z': 'FRONT'},
        # Frame 20: Bắt đầu nâng chùy lên
        {'body_x_offset': 10, 'body_tilt_deg': 16, 'arm_angle': 65, 'club_rot_deg': 30, 'leg_l_angle': 12, 'leg_r_angle': -12, 'club_z': 'FRONT'},
        # Frame 21: Thu về nửa đường
        {'body_x_offset': 4, 'body_tilt_deg': 8, 'arm_angle': 45, 'club_rot_deg': 0, 'leg_l_angle': 5, 'leg_r_angle': -5, 'club_z': 'FRONT'},
        # Frame 22: Chuẩn bị về thủ
        {'body_x_offset': 2, 'body_tilt_deg': 3, 'arm_angle': 30, 'club_rot_deg': -20, 'leg_l_angle': -4, 'leg_r_angle': 4, 'club_z': 'FRONT'},
        # Frame 23: Về trạng thái sẵn sàng
        {'body_x_offset': 0, 'body_tilt_deg': 0, 'arm_angle': 25, 'club_rot_deg': -25, 'leg_l_angle': -8, 'leg_r_angle': 8, 'club_z': 'FRONT'},
    ]
    for i, p in enumerate(attack_poses):
        draw_caveman_frame(draw, i, 2, p)

    # ==================== HÀNG 3: HURT (Frames 24..26) & DIE (Frames 27..31) ====================
    # HURT: 3 frames giật ngửa
    hurt_poses = [
        {'body_x_offset': -12, 'body_tilt_deg': -18, 'arm_angle': 40, 'club_rot_deg': -5, 'leg_l_angle': 15, 'leg_r_angle': -10, 'eye_state': 'HURT'},
        {'body_x_offset': -16, 'body_tilt_deg': -24, 'arm_angle': 50, 'club_rot_deg': 15, 'leg_l_angle': 20, 'leg_r_angle': -14, 'eye_state': 'HURT'},
        {'body_x_offset': -8, 'body_tilt_deg': -10, 'arm_angle': 30, 'club_rot_deg': -15, 'leg_l_angle': 5, 'leg_r_angle': -4, 'eye_state': 'NORMAL'},
    ]
    for i, p in enumerate(hurt_poses):
        draw_caveman_frame(draw, i, 3, p)

    # DIE: 5 frames ngã xuống
    for i in range(5):
        col = 3 + i
        progress = i / 4.0
        pose = {
            'is_dead': True,
            'death_progress': progress
        }
        draw_caveman_frame(draw, col, 3, pose)

    # Xuất ảnh ra đĩa
    out_dir = "apps/game/public/sprites/prehistoric"
    os.makedirs(out_dir, exist_ok=True)
    atlas_path = os.path.join(out_dir, "caveman_action_atlas.png")
    atlas.save(atlas_path, "PNG")
    print(f"[OK] Exported Atlas: {atlas_path} ({ATLAS_W}x{ATLAS_H})")

    # Tạo file animation.json v3.0 chuẩn xác
    anim_config = {
        "version": "3.0",
        "name": "caveman",
        "unitId": "stone_melee",
        "format": "FORGE_3_0",
        "meta": {
            "app": "the-singularity-odyssey",
            "version": "3.0",
            "image": "/sprites/prehistoric/caveman_action_atlas.png",
            "size": {"w": ATLAS_W, "h": ATLAS_H}
        },
        "fallback": {"cellSize": [CELL_W, CELL_H]},
        "frameCount": 32,
        "anchor": {"x": 0.5, "y": 0.90}, # Điểm chân chạm đất chuẩn
        "hurtbox": {"width": 64, "height": 130, "offsetX": 0, "offsetY": -65},
        "hitbox": {"width": 75, "height": 120, "range": 68},
        "clips": {
            "idle": {
                "name": "idle",
                "startFrame": 0,
                "frameCount": 4,
                "fps": 8,
                "loop": True
            },
            "walk": {
                "name": "walk",
                "startFrame": 8,
                "frameCount": 8,
                "fps": 12,
                "loop": True,
                "stridePx": 64
            },
            "attack": {
                "name": "attack",
                "startFrame": 16,
                "frameCount": 8,
                "fps": 12,
                "loop": False,
                "hitFrame": 2, # Frame thứ 2 trong clip (frame tuyệt đối 18) là HIT
                "events": [
                    {"name": "hit", "frame": 2, "atMs": 166, "type": "HIT_FRAME"},
                    {"name": "sound_swing", "frame": 1, "atMs": 83, "type": "SOUND", "sound": "melee_swing"},
                    {"name": "vfx_slash", "frame": 2, "atMs": 166, "type": "VFX", "vfx": "slash_spark"}
                ]
            },
            "hurt": {
                "name": "hurt",
                "startFrame": 24,
                "frameCount": 3,
                "fps": 12,
                "loop": False
            },
            "die": {
                "name": "die",
                "startFrame": 27,
                "frameCount": 5,
                "fps": 10,
                "loop": False
            }
        }
    }

    json_path = os.path.join(out_dir, "caveman_action_animation.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(anim_config, f, indent=2, ensure_ascii=False)
    print(f"[OK] Exported JSON: {json_path}")

if __name__ == "__main__":
    generate_full_atlas()
