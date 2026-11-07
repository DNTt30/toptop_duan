# Kế hoạch Kiến trúc & Rà soát Kỹ thuật Cột mốc S9
## Live Provider UI Integration & Real Connection Testing (`T-29` → `T-34`)

> **Mã tài liệu:** `PLAN-S9-ARCH-01`  
> **Dự án:** BuddhaLive Studio — Hệ thống Tương tác Livestream 3D Offline-First  
> **Giai đoạn:** Rà soát Kiến trúc & Lập Kế hoạch Chi tiết (Chưa viết code, chờ phê duyệt)  
> **Căn cứ tài liệu:** [`docs/implementation-plan.md`](file:///d:/toptop_duan/docs/implementation-plan.md), [`docs/architecture.md`](file:///d:/toptop_duan/docs/architecture.md), [`docs/event-flow.md`](file:///d:/toptop_duan/docs/event-flow.md), [`docs/thiet-ke-kien-truc-tiktok-adapter.md`](file:///d:/toptop_duan/docs/thiet-ke-kien-truc-tiktok-adapter.md), [`docs/bao-cao-nghiem-thu-s8.md`](file:///d:/toptop_duan/docs/bao-cao-nghiem-thu-s8.md)  

---

## 1. Ba Định hướng Chiến lược Bắt buộc cho S9

1. **Không coi TikFinity là lựa chọn duy nhất:**
   - **TikFinity:** Được chọn làm Provider ưu tiên cho giai đoạn thử nghiệm S9 qua cổng Local WebSocket `ws://127.0.0.1:21213/` (kết nối với ứng dụng TikFinity do người dùng tự cài đặt trên máy; **tuyệt đối không đóng gói kèm installer khi chưa có thỏa thuận OEM bằng văn bản**).
   - **EulerStream:** Giữ làm Provider thứ hai theo mô hình Tự Cung cấp Khóa (BYOK), sẵn sàng kích hoạt khi đã kiểm chứng xong luồng xác thực và chi phí thực tế.
   - **Demo Simulator:** Tiếp tục duy trì độc lập 100% phục vụ chạy thử ngoại tuyến khi không livestream.
2. **Phân biệt rạch ròi ba trạng thái thành công:**
   - **`CONFIGURED`**: Người dùng đã nhập và lưu cấu hình hợp lệ (URL, @username, API Key nếu có).
   - **`CONNECTED`**: WebSocket thực sự kết nối được và Provider xác nhận bắt tay thành công.
   - **`RECEIVING_EVENTS`**: Đã nhận được sự kiện thực tế đầu tiên và chuẩn hóa thành công trong phiên làm việc.
   - *Nguyên tắc trung thực:* Không được báo `CONNECTED` chỉ vì cổng WebSocket mở; không được báo đã tích hợp LIVE thành công chỉ vì test bằng dữ liệu giả.
3. **Cảnh giác Giấy phép Bản quyền Phần mềm:**
   - Phiên bản mới nhất của `tiktok-live-connector` (v2.5.0) trên npm sử dụng giấy phép **AGPL-3.0-only** (rủi ro lây lan copyleft mạnh). Giữ vững quyết định **loại bỏ hoàn toàn thư viện này khỏi production**, chỉ sử dụng `VerifiedProviderAdapter` sạch kết nối cổng ngoài.

---

## 2. Rà soát Hiện trạng Mã nguồn & Điểm Cắm nối Kỹ thuật S8

Kiểm toán viên và đội ngũ kiến trúc đã rà soát toàn bộ các thành phần kỹ thuật liên quan sẵn có từ S8:

| Thành phần | Vị trí Tệp | Trạng thái Hiện tại | Cách Sử dụng trong S9 (Không Viết lại) |
| :--- | :--- | :---: | :--- |
| **Adapter Interface** | [`apps/backend/src/adapters/live-platform-adapter.ts`](file:///d:/toptop_duan/apps/backend/src/adapters/live-platform-adapter.ts) | Đã hoàn thiện | Giữ nguyên hợp đồng `LivePlatformAdapter` (`name`, `platform`, `getStatus`, `start`, `stop`, `onEvent`). |
| **Verified Provider Adapter** | [`apps/backend/src/adapters/verified-provider-adapter.ts`](file:///d:/toptop_duan/apps/backend/src/adapters/verified-provider-adapter.ts) | Đã hoàn thiện ở S8 | Hỗ trợ sẵn TikFinity & EulerStream, Zod validation, Exponential Backoff (1s - 30s), Flapping Guard 3s. Trong S9 chỉ cần bổ sung đếm sự kiện để chuyển trạng thái sang `RECEIVING_EVENTS`. |
| **DPAPI Key Vault** | [`apps/backend/src/security/provider-key-vault.ts`](file:///d:/toptop_duan/apps/backend/src/security/provider-key-vault.ts) | Đã hoàn thiện ở S8 | Dùng trực tiếp để mã hóa API Key của EulerStream bằng Windows DPAPI (`CryptProtectData`), xóa RAM an toàn khi ngắt kết nối. |
| **Data Contract** | [`packages/shared/src/domain/live-adapter-contract.ts`](file:///d:/toptop_duan/packages/shared/src/domain/live-adapter-contract.ts) | Đã hoàn thiện ở S8 | Chứa sẵn `NormalizedLiveEventSchema`, `idStrategy` (`EXTERNAL_STABLE` vs `SYNTHETIC_DETERMINISTIC`). Bổ sung thêm schema cấu hình `LiveProviderConfigSchema` cho T-29. |
| **Demo Simulator** | [`apps/backend/src/engine/demo-simulator.ts`](file:///d:/toptop_duan/apps/backend/src/engine/demo-simulator.ts) | Đã hoàn thiện ở S5 | Giữ nguyên vẹn cho chế độ Demo ngoại tuyến. |
| **EventEngine Core** | [`apps/backend/src/engine/event-engine.ts`](file:///d:/toptop_duan/apps/backend/src/engine/event-engine.ts) | **ĐÃ ĐÓNG BĂNG S1–S6** | Giữ nguyên vẹn 100%. Tiếp nhận sự kiện duy nhất qua hàm `handleIncomingLiveEvent(event)`. |

### Điểm Cắm nối Duy nhất (Single Ingress Hook):
Hiện tại trong [`apps/backend/src/server/buddha-server.ts`](file:///d:/toptop_duan/apps/backend/src/server/buddha-server.ts):
```typescript
// S5 baseline
this.tiktokAdapter = new TikTokDisconnectedAdapter(this.logger.child('TikTokAdapter'));
this.tiktokAdapter.onEvent((event) => {
  this.engine.handleIncomingLiveEvent(event);
  this.broadcastManagerState();
});
```

**Kế hoạch Cải tiến cho S9:**
Xây dựng lớp điều phối [`LiveConnectionManager`](file:///d:/toptop_duan/apps/backend/src/server/live-connection-manager.ts) đặt bên trong `BuddhaServer` để quản lý việc chuyển đổi giữa `TikTokDisconnectedAdapter` và `VerifiedProviderAdapter`:
1. Khi streamer nhấn **"Kết nối"** với TikFinity:
   - Khởi tạo instance `VerifiedProviderAdapter({ providerType: 'TIKFINITY', endpointUrl })`.
   - Đăng ký `adapter.onEvent((incomingEvent) => { ... })`:
     - Chuyển trạng thái sang `RECEIVING_EVENTS`.
     - Tăng biến đếm `eventsReceived`.
     - Chuyển tiếp vào `this.engine.handleIncomingLiveEvent(incomingEvent)`.
     - Phát cập nhật qua Socket.IO tới Desktop Manager.
2. Khi streamer nhấn **"Ngắt kết nối"**:
   - Gọi `adapter.stop()`.
   - Xóa bộ nhớ RAM `vault.clearMemory()`.
   - Đưa trạng thái về `CONFIGURED` hoặc `DISCONNECTED`.
3. Khi rớt mạng / lỗi socket:
   - Adapter chuyển sang `RECONNECTING` rồi `ERROR` trung thực.
   - **CẤM TỰ ĐỘNG CHUYỂN SANG DEMO.** Giữ nguyên trạng thái lỗi để streamer xử lý.
4. Khi đang kết nối LIVE (`CONNECTED` hoặc `RECEIVING_EVENTS`):
   - Chặn đứng mọi lệnh `demo:trigger_gift` hoặc `demo:run_scenario` để **không bao giờ phát event demo giả trong phiên live thật**.

---

## 3. Đặc tả Hợp đồng Cấu hình Provider (`T-29`)

Tạo mới tệp contract: `packages/shared/src/domain/live-provider-config.ts`

```typescript
import { z } from 'zod';
import { LiveProviderSchema } from './live-adapter-contract';

export const LiveConnectionStateSchema = z.enum([
  'DISCONNECTED',       // Chưa kết nối hoặc đã chủ động ngắt kết nối
  'CONFIGURED',         // Đã lưu cấu hình hợp lệ nhưng chưa bấm kết nối
  'CONNECTING',         // Đang mở bắt tay WebSocket
  'CONNECTED',          // Socket đã mở thành công và provider xác nhận
  'RECEIVING_EVENTS',   // Đã nhận và chuẩn hóa thành công ít nhất 1 sự kiện thực tế
  'RECONNECTING',       // Đang tự động kết nối lại theo exponential backoff
  'ERROR',              // Lỗi kết nối (vượt retry limit, sai key, không tìm thấy host)
]);
export type LiveConnectionState = z.infer<typeof LiveConnectionStateSchema>;

export const LiveProviderConfigSchema = z
  .object({
    provider: LiveProviderSchema,
    streamerUsername: z.string().max(128).default(''),
    endpointUrl: z.string().url().max(512).default('ws://127.0.0.1:21213'),
    apiKey: z.string().max(256).optional(), // Chỉ gửi khi cần lưu mới, không lưu plaintext trong SQLite app_settings
    autoConnectOnStart: z.boolean().default(false),
  })
  .strict();
export type LiveProviderConfig = z.infer<typeof LiveProviderConfigSchema>;

export const LiveConnectionSummarySchema = z
  .object({
    provider: LiveProviderSchema,
    state: LiveConnectionStateSchema,
    streamerUsername: z.string(),
    endpointUrl: z.string(),
    hasApiKey: z.boolean(),
    eventsReceived: z.number().int().min(0),
    lastEventAt: z.string().nullable(),
    lastError: z.string().nullable(),
  })
  .strict();
export type LiveConnectionSummary = z.infer<typeof LiveConnectionSummarySchema>;
```

---

## 4. Bốn Cổng Kiểm chứng Bắt buộc (Mandatory Acceptance Gates)

| Cổng Kiểm chứng | Mục tiêu Kiểm soát | Tiêu chí Đạt (Pass Criteria) |
| :--- | :--- | :--- |
| **Gate 1: Kiến trúc & Cô lập** | Bảo toàn lõi S1–S6, không split-brain, không trộn lẫn demo | • Không sửa bất kỳ dòng code nào trong `EventEngine`, `RuleMatcher`, `QueueManager`, `ComboBufferService`, `CharacterRepository`.<br>• Provider chỉ phát dữ liệu ra ngoài qua `onEvent()`.<br>• Chỉ cho phép duy nhất 1 Live Provider phát sự kiện tại một thời điểm.<br>• Mất kết nối giữ nguyên `ERROR`, **tuyệt đối không tự động chuyển sang DEMO**.<br>• Khi đang LIVE, chặn 100% lệnh phát quà demo giả. |
| **Gate 2: Dữ liệu Sự kiện & Combo** | Quà đơn, combo, delta lũy tích, chống trùng lặp | • Nhận quà đơn: Chuyển đổi chính xác sang `NormalizedLiveEvent`.<br>• Combo lũy tích: Khi TikFinity gửi $1 \to 2 \to 3$, Adapter tính toán gia số delta $1, 1, 1$ để hệ thống ghi nhận đúng 3 quà (không nhân đôi thành 6).<br>• Chống trùng: Bản tin trùng `externalEventId` bị SQLite chặn 100%.<br>• Nếu dùng Synthetic ID, ghi nhận rõ giới hạn chống trùng At-Least-Once, không nhận vơ Exactly-Once. |
| **Gate 3: An toàn Vận hành & Bảo mật** | Khả năng chịu lỗi, không sập server, zero secret leaks | • Tắt app TikFinity đột ngột: Backend, OBS và Manager không bị sập (crash-free); chuyển sang `RECONNECTING` rồi `ERROR` trung thực.<br>• Quét toàn bộ log console và file: 0% API key, token hoặc cookie bị rò rỉ.<br>• Khôi phục kết nối: Sau khi bật lại TikFinity, socket kết nối lại và nhận quà mới bình thường, không phát lại quà cũ ngoài ý muốn. |
| **Gate 4: Kiểm thử Thực tế & Hồi quy** | Unit tests, Integration tests, OBS E2E | • **95/95 tests hiện có tiếp tục PASS 100% (Zero Regressions)**.<br>• Bổ sung các bài test tích hợp S9 kiểm tra toàn diện hợp đồng, lifecycle, Zod validation, delta combo và lỗi mạng.<br>• Chạy kiểm thử OBS Studio trên bản đóng gói Windows 11 với TikFinity thật. |

---

## 5. Đề xuất Thay đổi Nhỏ nhất (Minimal Diff Architecture) cho S9

### 5.1. Danh sách Tệp Thêm mới:
1. `packages/shared/src/domain/live-provider-config.ts`: Định nghĩa schema cấu hình, trạng thái kết nối (`CONFIGURED`, `CONNECTED`, `RECEIVING_EVENTS`).
2. `apps/backend/src/server/live-connection-manager.ts`: Quản lý vòng đời kết nối, tích hợp `VerifiedProviderAdapter`, `ProviderKeyVault` và rào chắn an toàn (Gate 1 & Gate 3).
3. `apps/desktop/src/components/LiveConnectionTab.tsx`: Giao diện Tab "Kết nối Livestream" trên Desktop Manager UI.
4. Các tệp kiểm thử tích hợp S9 trong `tests/integration/`:
   - `tests/integration/s9-provider-contract.test.ts` (T-29)
   - `tests/integration/s9-connection-lifecycle.test.ts` (T-31)
   - `tests/integration/s9-event-normalization-delta.test.ts` (T-32)
   - `tests/integration/s9-error-security-isolation.test.ts` (T-33)
   - `tests/integration/s9-packaged-e2e.test.ts` (T-34)

### 5.2. Danh sách Tệp Cần Chỉnh sửa Nhẹ:
1. `packages/shared/src/index.ts`: Export thêm `live-provider-config`.
2. `packages/shared/src/realtime/contracts.ts`: Cập nhật `ManagerStateSnapshot` bổ sung trường `liveConnection: LiveConnectionSummary` và thêm các action Socket.IO `live:save_config`, `live:connect`, `live:disconnect`, `live:test_connection`.
3. `apps/backend/src/adapters/verified-provider-adapter.ts`: Bổ sung thuộc tính `eventsReceivedCount`, `lastEventTimestamp` và chuyển trạng thái sang `RECEIVING_EVENTS` khi nhận sự kiện hợp lệ đầu tiên.
4. `apps/backend/src/server/buddha-server.ts`: Tích hợp `LiveConnectionManager`, kết nối Socket.IO events và bảo vệ ranh giới chặn Demo khi đang LIVE.
5. `apps/desktop/src/App.tsx`: Bổ sung Tab "Kết nối LIVE" trên thanh điều hướng.

---

## 6. Lộ trình Triển khai Dự kiến Sau khi Được Phê duyệt

- **Bước 1 (T-29):** Tạo hợp đồng cấu hình `packages/shared/src/domain/live-provider-config.ts` và test hợp đồng `tests/integration/s9-provider-contract.test.ts`.
- **Bước 2 (T-31):** Hiện thực `LiveConnectionManager` trong Backend, quản lý vòng đời và kiểm thử lifecycle + chống mở socket trùng.
- **Bước 3 (T-32):** Kiểm chứng luồng chuẩn hóa sự kiện thật và thuật toán delta combo $1 \to 2 \to 3$ không bị nhân đôi quà.
- **Bước 4 (T-33):** Kiểm thử rớt mạng, lỗi socket, bảo mật DPAPI và log redaction.
- **Bước 5 (T-30):** Xây dựng giao diện `LiveConnectionTab.tsx` trên Desktop Manager.
- **Bước 6 (T-34):** Kiểm thử tích hợp xuyên suốt OBS Studio trên bản đóng gói Windows 11 với TikFinity thật và lập báo cáo nghiệm thu S9.

---
*Tài liệu kế hoạch được biên soạn tuân thủ quy tắc "Chỉ lập kế hoạch, chưa viết code, chờ rà soát kiến trúc".*
