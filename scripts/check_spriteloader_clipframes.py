import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('apps/game/src/engine/SpriteLoader.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i in range(140, 195):
    if i < len(lines):
        print(f'{i+1}: {lines[i].rstrip()[:120]}')
