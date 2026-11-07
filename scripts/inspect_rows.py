from PIL import Image
import numpy as np

img = Image.open('apps/game/public/concepts/prehistoric_concept_sheet.jpg')
w, h = img.size
print(f"Total size: {w}x{h}")

# Let's inspect column 0 (Melee - Caveman): X = 0..344
col0 = img.crop((0, 0, 344, h))

# Find row features: where is it dark vs light?
arr = np.array(col0)
print("Col 0 shape:", arr.shape)

# Let's save slices every 100px or find where characters are
# In previous code:
# stripY was 542!
# Why 542? Because 768 - 226 = 542!
# Let's check what is in Y=0..542 vs Y=542..768!
top_part = img.crop((0, 0, 344, 542))
top_part.save('d:/toptop_duan/scripts/col0_top.png')

bottom_part = img.crop((0, 542, 344, 768))
bottom_part.save('d:/toptop_duan/scripts/col0_bottom.png')

print("Saved col0_top.png (0..542) and col0_bottom.png (542..768)")
