"""
Build complete 4-row Sprite Atlases (1536x1024, 6x4 cells of 256x256) and FORGE_3_0 manifests
for ALL 20 units across Ages 2, 3, 4, 5, and 6:
- Row 0 (frames 0..3): Idle (4 frames)
- Row 1 (frames 6..9): Walk (4 frames, 0px bleed in y=502..512)
- Row 2 (frames 12..15): Attack (4 frames, hitFrame=1)
- Row 3 (frames 18..19 Hurt, 20..21 Die): Hurt (2F) + Die (2F)
"""

import os
import sys
import json
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import label, find_objects, binary_fill_holes

sys.stdout.reconfigure(encoding="utf-8")

CELL_W = 256
CELL_H = 256
ATLAS_W = 6 * CELL_W  # 1536
ATLAS_H = 4 * CELL_H  # 1024


def key_white_exterior(rgb_arr: np.ndarray, thresh: float = 24.0) -> np.ndarray:
    h, w, _ = rgb_arr.shape
    diff = 255.0 - rgb_arr.astype(np.float32)
    near_white = np.max(diff, axis=-1) < thresh
    labeled, _ = label(near_white)
    border_ids = set()
    border_ids.update(np.unique(labeled[0, :]))
    border_ids.update(np.unique(labeled[h - 1, :]))
    border_ids.update(np.unique(labeled[:, 0]))
    border_ids.update(np.unique(labeled[:, w - 1]))
    border_ids.discard(0)
    ext = np.isin(labeled, list(border_ids))
    fg = binary_fill_holes(~ext)
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[:, :, :3] = rgb_arr
    rgba[:, :, 3] = np.where(fg, 255, 0)
    return rgba


def clean_master_unit_rgba(im: Image.Image) -> Image.Image:
    """Remove any stray neighboring-column artifact near image borders while keeping main unit + close props."""
    struct8 = np.ones((3, 3), dtype=int)
    arr = np.array(im.convert("RGBA"))
    for _pass in range(2):
        fg = arr[:, :, 3] > 10
        labeled, num = label(fg, structure=struct8)
        if num <= 1:
            break
        h, w = fg.shape
        areas = [(i, int(np.sum(labeled == i))) for i in range(1, num + 1)]
        main_id, main_area = max(areas, key=lambda x: x[1])

        keep = np.zeros_like(fg, dtype=bool)
        for comp_id, area in areas:
            if comp_id == main_id:
                keep |= (labeled == comp_id)
                continue
            c_ys, c_xs = np.where(labeled == comp_id)
            cx1, cx2, cy1, _cy2 = int(c_xs.min()), int(c_xs.max()), int(c_ys.min()), int(c_ys.max())
            touches_edge = (cx2 >= w - 6) or (cx1 <= 5) or (cy1 <= 2)
            detached_side = (cx1 <= 8 and cx2 <= 98) or (cx2 >= w - 9 and cx1 >= w - 99)
            if (touches_edge and area < main_area * 0.25) or detached_side:
                continue
            if area >= 80:
                keep |= (labeled == comp_id)

        arr[:, :, 3] = np.where(keep, arr[:, :, 3], 0)
        out_pass = Image.fromarray(arr, "RGBA")
        bbox_pass = out_pass.getbbox()
        if bbox_pass:
            arr = np.array(out_pass.crop(bbox_pass))

    out = Image.fromarray(arr, "RGBA")
    bbox = out.getbbox()
    return out.crop(bbox) if bbox else out


def pad_portrait_margins(im: Image.Image, pad_x: int = 10, pad_y: int = 4) -> Image.Image:
    """Add safe transparent horizontal/vertical margin so portrait pixels never touch x=0..2 or x=w-3..w-1."""
    canvas = Image.new("RGBA", (im.width + pad_x * 2, im.height + pad_y * 2), (0, 0, 0, 0))
    canvas.paste(im, (pad_x, pad_y), im)
    return canvas


