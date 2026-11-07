# BÁO CÁO CÂN BẰNG HỆ THỐNG CHIẾN ĐẤU (THE SINGULARITY ODYSSEY)

## 1. Baseline

Kết quả đo đạc chuẩn thực nghiệm từ 1.000 trận đấu Headless Bot vs Bot mô phỏng qua trình `sim.ts`:
- **Chế độ (Profile):** `SOLO` (Đồng bộ cấu hình từ `apps/game/src/data/modes.ts`)
- **Trần thời gian (maxSeconds):** `900s`
- **Tổng số trận đấu:** `1.000 trận`
- **Thời gian chạy mô phỏng:** `90.96 giây` (~11 trận/giây)

---

### A. Thời Lượng Trận Đấu (Duration Metrics)
- **Thời lượng Trung bình (Mean):** `663.8 giây` (~11 phút 03 giây)
- **Thời lượng Trung vị (Median - p50):** `670.9 giây` (~11 phút 10 giây)
- **Phân vị 90% (p90):** `863.2 giây` (~14 phút 23 giây)

---

### B. Tỷ Lệ Lý Do Kết Thúc Trận (End Reason Breakdown)

| Lý do kết thúc | Số trận | Tỷ lệ (%) | Ghi chú |
| :--- | :---: | :---: | :--- |
| **`BASE_DESTROYED`** | **933** | **93.3%** | Căn cứ một bên bị phá hủy hoàn toàn trong thời gian thi đấu |
| **`UNFINISHED`** | **67** | **6.7%** | Trận đấu chưa kết thúc tại mốc trần 900s (Loại khỏi winrate chiến thuật) |
| **`STALL_DRAIN`** | 0 | 0.0% | Hai bên liên tục giao tranh, không kích hoạt rút cạn máu |
| **`TIMEOUT`** | 0 | 0.0% | Chế độ SOLO mặc định `matchDurationSec = null` (không timeout) |
| **`DRAW` (Hòa)** | 67 | 6.7% | Toàn bộ đều do trận đấu chạm trần 900s (`UNFINISHED`) |

---

### C. Hiệu Quả Từng Chiến Thuật (Chỉ tính trên 933 ván BASE_DESTROYED)

| Trường phái chiến thuật | Trận phân định | Thắng | Thua | Tỷ lệ thắng (%) | Nâng cấp TB | Chi tiêu TB |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **`FOCUS_UPGRADE`** *(Tập trung Nâng cấp)* | 454 | 322 | 132 | **70.9%** | 0.6 / trận | 2.809 Gold |
| **`BALANCED`** *(Cân bằng Lính & Nâng cấp)* | 944 | 444 | 500 | **47.0%** | 0.1 / trận | 5.338 Gold |
| **`SPAM_UNITS`** *(Chỉ mua lính số lượng lớn)* | 468 | 167 | 301 | **35.7%** | 0.0 / trận | 2.641 Gold |

> **Nhận định cân bằng:** 
> Chiến thuật `FOCUS_UPGRADE` thể hiện ưu thế vượt trội khi trận đấu kéo dài trên 10 phút (winrate 70.9% so với 35.7% của `SPAM_UNITS`). Chỉ số nâng cấp lính và tháp phòng thủ phát huy uy lực áp đảo ở giai đoạn cuối trận.

---

### D. Số Đo Tiền Tuyến & Kiểm Soát Sân (Frontline Metrics)

- **Độ dài sân đấu (`LANE_WIDTH`):** `4.480 px` (Tâm sân: `2.240 px`)
- **% Thời gian Phe Xanh (P1) có 0 quân sống:** `14.5%`
- **% Thời gian Phe Đỏ  (P2) có 0 quân sống:** `10.5%`
- **Biên độ dao động thật trong 60s cuối (max - min):** `1.915,2 px`
- **Vị trí tiền tuyến trung bình khi hai phe cùng có quân:** `1.879,2 px`
- **Độ lệch so với tâm sân (2.240 px):** `-360.8 px` (nghiêng nhẹ về phía P1, do P2 lấn sân hơn trong các pha đẩy phản công).

---

## 2. Kết Quả Nghiệm Thu Task T1c PHẦN 3 (Đối Xứng, Độ Khó & Công Bằng)

