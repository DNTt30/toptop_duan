from PIL import Image
import numpy as np

sheet = Image.open('apps/game/public/concepts/prehistoric_concept_sheet.jpg')
# Check Column 0 from Y=620 to Y=768
col0_attack_strip = sheet.crop((0, 620, 344, 768))
arr = np.array(col0_attack_strip)
mask = (arr < 235).any(axis=2)

frames_x = [(38, 134), (134, 250), (250, 344)]
for i, (x1, x2) in enumerate(frames_x):
    sub = mask[:, x1:x2]
    rows = sub.any(axis=1)
    if rows.any():
        t = np.where(rows)[0][0]
        b = np.where(rows)[0][-1]
        print(f"Attack F{i+1}: Y in strip (from 620) = {t}..{b} -> Absolute Y = {620+t}..{620+b} (H={b-t})")
