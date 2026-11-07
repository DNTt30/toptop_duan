# Kế Hoạch Hoàn Thiện "The Singularity Odyssey" — Sẵn Sàng Chơi & Livestream (ke-hoach.md)

> Mục tiêu: Hoàn thiện toàn diện game thành bản chơi được và phát được trên livestream: 6 thời kỳ, chơi đơn và hai người (cùng máy, online), đồ họa sprite thống nhất, âm thanh, hiệu ứng, chế độ Live/OBS. Hoàn thành khi: chơi trọn một trận qua cả 6 thời kỳ, giữ 60 FPS với 60 quân ở 1280x720 và 720x1280, không lỗi console.

---

## Danh Sách Các Bước Thực Thi

### Bước 1: Nâng cấp Engine & World Core — Hỗ trợ 3 Chế Độ Chơi (Solo, Local 2P, Online 2P)
- **Làm gì:** 
  - Thêm `gameMode: 'SOLO' | 'LOCAL_2P' | 'ONLINE_2P'` vào `World.ts`.
  - Vô hiệu hóa `BotAI` khi ở chế độ 2 người chơi.
  - Xây dựng đầy đủ các phương thức điều khiển phe Phải (Right): `spawnRightUnit`, `ageUpRight`, `upgradeRightUnit`, `upgradeRightTurret`, `addRightTurretSlot`.
  - Mở rộng `WorldSnapshot` cung cấp toàn bộ dữ liệu kinh tế phe Phải (`rightGold`, `rightXp`, `rightQueue`, `rightUpgradeLevels`, `rightTurretLevel`, `rightTurretSlotsCount`).
  - Xây dựng module `NetworkSync.ts` hỗ trợ đồng bộ P2P thời gian thực qua WebRTC DataChannel (kèm mã phòng `SING-XXXX`) và `BroadcastChannel` (chạy mượt mà offline / đa tab trên cùng máy).
- **File:** `apps/game/src/engine/World.ts`, `apps/game/src/engine/NetworkSync.ts`
- **Tiêu chí xong:** Cả 2 phe đều có thể sinh quân, nâng cấp, lên kỷ nguyên độc lập hoặc đồng bộ qua mạng không lệch trạng thái.

### Bước 2: Tối Ưu Nạp Sprite & Preload 24 Quân 6 Kỷ Nguyên Giữ Vững 60 FPS
- **Làm gì:**
  - Nạp trước toàn bộ 24 sprite atlas của cả 6 kỷ nguyên ngay khi khởi động để loại bỏ hoàn toàn tình trạng sụt khung hình khi thăng cấp thời kỳ.
  - Đảm bảo đồ họa căn cứ, 3 ô tháp canh và bối cảnh Parallax 4 lớp hoạt động mượt mà cho cả 6 kỷ nguyên.
- **File:** `apps/game/src/engine/Renderer.ts`, `apps/game/src/engine/SpriteLoader.ts`
- **Tiêu chí xong:** Chuyển qua lại giữa các thời kỳ 1-6 không có độ trễ tải ảnh, 100% quân hiển thị hoạt ảnh sprite chân thực, 0 fallback.

### Bước 3: Nâng Cấp Hệ Thống Âm Thanh & SFX Tổng Hợp
- **Làm gì:**
  - Nâng cấp `AudioSynth.ts` với đầy đủ âm thanh: Trumpet Fanfare thăng cấp Kỷ nguyên, âm thanh nâng cấp quân/tháp, âm thanh chiến thắng/thất bại, glitch ma trận Matrix reboot.
  - Đồng bộ logic BGM và âm thanh SFX qua nút bật/tắt toàn cục.
- **File:** `apps/game/src/engine/AudioSynth.ts`
- **Tiêu chí xong:** Toàn bộ hành động đều có phản hồi âm thanh Web Audio API chất lượng cao, không cần tệp ngoài nặng nề.

### Bước 4: Thiết Kế Giao Diện Đa Chế Độ & Chuẩn Hóa Cả 2 Khung Hình (1280x720 và 720x1280)
- **Làm gì:**
  - Thiết kế layout đáp ứng tự động (Responsive):
    - **16:9 Landscape (1280x720):** Chuẩn OBS Studio, màn hình rộng với HUD trên đỉnh và thanh điều khiển đáy.
    - **9:16 Portrait (720x1280):** Chuẩn TikTok LIVE / Reels / Shorts với sàn đấu ở vị trí trung tâm, bảng điều khiển thẻ lính, nâng cấp, chat và minimap được tối ưu cho màn hình dọc di động.
  - Bổ sung cụm điều khiển cho 2 người chơi:
    - Phe Trái (P1): Phím `[1-4]`, `[E]`, `[Space]`, `[U]`.
    - Phe Phải (P2): Phím `[Numpad 1-4]` hoặc `[J, K, L, ;]`, `[O]`, `[Enter]`, `[I]`.
    - Nút bấm trực tiếp trên giao diện cho cả 2 người.
  - Modal kết nối Online: Tạo phòng, nhập Room ID, trạng thái kết nối.
- **File:** `apps/game/src/ui/HUD.tsx`, `apps/game/src/App.tsx`, `apps/game/src/engine/Renderer.ts`
- **Tiêu chí xong:** Giao diện co giãn chuẩn xác trên cả 1280x720 và 720x1280, hỗ trợ đầy đủ 3 chế độ Solo, Local 2P, Online 2P.

### Bước 5: Hoàn Thiện Chế Độ Livestream OBS & Tương Tác
- **Làm gì:**
  - Hỗ trợ `?bg=transparent` hiển thị nền trong suốt để làm Browser Source trong OBS Studio.
  - Tên người xem nổi trên đầu lính triệu hồi từ chat (`summonerLabels`).
  - Tích hợp Mock Simulator để streamer thử nghiệm toàn bộ lệnh chat (`!1-4`, `!up`, `!ulti`).
  - Bảng xếp hạng Top Donator hiển thị trực quan.
- **File:** `apps/game/src/live/LiveEventSource.ts`, `apps/game/src/ui/HUD.tsx`
- **Tiêu chí xong:** Streamer có thể stream ngay với đầy đủ tính năng tương tác khán giả.

### Bước 6: Kiểm Thử Nghiệm Thu Toàn Diện (Eval) — 60 FPS, 6 Kỷ Nguyên & 0 Lỗi Console
- **Làm gì:**
  - Xây dựng script kiểm thử tự động bằng Playwright:
    1. Chơi 1 trận xuyên suốt từ Kỷ nguyên 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> Chiến thắng.
    2. Đo FPS với 60 quân thực tế trên sân cùng lúc ở 1280x720 và 720x1280.
    3. Giám sát console log, xác nhận 0 lỗi console (0 errors).
    4. Chụp ảnh màn hình lưu vào `apps/game/screenshots/` làm bằng chứng nghiệm thu.
- **File:** `apps/game/scripts/verify-goal.mjs`
- **Tiêu chí xong:** Tất cả bài kiểm tra tự động đều PASS, có log chứng minh và ảnh chụp thực tế.
