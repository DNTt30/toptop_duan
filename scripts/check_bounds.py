from PIL import Image
import numpy as np

for name in ['mid_q1.png', 'mid_q2.png', 'mid_q3.png']:
    im = Image.open('d:/toptop_duan/scripts/' + name)
    arr = np.array(im)
    mask = (arr < 230).any(axis=2)
    rows = mask.any(axis=1)
    cols = mask.any(axis=0)
    top, bot = np.where(rows)[0][0], np.where(rows)[0][-1]
    left, right = np.where(cols)[0][0], np.where(cols)[0][-1]
    print(f"{name}: bounds in quarter X={left}..{right} (w={right-left}), Y={top}..{bot} (h={bot-top})")
