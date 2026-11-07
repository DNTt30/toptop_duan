import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('apps/game/src/engine/Unit.ts', 'r', encoding='utf-8') as f:
    text = f.read()

idx = 0
while True:
    pos = text.find('spriteConfig', idx)
    if pos == -1:
        break
    print(f"--- Found spriteConfig in Unit.ts at {pos} ---")
    print(text[max(0, pos-80):min(len(text), pos+200)])
    idx = pos + 1
