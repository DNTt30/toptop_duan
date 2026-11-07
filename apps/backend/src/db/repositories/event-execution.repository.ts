import {
  type EventSource,
  type ExecutionErrorCode,
  type ExecutionStatus,
  type ExecutionSummary,
} from '@buddhalive/shared';
import type Database from 'better-sqlite3';
import crypto from 'node:crypto';

export interface CreateExecutionParams {
  id?: string;
  liveEventId: string;
  giftRuleId: string | null;
  characterId: string;
  animationId: string;
  source: EventSource;
  senderId: string;
  senderName: string;
  giftId: string | null;
  giftName: string | null;
  mergedGiftCount?: number;
  priority: number;
  renderedCaption: string;
  expectedDurationMs: number;
  queuedAt?: string;
}

export interface EventExecutionEntity {
  id: string;
  liveEventId: string;
  giftRuleId: string | null;
  characterId: string;
  animationId: string;
  source: EventSource;
  senderId: string;
  senderName: string;
  giftId: string | null;
  giftName: string | null;
  mergedGiftCount: number;
  priority: number;
  status: ExecutionStatus;
  renderedCaption: string;
  expectedDurationMs: number;
  queuedAt: string;
  dispatchedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

interface RawExecutionRow {
  id: string;
  live_event_id: string;
  gift_rule_id: string | null;
  character_id: string;
  animation_id: string;
  source: string;
  sender_id: string;
  sender_name: string;
  gift_id: string | null;
  gift_name: string | null;
  merged_gift_count: number;
  priority: number;
  status: string;
  rendered_caption: string;
  expected_duration_ms: number;
  queued_at: string;
  dispatched_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  error_code: string | null;
  error_message: string | null;
}

function mapExecutionRow(row: RawExecutionRow): EventExecutionEntity {
  return {
    id: row.id,
    liveEventId: row.live_event_id,
    giftRuleId: row.gift_rule_id,
    characterId: row.character_id,
    animationId: row.animation_id,
    source: row.source as EventSource,
    senderId: row.sender_id,
    senderName: row.sender_name,
    giftId: row.gift_id,
    giftName: row.gift_name,
    mergedGiftCount: row.merged_gift_count,
    priority: row.priority,
    status: row.status as ExecutionStatus,
    renderedCaption: row.rendered_caption,
    expectedDurationMs: row.expected_duration_ms,
    queuedAt: row.queued_at,
    dispatchedAt: row.dispatched_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    errorCode: row.error_code,
    errorMessage: row.error_message,
  };
}

export function toExecutionSummary(entity: EventExecutionEntity): ExecutionSummary {
  return {
    id: entity.id,
    liveEventId: entity.liveEventId,
    source: entity.source,
    senderName: entity.senderName,
    giftName: entity.giftName,
    mergedGiftCount: entity.mergedGiftCount,
    status: entity.status,
    caption: entity.renderedCaption,
    queuedAt: entity.queuedAt,
    finishedAt: entity.finishedAt,
    errorCode: entity.errorCode,
  };
}

export class EventExecutionRepository {
  constructor(private readonly db: Database.Database) {}

  public insertQueued(params: CreateExecutionParams): EventExecutionEntity {
    const id = params.id ?? crypto.randomUUID();
    const queuedAt = params.queuedAt ?? new Date().toISOString();
    const mergedGiftCount = params.mergedGiftCount ?? 1;

    this.db.prepare(`
      INSERT INTO event_executions (
        id, live_event_id, gift_rule_id, character_id, animation_id,
        source, sender_id, sender_name, gift_id, gift_name,
        merged_gift_count, priority, status, rendered_caption,
        expected_duration_ms, queued_at
      ) VALUES (
        @id, @liveEventId, @giftRuleId, @characterId, @animationId,
        @source, @senderId, @senderName, @giftId, @giftName,
        @mergedGiftCount, @priority, 'QUEUED', @renderedCaption,
        @expectedDurationMs, @queuedAt
      )
    `).run({
      id,
      liveEventId: params.liveEventId,
      giftRuleId: params.giftRuleId,
      characterId: params.characterId,
      animationId: params.animationId,
      source: params.source,
      senderId: params.senderId,
      senderName: params.senderName,
      giftId: params.giftId,
      giftName: params.giftName,
      mergedGiftCount,
      priority: params.priority,
      renderedCaption: params.renderedCaption,
      expectedDurationMs: params.expectedDurationMs,
      queuedAt,
    });

    const inserted = this.getById(id);
    if (!inserted) throw new Error(`Failed to retrieve inserted execution ${id}`);
    return inserted;
  }

