import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('apps/game/src/engine/Renderer.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i in range(900, 960):
    if i < len(lines):
        print(f'{i+1}: {lines[i].rstrip()[:120]}')
