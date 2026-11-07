"""
The Singularity Odyssey — Bộ Dựng Atlas Kỷ Nguyên Tiền Sử Chuẩn Xác 100%
Dựng đầy đủ 4 hàng cho cả 4 quân:
- Row 0: Idle (4 frames)
- Row 1: Walk (4 frames) - Chân chạm đất Y=230, không cụt, không đứt
- Row 2: Attack (3-4 frames) - Vũ khí trọn vẹn, không lấn cell
- Row 3: Hurt (2 frames) & Die (2 frames)
"""

import os
import sys
import json
import numpy as np
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')

def build_all_prehistoric_atlases():
    sheet_path = 'apps/game/public/concepts/prehistoric_concept_sheet.jpg'
    out_dir = 'apps/game/public/sprites/prehistoric'
    os.makedirs(out_dir, exist_ok=True)
    sheet = Image.open(sheet_path).convert('RGB')
    sheet_arr = np.array(sheet)

    units = [
        {
            'name': 'caveman',
            'unitId': 'stone_melee',
            'col_idx': 0,
            'scale': 2.15,
            'ground_y': 84,
            # (x1, x2) for walk on row 542..650
            'walk_boxes': [(50, 122), (126, 196), (200, 268), (268, 342)],
            # (x1, x2) for attack on row 650..768
            'attack_boxes': [(38, 132), (138, 250), (250, 344)],
        },
        {
            'name': 'hunter',
            'unitId': 'stone_ranged',
            'col_idx': 1,
            'scale': 2.10,
            'ground_y': 84,
            'walk_boxes': [(56, 120), (122, 186), (192, 256), (258, 330)],
            'attack_boxes': [(58, 126), (128, 232), (232, 342)],
        },
        {
            'name': 'dino',
            'unitId': 'stone_tank',
            'col_idx': 2,
            'scale': 1.85,
            'ground_y': 82,
            'walk_boxes': [(14, 130), (130, 246), (246, 344), (130, 246)],
            'attack_boxes': [(16, 132), (134, 250), (244, 344)],
        },
        {
            'name': 'shaman',
            'unitId': 'stone_special',
            'col_idx': 3,
            'scale': 2.10,
            'ground_y': 82,
            'walk_boxes': [(62, 114), (124, 176), (184, 246), (244, 320)],
            'attack_boxes': [(54, 136), (148, 216), (224, 322)],
        },
    ]

    for u in units:
        col_x0 = u['col_idx'] * 344
        col_crop = sheet_arr[:, col_x0:col_x0 + 344, :]
        scale = u['scale']
        base_gy = u['ground_y']

        # Khử phông trắng mượt mà
        diff = 255.0 - col_crop.astype(float)
        fg_mask = np.max(diff, axis=-1) > 22

        col_rgba = np.zeros((col_crop.shape[0], col_crop.shape[1], 4), dtype=np.uint8)
        col_rgba[:, :, :3] = col_crop
        col_rgba[:, :, 3] = np.where(fg_mask, 255, 0).astype(np.uint8)

        # Atlas 1536x1024 (6 cột, 4 hàng, mỗi ô 256x256)
        atlas = Image.new('RGBA', (1536, 1024), (0, 0, 0, 0))
        target_ground_y_in_cell = 230

        # 1. ROW 1: WALK (4 frames)
        walk_crops = []
        for c, (bx1, bx2) in enumerate(u['walk_boxes']):
            # Cắt dải walk: y = 542..542 + 96
            crop = col_rgba[542:542 + min(106, base_gy + 4), bx1:bx2, :]
            im = Image.fromarray(crop, 'RGBA')
            
            # Trim lề thừa nhẹ nhàng
            bbox = im.getbbox()
            if bbox:
                im = im.crop((bbox[0], 0, bbox[2], min(im.height, base_gy + 2)))
            
            w, h = im.size
            tw, th = int(w * scale), int(h * scale)
            scaled = im.resize((tw, th), Image.BICUBIC)
            walk_crops.append(scaled)

            # Căn giữa cell và chân chạm đúng target_ground_y_in_cell
            px = c * 256 + 128 - tw // 2
            py = 256 + target_ground_y_in_cell - int(base_gy * scale)
            # Giới hạn py không để lọt qua đáy cell
            py = max(256 + 10, min(256 + 250 - th, py))
            atlas.paste(scaled, (px, py), scaled)

        # 2. ROW 2: ATTACK (3-4 frames)
        attack_crops = []
        for c, (bx1, bx2) in enumerate(u['attack_boxes']):
            crop = col_rgba[650:650 + min(116, base_gy + 14), bx1:bx2, :]
            im = Image.fromarray(crop, 'RGBA')
            bbox = im.getbbox()
            if bbox:
                im = im.crop((bbox[0], 0, bbox[2], min(im.height, base_gy + 12)))
            w, h = im.size
            tw, th = int(w * scale), int(h * scale)
            scaled = im.resize((tw, th), Image.BICUBIC)
            attack_crops.append(scaled)

            px = c * 256 + 128 - tw // 2
            py = 512 + target_ground_y_in_cell - int(base_gy * scale)
            py = max(512 + 10, min(512 + 250 - th, py))
            atlas.paste(scaled, (px, py), scaled)

        # 3. ROW 0: IDLE (4 frames với nhịp thở)
        base_idle = walk_crops[0]
        for c in range(4):
            dy = int(np.sin(c / 4.0 * np.pi * 2) * 2)
            tw, th = base_idle.size
            px = c * 256 + 128 - tw // 2
            py = target_ground_y_in_cell - int(base_gy * scale) + dy
            py = max(10, min(250 - th, py))
            atlas.paste(base_idle, (px, py), base_idle)

        # 4. ROW 3: HURT (Col 0, 1) & DIE (Col 2, 3)
        # Hurt: Giật lùi ôm đòn (-12 độ)
        base_atk = attack_crops[0]
        hurt_im = base_atk.rotate(-10, resample=Image.BICUBIC)
        hw, hh = hurt_im.size
        # Hurt 1: Khớp giật
        px1 = 0 * 256 + 128 - hw // 2
        py1 = 768 + target_ground_y_in_cell - int(base_gy * scale)
        py1 = max(768 + 10, min(768 + 250 - hh, py1))
        atlas.paste(hurt_im, (px1, py1), hurt_im)

        # Hurt 2: Đẩy lùi sâu hơn + ửng đỏ nhẹ
        hurt2 = hurt_im.rotate(-16, resample=Image.BICUBIC)
        h2_arr = np.array(hurt2)
        # Tăng sắc đỏ khi trúng đòn
        h2_arr[:, :, 0] = np.clip(h2_arr[:, :, 0].astype(int) + 30, 0, 255).astype(np.uint8)
        hurt2_tinted = Image.fromarray(h2_arr, 'RGBA')
        hw2, hh2 = hurt2_tinted.size
        px2 = 1 * 256 + 128 - hw2 // 2 - 8
        py2 = 768 + target_ground_y_in_cell - int(base_gy * scale)
        py2 = max(768 + 10, min(768 + 250 - hh2, py2))
        atlas.paste(hurt2_tinted, (px2, py2), hurt2_tinted)

        # Die 1: Ngã nghiêng 45 độ, mờ dần
        die1 = base_atk.rotate(-35, resample=Image.BICUBIC)
        d1_arr = np.array(die1)
        d1_arr[:, :, 3] = (d1_arr[:, :, 3] * 0.75).astype(np.uint8)
        die1_im = Image.fromarray(d1_arr, 'RGBA')
        dw1, dh1 = die1_im.size
        px3 = 2 * 256 + 128 - dw1 // 2
        py3 = 768 + target_ground_y_in_cell - int(base_gy * scale * 0.7)
        py3 = max(768 + 10, min(768 + 250 - dh1, py3))
        atlas.paste(die1_im, (px3, py3), die1_im)

        # Die 2: Nằm sát sàn, mờ 35%
        die2 = base_atk.rotate(-70, resample=Image.BICUBIC)
        d2_arr = np.array(die2)
        d2_arr[:, :, 3] = (d2_arr[:, :, 3] * 0.35).astype(np.uint8)
        die2_im = Image.fromarray(d2_arr, 'RGBA')
        dw2, dh2 = die2_im.size
        px4 = 3 * 256 + 128 - dw2 // 2
        py4 = 768 + target_ground_y_in_cell - int(base_gy * scale * 0.35)
        py4 = max(768 + 10, min(768 + 250 - dh2, py4))
        atlas.paste(die2_im, (px4, py4), die2_im)

        # Lưu atlas
        out_atlas_path = f"{out_dir}/{u['name']}_atlas.png"
        atlas.save(out_atlas_path, optimize=True)
        print(f"Đã tạo hoàn chỉnh: {out_atlas_path}")

        # Cập nhật animation.json chuẩn
        anim_json_path = f"{out_dir}/{u['name']}_animation.json"
        anim_data = {
            "version": "3.0",
            "name": u['name'],
            "unitId": u['unitId'],
            "format": "FORGE_3_0",
            "meta": {
                "app": "agent-sprite-forge",
                "version": "3.0",
                "image": f"/sprites/prehistoric/{u['name']}_atlas.png",
                "size": { "w": 1536, "h": 1024 }
            },
            "fallback": {
                "cellSize": [256, 256]
            },
            "frameCount": 24,
            "anchor": { "x": 0.5, "y": 0.90 },
            "hitbox": { "x": -35, "y": -190, "width": 70, "height": 190 },
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
                    "startFrame": 6,
                    "frameCount": len(u['walk_boxes']),
                    "fps": 10,
                    "loop": True,
                    "stridePx": 64
                },
                "attack": {
                    "name": "attack",
                    "startFrame": 12,
                    "frameCount": len(u['attack_boxes']),
                    "fps": 10,
                    "loop": False,
                    "hitFrame": 1,
                    "events": [
                        { "name": "hit", "frame": 1, "atMs": 100 }
                    ]
                },
                "hurt": {
                    "name": "hurt",
                    "startFrame": 18,
                    "frameCount": 2,
                    "fps": 8,
                    "loop": False
                },
                "die": {
                    "name": "die",
                    "startFrame": 20,
                    "frameCount": 2,
                    "fps": 8,
                    "loop": False
                }
            }
        }
        with open(anim_json_path, 'w', encoding='utf-8') as f_json:
            json.dump(anim_data, f_json, indent=2)
        print(f"Đã cập nhật manifest: {anim_json_path}")

if __name__ == '__main__':
    build_all_prehistoric_atlases()
