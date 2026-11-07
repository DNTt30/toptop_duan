import { DEFAULT_APP_SETTINGS } from '@buddhalive/shared';
import type Database from 'better-sqlite3';

export interface MigrationDefinition {
  id: string;
  up: (db: Database.Database) => void;
}

export const MIGRATIONS: readonly MigrationDefinition[] = [
  {
    id: '001_bootstrap_app_settings',
    up: (db: Database.Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value_json TEXT NOT NULL,
            value_type TEXT NOT NULL CHECK (value_type IN ('STRING', 'NUMBER', 'BOOLEAN', 'JSON')),
            category TEXT NOT NULL CHECK (category IN ('SERVER', 'OVERLAY', 'ENGINE', 'AUDIO', 'DEMO', 'RETENTION')),
            description TEXT NOT NULL,
            is_restart_required INTEGER NOT NULL DEFAULT 0 CHECK (is_restart_required IN (0, 1)),
            updated_at TEXT NOT NULL
        );
      `);

      const insertStmt = db.prepare(`
        INSERT OR IGNORE INTO app_settings (
          key, value_json, value_type, category, description, is_restart_required, updated_at
        ) VALUES (
          @key, @valueJson, @valueType, @category, @description, @isRestartRequired, @updatedAt
        )
      `);

      const now = new Date().toISOString();
      for (const seed of DEFAULT_APP_SETTINGS) {
        insertStmt.run({
          key: seed.key,
          valueJson: seed.valueJson,
          valueType: seed.valueType,
          category: seed.category,
          description: seed.description,
          isRestartRequired: seed.isRestartRequired ? 1 : 0,
          updatedAt: now,
        });
      }
    },
  },
  {
    id: '002_core_schema_and_sample_seed',
    up: (db: Database.Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS characters (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            description TEXT,
            model_path TEXT NOT NULL,
            thumbnail_path TEXT,
            visibility_mode TEXT NOT NULL DEFAULT 'APPEAR_ON_EVENT'
                CHECK (visibility_mode IN ('APPEAR_ON_EVENT', 'PERSISTENT_IDLE')),
            scale REAL NOT NULL DEFAULT 1.0 CHECK (scale > 0),
            position_json TEXT NOT NULL DEFAULT '{"x":0,"y":0,"z":0}',
            rotation_json TEXT NOT NULL DEFAULT '{"x":0,"y":0,"z":0}',
            default_idle_animation_id TEXT,
            is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (default_idle_animation_id) REFERENCES animations(id) ON DELETE SET NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_characters_single_active
            ON characters(is_active) WHERE is_active = 1;

        CREATE TABLE IF NOT EXISTS animations (
            id TEXT PRIMARY KEY,
            character_id TEXT NOT NULL,
            name TEXT NOT NULL,
            clip_name TEXT NOT NULL,
            category TEXT NOT NULL CHECK (category IN ('IDLE', 'REACTION', 'SPECIAL', 'TRANSITION')),
            duration_ms INTEGER NOT NULL CHECK (duration_ms > 0),
            loop_mode TEXT NOT NULL DEFAULT 'ONCE' CHECK (loop_mode IN ('ONCE', 'LOOP', 'REPEAT_N')),
            repeat_count INTEGER NOT NULL DEFAULT 1 CHECK (repeat_count >= 1),
            blend_in_ms INTEGER NOT NULL DEFAULT 250 CHECK (blend_in_ms >= 0),
            blend_out_ms INTEGER NOT NULL DEFAULT 250 CHECK (blend_out_ms >= 0),
            sound_path TEXT,
            sound_volume REAL NOT NULL DEFAULT 1.0 CHECK (sound_volume >= 0.0 AND sound_volume <= 1.0),
            vfx_preset TEXT,
            is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE (character_id, clip_name, name),
            FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_animations_character
            ON animations(character_id, is_enabled);

        CREATE TABLE IF NOT EXISTS gift_rules (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            character_id TEXT NOT NULL,
            animation_id TEXT NOT NULL,
            trigger_gift_id TEXT,
            min_gift_count INTEGER NOT NULL DEFAULT 1 CHECK (min_gift_count >= 1),
            min_coin_value INTEGER NOT NULL DEFAULT 0 CHECK (min_coin_value >= 0),
            combo_trigger_mode TEXT NOT NULL DEFAULT 'COMBO_MERGE'
                CHECK (combo_trigger_mode IN ('COMBO_MERGE', 'THRESHOLD_STEP', 'EACH_EVENT')),
            priority INTEGER NOT NULL DEFAULT 10 CHECK (priority BETWEEN 1 AND 100),
            interrupt_policy TEXT NOT NULL DEFAULT 'QUEUE'
                CHECK (interrupt_policy IN ('QUEUE', 'PREEMPT_LOWER', 'DROP_IF_BUSY')),
            cooldown_ms INTEGER NOT NULL DEFAULT 0 CHECK (cooldown_ms >= 0),
            max_queue_per_rule INTEGER NOT NULL DEFAULT 5 CHECK (max_queue_per_rule >= 1),
            overlay_text_template TEXT NOT NULL DEFAULT '{senderName} đã tặng {giftCount}x {giftName}',
            is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
            FOREIGN KEY (animation_id) REFERENCES animations(id) ON DELETE RESTRICT
        );

        CREATE INDEX IF NOT EXISTS idx_gift_rules_matching
            ON gift_rules(character_id, is_enabled, trigger_gift_id, priority DESC);

        CREATE TABLE IF NOT EXISTS live_events (
            id TEXT PRIMARY KEY,
            external_event_id TEXT
                CHECK (external_event_id IS NULL OR length(trim(external_event_id)) > 0),
            source TEXT NOT NULL CHECK (source IN ('DEMO', 'TIKTOK', 'SYSTEM')),
            event_type TEXT NOT NULL CHECK (event_type IN ('GIFT', 'LIKE', 'CHAT', 'FOLLOW', 'SHARE')),
            sender_id TEXT NOT NULL,
            sender_name TEXT NOT NULL,
            sender_avatar_url TEXT,
            gift_id TEXT,
            gift_name TEXT,
            gift_count INTEGER NOT NULL DEFAULT 1 CHECK (gift_count >= 1),
            unit_coin_value INTEGER NOT NULL DEFAULT 0 CHECK (unit_coin_value >= 0),
            total_coin_value INTEGER NOT NULL DEFAULT 0 CHECK (total_coin_value >= 0),
            combo_group_id TEXT,
            is_combo_end INTEGER NOT NULL DEFAULT 1 CHECK (is_combo_end IN (0, 1)),
            process_status TEXT NOT NULL
                CHECK (process_status IN (
                    'RECEIVED', 'MATCHED', 'COALESCED_INTO_QUEUE',
                    'IGNORED_COMBO_BUFFERING', 'IGNORED_NO_RULE', 'IGNORED_COOLDOWN',
                    'DROPPED_BUSY', 'DROPPED_QUEUE_FULL'
                )),
            raw_payload_json TEXT NOT NULL,
            received_at TEXT NOT NULL,
            UNIQUE (source, external_event_id)
        );

        CREATE INDEX IF NOT EXISTS idx_live_events_received_at
            ON live_events(received_at DESC);

        CREATE TABLE IF NOT EXISTS event_executions (
            id TEXT PRIMARY KEY,
            live_event_id TEXT NOT NULL,
            gift_rule_id TEXT,
            character_id TEXT NOT NULL,
            animation_id TEXT NOT NULL,
            source TEXT NOT NULL CHECK (source IN ('DEMO', 'TIKTOK', 'SYSTEM')),
            sender_id TEXT NOT NULL,
            sender_name TEXT NOT NULL,
            gift_id TEXT,
            gift_name TEXT,
            merged_gift_count INTEGER NOT NULL DEFAULT 1 CHECK (merged_gift_count >= 1),
            priority INTEGER NOT NULL,
            status TEXT NOT NULL
                CHECK (status IN (
                    'QUEUED', 'DISPATCHED', 'PLAYING',
                    'COMPLETED', 'COMPLETED_WITH_FALLBACK',
                    'PREEMPTED', 'EVICTED_BY_PRIORITY',
                    'TIMED_OUT', 'FAILED', 'CANCELLED',
                    'SKIPPED_BY_MANAGER', 'CLEARED_BY_MANAGER'
                )),
            rendered_caption TEXT NOT NULL,
            expected_duration_ms INTEGER NOT NULL CHECK (expected_duration_ms > 0),
            queued_at TEXT NOT NULL,
            dispatched_at TEXT,
            started_at TEXT,
            finished_at TEXT,
            error_code TEXT,
            error_message TEXT,
            FOREIGN KEY (live_event_id) REFERENCES live_events(id) ON DELETE CASCADE,
            FOREIGN KEY (gift_rule_id) REFERENCES gift_rules(id) ON DELETE SET NULL,
            FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
            FOREIGN KEY (animation_id) REFERENCES animations(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_event_executions_status_queue
            ON event_executions(status, priority DESC, queued_at ASC);

        CREATE INDEX IF NOT EXISTS idx_event_executions_coalesce
            ON event_executions(status, gift_rule_id, source, sender_id, gift_id);

        CREATE INDEX IF NOT EXISTS idx_event_executions_live_event_id
            ON event_executions(live_event_id);
      `);

      // Seed duy nhất 1 nhân vật mẫu và 1 quy tắc quà Hoa Sen theo yêu cầu S2
      const now = new Date().toISOString();
      db.prepare(`
        INSERT OR IGNORE INTO characters (
          id, name, slug, description, model_path, thumbnail_path,
          visibility_mode, scale, position_json, rotation_json,
          default_idle_animation_id, is_active, created_at, updated_at
        ) VALUES (
          'char_sample_monk', 'Tiểu Sa Di', 'tieu-sa-di',
          'Nhân vật mẫu Cột mốc S2 — Tự xuất hiện khi có quà và biến mất',
          'sample-character.glb', NULL,
          'APPEAR_ON_EVENT', 1.0, '{"x":0,"y":-0.5,"z":0}', '{"x":0,"y":0,"z":0}',
          NULL, 1, @now, @now
        )
      `).run({ now });

      db.prepare(`
        INSERT OR IGNORE INTO animations (
          id, character_id, name, clip_name, category, duration_ms,
          loop_mode, repeat_count, blend_in_ms, blend_out_ms,
          sound_path, sound_volume, vfx_preset, is_enabled,
          created_at, updated_at
        ) VALUES (
          'anim_sample_pray', 'char_sample_monk', 'Chắp Tay Niệm Phật',
          'Pray', 'REACTION', 3500,
          'ONCE', 1, 250, 250,
          NULL, 1.0, NULL, 1,
          @now, @now
        )
      `).run({ now });

      db.prepare(`
        INSERT OR IGNORE INTO gift_rules (
          id, name, character_id, animation_id, trigger_gift_id,
          min_gift_count, min_coin_value, combo_trigger_mode,
          priority, interrupt_policy, cooldown_ms, max_queue_per_rule,
          overlay_text_template, is_enabled, created_at, updated_at
        ) VALUES (
          'rule_sample_lotus', 'Quà Tặng Hoa Sen', 'char_sample_monk', 'anim_sample_pray',
          'lotus', 1, 0, 'COMBO_MERGE',
          10, 'QUEUE', 0, 5,
          '{senderName} đã tặng {giftCount}x {giftName}', 1,
          @now, @now
        )
      `).run({ now });
    },
  },
  {
    id: '003_s5_queue_controls_and_adapters',
    up: (db: Database.Database) => {
      // 1. Kiểm tra xem status đã hỗ trợ SKIPPED_BY_MANAGER chưa
      // Bằng cách recreate bảng an toàn nếu đang dùng schema cũ
      db.exec(`
        CREATE TABLE IF NOT EXISTS event_executions_v2 (
            id TEXT PRIMARY KEY,
            live_event_id TEXT NOT NULL,
            gift_rule_id TEXT,
            character_id TEXT NOT NULL,
            animation_id TEXT NOT NULL,
            source TEXT NOT NULL CHECK (source IN ('DEMO', 'TIKTOK', 'SYSTEM')),
            sender_id TEXT NOT NULL,
            sender_name TEXT NOT NULL,
            gift_id TEXT,
            gift_name TEXT,
            merged_gift_count INTEGER NOT NULL DEFAULT 1 CHECK (merged_gift_count >= 1),
            priority INTEGER NOT NULL,
            status TEXT NOT NULL
                CHECK (status IN (
                    'QUEUED', 'DISPATCHED', 'PLAYING',
                    'COMPLETED', 'COMPLETED_WITH_FALLBACK',
                    'PREEMPTED', 'EVICTED_BY_PRIORITY',
                    'TIMED_OUT', 'FAILED', 'CANCELLED',
                    'SKIPPED_BY_MANAGER', 'CLEARED_BY_MANAGER'
                )),
            rendered_caption TEXT NOT NULL,
            expected_duration_ms INTEGER NOT NULL CHECK (expected_duration_ms > 0),
            queued_at TEXT NOT NULL,
            dispatched_at TEXT,
            started_at TEXT,
            finished_at TEXT,
            error_code TEXT,
            error_message TEXT,
            FOREIGN KEY (live_event_id) REFERENCES live_events(id) ON DELETE CASCADE,
            FOREIGN KEY (gift_rule_id) REFERENCES gift_rules(id) ON DELETE SET NULL,
            FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
            FOREIGN KEY (animation_id) REFERENCES animations(id) ON DELETE CASCADE
        );

        INSERT OR IGNORE INTO event_executions_v2 SELECT * FROM event_executions;
        DROP TABLE IF EXISTS event_executions;
        ALTER TABLE event_executions_v2 RENAME TO event_executions;

        CREATE INDEX IF NOT EXISTS idx_event_executions_status_queue
            ON event_executions(status, priority DESC, queued_at ASC);

        CREATE INDEX IF NOT EXISTS idx_event_executions_coalesce
            ON event_executions(status, gift_rule_id, source, sender_id, gift_id);

        CREATE INDEX IF NOT EXISTS idx_event_executions_live_event_id
            ON event_executions(live_event_id);

        -- 2. Seed cài đặt engine.queue_paused nếu chưa có
        INSERT OR IGNORE INTO app_settings (
          key, value_json, value_type, category, description, is_restart_required, updated_at
        ) VALUES (
          'engine.queue_paused', 'false', 'BOOLEAN', 'ENGINE',
          'Trạng thái tạm dừng điều phối hàng đợi (PAUSE / RESUME)', 0, datetime('now')
        );
      `);
    },
  },
];

export function runMigrations(db: Database.Database): string[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const existingRows = db
    .prepare('SELECT id FROM _schema_migrations ORDER BY id ASC')
    .all() as Array<{ id: string }>;
  const appliedSet = new Set(existingRows.map((row) => row.id));

  const recordStmt = db.prepare(
    'INSERT INTO _schema_migrations (id, applied_at) VALUES (?, ?)'
  );

  for (const migration of MIGRATIONS) {
    if (appliedSet.has(migration.id)) {
      continue;
    }
    const tx = db.transaction(() => {
      migration.up(db);
      recordStmt.run(migration.id, new Date().toISOString());
    });
    tx();
    appliedSet.add(migration.id);
  }

  const finalRows = db
    .prepare('SELECT id FROM _schema_migrations ORDER BY id ASC')
    .all() as Array<{ id: string }>;
  return finalRows.map((row) => row.id);
}
