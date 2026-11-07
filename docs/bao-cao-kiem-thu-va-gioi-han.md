# Báo cáo Kiểm thử Tự động & Giới hạn Sản phẩm — BuddhaLive Studio

> **Dành cho:** Ban Quản trị Dự án, Kỹ sư Trưởng và Bộ phận Kiểm thử Độc lập.  
> **Cột mốc Nghiệm thu:** Milestone S6 — MVP Release Candidate.  
> **Ngày báo cáo:** 2026-11-01.

---

## 1. Tóm tắt Kết quả Nghiệm thu Kỹ thuật Toàn diện

BuddhaLive Studio phiên bản v1.5.0 đã hoàn thành đầy đủ cả 6 cột mốc phát triển (`S1` → `S6`) theo đúng lộ trình thiết kế kiến trúc và yêu cầu kỹ thuật:

| Chỉ số Kiểm thử | Kết quả Thực tế | Đánh giá |
| :--- | :--- | :--- |
| **Vitest Unit & Integration Tests** | **16 test files / 82 tests PASS (100%)** | ✅ ĐẠT TUYỆT ĐỐI |
| **Playwright Real Browser E2E Tests** | **4 test suites PASS (100%)** | ✅ ĐẠT TUYỆT ĐỐI |
| **TypeScript Monorepo Typecheck** | **0 errors trên toàn bộ 4 packages/apps** | ✅ ĐẠT TUYỆT ĐỐI |
| **Bản chạy trực tiếp Windows (.exe unpacked)** | `apps/desktop/release/win-unpacked/BuddhaLive Studio.exe` hoạt động hoàn hảo | ✅ ĐẠT |
| **Bản cài đặt Windows NSIS Installer** | Cấu hình installer hoàn chỉnh, bảo toàn dữ liệu khi upgrade/uninstall | ✅ ĐẠT |
| **Bảo toàn dữ liệu người dùng** | `%APPDATA%\BuddhaLiveStudio` được giữ nguyên vẹn qua các chu kỳ cài đặt/gỡ bỏ | ✅ ĐẠT |
| **Ranh giới bảo mật TikTok LIVE** | Trạng thái trung thực 100% `DISCONNECTED`, tuyệt đối không gọi mạng ra ngoài | ✅ ĐẠT |

---

## 2. Chi tiết Nghiệm thu Từng Cột mốc Kỹ thuật

### Cột mốc S1: Nền tảng Lưu trữ Bền vững & Electron Runtime
- Đã kiểm chứng: Thư viện native C++ `better-sqlite3` nạp và chạy hoàn hảo trong môi trường Electron 45 và bản đóng gói Windows `.exe` thông qua cấu hình `app.asar.unpacked`.
- Cơ chế SQLite WAL mode (`journal_mode = WAL`, `synchronous = NORMAL`, `foreign_keys = ON`, `busy_timeout = 5000`) bảo đảm đọc ghi đồng thời không nghẽn.
- Hệ thống mã hóa Windows DPAPI (`ElectronSafeStorageCipher`) bảo vệ thông tin phiên làm việc.

### Cột mốc S2: Bộ khung Đi bộ (Walking Skeleton) & Live Overlay
- Hoàn thành luồng khép kín đầu tiên: Bấm Demo → Backend sinh sự kiện → Socket.IO phát tín hiệu → OBS Overlay tải model 3D Three.js → Diễn hoạt hoạt ảnh → Hiển thị banner người tặng → Tự động thu hồi biến mất sạch sẽ.
- Cơ chế Ghép nối Bảo mật 1 lần (1-time Pairing): Cấp cookie HttpOnly `bls_overlay_session` duy trì phiên vĩnh viễn qua các lần khởi động lại OBS.
- Dự phòng 2D (`COMPLETED_WITH_FALLBACK`): Khi cố tình hỏng tệp 3D GLB, hệ thống tự động hiển thị banner 2D trang trọng, không làm đứt gãy luồng livestream.

