import {
  normalizeExternalEventId,
  type EventSource,
  type LiveEventProcessStatus,
} from '@buddhalive/shared';
import type Database from 'better-sqlite3';
import crypto from 'node:crypto';

export interface CreateLiveEventParams {
  id?: string;
  externalEventId?: string | null;
  source: EventSource;
  eventType: 'GIFT' | 'LIKE' | 'CHAT' | 'FOLLOW' | 'SHARE';
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string | null;
  giftId?: string | null;
  giftName?: string | null;
  giftCount?: number;
  unitCoinValue?: number;
  totalCoinValue?: number;
  comboGroupId?: string | null;
  isComboEnd?: boolean;
  processStatus: LiveEventProcessStatus;
  rawPayload: Record<string, unknown>;
  receivedAt?: string;
}

export interface LiveEventEntity {
  id: string;
  externalEventId: string | null;
  source: EventSource;
  eventType: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  giftId: string | null;
  giftName: string | null;
  giftCount: number;
  unitCoinValue: number;
  totalCoinValue: number;
  comboGroupId: string | null;
  isComboEnd: boolean;
  processStatus: LiveEventProcessStatus;
  rawPayloadJson: string;
  receivedAt: string;
}

export interface InsertLiveEventResult {
  inserted: boolean;
  duplicate: boolean;
  event: LiveEventEntity;
}

export class LiveEventRepository {
  constructor(private readonly db: Database.Database) {}

  public insert(params: CreateLiveEventParams): InsertLiveEventResult {
    const id = params.id ?? crypto.randomUUID();
    const externalEventId = normalizeExternalEventId(params.externalEventId);
    const now = params.receivedAt ?? new Date().toISOString();
    const rawPayloadJson = JSON.stringify(params.rawPayload);
    const giftCount = params.giftCount ?? 1;
    const unitCoinValue = params.unitCoinValue ?? 0;
    const totalCoinValue = params.totalCoinValue ?? 0;
    const isComboEnd = params.isComboEnd !== false ? 1 : 0;

    const stmt = this.db.prepare(`
      INSERT INTO live_events (
        id, external_event_id, source, event_type, sender_id, sender_name,
        sender_avatar_url, gift_id, gift_name, gift_count, unit_coin_value,
        total_coin_value, combo_group_id, is_combo_end, process_status,
        raw_payload_json, received_at
      ) VALUES (
        @id, @externalEventId, @source, @eventType, @senderId, @senderName,
        @senderAvatarUrl, @giftId, @giftName, @giftCount, @unitCoinValue,
        @totalCoinValue, @comboGroupId, @isComboEnd, @processStatus,
        @rawPayloadJson, @receivedAt
      )
      ON CONFLICT(source, external_event_id) DO NOTHING
    `);

    const result = stmt.run({
      id,
      externalEventId,
      source: params.source,
      eventType: params.eventType,
      senderId: params.senderId,
      senderName: params.senderName,
      senderAvatarUrl: params.senderAvatarUrl ?? null,
      giftId: params.giftId ?? null,
      giftName: params.giftName ?? null,
      giftCount,
      unitCoinValue,
      totalCoinValue,
      comboGroupId: params.comboGroupId ?? null,
      isComboEnd,
      processStatus: params.processStatus,
      rawPayloadJson,
      receivedAt: now,
    });

    if (result.changes === 0) {
      // Bị trùng lặp do SQLite UNIQUE(source, external_event_id)
      const existing = this.db
        .prepare('SELECT * FROM live_events WHERE source = ? AND external_event_id = ?')
        .get(params.source, externalEventId) as any;
      return {
        inserted: false,
        duplicate: true,
        event: {
          id: existing.id,
          externalEventId: existing.external_event_id,
          source: existing.source,
          eventType: existing.event_type,
          senderId: existing.sender_id,
          senderName: existing.sender_name,
          senderAvatarUrl: existing.sender_avatar_url,
          giftId: existing.gift_id,
          giftName: existing.gift_name,
          giftCount: existing.gift_count,
          unitCoinValue: existing.unit_coin_value,
          totalCoinValue: existing.total_coin_value,
          comboGroupId: existing.combo_group_id,
          isComboEnd: existing.is_combo_end === 1,
          processStatus: existing.process_status,
          rawPayloadJson: existing.raw_payload_json,
          receivedAt: existing.received_at,
        },
      };
    }

    return {
      inserted: true,
      duplicate: false,
      event: {
        id,
        externalEventId,
        source: params.source,
        eventType: params.eventType,
        senderId: params.senderId,
        senderName: params.senderName,
        senderAvatarUrl: params.senderAvatarUrl ?? null,
        giftId: params.giftId ?? null,
        giftName: params.giftName ?? null,
        giftCount,
        unitCoinValue,
        totalCoinValue,
        comboGroupId: params.comboGroupId ?? null,
        isComboEnd: isComboEnd === 1,
        processStatus: params.processStatus,
        rawPayloadJson,
        receivedAt: now,
      },
    };
  }

  public getById(id: string): LiveEventEntity | null {
    const row = this.db
      .prepare('SELECT * FROM live_events WHERE id = ?')
      .get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      externalEventId: row.external_event_id,
      source: row.source,
      eventType: row.event_type,
      senderId: row.sender_id,
      senderName: row.sender_name,
      senderAvatarUrl: row.sender_avatar_url,
      giftId: row.gift_id,
      giftName: row.gift_name,
      giftCount: row.gift_count,
      unitCoinValue: row.unit_coin_value,
      totalCoinValue: row.total_coin_value,
      comboGroupId: row.combo_group_id,
      isComboEnd: row.is_combo_end === 1,
      processStatus: row.process_status,
      rawPayloadJson: row.raw_payload_json,
      receivedAt: row.received_at,
    };
  }

  public updateProcessStatus(id: string, processStatus: LiveEventProcessStatus): void {
    this.db
      .prepare('UPDATE live_events SET process_status = ? WHERE id = ?')
      .run(processStatus, id);
  }

  public listRecent(limit = 20): LiveEventEntity[] {
    const rows = this.db
      .prepare('SELECT * FROM live_events ORDER BY received_at DESC, rowid DESC LIMIT ?')
      .all(limit) as any[];
    return rows.map((row) => ({
      id: row.id,
      externalEventId: row.external_event_id,
      source: row.source,
      eventType: row.event_type,
      senderId: row.sender_id,
      senderName: row.sender_name,
      senderAvatarUrl: row.sender_avatar_url,
      giftId: row.gift_id,
      giftName: row.gift_name,
      giftCount: row.gift_count,
      unitCoinValue: row.unit_coin_value,
      totalCoinValue: row.total_coin_value,
      comboGroupId: row.combo_group_id,
      isComboEnd: row.is_combo_end === 1,
      processStatus: row.process_status,
      rawPayloadJson: row.raw_payload_json,
      receivedAt: row.received_at,
    }));
  }
}
