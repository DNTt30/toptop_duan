# Cẩm nang Vận hành Desktop Manager — BuddhaLive Studio

> **Dành cho:** Streamer, Kỹ thuật viên vận hành livestream và Quản trị viên hệ thống.  
> **Phiên bản tài liệu:** v1.5.0 (Cột mốc S6: MVP Release Candidate).

---

## 1. Khởi động Ứng dụng & Giao diện Chính

Khi mở **BuddhaLive Studio** từ Desktop hoặc Start Menu, ứng dụng tự động:
1. Khởi tạo máy chủ nhúng nội bộ tại `http://127.0.0.1:3721`.
2. Mở cơ sở dữ liệu SQLite tại `%APPDATA%\BuddhaLiveStudio\data\buddhalive.db` ở chế độ WAL.
3. Chạy quy trình **Crash Recovery** trong transaction SQLite nguyên tử để xử lý các sự kiện còn dở dang nếu phiên trước bị tắt đột ngột.
4. Mở giao diện Desktop Manager với 5 tab điều khiển chuyên biệt.

---

## 2. Chi tiết Vận hành Từng Tab

### Tab 1: 📊 Tổng quan & Bàn Điều khiển Hàng đợi (Dashboard)

Giao diện trung tâm giám sát và điều hành toàn bộ phiên livestream trong thời gian thực:

1. **Thanh Kết nối OBS & Ghép nối (Pairing Bar):**
   - **URL OBS:** `http://127.0.0.1:3721/overlay` (URL sạch, không chứa token trên thanh địa chỉ).
   - Nút **Sao chép URL OBS**: Copy nhanh để dán vào OBS Browser Source.
   - Khi OBS mở lần đầu, mã số xác nhận 6 chữ số sẽ xuất hiện trên màn hình OBS. Bạn chỉ cần nhấn **Phê duyệt ghép nối** trên Desktop Manager để cấp quyền an toàn.
   - Nút **Thu hồi toàn bộ token**: Hủy bỏ ngay lập tức mọi phiên OBS cũ, buộc OBS phải ghép nối lại bằng mã mới.

2. **Bảng Giám sát Hàng đợi Thời gian thực (Queue Monitor):**
   - **QUEUED:** Số lượng quà đang chờ đến lượt hiển thị (tối đa trần 30 lượt).
   - **PLAYING:** Trạng thái lượt đang diễn hoạt trên màn hình (đảm bảo Mutex độc quyền: 0 hoặc 1 lượt).
   - **COMPLETED:** Tổng số lượt đã biểu diễn thành công trong phiên.
   - **FAILED:** Số lượt thất bại (lỗi nạp 3D hoặc timeout).
   - **Badge Trạng thái Engine:** `IDLE` (Đang chờ quà), `PROCESSING` (Đang phát hoạt ảnh), hoặc `PAUSED` (Đang tạm dừng).

3. **Bàn Điều khiển Hàng đợi (Queue Controls):**
   - ⏸ **PAUSE:** Tạm dừng điều phối các lượt chờ trong hàng đợi. Lượt đang diễn hoạt trên màn hình vẫn được phát trọn vẹn cho đến khi kết thúc. Trạng thái tạm dừng được lưu bền vững vào SQLite (`engine.queue_paused = true`), tự động khôi phục nếu khởi động lại app.
   - ▶ **RESUME:** Tiếp tục phát các lượt chờ theo thứ tự ưu tiên `Priority DESC` + `FIFO`.
   - ⏭ **SKIP:** Hủy ngay lập tức lượt đang phát với trạng thái `SKIPPED_BY_MANAGER`. Hệ thống áp dụng **Cancellation Barrier (150ms)** để chờ Three.js thu hồi nhân vật cũ sạch sẽ trước khi phát tiếp lượt tiếp theo, tuyệt đối không bị đè hình.
   - 🗑 **CLEAR:** Hủy toàn bộ các lượt đang nằm trong hàng đợi QUEUED với trạng thái `CLEARED_BY_MANAGER`. Giữ nguyên lượt đang phát (không làm đứt quãng trải nghiệm của người xem). Yêu cầu xác nhận trước khi thực thi.

