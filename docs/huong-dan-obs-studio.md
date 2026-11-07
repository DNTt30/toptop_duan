# Cẩm nang Cấu hình OBS Studio — BuddhaLive Studio

> **Dành cho:** Streamer, Kỹ thuật viên phát sóng và Đạo diễn luồng OBS Studio.  
> **Phiên bản tài liệu:** v1.5.0 (Cột mốc S6: MVP Release Candidate).

---

## 1. Yêu cầu & Chuẩn bị Môi trường

Để đạt hiệu năng hiển thị 3D Three.js mượt mà nhất trên khung phát sóng:
- **OBS Studio:** Phiên bản 29.0 trở lên.
- **Tăng tốc phần cứng (Hardware Acceleration):**
  - Mở OBS Studio → vào `Settings` → chọn thẻ `Advanced`.
  - Tại mục `Sources`, đánh dấu chọn: **☑ Enable Browser Source Hardware Acceleration**.
  - Khởi động lại OBS Studio nếu được yêu cầu.

---

## 2. Các Bước Thêm Live Overlay vào OBS Studio

### Bước 1: Tạo Nguồn Browser Source Mới
1. Tại bảng điều khiển **Scenes** (Cảnh), chọn Cảnh phát livestream của bạn.
2. Tại bảng điều khiển **Sources** (Nguồn), nhấn dấu `+` và chọn **Browser** (Trình duyệt).
3. Đặt tên nguồn: `BuddhaLive 3D Overlay` rồi nhấn **OK**.

### Bước 2: Cấu hình Thuộc tính Trình duyệt (Properties)
Điền chính xác các thông số sau:

| Thuộc tính | Giá trị cấu hình | Giải thích |
| :--- | :--- | :--- |
| **URL** | `http://127.0.0.1:3721/overlay` | Địa chỉ máy chủ nhúng nội bộ (URL sạch, không chứa token trên query) |
| **Width (Chiều rộng)** | `1080` (Khung dọc) hoặc `1920` (Khung ngang) | Khuyến nghị 1080 cho livestream TikTok, 1920 cho YouTube/Facebook |
| **Height (Chiều cao)** | `1920` (Khung dọc) hoặc `1080` (Khung ngang) | Khung hình dọc 9:16 hoặc ngang 16:9 chuẩn HD/FHD |
| **FPS** | `60` (hoặc `30`) | Khớp với thiết lập FPS tại Desktop Manager |
| **Custom CSS** | Xem mẫu CSS trong suốt bên dưới | Bắt buộc để nền hoàn toàn trong suốt không che camera |

### Bước 3: Mẫu Custom CSS Nền Trong suốt (Transparent Background)
Xóa toàn bộ CSS mặc định trong ô **Custom CSS** và dán đoạn mã sau:

```css
body {
  background-color: rgba(0, 0, 0, 0) !important;
  margin: 0px auto;
  overflow: hidden;
}
```

### Bước 4: Tùy chọn Tải lại & Bộ nhớ đệm
- **Shutdown source when not visible:** Bỏ chọn ☐ (giúp duy trì kết nối Socket.IO ổn định khi chuyển cảnh).
- **Refresh browser when scene becomes active:** Chọn ☑ (tùy chọn làm mới khi kích hoạt cảnh).

Nhấn **OK** để lưu lại.

---

## 3. Quy trình Ghép nối Bảo mật Lần đầu (1-time Pairing)

Theo tài liệu kiến trúc bảo mật 6 lớp (`architecture.md`), BuddhaLive Studio áp dụng cơ chế xác thực ghép nối một lần:

1. **Hiển thị Mã Ghép nối:**
   - Ngay khi Browser Source được tạo trên OBS, trên màn hình phát sóng sẽ hiển thị một thông báo màu xanh nhã nhặn kèm **Mã số xác nhận 6 chữ số** (ví dụ: `482915`).
2. **Phê duyệt từ Desktop Manager:**
   - Mở cửa sổ Desktop Manager của BuddhaLive Studio.
   - Tại Tab **Tổng quan (Dashboard)**, bạn sẽ thấy thông báo: *"Có một thiết bị OBS Browser Source đang yêu cầu ghép nối với mã: 482915"*.
   - Nhấn nút **Phê duyệt ghép nối**.
3. **Cấp Phiên Tự động (HttpOnly Cookie):**
   - Backend sẽ cấp một token phiên an toàn đặt trong cookie HttpOnly (`bls_overlay_session`) được bảo vệ bằng cơ chế mã hóa Windows DPAPI.
   - Màn hình OBS sẽ lập tức chuyển sang chế độ **Standby trong suốt** (hoàn toàn vô hình, sẵn sàng đón nhận quà).