def clean_pose_crop_rgba(sub_arr: np.ndarray) -> np.ndarray:
    """Strip severed weapon tips / neighbor fragments touching the left/right cut boundary of an extracted pose."""
    arr = sub_arr.copy()
    struct8 = np.ones((3, 3), dtype=int)
    fg = arr[:, :, 3] > 10
    labeled, num = label(fg, structure=struct8)
    if num <= 1:
        return arr
    _sh, sw = fg.shape
    areas = [(i, int(np.sum(labeled == i))) for i in range(1, num + 1)]
    main_id, main_area = max(areas, key=lambda x: x[1])

    keep = np.zeros_like(fg, dtype=bool)
    for comp_id, area in areas:
        if comp_id == main_id:
            keep |= (labeled == comp_id)
            continue
        _ys, xs = np.where(labeled == comp_id)
        cx1, cx2 = int(xs.min()), int(xs.max())
        span_w = cx2 - cx1 + 1
        # Neighbor spear/barrel fragments severed by valley cut touch cx1<=3 or cx2>=sw-4 and are much narrower/smaller than body
        if area < 25:
            continue
        if (cx1 <= 4 or cx2 >= sw - 5) and span_w < sw * 0.48 and area < main_area * 0.25:
            continue
        keep |= (labeled == comp_id)

    arr[~keep] = 0
    return arr


def clean_all_24_hud_portraits():
    """Clean edge artifacts and 3px left/right border bleed on all 24 HUD portraits while preserving wide ground shadows."""
    struct8 = np.ones((3, 3), dtype=int)
    cleaned_count = 0
    for age in range(1, 7):
        for kind in ["melee", "ranged", "tank", "special"]:
            path = f"apps/game/public/assets/units/age{age}_unit_{kind}.png"
            im = Image.open(path).convert("RGBA")
            arr = np.array(im)
            h, w, _ = arr.shape

            for pass_idx in range(2):
                fg = arr[:, :, 3] > 10
                labeled, num = label(fg, structure=struct8)
                if num > 1:
                    comps = []
                    for cid in range(1, num + 1):
                        _ys, xs = np.where(labeled == cid)
                        comps.append((cid, len(xs), int(xs.min()), int(xs.max())))
                    comps.sort(key=lambda x: -x[1])
                    for cid, cnt, min_x, max_x in comps[1:]:
                        is_edge_blob = (min_x <= 8 and max_x <= 98) or (max_x >= w - 9 and min_x >= w - 99)
                        if is_edge_blob or (cnt < 80 and (min_x <= 8 or max_x >= w - 9)):
                            arr[labeled == cid] = 0

                if pass_idx == 0:
                    arr[:, :3, :] = 0
                    arr[:, w - 3 :, :] = 0

            opaque = int(np.sum(arr[:, :, 3] > 10))
            left_g = int(np.sum(arr[:, :3, 3] > 10))
            right_g = int(np.sum(arr[:, w - 3 :, 3] > 10))
            assert opaque > 5000, f"Portrait {path} has too few opaque pixels: {opaque}"
            assert left_g == 0 and right_g == 0, f"Portrait {path} still has border pixels: L={left_g}, R={right_g}"

            Image.fromarray(arr, "RGBA").save(path, optimize=True)
            cleaned_count += 1

    print(f"[OK] Cleaned all {cleaned_count}/24 HUD unit portraits (0 border garbage, shadows preserved).")


def fit_to_cell(im: Image.Image, max_w: int = 224, max_h: int = 212) -> Image.Image:
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    w, h = im.size
    if w <= 0 or h <= 0:
        return Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    scale = min(max_w / w, max_h / h)
    tw = max(1, int(round(w * scale)))
    th = max(1, int(round(h * scale)))
    return im.resize((tw, th), Image.LANCZOS)


def paste_in_cell(atlas: Image.Image, row: int, col: int, sprite: Image.Image, is_flying: bool, dx: int = 0, dy: int = 0):
    sw, sh = sprite.size
    cell_x0 = col * CELL_W
    cell_y0 = row * CELL_H

    target_foot_y = 195 if is_flying else 230
    px = cell_x0 + 128 - sw // 2 + dx
    py = cell_y0 + target_foot_y - sh + dy

    px = max(cell_x0 + 4, min(cell_x0 + CELL_W - sw - 4, px))
    max_bottom = 244 if row == 1 else 250
    py = max(cell_y0 + 6, min(cell_y0 + max_bottom - sh, py))
    atlas.paste(sprite, (px, py), sprite)