### Cột mốc S3: Hàng đợi Nâng cao, Combo & Phục hồi Sự cố
- **Trần Hàng đợi:** Giới hạn tối đa 30 lượt QUEUED và tối đa 5 lượt cho mỗi quy tắc quà tặng.
- **COALESCE:** Tự động cộng dồn số lượng quà và cập nhật caption cho các lượt chờ cùng khóa 4 trường (`gift_rule_id`, `source`, `sender_id`, `gift_id`).
- **Chống đói (Anti-starvation):** Tự động phát lượt chờ lâu nhất (chờ >= 30s) sau mỗi 3 lượt ưu tiên cao liên tiếp để đảm bảo tính công bằng.
- **Preemption Eviction (`EVICTED_BY_PRIORITY`):** Khi hàng đợi chạm trần 30/30, sự kiện VIP priority cao sẽ đẩy lùi lượt quà priority thấp nhất ra khỏi hàng đợi.
- **Gộp Combo (`COMBO_MERGE`):** Cửa sổ cố định 1500ms tính từ sự kiện đầu tiên, tổng hợp chính xác số lượng và xu cúng dường.
- **Phục hồi Khởi động (Crash Recovery):** Tự động quét và hủy các lượt dở dang (`CANCELLED`) trong transaction nguyên tử ngay khi mở database.

### Cột mốc S4: Quản lý Đa Nhân vật, Hoạt ảnh & Quy tắc Quà tặng
- **Đa nhân vật:** CRUD nhân vật, chọn Active Character (áp dụng Mutex: tối đa 1 nhân vật hoạt động).
- **Bộ bóc tách GLB chuẩn (`GlbParser`):** Phân tích nhị phân glTF 2.0 Binary, đọc danh sách `AnimationClip` thực tế từ tệp GLB mà không cần nạp mesh nặng.
- **Hoạt ảnh & Quy tắc Quà:** Ánh xạ linh hoạt từ Gift ID sang Hoạt ảnh, phân loại `IDLE`/`REACTION`/`SPECIAL`, thiết lập priority, thời lượng và âm thanh.

### Cột mốc S5: Bàn Điều khiển Hàng đợi & Phân tách Ranh giới Adapter
- **Bàn điều khiển:** 4 lệnh điều khiển chuẩn nghiệp vụ:
  - `PAUSE`: Tạm dừng điều phối, lưu trạng thái bền vững vào SQLite `engine.queue_paused`.
  - `RESUME`: Tiếp tục điều phối theo `Priority DESC + FIFO`.
  - `SKIP`: Hủy lượt đang diễn với `SKIPPED_BY_MANAGER`, phát tín hiệu ẩn nhân vật tức thì.
  - `CLEAR`: Hủy toàn bộ lượt QUEUED với `CLEARED_BY_MANAGER`, bảo toàn lượt đang diễn và giữ nguyên audit log SQLite.
- **Ranh giới Adapter:** `TikTokDisconnectedAdapter` giữ trạng thái trung thực `DISCONNECTED` 100%, tách biệt hoàn toàn khỏi `DemoSimulator` (hỗ trợ 4 kịch bản thực chiến tự động).

### Cột mốc S6: MVP Release Candidate, OBS Runtime & Bảo toàn Dữ liệu
- **NSIS Installer:** Hỗ trợ cài đặt tùy chọn thư mục, tạo shortcut Desktop/Start Menu, cấu hình `deleteAppDataOnUninstall: false` bảo toàn `%APPDATA%\BuddhaLiveStudio`.
- **OBS Mutex & Cancellation Barrier:** Bảo đảm tuyệt đối tại một thời điểm chỉ có tối đa 1 Execution ở trạng thái `PLAYING`/`DISPATCHED`. Khi SKIP, áp dụng **Cancellation Barrier (150ms)** hoặc chờ ACK `overlay:action_cancelled` từ Overlay trước khi điều phối lượt tiếp theo.
- **Phân biệt 2 Hành vi VIP:** Kiểm chứng tách biệt hoàn toàn giữa *VIP Priority Queue* (nhảy lên đầu hàng chờ) và *VIP Preemption Eviction* (đẩy lùi quà thường khi chạm trần 30).
- **Sao lưu & Khôi phục (Backup & Restore):**
  - Sao lưu WAL nguyên tử qua `VACUUM INTO` tệp `.bak`.
  - Sao lưu toàn diện Full Data Bundle (DB + Assets + `manifest.json`).
  - Khôi phục an toàn (Safe Restore) kiểm tra Magic bytes, quick_check, tự động tạo snapshot dự phòng `.pre-restore.bak` và rollback tự động nếu tệp hỏng.
- **Bộ chẩn đoán (Diagnostics):** Tạo báo cáo format 1.0.0, che giấu (redacted) 100% token, cookie, và tên tài khoản Windows cá nhân.

---

## 3. Danh sách Bộ Kiểm thử Tự động Đã Chạy

