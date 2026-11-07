import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('apps/game/src/engine/SpriteLoader.ts', 'r', encoding='utf-8') as f:
    text = f.read()

pos = text.find('async loadSprite')
print(text[pos:pos+1500])
