# 🚀 The Singularity Odyssey — Game Web 2D Tug-of-War Lane Battle

Tựa game chiến thuật kéo co đẩy đường 2D (phong cách *Age of War / Cuộc chiến xuyên thế kỷ*) được xây dựng bằng **Vite + React 18 + TypeScript + PixiJS v8**, mô phỏng cuộc đua tiến hóa qua 6 Kỷ Nguyên từ thời **Tiền Sử** đến **Siêu Trí Tuệ AI (The Singularity)**.

---

## 🎯 CÁC CHẾ ĐỘ CHƠI ĐA DẠNG

1. **🎮 Chơi Đơn (Solo vs Bot AI 3 cấp độ):**
   - `EASY`: Sinh quân ngẫu nhiên, phản xạ chậm.
   - `NORMAL`: Phân tích lính tiên phong người chơi để triệu hồi quân khắc chế.
   - `HARD`: Tính toán toàn bộ đội hình, lấp đầy tháp canh, tính thời điểm tung chiêu cuối chiến lược.

2. **👥 Hai Người Chơi Cùng Máy (Local 2-Player):**
   - Chơi đối kháng trực tiếp 1v1 trên cùng bàn phím và màn hình.
   - Thanh điều khiển kép ở đáy: Phe Xanh (P1 bên trái) và Phe Đỏ (P2 bên phải).
   - Tự động kích hoạt khi chọn tab trên HUD hoặc truyền tham số URL `?mode=local2p`.

3. **🌐 Hai Người Chơi Qua Mạng (Online 2-Player P2P):**
   - Kết nối P2P thời gian thực bằng **WebRTC DataChannel** (thông qua mã phòng `SING-XXXX`) và **BroadcastChannel** (chạy đa tab/cửa sổ không cần internet với độ trễ 0ms).
   - Đồng bộ 2 chiều các hành động: mua lính, nâng cấp thời kỳ, nâng cấp lính/tháp và kích hoạt chiêu cuối.

4. **📡 Chế Độ Livestream OBS Studio & TikTok Live:**
   - Hỗ trợ màn hình ngang chuẩn 16:9 (`1280x720` / `1920x1080`) và màn hình dọc 9:16 (`720x1280` / `1080x1920`) chuẩn TikTok Live.
   - Chế độ nền trong suốt `?bg=transparent&mode=live` nhúng trực tiếp làm Browser Source đè lên camera streamer.
   - Tích hợp tên người xem trên đầu quân lính và bảng Top Donator.

---

## 🎮 CÁCH ĐIỀU KHIỂN & PHÍM TẮT

### Phe Trái (P1 - Phe Xanh) / Người chơi chính:
| Phím Tắt | Hành Động |
| :--- | :--- |
| `[1]` | Mua Lính Cận Chiến (Melee) |
| `[2]` | Mua Lính Tầm Xa (Ranged) |
| `[3]` | Mua Lính Chống Chịu (Tank) |
| `[4]` | Mua Lính Đặc Biệt (Special) |
| `[E]` | Tiến Hóa Lên Kỷ Nguyên Mới (khi đủ XP) |
| `[Space]` | Kích hoạt Tuyệt Chiêu Tối Thượng (Ultimate) |

### Phe Phải (P2 - Phe Đỏ) trong chế độ 2P Cùng Máy (Local 2P):
| Phím Tắt | Hành Động |
| :--- | :--- |
| `[J]` hoặc `[Numpad 1]` | Mua Lính Cận Chiến (Melee) |
| `[K]` hoặc `[Numpad 2]` | Mua Lính Tầm Xa (Ranged) |
| `[L]` hoặc `[Numpad 3]` | Mua Lính Chống Chịu (Tank) |
| `[;]` hoặc `[Numpad 4]` | Mua Lính Đặc Biệt (Special) |
| `[O]` | Tiến Hóa Lên Kỷ Nguyên Mới |
| `[Enter]` hoặc `[P]` | Kích hoạt Tuyệt Chiêu Tối Thượng (Ultimate) |

### Điều Khiển Camera:
- `[Mũi tên Trái / Phải]`: Cuộn camera khám phá chiến trường dài 4480px (tự động quay về tiền tuyến sau 3 giây).
- Kéo chuột / vuốt cảm ứng trên màn hình để duyệt chiến trường thủ công.

---

## ⚔️ HỆ THỐNG KHẮC CHẾ & 6 KỶ NGUYÊN HOÀN CHỈNH