  public getById(id: string): EventExecutionEntity | null {
    const row = this.db
      .prepare('SELECT * FROM event_executions WHERE id = ?')
      .get(id) as RawExecutionRow | undefined;
    return row ? mapExecutionRow(row) : null;
  }

  public getQueuedCount(): number {
    const res = this.db
      .prepare("SELECT count(*) as total FROM event_executions WHERE status = 'QUEUED'")
      .get() as { total: number };
    return res.total;
  }

  public getQueuedCountByRule(giftRuleId: string): number {
    const res = this.db
      .prepare(
        "SELECT count(*) as total FROM event_executions WHERE status = 'QUEUED' AND gift_rule_id = ?"
      )
      .get(giftRuleId) as { total: number };
    return res.total;
  }

  /**
   * Tìm bản ghi QUEUED khớp khóa COALESCE 4 trường: (gift_rule_id, source, sender_id, gift_id)
   * Tuyệt đối không tìm các bản ghi DISPATCHED hoặc PLAYING.
   */
  public findQueuedByCoalesceKey(
    giftRuleId: string,
    source: EventSource,
    senderId: string,
    giftId: string | null
  ): EventExecutionEntity | null {
    const row = this.db
      .prepare(`
        SELECT * FROM event_executions
        WHERE status = 'QUEUED'
          AND gift_rule_id = ?
          AND source = ?
          AND sender_id = ?
          AND (gift_id = ? OR (gift_id IS NULL AND ? IS NULL))
        ORDER BY queued_at ASC
        LIMIT 1
      `)
      .get(giftRuleId, source, senderId, giftId, giftId) as RawExecutionRow | undefined;
    return row ? mapExecutionRow(row) : null;
  }

  /**
   * Cộng dồn số quà và cập nhật caption cho bản ghi QUEUED (COALESCE).
   * Giữ nguyên vị trí hàng đợi (queued_at không đổi).
   */
  public coalesceIntoQueued(
    id: string,
    additionalGiftCount: number,
    updatedCaption: string
  ): EventExecutionEntity | null {
    this.db
      .prepare(`
        UPDATE event_executions
        SET merged_gift_count = merged_gift_count + ?,
            rendered_caption = ?
        WHERE id = ? AND status = 'QUEUED'
      `)
      .run(additionalGiftCount, updatedCaption, id);
    return this.getById(id);
  }

  /**
   * Tìm phần tử QUEUED có ưu tiên thấp nhất để VIP đẩy (EVICTED_BY_PRIORITY).
   * Nếu hòa ưu tiên, chọn phần tử vào muộn nhất (queued_at DESC).
   */
  public findLowestPriorityQueued(): EventExecutionEntity | null {
    const row = this.db
      .prepare(`
        SELECT * FROM event_executions
        WHERE status = 'QUEUED'
        ORDER BY priority ASC, queued_at DESC
        LIMIT 1
      `)
      .get() as RawExecutionRow | undefined;
    return row ? mapExecutionRow(row) : null;
  }

  /**
   * Đẩy lùi bản ghi QUEUED sang trạng thái EVICTED_BY_PRIORITY
   */
  public evictByPriority(
    id: string,
    finishedAtIso = new Date().toISOString(),
    errorMessage = 'Evicted by higher priority VIP execution'
  ): EventExecutionEntity | null {
    this.db
      .prepare(`
        UPDATE event_executions
        SET status = 'EVICTED_BY_PRIORITY',
            finished_at = ?,
            error_message = ?
        WHERE id = ? AND status = 'QUEUED'
      `)
      .run(finishedAtIso, errorMessage, id);
    return this.getById(id);
  }

  /**
   * Rút bản ghi QUEUED chờ lâu nhất (chống đói - Anti-starvation).
   */
  public getOldestQueued(): EventExecutionEntity | null {
    const row = this.db
      .prepare(`
        SELECT * FROM event_executions
        WHERE status = 'QUEUED'
        ORDER BY queued_at ASC
        LIMIT 1
      `)
      .get() as RawExecutionRow | undefined;
    return row ? mapExecutionRow(row) : null;
  }

