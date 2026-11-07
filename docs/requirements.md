# Tài liệu Yêu cầu Hệ thống — BuddhaLive Studio

> **Phiên bản:** 1.2.0 (Chốt đặc tả chính thức trước khi triển khai `S1` → `S2`)  
> **Giai đoạn:** Phân tích, Thiết kế & Triển khai theo Cột mốc Kiểm soát Chặt  
> **Nền tảng mục tiêu:** Windows 11 (64-bit) + OBS Studio (Browser Source)

---

## 1. Bối cảnh & Mục tiêu Hệ thống

**BuddhaLive Studio** là ứng dụng livestream tương tác chạy hoàn toàn cục bộ (local-first) trên **Windows 11**, cho phép streamer điều khiển nhân vật 3D xuất hiện và phản hồi theo thời gian thực với các sự kiện quà tặng trong buổi phát trực tiếp.

Hệ thống gồm 4 trụ cột vận hành:
1. **Desktop Manager:** Ứng dụng quản trị trên Windows 11 để cấu hình nhân vật, hoạt ảnh, quy tắc quà tặng, duyệt ghép nối OBS Overlay, giám sát hàng đợi thực thi và điều khiển buổi live.
2. **Live Overlay:** Giao diện nền trong suốt chạy trong trình duyệt / **OBS Browser Source** tại URL sạch `http://127.0.0.1:<port>/overlay` (không chứa token trên URL), hiển thị nhân vật 3D, hoạt ảnh và tên người tặng quà.
3. **Backend:** Dịch vụ trung tâm chạy local tách bạch rõ 3 khái niệm **Sự kiện đầu vào (`Event`) — Quy tắc khớp (`Rule`) — Lượt thực thi (`Execution`)**, quản lý lưu trữ SQLite và điều phối thời gian thực.
4. **Demo Mode:** Bộ mô phỏng quà tặng tích hợp sẵn, cho phép kiểm chứng toàn bộ luồng hoạt động xuyên suốt khi **chưa kết nối TikTok LIVE thật**.

---

## 2. Đối tượng Sử dụng (Actors)

| Actor | Mô tả | Giao diện tương tác & Cơ chế Xác thực |
| :--- | :--- | :--- |
| **Streamer / Vận hành viên (Operator)** | Người cấu hình nhân vật, thiết lập quy tắc quà tặng, duyệt kết nối Overlay, chạy thử Demo Mode và giám sát phiên livestream trên Windows 11. | Desktop Manager (`managerToken` phiên cấp trong RAM qua Electron `preload`) |
| **OBS Studio (Browser Source)** | Phần mềm thu phát livestream nhúng đường dẫn sạch `http://127.0.0.1:<port>/overlay` để ghép hình ảnh nhân vật + tên người tặng + âm thanh lên luồng phát. | Live Overlay (xác thực qua Cookie `HttpOnly; SameSite=Strict` sau khi ghép nối 1 lần, duy trì bền vững qua các lần khởi động lại) |
| **Demo Simulator** | Nguồn phát sự kiện mô phỏng nội bộ do Vận hành viên kích hoạt để kiểm thử luồng xuyên suốt và các kịch bản tải thực tế. | Desktop Manager ↔ Backend (`source = 'DEMO'`) |
| **TikTok LIVE Platform *(Giai đoạn sau)*** | Nguồn sự kiện livestream thật từ phòng live TikTok thông qua Adapter độc lập (chưa tích hợp ở giai đoạn hiện tại). | TikTok Adapter → EventIngressPort |

---

## 3. Yêu cầu Chức năng (Functional Requirements)

### 3.1. Luồng Cốt lõi Xuyên suốt Sớm (Walking Skeleton — FR-CORE)
- **FR-CORE-01 (Kiểm chứng đóng gói Electron + SQLite ngay tại `S1`):** Ứng dụng Electron tối thiểu mở được cơ sở dữ liệu `better-sqlite3` (`WAL` mode), chạy migration và ghi/đọc dữ liệu thành công cả trên môi trường Electron thực tế lẫn bản đóng gói Windows 11 trước khi mở rộng chức năng.
- **FR-CORE-02 (Luồng chạy thử xuyên suốt đầu tiên tại `S2`):** Chỉ với 01 nhân vật và 01 loại quà tặng, chạy trọn vẹn:  
  `Bấm nút Demo → Backend ghi nhận Event & tạo Execution → Socket.IO gửi lệnh xuống Overlay → Overlay hiện nhân vật 3D → Nhân vật chạy hoạt ảnh kèm hiển thị tên người tặng quà → Hết hoạt ảnh nhân vật biến mất về nền trong suốt → Overlay gửi xác nhận hoàn tất về Backend`.

