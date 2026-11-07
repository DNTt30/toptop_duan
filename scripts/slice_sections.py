from PIL import Image

img = Image.open('apps/game/public/concepts/prehistoric_concept_sheet.jpg')
# Let's crop vertical sections of column 0:
# Section 1: 0..380 (Big portrait / concept art?)
# Section 2: 380..544 (Icons or something?)
# Section 3: 544..650 (Walk strip?)
# Section 4: 650..768 (Attack strip?)

img.crop((0, 0, 344, 380)).save('d:/toptop_duan/scripts/part1_portrait.png')
img.crop((0, 380, 344, 544)).save('d:/toptop_duan/scripts/part2_mid.png')
img.crop((0, 544, 344, 650)).save('d:/toptop_duan/scripts/part3_walk.png')
img.crop((0, 650, 344, 768)).save('d:/toptop_duan/scripts/part4_attack.png')

print("Saved 4 vertical sections of Col 0.")