def ensure_4_frames(crops: list[Image.Image]) -> list[Image.Image]:
    if len(crops) == 0:
        raise ValueError("Empty crop list!")
    if len(crops) >= 4:
        return crops[:4]
    if len(crops) == 3:
        return [crops[0], crops[1], crops[2], crops[1]]
    if len(crops) == 2:
        return [crops[0], crops[1], crops[0], crops[1]]
    return [crops[0], crops[0], crops[0], crops[0]]


def extract_row_sprites_general(rgba_strip: np.ndarray, expected_count: int = 4) -> list[Image.Image]:
    """
    Valley-aware pose splitter:
    1. Strips disconnected neighbor-column weapon tips touching x=0 or x=W-1, and tiny flying bullets/sparks (< 450px).
    2. Finds body torso cores using col_counts > 14 so thin touching spears/rifles don't merge bodies!
    3. Splits cleanly at the exact local minimum valley of col_counts between adjacent body cores!
    """
    rgba = rgba_strip.copy()
    fg = rgba[:, :, 3] > 20
    h, w = fg.shape

    labeled, num = label(fg)
    keep_mask = np.zeros_like(fg, dtype=bool)
    for cid in range(1, num + 1):
        comp = (labeled == cid)
        area = int(np.sum(comp))
        ys, xs = np.where(comp)
        x1, x2 = int(xs.min()), int(xs.max())
        cx = float(xs.mean())
        # Filter tiny isolated bullets/sparks (< 420px) and neighbor-column tips stuck to left/right edge
        if area < 420:
            continue
        if (x1 <= 1 and cx < 24 and area < 1800) or (x2 >= w - 2 and cx > w - 24 and area < 1800):
            continue
        keep_mask |= comp

    if np.sum(keep_mask) < 500:
        keep_mask = fg

    rgba[:, :, 3] = np.where(keep_mask, rgba[:, :, 3], 0)
    col_counts = np.sum(keep_mask, axis=0)

    # Detect torso cores where vertical pixel thickness > 14px (spear shafts / gun barrels are only 3-8px thick!)
    core = col_counts > 14
    cores = []
    in_c = False
    cs = 0
    for x, v in enumerate(core):
        if v and not in_c:
            in_c = True
            cs = x
        elif not v and in_c:
            in_c = False
            if x - cs >= 12:
                cores.append([cs, x])
    if in_c and w - cs >= 12:
        cores.append([cs, w])

    # Merge floating FX cores (smoke puffs / magic orbs that don't reach the ground) into their attacker's core!
    merged_cores = []
    for c in cores:
        sub_mask = keep_mask[:, c[0]:c[1]]
        ys_c = np.where(sub_mask)[0]
        reaches_low = (len(ys_c) > 0 and int(ys_c.max()) >= int(h * 0.78))
        if merged_cores and not reaches_low:
            merged_cores[-1][1] = c[1]
        elif merged_cores and (c[0] - merged_cores[-1][1] < 6) and (c[1] - merged_cores[-1][0] < 72):
            merged_cores[-1][1] = c[1]
        else:
            merged_cores.append(c)

    # If one wide core still holds 2+ bodies (e.g. heavy overlapping cavalry/drones), split wide cores at deepest internal valley
    final_cores = []
    for c0, c1 in merged_cores:
        cw = c1 - c0
        if cw > 135 and len(merged_cores) < expected_count:
            n_sub = max(2, min(expected_count, int(round(cw / 78.0))))
            step = cw / n_sub
            prev_cut = c0
            for k in range(1, n_sub):
                approx = int(round(c0 + k * step))
                win_l = max(prev_cut + 18, approx - 16)
                win_r = min(c1 - 18, approx + 16)
                cut = win_l + int(np.argmin(col_counts[win_l:win_r + 1])) if win_r >= win_l else approx
                final_cores.append([prev_cut, cut])
                prev_cut = cut
            final_cores.append([prev_cut, c1])
        else:
            final_cores.append([c0, c1])

    if len(final_cores) == 0:
        step = w // expected_count
        spans = [(i * step, (i + 1) * step) for i in range(expected_count)]
    elif len(final_cores) == 1:
        x_nz = np.where(col_counts > 0)[0]
        spans = [(int(x_nz[0]), int(x_nz[-1]) + 1)] if len(x_nz) else [(0, w)]
    else:
        # Cut at exact minimum of col_counts between consecutive torso cores!
        cuts = []
        for i in range(len(final_cores) - 1):
            left_end = final_cores[i][1]
            right_start = final_cores[i + 1][0]
            if right_start > left_end:
                cut = left_end + int(np.argmin(col_counts[left_end:right_start + 1]))
            else:
                cut = (left_end + right_start) // 2
            cuts.append(cut)

        x_nz = np.where(col_counts > 0)[0]
        first_x = max(0, min(final_cores[0][0], int(x_nz[0])) - 2)
        last_x = min(w, max(final_cores[-1][1], int(x_nz[-1]) + 1) + 2)
        bounds = [first_x] + cuts + [last_x]
        spans = [(bounds[i], bounds[i + 1]) for i in range(len(bounds) - 1)]

    out = []
    for x1, x2 in spans[:6]:
        if x2 - x1 < 16:
            continue
        cleaned_sub = clean_pose_crop_rgba(rgba[:, x1:x2, :])
        sub = Image.fromarray(cleaned_sub, "RGBA")
        bbox = sub.getbbox()
        if bbox and (bbox[2] - bbox[0]) >= 14 and (bbox[3] - bbox[1]) >= 22:
            out.append(sub)
    return out


