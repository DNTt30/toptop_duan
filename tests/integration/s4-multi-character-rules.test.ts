import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  openSqliteDatabase,
  type SqliteDatabaseContext,
  AssetService,
  EventEngine,
  type EngineEventBroadcaster,
  createLogger,
} from '@buddhalive/backend';
import type { OverlayExecuteActionPayload, ManagerStateSnapshot } from '@buddhalive/shared';

describe('Milestone S4: Multi-Character Management, Animation, Gift Rules & Invariants', () => {
  let testBaseDir: string;
  let ctx: SqliteDatabaseContext;
  const testLogger = createLogger('TestS4', () => {});

  const fixturesDir = path.resolve(__dirname, '..', 'fixtures', 'assets');
  const sampleGlbPath = path.join(fixturesDir, 'sample-character.glb');

  beforeEach(() => {
    testBaseDir = path.join(os.tmpdir(), `bls-s4-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    ctx = openSqliteDatabase({ baseDir: testBaseDir });
  });

  afterEach(() => {
    try {
      ctx.close();
    } catch {}
    if (fs.existsSync(testBaseDir)) {
      try {
        fs.rmSync(testBaseDir, { recursive: true, force: true });
      } catch {}
    }
  });

  /* -------------------------------------------------------------------------- */
  /* 1. Multi-Character Management & Single Active Enforcement (T-10, T-11)    */
  /* -------------------------------------------------------------------------- */
  describe('T-10 & T-11: Multi-Character Management', () => {
    it('manages multiple characters and strictly enforces exactly 1 active character', () => {
      // 1. Kiểm tra nhân vật mặc định ban đầu
      const initialChars = ctx.charRepo.listAll();
      expect(initialChars.length).toBeGreaterThanOrEqual(1);
      const activeInitial = ctx.charRepo.getActiveCharacter();
      expect(activeInitial).not.toBeNull();
      expect(activeInitial?.isActive).toBe(true);

      // 2. Thêm nhân vật thứ 2 (chưa active)
      const char2 = ctx.charRepo.create({
        name: 'Quan Thế Âm Bồ Tát',
        slug: 'quan-the-am',
        modelPath: 'quanam.glb',
        scale: 1.2,
        isActive: false,
      });

      expect(char2.id).toBeDefined();
      expect(char2.isActive).toBe(false);
      expect(ctx.charRepo.getActiveCharacter()?.id).toBe(activeInitial?.id);

      // 3. Kích hoạt nhân vật thứ 2
      const activatedChar2 = ctx.charRepo.setActive(char2.id);
      expect(activatedChar2).not.toBeNull();
      expect(activatedChar2?.isActive).toBe(true);

      // Xác minh trong DB: nhân vật 2 là active duy nhất, nhân vật cũ đã bị tắt active
      const currentActive = ctx.charRepo.getActiveCharacter();
      expect(currentActive?.id).toBe(char2.id);

      const oldChar = ctx.charRepo.getById(activeInitial!.id);
      expect(oldChar?.isActive).toBe(false);

      // 4. Kiểm tra xóa nhân vật: Chặn xóa nhân vật đang Active
      const deleteActiveRes = ctx.charRepo.delete(char2.id);
      expect(deleteActiveRes.ok).toBe(false);
      expect(deleteActiveRes.error).toBe('CANNOT_DELETE_ACTIVE_CHARACTER');

      // 5. Chuyển active lại nhân vật 1 và xóa nhân vật 2
      ctx.charRepo.setActive(activeInitial!.id);
      const deleteInactiveRes = ctx.charRepo.delete(char2.id);
      expect(deleteInactiveRes.ok).toBe(true);
      expect(ctx.charRepo.getById(char2.id)).toBeNull();
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 2. GLB Parsing & AnimationClip Extractor via AssetService (T-10)          */
  /* -------------------------------------------------------------------------- */
  describe('T-10: AssetService & GLB Binary Extraction', () => {
    it('validates binary GLB magic bytes and extracts animation clip names', () => {
      const assetService = new AssetService(ctx.paths.assetsDir);
      const fileBuffer = fs.readFileSync(sampleGlbPath);

      const saveRes = assetService.saveGlbAsset(fileBuffer, 'sample-character.glb');
      expect(saveRes.ok).toBe(true);
      expect(saveRes.fileName).toBeDefined();
      expect(saveRes.clipNames).toEqual(['Pray']);

      // Kiểm tra inspect tệp đã lưu
      const inspectRes = assetService.inspectGlbAsset(saveRes.fileName!);
      expect(inspectRes.ok).toBe(true);
      expect(inspectRes.clipNames).toEqual(['Pray']);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 3. Animation Management & Foreign Key RESTRICT Invariant (T-12)           */
  /* -------------------------------------------------------------------------- */
  describe('T-12: Animation Management & Delete Protection', () => {
    it('creates animation and blocks deletion when referenced by gift rules (ON DELETE RESTRICT)', () => {
      const char = ctx.charRepo.getActiveCharacter()!;

      // 1. Tạo animation mới cho nhân vật
      const anim = ctx.animRepo.create({
        characterId: char.id,
        name: 'Đảnh Lễ Tam Bảo',
        clipName: 'Pray',
        category: 'REACTION',
        durationMs: 3500,
        loopMode: 'ONCE',
      });

      expect(anim.id).toBeDefined();
      expect(anim.clipName).toBe('Pray');

      // 2. Tạo một Gift Rule tham chiếu đến animation này
      const rule = ctx.ruleRepo.create({
        name: 'Quy tắc Quà Test Đảnh Lễ',
        characterId: char.id,
        animationId: anim.id,
        triggerGiftId: 'lotus_vip',
        minGiftCount: 5,
        priority: 25,
      });

      expect(rule.id).toBeDefined();

      // 3. Thử xóa animation đang được rule tham chiếu -> Phải bị chặn với thông báo rõ ràng
      const deleteRes = ctx.animRepo.delete(anim.id);
      expect(deleteRes.ok).toBe(false);
      expect(deleteRes.error).toBe('ANIMATION_REFERENCED_BY_GIFT_RULES');
      expect(deleteRes.referencedRulesCount).toBe(1);

      // 4. Xóa gift rule trước, sau đó xóa animation thành công
      ctx.ruleRepo.delete(rule.id);
      const deleteSuccessRes = ctx.animRepo.delete(anim.id);
      expect(deleteSuccessRes.ok).toBe(true);
      expect(ctx.animRepo.getById(anim.id)).toBeNull();
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 4. Gift Rule Update Invariant: PLAYING Executions Remain Unaffected (T-13)  */
  /* -------------------------------------------------------------------------- */
  describe('T-13: Immutable PLAYING Execution Invariant upon Rule Update', () => {
    it('does NOT modify or interrupt currently PLAYING execution when gift rule is updated', () => {
      let dispatchedPayload: OverlayExecuteActionPayload | null = null;
      const broadcaster: EngineEventBroadcaster = {
        emitToOverlays: (_event: string, payload: unknown) => {
          if (_event === 'overlay:execute_action') {
            dispatchedPayload = payload as OverlayExecuteActionPayload;
          }
        },
        emitToManagers: () => {},
        getReadyOverlayCount: () => 1,
      };

      const engine = new EventEngine(ctx, broadcaster, testLogger);
      engine.setOverlayReady(true);
      const char = ctx.charRepo.getActiveCharacter()!;
      const anim = ctx.charRepo.getAnimationById('anim_sample_pray')!;

      // 1. Tạo Gift Rule ban đầu với comboTriggerMode EACH_EVENT để phát ngay lập tức
      const rule = ctx.ruleRepo.create({
        name: 'Quy tắc Gốc Ban Đầu',
        characterId: char.id,
        animationId: anim.id,
        triggerGiftId: 'immutability_test_gift',
        minGiftCount: 1,
        comboTriggerMode: 'EACH_EVENT',
        priority: 20,
        overlayTextTemplate: 'GỐC: {senderName} đã gửi {giftCount}x {giftName}',
      });

      // 2. Kích hoạt sự kiện quà khớp với rule này
      const triggerRes = engine.handleIncomingLiveEvent({
        source: 'DEMO',
        eventType: 'GIFT',
        senderId: 'user_immutable',
        senderName: 'Người Thí Chủ',
        giftId: 'immutability_test_gift',
        giftName: 'Hoa Sen Vàng',
        giftCount: 1,
        unitCoinValue: 50,
      });

      expect(triggerRes.processStatus).toBe('MATCHED');
      expect(dispatchedPayload).not.toBeNull();
      expect((dispatchedPayload as any).caption).toBe('GỐC: Người Thí Chủ đã gửi 1x Hoa Sen Vàng');
      expect((dispatchedPayload as any).expectedDurationMs).toBe(anim.durationMs);

      // Đánh dấu execution chuyển sang trạng thái PLAYING
      engine.handleExecutionStarted({ executionId: (dispatchedPayload as any).executionId });
      const currentActive = ctx.execRepo.getActiveExecution();
      expect(currentActive?.status).toBe('PLAYING');
      expect(currentActive?.renderedCaption).toBe('GỐC: Người Thí Chủ đã gửi 1x Hoa Sen Vàng');

      // 3. ADMIN CẬP NHẬT GIFT RULE trong khi Execution đang PLAYING
      const updatedRule = ctx.ruleRepo.update(rule.id, {
        name: 'Quy tắc Mới Đã Sửa',
        priority: 90,
        overlayTextTemplate: 'ĐÃ SỬA: {senderName} cúng dường {giftCount} {giftName} VIP',
      });
      expect(updatedRule?.priority).toBe(90);

      // 4. KIỂM CHỨNG BẤT BIẾN (INVARIANT):
      // Execution đang PLAYING tuyệt đối không bị thay đổi caption, priority hay duration!
      const playingExec = ctx.execRepo.getActiveExecution();
      expect(playingExec?.id).toBe(currentActive?.id);
      expect(playingExec?.status).toBe('PLAYING');
      expect(playingExec?.renderedCaption).toBe('GỐC: Người Thí Chủ đã gửi 1x Hoa Sen Vàng');
      expect(playingExec?.priority).toBe(20); // Vẫn là priority ban đầu 20, không bị đổi thành 90!

      // 5. Kết thúc lượt chơi hiện tại
      engine.handleExecutionCompleted({
        executionId: playingExec!.id,
        completionMode: 'PRIMARY_3D',
        actualDurationMs: 2000,
      });

      // 6. Sự kiện TIẾP THEO mới áp dụng cấu hình quy tắc mới
      let secondPayload: OverlayExecuteActionPayload | null = null;
      broadcaster.emitToOverlays = (_event: string, payload: unknown) => {
        if (_event === 'overlay:execute_action') {
          secondPayload = payload as OverlayExecuteActionPayload;
        }
      };

      engine.handleIncomingLiveEvent({
        source: 'DEMO',
        eventType: 'GIFT',
        senderId: 'user_second',
        senderName: 'Phật Tử Thứ Hai',
        giftId: 'immutability_test_gift',
        giftName: 'Hoa Sen Vàng',
        giftCount: 2,
        unitCoinValue: 50,
      });

      expect(secondPayload).not.toBeNull();
      expect((secondPayload as any).caption).toBe('ĐÃ SỬA: Phật Tử Thứ Hai cúng dường 2 Hoa Sen Vàng VIP');

      engine.destroy();
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 5. Crash Recovery during COMBO_MERGE 1500ms Window (S4 Technical Check)   */
  /* -------------------------------------------------------------------------- */
  describe('S4 Technical Check: Crash Recovery in COMBO_MERGE 1500ms Window', () => {
    it('recovers unexecuted combo events without loss or duplicate executions on server restart', () => {
      // 1. Chèn sự kiện đầu tiên vào live_events với process_status = 'RECEIVED'
      const ev1 = ctx.eventRepo.insert({
        source: 'DEMO',
        eventType: 'GIFT',
        senderId: 'donor_combo_crash',
        senderName: 'Thí Chủ Gặp Crash',
        giftId: 'lotus',
        giftName: 'Hoa Sen',
        giftCount: 3,
        totalCoinValue: 30,
        processStatus: 'RECEIVED',
        rawPayload: { note: 'event 1' },
        receivedAt: new Date(Date.now() - 500).toISOString(),
      }).event;

      // 2. Chèn sự kiện thứ 2 trong combo 1500ms với status = 'IGNORED_COMBO_BUFFERING'
      const ev2 = ctx.eventRepo.insert({
        source: 'DEMO',
        eventType: 'GIFT',
        senderId: 'donor_combo_crash',
        senderName: 'Thí Chủ Gặp Crash',
        giftId: 'lotus',
        giftName: 'Hoa Sen',
        giftCount: 4,
        totalCoinValue: 40,
        processStatus: 'IGNORED_COMBO_BUFFERING',
        rawPayload: { note: 'event 2' },
        receivedAt: new Date().toISOString(),
      }).event;

      // Giả lập SERVER CRASH trước khi timer 1500ms kịp flush!
      // Không có bản ghi nào trong event_executions cho 2 live_event này.
      expect(ctx.execRepo.getQueuedCount()).toBe(0);

      // Đóng database để mô phỏng crash hoàn toàn
      ctx.close();

      // 3. KHỞI ĐỘNG LẠI SERVER (SERVER RESTARTS)
      const restartedCtx = openSqliteDatabase({ baseDir: testBaseDir });
      ctx = restartedCtx; // Cho phép afterEach đóng restartedCtx an toàn

      // Báo cáo Crash Recovery khi mở DB phải phát hiện và phục hồi combo
      expect(restartedCtx.crashRecoveryReport.recoveredEventsCount).toBe(2);
      expect(restartedCtx.crashRecoveryReport.recoveredExecutionsCount).toBe(1);

      // Kiểm tra execution đã được tạo ở trạng thái QUEUED với số lượng gộp bảo toàn (3 + 4 = 7)
      const queuedExecs = restartedCtx.execRepo.getNextQueued();
      expect(queuedExecs).not.toBeNull();
      expect(queuedExecs?.senderName).toBe('Thí Chủ Gặp Crash');
      expect(queuedExecs?.mergedGiftCount).toBe(7); // 3 + 4 quà!
      expect(queuedExecs?.status).toBe('QUEUED');
      expect(queuedExecs?.renderedCaption).toContain('7x Hoa Sen');

      // Kiểm tra trạng thái trong live_events: ev1 là MATCHED, ev2 là COALESCED_INTO_QUEUE
      const recoveredEv1 = restartedCtx.eventRepo.getById(ev1.id);
      expect(recoveredEv1?.processStatus).toBe('MATCHED');

      const recoveredEv2 = restartedCtx.eventRepo.getById(ev2.id);
      expect(recoveredEv2?.processStatus).toBe('COALESCED_INTO_QUEUE');

      // 4. Khởi động lại LẦN NỮA: Tuyệt đối không tạo bản ghi trùng lặp!
      restartedCtx.close();
      const secondRestartCtx = openSqliteDatabase({ baseDir: testBaseDir });
      ctx = secondRestartCtx;
      expect(secondRestartCtx.crashRecoveryReport.recoveredEventsCount).toBe(0);
      expect(secondRestartCtx.crashRecoveryReport.recoveredExecutionsCount).toBe(0);
      expect(secondRestartCtx.execRepo.getQueuedCount()).toBe(1); // Vẫn chỉ là 1 execution duy nhất
    });
  });
});