4. **Khu vực Thử nghiệm Thực chiến (Demo Simulator):**
   - Hỗ trợ gửi quà thử nghiệm đơn lẻ với Tên người gửi và Số lượng quà tùy chọn.
   - Hỗ trợ 4 kịch bản thực chiến tự động:
     - **Dồn quà 1 người (Single Burst):** Gửi liên tiếp 5 quà trong 1200ms để kiểm chứng cơ chế gộp `COMBO_MERGE` (cửa sổ 1500ms).
     - **Nhiều người gửi đồng thời (Concurrent Senders):** 5 người gửi quà cùng lúc để kiểm tra tính công bằng FIFO.
     - **Quà VIP chen ngang (VIP Interrupt):** Quà VIP ưu tiên cao được đẩy lên đầu hàng đợi phát ngay khi lượt hiện tại kết thúc.
     - **Quá tải hàng đợi (Queue Overload):** 35 quà dồn dập kiểm chứng trần 30, trần 5/rule và cơ chế `EVICTED_BY_PRIORITY`.
   - Nút ⏹ **Dừng kịch bản**: Dừng ngay kịch bản mô phỏng đang chạy.

---

### Tab 2: 🎭 Quản lý Nhân vật 3D (Characters)

1. **Nhân vật Hoạt động (Active Character):**
   - Hệ thống áp dụng nguyên tắc Mutex: Tại một thời điểm, chỉ có **duy nhất 1 nhân vật** được kích hoạt (`is_active = true`) để nhận và biểu diễn quà trên Live Overlay.
   - Để đổi nhân vật phát trực tiếp, nhấn **Đặt làm Hoạt động (Set Active)**.
