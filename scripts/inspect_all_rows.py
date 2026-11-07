from PIL import Image
import numpy as np

# Let's inspect the entire concept sheet!
# How many rows does the concept sheet have?
# Let's check each 100px vertical block:
im = Image.open('apps/game/public/concepts/prehistoric_concept_sheet.jpg')
w, h = im.size

# Let's save a thumbnail or inspect what part2_mid actually is!
# We can find connected components or slice columns:
mid = im.crop((0, 380, 344, 544))
mid.save('d:/toptop_duan/scripts/mid_preview.jpg', quality=95)

# Let's check: are there 3 action rows instead of 2? Or what are the rows?
print("Let's analyze all 4 columns at Y=380..544:")
for col in range(4):
    c = im.crop((col * 344, 380, (col + 1) * 344, 544))
    arr = np.array(c)
    nw = (arr < 235).any(axis=2).mean()
    print(f"Col {col} at 380..544 has non-white ratio: {nw:.2f}")

# And let's check Y=0..380:
for col in range(4):
    c = im.crop((col * 344, 0, (col + 1) * 344, 380))
    arr = np.array(c)
    nw = (arr < 235).any(axis=2).mean()
    print(f"Col {col} at 0..380 has non-white ratio: {nw:.2f}")

# And let's check Y=542..650:
for col in range(4):
    c = im.crop((col * 344, 542, (col + 1) * 344, 650))
    arr = np.array(c)
    nw = (arr < 235).any(axis=2).mean()
    print(f"Col {col} at 542..650 has non-white ratio: {nw:.2f}")

# And let's check Y=650..768:
for col in range(4):
    c = im.crop((col * 344, 650, (col + 1) * 344, 768))
    arr = np.array(c)
    nw = (arr < 235).any(axis=2).mean()
    print(f"Col {col} at 650..768 has non-white ratio: {nw:.2f}")
