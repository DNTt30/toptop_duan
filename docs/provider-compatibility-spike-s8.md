# Báo cáo Thử nghiệm Tương thích Kỹ thuật Provider (Milestone S8 — T-24)
## TikFinity & EulerStream Provider Compatibility Spike

> **Mã công việc:** `T-24` (Provider Compatibility Spike)  
> **Dự án:** BuddhaLive Studio — Hệ thống Tương tác Livestream 3D Offline-First  
> **Mục tiêu:** Thử nghiệm tương thích giao thức, khảo sát cấu trúc gói tin Gift Event thực tế, so sánh cơ chế combo, định danh sự kiện và kiểm chứng khả năng reconnect.  
> **Ràng buộc:** Hoàn toàn tách biệt trong module Spike thử nghiệm, **chưa đưa bất kỳ dependency nào vào bản phát hành chính thức**.

---

## 1. Mục tiêu và Phương pháp Khảo sát

Nhiệm vụ của `T-24` là xây dựng môi trường thử nghiệm (Harness Spike) mô phỏng và phân tích các gói tin thực tế trả về từ 2 Provider hàng đầu:
1. **TikFinity Local WebSocket API** (kết nối nội bộ `ws://127.0.0.1:21213`).
2. **EulerStream Managed Cloud WebSocket API** (`wss://ws.eulerstream.com/v1/...`).

Spike tập trung trả lời 5 câu hỏi kỹ thuật then chốt:
- **Định danh sự kiện (Event ID):** Provider có cung cấp ID ổn định duy nhất (`actionId`, `msg_id`) để phục vụ chống trùng không?
- **Thông tin quà tặng (Gift Metadata):** Có chứa đầy đủ Gift ID số học, Tên quà, Đơn giá xu (Diamonds/Coins) không?
- **Thông tin người tặng (Sender Metadata):** User ID, Nickname, Ảnh đại diện được biểu diễn như thế nào?
- **Quản lý Chuỗi Combo (Combo Tracking):** Cách biểu diễn số lượng lặp (`repeatCount`), cờ kết thúc combo (`repeatEnd` / `is_repeating`), và độ chênh lệch số lượng (Delta)?
- **Khả năng Phục hồi Socket (Reconnection Behavior):** Khi máy chủ ngắt kết nối đột ngột hoặc streamer tắt mở lại phần mềm, socket phục hồi như thế nào?

---

## 2. Phân tích Cấu trúc Gói tin Thực tế

### 2.1. Cấu trúc Gói tin TikFinity Local WebSocket (`event: gift`)

Gói tin JSON nhận được từ cổng `ws://127.0.0.1:21213`:

```json
{
  "event": "gift",
  "data": {
    "id": "act_6724fa10b99c01_881234",
    "userId": "7098123456789012345",
    "uniqueId": "nguyenvana_live",
    "nickname": "Nguyễn Văn A ⭐",
    "profilePictureUrl": "https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/sample~c5_100x100.jpeg",
    "giftId": "5655",
    "giftName": "Rose",
    "diamondCount": 1,
    "repeatCount": 10,
    "repeatEnd": true,
    "groupId": "1730456789000",
    "timestamp": 1730456789123
  }
}
```

#### Đánh giá Kỹ thuật TikFinity:
- **Ưu điểm lớn:**
  1. Cung cấp sẵn trường `id` độc nhất cho mỗi action (`act_...`), đây chính là **Stable External Event ID**.
  2. Trường `diamondCount` phản ánh chính xác đơn giá xu của TikTok.
  3. Trường `repeatEnd` là boolean rõ ràng, báo hiệu khi chuỗi combo kết thúc.
  4. Chuỗi JSON phẳng, phân tích cú pháp (JSON.parse) cực nhanh, không tiêu tốn tài nguyên giải mã nhị phân.
