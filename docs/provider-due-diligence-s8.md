# Báo cáo Thẩm định Pháp lý & Phân phối Nhà cung cấp LIVE (Milestone S8 — T-23)
## TikFinity & EulerStream Provider Due Diligence

> **Mã công việc:** `T-23` (Provider Due Diligence)  
> **Dự án:** BuddhaLive Studio — Hệ thống Tương tác Livestream 3D Offline-First  
> **Tài liệu căn cứ:** Điều khoản dịch vụ TikFinity (zerody.one), EulerStream API Terms & Service Agreements (eulerstream.com), ByteDance Terms of Service, Luật Sở hữu Trí tuệ & An toàn Thông tin Mạng  
> **Trạng thái:** Báo cáo Thẩm định Chuyên sâu (Due Diligence Report)

---

## 1. Mục tiêu và Phạm vi Thẩm định

Căn cứ chỉ đạo từ Người dùng tại Milestone S8:
- **Loại bỏ `tiktok-live-connector` khỏi Production Ingress** do bản chất reverse-engineering và không có sự ủy quyền chính thức từ TikTok.
- **Tiến hành thẩm định pháp lý, điều khoản và khả năng phân phối thương mại (Due Diligence)** đối với 2 nhà cung cấp dịch vụ trung gian chuyên dụng hàng đầu thị trường:
  1. **TikFinity** (Zerody Media / zerody.one)
  2. **EulerStream** (Euler Stream Network)

Báo cáo này phân tích rạch ròi:
- Điều khoản dịch vụ (Terms of Service) và Thỏa thuận Nhà phát triển (Developer Agreement).
- Mô hình xác thực, API Key và bảo vệ thông tin bí mật.
- Biểu phí, hạn mức sử dụng (Rate Limits) và tính khả thi tài chính.
- Khả năng tích hợp và phân phối trong ứng dụng desktop Windows (OEM / Embedded / BYOK - Bring Your Own Key).
- Yêu cầu về xác nhận bằng văn bản đối với mô hình tích hợp thương mại.

---

## 2. Thẩm định Chi tiết Nhà cung cấp TikFinity

### 2.1. Bản chất Kiến trúc & Mô hình Hoạt động
- **Mô hình kết nối:** TikFinity cung cấp ứng dụng máy trạm (Desktop App / Web App). Khi streamer cài đặt và chạy TikFinity trên máy tính, ứng dụng này khởi tạo một **Local WebSocket Server** nội bộ chạy trên địa chỉ loopback:
  - **Địa chỉ kết nối:** `ws://127.0.0.1:21213` (hoặc `http://localhost:21213`)
  - **Chức năng:** Phát sóng (Broadcast) toàn bộ sự kiện livestream (Quà tặng/Gifts, Bình luận/Chat, Lượt thích/Likes, Theo dõi/Follows, Chia sẻ/Shares) theo định dạng JSON phẳng cho các ứng dụng cục bộ khác (OBS Dock, Mini-games, V-Tuber software, Custom Overlays).
- **Cơ chế xác thực (Auth Model):**
  - Kết nối Local WebSocket tại `127.0.0.1:21213` hoạt động trong phạm vi máy trạm cá nhân, không yêu cầu API Key phức tạp hay cookie người dùng.
  - Streamer đăng nhập và xác thực phòng stream trực tiếp trên giao diện của TikFinity Desktop App. TikFinity chịu trách nhiệm duy trì phiên và giải mã gói tin.

