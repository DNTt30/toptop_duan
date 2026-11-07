"""
Extract Age 3 (Renaissance) Panorama, Bases, and Royal Cannon Turrets,
and fix Medieval Panorama header artifact.
"""

import os
import sys
import numpy as np
from PIL import Image
from scipy.ndimage import label, find_objects, binary_fill_holes

sys.stdout.reconfigure(encoding='utf-8')

BRAIN_DIR = r"C:\Users\duong\.gemini\antigravity\brain\d430af74-503a-41fc-a4d6-1162ee65b773"
REN_PANO_SRC = os.path.join(BRAIN_DIR, "renaissance_bg_panorama_1794011684975.jpg")
REN_SHEET_SRC = os.path.join(BRAIN_DIR, "age3_renaissance_spritesheet_1794011679072.jpg")
MED_ENV_SRC = "apps/game/public/concepts/medieval_environment_sheet.jpg"


def remove_white_bg(rgb_arr: np.ndarray, threshold: float = 24.0) -> Image.Image:
    """Remove exterior pure-white background while preserving bright interior highlights (e.g. cream marble)."""
    h, w, _ = rgb_arr.shape
    diff = 255.0 - rgb_arr.astype(np.float32)
    is_near_white = np.max(diff, axis=-1) < threshold

    # Flood/connected-component from image borders so interior cream marble stays opaque!
    labeled, _ = label(is_near_white)
    border_labels = set()
    border_labels.update(np.unique(labeled[0, :]))
    border_labels.update(np.unique(labeled[h - 1, :]))
    border_labels.update(np.unique(labeled[:, 0]))
    border_labels.update(np.unique(labeled[:, w - 1]))
    border_labels.discard(0)

    exterior_bg = np.isin(labeled, list(border_labels))
    fg_mask = ~exterior_bg
    fg_mask = binary_fill_holes(fg_mask)

    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[:, :, :3] = rgb_arr
    # Soften anti-aliased 1px edge slightly
    edge_alpha = np.clip(np.max(diff, axis=-1) * 10.0, 0, 255).astype(np.uint8)
    rgba[:, :, 3] = np.where(fg_mask, 255, np.where(exterior_bg & (np.max(diff, axis=-1) > 12), edge_alpha, 0))
    return Image.fromarray(rgba, "RGBA")


def build_renaissance_panorama():
    im = Image.open(REN_PANO_SRC).convert("RGB")
    w, h = im.size
    # Crop from sky down to right above the cobblestone road (around 83.5% of height)
    # so units walk directly on GROUND_Y while buildings/cypresses rest cleanly on the horizon
    crop_h = int(h * 0.835)
    cropped = im.crop((0, 0, w, crop_h)).convert("RGBA")
    # Resize to crisp 1360x300 matching prehistoric_bg_panorama
    resized = cropped.resize((1360, 300), Image.LANCZOS)
    out_path = "apps/game/public/assets/backgrounds/renaissance_bg_panorama.png"
    resized.save(out_path, optimize=True)
    print(f"[OK] Saved {out_path} {resized.size}")


def fix_medieval_panorama():
    """Rebuild medieval_bg_panorama.png cleanly without wooden label plaque or underground dirt at top."""
    im = Image.open(MED_ENV_SRC).convert("RGB")
    w, h = im.size  # 896 x 1200
    # Extract clean Sky strip (x=34..862, y=126..242) and Mid Castle/Windmill strip (x=34..862, y=545..695)
    # Or use bottom mockup below the plaque? Notice in mockup (y=960..1110), plaque covers x=235..660, y=930..988.
    # Let's take the bottom composite scene (x=34..862, y=960..1112) and patch the top plaque zone (y=960..990, x=225..670)
    # seamlessly using the clean sky strip from Layer 1!
    comp = np.array(im.crop((34, 960, 862, 1112))).copy()  # 828 x 152 (ends right at grass/cobblestone!)
    sky_patch = np.array(im.crop((34, 168, 862, 208)))     # 828 x 40 clean blue sky + clouds below plaque
    comp[0:32, 190:640, :] = sky_patch[0:32, 190:640, :]
    clean_im = Image.fromarray(comp, "RGB").convert("RGBA").resize((1360, 280), Image.LANCZOS)
    out_path = "apps/game/public/assets/backgrounds/medieval_bg_panorama.png"
    clean_im.save(out_path, optimize=True)
    print(f"[OK] Fixed {out_path} {clean_im.size}")


