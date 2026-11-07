import {
  BuddhaServer,
  ComboBufferService,
  createLogger,
  EventEngine,
  generateSecretToken,
  NodeDevSecretCipher,
  openSqliteDatabase,
  OverlaySessionStore,
  type SqliteDatabaseContext,
} from '@buddhalive/backend';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('Milestone S3: Queue, Combo, Anti-Starvation & Crash Recovery Integration', () => {
  let tempBase: string;
  let ctx: SqliteDatabaseContext;
  const testLogger = createLogger('TestS3');

  beforeEach(() => {
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bls-s3-int-'));
    ctx = openSqliteDatabase({ baseDir: tempBase });
  });

  afterEach(() => {
    ctx.close();
    if (fs.existsSync(tempBase)) {
      fs.rmSync(tempBase, { recursive: true, force: true });
    }
  });

  /* -------------------------------------------------------------------------- */
  /* 1. T-07: Crash Recovery & SQLite UNIQUE Deduplication                      */
  /* -------------------------------------------------------------------------- */
  describe('T-07: Crash Recovery & SQLite Deduplication', () => {
    it('automatically transitions DISPATCHED and PLAYING executions to CANCELLED on startup crash recovery', () => {
      const char = ctx.charRepo.getActiveCharacter()!;
      const anim = ctx.charRepo.getAnimationById('anim_sample_pray')!;
      const rule = ctx.ruleRepo.getById('rule_sample_lotus')!;

      // 1. Tạo 4 LiveEvent tương ứng trong DB để thỏa mãn ràng buộc khóa ngoại
      ctx.eventRepo.insert({ id: 'ev_q', source: 'DEMO', eventType: 'GIFT', senderId: 'user_q', senderName: 'Queued User', processStatus: 'RECEIVED', rawPayload: {} });
      ctx.eventRepo.insert({ id: 'ev_d', source: 'DEMO', eventType: 'GIFT', senderId: 'user_d', senderName: 'Dispatched User', processStatus: 'RECEIVED', rawPayload: {} });
      ctx.eventRepo.insert({ id: 'ev_p', source: 'DEMO', eventType: 'GIFT', senderId: 'user_p', senderName: 'Playing User', processStatus: 'RECEIVED', rawPayload: {} });
      ctx.eventRepo.insert({ id: 'ev_c', source: 'DEMO', eventType: 'GIFT', senderId: 'user_c', senderName: 'Completed User', processStatus: 'RECEIVED', rawPayload: {} });

      // Tạo 4 lượt thực thi ở các trạng thái khác nhau
      const now = new Date().toISOString();
      const execQueued = ctx.execRepo.insertQueued({
        liveEventId: 'ev_q',
        giftRuleId: rule.id,
        characterId: char.id,
        animationId: anim.id,
        source: 'DEMO',
        senderId: 'user_q',
        senderName: 'Queued User',
        giftId: 'lotus',
        giftName: 'Hoa Sen',
        mergedGiftCount: 1,
        priority: 10,
        renderedCaption: 'Queued Caption',
        expectedDurationMs: 2000,
        queuedAt: now,
      });

      const execDispatched = ctx.execRepo.insertQueued({
        liveEventId: 'ev_d',
        giftRuleId: rule.id,
        characterId: char.id,
        animationId: anim.id,
        source: 'DEMO',
        senderId: 'user_d',
        senderName: 'Dispatched User',
        giftId: 'lotus',
        giftName: 'Hoa Sen',
        mergedGiftCount: 1,
        priority: 10,
        renderedCaption: 'Dispatched Caption',
        expectedDurationMs: 2000,
        queuedAt: now,
      });
      ctx.execRepo.updateStatus(execDispatched.id, 'DISPATCHED', { dispatchedAt: now });

      const execPlaying = ctx.execRepo.insertQueued({
        liveEventId: 'ev_p',
        giftRuleId: rule.id,
        characterId: char.id,
        animationId: anim.id,
        source: 'DEMO',
        senderId: 'user_p',
        senderName: 'Playing User',
        giftId: 'lotus',
        giftName: 'Hoa Sen',
        mergedGiftCount: 1,
        priority: 10,
        renderedCaption: 'Playing Caption',
        expectedDurationMs: 2000,
        queuedAt: now,
      });
      ctx.execRepo.updateStatus(execPlaying.id, 'PLAYING', { startedAt: now });

      const execCompleted = ctx.execRepo.insertQueued({
        liveEventId: 'ev_c',
        giftRuleId: rule.id,
        characterId: char.id,
        animationId: anim.id,
        source: 'DEMO',
        senderId: 'user_c',
        senderName: 'Completed User',
        giftId: 'lotus',
        giftName: 'Hoa Sen',
        mergedGiftCount: 1,
        priority: 10,
        renderedCaption: 'Completed Caption',
        expectedDurationMs: 2000,
        queuedAt: now,
      });
      ctx.execRepo.updateStatus(execCompleted.id, 'COMPLETED', { finishedAt: now });

      // 2. Đóng kết nối (mô phỏng crash bất thình lình)
      ctx.close();

      // 3. Khởi động lại cơ sở dữ liệu trên cùng thư mục lưu trữ
      const recoveredCtx = openSqliteDatabase({ baseDir: tempBase });

      // Báo cáo Crash Recovery khẳng định đã dọn dẹp đúng 2 bản ghi dở dang
      expect(recoveredCtx.crashRecoveryReport.cancelledCount).toBe(2);
      expect(recoveredCtx.crashRecoveryReport.cancelledIds).toContain(execDispatched.id);
      expect(recoveredCtx.crashRecoveryReport.cancelledIds).toContain(execPlaying.id);
      expect(recoveredCtx.crashRecoveryReport.queuedCount).toBe(1);

      // Xác minh trạng thái chi tiết của từng bản ghi
      const recoveredDispatched = recoveredCtx.execRepo.getById(execDispatched.id)!;
      expect(recoveredDispatched.status).toBe('CANCELLED');
      expect(recoveredDispatched.errorCode).toBe('SERVER_RESTARTED');
      expect(recoveredDispatched.finishedAt).toBeTruthy();

      const recoveredPlaying = recoveredCtx.execRepo.getById(execPlaying.id)!;
      expect(recoveredPlaying.status).toBe('CANCELLED');
      expect(recoveredPlaying.errorCode).toBe('SERVER_RESTARTED');

      // Bản ghi QUEUED được giữ nguyên vẹn
      const recoveredQueued = recoveredCtx.execRepo.getById(execQueued.id)!;
      expect(recoveredQueued.status).toBe('QUEUED');
      expect(recoveredQueued.errorCode).toBeNull();

      // Bản ghi COMPLETED giữ nguyên
      const recoveredCompleted = recoveredCtx.execRepo.getById(execCompleted.id)!;
      expect(recoveredCompleted.status).toBe('COMPLETED');

      recoveredCtx.close();
      // Re-open for afterEach cleanup
      ctx = openSqliteDatabase({ baseDir: tempBase });
    });

    it('enforces SQLite UNIQUE deduplication and correctly handles external_event_id NULL', () => {
      // 1. Chèn sự kiện có externalEventId cụ thể
      const res1 = ctx.eventRepo.insert({
        externalEventId: 'ext_event_100',
        source: 'DEMO',
        eventType: 'GIFT',
        senderId: 'u1',
        senderName: 'User One',
        giftId: 'lotus',
        processStatus: 'RECEIVED',
        rawPayload: {},
      });
      expect(res1.inserted).toBe(true);
      expect(res1.duplicate).toBe(false);

      // 2. Gửi lại cùng source và cùng externalEventId -> bị chặn bởi SQLite UNIQUE
      const res2 = ctx.eventRepo.insert({
        externalEventId: 'ext_event_100',
        source: 'DEMO',
        eventType: 'GIFT',
        senderId: 'u1',
        senderName: 'User One (Duplicate)',
        giftId: 'lotus',
        processStatus: 'RECEIVED',
        rawPayload: {},
      });
      expect(res2.inserted).toBe(false);
      expect(res2.duplicate).toBe(true);
      expect(res2.event.id).toBe(res1.event.id);

      // 3. Chuỗi rỗng, khoảng trắng và null đều chuẩn hóa thành NULL trong SQLite
      const resNull = ctx.eventRepo.insert({
        externalEventId: null,
        source: 'DEMO',
        eventType: 'GIFT',
        senderId: 'u2',
        senderName: 'User Null',
        processStatus: 'RECEIVED',
        rawPayload: {},
      });
      expect(resNull.inserted).toBe(true);
      expect(resNull.duplicate).toBe(false);
      expect(resNull.event.externalEventId).toBeNull();

      const resEmpty = ctx.eventRepo.insert({
        externalEventId: '',
        source: 'DEMO',
        eventType: 'GIFT',
        senderId: 'u3',
        senderName: 'User Empty String',
        processStatus: 'RECEIVED',
        rawPayload: {},
      });
      expect(resEmpty.inserted).toBe(true);
      expect(resEmpty.duplicate).toBe(false);
      expect(resEmpty.event.externalEventId).toBeNull();

      const resSpaces = ctx.eventRepo.insert({
        externalEventId: '   ',
        source: 'DEMO',
        eventType: 'GIFT',
        senderId: 'u4',
        senderName: 'User Spaces',
        processStatus: 'RECEIVED',
        rawPayload: {},
      });
      expect(resSpaces.inserted).toBe(true);
      expect(resSpaces.duplicate).toBe(false);
      expect(resSpaces.event.externalEventId).toBeNull();

      // Cả 3 sự kiện externalEventId = NULL được xử lý độc lập
      expect(resNull.event.id).not.toBe(resEmpty.event.id);
      expect(resEmpty.event.id).not.toBe(resSpaces.event.id);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 2. T-08: ComboBufferService (Cửa sổ cố định 1500ms & Khóa 4 trường)         */
  /* -------------------------------------------------------------------------- */
  describe('T-08: ComboBufferService', () => {
    it('aggregates events within fixed 1500ms window without sliding timer', async () => {
      const char = ctx.charRepo.getActiveCharacter()!;
      const anim = ctx.charRepo.getAnimationById('anim_sample_pray')!;
      const rule = ctx.ruleRepo.getById('rule_sample_lotus')!;

      const flushedCombos: any[] = [];
      // Khởi tạo ComboBufferService với cửa sổ 300ms để kiểm thử nhanh và chính xác
      const comboService = new ComboBufferService({
        windowMs: 300,
        logger: testLogger,
        onComboFlushed: (combo) => {
          flushedCombos.push(combo);
        },
      });

      const e1 = ctx.eventRepo.insert({
        source: 'DEMO',
        eventType: 'GIFT',
        senderId: 'sender_combo',
        senderName: 'Combo Sender',
        giftId: 'lotus',
        giftName: 'Hoa Sen',
        giftCount: 1,
        unitCoinValue: 10,
        totalCoinValue: 10,
        isComboEnd: false,
        processStatus: 'RECEIVED',
        rawPayload: {},
      }).event;

      // Event 1 mở cửa sổ
      const r1 = comboService.pushEvent(e1, rule, char.id, anim.id);
      expect(r1.status).toBe('BUFFERED_FIRST');
      expect(r1.totalGiftCount).toBe(1);

      // Event 2 đến ở t ~ 50ms
      await new Promise((resolve) => setTimeout(resolve, 50));
      const e2 = ctx.eventRepo.insert({
        source: 'DEMO',
        eventType: 'GIFT',
        senderId: 'sender_combo',
        senderName: 'Combo Sender',
        giftId: 'lotus',
        giftName: 'Hoa Sen',
        giftCount: 3,
        unitCoinValue: 10,
        totalCoinValue: 30,
        isComboEnd: false,
        processStatus: 'RECEIVED',
        rawPayload: {},
      }).event;
      const r2 = comboService.pushEvent(e2, rule, char.id, anim.id);
      expect(r2.status).toBe('BUFFERED_SUBSEQUENT');
      expect(r2.totalGiftCount).toBe(4);

      // Event 3 đến ở t ~ 100ms
      await new Promise((resolve) => setTimeout(resolve, 50));
      const e3 = ctx.eventRepo.insert({
        source: 'DEMO',
        eventType: 'GIFT',
        senderId: 'sender_combo',
        senderName: 'Combo Sender',
        giftId: 'lotus',
        giftName: 'Hoa Sen',
        giftCount: 5,
        unitCoinValue: 10,
        totalCoinValue: 50,
        isComboEnd: false,
        processStatus: 'RECEIVED',
        rawPayload: {},
      }).event;
      const r3 = comboService.pushEvent(e3, rule, char.id, anim.id);
      expect(r3.status).toBe('BUFFERED_SUBSEQUENT');
      expect(r3.totalGiftCount).toBe(9);

      // Đợi cửa sổ 300ms ban đầu đóng (tổng thời gian trôi qua ~ 350ms)
      await new Promise((resolve) => setTimeout(resolve, 250));

      // Xác nhận combo đã flush đúng 1 lượt tổng hợp với tổng số quà = 9 (1 + 3 + 5)
      expect(flushedCombos.length).toBe(1);
      expect(flushedCombos[0].totalGiftCount).toBe(9);
      expect(flushedCombos[0].totalCoinValue).toBe(90);
      expect(flushedCombos[0].eventIds).toHaveLength(3);

      // Event 4 đến sau khi cửa sổ cũ đã đóng -> mở một cửa sổ mới hoàn toàn
      const e4 = ctx.eventRepo.insert({
        source: 'DEMO',
        eventType: 'GIFT',
        senderId: 'sender_combo',
        senderName: 'Combo Sender',
        giftId: 'lotus',
        giftName: 'Hoa Sen',
        giftCount: 2,
        unitCoinValue: 10,
        totalCoinValue: 20,
        isComboEnd: false,
        processStatus: 'RECEIVED',
        rawPayload: {},
      }).event;
      const r4 = comboService.pushEvent(e4, rule, char.id, anim.id);
      expect(r4.status).toBe('BUFFERED_FIRST');
      expect(r4.totalGiftCount).toBe(2);

      comboService.destroy();
    });

    it('flushes combo immediately when isComboEnd is true', () => {
      const char = ctx.charRepo.getActiveCharacter()!;
      const anim = ctx.charRepo.getAnimationById('anim_sample_pray')!;
      const rule = ctx.ruleRepo.getById('rule_sample_lotus')!;

      const flushedCombos: any[] = [];
      const comboService = new ComboBufferService({
        windowMs: 5000, // Cửa sổ rất dài
        logger: testLogger,
        onComboFlushed: (combo) => flushedCombos.push(combo),
      });

      const e1 = ctx.eventRepo.insert({
        source: 'DEMO',
        eventType: 'GIFT',
        senderId: 'instant_sender',
        senderName: 'Instant User',
        giftId: 'lotus',
        giftName: 'Hoa Sen',
        giftCount: 4,
        unitCoinValue: 10,
        totalCoinValue: 40,
        isComboEnd: true, // Chốt combo ngay lập tức
        processStatus: 'RECEIVED',
        rawPayload: {},
      }).event;

      const res = comboService.pushEvent(e1, rule, char.id, anim.id);
      expect(res.status).toBe('FLUSHED_IMMEDIATELY');
      expect(flushedCombos).toHaveLength(1);
      expect(flushedCombos[0].totalGiftCount).toBe(4);
      expect(comboService.getActiveBufferCount()).toBe(0);

      comboService.destroy();
    });

    it('isolates combos with different keys (source, senderId, giftId, ruleId)', () => {
      const char = ctx.charRepo.getActiveCharacter()!;
      const anim = ctx.charRepo.getAnimationById('anim_sample_pray')!;
      const rule = ctx.ruleRepo.getById('rule_sample_lotus')!;

      const flushedCombos: any[] = [];
      const comboService = new ComboBufferService({
        windowMs: 200,
        logger: testLogger,
        onComboFlushed: (combo) => flushedCombos.push(combo),
      });

      // User A gửi lotus
      const eA = ctx.eventRepo.insert({
        source: 'DEMO',
        eventType: 'GIFT',
        senderId: 'user_A',
        senderName: 'User A',
        giftId: 'lotus',
        giftCount: 1,
        isComboEnd: false,
        processStatus: 'RECEIVED',
        rawPayload: {},
      }).event;

      // User B gửi lotus
      const eB = ctx.eventRepo.insert({
        source: 'DEMO',
        eventType: 'GIFT',
        senderId: 'user_B',
        senderName: 'User B',
        giftId: 'lotus',
        giftCount: 2,
        isComboEnd: false,
        processStatus: 'RECEIVED',
        rawPayload: {},
      }).event;

      comboService.pushEvent(eA, rule, char.id, anim.id);
      comboService.pushEvent(eB, rule, char.id, anim.id);

      // Phải có 2 buffer song song hoạt động độc lập
      expect(comboService.getActiveBufferCount()).toBe(2);

      comboService.destroy();
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 3. T-09: Hàng đợi 30 QUEUED, COALESCE & VIP Eviction (EVICTED_BY_PRIORITY)   */
  /* -------------------------------------------------------------------------- */
  describe('T-09: Queue Caps, COALESCE & EVICTED_BY_PRIORITY', () => {
    it('coalesces into existing QUEUED execution when per-rule cap (5) is reached', () => {
      const broadcaster = {
        emitToOverlays: () => {},
        emitToManagers: () => {},
        getReadyOverlayCount: () => 0, // Không cho dispatch để giữ trọn trong QUEUED
      };

      const engine = new EventEngine(ctx, broadcaster, testLogger);
      const char = ctx.charRepo.getActiveCharacter()!;
      const anim = ctx.charRepo.getAnimationById('anim_sample_pray')!;
      const rule = ctx.ruleRepo.getById('rule_sample_lotus')!;

      // 1. Chèn 5 lượt QUEUED độc lập từ các sender khác nhau (chạm trần 5/rule)
      for (let i = 1; i <= 5; i++) {
        const ev = ctx.eventRepo.insert({
          source: 'DEMO',
          eventType: 'GIFT',
          senderId: `sender_${i}`,
          senderName: `Sender ${i}`,
          giftId: 'lotus',
          giftName: 'Hoa Sen',
          giftCount: 1,
          processStatus: 'RECEIVED',
          rawPayload: {},
        }).event;

        const res = engine.enqueueExecution({
          liveEvent: ev,
          giftRule: rule,
          characterId: char.id,
          animationId: anim.id,
          mergedGiftCount: 1,
        });
        expect(res.action).toBe('QUEUED');
      }

      expect(ctx.execRepo.getQueuedCount()).toBe(5);
      expect(ctx.execRepo.getQueuedCountByRule(rule.id)).toBe(5);

      // 2. Sender 1 gửi thêm quà -> Khớp COALESCE vào bản ghi của sender 1 đang QUEUED!
      const evCoalesce = ctx.eventRepo.insert({
        source: 'DEMO',
        eventType: 'GIFT',
        senderId: 'sender_1',
        senderName: 'Sender 1',
        giftId: 'lotus',
        giftName: 'Hoa Sen',
        giftCount: 3,
        processStatus: 'RECEIVED',
        rawPayload: {},
      }).event;

      const coalesceRes = engine.enqueueExecution({
        liveEvent: evCoalesce,
        giftRule: rule,
        characterId: char.id,
        animationId: anim.id,
        mergedGiftCount: 3,
      });

      expect(coalesceRes.action).toBe('COALESCED');
      expect(coalesceRes.execution).not.toBeNull();
      // Tổng số lượng quà của Sender 1 tăng lên 1 + 3 = 4
      expect(coalesceRes.execution!.mergedGiftCount).toBe(4);
      expect(coalesceRes.execution!.renderedCaption).toContain('4x Hoa Sen');
      // Tổng số bản ghi QUEUED vẫn giữ nguyên 5 (không tràn queue)
      expect(ctx.execRepo.getQueuedCount()).toBe(5);

      // Trạng thái của live event được cập nhật là COALESCED_INTO_QUEUE
      const reloadedEvent = ctx.eventRepo.getById(evCoalesce.id)!;
      expect(reloadedEvent.processStatus).toBe('COALESCED_INTO_QUEUE');

      // 3. Sender MỚI gửi quà khi rule đã đủ 5 và không có bản ghi nào khớp COALESCE
      const evNewSender = ctx.eventRepo.insert({
        source: 'DEMO',
        eventType: 'GIFT',
        senderId: 'sender_brand_new',
        senderName: 'New Sender',
        giftId: 'lotus',
        giftName: 'Hoa Sen',
        giftCount: 1,
        processStatus: 'RECEIVED',
        rawPayload: {},
      }).event;

      const dropRes = engine.enqueueExecution({
        liveEvent: evNewSender,
        giftRule: rule,
        characterId: char.id,
        animationId: anim.id,
        mergedGiftCount: 1,
      });

      expect(dropRes.action).toBe('DROPPED_RULE_LIMIT');
      expect(dropRes.execution).toBeNull();
      expect(ctx.execRepo.getQueuedCount()).toBe(5);

      engine.destroy();
    });

    it('enforces total queue limit 30 and triggers EVICTED_BY_PRIORITY for VIP events', () => {
      const broadcaster = {
        emitToOverlays: () => {},
        emitToManagers: () => {},
        getReadyOverlayCount: () => 0, // Giữ trong QUEUED
      };

      const engine = new EventEngine(ctx, broadcaster, testLogger);
      const char = ctx.charRepo.getActiveCharacter()!;
      const anim = ctx.charRepo.getAnimationById('anim_sample_pray')!;
      const rule = ctx.ruleRepo.getById('rule_sample_lotus')!;

      // 1. Chèn đủ 30 lượt QUEUED với priority = 10 (trần 30)
      for (let i = 1; i <= 30; i++) {
        const ev = ctx.eventRepo.insert({
          source: 'DEMO',
          eventType: 'GIFT',
          senderId: `bulk_user_${i}`,
          senderName: `Bulk User ${i}`,
          giftId: 'lotus',
          giftName: 'Hoa Sen',
          giftCount: 1,
          processStatus: 'RECEIVED',
          rawPayload: {},
        }).event;

        // Tránh giới hạn rule bằng cách gán gift_rule_id riêng hoặc tăng limit
        const exec = ctx.execRepo.insertQueued({
          liveEventId: ev.id,
          giftRuleId: null, // Quy tắc tự do để test trần tổng 30
          characterId: char.id,
          animationId: anim.id,
          source: 'DEMO',
          senderId: ev.senderId,
          senderName: ev.senderName,
          giftId: ev.giftId,
          giftName: ev.giftName,
          mergedGiftCount: 1,
          priority: 10,
          renderedCaption: 'Bulk Caption',
          expectedDurationMs: 2000,
          queuedAt: new Date(Date.now() - (31 - i) * 1000).toISOString(),
        });
      }

      expect(ctx.execRepo.getQueuedCount()).toBe(30);

      // 2. Sự kiện thường (priority = 10 <= min priority 10) -> Bị từ chối DROPPED_QUEUE_FULL
      const evNormal = ctx.eventRepo.insert({
        source: 'DEMO',
        eventType: 'GIFT',
        senderId: 'normal_user',
        senderName: 'Normal User',
        giftId: 'lotus',
        giftCount: 1,
        processStatus: 'RECEIVED',
        rawPayload: {},
      }).event;

      const normalRes = engine.enqueueExecution({
        liveEvent: evNormal,
        giftRule: { ...rule, priority: 10, maxQueuePerRule: 50 },
        characterId: char.id,
        animationId: anim.id,
        mergedGiftCount: 1,
      });

      expect(normalRes.action).toBe('DROPPED_QUEUE_FULL');
      expect(normalRes.execution).toBeNull();
      expect(ctx.execRepo.getQueuedCount()).toBe(30);

      // 3. Sự kiện VIP (priority = 50 > min priority 10) -> Đẩy lùi phần tử thấp nhất sang EVICTED_BY_PRIORITY
      const evVip = ctx.eventRepo.insert({
        source: 'DEMO',
        eventType: 'GIFT',
        senderId: 'vip_user',
        senderName: 'VIP Sư Huynh',
        giftId: 'lotus',
        giftName: 'Hoa Sen Vàng',
        giftCount: 10,
        processStatus: 'RECEIVED',
        rawPayload: {},
      }).event;

      const vipRes = engine.enqueueExecution({
        liveEvent: evVip,
        giftRule: { ...rule, priority: 50, maxQueuePerRule: 50 },
        characterId: char.id,
        animationId: anim.id,
        mergedGiftCount: 10,
      });

      expect(vipRes.action).toBe('QUEUED');
      expect(vipRes.execution).not.toBeNull();
      expect(vipRes.execution!.priority).toBe(50);
      expect(vipRes.evictedExecution).not.toBeNull();

      // Phần tử bị đẩy có trạng thái EVICTED_BY_PRIORITY
      const evictedRecord = ctx.execRepo.getById(vipRes.evictedExecution!.id)!;
      expect(evictedRecord.status).toBe('EVICTED_BY_PRIORITY');
      expect(evictedRecord.finishedAt).toBeTruthy();

      // Tổng số lượng QUEUED vẫn duy trì chính xác 30 (bảo toàn trần 30/30)
      expect(ctx.execRepo.getQueuedCount()).toBe(30);

      engine.destroy();
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 4. T-09: Chống Đói (Anti-Starvation) trên tập QUEUED                       */
  /* -------------------------------------------------------------------------- */
  describe('T-09: Anti-Starvation Rule on QUEUED Executions', () => {
    it('dispatches the oldest queued execution after 3 consecutive high-priority dispatches if waiting >= threshold', () => {
      let dispatchedExecutionId: string | null = null;
      const broadcaster = {
        emitToOverlays: (ev: string, payload: any) => {
          if (ev === 'overlay:execute_action') {
            dispatchedExecutionId = payload.executionId;
          }
        },
        emitToManagers: () => {},
        getReadyOverlayCount: () => 1, // Overlay sẵn sàng
      };

      const engine = new EventEngine(ctx, broadcaster, testLogger, {
        starvationThresholdMs: 200, // Đặt 200ms để test chống đói chính xác
        maxConsecutiveHighPriority: 3,
        highPriorityThreshold: 20,
      });
      engine.setOverlayReady(true);

      const char = ctx.charRepo.getActiveCharacter()!;
      const anim = ctx.charRepo.getAnimationById('anim_sample_pray')!;

      // 1. Chèn 1 lượt thường (priority = 10) đã chờ trong quá khứ (> 250ms trước)
      ctx.eventRepo.insert({ id: 'ev_starved', source: 'DEMO', eventType: 'GIFT', senderId: 'starved_user', senderName: 'Starved User', processStatus: 'RECEIVED', rawPayload: {} });
      const pastTime = new Date(Date.now() - 300).toISOString();
      const starvedExec = ctx.execRepo.insertQueued({
        liveEventId: 'ev_starved',
        giftRuleId: null,
        characterId: char.id,
        animationId: anim.id,
        source: 'DEMO',
        senderId: 'starved_user',
        senderName: 'Starved User',
        giftId: 'lotus',
        giftName: 'Hoa Sen',
        mergedGiftCount: 1,
        priority: 10,
        renderedCaption: 'Starved Caption',
        expectedDurationMs: 1000,
        queuedAt: pastTime,
      });

      // 2. Chèn 4 lượt VIP (priority = 50)
      const vipExecs: any[] = [];
      for (let i = 1; i <= 4; i++) {
        ctx.eventRepo.insert({ id: `ev_vip_${i}`, source: 'DEMO', eventType: 'GIFT', senderId: `vip_${i}`, senderName: `VIP ${i}`, processStatus: 'RECEIVED', rawPayload: {} });
        const vip = ctx.execRepo.insertQueued({
          liveEventId: `ev_vip_${i}`,
          giftRuleId: null,
          characterId: char.id,
          animationId: anim.id,
          source: 'DEMO',
          senderId: `vip_${i}`,
          senderName: `VIP ${i}`,
          giftId: 'lotus',
          giftName: 'Hoa Sen',
          mergedGiftCount: 1,
          priority: 50,
          renderedCaption: `VIP ${i} Caption`,
          expectedDurationMs: 1000,
          queuedAt: new Date().toISOString(),
        });
        vipExecs.push(vip);
      }

      // Giả lập Overlay đã chạy xong lượt VIP 1
      engine.tryDispatchNext();
      expect(dispatchedExecutionId).toBe(vipExecs[0].id);
      expect(engine.consecutiveHighPriorityDispatches).toBe(1);

      engine.handleExecutionCompleted({
        executionId: vipExecs[0].id,
        completionMode: 'PRIMARY_3D',
        actualDurationMs: 500,
      });

      // Lượt VIP 2
      expect(dispatchedExecutionId).toBe(vipExecs[1].id);
      expect(engine.consecutiveHighPriorityDispatches).toBe(2);

      engine.handleExecutionCompleted({
        executionId: vipExecs[1].id,
        completionMode: 'PRIMARY_3D',
        actualDurationMs: 500,
      });

      // Lượt VIP 3 (hoàn thành chuỗi 3 lượt ưu tiên cao liên tiếp!)
      expect(dispatchedExecutionId).toBe(vipExecs[2].id);
      expect(engine.consecutiveHighPriorityDispatches).toBe(3);

      engine.handleExecutionCompleted({
        executionId: vipExecs[2].id,
        completionMode: 'PRIMARY_3D',
        actualDurationMs: 500,
      });

      // Lượt thứ 4: Thay vì chọn VIP 4 (priority 50), quy tắc CHỐNG ĐÓI kích hoạt
      // rút bản ghi chờ lâu nhất (starvedExec với priority 10) ra phát!
      expect(dispatchedExecutionId).toBe(starvedExec.id);
      expect(engine.consecutiveHighPriorityDispatches).toBe(0); // Bộ đếm được reset về 0

      engine.destroy();
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 5. Concurrency Safety: Rapid Concurrent Ingestion                           */
  /* -------------------------------------------------------------------------- */
  describe('Concurrency Safety', () => {
    it('maintains queue cap integrity under rapid concurrent insertions', async () => {
      const broadcaster = {
        emitToOverlays: () => {},
        emitToManagers: () => {},
        getReadyOverlayCount: () => 0,
      };

      const engine = new EventEngine(ctx, broadcaster, testLogger);
      const char = ctx.charRepo.getActiveCharacter()!;
      const anim = ctx.charRepo.getAnimationById('anim_sample_pray')!;
      const rule = ctx.ruleRepo.getById('rule_sample_lotus')!;

      // Bắn 40 sự kiện đồng thời
      const promises = Array.from({ length: 40 }).map((_, idx) => {
        return Promise.resolve().then(() => {
          const ev = ctx.eventRepo.insert({
            source: 'DEMO',
            eventType: 'GIFT',
            senderId: `concurrent_user_${idx}`,
            senderName: `Concurrent User ${idx}`,
            giftId: 'lotus',
            giftName: 'Hoa Sen',
            giftCount: 1,
            processStatus: 'RECEIVED',
            rawPayload: {},
          }).event;

          return engine.enqueueExecution({
            liveEvent: ev,
            giftRule: { ...rule, priority: 10 + (idx % 20), maxQueuePerRule: 100 },
            characterId: char.id,
            animationId: anim.id,
            mergedGiftCount: 1,
          });
        });
      });

      await Promise.all(promises);

      // Tổng số bản ghi QUEUED tuyệt đối không bao giờ vượt quá 30
      const queuedTotal = ctx.execRepo.getQueuedCount();
      expect(queuedTotal).toBeLessThanOrEqual(30);

      engine.destroy();
    });
  });
});
