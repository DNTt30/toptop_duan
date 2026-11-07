# Giấy Nhớ Việc Đang Làm (dang-lam.md)

## 1. Trạng Thái Hiện Tại
- **Module:** Hoàn thiện game "The Singularity Odyssey" (@singularity/game) thành bản chơi được và phát được trên livestream: 6 thời kỳ, chơi đơn và hai người (cùng máy, online), đồ họa sprite thống nhất, âm thanh, hiệu ứng, chế độ Live/OBS.
- **Trạng thái:** **HOÀN THÀNH TOÀN DIỆN 100% (GOAL COMPLETE) ✅**
- **Nghiệm thu:** Đã vượt qua toàn bộ 6/6 tiêu chí nghiệm thu tự động bằng Playwright (`verify-goal.mjs`), 0 lỗi console, tốc độ khung hình 195 - 218 FPS (vượt xa chuẩn 60 FPS).

## 2. Kế Hoạch 6 Bước Đã Thực Hiện
- [x] **Bước 1:** Nâng cấp World Engine hỗ trợ 3 chế độ (Solo vs Bot 3 cấp độ, Local 2P trên cùng máy, Online 2P P2P) + Module `NetworkSync.ts` (WebRTC DataChannel & BroadcastChannel offline).
- [x] **Bước 2:** Preload toàn diện 24 sprites cả 6 Kỷ Nguyên (`preloadAllAges`), thiết kế kiến trúc căn cứ riêng biệt 6 thời kỳ, bảo toàn texture khi crossfade nền (`Renderer.ts`, `SpriteLoader.ts`).
- [x] **Bước 3:** Nâng cấp Web Audio API tổng hợp (`playUpgrade`, `playAgeUp`, `playUltimate`, `playVictory`, `playDefeat`), nạp nhạc nền BGM `theme.mp4`, nút bật/tắt âm thanh toàn cục (`AudioSynth.ts`).
- [x] **Bước 4:** Thiết kế lại HUD thông minh: thích ứng tỷ lệ 16:9 và 9:16 dọc TikTok Live, hỗ trợ song song cụm điều khiển P1 (phím 1-4, E, Space) và P2 (phím J, K, L, ;, O, Enter/P) và Modal kết nối P2P (`HUD.tsx`, `App.tsx`).
- [x] **Bước 4.1 (Mới):** Tích hợp Màn hình Cài Đặt Khởi Động & Chọn Chế Độ (`StartSettingsModal.tsx`) xuất hiện ngay khi mở game, cho phép chọn Solo/Local 2P/Online 2P, độ khó bot, âm thanh, tốc độ, kèm nút `⚙️ Cài Đặt` trên thanh HUD để mở lại bất cứ lúc nào.
- [x] **Bước 4.2 (Sảnh Đợi Online Lobby):** Xây dựng hoàn chỉnh Sảnh Chờ (`OnlineLobbyModal.tsx`) & Logic Nghiệp Vụ Handshake P2P (`NetworkSync.ts`):
  - Người 1 bấm "Tạo Phòng & Vào Sảnh" -> Vào Sảnh Chờ, hiển thị Mã phòng to rõ, có nút Copy Mã/Link, Slot 1 Sẵn Sàng, Slot 2 Đang Chờ kết nối...
  - Người 2 nhập Mã phòng -> Bấm "Vào Sảnh Chờ Ngay" -> Hệ thống tự động bắt tay Handshake Retry.
  - Khi 2 bên kết nối: Cả 2 tab lập tức cập nhật `CONNECTED`, Slot 2 hiển thị `✅ ĐÃ THAM GIA`, chuông báo kết nối reo, đếm ngược tự động 5s hoặc Chủ phòng bấm "Bắt Đầu Trận Đấu Ngay".
  - Cả 2 cùng đóng Sảnh Chờ và bước vào trận chiến đồng bộ 100%.
