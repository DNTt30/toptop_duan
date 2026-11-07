from PIL import Image
import numpy as np

sheet = Image.open('apps/game/public/concepts/prehistoric_concept_sheet.jpg')
atlas = Image.new('RGBA', (1536, 1024), (0, 0, 0, 0))

def remove_bg(img_crop):
    rgba = img_crop.convert('RGBA')
    arr = np.array(rgba)
    r, g, b, _ = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
    is_white = (r > 240) & (g > 240) & (b > 240)
    arr[is_white, 3] = 0
    is_near_white = (r > 220) & (g > 220) & (b > 220) & (~is_white)
    avg = (r[is_near_white].astype(float) + g[is_near_white] + b[is_near_white]) / 3.0
    alpha = np.clip((255.0 - avg) / 35.0 * 255.0, 0, 255).astype(np.uint8)
    arr[is_near_white, 3] = alpha
    return Image.fromarray(arr)

# 1. Walk frames from sheet (Y=545..625, H=80)
# We take Y=544, H=82. Feet are at Y=81 in crop!
walk_boxes = [
    (48, 544, 74, 82),
    (124, 544, 72, 82),
    (198, 544, 70, 82),
    (270, 544, 72, 82),
]

# We want targetHeight inside cell to be ~180px so it fits generously with 25px top margin and 26px bottom margin!
# Ground line inside cell: Y = 230
ground_in_cell = 230
walk_scale = 180.0 / 81.0 # ~2.22

for i, (x, y, w, h) in enumerate(walk_boxes):
    crop = sheet.crop((x, y, x + w, y + h))
    nobg = remove_bg(crop)
    dw = int(w * walk_scale)
    dh = int(h * walk_scale)
    scaled = nobg.resize((dw, dh), Image.Resampling.LANCZOS)
    
    # Create cell 256x256
    cell = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
    paste_x = (256 - dw) // 2
    foot_in_scaled = int(81 * walk_scale) # 180px
    paste_y = ground_in_cell - foot_in_scaled # 230 - 180 = 50px from top!
    cell.paste(scaled, (paste_x, paste_y), scaled)
    
    # Paste cell into Row 1 (Walk: Y = 256)
    atlas.paste(cell, (i * 256, 256))
    # Paste cell into Row 0 (Idle: Y = 0)
    atlas.paste(cell, (i * 256, 0))

# 2. Attack frames from sheet (Y=620..736, H=116)
# Feet are at Y=115 in crop!
attack_boxes = [
    (38, 620, 94, 116),
    (136, 620, 112, 116),
    (250, 620, 94, 116),
]
# For Attack, total height is 116. If we scale so feet are at 230, and top of club is at Y=20:
# max height = 210px. 210 / 116 = 1.81
attack_scale = 210.0 / 115.0 # ~1.826

for i, (x, y, w, h) in enumerate(attack_boxes):
    crop = sheet.crop((x, y, x + w, y + h))
    nobg = remove_bg(crop)
    dw = int(w * attack_scale)
    dh = int(h * attack_scale)
    scaled = nobg.resize((dw, dh), Image.Resampling.LANCZOS)
    
    cell = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
    paste_x = (256 - dw) // 2
    foot_in_scaled = int(115 * attack_scale) # 210px
    paste_y = ground_in_cell - foot_in_scaled # 230 - 210 = 20px from top!
    cell.paste(scaled, (paste_x, paste_y), scaled)
    
    # Paste cell into Row 2 (Attack: Y = 512)
    atlas.paste(cell, (i * 256, 512))

# 3. Row 3: Hurt & Die (Y = 768)
# Create clean hurt frames from attack f0
hurt_cell = atlas.crop((0, 512, 256, 768))
atlas.paste(hurt_cell, (0, 768))
atlas.paste(hurt_cell, (256, 768))

atlas.save('apps/game/public/sprites/prehistoric/caveman_atlas.png', 'PNG')
print("Saved perfect, unsevered caveman_atlas.png!")