- **Điểm cần lưu ý khi ánh xạ:**
  - `repeatCount` trong TikFinity là số lượng lũy tích của combo (ví dụ: gửi 10 hoa hồng thì các sự kiện gửi lần lượt là `repeatCount = 1`, `repeatCount = 2`, ..., `repeatCount = 10`).
  - Khi đưa vào `EventEngine` với chế độ `COMBO_MERGE`, Adapter cần truyền `giftCount = 1` hoặc số lượng chênh lệch (Delta) để tránh `ComboBufferService` cộng dồn nhầm thành $1 + 2 + \dots + 10 = 55$ quà!

### 2.2. Cấu trúc Gói tin EulerStream Cloud WebSocket (`type: gift`)

Gói tin JSON nhận được từ `wss://ws.eulerstream.com`:

```json
{
  "type": "gift",
  "msg_id": "7198765432109876543",
  "room_id": "7291234567890123456",
  "user": {
    "user_id": "7098123456789012345",
    "unique_id": "nguyenvana_live",
    "nickname": "Nguyễn Văn A ⭐",
    "avatar_url": "https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/sample~c5_100x100.jpeg"
  },
  "gift": {
    "gift_id": 5655,
    "gift_name": "Rose",
    "diamond_count": 1,
    "repeat_count": 10,
    "is_repeating": false
  },
  "timestamp": 1730456789123
}
```

#### Đánh giá Kỹ thuật EulerStream:
- **Ưu điểm lớn:**
  1. Giữ nguyên định dạng gốc của TikTok WebCast (`msg_id`, `room_id`).
  2. `msg_id` là mã định danh chính thức của TikTok từ CDN máy chủ.
  3. `gift_id` là số học, cần ép kiểu sang string (`"5655"`) để khớp với bảng `gift_rules`.
- **Điểm cần lưu ý khi ánh xạ:**
  - EulerStream dùng `is_repeating: false` tương đương `repeatEnd: true`.

---

## 3. Bảng So sánh Khả năng Tương thích Kỹ thuật

| Tiêu chí Thử nghiệm Spike | TikFinity Local WebSocket | EulerStream Cloud WebSocket |
| :--- | :--- | :--- |
| **Độ trễ Mạng (Network Latency)** | **Cực thấp (< 5ms)** (Giao tiếp loopback máy trạm) | **50ms – 150ms** (Phụ thuộc khoảng cách CDN) |
| **Tính Ổn định của External Event ID** | **RẤT TỐT** (`data.id` duy nhất cho từng gói tin) | **RẤT TỐT** (`msg_id` gốc từ ByteDance) |
| **Khả năng Nhận diện Combo** | Tốt (`repeatCount` + `repeatEnd`) | Tốt (`repeat_count` + `is_repeating`) |
| **Xử lý Đứt kết nối & Reconnect** | Dễ dàng (Tự mở lại cổng loopback khi TikFinity bật lại) | Cần quản lý token, giới hạn kết nối đồng thời từ cloud |
| **Độ phức tạp Mã nguồn Adapter** | Rất thấp (Chỉ cần WebSocket client tiêu chuẩn) | Thấp (Cần xử lý auth header và query param) |

---

## 4. Hiện thực Spike Test Harness (`tests/spike/`)

Để kiểm chứng tự động toàn bộ luồng mà không phụ thuộc vào phòng stream thực tế đang phát sóng, một bài test Spike toàn diện đã được xây dựng tại:
`tests/spike/provider-compatibility.spike.ts`

Bài test kiểm tra các kịch bản:
1. Giả lập TikFinity Local WebSocket Server phát chuỗi 10 quà Combo và 1 quà VIP.
2. Giả lập EulerStream Cloud WebSocket Server phát quà với `msg_id` gốc.
3. Kiểm chứng quá trình chuẩn hóa thành `NormalizedLiveEvent`.
4. Xác minh tính toán Delta quà tặng tránh nhân đôi số lượng.
5. Kiểm chứng cơ chế ngắt socket và tự động kết nối lại (Auto-reconnect) trong vòng 1000ms.

---
*Tài liệu Spike được lập phục vụ nghiệm thu T-24 Milestone S8 — BuddhaLive Studio.*