### 3.2. Quản lý Nhân vật & Tài nguyên (FR-CHAR)
- **FR-CHAR-01:** Cho phép `CRUD` hồ sơ nhân vật (`Character`), gồm tên, đường dẫn tệp mô hình 3D (`.glb`), ảnh đại diện, thông số không gian (`scale`, `position`, `rotation`) và chế độ xuất hiện (`visibility_mode`).
- **FR-CHAR-02:** Hỗ trợ 2 chế độ xuất hiện của nhân vật trên Overlay:
  - **`APPEAR_ON_EVENT` (Mặc định):** Khung hình bình thường ẩn hoàn toàn (trong suốt); nhân vật chỉ xuất hiện khi có lượt thực thi quà tặng và tự động biến mất khi chạy xong hoạt ảnh.
  - **`PERSISTENT_IDLE` (Tùy chọn):** Nhân vật đứng thường trực ở hoạt ảnh nghỉ (`default_idle_animation_id`), chuyển sang hoạt ảnh phản hồi khi có quà rồi quay lại trạng thái nghỉ.
- **FR-CHAR-03:** Nhập (import) tệp `.glb` và âm thanh vào `%APPDATA%\BuddhaLiveStudio\assets`, kiểm tra chặt chữ ký tệp (Magic Bytes), loại tệp, giới hạn dung lượng và lưu tên UUID an toàn.
- **FR-CHAR-04:** Đảm bảo tại một thời điểm có tối đa **01 nhân vật mặc định đang kích hoạt (`is_active = true`)**; khi thay đổi cấu hình, Live Overlay tự đồng bộ lại không cần khởi động lại OBS.
- **FR-CHAR-05:** Quản lý danh sách hoạt ảnh (`Animation`) gắn với từng nhân vật (`clip_name`, `duration_ms`, chế độ lặp, `blend_in_ms`, `blend_out_ms`, âm thanh, hiệu ứng) kèm nút **Xem thử (Preview)**.

### 3.3. Quản lý Quy tắc Quà tặng (`Rule` — FR-RULE)
- **FR-RULE-01:** Cho phép tạo, sửa, bật/tắt, xóa quy tắc ánh xạ quà tặng (`GiftRule`) tách biệt hoàn toàn với dữ liệu sự kiện đầu vào.
- **FR-RULE-02:** Hỗ trợ khớp điều kiện theo mã định danh quà (`trigger_gift_id` hoặc wildcard `NULL`), số lượng tối thiểu (`min_gift_count`) và giá trị xu tối thiểu (`min_coin_value`).
- **FR-RULE-03:** Hỗ trợ cấu hình chế độ xử lý gửi quà liên tục (`combo_trigger_mode`: `COMBO_MERGE`, `THRESHOLD_STEP`, `EACH_EVENT`), độ ưu tiên (`priority` từ `1..100`), thời gian hồi (`cooldown_ms`), giới hạn hàng đợi theo quy tắc (`max_queue_per_rule`), chính sách khi nhân vật đang diễn (`interrupt_policy`: `QUEUE`, `PREEMPT_LOWER`, `DROP_IF_BUSY`) và mẫu hiển thị tên người tặng (`overlay_text_template`).

