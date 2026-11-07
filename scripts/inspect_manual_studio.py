import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('apps/game/src/ui/PreviewGallery.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find("Thanh Thông Báo Trạng Thái Chuột")
print(text[idx-200:idx+3500])
