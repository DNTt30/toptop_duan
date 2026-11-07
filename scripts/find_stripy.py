import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('apps/game/src/ui/PreviewGallery.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, l in enumerate(lines):
    if 'stripY' in l or 'rowOffset' in l:
        print(f'{i+1}: {l.strip()[:100]}')
