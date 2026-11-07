from PIL import Image
import numpy as np

im = Image.open('d:/toptop_duan/scripts/part2_mid.png')
arr = np.array(im)
# Find non-white pixels
# White is > 240
non_white = (arr < 235).any(axis=2)
print("part2_mid non-white pixels ratio:", non_white.mean())
# Which Y range has content?
rows_with_content = non_white.any(axis=1)
if rows_with_content.any():
    min_y = np.where(rows_with_content)[0][0]
    max_y = np.where(rows_with_content)[0][-1]
    print(f"part2_mid has content between Y={min_y} and Y={max_y} (in 380..544 -> {380+min_y}..{380+max_y})")
else:
    print("part2_mid is completely blank/white!")
