# Sổ Ghi Chép Quyết Định Kiến Trúc & Nghiệp Vụ (muc-luc.md)

> Mỗi khi chốt một quyết định quan trọng cùng người dùng (sau phỏng vấn /grill-me), ghi 1 dòng vào bảng này để AI và lập trình viên luôn nhớ lý do tại sao làm như vậy.

| STT | Ngày | Quyết Định Đã Chốt | Lý Do & Ngữ Cảnh | File Chi Tiết |
| :--- | :--- | :--- | :--- | :--- |
| QD-01 | 2026-11-06 | Áp dụng quy chuẩn 16 Bài Học Sau 1000 Giờ Dùng Claude | Chuẩn hóa quy trình giao việc, giữ context sạch và kiểm thử tự động | [AGENTS.md](../../AGENTS.md) |
| QD-02 | 2026-11-06 | Tách biệt Engine Game hoàn toàn khỏi React | Fixed Timestep 60 tick/s, React chỉ làm HUD, không đưa Entity vào React State | [engine/World.ts](../../apps/game/src/engine/World.ts) |
| QD-03 | 2026-11-06 | Dữ liệu Kỷ Nguyên và Chỉ số 100% Data-Driven | Không hardcode stat trong engine logic, dễ dàng thêm/sửa quân qua config | [data/ages.ts](../../apps/game/src/data/ages.ts) |
| QD-04 | 2026-11-06 | Tối ưu Hiệu Năng 60 FPS: Single-Batch Graphics & Text Pool | Triệt tiêu cấp phát 2,400 Graphics/s & 600 Text/s gây nghẽn GC; giảm re-render React xuống 12.5 FPS | [engine/Renderer.ts](../../apps/game/src/engine/Renderer.ts) |
| QD-05 | 2026-11-06 | Sửa lỗi Màn hình đen: Hủy StrictMode kép & Guard Async WebGL | React.StrictMode hủy WebGL context giữa chừng; thêm guard isCancelled và position: absolute | [main.tsx](../../apps/game/src/main.tsx), [App.tsx](../../apps/game/src/App.tsx) |
