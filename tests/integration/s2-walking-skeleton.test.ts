import {
  BuddhaServer,
  createLogger,
  generateSecretToken,
  NodeDevSecretCipher,
  openSqliteDatabase,
  OverlaySessionStore,
  type LogRecord,
  type SqliteDatabaseContext,
} from '@buddhalive/backend';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as ClientSocket, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('S2 Walking Skeleton & 6-Layer Security Integration', () => {
  let tempBase: string;
  let ctx: SqliteDatabaseContext;
  let server: BuddhaServer;
  let managerToken: string;
  let serverUrl: string;
  let sessionStore: OverlaySessionStore;
  const capturedLogs: LogRecord[] = [];

  const testLogger = createLogger('TestServer', (record) => {
    capturedLogs.push(record);
  });

  beforeAll(async () => {
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bls-s2-int-'));
    ctx = openSqliteDatabase({ baseDir: tempBase });
    managerToken = generateSecretToken();

    const cipher = new NodeDevSecretCipher();
    sessionStore = new OverlaySessionStore(
      path.join(ctx.paths.securityDir, 'overlay-sessions.dat'),
      cipher,
      testLogger.child('SessionStore')
    );

    server = new BuddhaServer(ctx, sessionStore, {
      port: 3721,
      host: '127.0.0.1',
      managerToken,
      logger: testLogger,
    });

    await server.start();
    serverUrl = 'http://127.0.0.1:3721';
  });

  afterAll(async () => {
    await server.stop();
    ctx.close();
    if (fs.existsSync(tempBase)) {
      fs.rmSync(tempBase, { recursive: true, force: true });
    }
  });

  /* ------------------------------------------------------------------------ */
  /* 1. Kiểm thử Bảo mật 6 Lớp (Layer 1 - Layer 6)                            */
  /* ------------------------------------------------------------------------ */

  describe('6-Layer Security Pipeline', () => {
    it('Lớp 2: Chặn 100% request có token trên query string với 400 TOKEN_IN_QUERY_FORBIDDEN', async () => {
      const res1 = await fetch(`${serverUrl}/overlay?token=abc123secret`);
      expect(res1.status).toBe(400);
      const json1 = await res1.json();
      expect(json1.error.code).toBe('TOKEN_IN_QUERY_FORBIDDEN');

      const res2 = await fetch(`${serverUrl}/api/overlay/pair/request?overlayToken=hack`);
      expect(res2.status).toBe(400);
    });

    it('Lớp 2: Không bao giờ để lộ token hoặc cookie trong logs ([REDACTED])', async () => {
      // Ghi log thử chứa managerToken và header Authorization
      testLogger.info(`Testing sensitive log output with token: ${managerToken}`, {
        authorization: `Bearer ${managerToken}`,
        cookie: 'bls_overlay_session=secret123456789012345678901234567890',
      });

      const logDump = JSON.stringify(capturedLogs);
      expect(logDump).not.toContain(managerToken);
      expect(logDump).toContain('[REDACTED]');
    });

    it('Lớp 2: Ghép nối OBS 1 lần, cấp cookie HttpOnly và duy trì sau khởi động lại', async () => {
      // 1. Overlay gửi pair request
      const reqRes = await fetch(`${serverUrl}/api/overlay/pair/request`, { method: 'POST' });
      expect(reqRes.status).toBe(200);
      const reqData = await reqRes.json();
      expect(reqData.ok).toBe(true);
      const { pairingId, code, claimSecret } = reqData.data;

      // 2. Desktop Manager duyệt ghép nối (dùng managerToken)
      const approveRes = await fetch(`${serverUrl}/api/overlay/pair/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({ pairingId, code }),
      });
      expect(approveRes.status).toBe(200);

      // 3. Overlay claim token và nhận Set-Cookie HttpOnly
      const claimRes = await fetch(`${serverUrl}/api/overlay/pair/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairingId, claimSecret }),
      });
      expect(claimRes.status).toBe(200);
      const setCookie = claimRes.headers.get('set-cookie');
      expect(setCookie).toContain('bls_overlay_session=');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Strict');

      // 4. Kiểm tra file overlay-sessions.dat đã được ghi đĩa và mã hóa
      const sessionFilePath = path.join(ctx.paths.securityDir, 'overlay-sessions.dat');
      expect(fs.existsSync(sessionFilePath)).toBe(true);

      // Plain text token không được nằm trong file session
      const rawFile = fs.readFileSync(sessionFilePath);
      expect(rawFile.toString('utf8')).not.toContain('bls_overlay_session');

      // 5. Khởi động lại store trên cùng file: vẫn hợp lệ
      const newStore = new OverlaySessionStore(
        sessionFilePath,
        new NodeDevSecretCipher(),
        testLogger
      );
      newStore.load();
      expect(newStore.count).toBeGreaterThanOrEqual(1);
    });

    it('Lớp 3: Chặn kết nối từ origin lạ bên ngoài (chống CSRF & DNS Rebinding)', async () => {
      const res = await fetch(`${serverUrl}/api/overlay/pair/request`, {
        method: 'POST',
        headers: {
          Origin: 'https://malicious-website.com',
        },
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe('FORBIDDEN_ORIGIN');
    });

    it('Lớp 4: Chặn Path Traversal khi truy cập /assets/../*', async () => {
      const res = await fetch(`${serverUrl}/assets/../../../package.json`);
      expect([400, 403, 404]).toContain(res.status);
    });

    it('Lớp 6: Chặn vai trò OVERLAY gửi lệnh của MANAGER (FORBIDDEN_ROLE)', async () => {
      // Tạo session token hợp lệ cho overlay
      const overlayToken = sessionStore.issue();

      const overlaySocket: Socket = ClientSocket(serverUrl, {
        path: '/socket.io',
        auth: { protocolVersion: '1.0', clientType: 'OVERLAY', instanceId: 'ovl_test' },
        extraHeaders: {
          Cookie: `bls_overlay_session=${overlayToken}`,
        },
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => overlaySocket.on('connect', resolve));

      // Thử gửi lệnh demo:trigger_gift (chỉ dành cho MANAGER)
      const ack: any = await new Promise((resolve) => {
        overlaySocket.emit('demo:trigger_gift', { senderName: 'Hacker' }, resolve);
      });

      expect(ack.ok).toBe(false);
      expect(ack.error.code).toBe('FORBIDDEN_ROLE');

      overlaySocket.disconnect();
    });

    it('Lớp 6: Chặn payload sai Zod schema (.strict()) với VALIDATION_ERROR', async () => {
      const mgrSocket: Socket = ClientSocket(serverUrl, {
        path: '/socket.io',
        auth: {
          protocolVersion: '1.0',
          clientType: 'MANAGER',
          token: managerToken,
          instanceId: 'mgr_test',
        },
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => mgrSocket.on('connect', resolve));

      // Gửi payload chứa trường lạ 'injectedField'
      const ack: any = await new Promise((resolve) => {
        mgrSocket.emit(
          'demo:trigger_gift',
          { senderName: 'Minh Anh', injectedField: 'hack' },
          resolve
        );
      });

      expect(ack.ok).toBe(false);
      expect(ack.error.code).toBe('VALIDATION_ERROR');

      mgrSocket.disconnect();
    });
  });

  /* ------------------------------------------------------------------------ */
  /* 2. Kiểm thử Luồng Xuyên Suốt Walking Skeleton (S2)                       */
  /* ------------------------------------------------------------------------ */

  describe('End-to-End Walking Skeleton Flow', () => {
    it('Bấm Demo -> Backend lưu SQLite -> Socket.IO -> Overlay hiện nhân vật + tên -> hoàn tất biến mất', async () => {
      const overlayToken = sessionStore.issue();

      const overlaySocket: Socket = ClientSocket(serverUrl, {
        path: '/socket.io',
        auth: { protocolVersion: '1.0', clientType: 'OVERLAY', instanceId: 'ovl_live' },
        extraHeaders: {
          Cookie: `bls_overlay_session=${overlayToken}`,
        },
        transports: ['websocket'],
      });

      const managerSocket: Socket = ClientSocket(serverUrl, {
        path: '/socket.io',
        auth: {
          protocolVersion: '1.0',
          clientType: 'MANAGER',
          token: managerToken,
          instanceId: 'mgr_live',
        },
        transports: ['websocket'],
      });

      await Promise.all([
        new Promise<void>((resolve) => overlaySocket.on('connect', resolve)),
        new Promise<void>((resolve) => managerSocket.on('connect', resolve)),
      ]);

      // Overlay gửi telemetry ready
      await new Promise<void>((resolve) => {
        overlaySocket.emit('overlay:telemetry', { readyToPlay: true, webglAvailable: true }, resolve);
      });

      // Lắng nghe sự kiện execute_action từ overlay
      const actionPromise = new Promise<any>((resolve) => {
        overlaySocket.once('overlay:execute_action', resolve);
      });

      // Lắng nghe cập nhật trạng thái từ manager
      const statusUpdates: string[] = [];
      managerSocket.on('execution:status_changed', (summary: any) => {
        statusUpdates.push(summary.status);
      });

      // Bấm Gửi Quà Demo (Minh Anh tặng 1x Hoa Sen)
      const triggerAck: any = await new Promise((resolve) => {
        managerSocket.emit(
          'demo:trigger_gift',
          { senderName: 'Minh Anh', giftCount: 1 },
          resolve
        );
      });

      expect(triggerAck.ok).toBe(true);
      expect(triggerAck.data.duplicate).toBe(false);
      expect(triggerAck.data.processStatus).toBe('MATCHED');
      const executionId = triggerAck.data.executionId;
      expect(executionId).toBeDefined();

      // Overlay nhận được action
      const actionPayload = await actionPromise;
      expect(actionPayload.executionId).toBe(executionId);
      expect(actionPayload.senderName).toBe('Minh Anh');
      expect(actionPayload.clipName).toBe('Pray');
      expect(actionPayload.caption).toContain('Minh Anh đã tặng 1x Hoa Sen');

      // Overlay bắt đầu diễn
      overlaySocket.emit('overlay:execution_started', { executionId });

      // Chờ một chút để backend cập nhật PLAYING
      await new Promise((r) => setTimeout(r, 50));

      // Overlay hoàn tất diễn và biến mất (PRIMARY_3D)
      overlaySocket.emit('overlay:execution_completed', {
        executionId,
        completionMode: 'PRIMARY_3D',
        actualDurationMs: 3500,
      });

      // Chờ cập nhật trạng thái cuối cùng
      await new Promise((r) => setTimeout(r, 100));

      // Kiểm tra trong SQLite: execution đã đạt trạng thái COMPLETED
      const execInDb = ctx.execRepo.getById(executionId);
      expect(execInDb).not.toBeNull();
      expect(execInDb?.status).toBe('COMPLETED');
      expect(execInDb?.senderName).toBe('Minh Anh');
      expect(execInDb?.finishedAt).not.toBeNull();

      expect(statusUpdates).toContain('PLAYING');
      expect(statusUpdates).toContain('COMPLETED');

      overlaySocket.disconnect();
      managerSocket.disconnect();
    });

    it('Xử lý F5 / Mất kết nối Overlay khi đang diễn: hủy dở với OVERLAY_RELOADED và khôi phục sạch', async () => {
      const overlayToken = sessionStore.issue();

      const overlaySocket: Socket = ClientSocket(serverUrl, {
        path: '/socket.io',
        auth: { protocolVersion: '1.0', clientType: 'OVERLAY', instanceId: 'ovl_f5' },
        extraHeaders: { Cookie: `bls_overlay_session=${overlayToken}` },
        transports: ['websocket'],
      });

      const managerSocket: Socket = ClientSocket(serverUrl, {
        path: '/socket.io',
        auth: { protocolVersion: '1.0', clientType: 'MANAGER', token: managerToken, instanceId: 'mgr_f5' },
        transports: ['websocket'],
      });

      await Promise.all([
        new Promise<void>((resolve) => overlaySocket.on('connect', resolve)),
        new Promise<void>((resolve) => managerSocket.on('connect', resolve)),
      ]);

      overlaySocket.emit('overlay:telemetry', { readyToPlay: true, webglAvailable: true });

      const actionPromise = new Promise<any>((resolve) => {
        overlaySocket.once('overlay:execute_action', resolve);
      });

      // Gửi quà Demo
      const triggerAck: any = await new Promise((resolve) => {
        managerSocket.emit('demo:trigger_gift', { senderName: 'Lan Huong' }, resolve);
      });
      const executionId = triggerAck.data.executionId;
      await actionPromise;

      overlaySocket.emit('overlay:execution_started', { executionId });
      await new Promise((r) => setTimeout(r, 50));

      // F5 / Ngắt kết nối đột ngột
      overlaySocket.disconnect();

      await new Promise((r) => setTimeout(r, 100));

      // Lượt thực thi dở phải bị CANCELLED với error_code = OVERLAY_RELOADED
      const cancelledExec = ctx.execRepo.getById(executionId);
      expect(cancelledExec?.status).toBe('CANCELLED');
      expect(cancelledExec?.errorCode).toBe('OVERLAY_RELOADED');

      managerSocket.disconnect();
    });

    it('Xử lý Model 3D lỗi nhưng Fallback 2D thành công: ghi COMPLETED_WITH_FALLBACK', async () => {
      const overlayToken = sessionStore.issue();

      const overlaySocket: Socket = ClientSocket(serverUrl, {
        path: '/socket.io',
        auth: { protocolVersion: '1.0', clientType: 'OVERLAY', instanceId: 'ovl_fb' },
        extraHeaders: { Cookie: `bls_overlay_session=${overlayToken}` },
        transports: ['websocket'],
      });

      const managerSocket: Socket = ClientSocket(serverUrl, {
        path: '/socket.io',
        auth: { protocolVersion: '1.0', clientType: 'MANAGER', token: managerToken, instanceId: 'mgr_fb' },
        transports: ['websocket'],
      });

      await Promise.all([
        new Promise<void>((resolve) => overlaySocket.on('connect', resolve)),
        new Promise<void>((resolve) => managerSocket.on('connect', resolve)),
      ]);

      overlaySocket.emit('overlay:telemetry', { readyToPlay: true, webglAvailable: true });

      const actionPromise = new Promise<any>((resolve) => {
        overlaySocket.once('overlay:execute_action', resolve);
      });

      const triggerAck: any = await new Promise((resolve) => {
        managerSocket.emit('demo:trigger_gift', { senderName: 'Quoc Bao' }, resolve);
      });
      const executionId = triggerAck.data.executionId;
      await actionPromise;

      // Model lỗi -> Overlay kích hoạt bảng 2D rồi hoàn tất với FALLBACK_2D
      overlaySocket.emit('overlay:execution_completed', {
        executionId,
        completionMode: 'FALLBACK_2D',
        actualDurationMs: 3000,
        fallbackReasonCode: 'MODEL_LOAD_FAILED',
        fallbackReasonMessage: 'Corrupt GLTF header test',
      });

      await new Promise((r) => setTimeout(r, 100));

      // Backend lưu COMPLETED_WITH_FALLBACK (không đánh dấu FAILED theo yêu cầu v1.2.0)
      const fbExec = ctx.execRepo.getById(executionId);
      expect(fbExec?.status).toBe('COMPLETED_WITH_FALLBACK');
      expect(fbExec?.errorCode).toBe('MODEL_LOAD_FAILED');

      overlaySocket.disconnect();
      managerSocket.disconnect();
    });
  });
});
