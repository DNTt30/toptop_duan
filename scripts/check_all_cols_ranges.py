from PIL import Image
import numpy as np

sheet = Image.open('apps/game/public/concepts/prehistoric_concept_sheet.jpg')
w, h = sheet.size

# Let's check for each column (Col 0..3):
# Where is the gap between Row 1 (Walk) and Row 2 (Attack)?
# And where does Walk start?
for col in range(4):
    col_img = sheet.crop((col * 344, 520, (col + 1) * 344, 768))
    arr = np.array(col_img)
    mask = (arr < 235).any(axis=2)
    # Check row by row
    row_means = mask.mean(axis=1)
    
    # Walk start
    walk_rows = np.where(row_means[:110] > 0.05)[0]
    walk_start = 520 + walk_rows[0] if len(walk_rows) else 542
    
    # Gap between walk and attack (around Y=620..650)
    gap_rows = np.where(row_means[90:130] < 0.01)[0]
    gap_y = 520 + 90 + gap_rows[0] if len(gap_rows) else 635
    
    print(f"Col {col}: Walk starts ~Y={walk_start}, Gap/Attack starts ~Y={gap_y}")