- [x] **Bước 4.3 (Tinh Gọn Nâng Cấp - Chuẩn Age of War):** Loại bỏ hoàn toàn nâng cấp tướng/lính trong trận. Gom toàn bộ cơ chế nâng cấp vào duy nhất **Vũ Khí Trên Thành (Turret Weapons)**: Nâng cấp đẳng cấp vũ khí thành (+25% ST, +10% tầm), mở thêm ô cắm tháp, gắn/bán vũ khí trên thành theo kỷ nguyên, phím tắt `[T]`. Bot AI cũng được chuyển sang ưu tiên nâng cấp và mua vũ khí thành.
- [x] **Bước 4.4 (Tinh Gọn Giao Diện - Giảm Box & Bỏ Đường Viền Thô):**
  - **StartSettingsModal.tsx:** Bỏ viền ngoài neon kép dày 2px `border: 2px solid #38bdf8`, bỏ bóng đổ chói lóa. Chuyển sang khung mờ sâu với viền siêu mảnh `border: 1px solid rgba(255, 255, 255, 0.1)`. Xóa bỏ các box bao bọc lồng nhau ở mục Chọn chế độ, Độ khó Bot AI, Âm thanh & Tốc độ.
  - **OnlineLobbyModal.tsx:** Bỏ viền đứt nét vàng thô `2px dashed #facc15` ở khung mã phòng; bỏ viền hộp dày bao quanh 2 slot Host vs Guest. Sử dụng thẻ mờ phẳng tinh tế, nút bấm không viền hiện đại.
  - **HUD.tsx:** Bỏ viền dày ở khối Căn Cứ Bạn & Đối Thủ; làm phẳng thanh máu HP không còn viền lồng viền; bỏ viền dày ở Minimap và thanh Switcher; xóa bỏ nút "Tháp Canh" cũ chiếm chỗ ở góc trái dưới; căn chính giữa cụm thẻ mua quân và Ulti tại đáy màn hình.
- [x] **Bước 5:** Tối ưu chế độ OBS Studio (`?bg=transparent&mode=live`), nhãn tên người xem trên đầu quân lính triệu hồi, hiệu ứng chiêu cuối Glitch Matrix hoành tráng.
- [x] **Bước 6 (Eval):** Tự động kiểm thử trận đấu qua 6 thời kỳ (Tiền Sử -> AI Singularity -> Phá hủy nhà chính -> Victory), stress test 60 quân đồng thời @ 1280x720 và 720x1280 (frame budget 4.5ms - 5.1ms/frame, tương đương ~200 FPS), xác nhận 0 lỗi console.

## 3. Danh Sách Minh Chứng Nghiệm Thu (Screenshots & Logs)
- `apps/game/screenshots/match_01_age1_prehistoric.png` - Trận đấu Kỷ Nguyên 1 Tiền Sử
- `apps/game/screenshots/match_02_age2.png` - Tiến hóa Kỷ Nguyên 2 Trung Cổ
- `apps/game/screenshots/match_03_age3.png` - Tiến hóa Kỷ Nguyên 3 Phục Hưng
- `apps/game/screenshots/match_04_age4.png` - Tiến hóa Kỷ Nguyên 4 Hiện Đại
- `apps/game/screenshots/match_05_age5.png` - Tiến hóa Kỷ Nguyên 5 Tương Lai
- `apps/game/screenshots/match_06_age6.png` - Tiến hóa Kỷ Nguyên 6 AI Singularity
- `apps/game/screenshots/match_06_ultimate_matrix_glitch.png` - Kích hoạt chiêu cuối System Reboot & Glitch Matrix
- `apps/game/screenshots/match_07_victory.png` - Màn hình Chiến Thắng (Victory)
- `apps/game/screenshots/stress_test_60units_1280x720.png` - Stress test 60 quân 16:9 ngang
- `apps/game/screenshots/stress_test_60units_720x1280_portrait.png` - Stress test 60 quân 9:16 dọc TikTok Live
- `apps/game/screenshots/mode_local_2player.png` - Chế độ 2 người chơi cùng máy (Local 2P)
- `apps/game/screenshots/mode_obs_transparent_overlay.png` - Chế độ OBS Livestream trong suốt

