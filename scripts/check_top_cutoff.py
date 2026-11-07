from PIL import Image
import numpy as np

sheet = Image.open('apps/game/public/concepts/prehistoric_concept_sheet.jpg')
# Check slice from Y=500 to Y=550 for Col 0 (X=0..344)
slice_500_550 = sheet.crop((0, 500, 344, 550))
arr = np.array(slice_500_550)
non_white = (arr < 230).any(axis=2)
print("Any non-white pixels in Y=500..550?", non_white.any())
for y_rel in range(0, 50, 5):
    y_abs = 500 + y_rel
    row_nw = non_white[y_rel:y_rel+5].mean()
    print(f"Y={y_abs}..{y_abs+5}: non-white ratio={row_nw:.3f}")