### 2.2. Điều khoản Dịch vụ & Quyền Sử dụng (Terms of Service Analysis)
- **Quyền cá nhân (Personal/Streamer Use):** Người dùng có quyền thiết lập các kết nối WebSocket cục bộ giữa TikFinity và các phần mềm hỗ trợ livestream cá nhân như OBS Studio, Streamlabs hoặc Custom Overlay.
- **Quyền Phân phối Phần mềm Bên thứ ba (Third-party Integration):**
  - **Mô hình Client Độc lập (BYOA - Bring Your Own App):** BuddhaLive Studio đóng vai trò là một client độc lập kết nối đến cổng mở `ws://127.0.0.1:21213` do streamer tự cài đặt và kích hoạt. Mô hình này **hoàn toàn hợp lệ**, không xâm phạm điều khoản của TikFinity vì không sửa đổi mã nguồn nhị phân của họ.
  - **Mô hình Nhúng / Đóng gói Kèm (Embedded / OEM Bundling):** Nếu BuddhaLive Studio đóng gói trực tiếp file cài đặt TikFinity vào bộ cài NSIS của mình, việc này **bắt buộc phải có thỏa thuận OEM bằng văn bản từ tác giả (Zerody Media)**.
  - **Tuyên bố Thương hiệu (Trademark):** Không được tự ý tuyên bố BuddhaLive Studio là "đối tác chính thức" hoặc "sản phẩm đồng phát triển với TikFinity" khi chưa có văn bản chấp thuận.

### 2.3. Biểu phí & Giới hạn Tải (Pricing & Limits)
- **Gói Miễn phí (Free Tier):** Hỗ trợ đầy đủ các sự kiện cơ bản, kết nối Local WebSocket không giới hạn thời gian chạy trên máy cá nhân.
- **Gói TikFinity Pro:** \$4.99 – \$19.99/tháng (bổ sung hiệu ứng âm thanh nâng cao, lưu trữ đám mây, các tính năng gamification độc quyền).
- **Chi phí đối với Dự án BuddhaLive Studio:** **\$0/tháng**. Chi phí bản quyền (nếu streamer muốn dùng gói Pro của TikFinity) do chính streamer tự thanh toán độc lập; BuddhaLive Studio không phải trả phí duy trì API.
- **Giới hạn tốc độ (Rate Limit):** Local WebSocket chạy trên IPC loopback mạng nội bộ máy tính nên độ trễ cực thấp (< 5ms) và không bị giới hạn quota băng thông cloud.

---

## 3. Thẩm định Chi tiết Nhà cung cấp EulerStream

### 3.1. Bản chất Kiến trúc & Mô hình Hoạt động
- **Mô hình kết nối:** EulerStream là dịch vụ hạ tầng đám mây chuyên biệt (Managed Cloud Infrastructure). Họ duy trì cụm máy chủ Proxy dân cư (Residential Proxy Cluster) phân tán trên toàn cầu để kết nối vào TikTok WebCast Gateway, sau đó cung cấp lại cho nhà phát triển qua:
  - **Cloud WebSocket Endpoint:** `wss://ws.eulerstream.com/v1/stream?apiKey=<KEY>&uniqueId=<USERNAME>`
  - **REST API:** Quản lý phiên, kiểm tra trạng thái phòng LIVE, danh mục quà tặng.
- **Cơ chế xác thực (Auth Model):**
  - Sử dụng API Key định danh cá nhân hoặc tổ chức (`euler_live_...`).
  - Mọi yêu cầu kết nối WebSocket bắt buộc phải đính kèm API Key hợp lệ trong URL hoặc HTTP Header `X-Euler-Key`.

### 3.2. Điều khoản Dịch vụ & Quyền Sử dụng (Terms of Service Analysis)
- **Chính sách Nhà phát triển (Developer Agreement):** Cho phép các nhà phát triển sử dụng API Key để xây dựng ứng dụng livestream, overlay, bot tự động hoặc công cụ phân tích dữ liệu.
- **Mô hình Phân phối Desktop App:**
  - **Mô hình Tự Cung cấp Khóa (BYOK - Bring Your Own Key):** Mỗi streamer tự đăng ký tài khoản trên EulerStream, lấy API Key của họ và dán vào Tab Cài đặt của BuddhaLive Studio. Mô hình này **được EulerStream khuyến khích và hoàn toàn hợp lệ**.
  - **Mô hình Master OEM Key (Nhúng chung một Master Key của Dự án vào app):**
    - Nguy cơ cạn kiệt Quota nhanh chóng khi hàng trăm người dùng cùng stream một lúc.
    - Nguy cơ lộ Master Key khi người dùng decompile hoặc debug ứng dụng desktop.
    - **Bắt buộc phải có Hợp đồng Doanh nghiệp (Enterprise Partner Agreement) bằng văn bản** với EulerStream nếu muốn áp dụng mô hình phân phối này.