4. **Duy trì Phiên Vĩnh viễn:**
   - Trình duyệt OBS ghi nhớ cookie này. Khi bạn tắt mở lại OBS Studio hoặc khởi động lại máy tính, Overlay sẽ **tự động kết nối lại** mà không bao giờ đòi hỏi ghép nối lại.

---

## 4. Hành vi Hoạt động trong Phiên Livestream

### 1. Hiển thị Khi Nhận Quà (Event Triggered)
- Nhân vật 3D hoạt động (Active Character) xuất hiện mượt mà ở vị trí đã định sẵn.
- Thực hiện hoạt ảnh tạ ơn / tụng kinh / niệm Phật tương ứng với quy tắc quà tặng.
- Dưới chân nhân vật xuất hiện Banner trang trọng hiển thị tên người cúng dường:  
  *Ví dụ: "Phật Tử Diệu Âm vừa cúng dường 10 Hoa Sen"*.
- Âm thanh chuông mỏ hoặc nhạc nền phát đồng bộ.

### 2. Tự động Thu hồi Biến mất (Auto-dismiss)
- Khi thời lượng hoạt ảnh kết thúc, nhân vật và banner tự động mờ dần biến mất.
- Toàn bộ mesh 3D được giải phóng khỏi bộ nhớ GPU của OBS, đưa khung hình trở về trạng thái trong suốt 100%.

### 3. Cơ chế Độc quyền Mutex & Chống Đè hình
- Tại một thời điểm, hệ thống đảm bảo **chỉ có duy nhất 1 lượt hiển thị** trên màn hình OBS.
- Nếu nhiều người gửi quà cùng lúc, các lượt sẽ được xếp ngay ngắn trong hàng đợi và lần lượt biểu diễn theo thứ tự ưu tiên, tuyệt đối không bị hiện đè hai nhân vật lên nhau.

### 4. Cơ chế Dự phòng 2D (Fallback 2D Alert)
- Trong trường hợp bất khả kháng khi tệp 3D GLB bị lỗi nạp hoặc driver card đồ họa bị trục trặc WebGL, hệ thống tự động kích hoạt **Fallback 2D Alert**:
- Banner thông tin người tặng vẫn xuất hiện trang trọng trên nền trong suốt, hoạt ảnh chuyển động 2D êm dịu trong 3 giây rồi biến mất.
- Sự kiện được ghi nhận là `COMPLETED_WITH_FALLBACK`, bảo đảm phiên livestream không bao giờ bị đơ hay gián đoạn.

---

## 5. Xử lý Sự cố Thường gặp (Troubleshooting)

### Vấn đề 1: Khung OBS hiện màn hình đen thay vì trong suốt
- **Nguyên nhân:** Chưa cấu hình đúng thuộc tính CSS trong suốt.
- **Cách khắc phục:** Nhấp đúp vào nguồn Browser Source trong OBS, kiểm tra ô **Custom CSS** đảm bảo có dòng `background-color: rgba(0, 0, 0, 0) !important;`.

### Vấn đề 2: Bấm F5 hoặc "Refresh cache of current page" trên OBS thì sao?
- **Hành vi an toàn:** Khi bạn nhấn F5 hoặc tải lại Browser Source trong lúc nhân vật đang diễn, Backend BuddhaLive Studio sẽ tự động phát hiện socket ngắt kết nối và thu hồi lượt đang diễn với mã `OVERLAY_RELOADED`.
- Trình duyệt OBS tải lại xong sẽ tự động kết nối lại bằng cookie phiên cũ và tiếp tục nhận các lượt quà tiếp theo bình thường.

### Vấn đề 3: Chuyển động 3D bị giật lag
- **Cách khắc phục:**
  1. Kiểm tra đã bật **Browser Source Hardware Acceleration** trong `Settings -> Advanced` của OBS chưa.
  2. Tại Desktop Manager (Tab Cài đặt), chuyển giới hạn FPS sang mức **30 FPS** để giảm tải 50% áp lực GPU.

### Vấn đề 4: Muốn đặt lại ghép nối (xóa quyền các OBS cũ)
- Mở Desktop Manager → vào Tab **Cài đặt & Bảo mật** → nhấn nút **Thu hồi toàn bộ token OBS**.
- Quay lại OBS, nhấn chuột phải vào Browser Source chọn **Refresh cache of current page** để nhận mã ghép nối mới.
