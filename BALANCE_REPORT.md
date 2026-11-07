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