  /**
   * Lấy danh sách các bản ghi QUEUED đã chờ >= ngưỡng thời gian.
   */
  public getQueuedOlderThan(cutoffIso: string): EventExecutionEntity[] {
    const rows = this.db
      .prepare(`
        SELECT * FROM event_executions
        WHERE status = 'QUEUED' AND queued_at <= ?
        ORDER BY queued_at ASC
      `)
      .all(cutoffIso) as RawExecutionRow[];
    return rows.map(mapExecutionRow);
  }

  /**
   * Startup Crash Recovery: chạy trong 1 transaction nguyên tử:
   * 1. Chuyển mọi bản ghi dở dang (DISPATCHED, PLAYING) sang CANCELLED với mã SERVER_RESTARTED.
   * 2. Phục hồi các live_events dở dang bị kẹt trong cửa sổ COMBO_MERGE 1500ms khi crash
   *    mà chưa kịp tạo Execution, bảo đảm không mất Event và không tạo trùng.
   * 3. Giữ nguyên toàn bộ các bản ghi QUEUED và các bản ghi đã kết thúc.
   */
  public runStartupCrashRecovery(nowIso = new Date().toISOString()): {
    cancelledCount: number;
    cancelledIds: string[];
    queuedCount: number;
    recoveredEventsCount: number;
    recoveredExecutionsCount: number;
  } {
    const tx = this.db.transaction(() => {
      const activeRows = this.db
        .prepare(
          "SELECT id FROM event_executions WHERE status IN ('DISPATCHED', 'PLAYING')"
        )
        .all() as { id: string }[];

      if (activeRows.length > 0) {
        this.db
          .prepare(`
            UPDATE event_executions
            SET status = 'CANCELLED',
                finished_at = ?,
                error_code = 'SERVER_RESTARTED',
                error_message = 'Process crashed while active'
            WHERE status IN ('DISPATCHED', 'PLAYING')
          `)
          .run(nowIso);
      }

      // Phục hồi các live_events dở dang trong cửa sổ COMBO_MERGE 1500ms khi crash
      const unexecutedEvents = this.db
        .prepare(`
          SELECT e.id, e.source, e.sender_id, e.sender_name, e.gift_id, e.gift_name,
                 e.gift_count, e.total_coin_value, e.received_at
          FROM live_events e
          LEFT JOIN event_executions x ON x.live_event_id = e.id
          WHERE x.id IS NULL
            AND e.event_type = 'GIFT'
            AND e.process_status IN ('RECEIVED', 'IGNORED_COMBO_BUFFERING')
          ORDER BY e.received_at ASC, e.rowid ASC
        `)
        .all() as Array<{
          id: string;
          source: string;
          sender_id: string;
          sender_name: string;
          gift_id: string | null;
          gift_name: string | null;
          gift_count: number;
          total_coin_value: number;
          received_at: string;
        }>;

      let recoveredEventsCount = 0;
      let recoveredExecutionsCount = 0;

      if (unexecutedEvents.length > 0) {
        const activeChar = this.db
          .prepare('SELECT id, name FROM characters WHERE is_active = 1 LIMIT 1')
          .get() as { id: string; name: string } | undefined;

        if (activeChar) {
          // Nhóm các event theo (source, sender_id, gift_id) để bảo toàn combo
          const groups = new Map<string, typeof unexecutedEvents>();
          for (const ev of unexecutedEvents) {
            const key = `${ev.source}::${ev.sender_id}::${ev.gift_id ?? '__null__'}`;
            const list = groups.get(key) || [];
            list.push(ev);
            groups.set(key, list);
          }

          for (const [, eventsInGroup] of groups) {
            const firstEv = eventsInGroup[0];
            if (!firstEv) continue;

            const totalCount = eventsInGroup.reduce((sum, item) => sum + item.gift_count, 0);
            const totalCoins = eventsInGroup.reduce((sum, item) => sum + item.total_coin_value, 0);

            // Tìm quy tắc khớp
            let matchedRule: {
              id: string;
              character_id: string;
              animation_id: string;
              priority: number;
              overlay_text_template: string;
            } | undefined;

            if (firstEv.gift_id) {
              matchedRule = this.db
                .prepare(`
                  SELECT id, character_id, animation_id, priority, overlay_text_template
                  FROM gift_rules
                  WHERE character_id = ?
                    AND is_enabled = 1
                    AND trigger_gift_id = ?
                    AND min_gift_count <= ?
                    AND min_coin_value <= ?
                  ORDER BY priority DESC, min_gift_count DESC, min_coin_value DESC
                  LIMIT 1
                `)
                .get(activeChar.id, firstEv.gift_id, totalCount, totalCoins) as typeof matchedRule;
            }

            if (!matchedRule) {
              matchedRule = this.db
                .prepare(`
                  SELECT id, character_id, animation_id, priority, overlay_text_template
                  FROM gift_rules
                  WHERE character_id = ?
                    AND is_enabled = 1
                    AND trigger_gift_id IS NULL
                    AND min_gift_count <= ?
                    AND min_coin_value <= ?
                  ORDER BY priority DESC, min_gift_count DESC, min_coin_value DESC
                  LIMIT 1
                `)
                .get(activeChar.id, totalCount, totalCoins) as typeof matchedRule;
            }

            if (matchedRule) {
              const anim = this.db
                .prepare('SELECT duration_ms FROM animations WHERE id = ?')
                .get(matchedRule.animation_id) as { duration_ms: number } | undefined;

              const durationMs = anim ? anim.duration_ms : 3000;
              const template = matchedRule.overlay_text_template || '{senderName} đã tặng {giftCount}x {giftName}';
              const caption = template
                .replace(/{senderName}/g, firstEv.sender_name)
                .replace(/{giftCount}/g, String(totalCount))
                .replace(/{giftName}/g, firstEv.gift_name || 'Quà');

              this.insertQueued({
                liveEventId: firstEv.id,
                giftRuleId: matchedRule.id,
                characterId: activeChar.id,
                animationId: matchedRule.animation_id,
                source: firstEv.source as EventSource,
                senderId: firstEv.sender_id,
                senderName: firstEv.sender_name,
                giftId: firstEv.gift_id,
                giftName: firstEv.gift_name,
                mergedGiftCount: totalCount,
                priority: matchedRule.priority,
                renderedCaption: caption,
                expectedDurationMs: durationMs,
                queuedAt: firstEv.received_at,
              });

              recoveredExecutionsCount++;
              recoveredEventsCount += eventsInGroup.length;

              this.db
                .prepare("UPDATE live_events SET process_status = 'MATCHED' WHERE id = ?")
                .run(firstEv.id);

              for (let i = 1; i < eventsInGroup.length; i++) {
                const sub = eventsInGroup[i];
                if (sub) {
                  this.db
                    .prepare("UPDATE live_events SET process_status = 'COALESCED_INTO_QUEUE' WHERE id = ?")
                    .run(sub.id);
                }
              }
            } else {
              for (const ev of eventsInGroup) {
                this.db
                  .prepare("UPDATE live_events SET process_status = 'IGNORED_NO_RULE' WHERE id = ?")
                  .run(ev.id);
              }
            }
          }
        }
      }

      const queuedCount = this.getQueuedCount();
      return {
        cancelledCount: activeRows.length,
        cancelledIds: activeRows.map((r) => r.id),
        queuedCount,
        recoveredEventsCount,
        recoveredExecutionsCount,
      };
    });

    return tx();
  }

