import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('apps/game/src/ui/PreviewGallery.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

start_kw = "{/* CỘT TRÁI: DẢI CONCEPT VÀ ĐIỀU KHIỂN CẮT FRAME */}"
idx = text.find(start_kw)
print(text[idx:idx+2500])