### 3.4. Xử lý Sự kiện & Điều phối Thực thi (`Event` → `Rule` → `Execution` — FR-ENG)
- **FR-ENG-01:** Tách bạch 3 khái niệm: **`Event` (`LiveEvent`)**, **`Rule` (`GiftRule`)** và **`Execution` (`EventExecution`)**.
- **FR-ENG-02 (Chống xử lý trùng & Xử lý `external_event_id NULL`):**
  - Ràng buộc `UNIQUE(source, external_event_id)` của SQLite là **nguồn xác nhận cuối cùng (Final Source of Truth)** chặn việc nhân vật xuất hiện 2 lần cho cùng một sự kiện (LRU cache trong RAM chỉ là lớp lọc nhanh phía trước).
  - Chuỗi rỗng `""` hoặc khoảng trắng ở `external_event_id` phải được chuẩn hóa về `NULL` tại cửa ngõ; các sự kiện có `external_event_id IS NULL` không đưa vào cache chống trùng và được SQLite coi là các sự kiện độc lập xử lý một lần duy nhất.
- **FR-ENG-03 (Gộp combo `COMBO_MERGE` cửa sổ cố định):** Sử dụng **cửa sổ cố định `1500ms` tính từ `Event` đầu tiên** của chuỗi (không trượt theo gói sau), gom theo đúng bộ khóa 4 thành phần **`(source, sender_id, gift_id, matched_rule_id)`** để tạo 01 lượt xuất hiện tổng hợp.
- **FR-ENG-04 (Nhiều người gửi cùng lúc & Chống đói trên `QUEUED`):** Xếp hàng theo **`Priority DESC + FIFO`**. Quy tắc chống đói **chỉ áp dụng cho các `Execution` đang ở trạng thái `QUEUED`** (sau tối đa 3 lượt ưu tiên cao liên tiếp, nhường 1 lượt cho bản ghi `QUEUED` chờ lâu trên `30s`).
- **FR-ENG-05 (Xử lý khi nhân vật đang hoạt ảnh):** Mặc định cho chạy hết (`QUEUE`); chỉ thay thế (`PREEMPT_LOWER`) khi quà mới có quyền ngắt, `priority` cao hơn và lượt đang diễn đã hiển thị tối thiểu `1000ms` (`min_display_protection_ms`).
- **FR-ENG-06 (Giới hạn 30 lượt chờ, Khóa `COALESCE` & Trạng thái `EVICTED_BY_PRIORITY`):**
  - Giới hạn `max_queue_size = 30` tính trên tổng số `Execution` đang có `status = 'QUEUED'` (không tính lượt đang `DISPATCHED`/`PLAYING`).
  - Khi chạm trần quy tắc (`max_queue_per_rule`) hoặc trần tổng, nếu có sẵn một bản ghi đang **`QUEUED`** cùng khóa **`(source, sender_id, gift_id, gift_rule_id)`**, hệ thống cộng dồn số lượng vào bản ghi `QUEUED` đó (`COALESCE`).
  - Khi hàng đợi `QUEUED` đầy `30/30` và không thể `COALESCE`, nếu sự kiện mới có `priority` cao hơn phần tử thấp nhất đang `QUEUED`, phần tử bị đẩy ra phải được ghi nhận trạng thái **`EVICTED_BY_PRIORITY`** để nhường chỗ.
- **FR-ENG-07 (Đồng bộ lại khi Overlay tải lại & Watchdog):** Khi Overlay bị tải lại giữa chừng, hủy sạch lượt đang dở (`CANCELLED` - `OVERLAY_RELOADED`), đồng bộ `system:state_snapshot` và đi tiếp lượt `QUEUED` kế tiếp khi Overlay sẵn sàng; Watchdog tự cắt `TIMED_OUT` nếu treo quá hạn.
- **FR-ENG-08 (Cô lập lỗi Model 3D & `COMPLETED_WITH_FALLBACK`):** Khi model 3D/clip lỗi nhưng bảng thông báo 2D dự phòng (`fallback_2d_alert = true`) hiển thị thành công tên người tặng + món quà, ghi nhận trạng thái lượt thực thi là **`COMPLETED_WITH_FALLBACK`** (kèm mã cảnh báo lỗi 3D để sửa model), không đánh dấu toàn bộ `Execution` là `FAILED` (chỉ đánh dấu `FAILED` khi cả 3D lẫn fallback 2D đều không hiển thị được).
- **FR-ENG-09:** Cung cấp bộ điều khiển hàng đợi trực tiếp: `PAUSE`, `RESUME`, `SKIP_CURRENT`, `CLEAR`.

