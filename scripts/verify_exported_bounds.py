from PIL import Image
import numpy as np

print("Walk frames analysis:")
for i in range(1, 5):
    im = Image.open(f'd:/toptop_duan/scripts/walk_f{i}_clean.png')
    arr = np.array(im)
    mask = (arr < 235).any(axis=2)
    rows = np.where(mask.any(axis=1))[0]
    cols = np.where(mask.any(axis=0))[0]
    print(f"  Walk F{i}: top={rows[0]} (head), bot={rows[-1]} (feet), left={cols[0]}, right={cols[-1]}")

print("\nAttack frames analysis:")
for i in range(1, 4):
    im = Image.open(f'd:/toptop_duan/scripts/attack_f{i}_clean.png')
    arr = np.array(im)
    mask = (arr < 235).any(axis=2)
    rows = np.where(mask.any(axis=1))[0]
    cols = np.where(mask.any(axis=0))[0]
    print(f"  Attack F{i}: top={rows[0]} (club tip!), bot={rows[-1]} (feet), left={cols[0]}, right={cols[-1]}")
