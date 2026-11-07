import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  type AnimationEntity,
  type RawAnimationRow,
  mapAnimationRow,
} from './character.repository';

export interface CreateAnimationParams {
  id?: string;
  characterId: string;
  name: string;
  clipName: string;
  category?: 'IDLE' | 'REACTION' | 'SPECIAL' | 'TRANSITION';
  durationMs: number;
  loopMode?: 'ONCE' | 'LOOP' | 'REPEAT_N';
  repeatCount?: number;
  blendInMs?: number;
  blendOutMs?: number;
  soundPath?: string | null;
  soundVolume?: number;
  vfxPreset?: string | null;
  isEnabled?: boolean;
}

export interface UpdateAnimationParams {
  name?: string;
  clipName?: string;
  category?: 'IDLE' | 'REACTION' | 'SPECIAL' | 'TRANSITION';
  durationMs?: number;
  loopMode?: 'ONCE' | 'LOOP' | 'REPEAT_N';
  repeatCount?: number;
  blendInMs?: number;
  blendOutMs?: number;
  soundPath?: string | null;
  soundVolume?: number;
  vfxPreset?: string | null;
  isEnabled?: boolean;
}

export class AnimationRepository {
  constructor(private readonly db: Database.Database) {}

  public listByCharacterId(characterId: string): AnimationEntity[] {
    const rows = this.db
      .prepare('SELECT * FROM animations WHERE character_id = ? ORDER BY created_at ASC')
      .all(characterId) as RawAnimationRow[];
    return rows.map(mapAnimationRow);
  }

  public getById(id: string): AnimationEntity | null {
    const row = this.db
      .prepare('SELECT * FROM animations WHERE id = ?')
      .get(id) as RawAnimationRow | undefined;
    return row ? mapAnimationRow(row) : null;
  }

  public create(params: CreateAnimationParams): AnimationEntity {
    const id = params.id ?? crypto.randomUUID();
    const now = new Date().toISOString();
    const isEnabled = params.isEnabled !== false ? 1 : 0;

    this.db.prepare(`
      INSERT INTO animations (
        id, character_id, name, clip_name, category, duration_ms,
        loop_mode, repeat_count, blend_in_ms, blend_out_ms,
        sound_path, sound_volume, vfx_preset, is_enabled, created_at, updated_at
      ) VALUES (
        @id, @characterId, @name, @clipName, @category, @durationMs,
        @loopMode, @repeatCount, @blendInMs, @blendOutMs,
        @soundPath, @soundVolume, @vfxPreset, @isEnabled, @createdAt, @updatedAt
      )
    `).run({
      id,
      characterId: params.characterId,
      name: params.name,
      clipName: params.clipName,
      category: params.category ?? 'REACTION',
      durationMs: params.durationMs,
      loopMode: params.loopMode ?? 'ONCE',
      repeatCount: params.repeatCount ?? 1,
      blendInMs: params.blendInMs ?? 250,
      blendOutMs: params.blendOutMs ?? 250,
      soundPath: params.soundPath ?? null,
      soundVolume: params.soundVolume ?? 1.0,
      vfxPreset: params.vfxPreset ?? null,
      isEnabled,
      createdAt: now,
      updatedAt: now,
    });

    return this.getById(id)!;
  }

  public update(id: string, params: UpdateAnimationParams): AnimationEntity | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updatedName = params.name ?? existing.name;
    const updatedClipName = params.clipName ?? existing.clipName;
    const updatedCategory = params.category ?? existing.category;
    const updatedDurationMs = params.durationMs ?? existing.durationMs;
    const updatedLoopMode = params.loopMode ?? existing.loopMode;
    const updatedRepeatCount = params.repeatCount ?? existing.repeatCount;
    const updatedBlendInMs = params.blendInMs ?? existing.blendInMs;
    const updatedBlendOutMs = params.blendOutMs ?? existing.blendOutMs;
    const updatedSoundPath = params.soundPath !== undefined ? params.soundPath : existing.soundPath;
    const updatedSoundVolume = params.soundVolume !== undefined ? params.soundVolume : existing.soundVolume;
    const updatedVfxPreset = params.vfxPreset !== undefined ? params.vfxPreset : existing.vfxPreset;
    const updatedIsEnabled = params.isEnabled !== undefined ? (params.isEnabled ? 1 : 0) : (existing.isEnabled ? 1 : 0);

    this.db.prepare(`
      UPDATE animations
      SET name = @name,
          clip_name = @clipName,
          category = @category,
          duration_ms = @durationMs,
          loop_mode = @loopMode,
          repeat_count = @repeatCount,
          blend_in_ms = @blendInMs,
          blend_out_ms = @blendOutMs,
          sound_path = @soundPath,
          sound_volume = @soundVolume,
          vfx_preset = @vfxPreset,
          is_enabled = @isEnabled,
          updated_at = @updatedAt
      WHERE id = @id
    `).run({
      id,
      name: updatedName,
      clipName: updatedClipName,
      category: updatedCategory,
      durationMs: updatedDurationMs,
      loopMode: updatedLoopMode,
      repeatCount: updatedRepeatCount,
      blendInMs: updatedBlendInMs,
      blendOutMs: updatedBlendOutMs,
      soundPath: updatedSoundPath,
      soundVolume: updatedSoundVolume,
      vfxPreset: updatedVfxPreset,
      isEnabled: updatedIsEnabled,
      updatedAt: now,
    });

    return this.getById(id);
  }

  public toggle(id: string, isEnabled?: boolean): AnimationEntity | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const targetVal = isEnabled !== undefined ? isEnabled : !existing.isEnabled;
    return this.update(id, { isEnabled: targetVal });
  }

  /**
   * Xóa animation có kiểm tra phụ thuộc khóa ngoại ON DELETE RESTRICT từ gift_rules.
   */
  public delete(id: string): { ok: boolean; error?: string; referencedRulesCount?: number } {
    const existing = this.getById(id);
    if (!existing) {
      return { ok: false, error: 'ANIMATION_NOT_FOUND' };
    }

    const ref = this.db
      .prepare('SELECT count(*) as count FROM gift_rules WHERE animation_id = ?')
      .get(id) as { count: number };

    if (ref && ref.count > 0) {
      return {
        ok: false,
        error: 'ANIMATION_REFERENCED_BY_GIFT_RULES',
        referencedRulesCount: ref.count,
      };
    }

    this.db.prepare('DELETE FROM animations WHERE id = ?').run(id);
    return { ok: true };
  }
}
