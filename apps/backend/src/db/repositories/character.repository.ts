import crypto from 'node:crypto';
import type Database from 'better-sqlite3';

export interface CharacterEntity {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  modelPath: string;
  thumbnailPath: string | null;
  visibilityMode: 'APPEAR_ON_EVENT' | 'PERSISTENT_IDLE';
  scale: number;
  positionJson: string;
  rotationJson: string;
  defaultIdleAnimationId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AnimationEntity {
  id: string;
  characterId: string;
  name: string;
  clipName: string;
  category: 'IDLE' | 'REACTION' | 'SPECIAL' | 'TRANSITION';
  durationMs: number;
  loopMode: 'ONCE' | 'LOOP' | 'REPEAT_N';
  repeatCount: number;
  blendInMs: number;
  blendOutMs: number;
  soundPath: string | null;
  soundVolume: number;
  vfxPreset: string | null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterWithAnimation {
  character: CharacterEntity;
  animation: AnimationEntity;
}

export interface CreateCharacterParams {
  id?: string;
  name: string;
  slug: string;
  description?: string | null;
  modelPath: string;
  thumbnailPath?: string | null;
  visibilityMode?: 'APPEAR_ON_EVENT' | 'PERSISTENT_IDLE';
  scale?: number;
  positionJson?: string;
  rotationJson?: string;
  defaultIdleAnimationId?: string | null;
  isActive?: boolean;
}

export interface UpdateCharacterParams {
  name?: string;
  slug?: string;
  description?: string | null;
  modelPath?: string;
  thumbnailPath?: string | null;
  visibilityMode?: 'APPEAR_ON_EVENT' | 'PERSISTENT_IDLE';
  scale?: number;
  positionJson?: string;
  rotationJson?: string;
  defaultIdleAnimationId?: string | null;
  isActive?: boolean;
}

export interface RawCharacterRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  model_path: string;
  thumbnail_path: string | null;
  visibility_mode: string;
  scale: number;
  position_json: string;
  rotation_json: string;
  default_idle_animation_id: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface RawAnimationRow {
  id: string;
  character_id: string;
  name: string;
  clip_name: string;
  category: string;
  duration_ms: number;
  loop_mode: string;
  repeat_count: number;
  blend_in_ms: number;
  blend_out_ms: number;
  sound_path: string | null;
  sound_volume: number;
  vfx_preset: string | null;
  is_enabled: number;
  created_at: string;
  updated_at: string;
}

export function mapCharacterRow(row: RawCharacterRow): CharacterEntity {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    modelPath: row.model_path,
    thumbnailPath: row.thumbnail_path,
    visibilityMode: row.visibility_mode as 'APPEAR_ON_EVENT' | 'PERSISTENT_IDLE',
    scale: row.scale,
    positionJson: row.position_json,
    rotationJson: row.rotation_json,
    defaultIdleAnimationId: row.default_idle_animation_id,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAnimationRow(row: RawAnimationRow): AnimationEntity {
  return {
    id: row.id,
    characterId: row.character_id,
    name: row.name,
    clipName: row.clip_name,
    category: row.category as 'IDLE' | 'REACTION' | 'SPECIAL' | 'TRANSITION',
    durationMs: row.duration_ms,
    loopMode: row.loop_mode as 'ONCE' | 'LOOP' | 'REPEAT_N',
    repeatCount: row.repeat_count,
    blendInMs: row.blend_in_ms,
    blendOutMs: row.blend_out_ms,
    soundPath: row.sound_path,
    soundVolume: row.sound_volume,
    vfxPreset: row.vfx_preset,
    isEnabled: row.is_enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class CharacterRepository {
  constructor(private readonly db: Database.Database) {}

  public listAll(): CharacterEntity[] {
    const rows = this.db
      .prepare('SELECT * FROM characters ORDER BY created_at ASC')
      .all() as RawCharacterRow[];
    return rows.map(mapCharacterRow);
  }

  public getById(id: string): CharacterEntity | null {
    const row = this.db
      .prepare('SELECT * FROM characters WHERE id = ?')
      .get(id) as RawCharacterRow | undefined;
    return row ? mapCharacterRow(row) : null;
  }

  public getBySlug(slug: string): CharacterEntity | null {
    const row = this.db
      .prepare('SELECT * FROM characters WHERE slug = ?')
      .get(slug) as RawCharacterRow | undefined;
    return row ? mapCharacterRow(row) : null;
  }

  public getActiveCharacter(): CharacterEntity | null {
    const row = this.db
      .prepare('SELECT * FROM characters WHERE is_active = 1 LIMIT 1')
      .get() as RawCharacterRow | undefined;
    return row ? mapCharacterRow(row) : null;
  }

  public create(params: CreateCharacterParams): CharacterEntity {
    const id = params.id ?? crypto.randomUUID();
    const now = new Date().toISOString();
    const isActive = params.isActive ? 1 : 0;

    const tx = this.db.transaction(() => {
      if (isActive === 1) {
        // Tắt active của các nhân vật khác trước khi kích hoạt nhân vật mới
        this.db.prepare('UPDATE characters SET is_active = 0 WHERE is_active = 1').run();
      }

      this.db.prepare(`
        INSERT INTO characters (
          id, name, slug, description, model_path, thumbnail_path,
          visibility_mode, scale, position_json, rotation_json,
          default_idle_animation_id, is_active, created_at, updated_at
        ) VALUES (
          @id, @name, @slug, @description, @modelPath, @thumbnailPath,
          @visibilityMode, @scale, @positionJson, @rotationJson,
          @defaultIdleAnimationId, @isActive, @createdAt, @updatedAt
        )
      `).run({
        id,
        name: params.name,
        slug: params.slug,
        description: params.description ?? null,
        modelPath: params.modelPath,
        thumbnailPath: params.thumbnailPath ?? null,
        visibilityMode: params.visibilityMode ?? 'APPEAR_ON_EVENT',
        scale: params.scale ?? 1.0,
        positionJson: params.positionJson ?? '{"x":0,"y":0,"z":0}',
        rotationJson: params.rotationJson ?? '{"x":0,"y":0,"z":0}',
        defaultIdleAnimationId: params.defaultIdleAnimationId ?? null,
        isActive,
        createdAt: now,
        updatedAt: now,
      });

      return this.getById(id)!;
    });

    return tx();
  }

  public update(id: string, params: UpdateCharacterParams): CharacterEntity | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      if (params.isActive === true) {
        this.db.prepare('UPDATE characters SET is_active = 0 WHERE is_active = 1').run();
      }

      const updatedName = params.name ?? existing.name;
      const updatedSlug = params.slug ?? existing.slug;
      const updatedDescription = params.description !== undefined ? params.description : existing.description;
      const updatedModelPath = params.modelPath ?? existing.modelPath;
      const updatedThumbnailPath = params.thumbnailPath !== undefined ? params.thumbnailPath : existing.thumbnailPath;
      const updatedVisibilityMode = params.visibilityMode ?? existing.visibilityMode;
      const updatedScale = params.scale ?? existing.scale;
      const updatedPositionJson = params.positionJson ?? existing.positionJson;
      const updatedRotationJson = params.rotationJson ?? existing.rotationJson;
      const updatedDefaultIdle = params.defaultIdleAnimationId !== undefined ? params.defaultIdleAnimationId : existing.defaultIdleAnimationId;
      const updatedIsActive = params.isActive !== undefined ? (params.isActive ? 1 : 0) : (existing.isActive ? 1 : 0);

      this.db.prepare(`
        UPDATE characters
        SET name = @name,
            slug = @slug,
            description = @description,
            model_path = @modelPath,
            thumbnail_path = @thumbnailPath,
            visibility_mode = @visibilityMode,
            scale = @scale,
            position_json = @positionJson,
            rotation_json = @rotationJson,
            default_idle_animation_id = @defaultIdleAnimationId,
            is_active = @isActive,
            updated_at = @updatedAt
        WHERE id = @id
      `).run({
        id,
        name: updatedName,
        slug: updatedSlug,
        description: updatedDescription,
        modelPath: updatedModelPath,
        thumbnailPath: updatedThumbnailPath,
        visibilityMode: updatedVisibilityMode,
        scale: updatedScale,
        positionJson: updatedPositionJson,
        rotationJson: updatedRotationJson,
        defaultIdleAnimationId: updatedDefaultIdle,
        isActive: updatedIsActive,
        updatedAt: now,
      });

      return this.getById(id);
    });

    return tx();
  }

  public setActive(id: string): CharacterEntity | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      this.db.prepare('UPDATE characters SET is_active = 0 WHERE is_active = 1').run();
      this.db.prepare('UPDATE characters SET is_active = 1, updated_at = ? WHERE id = ?').run(now, id);
      return this.getById(id);
    });

    return tx();
  }

  public delete(id: string): { ok: boolean; error?: string } {
    const target = this.getById(id);
    if (!target) {
      return { ok: false, error: 'CHARACTER_NOT_FOUND' };
    }
    if (target.isActive) {
      return { ok: false, error: 'CANNOT_DELETE_ACTIVE_CHARACTER' };
    }

    this.db.prepare('DELETE FROM characters WHERE id = ?').run(id);
    return { ok: true };
  }

  public getAnimationById(animationId: string): AnimationEntity | null {
    const row = this.db
      .prepare('SELECT * FROM animations WHERE id = ?')
      .get(animationId) as RawAnimationRow | undefined;
    return row ? mapAnimationRow(row) : null;
  }

  public getActiveCharacterWithAnimation(animationId: string): CharacterWithAnimation | null {
    const char = this.getActiveCharacter();
    if (!char) return null;
    const anim = this.getAnimationById(animationId);
    if (!anim || anim.characterId !== char.id) return null;
    return { character: char, animation: anim };
  }
}
