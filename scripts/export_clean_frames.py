from PIL import Image

sheet = Image.open('apps/game/public/concepts/prehistoric_concept_sheet.jpg')

# 1. Walk frames from Y=544, H=82
walk_boxes = [
    (48, 544, 74, 82),
    (124, 544, 72, 82),
    (198, 544, 70, 82),
    (270, 544, 72, 82),
]
for i, (x, y, w, h) in enumerate(walk_boxes):
    c = sheet.crop((x, y, x + w, y + h))
    c.save(f'd:/toptop_duan/scripts/walk_f{i+1}_clean.png')

# 2. Attack frames from Y=620, H=116
attack_boxes = [
    (38, 620, 94, 116),
    (136, 620, 112, 116),
    (250, 620, 94, 116),
]
for i, (x, y, w, h) in enumerate(attack_boxes):
    c = sheet.crop((x, y, x + w, y + h))
    c.save(f'd:/toptop_duan/scripts/attack_f{i+1}_clean.png')

print("Saved all 4 walk and 3 attack frames cleanly!")
