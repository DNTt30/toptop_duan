import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('apps/game/src/engine/World.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, l in enumerate(lines):
    if 'new Unit' in l or 'spawnUnit' in l:
        print(f'{i+1}: {l.strip()[:100]}')
