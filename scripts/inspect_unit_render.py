import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('apps/game/src/engine/Renderer.ts', 'r', encoding='utf-8') as f:
    text = f.read()

pos = text.find('spriteLoader.getFrameTexture')
print(text[pos-200:pos+1500])
