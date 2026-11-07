from PIL import Image
import os

sheet_path = 'apps/game/public/concepts/prehistoric_concept_sheet.jpg'
if not os.path.exists(sheet_path):
    # Try alternative paths
    for p in ['public/concepts/prehistoric_concept_sheet.jpg', 'apps/game/public/concepts/prehistoric_concept_sheet.jpg']:
        if os.path.exists(p):
            sheet_path = p
            break

img = Image.open(sheet_path)
print('Sheet path:', sheet_path)
print('Sheet format:', img.format, 'Size:', img.size)
