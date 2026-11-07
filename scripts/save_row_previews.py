from PIL import Image

im = Image.open('apps/game/public/concepts/prehistoric_concept_sheet.jpg')
# Let's save a preview with grid lines so we can see what each region contains!
# The sheet is 1376 x 768
# Let's save slices for Column 0 (Caveman) from top to bottom
# Y=0..380: Character portrait / hero illustration?
# Y=380..542: What is this? An animation row? Idle or walk?
# Y=542..650: Another animation row?
# Y=650..768: Another animation row?

# Let's check Y=380..542 vs Y=542..650 vs Y=650..768
im.crop((0, 380, 344, 542)).save('d:/toptop_duan/scripts/row_mid.png')
im.crop((0, 542, 344, 650)).save('d:/toptop_duan/scripts/row_bottom1.png')
im.crop((0, 650, 344, 768)).save('d:/toptop_duan/scripts/row_bottom2.png')
im.crop((0, 0, 344, 380)).save('d:/toptop_duan/scripts/row_hero.png')

print("Saved row_hero, row_mid, row_bottom1, row_bottom2")
