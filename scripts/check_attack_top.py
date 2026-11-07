from PIL import Image
import numpy as np

sheet = Image.open('apps/game/public/concepts/prehistoric_concept_sheet.jpg')
# Check slice from Y=610 to Y=660 for Col 0 (X=0..344)
slice_610_660 = sheet.crop((0, 610, 344, 660))
arr = np.array(slice_610_660)
non_white = (arr < 230).any(axis=2)
for y_rel in range(0, 50, 5):
    y_abs = 610 + y_rel
    row_nw = non_white[y_rel:y_rel+5].mean()
    print(f"Y={y_abs}..{y_abs+5}: non-white ratio={row_nw:.3f}")
