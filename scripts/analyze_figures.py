from PIL import Image
import numpy as np

# Let's inspect the bounding boxes of connected components or characters in row_mid vs row_bottom1 vs row_bottom2
for name in ['row_hero.png', 'row_mid.png', 'row_bottom1.png', 'row_bottom2.png']:
    im = Image.open('d:/toptop_duan/scripts/' + name)
    arr = np.array(im)
    # Check non-white pixels
    mask = (arr < 230).any(axis=2)
    # Horizontal projection
    col_has_content = mask.any(axis=0)
    # Find contiguous segments of content
    diff = np.diff(col_has_content.astype(int))
    starts = np.where(diff == 1)[0] + 1
    if col_has_content[0]:
        starts = np.insert(starts, 0, 0)
    ends = np.where(diff == -1)[0]
    if col_has_content[-1]:
        ends = np.append(ends, len(col_has_content) - 1)

    print(f"\n=== {name} (size {im.size}) ===")
    print(f"Number of distinct figures/columns: {len(starts)}")
    for i, (s, e) in enumerate(zip(starts, ends)):
        if e - s > 15: # Filter noise
            # Find vertical bounds for this figure
            submask = mask[:, s:e]
            rows = submask.any(axis=1)
            if rows.any():
                top = np.where(rows)[0][0]
                bot = np.where(rows)[0][-1]
                print(f"  Figure {i}: X={s}..{e} (w={e-s}), Y={top}..{bot} (h={bot-top})")
