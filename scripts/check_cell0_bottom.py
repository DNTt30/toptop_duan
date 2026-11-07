from PIL import Image
import numpy as np

im = Image.open('apps/game/public/sprites/prehistoric/caveman_atlas.png')
cell0 = im.crop((0, 256, 256, 512))
arr = np.array(cell0)
alpha = arr[:, :, 3]

for y in range(230, 256):
    print(f"Y={y}: max alpha = {alpha[y].max()}, non-zero = {(alpha[y] > 10).sum()}")
