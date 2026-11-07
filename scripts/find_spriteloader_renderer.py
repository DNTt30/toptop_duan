import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('apps/game/src/engine/Renderer.ts', 'r', encoding='utf-8') as f:
    text = f.read()

idx = 0
while True:
    pos = text.find('spriteLoader', idx)
    if pos == -1:
        break
    print(f"--- Found spriteLoader at {pos} ---")
    print(text[max(0, pos-100):min(len(text), pos+400)])
    idx = pos + 1
