# -*- coding: utf-8 -*-
from PIL import Image
import numpy as np

# 1. Update frameOverrides.ts
with open('apps/game/src/data/frameOverrides.ts', 'r', encoding='utf-8') as f:
    code = f.read()

old_stone_melee = """  stone_melee: {
    groundBaselineY: 84,
    scale: 2.2,
    walkFrames: [
      { x: 50, y: 0, w: 72, h: 84, dx: 0, dy: 0 },
      { x: 124, y: 0, w: 72, h: 84, dx: 0, dy: 0 },
      { x: 198, y: 0, w: 70, h: 84, dx: 0, dy: 0 },
      { x: 270, y: 0, w: 72, h: 84, dx: 0, dy: 0 },
    ],
    attackFrames: [
      { x: 40, y: 106, w: 92, h: 88, dx: 0, dy: 0 },
      { x: 136, y: 106, w: 112, h: 90, dx: 0, dy: 0 },
      { x: 250, y: 106, w: 94, h: 88, dx: 0, dy: 0 },
    ],
  },"""

new_stone_melee = """  stone_melee: {
    groundBaselineY: 81,
    scale: 2.2,
    walkFrames: [
      { x: 48, y: 0, w: 74, h: 82, dx: 0, dy: 0 },
      { x: 124, y: 0, w: 72, h: 82, dx: 0, dy: 0 },
      { x: 198, y: 0, w: 70, h: 82, dx: 0, dy: 0 },
      { x: 270, y: 0, w: 72, h: 82, dx: 0, dy: 0 },
    ],
    attackFrames: [
      { x: 38, y: 0, w: 94, h: 116, dx: 0, dy: 0 },
      { x: 136, y: 0, w: 112, h: 116, dx: 0, dy: 0 },
      { x: 250, y: 0, w: 94, h: 116, dx: 0, dy: 0 },
    ],
  },"""

if old_stone_melee in code:
    code = code.replace(old_stone_melee, new_stone_melee, 1)
    with open('apps/game/src/data/frameOverrides.ts', 'w', encoding='utf-8') as f:
        f.write(code)
    print("Updated frameOverrides.ts!")
else:
    print("Warning: old_stone_melee not matched exactly in frameOverrides.ts")

# 2. Rebuild caveman_atlas.png (6 cols x 4 rows, cell size 256x256)
sheet = Image.open('apps/game/public/concepts/prehistoric_concept_sheet.jpg')
atlas = Image.new('RGBA', (1536, 1024), (0, 0, 0, 0))

def remove_bg(img_crop):
    rgba = img_crop.convert('RGBA')
    arr = np.array(rgba)
    r, g, b, _ = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
    # White background threshold
    is_white = (r > 240) & (g > 240) & (b > 240)
    arr[is_white, 3] = 0
    # Soft alpha feathering for near-white
    is_near_white = (r > 220) & (g > 220) & (b > 220) & (~is_white)
    avg = (r[is_near_white].astype(float) + g[is_near_white] + b[is_near_white]) / 3.0
    alpha = np.clip((255.0 - avg) / 35.0 * 255.0, 0, 255).astype(np.uint8)
    arr[is_near_white, 3] = alpha
    return Image.fromarray(arr)

# Row 1 (Walk): frames 6..9 (Y=256)
walk_crops = [
    (48, 544, 74, 82),
    (124, 544, 72, 82),
    (198, 544, 70, 82),
    (270, 544, 72, 82),
]

ground_y_in_cell = 235
scale = 2.2

for i, (x, y, w, h) in enumerate(walk_crops):
    crop = sheet.crop((x, y, x + w, y + h))
    nobg = remove_bg(crop)
    dw = int(w * scale)
    dh = int(h * scale)
    scaled = nobg.resize((dw, dh), Image.Resampling.LANCZOS)
    
    cell_x = i * 256
    cell_y = 256 # Row 1
    
    # Center horizontally, place feet at ground_y_in_cell
    # In Walk, feet are at Y=81
    foot_offset = int(81 * scale)
    paste_x = cell_x + (256 - dw) // 2
    paste_y = cell_y + (ground_y_in_cell - foot_offset)
    atlas.paste(scaled, (paste_x, paste_y), scaled)

# Row 0 (Idle): copy walk frames 0..3 to idle frames 0..3 (Y=0)
for i in range(4):
    cell_walk = atlas.crop((i * 256, 256, (i + 1) * 256, 512))
    atlas.paste(cell_walk, (i * 256, 0))

# Row 2 (Attack): frames 12..14 (Y=512)
attack_crops = [
    (38, 620, 94, 116),
    (136, 620, 112, 116),
    (250, 620, 94, 116),
]

for i, (x, y, w, h) in enumerate(attack_crops):
    crop = sheet.crop((x, y, x + w, y + h))
    nobg = remove_bg(crop)
    dw = int(w * scale)
    dh = int(h * scale)
    scaled = nobg.resize((dw, dh), Image.Resampling.LANCZOS)
    
    cell_x = i * 256
    cell_y = 512 # Row 2
    
    # In Attack, feet are at Y=115
    foot_offset = int(115 * scale)
    paste_x = cell_x + (256 - dw) // 2
    paste_y = cell_y + (ground_y_in_cell - foot_offset)
    atlas.paste(scaled, (paste_x, paste_y), scaled)

# Row 3: Hurt & Die - create clean hurt frames from attack f0 with red tint or pose
hurt_scaled = atlas.crop((0, 512, 256, 768)) # Take attack frame 1
atlas.paste(hurt_scaled, (0, 768)) # cell 18 (hurt)
atlas.paste(hurt_scaled, (256, 768)) # cell 19 (hurt 2)

atlas.save('apps/game/public/sprites/prehistoric/caveman_atlas.png', 'PNG')
print("Saved pristine caveman_atlas.png (1536x1024) with complete walk and attack details!")
