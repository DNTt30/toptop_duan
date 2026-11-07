from PIL import Image
import numpy as np

img = Image.open('apps/game/public/concepts/prehistoric_concept_sheet.jpg')
# Let's check brightness profile along Y axis for Column 0 (X=0..344)
col0 = img.crop((0, 0, 344, 768)).convert('L')
arr = np.array(col0)

# Mean brightness per row
row_means = arr.mean(axis=1)

print("Row mean brightness samples:")
for y in range(0, 768, 32):
    print(f"Y={y:3d}..{y+32:3d}: mean={row_means[y:y+32].mean():.1f}")