## 4. Pipeline Bug Hunt & Fix (bug_hunter -> qa_tester -> dev_fixer)
- **BUG-01 (Đồng bộ cấu hình Override):** Đã kết nối `getSpriteConfig` trong `sprites.ts` với `getUnitFrameOverride` trong `frameOverrides.ts`; bổ sung phương thức `reloadSprite(unitId)` vào `SpriteLoader` và gắn vào nút *Lưu Cấu Hình Vào Game* trong `PreviewGallery.tsx`.
- **BUG-02 (Điểm neo chân & Bobbing):** Đã cập nhật `anchor.y = 0.90` trong `sprites.ts` và các file `*_animation.json` (chính xác với bàn chân tiếp đất Y=230); triệt tiêu cộng dồn `bobbing` mã nguồn vào `actualY` của sprite texture hoạt họa trong `Renderer.ts` (chỉ áp dụng bobbing khi vẽ fallback chibi vector).
- **BUG-03 (Chữa lỗi bàn chân bị cắt ngang & Màn hình đen Studio):**
  - Khôi phục bàn chân nguyên vẹn cho Người Vượn, tạo vùng đệm an toàn 20px giữa Row 1 (Walk) và Row 2 (Attack).
  - Phòng vệ dữ liệu `studioUnitConfig` trong `frameOverrides.ts` và `PreviewGallery.tsx`, chấm dứt hoàn toàn hiện tượng màn hình đen khi mở Studio.
- **EVAL-04 (Bộ Atlas Đầy Đủ 4 Quân Tiền Sử):**
  - Tự động dựng đầy đủ 4 hàng cho cả 4 quân: Người Vượn (`caveman`), Thợ Săn (`hunter`), Dũng Sĩ Khủng Long (`dino`), Thầy Mo (`shaman`).
  - Mỗi quân đều sở hữu đầy đủ 4 trạng thái: Idle (4F), Walk (4F), Attack (3-4F), Hurt (2F), Die (2F). Không còn tình trạng hàng trống 0 pixel hay rơi về dummy hình tròn màu vàng.
- **EVAL-05 (Màn Hình Menu Age of War, Quản Lý Pháo Thành & Tiếp Đất Tuyệt Đối):**
  - Màn hình Menu chuẩn Age of War: Play -> Chế Độ (Chơi Đơn / 2P / Online) -> Độ Khó (Dễ / Vừa / Khó).
  - Ván mới khởi tạo tường thành trống `0` pháo (`slots = [null]`, mở khóa tối đa 3 ô); lên Kỷ nguyên giữ nguyên pháo đã mua trên tường (hiển thị đúng hình kỷ nguyên gốc) cho tới khi bán; chơi lại hoặc vào ván mới xóa sạch pháo cũ (`world.reset()`).
  - Chuẩn hóa `anchor.y = 0.90` toàn bộ quân bộ để bàn chân tiếp đất chắc chắn tại sàn `Y = 540`.
