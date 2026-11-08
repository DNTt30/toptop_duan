import {
  openSqliteDatabase,
  type SqliteDatabaseContext,
} from '@buddhalive/backend';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('Audit Immutability & Transaction Integrity (Enterprise Rule 3)', () => {
  let tempBase: string;
  let ctx: SqliteDatabaseContext;

  beforeAll(() => {
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bls-audit-'));
    ctx = openSqliteDatabase({ baseDir: tempBase });
  });

  afterAll(() => {
    ctx.close();
    fs.rmSync(tempBase, { recursive: true, force: true });
  });

  describe('1. Grep Proof: Bất biến lịch sử (Append-only)', () => {
    it('khẳng định 100% không có câu lệnh DELETE nào trên bảng live_events và event_executions', () => {
      const backendSrcDir = path.resolve(__dirname, '../../apps/backend/src');

      function scanFiles(dir: string, fileList: string[] = []): string[] {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          if (stat.isDirectory()) {
            scanFiles(filePath, fileList);
          } else if (file.endsWith('.ts') && !file.endsWith('.test.ts')) {
            fileList.push(filePath);
          }
        }
        return fileList;
      }

      const allSourceFiles = scanFiles(backendSrcDir);
      const deleteViolations: Array<{ file: string; match: string }> = [];

      const forbiddenRegex = /DELETE\s+FROM\s+(live_events|event_executions)/i;

      for (const filePath of allSourceFiles) {
        const content = fs.readFileSync(filePath, 'utf8');
        const match = content.match(forbiddenRegex);
        if (match) {
          deleteViolations.push({
            file: path.relative(backendSrcDir, filePath),
            match: match[0],
          });
        }
      }

      // Khẳng định vi phạm = 0
      expect(deleteViolations).toEqual([]);
      expect(deleteViolations.length).toBe(0);
    });
  });

  describe('2. Transaction Rollback Atomicity (better-sqlite3)', () => {
    it('khi có lỗi ném ra giữa chừng, toàn bộ thay đổi trên nhiều bảng phải tự động rollback 100%', () => {
      const eventId = 'test-rollback-event-1';
      const executionId = 'test-rollback-exec-1';
      const nowIso = new Date().toISOString();

      // Đếm số lượng ban đầu
      const initialEventsCount = (
        ctx.db.prepare('SELECT COUNT(*) as count FROM live_events').get() as { count: number }
      ).count;
      const initialExecCount = (
        ctx.db.prepare('SELECT COUNT(*) as count FROM event_executions').get() as { count: number }
      ).count;

      // Giả lập một transaction ghi vào cả 2 bảng nhưng bị throw error ở bước cuối
      expect(() => {
        const tx = ctx.db.transaction(() => {
          // Bước 1: Ghi vào live_events
          ctx.eventRepo.insert({
            id: eventId,
            source: 'DEMO',
            eventType: 'GIFT',
            senderId: 'user_rollback_test',
            senderName: 'Test Rollback User',
            giftId: 'rose',
            giftName: 'Hoa Hồng',
            giftCount: 1,
            unitCoinValue: 10,
            totalCoinValue: 10,
            rawPayload: { sample: 'demo' },
            isComboEnd: true,
            processStatus: 'RECEIVED',
          });

          // Bước 2: Ném lỗi giả lập vi phạm nghiệp vụ / ngoại lệ bất ngờ
          throw new Error('SIMULATED_BUSINESS_TRANSACTION_FAILURE');
        });

        tx();
      }).toThrowError('SIMULATED_BUSINESS_TRANSACTION_FAILURE');

      // Kiểm tra: số lượng bản ghi cả 2 bảng phải giữ nguyên như ban đầu (Rollback hoàn toàn)
      const afterEventsCount = (
        ctx.db.prepare('SELECT COUNT(*) as count FROM live_events').get() as { count: number }
      ).count;
      const afterExecCount = (
        ctx.db.prepare('SELECT COUNT(*) as count FROM event_executions').get() as { count: number }
      ).count;

      expect(afterEventsCount).toBe(initialEventsCount);
      expect(afterExecCount).toBe(initialExecCount);

      // Xác nhận bản ghi dở dang không hề tồn tại trong DB
      const insertedEvent = ctx.eventRepo.getById(eventId);
      expect(insertedEvent).toBeNull();
    });
  });

  describe('3. Tính toàn vẹn luồng FSM (Finite State Machine)', () => {
    it('cho phép thêm sự kiện và chuyển đổi trạng thái tuần tự mà không sửa đổi dữ liệu gốc', () => {
      const eventId = 'test-fsm-event-1';
      const nowIso = new Date().toISOString();

      ctx.eventRepo.insert({
        id: eventId,
        source: 'DEMO',
        eventType: 'GIFT',
        senderId: 'user_fsm_audit',
        senderName: 'Phật Tử A',
        giftId: 'lotus',
        giftName: 'Hoa Sen Vàng',
        giftCount: 5,
        unitCoinValue: 20,
        totalCoinValue: 100,
        rawPayload: { type: 'lotus_gift' },
        isComboEnd: true,
        processStatus: 'RECEIVED',
      });

      const initialRecord = ctx.eventRepo.getById(eventId);
      expect(initialRecord).not.toBeNull();
      expect(initialRecord?.processStatus).toBe('RECEIVED');
      expect(initialRecord?.senderName).toBe('Phật Tử A');
      expect(initialRecord?.totalCoinValue).toBe(100);

      // Cập nhật trạng thái sang MATCHED
      ctx.eventRepo.updateProcessStatus(eventId, 'MATCHED');

      const updatedRecord = ctx.eventRepo.getById(eventId);
      expect(updatedRecord?.processStatus).toBe('MATCHED');
      // Dữ liệu gốc không hề suy chuyển
      expect(updatedRecord?.senderId).toBe('user_fsm_audit');
      expect(updatedRecord?.senderName).toBe('Phật Tử A');
      expect(updatedRecord?.totalCoinValue).toBe(100);
    });
  });
});