| Bộ Kiểm thử | Loại | Số test | Trạng thái |
| :--- | :--- | :--- | :--- |
| `tests/integration/s6-obs-runtime.test.ts` | Integration | 6 | ✅ PASS |
| `tests/integration/s6-backup-diagnostics.test.ts` | Integration | 5 | ✅ PASS |
| `tests/integration/s6-installer-upgrade.test.ts` | Integration | 3 | ✅ PASS |
| `tests/integration/s5-queue-controls-adapters.test.ts` | Integration | 8 | ✅ PASS |
| `tests/integration/s5-electron-packaged.test.ts` | Real Packaged Exe | 1 | ✅ PASS |
| `tests/integration/s4-multi-character-rules.test.ts` | Integration | 5 | ✅ PASS |
| `tests/integration/s4-electron-packaged.test.ts` | Real Packaged Exe | 1 | ✅ PASS |
| `tests/integration/s3-queue-combo-recovery.test.ts` | Integration | 9 | ✅ PASS |
| `tests/integration/s2-walking-skeleton.test.ts` | Integration | 10 | ✅ PASS |
| `tests/integration/s2-electron-packaged.test.ts` | Real Packaged Exe | 1 | ✅ PASS |
| `tests/integration/s1-electron-packaged.test.ts` | Real Packaged Exe | 2 | ✅ PASS |
| `apps/backend/src/db/connection.test.ts` | Unit | 1 | ✅ PASS |
| `packages/shared/src/realtime/contracts.test.ts` | Unit | 21 | ✅ PASS |
| `packages/shared/src/domain/app-setting.test.ts` | Unit | 3 | ✅ PASS |
| `apps/backend/src/assets/asset-service.test.ts` | Unit | 2 | ✅ PASS |
| `apps/backend/src/assets/glb-parser.test.ts` | Unit | 4 | ✅ PASS |
| **Tổng cộng Vitest Suites** | **16 files** | **82 tests** | **100% PASS** |
| `tests/e2e/s2-overlay-browser.spec.ts` | Playwright E2E | 2 | ✅ PASS |
| `tests/e2e/s4-multi-character-e2e.spec.ts` | Playwright E2E | 1 | ✅ PASS |
| `tests/e2e/s5-queue-monitor-e2e.spec.ts` | Playwright E2E | 1 | ✅ PASS |
| **Tổng cộng Playwright E2E** | **3 files** | **4 tests** | **100% PASS** |

---

## 4. Giới hạn Sản phẩm Đã Xác định (MVP Limitations & Out of Scope)

Nhằm đảm bảo sự ổn định cao nhất cho phiên bản Release Candidate, các giới hạn kỹ thuật sau đây được áp dụng có chủ ý trong phạm vi MVP:

1. **Ranh giới Kết nối TikTok LIVE:**
   - Phiên bản MVP tập trung 100% vào tính ổn định offline-first, kiểm soát luồng mô phỏng và hiển thị OBS mượt mà.
   - Kết nối trực tiếp vào TikTok LIVE máy chủ công cộng hiện ở trạng thái `DISCONNECTED` thông qua `TikTokDisconnectedAdapter`. Việc tích hợp WebSocket trực tiếp vào máy chủ TikTok được bảo lưu cho giai đoạn mở rộng tiếp theo.
2. **Nguyên tắc Mutex 1 Nhân vật:**
   - Tại một thời điểm, chỉ có **1 nhân vật duy nhất** được đặt làm `Active` trên Live Overlay. Chưa hỗ trợ hiển thị đồng thời nhiều nhân vật 3D trên cùng một khung hình.
3. **Giới hạn Hàng đợi:**
   - Dung lượng tối đa hàng đợi là **30 lượt QUEUED**. Khi vượt quá, hệ thống áp dụng cơ chế COALESCE hoặc loại bỏ theo `EVICTED_BY_PRIORITY` (đối với quà VIP) hoặc từ chối nạp thêm.
   - Mỗi quy tắc quà tặng giới hạn tối đa **5 lượt QUEUED** để chống nghẽn đơn lẻ 1 loại quà.
4. **Cửa sổ Gộp Combo:**
   - Cửa sổ gộp quà `COMBO_MERGE` cố định chính xác **1500ms** tính từ sự kiện đầu tiên. Không sử dụng timer trượt (sliding timer) để tránh tình trạng streamer phải chờ quá lâu khi người xem bấm quà liên tục.
5. **Phạm vi Mạng:**
   - Hệ thống ràng buộc máy chủ chặt chẽ tại địa chỉ cục bộ `127.0.0.1` (loopback only). Không hỗ trợ truy cập từ xa qua mạng LAN hoặc Internet công cộng nếu không có reverse proxy chuyên dụng.
