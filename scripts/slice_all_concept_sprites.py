"""
The Singularity Odyssey — Bộ Cắt Lát Sprite Chuẩn Hóa Cố Định Mặt Sàn (Fixed-Baseline Slicing)
Khắc phục triệt để:
1. Không cắt xén trục Y độc lập -> Cố định đường chân đất (Ground Baseline) trên toàn bộ dải frame.
2. Mở rộng lề an toàn trục X (Safe Padding +8px) -> Không bao giờ bị mất 1/5 nhân vật hay cụt vũ khí.
3. Dùng chung một hệ số scale cố định (Uniform Scale) -> Nhân vật không bị co dãn thất thường giữa các frame.
"""

import sys
import os
import json
import numpy as np
from PIL import Image
from scipy.ndimage import label, find_objects

def slice_all_concept_sprites_fixed_baseline():
    age_meta = [
        (1, 'prehistoric', 'prehistoric',
         ['stone_melee', 'stone_ranged', 'stone_tank', 'stone_special'],
         ['caveman', 'hunter', 'dino', 'shaman'],
         [False, False, False, False]),
        (2, 'medieval', 'medieval',
         ['med_melee', 'med_ranged', 'med_tank', 'med_special'],
         ['knight', 'archer', 'cavalry', 'priest'],
         [False, False, False, False]),
        (3, 'renaissance', 'renaissance',
         ['ren_melee', 'ren_ranged', 'ren_tank', 'ren_special'],
         ['pike', 'musket', 'cannon_cart', 'glider'],
         [False, False, False, True]),
        (4, 'modern', 'modern',
         ['mod_melee', 'mod_ranged', 'mod_tank', 'mod_special'],
         ['specops', 'sniper', 'tank', 'apache'],
         [False, False, False, True]),
        (5, 'futuristic', 'futuristic',
         ['fut_melee', 'fut_ranged', 'fut_tank', 'fut_special'],
         ['plasma_sword', 'railgun', 'titan_mech', 'carrier'],
         [False, False, False, True]),
        (6, 'ai', 'ai_singularity',
         ['ai_drone_swarm', 'ai_neural_hacker', 'ai_quantum_synth', 'ai_avatar_hologram'],
         ['drone_swarm', 'hacker', 'synth_mech', 'avatar'],
         [True, False, False, False]),
    ]

    cols_per_atlas = 6
    rows_per_atlas = 4
    cell_w = 256
    cell_h = 256
    atlas_w = cols_per_atlas * cell_w  # 1536
    atlas_h = rows_per_atlas * cell_h  # 1024

    for age_id, folder, sheet_name, ids, names, flyings in age_meta:
        sheet_path = f'apps/game/public/concepts/{sheet_name}_concept_sheet.jpg'
        out_dir = f'apps/game/public/sprites/{folder}'
        os.makedirs(out_dir, exist_ok=True)
        sheet = Image.open(sheet_path).convert('RGB')
        col_w = sheet.width // 4  # 344

        for col_idx in range(4):
            unit_id = ids[col_idx]
            unit_name = names[col_idx]
            is_flying = flyings[col_idx]

            strip_crop = sheet.crop((col_idx * col_w, 542, (col_idx + 1) * col_w, 765))
            arr = np.array(strip_crop).astype(np.float32)

            # 1. Khử phông nền chính xác
            if age_id == 4:  # Modern
                bg = np.array([184, 186, 175], dtype=np.float32)
                diff = np.abs(arr[:, :, :3] - bg).sum(axis=-1)
                is_border = (arr[:, :, 0] < 55) & (arr[:, :, 1] < 55) & (arr[:, :, 2] < 55)
                fg_mask = (diff > 25) & (~is_border)
            elif age_id == 5:  # Futuristic
                color_std = np.std(arr[:, :, :3], axis=-1)
                mean_brightness = np.mean(arr[:, :, :3], axis=-1)
                is_bg = (mean_brightness > 210) & (color_std < 10)
                fg_mask = ~is_bg
            else:  # White bg
                diff = 255.0 - arr[:, :, :3]
                fg_mask = np.max(diff, axis=-1) > 22

            rgba = np.zeros((arr.shape[0], arr.shape[1], 4), dtype=np.uint8)
            rgba[:, :, :3] = np.clip(arr[:, :, :3], 0, 255).astype(np.uint8)
            rgba[:, :, 3] = np.where(fg_mask, 255, 0).astype(np.uint8)

            # 2. Định nghĩa Row 1 (Walk) và Row 2 (Attack)
            # Row 1: y = 0..106, đường chân đất cố định ~ 88
            # Row 2: y = 106..223, đường chân đất cố định ~ 205 (y tương đối trong row 2 = 99)
            baseline_y1 = 88
            baseline_y2 = 99

            r1_mask = fg_mask[0:106, :]
            r2_mask = fg_mask[106:223, :]

            # Tìm các khung cắt cho Row 1 (Walk)
            if age_id == 4:
                offsets = [18, 15, 12, 10]
                x0 = offsets[col_idx]
                w_boxes = [(max(0, x0 + i * 78), min(344, x0 + (i + 1) * 78)) for i in range(4)]
            else:
                labeled, _ = label(r1_mask)
                objs = [o for o in find_objects(labeled) if np.sum(labeled[o[0], o[1]] > 0) > 300]
                objs.sort(key=lambda o: o[1].start)
                if len(objs) < 2:
                    # Chia đều nếu bị dính chùm
                    w_boxes = [(i * 86, (i + 1) * 86) for i in range(4)]
                else:
                    w_boxes = []
                    for i, o in enumerate(objs):
                        x1 = max(0, o[1].start - 8)
                        x2 = min(344, o[1].stop + 8)
                        # Nếu chồng lấn với box trước đó, gộp hoặc chia đôi
                        if w_boxes and x1 < w_boxes[-1][1]:
                            mid = (x1 + w_boxes[-1][1]) // 2
                            w_boxes[-1] = (w_boxes[-1][0], mid)
                            x1 = mid
                        w_boxes.append((x1, x2))

            # Tìm các khung cắt cho Row 2 (Attack)
            if age_id == 4:
                offsets = [18, 15, 12, 10]
                x0 = offsets[col_idx]
                a_boxes = [(max(0, x0 + i * 78), min(344, x0 + (i + 1) * 78)) for i in range(4)]
            else:
                labeled2, _ = label(r2_mask)
                objs2 = [o for o in find_objects(labeled2) if np.sum(labeled2[o[0], o[1]] > 0) > 300]
                objs2.sort(key=lambda o: o[1].start)
                if len(objs2) < 2:
                    a_boxes = [(i * 114, min(344, (i + 1) * 114)) for i in range(3)]
                else:
                    a_boxes = []
                    for i, o in enumerate(objs2):
                        x1 = max(0, o[1].start - 10)
                        x2 = min(344, o[1].stop + 10)
                        if a_boxes and x1 < a_boxes[-1][1]:
                            mid = (x1 + a_boxes[-1][1]) // 2
                            a_boxes[-1] = (a_boxes[-1][0], mid)
                            x1 = mid
                        a_boxes.append((x1, x2))

            # Giới hạn số lượng frame hợp lý
            w_boxes = w_boxes[:6]
            a_boxes = a_boxes[:6]

            # 3. Tạo Atlas 1536x1024 với CỐ ĐỊNH ĐƯỜNG MẶT ĐẤT
            atlas_im = Image.new('RGBA', (atlas_w, atlas_h), (0, 0, 0, 0))
            anchor_x = 128
            anchor_y = 175 if is_flying else 235
            scale = 1.85 if 'tank' in unit_id or 'synth' in unit_id or 'titan' in unit_id else 2.0

            # Cắt và dán Row 1 (Walk) giữ nguyên chiều cao đến baseline
            walk_crops = []
            for col, (bx1, bx2) in enumerate(w_boxes):
                # Cắt toàn bộ chiều cao từ đỉnh đến sát vạch mặt đất
                crop_arr = rgba[0:min(106, baseline_y1 + 4), bx1:bx2, :]
                f_im = Image.fromarray(crop_arr, 'RGBA')
                walk_crops.append(f_im)

                fw, fh = f_im.size
                tw = int(fw * scale)
                th = int(fh * scale)
                scaled = f_im.resize((tw, th), Image.BICUBIC)

                # Định vị dán sao cho baseline_y1 * scale chạm đúng anchor_y
                px = col * cell_w + anchor_x - tw // 2
                py = anchor_y - int(baseline_y1 * scale)
                atlas_im.paste(scaled, (px, py), scaled)

            # Cắt và dán Row 2 (Attack) giữ nguyên chiều cao đến baseline
            attack_crops = []
            for col, (bx1, bx2) in enumerate(a_boxes):
                crop_arr = rgba[106:106 + min(117, baseline_y2 + 4), bx1:bx2, :]
                f_im = Image.fromarray(crop_arr, 'RGBA')
                attack_crops.append(f_im)

                fw, fh = f_im.size
                tw = int(fw * scale)
                th = int(fh * scale)
                scaled = f_im.resize((tw, th), Image.BICUBIC)

                px = col * cell_w + anchor_x - tw // 2
                py = anchor_y - int(baseline_y2 * scale)
                atlas_im.paste(scaled, (col * cell_w + anchor_x - tw // 2, py), scaled)

            # Row 0: Idle (dùng walk_crops[0] với nhịp thở nhẹ)
            base_idle = walk_crops[0]
            for col in range(4):
                dy = int(np.sin(col / 4.0 * np.pi * 2) * 2)
                fw, fh = base_idle.size
                tw = int(fw * scale)
                th = int(fh * scale)
                scaled = base_idle.resize((tw, th), Image.BICUBIC)
                px = col * cell_w + anchor_x - tw // 2
                py = anchor_y - int(baseline_y1 * scale) + dy
                atlas_im.paste(scaled, (px, py), scaled)

            # Row 3: Hurt & Die
            hurt_f = attack_crops[0].rotate(-12, resample=Image.BICUBIC)
            fw, fh = hurt_f.size
            tw, th = int(fw * scale), int(fh * scale)
            scaled_h = hurt_f.resize((tw, th), Image.BICUBIC)
            px_h = anchor_x - tw // 2
            py_h = anchor_y - int(baseline_y2 * scale)
            atlas_im.paste(scaled_h, (0 * cell_w + px_h, py_h), scaled_h)
            atlas_im.paste(scaled_h, (1 * cell_w + px_h, py_h), scaled_h)

            die_f = attack_crops[-1].rotate(-70, resample=Image.BICUBIC)
            fw, fh = die_f.size
            tw, th = int(fw * scale), int(fh * scale)
            scaled_d = die_f.resize((tw, th), Image.BICUBIC)
            atlas_im.paste(scaled_d, (2 * cell_w + anchor_x - tw // 2, anchor_y - int(baseline_y2 * scale) + 10), scaled_d)
            atlas_im.paste(scaled_d, (3 * cell_w + anchor_x - tw // 2, anchor_y - int(baseline_y2 * scale) + 10), scaled_d)

            atlas_path = f'{out_dir}/{unit_name}_atlas.png'
            atlas_im.save(atlas_path)

            n_walk = len(walk_crops)
            n_attack = len(attack_crops)
            hit_idx = 1 if n_attack >= 2 else 0

            anim_json = {
                'version': '3.0',
                'name': unit_name,
                'unitId': unit_id,
                'format': 'FORGE_3_0',
                'meta': {
                    'app': 'agent-sprite-forge',
                    'version': '3.0',
                    'image': f'/sprites/{folder}/{unit_name}_atlas.png',
                    'size': {'w': atlas_w, 'h': atlas_h}
                },
                'fallback': {'cellSize': [cell_w, cell_h]},
                'frameCount': 24,
                'anchor': {'x': 0.5, 'y': 0.68 if is_flying else 0.92},
                'hitbox': {'x': -35, 'y': -170 if is_flying else -190, 'width': 70, 'height': 170 if is_flying else 190},
                'clips': {
                    'idle': {'name': 'idle', 'startFrame': 0, 'frameCount': 4, 'fps': 8, 'loop': True},
                    'walk': {'name': 'walk', 'startFrame': 6, 'frameCount': n_walk, 'fps': 10, 'loop': True, 'stridePx': 64},
                    'attack': {
                        'name': 'attack',
                        'startFrame': 12,
                        'frameCount': n_attack,
                        'fps': 12,
                        'loop': False,
                        'hitFrame': hit_idx,
                        'events': [{'name': 'hit', 'frame': hit_idx, 'atMs': int(hit_idx / 12.0 * 1000)}]
                    },
                    'hurt': {'name': 'hurt', 'startFrame': 18, 'frameCount': 2, 'fps': 8, 'loop': False},
                    'die': {'name': 'die', 'startFrame': 20, 'frameCount': 2, 'fps': 8, 'loop': False}
                }
            }

            with open(f'{out_dir}/{unit_name}_animation.json', 'w', encoding='utf-8') as fj:
                json.dump(anim_json, fj, indent=2)

            print(f'Fixed Baseline OK: {folder}/{unit_name} | Walk={n_walk}f | Attack={n_attack}f | GroundY={anchor_y}')

if __name__ == '__main__':
    slice_all_concept_sprites_fixed_baseline()