def extract_modern_grid_boxes(col_rgb: np.ndarray, y1: int, y2: int, n_boxes: int) -> list[Image.Image]:
    strip = col_rgb[y1:y2, :, :]
    dark = (strip[:, :, 0] < 65) & (strip[:, :, 1] < 65) & (strip[:, :, 2] < 65)
    vert_lines = np.where(np.mean(dark, axis=0) > 0.45)[0]
    if len(vert_lines) >= 2:
        x_left = int(vert_lines[0])
        x_right = int(vert_lines[-1])
    else:
        x_left, x_right = 8, strip.shape[1] - 8

    horiz_lines = np.where(np.mean(dark[:, x_left:x_right], axis=1) > 0.45)[0]
    yt = int(horiz_lines[0]) + 3 if len(horiz_lines) >= 2 else 4
    yb = int(horiz_lines[-1]) - 3 if len(horiz_lines) >= 2 else strip.shape[0] - 4

    total_w = x_right - x_left
    box_w = total_w / n_boxes
    out = []
    for i in range(n_boxes):
        bx1 = int(round(x_left + i * box_w)) + 4
        bx2 = int(round(x_left + (i + 1) * box_w)) - 4
        sub_rgb = strip[yt:yb, bx1:bx2, :]
        corners = np.concatenate([sub_rgb[0:5, 0:5].reshape(-1, 3), sub_rgb[0:5, -5:].reshape(-1, 3)], axis=0)
        bg_med = np.median(corners, axis=0)
        diff = np.linalg.norm(sub_rgb.astype(np.float32) - bg_med, axis=-1)
        fg = binary_fill_holes(diff > 24.0)
        rgba = np.zeros((sub_rgb.shape[0], sub_rgb.shape[1], 4), dtype=np.uint8)
        rgba[:, :, :3] = sub_rgb
        rgba[:, :, 3] = np.where(fg, 255, 0)
        im = Image.fromarray(rgba, "RGBA")
        if im.getbbox():
            out.append(im)
    return out


