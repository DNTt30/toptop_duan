import crypto from 'node:crypto';
import type Database from 'better-sqlite3';

export interface GiftRuleEntity {
  id: string;
  name: string;
  characterId: string;
  animationId: string;
  triggerGiftId: string | null;
  minGiftCount: number;
  minCoinValue: number;
  comboTriggerMode: 'COMBO_MERGE' | 'THRESHOLD_STEP' | 'EACH_EVENT';
  priority: number;
  interruptPolicy: 'QUEUE' | 'PREEMPT_LOWER' | 'DROP_IF_BUSY';
  cooldownMs: number;
  maxQueuePerRule: number;
  overlayTextTemplate: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGiftRuleParams {
  id?: string;
  name: string;
  characterId: string;
  animationId: string;
  triggerGiftId?: string | null;
  minGiftCount?: number;
  minCoinValue?: number;
  comboTriggerMode?: 'COMBO_MERGE' | 'THRESHOLD_STEP' | 'EACH_EVENT';
  priority?: number;
  interruptPolicy?: 'QUEUE' | 'PREEMPT_LOWER' | 'DROP_IF_BUSY';
  cooldownMs?: number;
  maxQueuePerRule?: number;
  overlayTextTemplate?: string;
  isEnabled?: boolean;
}

export interface UpdateGiftRuleParams {
  name?: string;
  characterId?: string;
  animationId?: string;
  triggerGiftId?: string | null;
  minGiftCount?: number;
  minCoinValue?: number;
  comboTriggerMode?: 'COMBO_MERGE' | 'THRESHOLD_STEP' | 'EACH_EVENT';
  priority?: number;
  interruptPolicy?: 'QUEUE' | 'PREEMPT_LOWER' | 'DROP_IF_BUSY';
  cooldownMs?: number;
  maxQueuePerRule?: number;
  overlayTextTemplate?: string;
  isEnabled?: boolean;
}

export interface RawGiftRuleRow {
  id: string;
  name: string;
  character_id: string;
  animation_id: string;
  trigger_gift_id: string | null;
  min_gift_count: number;
  min_coin_value: number;
  combo_trigger_mode: string;
  priority: number;
  interrupt_policy: string;
  cooldown_ms: number;
  max_queue_per_rule: number;
  overlay_text_template: string;
  is_enabled: number;
  created_at: string;
  updated_at: string;
}

export function mapGiftRuleRow(row: RawGiftRuleRow): GiftRuleEntity {
  return {
    id: row.id,
    name: row.name,
    characterId: row.character_id,
    animationId: row.animation_id,
    triggerGiftId: row.trigger_gift_id,
    minGiftCount: row.min_gift_count,
    minCoinValue: row.min_coin_value,
    comboTriggerMode: row.combo_trigger_mode as
      | 'COMBO_MERGE'
      | 'THRESHOLD_STEP'
      | 'EACH_EVENT',
    priority: row.priority,
    interruptPolicy: row.interrupt_policy as
      | 'QUEUE'
      | 'PREEMPT_LOWER'
      | 'DROP_IF_BUSY',
    cooldownMs: row.cooldown_ms,
    maxQueuePerRule: row.max_queue_per_rule,
    overlayTextTemplate: row.overlay_text_template,
    isEnabled: row.is_enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class GiftRuleRepository {
  constructor(private readonly db: Database.Database) {}

  public listAll(): GiftRuleEntity[] {
    const rows = this.db
      .prepare('SELECT * FROM gift_rules ORDER BY priority DESC, created_at ASC')
      .all() as RawGiftRuleRow[];
    return rows.map(mapGiftRuleRow);
  }

  public listByCharacterId(characterId: string): GiftRuleEntity[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM gift_rules WHERE character_id = ? ORDER BY priority DESC, created_at ASC'
      )
      .all(characterId) as RawGiftRuleRow[];
    return rows.map(mapGiftRuleRow);
  }

  public getById(ruleId: string): GiftRuleEntity | null {
    const row = this.db
      .prepare('SELECT * FROM gift_rules WHERE id = ?')
      .get(ruleId) as RawGiftRuleRow | undefined;
    return row ? mapGiftRuleRow(row) : null;
  }

  public findMatchingRule(
    characterId: string,
    giftId: string | null,
    giftCount = 1,
    coinValue = 0
  ): GiftRuleEntity | null {
    // 1. Tìm quy tắc khớp chính xác trigger_gift_id
    if (giftId) {
      const row = this.db
        .prepare(`
          SELECT * FROM gift_rules
          WHERE character_id = ?
            AND is_enabled = 1
            AND trigger_gift_id = ?
            AND min_gift_count <= ?
            AND min_coin_value <= ?
          ORDER BY priority DESC, min_gift_count DESC, min_coin_value DESC
          LIMIT 1
        `)
        .get(characterId, giftId, giftCount, coinValue) as RawGiftRuleRow | undefined;
      if (row) return mapGiftRuleRow(row);
    }

    // 2. Fallback sang quy tắc mặc định (trigger_gift_id IS NULL)
    const fallback = this.db
      .prepare(`
        SELECT * FROM gift_rules
        WHERE character_id = ?
          AND is_enabled = 1
          AND trigger_gift_id IS NULL
          AND min_gift_count <= ?
          AND min_coin_value <= ?
        ORDER BY priority DESC, min_gift_count DESC, min_coin_value DESC
        LIMIT 1
      `)
      .get(characterId, giftCount, coinValue) as RawGiftRuleRow | undefined;

    return fallback ? mapGiftRuleRow(fallback) : null;
  }

  public create(params: CreateGiftRuleParams): GiftRuleEntity {
    const id = params.id ?? crypto.randomUUID();
    const now = new Date().toISOString();
    const isEnabled = params.isEnabled !== false ? 1 : 0;

    this.db.prepare(`
      INSERT INTO gift_rules (
        id, name, character_id, animation_id, trigger_gift_id,
        min_gift_count, min_coin_value, combo_trigger_mode, priority,
        interrupt_policy, cooldown_ms, max_queue_per_rule,
        overlay_text_template, is_enabled, created_at, updated_at
      ) VALUES (
        @id, @name, @characterId, @animationId, @triggerGiftId,
        @minGiftCount, @minCoinValue, @comboTriggerMode, @priority,
        @interruptPolicy, @cooldownMs, @maxQueuePerRule,
        @overlayTextTemplate, @isEnabled, @createdAt, @updatedAt
      )
    `).run({
      id,
      name: params.name,
      characterId: params.characterId,
      animationId: params.animationId,
      triggerGiftId: params.triggerGiftId ?? null,
      minGiftCount: params.minGiftCount ?? 1,
      minCoinValue: params.minCoinValue ?? 0,
      comboTriggerMode: params.comboTriggerMode ?? 'COMBO_MERGE',
      priority: params.priority ?? 10,
      interruptPolicy: params.interruptPolicy ?? 'QUEUE',
      cooldownMs: params.cooldownMs ?? 0,
      maxQueuePerRule: params.maxQueuePerRule ?? 5,
      overlayTextTemplate:
        params.overlayTextTemplate ?? '{senderName} đã tặng {giftCount}x {giftName}',
      isEnabled,
      createdAt: now,
      updatedAt: now,
    });

    return this.getById(id)!;
  }

  public update(id: string, params: UpdateGiftRuleParams): GiftRuleEntity | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updatedName = params.name ?? existing.name;
    const updatedCharacterId = params.characterId ?? existing.characterId;
    const updatedAnimationId = params.animationId ?? existing.animationId;
    const updatedTriggerGiftId =
      params.triggerGiftId !== undefined ? params.triggerGiftId : existing.triggerGiftId;
    const updatedMinGiftCount = params.minGiftCount ?? existing.minGiftCount;
    const updatedMinCoinValue = params.minCoinValue ?? existing.minCoinValue;
    const updatedComboMode = params.comboTriggerMode ?? existing.comboTriggerMode;
    const updatedPriority = params.priority ?? existing.priority;
    const updatedInterruptPolicy = params.interruptPolicy ?? existing.interruptPolicy;
    const updatedCooldownMs = params.cooldownMs ?? existing.cooldownMs;
    const updatedMaxQueue = params.maxQueuePerRule ?? existing.maxQueuePerRule;
    const updatedTemplate = params.overlayTextTemplate ?? existing.overlayTextTemplate;
    const updatedIsEnabled =
      params.isEnabled !== undefined ? (params.isEnabled ? 1 : 0) : (existing.isEnabled ? 1 : 0);

    this.db.prepare(`
      UPDATE gift_rules
      SET name = @name,
          character_id = @characterId,
          animation_id = @animationId,
          trigger_gift_id = @triggerGiftId,
          min_gift_count = @minGiftCount,
          min_coin_value = @minCoinValue,
          combo_trigger_mode = @comboTriggerMode,
          priority = @priority,
          interrupt_policy = @interruptPolicy,
          cooldown_ms = @cooldownMs,
          max_queue_per_rule = @maxQueuePerRule,
          overlay_text_template = @overlayTextTemplate,
          is_enabled = @isEnabled,
          updated_at = @updatedAt
      WHERE id = @id
    `).run({
      id,
      name: updatedName,
      characterId: updatedCharacterId,
      animationId: updatedAnimationId,
      triggerGiftId: updatedTriggerGiftId,
      minGiftCount: updatedMinGiftCount,
      minCoinValue: updatedMinCoinValue,
      comboTriggerMode: updatedComboMode,
      priority: updatedPriority,
      interruptPolicy: updatedInterruptPolicy,
      cooldownMs: updatedCooldownMs,
      maxQueuePerRule: updatedMaxQueue,
      overlayTextTemplate: updatedTemplate,
      isEnabled: updatedIsEnabled,
      updatedAt: now,
    });

    return this.getById(id);
  }

  public toggle(id: string, isEnabled?: boolean): GiftRuleEntity | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const targetVal = isEnabled !== undefined ? isEnabled : !existing.isEnabled;
    return this.update(id, { isEnabled: targetVal });
  }

  public delete(id: string): boolean {
    const existing = this.getById(id);
    if (!existing) return false;

    this.db.prepare('DELETE FROM gift_rules WHERE id = ?').run(id);
    return true;
  }
}