- **EVAL-06 & EVAL-07 (6 Hạng Mục Nâng Cấp Lớn & Vòng Săn Lỗi Độc Lập 2):**
  1. **Đội hình cách đều (`>= 65px`) & Cung thủ đánh cận chiến bằng tay (`<= 65px`):** Quân ra cổng giữ giãn cách đều, đi nối đuôi đồng minh chậm mượt mà không nhấp nháy `walk`/`idle`, và lính tầm xa mặt đất tự chuyển sang `MELEE_HIT` khi địch áp sát `<= 65px`.
  2. **Mở rộng bản đồ toàn màn hình trên/dưới & Gộp thanh máu căn cứ:** Bầu trời và lòng đất (`maxGroundLocalY = 2920`) phủ kín mọi tỉ lệ khung hình từ 21:9 tới dọc 20:9; gộp thanh máu kính mờ trên HUD và thanh máu ngay trên nóc 2 thành trì.
  3. **Ẩn thanh chọn chế độ trong trận & Duy nhất 1 nút/bảng Cài Đặt:** Bỏ thanh chuyển chế độ trong trận; nút `⚙️ Cài Đặt` duy nhất mở thẳng thẻ Cài đặt đơn (`inGameOnly`); chặn phím tắt khi `PAUSED`.
  4. **Kỷ nguyên 3 (Phục Hưng) & 24 Chân dung HUD:** Bổ sung đầy đủ panorama, thành trái/phải, 3 đại bác Hoàng Gia, 4 bộ sprite 4 hàng hoạt họa sạch viền cho Kỷ nguyên 3 và 24 ảnh chân dung nhân vật trên nút mua quân cho cả Solo, Local 2P (kèm ngăn Pháo Thành P2 `[I]`) và Online 2P.
  5. **Tuyệt chiêu cuối Mưa Pháo Ngẫu Nhiên (`CANNONADE` & các chiêu mưa đạn):** Thả 8 quả pháo rơi so le với tản xạ ngẫu nhiên cho tỉ lệ trúng tự nhiên ~20%–80%, sát thương `% maxHp` kèm làm choáng.
- **Kết quả Eval 4 Nấc (`bug_hunter` -> `qa_tester` -> `dev_fixer`):**
  - Vitest test suite (`apps/game/src/tests/bugHuntPipeline.test.ts`): **19/19 Tests PASS (GREEN) 100%**.
  - Typecheck & Build (`corepack pnpm --filter @singularity/game build`): **Thành công 0 lỗi biên dịch trong 1.01s**.

- **EVAL-08 (Hệ Thống Phát Animation Chuẩn Xác & Delta-Time Cho Toàn Bộ Quân):**
  1. **`AnimationController` (`IDLE`, `WALK`, `ATTACK`, `HURT`, `DIE`):**
     - `ATTACK` không bị ngắt giữa chừng, chạy trọn vẹn clip (trừ khi vào `DIE`). Cooldown tấn công luôn `>=` thời lượng clip attack (`frameCount / fps`).
     - Sát thương và đạn chỉ kích hoạt tại sự kiện `hit` (cận chiến) hoặc `release` (bắn tên/đạn) trong clip, kèm cơ chế hit-stop 2–3 tick (`~0.045s`).
     - `HURT` chỉ chen ngang khi bị choáng hoặc đẩy lùi mạnh (`>= 40px`); sát thương thông thường chỉ nháy trắng + giật lùi nhẹ bằng code mà không ngắt `ATTACK`.
     - `DIE` không bao giờ bị ngắt, quân chết miễn nhiễm hoàn toàn với sát thương tiếp theo. Chuyển trạng thái đưa vào hàng đợi `queuedState` với thời gian hiển thị tối thiểu `minDisplayTime`.
  2. **Animation theo thời gian thực (Delta Time):** Tính toán chỉ số khung hình bằng `Math.floor(elapsedTime * fps)`. Tự động bỏ khung khi tụt FPS, giữ vững thời lượng và nhịp điệu chiêu thức.
  3. **Khai báo chuẩn hóa `SpriteConfig` cho 24 quân:** Đầy đủ số khung, fps, `hitFrame`, `releaseFrame`, điểm neo bàn chân `anchor: { x, y }`, cờ `loop`.
  4. **Chi tiết thị giác sinh động bằng Code:** Bóng đổ elip độc lập dưới chân co giãn theo độ cao; nhún nảy nhẹ khi sải bước; nháy trắng bừng sáng khi trúng đòn; giật lùi mượt mà theo gia tốc; mờ dần `alpha` khi tử trận; hiệu ứng rung chấn màn hình (screen shake) khi Tank nã pháo và đánh cận chiến.
  5. **Nâng cấp trang `/preview` Studio:** Bổ sung chế độ quay chậm `0.25x`, hiển thị số khung trực tiếp theo thời gian thực, khung trúng đòn `hitFrame` / thả đạn `releaseFrame`, điểm neo bàn chân `anchor`, và bảng kiểm toán đối chiếu thời lượng clip đánh vs tốc độ hồi chiêu (`clipDur <= cd`).