def build_renaissance_bases_and_turrets():
    sheet = Image.open(REN_SHEET_SRC).convert("RGB")
    arr = np.array(sheet)
    h, w, _ = arr.shape

    # Detect the 5 major objects via non-white connected components
    diff = 255.0 - arr.astype(np.float32)
    fg = np.max(diff, axis=-1) > 25
    labeled, num = label(fg)
    objs = []
    for i, sl in enumerate(find_objects(labeled), start=1):
        if sl is None:
            continue
        area = int(np.sum(labeled[sl] == i))
        if area > 4000:
            y1, y2 = sl[0].start, sl[0].stop
            x1, x2 = sl[1].start, sl[1].stop
            objs.append((area, x1, y1, x2, y2))

    print(f"Found {len(objs)} major objects in Age 3 sheet:")
    for o in objs:
        print(" ", o)

    # Separate top row (bases: cy < h * 0.52) and bottom row (3 cannons: cy >= h * 0.52)
    top_objs = sorted([o for o in objs if (o[2] + o[4]) / 2 < h * 0.52], key=lambda o: o[1])
    bot_objs = sorted([o for o in objs if (o[2] + o[4]) / 2 >= h * 0.52], key=lambda o: o[1])

    assert len(top_objs) == 2, f"Expected 2 fortresses on top row, got {len(top_objs)}"
    assert len(bot_objs) == 3, f"Expected 3 cannons on bottom row, got {len(bot_objs)}"

    def crop_clean_rgba(box, pad=8, trim_bottom=True):
        _, x1, y1, x2, y2 = box
        cx1 = max(0, x1 - pad)
        cy1 = max(0, y1 - pad)
        cx2 = min(w, x2 + pad)
        cy2 = min(h, y2 + pad)
        sub = arr[cy1:cy2, cx1:cx2, :]
        rgba_im = remove_white_bg(sub, threshold=22.0)
        bbox = rgba_im.getbbox()
        if bbox:
            # Trim tightly on bottom so anchor(0.5, 1.0) sits flush on GROUND_Y!
            rgba_im = rgba_im.crop((
                max(0, bbox[0] - 4),
                max(0, bbox[1] - 4),
                min(rgba_im.width, bbox[2] + 4),
                bbox[3] if trim_bottom else min(rgba_im.height, bbox[3] + 4),
            ))
        return rgba_im

    base_left = crop_clean_rgba(top_objs[0], trim_bottom=True)
    # Flip Red Fortress horizontally so its arched portcullis gate faces LEFT toward the battlefield!
    base_right = crop_clean_rgba(top_objs[1], trim_bottom=True).transpose(Image.FLIP_LEFT_RIGHT)

    base_left.save("apps/game/public/assets/bases/renaissance_base_left.png", optimize=True)
    base_right.save("apps/game/public/assets/bases/renaissance_base_right.png", optimize=True)
    print(f"[OK] Saved renaissance bases: left={base_left.size}, right={base_right.size}")

    for idx, c_box in enumerate(bot_objs, start=1):
        turret_im = crop_clean_rgba(c_box, trim_bottom=True)
        out_t = f"apps/game/public/assets/turrets/renaissance_turret_{idx}.png"
        turret_im.save(out_t, optimize=True)
        print(f"[OK] Saved {out_t} {turret_im.size}")


if __name__ == "__main__":
    build_renaissance_panorama()
    fix_medieval_panorama()
    build_renaissance_bases_and_turrets()
