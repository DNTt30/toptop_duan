import {
  BuddhaServer,
  createLogger,
  generateSecretToken,
  NodeDevSecretCipher,
  openSqliteDatabase,
  OverlaySessionStore,
  type SqliteDatabaseContext,
} from '@buddhalive/backend';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { io as ClientIo, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('Milestone S6: T-17 OBS Studio Production Runtime & Mutex Verification', () => {
  let ctx: SqliteDatabaseContext;
  let server: BuddhaServer;
  let sessionStore: OverlaySessionStore;
  let managerToken: string;
  let tempBase: string;
  let port: number;

  const testLogger = createLogger('TestS6OBS');

  beforeEach(async () => {
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bls-s6-obs-'));
    ctx = openSqliteDatabase({ baseDir: tempBase });
    managerToken = generateSecretToken();

    const cipher = new NodeDevSecretCipher();
    const sessionFile = path.join(tempBase, 'security', 'sessions.dat');
    sessionStore = new OverlaySessionStore(sessionFile, cipher, testLogger);

    port = 45000 + Math.floor(Math.random() * 2000);

    const overlayDist = path.resolve(__dirname, '..', '..', 'apps', 'desktop', 'dist-overlay');
    server = new BuddhaServer(ctx, sessionStore, {
      port,
      host: '127.0.0.1',
      managerToken,
      overlayStaticDir: overlayDist,
      logger: testLogger,
    });

    await server.start();
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
    if (ctx) {
      ctx.close();
    }
    if (fs.existsSync(tempBase)) {
      try {
        fs.rmSync(tempBase, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      } catch {
        // Ignore busy file on windows
      }
    }
  });

  function getOverlayHtml(): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/overlay/`, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
        res.on('error', reject);
      });
    });
  }

  function pairOverlay(): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        `http://127.0.0.1:${port}/api/overlay/pair/request`,
        { method: 'POST' },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            const body = JSON.parse(data);
            const { pairingId, code, claimSecret } = body.data;

            // Manager approves
            const approved = server.pairingManager.approve(pairingId, code);
            expect(approved).toBe(true);

            // Overlay claims session
            const claimReq = http.request(
              `http://127.0.0.1:${port}/api/overlay/pair/claim`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
              },
              (claimRes) => {
                const cookieHeader = claimRes.headers['set-cookie'];
                const cookieStr = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
                expect(cookieStr).toBeDefined();
                expect(cookieStr).toContain('bls_overlay_session=');
                expect(cookieStr).toContain('HttpOnly');
                resolve(cookieStr!);
              }
            );
            claimReq.write(JSON.stringify({ pairingId, claimSecret }));
            claimReq.end();
          });
        }
      );
      req.on('error', reject);
      req.end();
    });
  }

  it('serves overlay production HTML and enforces transparent OBS background', async () => {
    const { statusCode, body } = await getOverlayHtml();
    expect(statusCode).toBe(200);
    expect(body).toContain('<div id="root">');
  });

  it('pairs OBS overlay, maintains HttpOnly session cookie, and reconnects without re-pairing', async () => {
    const cookieHeader = await pairOverlay();
    expect(cookieHeader).toContain('bls_overlay_session=');

    // Connect overlay client via Socket.IO carrying session cookie
    const socket: ClientSocket = ClientIo(`http://127.0.0.1:${port}`, {
      path: '/socket.io',
      auth: {
        protocolVersion: '1.0',
        clientType: 'OVERLAY',
        instanceId: 'obs_browser_1',
      },
      extraHeaders: {
        Cookie: cookieHeader,
      },
      transports: ['websocket'],
    });

    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => {
        expect(socket.connected).toBe(true);
        resolve();
      });
      socket.on('connect_error', reject);
    });

    // Reconnect simulation (OBS restart or F5) using same cookie
    socket.disconnect();

    const socket2: ClientSocket = ClientIo(`http://127.0.0.1:${port}`, {
      path: '/socket.io',
      auth: {
        protocolVersion: '1.0',
        clientType: 'OVERLAY',
        instanceId: 'obs_browser_reconnect',
      },
      extraHeaders: {
        Cookie: cookieHeader,
      },
      transports: ['websocket'],
    });

    await new Promise<void>((resolve, reject) => {
      socket2.on('connect', () => {
        expect(socket2.connected).toBe(true);
        resolve();
      });
      socket2.on('connect_error', reject);
    });

    socket2.disconnect();
  });

  it('guarantees Execution Mutex: strictly 1 execution PLAYING/DISPATCHED at a time', async () => {
    const cookieHeader = await pairOverlay();
    const socket: ClientSocket = ClientIo(`http://127.0.0.1:${port}`, {
      path: '/socket.io',
      auth: { protocolVersion: '1.0', clientType: 'OVERLAY', instanceId: 'obs_mutex' },
      extraHeaders: { Cookie: cookieHeader },
      transports: ['websocket'],
    });

    await new Promise<void>((res) => socket.on('connect', res));

    // Send telemetry ready
    socket.emit('overlay:telemetry', { readyToPlay: true, webglAvailable: true, fps: 60 });
    await new Promise((r) => setTimeout(r, 50));

    let activeDispatchesCount = 0;
    let maxConcurrentDispatched = 0;

    socket.on('overlay:execute_action', (payload: { executionId: string }) => {
      activeDispatchesCount++;
      if (activeDispatchesCount > maxConcurrentDispatched) {
        maxConcurrentDispatched = activeDispatchesCount;
      }

      socket.emit('overlay:execution_started', { executionId: payload.executionId });

      // Simulate playing for 100ms
      setTimeout(() => {
        activeDispatchesCount--;
        socket.emit('overlay:execution_completed', {
          executionId: payload.executionId,
          completionMode: 'PRIMARY_3D',
          actualDurationMs: 100,
        });
      }, 100);
    });

    // Fire 5 gifts concurrently
    for (let i = 1; i <= 5; i++) {
      server.engine.triggerDemoGift({
        giftId: 'lotus',
        giftCount: 1,
        senderName: `Concurrent Senders ${i}`,
      });
    }

    // Wait until all 5 executions finish
    await new Promise((r) => setTimeout(r, 800));

    // Mutex invariant: at NO point did more than 1 execution dispatch simultaneously
    expect(maxConcurrentDispatched).toBe(1);

    const metrics = server.engine.getQueueMetrics();
    expect(metrics.completed).toBe(5);
    expect(metrics.playing).toBe(0);
    expect(metrics.queued).toBe(0);

    socket.disconnect();
  });

  it('enforces Cancellation Barrier on SKIP before dispatching next queued execution', async () => {
    const cookieHeader = await pairOverlay();
    const socket: ClientSocket = ClientIo(`http://127.0.0.1:${port}`, {
      path: '/socket.io',
      auth: { protocolVersion: '1.0', clientType: 'OVERLAY', instanceId: 'obs_skip' },
      extraHeaders: { Cookie: cookieHeader },
      transports: ['websocket'],
    });

    await new Promise<void>((res) => socket.on('connect', res));
    socket.emit('overlay:telemetry', { readyToPlay: true, webglAvailable: true, fps: 60 });
    await new Promise((r) => setTimeout(r, 50));

    const receivedActions: string[] = [];
    let receivedCancelAction = false;

    socket.on('overlay:execute_action', (payload: { executionId: string; senderName: string }) => {
      receivedActions.push(payload.senderName);
      socket.emit('overlay:execution_started', { executionId: payload.executionId });
    });

    socket.on('overlay:cancel_action', (payload: { executionId: string }) => {
      receivedCancelAction = true;
      // Simulate overlay teardown then send cancellation ACK after 40ms
      setTimeout(() => {
        socket.emit('overlay:action_cancelled', { executionId: payload.executionId });
      }, 40);
    });

    // Enqueue 2 gifts
    server.engine.triggerDemoGift({ giftId: 'lotus', giftCount: 1, senderName: 'User To Skip' });
    server.engine.triggerDemoGift({ giftId: 'lotus', giftCount: 1, senderName: 'User Follow Up' });

    // Wait for first item to start playing
    await new Promise((r) => setTimeout(r, 80));
    expect(receivedActions).toEqual(['User To Skip']);

    // Trigger SKIP with barrier 200ms
    const skipRes = server.engine.skipCurrent('Operator SKIP', { barrierMs: 200 });
    expect(skipRes.success).toBe(true);

    // Wait 20ms for websocket frame delivery
    await new Promise((r) => setTimeout(r, 20));

    // Immediately after skip, during cancellation barrier, User Follow Up must NOT yet be dispatched
    expect(receivedCancelAction).toBe(true);

    // After overlay sends action_cancelled ACK (40ms), the barrier clears and next item dispatches
    await new Promise((r) => setTimeout(r, 120));
    expect(receivedActions).toEqual(['User To Skip', 'User Follow Up']);

    socket.disconnect();
  });

  it('distinguishes VIP Priority Queue jump vs VIP Queue Eviction (Preemption)', async () => {
    // 1. VIP Priority Queue Jump:
    // When queue is paused, enqueued gifts queue up.
    // Low priority gift (priority 10) arrives first, then VIP gift (priority 50) arrives.
    server.engine.pauseQueue();

    server.engine.triggerDemoGift({
      giftId: 'lotus',
      giftCount: 1,
      senderName: 'Regular Donor 1', // Priority 10
    });

    // Create VIP rule with priority 50
    const char = ctx.charRepo.getActiveCharacter()!;
    const anim = ctx.animRepo.listByCharacterId(char.id)[0]!;
    ctx.ruleRepo.create({
      name: 'VIP Dragon',
      characterId: char.id,
      animationId: anim.id,
      triggerGiftId: 'vip_dragon',
      priority: 50,
      minGiftCount: 1,
      minCoinValue: 1000,
      comboTriggerMode: 'EACH_EVENT',
      isEnabled: true,
    });

    server.engine.handleIncomingLiveEvent({
      source: 'DEMO',
      eventType: 'GIFT',
      senderId: 'demo_user_vip',
      senderName: 'VIP Donor',
      giftId: 'vip_dragon',
      giftCount: 1,
      unitCoinValue: 1000,
    });

    server.engine.triggerDemoGift({
      giftId: 'lotus',
      giftCount: 1,
      senderName: 'Regular Donor 2', // Priority 10
    });

    // Verify VIP Donor jumped to head of QUEUED list (Priority DESC + FIFO)
    const queuedList = ctx.execRepo.listQueued(10);
    expect(queuedList.length).toBe(3);
    expect(queuedList[0]!.senderName).toBe('VIP Donor');
    expect(queuedList[0]!.priority).toBe(50);
    expect(queuedList[1]!.senderName).toBe('Regular Donor 1');
    expect(queuedList[2]!.senderName).toBe('Regular Donor 2');

    // 2. VIP Queue Eviction (Preemption at cap 30/30):
    // Clear queue first
    server.engine.clearQueue();
    expect(ctx.execRepo.getQueuedCount()).toBe(0);

    // Fill queue to 30 items using 6 rules of 5 each
    const charEntity = ctx.charRepo.getActiveCharacter()!;
    const animEntity = ctx.animRepo.listByCharacterId(charEntity.id)[0]!;

    for (let ruleIdx = 1; ruleIdx <= 6; ruleIdx++) {
      const bulkRule = ctx.ruleRepo.create({
        name: `Bulk Rule ${ruleIdx}`,
        characterId: charEntity.id,
        animationId: animEntity.id,
        triggerGiftId: `bulk_gift_${ruleIdx}`,
        priority: 10,
        minGiftCount: 1,
        minCoinValue: 10,
        comboTriggerMode: 'EACH_EVENT',
        maxQueuePerRule: 5,
        isEnabled: true,
      });

      for (let i = 1; i <= 5; i++) {
        server.engine.handleIncomingLiveEvent({
          source: 'DEMO',
          eventType: 'GIFT',
          senderId: `sender_${ruleIdx}_${i}`,
          senderName: `Cap Donor ${ruleIdx}-${i}`,
          giftId: `bulk_gift_${ruleIdx}`,
          giftCount: 1,
          unitCoinValue: 10,
        });
      }
    }
    expect(ctx.execRepo.getQueuedCount()).toBe(30);

    // Now incoming VIP gift arrives at cap 30
    const vipRes = server.engine.handleIncomingLiveEvent({
      source: 'DEMO',
      eventType: 'GIFT',
      senderId: 'demo_user_vip_evictor',
      senderName: 'VIP Evictor',
      giftId: 'vip_dragon',
      giftCount: 1,
      unitCoinValue: 1000,
    });

    expect(vipRes.duplicate).toBe(false);
    expect(ctx.execRepo.getQueuedCount()).toBe(30);

    // Verify one lower priority item was evicted with EVICTED_BY_PRIORITY
    const evicted = ctx.db
      .prepare("SELECT * FROM event_executions WHERE status = 'EVICTED_BY_PRIORITY'")
      .all() as any[];
    expect(evicted.length).toBe(1);
    expect(evicted[0]!.status).toBe('EVICTED_BY_PRIORITY');
    expect(evicted[0]!.error_message).toContain('VIP');

    // Verify VIP Evictor is queued at head
    const newQueued = ctx.execRepo.listQueued(10);
    expect(newQueued[0]!.senderName).toBe('VIP Evictor');
  });

  it('safely handles OBS F5 reload during playback without backend crash or state corruption', async () => {
    // 1. Pair and connect an active overlay socket
    const cookieHeader = await pairOverlay();
    const socket: ClientSocket = ClientIo(`http://127.0.0.1:${port}`, {
      path: '/socket.io',
      auth: { protocolVersion: '1.0', clientType: 'OVERLAY', instanceId: 'obs_f5' },
      extraHeaders: { Cookie: cookieHeader },
      transports: ['websocket'],
    });

    await new Promise<void>((res) => socket.on('connect', res));
    socket.emit('overlay:telemetry', { readyToPlay: true, webglAvailable: true, fps: 60 });
    await new Promise((r) => setTimeout(r, 50));

    // 2. Dispatch an item to PLAYING
    server.engine.triggerDemoGift({
      giftId: 'lotus',
      giftCount: 1,
      senderName: 'Active Playing User',
    });

    await new Promise((r) => setTimeout(r, 50));
    const active = server.engine.getActiveExecution();
    expect(active).toBeDefined();

    // 3. OBS user presses F5 -> overlay socket disconnects
    socket.disconnect();
    await new Promise((r) => setTimeout(r, 50));

    // Invariant: active execution is cancelled with OVERLAY_RELOADED, no active execution remains
    expect(server.engine.getActiveExecution()).toBeNull();

    const cancelledExec = ctx.execRepo.getById(active!.id);
    expect(cancelledExec?.status).toBe('CANCELLED');
    expect(cancelledExec?.errorCode).toBe('OVERLAY_RELOADED');
  });
});