def build_master_animated_unit(master_rgba: Image.Image, mode: str) -> tuple[list[Image.Image], list[Image.Image]]:
    cleaned = clean_master_unit_rgba(master_rgba)
    base = fit_to_cell(cleaned, max_w=228, max_h=204)
    walk_frames = []
    atk_frames = []

    if mode == "cannon_cart":
        for i in range(4):
            w_im = base.rotate([0, 1.5, 0, -1.5][i], resample=Image.BICUBIC, expand=True)
            walk_frames.append(fit_to_cell(w_im, max_w=228, max_h=204))
        for i in range(4):
            canvas = Image.new("RGBA", (244, 216), (0, 0, 0, 0))
            recoil_x = [0, -10, -5, 0][i]
            tilt = [0, 3.5, 1.5, 0][i]
            tilted = base.rotate(tilt, resample=Image.BICUBIC, expand=True)
            tilted = fit_to_cell(tilted, max_w=216, max_h=198)
            canvas.paste(tilted, (8 + recoil_x, 210 - tilted.height), tilted)
            draw = ImageDraw.Draw(canvas)
            if i == 1:
                mx, my = min(230, 16 + recoil_x + int(tilted.width * 0.72)), 210 - int(tilted.height * 0.74)
                draw.ellipse((mx - 15, my - 15, mx + 20, my + 15), fill=(255, 140, 0, 235))
                draw.ellipse((mx - 8, my - 8, mx + 12, my + 8), fill=(255, 245, 130, 255))
            elif i == 2:
                mx, my = min(232, 20 + int(tilted.width * 0.74)), 210 - int(tilted.height * 0.78)
                draw.ellipse((mx - 13, my - 16, mx + 18, my + 12), fill=(210, 210, 210, 195))
            atk_frames.append(canvas)
    else:  # glider
        for i in range(4):
            ang = [-3, 2, 4, -1][i]
            g_im = base.rotate(ang, resample=Image.BICUBIC, expand=True)
            walk_frames.append(fit_to_cell(g_im, max_w=224, max_h=196))
        for i in range(4):
            ang = [2, -8, -4, 0][i]
            g_im = base.rotate(ang, resample=Image.BICUBIC, expand=True)
            g_im = fit_to_cell(g_im, max_w=218, max_h=192)
            canvas = Image.new("RGBA", (236, 210), (0, 0, 0, 0))
            canvas.paste(g_im, (8, 8), g_im)
            if i in (1, 2):
                draw = ImageDraw.Draw(canvas)
                bx = 155 + (i - 1) * 24
                by = 148 + (i - 1) * 22
                draw.ellipse((bx - 11, by - 11, bx + 11, by + 11), fill=(35, 35, 40, 255), outline=(15, 15, 18, 255), width=2)
                draw.ellipse((bx + 4, by - 14, bx + 12, by - 6), fill=(255, 180, 40, 255))
            atk_frames.append(canvas)

    return walk_frames, atk_frames


def assemble_atlas_and_manifest(
    folder: str,
    unit_name: str,
    unit_id: str,
    is_flying: bool,
    walk_raw: list[Image.Image],
    atk_raw: list[Image.Image],
    target_max_h: int = 200,
):
    out_dir = f"apps/game/public/sprites/{folder}"
    os.makedirs(out_dir, exist_ok=True)

    walk_4 = [fit_to_cell(im, max_w=226, max_h=target_max_h) for im in ensure_4_frames(walk_raw)]
    atk_4 = [fit_to_cell(im, max_w=232, max_h=target_max_h + 6) for im in ensure_4_frames(atk_raw)]

    atlas = Image.new("RGBA", (ATLAS_W, ATLAS_H), (0, 0, 0, 0))

    # Row 0: Idle (4 frames)
    idle_base = walk_4[0]
    for c in range(4):
        dy = [0, -2, 0, 2][c] if is_flying else [0, -2, 0, 1][c]
        paste_in_cell(atlas, 0, c, idle_base, is_flying, dx=0, dy=dy)

    # Row 1: Walk (4 frames)
    for c in range(4):
        dy = [0, -3, 0, 3][c] if is_flying else [0, -2, 0, -2][c]
        paste_in_cell(atlas, 1, c, walk_4[c], is_flying, dx=0, dy=dy)

    # Row 2: Attack (4 frames)
    for c in range(4):
        lunge_x = [0, 6, 3, 0][c]
        paste_in_cell(atlas, 2, c, atk_4[c], is_flying, dx=lunge_x, dy=0)

    # Row 3: Hurt (cols 0, 1) & Die (cols 2, 3)
    hurt_src = walk_4[0]
    for c, ang in enumerate([10, 16]):
        rot = hurt_src.rotate(ang, resample=Image.BICUBIC, expand=True)
        rot = fit_to_cell(rot, max_w=224, max_h=target_max_h)
        arr = np.array(rot)
        if c == 1:
            arr[:, :, 0] = np.clip(arr[:, :, 0].astype(int) + 40, 0, 255).astype(np.uint8)
        paste_in_cell(atlas, 3, c, Image.fromarray(arr, "RGBA"), is_flying, dx=-6 * (c + 1), dy=0)

    for idx_d, (col_d, ang_d, alpha_mul) in enumerate([(2, 38, 0.80), (3, 72, 0.45)]):
        rot_d = hurt_src.rotate(ang_d, resample=Image.BICUBIC, expand=True)
        rot_d = fit_to_cell(rot_d, max_w=232, max_h=target_max_h)
        arr_d = np.array(rot_d)
        arr_d[:, :, 3] = (arr_d[:, :, 3].astype(np.float32) * alpha_mul).astype(np.uint8)
        paste_in_cell(atlas, 3, col_d, Image.fromarray(arr_d, "RGBA"), is_flying, dx=-8, dy=8 * (idx_d + 1))

    atlas_path = f"{out_dir}/{unit_name}_atlas.png"
    atlas.save(atlas_path, optimize=True)

    a_np = np.array(atlas)[:, :, 3]
    row_counts = [int(np.sum(a_np[r * 256:(r + 1) * 256, :] > 10)) for r in range(4)]
    bleed = int(np.sum(a_np[502:512, :] > 10))
    assert all(rc > 5000 for rc in row_counts), f"Low pixel count in {atlas_path}: {row_counts}"
    assert bleed == 0, f"Row 1->2 bleed detected in {atlas_path}: {bleed}"

    anim_path = f"{out_dir}/{unit_name}_animation.json"
    manifest = {
        "version": "3.0",
        "name": unit_name,
        "unitId": unit_id,
        "format": "FORGE_3_0",
        "meta": {
            "app": "agent-sprite-forge",
            "version": "3.0",
            "image": f"/sprites/{folder}/{unit_name}_atlas.png",
            "size": {"w": ATLAS_W, "h": ATLAS_H},
        },
        "fallback": {"cellSize": [CELL_W, CELL_H]},
        "frameCount": 24,
        "anchor": {"x": 0.5, "y": 0.68 if is_flying else 0.90},
        "hitbox": {
            "x": -45 if is_flying else -35,
            "y": -165 if is_flying else -190,
            "width": 90 if is_flying else 70,
            "height": 165 if is_flying else 190,
        },
        "clips": {
            "idle": {"name": "idle", "startFrame": 0, "frameCount": 4, "fps": 8, "loop": True},
            "walk": {"name": "walk", "startFrame": 6, "frameCount": 4, "fps": 10, "loop": True, "stridePx": 64},
            "attack": {
                "name": "attack",
                "startFrame": 12,
                "frameCount": 4,
                "fps": 12,
                "loop": False,
                "hitFrame": 1,
                "events": [{"name": "hit", "frame": 1, "atMs": 83}],
            },
            "hurt": {"name": "hurt", "startFrame": 18, "frameCount": 2, "fps": 8, "loop": False},
            "die": {"name": "die", "startFrame": 20, "frameCount": 2, "fps": 8, "loop": False},
        },
    }
    with open(anim_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"[OK] {folder}/{unit_name}: rows={row_counts}, bleed={bleed}")


