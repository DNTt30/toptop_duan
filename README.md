# BuddhaLive Studio — Interactive Livestream Application (Windows 11)

> **Phiên bản:** v1.5.0 (MVP Release Candidate — Cột mốc S6)  
> **Nền tảng mục tiêu:** Windows 11 x64  
> **Kiến trúc cốt lõi:** Offline-First, Local Embedded Server (Node.js, better-sqlite3 WAL mode, Socket.IO, Three.js, Electron).

---

## 1. Giới thiệu Tổng quan

**BuddhaLive Studio** là ứng dụng livestream tương tác cao cấp dành cho Windows 11, phục vụ các phiên phát trực tiếp với các mô hình 3D (tượng Phật, bồ tát, hoa sen), tự động kích hoạt hoạt ảnh và hiệu ứng âm thanh tương ứng khi nhận được quà tặng.

### Các thành phần chính:
1. **Desktop Manager (Electron + React 18 + TypeScript):** Giao diện quản lý trực quan 5 tab dành cho streamer/kỹ thuật viên điều khiển luồng, cấu hình nhân vật 3D, kiểm tra hoạt ảnh, thiết lập quy tắc quà tặng và theo dõi hàng đợi thời gian thực.
2. **Live Overlay (Three.js + Vite + HTML5 Canvas):** Giao diện hiển thị trong suốt (`rgba(0,0,0,0)`) nhúng trực tiếp vào OBS Studio qua Browser Source (`http://127.0.0.1:3721/overlay`). Tự động tải GLB, chạy hoạt ảnh, hiển thị banner tên người tặng và thu hồi biến mất.
3. **Core Backend & Event Engine:** Máy chủ nhúng chạy trên `127.0.0.1:3721`, quản lý cơ sở dữ liệu SQLite ở chế độ WAL, điều phối hàng đợi (trần 30 execution, trần 5/rule), chống đói (anti-starvation), gộp combo cố định 1500ms, hủy an toàn và phục hồi sau sự cố (Crash Recovery).
4. **Bảo mật 6 lớp (Defense-in-depth):** Ràng buộc loopback 127.0.0.1, phân quyền Manager/Overlay Token ngẫu nhiên trong RAM, ghép nối 1 lần qua mã 6 số lưu cookie HttpOnly được bảo vệ bởi Windows DPAPI, chống Path Traversal, Content Security Policy và Rate Limiting trên mọi socket packet.

---

## 2. Yêu cầu Hệ thống

- **Hệ điều hành:** Windows 11 x64 (Build 22000 trở lên) hoặc Windows 10 x64 (21H2 trở lên).
- **Phần cứng đề xuất:**
  - **CPU:** Intel Core i5 / AMD Ryzen 5 (4 nhân trở lên).
  - **RAM:** Tối thiểu 8 GB (Khuyến nghị 16 GB khi chạy đồng thời cùng OBS Studio và streaming).
  - **GPU:** Card đồ họa hỗ trợ OpenGL / DirectX 11 / WebGL 2.0 (NVIDIA GTX 1050 / AMD RX 560 hoặc Intel Iris Xe trở lên).
  - **Ổ cứng trống:** Tối thiểu 1 GB SSD để lưu trữ ứng dụng, cơ sở dữ liệu SQLite và các mô hình 3D GLB.
- **Phần mềm phát trực tiếp:** OBS Studio v29 trở lên (đã kích hoạt Hardware Acceleration trong Browser Source).

---

## 3. Cài đặt & Vận hành

### Cách 1: Cài đặt từ Bản đóng gói Windows (.exe Installer)
1. Tải bộ cài `BuddhaLive Studio Setup.exe` từ thư mục phát hành.
2. Chạy file cài đặt, chọn thư mục cài đặt tùy thích (cho phép tùy chỉnh đường dẫn).
3. Trình cài đặt tự động tạo lối tắt trên **Desktop** và **Start Menu**.
4. Khởi động ứng dụng từ biểu tượng Desktop. Mọi dữ liệu người dùng được lưu trữ an toàn và bảo toàn tại `%APPDATA%\BuddhaLiveStudio`. Khi gỡ cài đặt hoặc nâng cấp, cơ sở dữ liệu và tài nguyên 3D **không bao giờ bị xóa tự động**.

### Cách 2: Chạy từ Mã nguồn (Dành cho Lập trình viên)
Yêu cầu: Node.js v22.x và pnpm (`corepack enable`).

```powershell
# 1. Cài đặt toàn bộ dependencies
corepack pnpm install

# 2. Biên dịch toàn bộ các package và bundle
corepack pnpm build

# 3. Chạy Desktop Manager ở chế độ phát triển
corepack pnpm --filter @buddhalive/desktop start
```

---

## 4. Các Lệnh Kiểm thử & Xác minh Tự động

Dự án tuân thủ tiêu chuẩn kỹ thuật nghiêm ngặt với 16 bộ test tích hợp và 4 kịch bản E2E kiểm chứng toàn bộ luồng hoạt động:

```powershell
# Chạy toàn bộ 82 unit & integration tests (Vitest)
corepack pnpm test

# Chạy toàn bộ E2E tests trên trình duyệt Chromium thực tế (Playwright)
corepack pnpm test:e2e

# Kiểm tra toàn vẹn kiểu dữ liệu trên toàn monorepo (0 errors)
corepack pnpm typecheck

# Đóng gói bản chạy trực tiếp Windows unpacked
corepack pnpm pack:win-dir

# Đóng gói bộ cài đặt Windows NSIS Installer (.exe)
corepack pnpm pack:win-installer

# Chạy quy trình nghiệm thu tổng hợp toàn diện Cột mốc S6
corepack pnpm verify:s6
```

---

## 5. Cấu trúc Dự án (Monorepo)

```
d:\toptop_duan\
├── apps/
│   ├── backend/          # Node.js + better-sqlite3 WAL + Socket.IO server
│   ├── desktop/          # Electron shell + Desktop Manager UI (React 18)
│   └── overlay/          # Live Overlay (Three.js WebGL + Canvas Banner)
├── packages/
│   └── shared/           # Realtime contracts, Zod schemas, domain models
├── tests/
│   ├── integration/      # S1-S6 Vitest integration test suites (82 tests)
│   ├── e2e/              # S2, S4, S5 Playwright E2E suites (4 tests)
│   └── fixtures/         # Sample 3D GLB models & mock data
└── docs/                 # Bộ tài liệu kiến trúc, mô hình dữ liệu và cẩm nang
```

---

## 6. Tài liệu Hướng dẫn Chi tiết

- [Cẩm nang Vận hành Desktop Manager](file:///d:/toptop_duan/docs/huong-dan-desktop-manager.md)
- [Cẩm nang Cấu hình OBS Studio Browser Source](file:///d:/toptop_duan/docs/huong-dan-obs-studio.md)
- [Báo cáo Kiểm thử Tự động & Giới hạn Sản phẩm](file:///d:/toptop_duan/docs/bao-cao-kiem-thu-va-gioi-han.md)
- [Kiến trúc Hệ thống (Architecture Specification)](file:///d:/toptop_duan/docs/architecture.md)
- [Mô hình Dữ liệu SQLite (Data Model Specification)](file:///d:/toptop_duan/docs/data-model.md)
- [Luồng Điều phối Sự kiện (Event Flow & Concurrency)](file:///d:/toptop_duan/docs/event-flow.md)