- **Quy tắc tam giác:** `MELEE > RANGED > TANK > MELEE` (nhân hệ số x1.25 khi chiếm ưu thế, x0.80 khi thất thế).
- **Trọn bộ 6 Kỷ Nguyên:**
  1. **Tiền Sử (Prehistoric):** Người vượn đập gậy, Thợ săn ném đá, Dũng sĩ cưỡi khủng long, Thầy mo AoE, Chiêu cuối Mưa thiên thạch.
  2. **Trung Cổ (Medieval):** Hiệp sĩ gươm giáp, Xạ thủ cung tên, Kỵ sĩ giáo dài giáp sắt, Pháp sư lửa AoE, Chiêu cuối Mưa tên lửa.
  3. **Phục Hưng (Renaissance):** Kiếm sĩ giác đấu, Lính súng hỏa mai (Musketeer), Xe công thành Da Vinci bọc thép, Bác học ném độc Axít, Chiêu cuối Mưa đạn đại bác.
  4. **Hiện Đại (Modern):** Biệt kích đặc nhiệm súng trường, Xạ thủ bắn tỉa xuyên giáp, Xe tăng chiến đấu chủ lực bọc thép, Trực thăng vũ trang bay nã rocket, Chiêu cuối Không kích ném bom trải thảm.
  5. **Tương Lai (Futuristic):** Chiến binh gươm Plasma, Xạ thủ súng Laser nhiệt năng lượng cao, Robot Mech Titan lá chắn Nano, Drone tấn công bay phát xung EMP, Chiêu cuối Bão hạt Orbital Ion Cannon.
  6. **AI Singularity:** Hacker thần kinh (Neural Hacker) gây Slow + Giảm giáp + 15% xác suất Hack Convert lính địch, Robot Synthesizer Mech tích lũy năng lượng phóng xung đẩy lùi 120px, Hình chiếu ba chiều Hologram bất tử sát thương vật lý 4s, Chiêu cuối "System Reboot" hiệu ứng Glitch Matrix màn hình + Đóng băng toàn bộ lính địch + 30% cơ hội hồi sinh phe ta.

---

## 💻 CÁCH CHẠY VÀ KIỂM THỬ

### 1. Khởi chạy Server Game (Dev Mode)
```bash
npm run dev
# Hoặc: corepack pnpm --filter @singularity/game dev
```
Trình duyệt mở tại: `http://localhost:5173/`

### 2. Chế độ Chơi Cùng Máy (Local 2P) & Chơi Online (P2P)
- Mở URL: `http://localhost:5173/?mode=local2p` để chơi 2 người trên cùng máy.
- Mở URL: `http://localhost:5173/?mode=online2p` để tạo hoặc tham gia phòng thi đấu qua mạng.

### 3. Chạy Kiểm Thử Nghiệm Thu Toàn Diện (Playwright Suite)
```bash
node apps/game/scripts/verify-goal.mjs
```
Kịch bản tự động kiểm tra:
1. Chơi trọn một trận qua cả 6 thời kỳ (Tiền Sử -> AI Singularity -> Phá hủy nhà chính đối phương -> Victory).
2. Stress test 60 quân đồng thời ở độ phân giải 1280x720 (16:9 ngang) - Giữ vững 60 FPS (~218 FPS tối đa).
3. Stress test 60 quân đồng thời ở độ phân giải 720x1280 (9:16 dọc TikTok Live) - Giữ vững 60 FPS (~195 FPS tối đa).
4. Kiểm thử chế độ 2 người chơi Local 2P xuất quân bằng phím bấm riêng biệt.
5. Kiểm thử chế độ OBS Studio nền trong suốt `?bg=transparent`.
6. Kiểm soát 0 lỗi console (0 errors).

---

## 📡 NHÚNG VÀO OBS STUDIO (BROWSER SOURCE)

1. Mở **OBS Studio**, tạo nguồn **Browser**.
2. Đặt URL tương ứng:
   - **Màn hình ngang 16:9:** `http://localhost:5173/?mode=live` (1280x720 hoặc 1920x1080).
   - **Màn hình dọc 9:16 TikTok:** `http://localhost:5173/?mode=live` (720x1280 hoặc 1080x1920) - *Giao diện tự động co giãn, gom gọn thẻ lính và giữ safe area 6%*.
   - **Nền trong suốt:** `http://localhost:5173/?mode=live&bg=transparent`.
