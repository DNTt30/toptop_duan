# AGENTS.md — Quy Chuẩn Hoạt Động Của AI Agent Trong Dự Án

## 1. Dự Án & Phong Cách Làm Việc
- Dự án: **The Singularity Odyssey & BuddhaLive** (Monorepo: Game 2D, OBS Overlay, Desktop Manager, Backend)
- Công nghệ: **TypeScript, Vite, React 18, PixiJS v8, Socket.IO, better-sqlite3**
- Phong cách: Trả lời ngắn gọn, đi thẳng vào kết quả, tiếng Việt tự nhiên, kèm link file click được.

## 2. Quy Tắc Bất Di Bất Dịch (1000 Giờ Workflow)
1. **Lên kế hoạch trước:** Mọi việc lớn phải chia bước rõ ràng (Làm gì, Ở file nào, Thế nào là xong) trước khi sửa code.
2. **Tóm tắt 3 dòng:** Nếu yêu cầu dài hoặc từ giọng nói, tóm tắt đúng 3 dòng và hỏi điểm còn thiếu trước khi làm.
3. **Reference-Driven:** Khi có mẫu, chỉ ra 3-5 điểm đắt giá; phân biệt rõ phần giữ nguyên và phần làm mới.
4. **Phỏng vấn 1-1:** Khi chốt tính năng, hỏi từng câu một kèm đề xuất giải pháp để người dùng chọn.
5. **Nhắc lần 2 thành rule:** Khi người dùng phải nhắc cùng một điều lần thứ 2, đề xuất 1 dòng thêm vào file này.
6. **Không báo xong bừa (Eval):** Tự chạy build/test kiểm tra kết quả và nêu rõ bằng chứng trước khi báo xong.
7. **Cập nhật bộ nhớ:** Chốt quyết định ghi vào `docs/bo-nho/muc-luc.md`; dừng phiên cập nhật `docs/bo-nho/dang-lam.md`.

## 3. Tiêu Chuẩn Kỹ Thuật & Kiến Trúc
- **Chuẩn kiến trúc doanh nghiệp 6 lớp:** [docs/architecture-standards.md](file://docs/architecture-standards.md) (Thin Controller, Policy tập trung, DB Transaction & Append-only, i18n, Kỷ luật Git, Eval Mindset).

## 4. Bản Đồ Bộ Nhớ Dự Án
- Việc đang làm dở dang: [docs/bo-nho/dang-lam.md](file://docs/bo-nho/dang-lam.md)
- Sổ ghi chép quyết định đã chốt: [docs/bo-nho/muc-luc.md](file://docs/bo-nho/muc-luc.md)
- Kế hoạch chi tiết tác vụ lớn: [docs/bo-nho/ke-hoach.md](file://docs/bo-nho/ke-hoach.md)
- Cẩm nang 16 bài học thực chiến: [docs/16-BAI-HOC-1000-GIO-CLAUDE.md](file://docs/16-BAI-HOC-1000-GIO-CLAUDE.md)
