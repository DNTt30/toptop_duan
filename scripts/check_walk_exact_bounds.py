from PIL import Image
import numpy as np

sheet = Image.open('apps/game/public/concepts/prehistoric_concept_sheet.jpg')
# Check Column 0 from Y=530 to Y=640
col0_walk_strip = sheet.crop((0, 530, 344, 640))
arr = np.array(col0_walk_strip)
mask = (arr < 235).any(axis=2)

frames_x = [(45, 120), (120, 195), (195, 265), (265, 340)]
for i, (x1, x2) in enumerate(frames_x):
    sub = mask[:, x1:x2]
    rows = sub.any(axis=1)
    if rows.any():
        t = np.where(rows)[0][0]
        b = np.where(rows)[0][-1]
        print(f"Walk F{i+1}: Y in strip (from 530) = {t}..{b} -> Absolute Y = {530+t}..{530+b} (H={b-t})")
