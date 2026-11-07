from PIL import Image

sheet = Image.open('apps/game/public/concepts/prehistoric_concept_sheet.jpg')
# Crop Col 0 Attack frame 1 (Figure 1: the big overhead swing)
# Old crop: sy = 648, x = 136, w = 112, h = 90
old_crop = sheet.crop((136, 648, 136 + 112, 648 + 90))
old_crop.save('d:/toptop_duan/scripts/attack_f2_old.png')

# New crop: sy = 630, x = 136, w = 112, h = 108
new_crop = sheet.crop((136, 630, 136 + 112, 630 + 108))
new_crop.save('d:/toptop_duan/scripts/attack_f2_new.png')

print("Saved attack_f2_old.png and attack_f2_new.png")