def build_all_eras_2_to_6():
    # Re-extract age3_unit_tank.png cleanly from renaissance_concept_sheet.jpg (x=665..1075, y=155..425) without glider wing!
    ren_sheet_full = np.array(Image.open("apps/game/public/concepts/renaissance_concept_sheet.jpg").convert("RGB"))
    tank_crop_rgba = Image.fromarray(key_white_exterior(ren_sheet_full[165:428, 665:1072, :], thresh=22.0), "RGBA")
    tank_clean = pad_portrait_margins(clean_master_unit_rgba(tank_crop_rgba), pad_x=10, pad_y=4)
    tank_clean.save("apps/game/public/assets/units/age3_unit_tank.png", optimize=True)

    glider_crop_rgba = Image.fromarray(key_white_exterior(ren_sheet_full[18:412, 995:1368, :], thresh=22.0), "RGBA")
    glider_clean = pad_portrait_margins(clean_master_unit_rgba(glider_crop_rgba), pad_x=10, pad_y=4)
    glider_clean.save("apps/game/public/assets/units/age3_unit_special.png", optimize=True)

    eras = [
        (
            2,
            "medieval",
            "medieval",
            [
                ("med_melee", "knight", False),
                ("med_ranged", "archer", False),
                ("med_tank", "cavalry", False),
                ("med_special", "priest", False),
            ],
        ),
        (
            3,
            "renaissance",
            "renaissance",
            [
                ("ren_melee", "pike", False),
                ("ren_ranged", "musket", False),
                ("ren_tank", "cannon_cart", False),
                ("ren_special", "glider", True),
            ],
        ),
        (
            4,
            "modern",
            "modern",
            [
                ("mod_melee", "specops", False),
                ("mod_ranged", "sniper", False),
                ("mod_tank", "tank", False),
                ("mod_special", "apache", True),
            ],
        ),
        (
            5,
            "futuristic",
            "futuristic",
            [
                ("fut_melee", "plasma_sword", False),
                ("fut_ranged", "railgun", False),
                ("fut_tank", "titan_mech", False),
                ("fut_special", "carrier", True),
            ],
        ),
        (
            6,
            "ai",
            "ai_singularity",
            [
                ("ai_drone_swarm", "drone_swarm", True),
                ("ai_neural_hacker", "hacker", False),
                ("ai_quantum_synth", "synth_mech", False),
                ("ai_avatar_hologram", "avatar", False),
            ],
        ),
    ]

    modern_grid_counts = [
        (4, 4),  # specops
        (3, 4),  # sniper
        (2, 2),  # tank
        (3, 3),  # apache
    ]

    for age_id, folder, sheet_name, unit_defs in eras:
        sheet_rgb = np.array(Image.open(f"apps/game/public/concepts/{sheet_name}_concept_sheet.jpg").convert("RGB"))
        col_w = sheet_rgb.shape[1] // 4

        for col_idx, (unit_id, unit_name, is_flying) in enumerate(unit_defs):
            target_h = 212 if ("tank" in unit_id or "synth" in unit_id) else 196

            if unit_id == "ren_tank":
                master_im = Image.open("apps/game/public/assets/units/age3_unit_tank.png").convert("RGBA")
                w_raw, a_raw = build_master_animated_unit(master_im, "cannon_cart")
                assemble_atlas_and_manifest(folder, unit_name, unit_id, is_flying, w_raw, a_raw, target_max_h=204)
                continue
            if unit_id == "ren_special":
                master_im = Image.open("apps/game/public/assets/units/age3_unit_special.png").convert("RGBA")
                w_raw, a_raw = build_master_animated_unit(master_im, "glider")
                assemble_atlas_and_manifest(folder, unit_name, unit_id, is_flying, w_raw, a_raw, target_max_h=196)
                continue

            col_sub = sheet_rgb[:, col_idx * col_w:(col_idx + 1) * col_w, :]

            if age_id == 4:
                nw, na = modern_grid_counts[col_idx]
                w_raw = extract_modern_grid_boxes(col_sub, 525, 646, nw)
                a_raw = extract_modern_grid_boxes(col_sub, 644, 766, na)
            elif age_id == 5:
                strip_rgb = col_sub[515:762, 6:-6, :]
                corners = np.concatenate([strip_rgb[0:6, 0:6].reshape(-1, 3), strip_rgb[0:6, -6:].reshape(-1, 3)], axis=0)
                bg_med = np.median(corners, axis=0)
                diff = np.linalg.norm(strip_rgb.astype(np.float32) - bg_med, axis=-1)
                fg = binary_fill_holes(diff > 18.0)
                rgba_s = np.zeros((strip_rgb.shape[0], strip_rgb.shape[1], 4), dtype=np.uint8)
                rgba_s[:, :, :3] = strip_rgb
                rgba_s[:, :, 3] = np.where(fg, 255, 0)
                mid_y = rgba_s.shape[0] // 2
                w_raw = extract_row_sprites_general(rgba_s[:mid_y, :, :], 4)
                a_raw = extract_row_sprites_general(rgba_s[mid_y:, :, :], 3)
            else:
                strip_rgb = col_sub[536:765, :, :]
                rgba_s = key_white_exterior(strip_rgb, thresh=22.0)
                w_raw = extract_row_sprites_general(rgba_s[0:112, :, :], 4)
                a_raw = extract_row_sprites_general(rgba_s[112:, :, :], 3)

                if unit_id == "med_tank" and len(a_raw) >= 2:
                    w_raw = [a_raw[0], a_raw[1], a_raw[0], a_raw[1]]
                elif unit_id == "ren_ranged" and len(w_raw) >= 3:
                    aim_pose = w_raw[2]
                    w_raw = [w_raw[0], w_raw[1], w_raw[0], w_raw[1]]
                    a_raw = [aim_pose] + a_raw[:3]

            assemble_atlas_and_manifest(folder, unit_name, unit_id, is_flying, w_raw, a_raw, target_max_h=target_h)

    clean_all_24_hud_portraits()


if __name__ == "__main__":
    build_all_eras_2_to_6()