  public getActiveExecution(): EventExecutionEntity | null {
    const row = this.db
      .prepare(
        "SELECT * FROM event_executions WHERE status IN ('DISPATCHED', 'PLAYING') ORDER BY dispatched_at DESC LIMIT 1"
      )
      .get() as RawExecutionRow | undefined;
    return row ? mapExecutionRow(row) : null;
  }

  public getNextQueued(): EventExecutionEntity | null {
    const row = this.db
      .prepare(`
        SELECT * FROM event_executions
        WHERE status = 'QUEUED'
        ORDER BY priority DESC, queued_at ASC
        LIMIT 1
      `)
      .get() as RawExecutionRow | undefined;
    return row ? mapExecutionRow(row) : null;
  }

  public updateStatus(
    id: string,
    newStatus: ExecutionStatus,
    extra: {
      dispatchedAt?: string;
      startedAt?: string;
      finishedAt?: string;
      errorCode?: ExecutionErrorCode | string | null;
      errorMessage?: string | null;
    } = {}
  ): EventExecutionEntity | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const dispatchedAt = extra.dispatchedAt ?? existing.dispatchedAt;
    const startedAt = extra.startedAt ?? existing.startedAt;
    const finishedAt = extra.finishedAt ?? existing.finishedAt;
    const errorCode = extra.errorCode !== undefined ? extra.errorCode : existing.errorCode;
    const errorMessage =
      extra.errorMessage !== undefined ? extra.errorMessage : existing.errorMessage;