- **EVAL-09 ( — Hoàn Thiện Từng Quân 1 Theo Chuẩn 4 Hành Động):**
  - **Quân 1: Người Vượn (Caveman - Tiền Sử):**
    - Trích xuất & phê duyệt Master Still tại art/master/caveman_approved/master.json.
    - Tự tạo & nội suy đầy đủ chi tiết còn thiếu:
      + Walk (8 khung @ 12fps): Đủ 4 tư thế 2 chân (Contact L -> Down L -> Pass R -> Up L -> Contact R -> Down R -> Pass L -> Up R), khớp tốc độ bước chân 96 px/s với sải chân 64 px.
      + Attack (8 khung @ 12fps): 2F chuẩn bị, 2F vung có vệt chém motion smear ánh vàng/trắng, ghim trúng đòn hitFrame = 3 (250 ms), 2F va chạm/hãm lực, 2F thu về.
      + Hurt (3 khung @ 12fps): Giật lùi, mất thăng bằng, hồi phục.
      + Idle (4 khung @ 8fps): Nhịp thở nhẹ lồng ngực & vai.
    - Chuẩn hóa toàn bộ ô 256x256, anchor Y = 0.90 (bàn chân tiếp đất chính xác tại Y = 230, sạch viền).
    - Xuất Atlas mở rộng 2048x1024, Contact Sheet PNG và dữ liệu selection.json từ retime.py.
    - Kiểm thử tự động Vitest 19/19 Tests PASS 100% & Build thành công.

- **EVAL-10 (Cân Bằng Hệ Thống Chiến Đấu, Đối Xứng & Ma Trận Độ Khó - Task T1c PHẦN 3):**
  - **Commit de60ce9 (Bước 1):** Hạ tầng đối xứng toán học (`symmetry.ts`) & cấu hình độ khó, chiến thuật data-driven (`aiBalance.ts`). Triệt tiêu hằng số pixel tuyệt đối cũ.
  - **Commit 2e6dca5 (Bước 2):** Vòng lặp tick 2 pha đồng thời (`World.ts` & `Unit.ts`): Pha 1 Quyết định (Decision) đọc snapshot đầu tick -> Pha 2 Thực thi (Execution) áp dụng đồng thời di chuyển và sát thương. Khóa an toàn vai trò SURRENDER qua mạng (`NetworkSync.ts`).
  - **Commit 70a6292 (Bước 3):** Vùng rơi và tầm Ultimate đối xứng tuyệt đối qua tâm sân (`Ultimate.ts`). Seed PRNG deterministic.
  - **Commit c6e2234 (Bước 4):** Ma trận độ khó (Hard vs Normal >= 65%, Normal vs Easy >= 70%) và tối ưu hóa chiến thuật `FOCUS_UPGRADE` (duy trì tối thiểu 2 lính, khử 100% kẹt 0 quân, % trống quân giảm xuống 1.1% - 1.2%).
  - **Commit 48a37d4 (Bước 5):** Chuỗi phân định 4 nấc xác định khi 2 căn cứ vỡ cùng tick trong `World.checkBaseDestruction()` (Máu âm ít hơn -> Tổng sát thương -> Tổng HP quân & vàng -> Seed PRNG).
  - **Commit e260236 (Docs):** Cập nhật dữ liệu đo đạc thực nghiệm 3.000 trận vào `BALANCE_REPORT.md`.
  - **Toàn bộ Test Suite:** 9/9 Test files PASS, 51/51 Tests PASS 100%. TypeScript monorepo typecheck 0 lỗi.

