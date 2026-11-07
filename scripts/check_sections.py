from PIL import Image
import numpy as np

for name in ['part1_portrait.png', 'part2_mid.png', 'part3_walk.png', 'part4_attack.png']:
    im = Image.open('d:/toptop_duan/scripts/' + name)
    print(f"{name}: size={im.size}, mode={im.mode}")
