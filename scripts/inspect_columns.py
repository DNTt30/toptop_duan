import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('apps/game/src/ui/PreviewGallery.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

start_kw = "{/* CỘT TRÁI: DẢI CONCEPT VÀ ĐIỀU KHIỂN CẮT FRAME */}"
end_kw = "{/* Modal Xuất JSON */}"
idx_start = text.find(start_kw)
idx_end = text.find(end_kw)
print(text[idx_start:idx_end])