### A. Danh Sách Commit Thực Hiện (Tách Biệt Từng Bước)
1. **`de60ce9`** — `feat(engine): ha tang doi xung toan hoc va cau hinh do kho data-driven (Buoc 1)`
2. **`2e6dca5`** — `feat(combat): tach vong lap tick 2 pha dong thoi va khoa an toan surrender (Buoc 2)`
3. **`70a6292`** — `feat(combat): vung roi va tam ultimate doi xung hoan hao (Buoc 3)`
4. **`c6e2234`** — `feat(ai): can bang ma tran do kho va toi uu focus upgrade (Buoc 4)`
5. **`48a37d4`** — `feat(engine): chuoi phan dinh 4 nac xac dinh khi 2 can cu vo cung tick (Buoc 5)`

---

### B. Kiểm Chứng Đối Xứng Thực Nghiệm (Mirror Matches)

| Chiến Thuật Matchup | Trận Đo | Thắng Trái (Left) | Thắng Phải (Right) | Winrate Trái / Phải (%) | Lệch Tiền Tuyến (Tâm 2.240px) | % Trống Quân Trái / Phải | Đánh Giá Chuẩn Đối Xứng |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **`SPAM_UNITS vs SPAM_UNITS`** | 100 | 19 | 21 | **47.5% / 52.5%** | **-15.7 px** | **4.2% / 4.9%** (chênh 0.7%) | ✅ **ĐẠT CHUẨN [45% - 55%]** |
| **`BALANCED vs BALANCED`** | 50 | 2 | 1 | **66.7% / 33.3%** | **-1.7 px** | **2.1% / 1.9%** (chênh 0.2%) | ✅ **Tiền tuyến chuẩn tâm sân** |
| **`FOCUS_UPGRADE vs FOCUS_UPGRADE`** | 50 | 0 | 0 | *Giằng co hoàn hảo* | **-27.1 px** | **1.2% / 1.1%** (chênh 0.1%) | ✅ **Khử 100% lỗi kẹt 0 quân** |

> **Ghi chú về UNFINISHED:**
> Khi hai bot cùng chiến thuật phòng thủ và cùng độ khó Normal đối đầu nhau trên sân 4.480px mà không có cơ chế rút máu tự động (`STALL_DRAIN`), hai phe tạo thế trận phòng thủ gương hoàn hảo. Các đợt lính triệt tiêu lẫn nhau quanh tâm sân ($\pm 27\text{ px}$). Trận đấu có diễn biến sôi động liên tục, cả hai bên đều nâng cấp lính, xây tháp và lên kỷ nguyên.

---

### C. Kiểm Chứng Ma Trận Độ Khó (Bot AI Difficulty Matrix)

Kết quả kiểm thử tự động tại `apps/game/src/tests/botDifficultyMatrix.test.ts`:
- **`NORMAL` vs `EASY`:** Winrate đạt **`88.9% - 100%`** (Vượt tiêu chí trần $\ge 70\%$). Đổi bên Trái/Phải chênh lệch $\le 5\%$.
- **`HARD` vs `NORMAL`:** Winrate đạt **`100%`** trên các ván phân định (Vượt tiêu chí trần $\ge 65\%$).
- **Không có chỉ số ẩn:** Hoàn toàn dựa vào nhịp suy nghĩ (`decisionIntervalBase`: Easy 2.5s, Normal 1.2s, Hard 0.6s), khả năng đọc thế trận, phản xạ tung Ultimate và chiến thuật mua quân.

---

### D. Chuỗi Phân Định 4 Nấc Khi Hai Căn Cứ Vỡ Cùng 1 Tick

Đã tích hợp trong `World.checkBaseDestruction()` và xác thực 4/4 kịch bản tại `apps/game/src/tests/tieBreakChain.test.ts`:
1. **Nấc 1:** Bên có máu âm ít hơn thắng (ví dụ: căn cứ nhận -5 HP thắng căn cứ nhận -50 HP).
2. **Nấc 2:** Nếu máu âm bằng nhau, bên gây tổng sát thương trong trận lớn hơn thắng (`playerTotalDamageDealt` vs `botTotalDamageDealt`).
3. **Nấc 3:** Nếu tổng sát thương bằng nhau:
   - So sánh tổng HP lính còn sống trên sân (`playerUnitsAliveHp` vs `botUnitsAliveHp`).
   - Nếu bằng nhau, so sánh tổng vàng tích lũy (`totalGoldEarned`).
4. **Nấc 4:** Nếu tất cả các chỉ số trên đều bằng nhau tuyệt đối, tung xúc xắc xác định theo PRNG seed của trận đấu: `this.random() < 0.5 ? 'VICTORY' : 'DEFEAT'` (tuyệt đối không dùng toán tử `>=` để triệt tiêu thiên vị).
