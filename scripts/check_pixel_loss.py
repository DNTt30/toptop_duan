from PIL import Image
import numpy as np

old_im = Image.open('d:/toptop_duan/scripts/attack_f2_old.png')
new_im = Image.open('d:/toptop_duan/scripts/attack_f2_new.png')

old_arr = np.array(old_im)
new_arr = np.array(new_im)

# How many non-white pixels in top 18 rows of new_arr?
top_18 = new_arr[:18]
nw_top_18 = (top_18 < 230).any(axis=2).sum()
print("Non-white pixels in top 18 rows of new crop (which were completely missing in old crop!):", nw_top_18)
print("Old crop shape:", old_arr.shape)
print("New crop shape:", new_arr.shape)
