from PIL import Image
import numpy as np

# Let's inspect row_mid.png
im = Image.open('d:/toptop_duan/scripts/row_mid.png')
print("row_mid size:", im.size)
# Let's see if there are multiple characters in row_mid or if it's 1 wide character or several:
arr = np.array(im)
# Crop into 3 horizontal slices or find what is drawn
im.save('d:/toptop_duan/scripts/mid_full.png')

# Let's also check: what did the user say?
# "các frame đang vẽ thiếu các chi tiết kiểm tra lại , các frame đo để đâu nhỉ"