### 3.5. Chế độ Demo & Hiển thị Live Overlay (FR-DEMO, FR-OVL)
- **FR-DEMO-01:** Mô phỏng quà đơn lẻ và các kịch bản thực tế (1 người gửi liên tục, nhiều người gửi đồng thời, quà VIP, tải cao) gắn rõ `source = 'DEMO'`, tuyệt đối **không giả lập kết nối TikTok thật** (`tiktokAdapterStatus = 'DISCONNECTED'`).
- **FR-OVL-01:** Phục vụ Overlay nền trong suốt tại URL sạch `http://127.0.0.1:<port>/overlay`, thực thi trọn chu trình *Hiện nhân vật → Hoạt ảnh + Tên người tặng → Biến mất* (hoặc Fallback 2D khi lỗi model) và tự phục hồi `webglcontextlost`.

---

## 4. Yêu cầu Phi Chức năng & Bảo mật Máy Cục bộ (Non-Functional Requirements)

| Mã | Nhóm | Yêu cầu & Quy chuẩn bắt buộc |
| :--- | :--- | :--- |
| **NFR-SEC-01** | Chỉ lắng nghe Loopback | HTTP Server và Socket.IO mặc định chỉ bind trên **`127.0.0.1`**, không mở cổng ra mạng LAN/Wi-Fi. |
| **NFR-SEC-02** | Cấp phát, Duy trì & Bảo vệ Token (Cấm Query String & Cấm Log) | - **Tuyệt đối không truyền `overlayToken` (hay bất kỳ token nào) qua URL query string** (chặn `400` nếu phát hiện `?token=` trên URL) và **không bao giờ ghi token vào console/file log** (tự động redact `[REDACTED]`).<br>- **`managerToken`:** Sinh mới 256-bit trong RAM mỗi lần mở Electron, cấp riêng qua `preload.ts`.<br>- **`overlayToken`:** Cấp qua quy trình ghép nối 1 lần (Pairing) bằng Cookie **`HttpOnly; SameSite=Strict`**; Backend chỉ lưu bản băm `SHA-256` được mã hóa qua Windows DPAPI (`electron.safeStorage`) tại `%APPDATA%` để **tự động duy trì kết nối OBS sau khi khởi động lại ứng dụng** mà không lộ plain-text token. |
| **NFR-SEC-03** | Kiểm tra `Host`/`Origin` & Phân quyền Client | Kiểm tra `Host` chống DNS Rebinding; không mở CORS `*`; kiểm tra `Origin` phù hợp đặc thù từng client kết hợp xác thực Token theo vai trò (`OVERLAY` bị chặn mọi quyền điều khiển với lỗi `FORBIDDEN_ROLE`). |
| **NFR-SEC-04** | Kiểm soát Tải Tệp & Sandbox Ổ đĩa | Chỉ cho phép `managerToken` upload; kiểm tra đuôi file + **Magic Bytes**, giới hạn dung lượng (`.glb ≤ 50MB`, audio `≤ 15MB`, ảnh `≤ 5MB`), lưu tên `<uuid>.<ext>` và chặn Path Traversal. |
| **NFR-SEC-05** | Cô lập Electron & Chống XSS | Electron bật `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, API `preload` tối thiểu. Tên người tặng render plain-text chống XSS. |
| **NFR-SEC-06** | Zod Validation, Message Allowlist & Rate Limiting | Mọi sự kiện Socket.IO và API HTTP phải nằm trong danh sách trắng (`Allowlist`) theo vai trò, xác thực payload bằng `Zod` (`.strict()`, giới hạn kích thước gói tin) và áp dụng `Rate Limiting` chống spam/brute-force cục bộ. |
| **NFR-WIN-01** | Kiểm chứng Đóng gói Windows 11 từ `S1` | Tương thích ABI giữa Electron và `better-sqlite3` (`asarUnpack`) phải chạy Pass trên bản đóng gói Windows 11 ngay tại Cột mốc `S1`; lưu dữ liệu tại `%APPDATA%\BuddhaLiveStudio`. |
| **NFR-PERF-01** | Hiệu năng & Hoạt động Offline | Độ trễ nội bộ Backend → Socket.IO `< 50ms`; khóa FPS WebGL (`30`/`60` FPS); chạy 100% Offline trên Windows 11. |