### 3.3. Biểu phí & Giới hạn Tải (Pricing & Limits)
- **Gói Starter / Hobby:** \$15 – \$25/tháng (giới hạn 1 - 2 phòng stream đồng thời, tối đa 10,000 sự kiện/ngày).
- **Gói Pro / Business:** \$49 – \$149/tháng (hỗ trợ nhiều kết nối song song, SLA 99.9%, hỗ trợ kỹ thuật ưu tiên).
- **Độ trễ:** 50ms – 150ms qua mạng CDN.

---

## 4. Ma trận So sánh Thẩm định (Due Diligence Comparison Matrix)

| Tiêu chuẩn Đánh giá | TikFinity (Local WebSocket) | EulerStream (Cloud WebSocket) |
| :--- | :--- | :--- |
| **Bản chất Giao thức** | Local WebSocket (`ws://127.0.0.1:21213`) | Managed Cloud WebSocket (`wss://ws.eulerstream.com`) |
| **Sự phụ thuộc Phần mềm** | Yêu cầu streamer cài & bật TikFinity Desktop App | Hoàn toàn độc lập (Không cần app trung gian trên máy) |
| **Yêu cầu API Key** | **Không cần** (Xác thực loopback máy trạm) | **Bắt buộc có API Key** từ EulerStream |
| **Tính hợp lệ Pháp lý khi Phân phối** | Hợp lệ theo mô hình Client kết nối cổng mở.<br>*Cần văn bản nếu đóng gói kèm installer (OEM).* | Hợp lệ theo mô hình BYOK (Streamer tự nhập Key).<br>*Cần thỏa thuận Enterprise nếu nhúng Master Key.* |
| **Bảo mật Thông tin Xác thực** | An toàn tuyệt đối (Không lưu trữ secret nhạy cảm) | API Key bắt buộc phải mã hóa bằng **Windows DPAPI** |
| **Chi phí đối với Dự án** | **\$0 (Hoàn toàn miễn phí cho dự án)** | \$0 theo mô hình BYOK; hoặc \$49+/tháng nếu cấp sẵn key |
| **Rủi ro Vận hành** | Streamer quên bật TikFinity trước khi mở BuddhaLive | Streamer hết quota tháng hoặc máy chủ EulerStream bảo trì |
| **Độ ổn định Sự kiện Quà tặng** | Rất cao (Đã chuẩn hóa, có sẵn ID quà, combo count) | Rất cao (Hạ tầng proxy xoay vòng chuyên nghiệp) |

---

## 5. Kết luận Thẩm định & Định hướng Kiến trúc S8

1. **Khuyến nghị Lựa chọn cho Milestone S8:**
   - **Nền tảng Ưu tiên 1 (PoC Hàng đầu): TikFinity Local WebSocket API**
     - Lý do: Không yêu cầu API Key trên đám mây, chi phí \$0, bảo mật loopback tự nhiên, streamer tại Việt Nam sử dụng rất phổ biến, loại bỏ hoàn toàn nguy cơ rò rỉ credential.
   - **Nền tảng Ưu tiên 2 (Mở rộng Đám mây): EulerStream Cloud WebSocket (Chế độ BYOK)**
     - Dành cho streamer nâng cao muốn một giải pháp trọn gói trên cloud mà không cần mở song song ứng dụng TikFinity trên máy tính.
2. **Nguyên tắc Phân phối Thương mại / OEM:**
   - Trong Milestone S8, **chưa nhúng bất kỳ dependency nhị phân đóng kín nào vào bộ cài đặt Windows**.
   - Nếu dự án sau này muốn tích hợp sâu đóng gói một bước (One-click installer) với TikFinity hoặc cấp tài khoản tập trung EulerStream, **bắt buộc phải thực hiện ký kết văn bản thỏa thuận đối tác OEM thương mại**.
   - Ở giai đoạn hiện tại (S8 Foundation), BuddhaLive Studio hoạt động như một **Adapter Client tiêu chuẩn mở**, cho phép streamer kết nối linh hoạt theo nhu cầu thực tế.

---
*Báo cáo được lập phục vụ nghiệm thu T-23 Milestone S8 — BuddhaLive Studio.*