- **EVAL-11 (Nghiệm Thu Đo Lại Toàn Diện - Task T1c PHẦN 3b) ✅:**
  - **Chỉ đo & báo cáo, KHÔNG sửa code game:** Viết các script benchmark độc lập song song đa luồng (`run-all-benchmarks.ts`, `matchWorker.ts`, `trace-unfinished.ts`, `verify-determinism.ts`).
  - **Xác nhận Determinism & Math.random:** 10/10 ván cùng seed cho kết quả trùng khớp bit-for-bit từng tick. Toàn bộ `Math.random` trong engine loop đều đã được thay bằng PRNG có seed.
  - **9 Nhóm Đối Xứng (9.000 ván):** Winrate hai phe đạt chuẩn 47.9% - 52.6% (95% Wilson Score bao trùm 50.0%), độ lệch tiền tuyến -15.3 px đến +11.9 px (cách xa ngưỡng +-100 px), tỷ lệ trống sân hai phe chênh lệch <= 0.3%.
  - **6 Nhóm Ma Trận Độ Khó Đổi Bên (6.000 ván):**
    + Hard vs Normal: Hard thắng trung bình 65.2% (>= 65%).
    + Normal vs Easy: Normal thắng trung bình 93.6% (>= 70%). Độ chênh đổi bên 2.6% (<= 5%).
    + Hard vs Easy: Hard thắng trung bình 97.2%. Độ chênh đổi bên 0.9% (<= 5%).
  - **Phân tích UNFINISHED:** Quân chết chủ yếu do quân (tiền tuyến ở 1.700px - 2.900px ngoài tầm tháp 250px); tháp đơn lẻ không chặn được đợt đẩy; bot chi tiêu 97-99% vàng (không tích vàng).
  - **Xác nhận vàng:** Tỷ lệ tự sinh là 3.0 - 4.5 vàng / giây mô phỏng (0.05 - 0.075 vàng / tick), thưởng diệt lính 60% giá thành.
  - **Kiểm thử hệ thống & Bảo mật Production:** Typecheck 0 lỗi, 51/51 unit tests PASS, 5/5 integration tests PASS, production bundle 0 rò rỉ biến toàn cục `__world`, `__netSync`, `gameSettings`. Xác nhận 2 test E2E OBS hỏng từ trước tại commit `6cd7976` do format chuỗi text tiếng Việt.
  - **Cập nhật Báo Cáo:** Đã xuất đầy đủ vào `BALANCE_REPORT.md`.

- **EVAL-12 (Nhịp Trận & Chiến Thuật Người Chơi Giả - Task T1c PHẦN 4) ✅:**
  - **BƯỚC 1 (Đo thực nghiệm 8.000 ván RUSH & TIMING):**
    + RUSH vs BALANCED: Phá căn cứ 99.2% - 99.3%, Winrate RUSH 99.7% - 99.8%, thời lượng trung vị 450.9s - 452.1s.
    + RUSH vs SPAM / FOCUS: Phá căn cứ 99.6% - 99.9%, Winrate RUSH 99.8% - 100%, trung vị 430s - 442s.
    + TIMING vs BALANCED: Winrate TIMING 91.8% - 93.9%.
  - **BƯỚC 2 (Kết luận điều kiện dừng):**
    + RUSH phá căn cứ >= 99% trong < 600s -> Dừng ở Bước 2 và xác nhận: Bế tắc chỉ là hiện tượng Bot vs Bot do phong cách phòng thủ bị động; người chơi chủ động dứt điểm trận đấu dễ dàng trong 7 phút.
  - **BƯỚC 3 (Kiểm chứng toàn diện):**
    + Typecheck monorepo 0 lỗi.
    + Unit test suite 51/51 tests PASS 100%.
    + Cập nhật template banner cho 2 test E2E Playwright s2 và s4: 3/3 tests PASS (45.8s).
    + Build production thành công 1.08s, 0 rò rỉ biến toàn cục.
    + Rà soát 134 test cases integration.
    + Cập nhật BALANCE_REPORT.md.

- **Đồng Bộ Git Remote:**
  - Đã kết nối và đẩy toàn bộ mã nguồn dự án lên GitHub Repository: https://github.com/DNTt30/toptop_duan.git (nhánh main và nhánh fix/build-lobby, clean working tree).
