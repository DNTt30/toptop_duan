import {
  BuddhaServer,
  createLogger,
  generateSecretToken,
  NodeDevSecretCipher,
  openSqliteDatabase,
  OverlaySessionStore,
  type SqliteDatabaseContext,
} from '@buddhalive/backend';
import { PROTOCOL_VERSION } from '@buddhalive/shared';
import { expect, test } from '@playwright/test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io, Socket } from 'socket.io-client';

test.describe('S5 Queue Monitor & Controls Real-time E2E', () => {
  let tempBase: string;
  let ctx: SqliteDatabaseContext;
  let server: BuddhaServer;
  let managerToken: string;
  let managerSocket: Socket;
  const screenshotsDir = path.resolve(__dirname, 'screenshots');
  const PORT = 3725;

  test.beforeAll(async () => {
    fs.mkdirSync(screenshotsDir, { recursive: true });
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bls-s5-pw-'));
    ctx = openSqliteDatabase({ baseDir: tempBase });
    managerToken = generateSecretToken();

    const cipher = new NodeDevSecretCipher();
    const sessionStore = new OverlaySessionStore(
      path.join(ctx.paths.securityDir, 'overlay-sessions.dat'),
      cipher,
      createLogger('TestSessionStoreS5')
    );

    const overlayStaticDir = path.resolve(__dirname, '..', '..', 'apps', 'overlay', 'dist');

    server = new BuddhaServer(ctx, sessionStore, {
      port: PORT,
      host: '127.0.0.1',
      managerToken,
      overlayStaticDir,
      logger: createLogger('E2EServerS5'),
    });

    await server.start();
  });

  test.afterAll(async () => {
    if (managerSocket && managerSocket.connected) {
      managerSocket.disconnect();
    }
    await server.stop();
    ctx.close();
    if (fs.existsSync(tempBase)) {
      fs.rmSync(tempBase, { recursive: true, force: true });
    }
  });

  test('Queue Monitor & Control E2E: PAUSE -> Queue without dispatch -> RESUME -> Overlay Plays -> SKIP -> CLEAR -> Multi-Scenario Demo', async ({
    page,
  }) => {
    // 1. Connect OBS Overlay in Browser
    await page.goto(`http://127.0.0.1:${PORT}/overlay`);
    await page.waitForSelector('[data-testid="pairing-dialog"]', { timeout: 10000 });

    const codeElement = page.locator('[data-testid="pairing-code"]');
    await expect(codeElement).toBeVisible();
    const rawCodeText = await codeElement.textContent();
    const code = rawCodeText?.replace(/\s+/g, '') ?? '';
    expect(code).toHaveLength(6);

    // 2. Manager approves OBS Pairing
    const pending = server.pairingManager.listPending();
    const targetPair = pending.find((p) => p.code === code);
    expect(targetPair).toBeDefined();
    server.pairingManager.approve(targetPair!.pairingId, code);

    // Overlay enters Standby
    await page.waitForSelector('[data-overlay-state="HIDDEN_STANDBY"]', { timeout: 10000 });

    // 3. Connect Manager Socket.IO client with managerToken
    managerSocket = io(`http://127.0.0.1:${PORT}`, {
      auth: {
        protocolVersion: PROTOCOL_VERSION,
        clientType: 'MANAGER',
        token: managerToken,
        instanceId: crypto.randomUUID(),
      },
      transports: ['websocket'],
    });

    await new Promise<void>((resolve, reject) => {
      managerSocket.on('connect', () => resolve());
      managerSocket.on('connect_error', (err) => reject(err));
    });
    expect(managerSocket.connected).toBe(true);

    // 4. Send PAUSE command via Socket.IO
    const pauseResponse = await new Promise<any>((resolve) => {
      managerSocket.emit('queue:control', { action: 'PAUSE' }, (ack: any) => {
        resolve(ack);
      });
    });
    expect(pauseResponse.ok).toBe(true);
    expect(pauseResponse.data.success).toBe(true);
    expect(pauseResponse.data.action).toBe('PAUSE');

    // 5. Send Demo Gift while PAUSED
    const demoGiftRes = server.engine.triggerDemoGift({
      giftId: 'lotus',
      giftCount: 1,
      senderName: 'Tâm Thiện',
    });
    expect(demoGiftRes.duplicate).toBe(false);

    // Overlay must REMAIN in HIDDEN_STANDBY because queue is PAUSED!
    await page.waitForTimeout(600);
    const overlayStateWhilePaused = await page.getAttribute('[data-overlay-state]', 'data-overlay-state');
    expect(overlayStateWhilePaused).toBe('HIDDEN_STANDBY');

    // 6. Send RESUME command via Socket.IO
    const resumeResponse = await new Promise<any>((resolve) => {
      managerSocket.emit('queue:control', { action: 'RESUME' }, (ack: any) => {
        resolve(ack);
      });
    });
    expect(resumeResponse.ok).toBe(true);
    expect(resumeResponse.data.success).toBe(true);
    expect(resumeResponse.data.action).toBe('RESUME');

    // Overlay now transitions to PLAYING!
    await page.waitForSelector('[data-overlay-state="PLAYING"]', { timeout: 10000 });
    const banner = page.locator('[data-testid="sender-banner"]');
    await expect(banner).toBeVisible({ timeout: 5000 });
    await expect(banner).toContainText('Tâm Thiện');

    // Take screenshot during active execution with S5 controls
    const screenshotPath = path.join(screenshotsDir, 's5-queue-monitor.png');
    await page.screenshot({ path: screenshotPath });
    expect(fs.existsSync(screenshotPath)).toBe(true);

    // 7. Send SKIP command while PLAYING
    const skipResponse = await new Promise<any>((resolve) => {
      managerSocket.emit('queue:control', { action: 'SKIP', reason: 'Operator Skip' }, (ack: any) => {
        resolve(ack);
      });
    });
    expect(skipResponse.ok).toBe(true);
    expect(skipResponse.data.success).toBe(true);
    expect(skipResponse.data.action).toBe('SKIP');

    // Overlay receives cancel_action and returns to HIDDEN_STANDBY
    await page.waitForSelector('[data-overlay-state="HIDDEN_STANDBY"]', { timeout: 10000 });

    // 8. Test CLEAR command
    // Pause queue and insert 2 items
    server.engine.pauseQueue();
    server.engine.triggerDemoGift({ giftId: 'lotus', giftCount: 1, senderName: 'Clear Tester 1' });
    server.engine.triggerDemoGift({ giftId: 'lotus', giftCount: 1, senderName: 'Clear Tester 2' });
    expect(server.engine.getQueueMetrics().queued).toBe(2);

    const clearResponse = await new Promise<any>((resolve) => {
      managerSocket.emit('queue:control', { action: 'CLEAR', reason: 'Operator Clear' }, (ack: any) => {
        resolve(ack);
      });
    });
    expect(clearResponse.ok).toBe(true);
    expect(clearResponse.data.success).toBe(true);
    expect(clearResponse.data.action).toBe('CLEAR');
    expect(clearResponse.data.affectedCount).toBe(2);
    expect(server.engine.getQueueMetrics().queued).toBe(0);

    // 9. Test Demo Multi-Scenario: VIP_INTERRUPT
    server.engine.resumeQueue();
    const scenarioResponse = await new Promise<any>((resolve) => {
      managerSocket.emit('demo:run_scenario', { scenario: 'VIP_INTERRUPT' }, (ack: any) => {
        resolve(ack);
      });
    });
    expect(scenarioResponse.ok).toBe(true);
    expect(scenarioResponse.data.started).toBe(true);
    expect(scenarioResponse.data.scenario).toBe('VIP_INTERRUPT');

    // Wait for VIP item to play and verify overlay handles it
    await page.waitForSelector('[data-overlay-state="PLAYING"]', { timeout: 10000 });

    // Stop scenario cleanly
    server.demoSimulator.stopScenario();
    await page.waitForTimeout(500);
  });
});
