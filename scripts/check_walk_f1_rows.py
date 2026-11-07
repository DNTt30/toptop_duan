from PIL import Image
import numpy as np

im = Image.open('d:/toptop_duan/scripts/walk_f1_clean.png')
arr = np.array(im)
mask = (arr < 235).any(axis=2)

print("walk_f1_clean size:", im.size)
rows = np.where(mask.any(axis=1))[0]
print(f"Non-white rows: {rows[0]}..{rows[-1]} (total {len(rows)})")

# Let's inspect the bottom rows: Y = 70..82
for y in range(70, im.size[1]):
    non_white_count = mask[y].sum()
    print(f"Row {y}: {non_white_count} non-white pixels")
