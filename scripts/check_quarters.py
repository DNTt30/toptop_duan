from PIL import Image
import numpy as np

im = Image.open('d:/toptop_duan/scripts/col0_mid.png')
w, h = im.size
print("col0_mid size:", w, h)

# Check how many characters or what elements are in col0_mid
# Let's crop into 4 horizontal quarters:
for i in range(4):
    sub = im.crop((i * (w // 4), 0, (i + 1) * (w // 4), h))
    arr = np.array(sub)
    nw = (arr < 230).any(axis=2).mean()
    print(f"Quarter {i}: non-white ratio = {nw:.3f}")
