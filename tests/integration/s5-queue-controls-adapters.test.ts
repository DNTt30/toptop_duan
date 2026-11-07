import {
  ComboBufferService,
  createLogger,
  DemoSimulator,
  EventEngine,
  openSqliteDatabase,
  type EventEngineBroadcaster,
  type SqliteDatabaseContext,
  TikTokDisconnectedAdapter,
} from '@buddhalive/backend';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('Milestone S5: Queue Controls (PAUSE, RESUME, SKIP, CLEAR) & Adapters Integration', () => {
  let tempBase: string;
  let ctx: SqliteDatabaseContext;
  const testLogger = createLogger('TestS5');

  beforeEach(() => {
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bls-s5-int-'));
    ctx = openSqliteDatabase({ baseDir: tempBase });
  });

  afterEach(() => {
    ctx.close();
    if (fs.existsSync(tempBase)) {
      fs.rmSync(tempBase, { recursive: true, force: true });
    }
  });

  /* -------------------------------------------------------------------------- */
  /* 1. T-14: Queue Controls - PAUSE and RESUME                                 */
  /* -------------------------------------------------------------------------- */
  describe('T-14: Queue Controls - PAUSE and RESUME', () => {
    it('PAUSE stops dispatching new executions while allowing PLAYING execution to complete', () => {
      let dispatchedAction: any = null;
      let managerBroadcastCount = 0;

      const broadcaster: EventEngineBroadcaster = {
        emitToOverlays: (event, payload) => {
          if (event === 'overlay:execute_action') {
            dispatchedAction = payload;
          }
        },
        emitToManagers: () => {
          managerBroadcastCount++;
        },
        getReadyOverlayCount: () => 1,
      };

      const engine = new EventEngine(ctx, broadcaster, testLogger);
      engine.setOverlayReady(true);

      // 1. Initially engine is unpaused
      expect(engine.getIsPaused()).toBe(false);
      expect(engine.getEngineStatus()).toBe('IDLE');

      // 2. Enqueue first gift -> Should immediately dispatch
      const ev1 = engine.triggerDemoGift({
        giftId: 'lotus',
        giftCount: 1,
        senderName: 'User 1',
      });

      expect(ev1.duplicate).toBe(false);
      expect(ev1.processStatus).toBe('MATCHED');
      expect(dispatchedAction).not.toBeNull();
      expect(engine.getActiveExecution()?.senderName).toBe('User 1');
      expect(engine.getEngineStatus()).toBe('PROCESSING');

      // 3. Issue PAUSE
      const pauseResult = engine.pauseQueue();
      expect(pauseResult).toBe(true);
      expect(engine.getIsPaused()).toBe(true);
      expect(engine.getEngineStatus()).toBe('PAUSED');

      // Check SQLite persistence
      const savedSetting = ctx.settingsRepo.get('engine.queue_paused');
      expect(savedSetting?.valueJson).toBe('true');

      // Active execution is still active (not cancelled or cut off)
      expect(engine.getActiveExecution()?.senderName).toBe('User 1');

      // 4. Send another gift while PAUSED -> Must ENQUEUE but NOT dispatch
      dispatchedAction = null;
      const ev2 = engine.triggerDemoGift({
        giftId: 'lotus',
        giftCount: 1,
        senderName: 'User 2',
      });

      expect(ev2.duplicate).toBe(false);
      expect(dispatchedAction).toBeNull(); // Did not dispatch to overlay!
      expect(engine.getActiveExecution()?.senderName).toBe('User 1'); // Still user 1

      const metrics = engine.getQueueMetrics();
      expect(metrics.queued).toBe(1);
      expect(metrics.playing).toBe(1);

      // 5. Complete active execution 1
      const activeId = engine.getActiveExecution()!.id;
      engine.handleExecutionCompleted({
        executionId: activeId,
        actualDurationMs: 2000,
        completedAt: new Date().toISOString(),
      });

      // Now active is null, but queued item is NOT dispatched because engine is PAUSED
      expect(engine.getActiveExecution()).toBeNull();
      expect(engine.getQueueMetrics().queued).toBe(1);
      expect(dispatchedAction).toBeNull();

      // 6. Issue RESUME
      const resumeResult = engine.resumeQueue();
      expect(resumeResult).toBe(true);
      expect(engine.getIsPaused()).toBe(false);

      // Check SQLite persistence updated
      expect(ctx.settingsRepo.get('engine.queue_paused')?.valueJson).toBe('false');

      // RESUME should have triggered dispatch of the waiting item!
      expect(dispatchedAction).not.toBeNull();
      expect(dispatchedAction.senderName).toBe('User 2');
      expect(engine.getActiveExecution()?.senderName).toBe('User 2');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 2. T-14: Queue Controls - SKIP                                             */
  /* -------------------------------------------------------------------------- */
  describe('T-14: Queue Controls - SKIP', () => {
    it('cancels active PLAYING execution with SKIPPED_BY_MANAGER and advances to next queued item', () => {
      let cancelledExecutionId: string | null = null;
      let dispatchedAction: any = null;

      const broadcaster: EventEngineBroadcaster = {
        emitToOverlays: (event, payload: any) => {
          if (event === 'overlay:execute_action') {
            dispatchedAction = payload;
          } else if (event === 'overlay:cancel_action') {
            cancelledExecutionId = payload.executionId;
          }
        },
        emitToManagers: () => {},
        getReadyOverlayCount: () => 1,
      };

      const engine = new EventEngine(ctx, broadcaster, testLogger);
      engine.setOverlayReady(true);

      // Pause briefly so we can queue two items cleanly
      engine.pauseQueue();

      engine.triggerDemoGift({
        giftId: 'lotus',
        giftCount: 1,
        senderName: 'First User',
      });

      engine.triggerDemoGift({
        giftId: 'lotus',
        giftCount: 1,
        senderName: 'Second User',
      });

      // Resume -> First item dispatches and transitions to PLAYING
      engine.resumeQueue();
      expect(engine.getActiveExecution()?.senderName).toBe('First User');
      const firstExecId = engine.getActiveExecution()!.id;

      // Simulate overlay starting animation
      engine.handleExecutionStarted({
        executionId: firstExecId,
        startedAt: new Date().toISOString(),
      });

      // Manager issues SKIP
      const skipResult = engine.skipCurrent('Skipped by Manager');
      expect(skipResult.success).toBe(true);
      expect(skipResult.skippedId).toBe(firstExecId);

      // Verify overlay cancel signal was emitted
      expect(cancelledExecutionId).toBe(firstExecId);

      // Verify database record for first item
      const firstDbExec = ctx.execRepo.getById(firstExecId);
      expect(firstDbExec?.status).toBe('SKIPPED_BY_MANAGER');
      expect(firstDbExec?.errorCode).toBe('SKIPPED_BY_MANAGER');
      expect(firstDbExec?.errorMessage).toContain('Manager');

      // Verify next item automatically dispatched
      expect(engine.getActiveExecution()?.senderName).toBe('Second User');
      expect(dispatchedAction?.senderName).toBe('Second User');
    });

    it('returns success: false gracefully when calling SKIP with no active execution', () => {
      const broadcaster: EventEngineBroadcaster = {
        emitToOverlays: () => {},
        emitToManagers: () => {},
        getReadyOverlayCount: () => 1,
      };

      const engine = new EventEngine(ctx, broadcaster, testLogger);

      const res = engine.skipCurrent();
      expect(res.success).toBe(false);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 3. T-14: Queue Controls - CLEAR                                            */
  /* -------------------------------------------------------------------------- */
  describe('T-14: Queue Controls - CLEAR', () => {
    it('cancels all QUEUED executions with CLEARED_BY_MANAGER and preserves PLAYING execution', () => {
      const broadcaster: EventEngineBroadcaster = {
        emitToOverlays: () => {},
        emitToManagers: () => {},
        getReadyOverlayCount: () => 1,
      };

      const engine = new EventEngine(ctx, broadcaster, testLogger);
      engine.setOverlayReady(true);

      // 1. Dispatch first item
      engine.triggerDemoGift({
        giftId: 'lotus',
        giftCount: 1,
        senderName: 'Active User',
      });

      const activeExecId = engine.getActiveExecution()!.id;

      // 2. Pause to enqueue 3 items
      engine.pauseQueue();
      for (let i = 1; i <= 3; i++) {
        engine.triggerDemoGift({
          giftId: 'lotus',
          giftCount: 1,
          senderName: `Queued User ${i}`,
        });
      }

      expect(engine.getQueueMetrics().queued).toBe(3);
      expect(engine.getQueueMetrics().playing).toBe(1);

      // 3. Manager clicks CLEAR
      const clearResult = engine.clearQueue('Cleared by operator');
      expect(clearResult.success).toBe(true);
      expect(clearResult.clearedCount).toBe(3);

      // Metrics updated
      expect(engine.getQueueMetrics().queued).toBe(0);
      expect(engine.getQueueMetrics().playing).toBe(1);

      // Active execution is still untouched
      expect(engine.getActiveExecution()?.id).toBe(activeExecId);
      expect(ctx.execRepo.getById(activeExecId)?.status).not.toBe('CLEARED_BY_MANAGER');

      // Verify all cleared rows are preserved in SQLite with audit status
      const clearedList = ctx.execRepo.listRecent(10).filter((e) => e.status === 'CLEARED_BY_MANAGER');
      expect(clearedList.length).toBe(3);
      for (const row of clearedList) {
        expect(row.errorCode).toBe('CLEARED_BY_MANAGER');
        expect(row.errorMessage).toContain('operator');
      }
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 4. Concurrency & Rapid Commands Safety                                    */
  /* -------------------------------------------------------------------------- */
  describe('Concurrency & Rapid Commands Safety', () => {
    it('handles rapid interleaved PAUSE, RESUME, SKIP, CLEAR without deadlock or state corruption', () => {
      const broadcaster: EventEngineBroadcaster = {
        emitToOverlays: () => {},
        emitToManagers: () => {},
        getReadyOverlayCount: () => 1,
      };

      const engine = new EventEngine(ctx, broadcaster, testLogger);
      engine.setOverlayReady(true);

      for (let i = 0; i < 20; i++) {
        engine.triggerDemoGift({
          giftId: 'lotus',
          giftCount: 1,
          senderName: `Rapid Sender ${i}`,
        });

        if (i % 4 === 0) {
          engine.pauseQueue();
        } else if (i % 4 === 1) {
          engine.resumeQueue();
        } else if (i % 4 === 2) {
          engine.skipCurrent();
        } else {
          engine.clearQueue();
        }
      }

      // Final clearQueue
      const clearRes = engine.clearQueue();
      expect(clearRes.success).toBe(true);

      // SQLite foreign keys and database integrity should remain healthy
      const health = ctx.runStorageHealthCheck({ isPackaged: false });
      expect(health.ok).toBe(true);
      expect(health.foreignKeysEnabled).toBe(true);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 5. Persistence Across Restart & Crash Recovery                            */
  /* -------------------------------------------------------------------------- */
  describe('Persistence Across Restart & Crash Recovery', () => {
    it('restores isPaused = true from SQLite on server restart', () => {
      const broadcaster: EventEngineBroadcaster = {
        emitToOverlays: () => {},
        emitToManagers: () => {},
        getReadyOverlayCount: () => 1,
      };

      // 1. In context 1: pause engine
      const engine1 = new EventEngine(ctx, broadcaster, testLogger);
      engine1.pauseQueue();
      expect(engine1.getIsPaused()).toBe(true);

      // 2. Create engine2 on the same DB context -> must read engine.queue_paused = true
      const engine2 = new EventEngine(ctx, broadcaster, testLogger);
      expect(engine2.getIsPaused()).toBe(true);
      expect(engine2.getEngineStatus()).toBe('PAUSED');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 6. T-15: Adapter Separation & Truthful Status                              */
  /* -------------------------------------------------------------------------- */
  describe('T-15: Adapter Separation & TikTokDisconnectedAdapter', () => {
    it('TikTokDisconnectedAdapter reports DISCONNECTED and rejects connection gracefully', async () => {
      const adapter = new TikTokDisconnectedAdapter(testLogger);

      expect(adapter.platform).toBe('TIKTOK');
      expect(adapter.getStatus()).toBe('DISCONNECTED');

      // Start is truthful disconnected mode
      await adapter.start();
      expect(adapter.getStatus()).toBe('DISCONNECTED');

      // Stop is safe
      await adapter.stop();
      expect(adapter.getStatus()).toBe('DISCONNECTED');
    });

    it('DemoSimulator implements LivePlatformAdapter and runs 4 realistic simulation scenarios', async () => {
      const broadcaster: EventEngineBroadcaster = {
        emitToOverlays: () => {},
        emitToManagers: () => {},
        getReadyOverlayCount: () => 1,
      };

      const engine = new EventEngine(ctx, broadcaster, testLogger);
      engine.setOverlayReady(true);

      const simulator = new DemoSimulator({
        logger: testLogger,
        onEvent: (event) => {
          engine.handleIncomingLiveEvent(event);
        },
      });

      expect(simulator.platform).toBe('DEMO');
      await simulator.start();
      expect(simulator.getStatus()).toBe('CONNECTED');

      // Pause so executions stay in queue for verification
      engine.pauseQueue();

      // 1. Scenario: SINGLE_BURST
      const burstRes = await simulator.runScenario('SINGLE_BURST');
      expect(burstRes.started).toBe(true);
      expect(burstRes.scenario).toBe('SINGLE_BURST');

      // 2. Scenario: CONCURRENT_SENDERS
      const concurrentRes = await simulator.runScenario('CONCURRENT_SENDERS');
      expect(concurrentRes.started).toBe(true);
      expect(concurrentRes.scenario).toBe('CONCURRENT_SENDERS');

      // 3. Scenario: VIP_INTERRUPT
      const vipRes = await simulator.runScenario('VIP_INTERRUPT');
      expect(vipRes.started).toBe(true);
      expect(vipRes.scenario).toBe('VIP_INTERRUPT');

      // 4. Scenario: QUEUE_OVERLOAD
      const overloadRes = await simulator.runScenario('QUEUE_OVERLOAD');
      expect(overloadRes.started).toBe(true);
      expect(overloadRes.scenario).toBe('QUEUE_OVERLOAD');

      // Wait 800ms for timers in scenarios to flush into SQLite while ctx is open
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Check total events captured with source = 'DEMO'
      const recentEvents = ctx.eventRepo.listRecent(50);
      expect(recentEvents.length).toBeGreaterThan(10);
      for (const ev of recentEvents) {
        expect(ev.source).toBe('DEMO');
      }

      // Stop scenario
      simulator.stopScenario();
      await simulator.stop();
      expect(simulator.getStatus()).toBe('DISCONNECTED');
    });
  });
});
