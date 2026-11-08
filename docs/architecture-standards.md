# Quy Chuẩn Kiến Trúc & Kỹ Thuật Dự Án (Enterprise Standards)
> **Dự án:** The Singularity Odyssey & BuddhaLive Stream Overlay (`toptop_duan`)  
> **Nguyên tắc nền tảng:** Chuyển hóa 6 bài học kiến trúc doanh nghiệp sang môi trường TypeScript Monorepo (Node.js, React, PixiJS, SQLite).

---

## 1. Kiến Trúc 6 Lớp: Controller Siêu Mỏng (Thin Controller)

> **Mục tiêu:** Tuyệt đối không biến Controller / Socket Handler / Route Handler thành "nồi lẩu thập cẩm".

### Quy tắc phân lớp:
1. **Controller / Route Handler (< 100 dòng):**
   - Chỉ làm đúng 3 việc: **Nhận Request / Event** $\rightarrow$ **Ủy quyền cho Service** $\rightarrow$ **Trả về Response / Ack**.
   - Không query DB, không tính toán logic trạng thái, không trực tiếp xử lý format dữ liệu phức tạp.
2. **Validation Layer (Zod Schemas):**
   - Mọi payload vào (HTTP Request Body / Socket Event Payload) bắt buộc phải qua schema xác thực tập trung từ `@buddhalive/shared` (Zod).
   - Thất bại validation phải trả lỗi ngay tại cổng vào, không để payload bẩn lọt vào tầng Service.
3. **Service Layer (Nghiệp vụ cốt lõi):**
   - Điều phối luồng nghiệp vụ: chuyển trạng thái thế nào, điều kiện ràng buộc ra sao, kích hoạt side-effects (sự kiện, thông báo).
   - Quản lý ranh giới giao dịch (Transaction boundary).
4. **Repository Layer (Truy xuất dữ liệu):**
   - Toàn bộ câu lệnh SQL / better-sqlite3 `prepare().run() / get() / all()` phải nằm trong `src/db/repositories/*.repository.ts`.
   - Controller và Service không được viết SQL thô tùy tiện. Dễ dàng mock khi viết Unit Test.

---

## 2. Phân Quyền Tập Trung: Single Source of Truth

> **Mục tiêu:** Cấm rải rác `if-else` kiểm tra vai trò (Role), Token hoặc Secret ở khắp Controller, Service, Component.

### Quy tắc thực hiện:
1. **Policy Tập Trung (`AuthorizationPolicy`):**
   - Toàn bộ định nghĩa quyền hạn ("Ai được gửi lệnh?", "Role nào được can thiệp queue?", "Overlay token có quyền gì?") tập trung 100% tại `apps/backend/src/security/policies/`.
2. **Kiểm tra quyền qua Gate duy nhất:**
   - Tại Controller / Socket Gate: chỉ gọi `policy.authorize(actor, action)` hoặc middleware bảo vệ.
   - Khi phát sinh thêm vai trò mới (ví dụ: `MODERATOR`, `VIP_VIEWER`), chỉ cần sửa đúng 1 file Policy duy nhất mà không phải rà soát hàng chục file.

---

## 3. Toàn Vẹn Dữ Liệu (Transaction) & Tính Bất Biến (Immutability)

> **Mục tiêu:** Không bao giờ để rác database khi có lỗi và bảo vệ bằng chứng kiểm toán (Audit Trail).

### Quy tắc thực hiện:
1. **Giao dịch từ 2 bảng trở lên bắt buộc dùng `db.transaction()`:**
   - Trong `better-sqlite3`, mọi thao tác tác động từ 2 bảng trở lên (ví dụ: Tiếp nhận Event $\rightarrow$ lưu `live_events` + tạo dòng `event_executions`) phải được bọc trong `db.transaction(() => { ... })()`.
   - Nếu bất kỳ bước nào throw error, toàn bộ thay đổi phải tự động rollback hoàn toàn.
2. **Dữ liệu lịch sử & nhật ký là Bất Biến (Append-only):**
   - Bảng nhật ký sự kiện (`live_events`), lịch sử tặng quà, lịch sử kích hoạt hoạt ảnh (`event_executions`) là bằng chứng đối soát.
   - **Tuyệt đối cấm tạo API sửa hoặc xóa (UPDATE / DELETE) các bản ghi này.**
   - Chuyển trạng thái xử lý phải tuân theo Finite State Machine (FSM) và ghi nhận timestamp đầy đủ.

---

## 4. Đa Ngôn Ngữ (i18n): Không Hardcode Text Trong Mã Nguồn

> **Mục tiêu:** Tách biệt triệt để "Logic xử lý" và "Hiển thị người dùng".

### Quy tắc thực hiện:
1. **Không gõ chuỗi hiển thị tiếng Việt trực tiếp trong mã nguồn:**
   - Cấm: `throw new Error('Yêu cầu không hợp lệ')`, `<button>Lưu</button>`, `alert('Đã kết nối')`.
   - Đúng: `throw new AppError('ERR_INVALID_REQUEST')`, `<button>{t('common.save')}</button>`.
2. **Từ điển tập trung:**
   - Mọi chuỗi hiển thị (Game HUD, OBS Overlay Banner, Manager Admin) phải được quản lý qua từ điển ngôn ngữ JSON (`packages/shared/src/locales/vi.json`, `en.json`).
   - Backend chỉ trả về mã lỗi (`errorCode`) và siêu dữ liệu; Frontend hoặc Client chịu trách nhiệm ánh xạ ra chuỗi hiển thị theo ngôn ngữ hiện tại của người dùng.

---

## 5. Kỷ Luật Git: "Đúng Phạm Vi" & "Lịch Sử Sạch"

> **Mục tiêu:** Tránh làm bẩn nhánh chung và giữ lịch sử git chuyên nghiệp.

### Quy tắc thực hiện:
1. **Tự review Diff trước khi commit:**
   - Luôn chạy `git diff` để kiểm tra từng dòng thay đổi.
   - File layout chung, cấu hình môi trường, hoặc các dòng code không thuộc phạm vi task được giao $\rightarrow$ phải hoàn nguyên ngay lập tức.
2. **Commit rõ ràng, không vụn vặt:**
   - Tuân thủ Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`.
   - Dùng `git commit --amend` để gộp các chỉnh sửa nhỏ khi review vào commit chính.

---

## 6. Tư Duy Bàn Giao: Không Báo "Xong" Khi Chưa Có Bằng Chứng (Eval Mindset)

> **Mục tiêu:** "Bằng chứng số liệu có giá trị gấp 100 lần lời nói 'em kiểm tra thấy ổn rồi'."

### Quy tắc thực hiện (Bộ 4 Nấc Eval):
1. **Nấc 1 — Typecheck:** `pnpm typecheck` (hoặc `tsc --noEmit`) đạt 0 lỗi.
2. **Nấc 2 — Unit Test:** Chạy toàn bộ Unit Tests (đạt 100% PASS cho cả Happy Path lẫn Edge Cases / Error Cases).
3. **Nấc 3 — Integration / E2E:** Các luồng tích hợp Socket, REST API và OBS Overlay Playwright chạy qua 100%.
4. **Nấc 4 — Grep Proof = 0:**
   - Chạy lệnh tìm kiếm (grep) để chứng minh:
     - 0 rò rỉ biến toàn cục debug ngoài môi trường DEV.
     - 0 vi phạm truy xuất DB ngoài tầng Repository.
     - 0 chuỗi hardcode text vi phạm quy chuẩn.
