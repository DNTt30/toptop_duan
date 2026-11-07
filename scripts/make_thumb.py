from PIL import Image

# Let's check all 4 columns of the concept sheet:
# What does the concept sheet header or text say?
im = Image.open('apps/game/public/concepts/prehistoric_concept_sheet.jpg')
# Let's save a low-res preview of the ENTIRE concept sheet so we can understand its layout:
thumb = im.resize((688, 384), Image.Resampling.LANCZOS)
thumb.save('d:/toptop_duan/scripts/whole_sheet_preview.png')
print("Saved whole_sheet_preview.png")
