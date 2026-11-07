import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('apps/game/src/data/sprites.ts', 'r', encoding='utf-8') as f:
    text = f.read()

pos = text.find('function getSpriteConfig')
if pos == -1:
    pos = text.find('getSpriteConfig =')
print(text[pos:pos+500])
