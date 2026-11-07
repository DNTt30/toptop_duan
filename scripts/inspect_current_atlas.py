from PIL import Image
import numpy as np

im = Image.open('apps/game/public/sprites/prehistoric/caveman_atlas.png')
print("Atlas size:", im.size)
arr = np.array(im)
print("Atlas shape:", arr.shape)

# Let's inspect each cell of row 1 (Walk: frames 6..9)
# Row 1 is Y = 256..512
for col in range(4):
    cell = im.crop((col * 256, 256, (col + 1) * 256, 512))
    cell_arr = np.array(cell)
    # Check alpha > 10
    alpha = cell_arr[:, :, 3]
    if (alpha > 10).any():
        rows = np.where((alpha > 10).any(axis=1))[0]
        cols = np.where((alpha > 10).any(axis=0))[0]
        print(f"Walk Frame {col} (cell {6+col}): Y={rows[0]}..{rows[-1]} (H={rows[-1]-rows[0]+1}), X={cols[0]}..{cols[-1]}")
    else:
        print(f"Walk Frame {col} is EMPTY!")

# Row 2 (Attack: frames 12..14)
for col in range(3):
    cell = im.crop((col * 256, 512, (col + 1) * 256, 768))
    cell_arr = np.array(cell)
    alpha = cell_arr[:, :, 3]
    if (alpha > 10).any():
        rows = np.where((alpha > 10).any(axis=1))[0]
        cols = np.where((alpha > 10).any(axis=0))[0]
        print(f"Attack Frame {col} (cell {12+col}): Y={rows[0]}..{rows[-1]} (H={rows[-1]-rows[0]+1}), X={cols[0]}..{cols[-1]}")
    else:
        print(f"Attack Frame {col} is EMPTY!")