2. **Nhập mô hình GLB (Import GLB):**
   - Nhấn nút **Chọn tệp GLB từ máy tính**.
   - Bộ phân tích binary chuẩn (`GlbParser`) sẽ tự động đọc header file GLB, bóc tách danh sách toàn bộ các `AnimationClip` có sẵn bên trong mô hình (ví dụ: `Idle`, `Pray`, `Blessing`) mà không cần nạp toàn bộ mesh nặng vào RAM.
   - Tệp được lưu trữ an toàn trong thư mục `%APPDATA%\BuddhaLiveStudio\assets\`.
3. **Cấu hình Hiển thị:**
   - Điều chỉnh Tỷ lệ phóng to/thu nhỏ (`Scale`), Tọa độ 3D (`Position X, Y, Z`), và Góc xoay (`Rotation X, Y, Z`) phù hợp với khung hình phát sóng.

---

### Tab 3: 🎬 Quản lý Hoạt ảnh (Animations)

1. **Ánh xạ Hoạt ảnh:**
   - Mỗi nhân vật có thể sở hữu nhiều hoạt ảnh tương ứng với các `AnimationClip` trong tệp GLB.
   - Chọn nhân vật cần xem danh sách hoạt ảnh.
2. **Cấu hình Chi tiết:**
   - **Phân loại Hoạt ảnh:** `IDLE` (Đứng yên tĩnh tâm), `REACTION` (Phản hồi quà thường), `SPECIAL` (Biểu diễn quà lớn), `TRANSITION` (Chuyển cảnh).
   - **Thời lượng biểu diễn (`durationMs`):** Thời gian hoạt ảnh phát trước khi tự động mờ dần biến mất (mặc định 3000ms đến 5000ms).
   - **Âm thanh kèm theo (`soundPath` & `soundVolume`):** Gán file âm thanh chuông mỏ, tiếng khánh hoặc nhạc nền tự động phát cùng hoạt ảnh.
   - **Chế độ Lặp (`Loop Mode`):** `ONCE` (Phát 1 lần), `LOOP` (Lặp liên tục), `REPEAT_N` (Lặp N lần).

---

### Tab 4: 🎁 Quy tắc Quà tặng (Gift Rules)

1. **Khái niệm:**
   - Quy tắc quà tặng liên kết sự kiện quà tặng từ người xem với Nhân vật 3D và Hoạt ảnh tương ứng.
2. **Các thông số cấu hình:**
   - **Mã quà tặng (`triggerGiftId`):** Mã nhận diện loại quà (ví dụ: `lotus`, `dragon`, `heart`).
   - **Độ ưu tiên (`priority`):** Điểm số ưu tiên từ 1 đến 100. Quà có priority cao hơn (quà VIP) sẽ được điều phối phát trước trong hàng đợi.
   - **Ngưỡng quà tối thiểu (`minGiftCount`):** Số lượng quà tối thiểu để kích hoạt quy tắc này.
   - **Ngưỡng xu tối thiểu (`minCoinValue`):** Giá trị xu tối thiểu để kích hoạt.
   - **Chiến lược Combo (`comboTriggerMode`):**
     - `COMBO_MERGE`: Gộp toàn bộ quà cùng loại từ cùng 1 người gửi trong **cửa sổ cố định 1500ms** thành 1 lượt biểu diễn duy nhất với tổng số quà cộng dồn.
     - `EACH_EVENT`: Mỗi lần gửi tạo thành 1 lượt riêng biệt.
     - `THRESHOLD_STEP`: Kích hoạt theo từng mốc số lượng.
   - **Mẫu chữ Banner (`overlayTextTemplate`):** Nội dung thông báo hiển thị dưới chân nhân vật. Hỗ trợ biến thay thế: `{senderName}`, `{giftCount}`, `{giftName}`. Ví dụ:  
     `"{senderName} vừa cúng dường {giftCount} {giftName}"`.

---

### Tab 5: ⚙ Cài đặt, Sao lưu & Chẩn đoán (Settings)

1. **Hiệu năng Overlay (FPS Limit):**
   - Chuyển đổi giữa **30 FPS** (tiết kiệm GPU/CPU khi máy yếu) và **60 FPS** (chuyển động mượt mà). Thay đổi có hiệu lực ngay lập tức trên OBS mà không cần khởi động lại.
2. **Quản lý Phiên OBS & Thu hồi:**
   - Xem số phiên OBS đang kết nối.
   - Thu hồi toàn bộ token OBS khi phát hiện nghi vấn lộ đường dẫn.
3. **Sao lưu Dữ liệu An toàn (SQLite WAL Atomic Backup):**
   - 💾 **Sao lưu Database (.bak):** Xuất toàn bộ cơ sở dữ liệu SQLite sang tệp `.bak` độc lập bằng lệnh `VACUUM INTO`. Bản sao lưu được tạo nguyên tử, không làm gián đoạn tiến trình livestream đang diễn ra.
   - 📦 **Sao lưu Toàn bộ Bundle (DB + Assets):** Tạo thư mục gói chứa tệp cơ sở dữ liệu, toàn bộ tệp mô hình 3D GLB, âm thanh, kèm tệp `manifest.json`.
   - *Lưu ý an toàn:* Mọi token quản trị và cookie OBS đều được loại trừ hoàn toàn khỏi bản sao lưu để đảm bảo tuyệt đối an toàn nếu tệp được chia sẻ.
4. **Khôi phục Dữ liệu An toàn (Safe Restore with Rollback):**
   - 🔄 **Khôi phục Database (.bak)...:** Chọn tệp sao lưu `.bak` cần phục hồi.
   - Hệ thống tự động kiểm tra Magic Header SQLite (`SQLite format 3\0`) và chạy `PRAGMA quick_check` trước khi thực hiện.
   - Trước khi ghi đè, hệ thống tự động tạo bản lưu dự phòng `.pre-restore.bak`. Nếu tệp hỏng hoặc không tương thích schema, hệ thống sẽ **tự động hoàn nguyên (rollback)** về trạng thái ban đầu, không bao giờ làm mất dữ liệu.
5. **Xuất Báo cáo Chẩn đoán Kỹ thuật (Diagnostics Report):**
   - 📋 **Xuất Báo cáo Chẩn đoán (JSON):** Tạo tệp báo cáo kỹ thuật chuẩn format `1.0.0` chứa thông tin hệ điều hành, tài nguyên phần cứng, chỉ số SQLite WAL, thống kê hàng đợi và 50 lỗi gần nhất.
   - **Che giấu nhạy cảm 100% (Redacted):** Mọi token, cookie, khóa giải mã và tên người dùng Windows cá nhân trong đường dẫn (`C:\Users\<REDACTED_USER>\...`) đều được ẩn danh hoàn toàn trước khi lưu.
