import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('apps/game/src/engine/Renderer.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, l in enumerate(lines):
    if 'GROUND_Y' in l:
        print(f'{i+1}: {l.strip()[:100]}')
