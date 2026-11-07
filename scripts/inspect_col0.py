from PIL import Image

sheet = Image.open('apps/game/public/concepts/prehistoric_concept_sheet.jpg')
# Let's inspect the entire Column 0 (Caveman) from Y=0 to Y=768
# Save as col0_full.png
col0 = sheet.crop((0, 0, 344, 768))
col0.save('d:/toptop_duan/scripts/col0_full.png')

# Let's inspect what is in Y=380..520
mid = sheet.crop((0, 380, 344, 520))
mid.save('d:/toptop_duan/scripts/col0_mid.png')

print("Saved col0_full.png and col0_mid.png")