    this.db.prepare(`
      UPDATE event_executions
      SET status = ?,
          dispatched_at = ?,
          started_at = ?,
          finished_at = ?,
          error_code = ?,
          error_message = ?
      WHERE id = ?
    `).run(newStatus, dispatchedAt, startedAt, finishedAt, errorCode, errorMessage, id);

    return this.getById(id);
  }

  public cancelActiveOnReload(nowIso = new Date().toISOString()): EventExecutionEntity[] {
    const activeRows = this.db
      .prepare("SELECT * FROM event_executions WHERE status IN ('DISPATCHED', 'PLAYING')")
      .all() as RawExecutionRow[];

    if (activeRows.length === 0) return [];

    this.db.prepare(`
      UPDATE event_executions
      SET status = 'CANCELLED',
          finished_at = ?,
          error_code = 'OVERLAY_RELOADED',
          error_message = 'Overlay disconnected or reloaded during execution'
      WHERE status IN ('DISPATCHED', 'PLAYING')
    `).run(nowIso);

    return activeRows.map(mapExecutionRow);
  }

  public listRecent(limit = 10): EventExecutionEntity[] {
    const rows = this.db
      .prepare('SELECT * FROM event_executions ORDER BY queued_at DESC LIMIT ?')
      .all(limit) as RawExecutionRow[];
    return rows.map(mapExecutionRow);
  }

  public listQueued(limit = 30): EventExecutionEntity[] {
    const rows = this.db
      .prepare(`
        SELECT * FROM event_executions
        WHERE status = 'QUEUED'
        ORDER BY priority DESC, queued_at ASC
        LIMIT ?
      `)
      .all(limit) as RawExecutionRow[];
    return rows.map(mapExecutionRow);
  }

  public skipActiveExecution(
    id: string,
    reason = 'Skipped by operator',
    nowIso = new Date().toISOString()
  ): EventExecutionEntity | null {
    const row = this.getById(id);
    if (!row || (row.status !== 'PLAYING' && row.status !== 'DISPATCHED')) {
      return null;
    }

    this.db.prepare(`
      UPDATE event_executions
      SET status = 'SKIPPED_BY_MANAGER',
          finished_at = ?,
          error_code = 'SKIPPED_BY_MANAGER',
          error_message = ?
      WHERE id = ? AND status IN ('PLAYING', 'DISPATCHED')
    `).run(nowIso, reason, id);

    return this.getById(id);
  }

  public clearQueuedExecutions(
    reason = 'Cleared by operator',
    nowIso = new Date().toISOString()
  ): { clearedCount: number; clearedIds: string[] } {
    const tx = this.db.transaction(() => {
      const rows = this.db
        .prepare("SELECT id FROM event_executions WHERE status = 'QUEUED'")
        .all() as Array<{ id: string }>;

      if (rows.length === 0) {
        return { clearedCount: 0, clearedIds: [] };
      }

      this.db.prepare(`
        UPDATE event_executions
        SET status = 'CLEARED_BY_MANAGER',
            finished_at = ?,
            error_code = 'CLEARED_BY_MANAGER',
            error_message = ?
        WHERE status = 'QUEUED'
      `).run(nowIso, reason);

      return {
        clearedCount: rows.length,
        clearedIds: rows.map((r) => r.id),
      };
    });

    return tx();
  }

  public getQueueMetrics(): {
    queued: number;
    playing: number;
    completed: number;
    failed: number;
  } {
    const rows = this.db
      .prepare('SELECT status, count(*) as count FROM event_executions GROUP BY status')
      .all() as Array<{ status: string; count: number }>;

    let queued = 0;
    let playing = 0;
    let completed = 0;
    let failed = 0;

    for (const r of rows) {
      if (r.status === 'QUEUED') {
        queued += r.count;
      } else if (r.status === 'PLAYING' || r.status === 'DISPATCHED') {
        playing += r.count;
      } else if (r.status === 'COMPLETED' || r.status === 'COMPLETED_WITH_FALLBACK') {
        completed += r.count;
      } else {
        // FAILED, TIMED_OUT, CANCELLED, SKIPPED_BY_MANAGER, CLEARED_BY_MANAGER, EVICTED_BY_PRIORITY, PREEMPTED
        failed += r.count;
      }
    }

    return { queued, playing, completed, failed };
  }
}
