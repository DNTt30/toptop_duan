import {
  AppSettingSchema,
  assertNonSensitiveSettingKey,
  type AppSetting,
  type AppSettingKey,
} from '@buddhalive/shared';
import type Database from 'better-sqlite3';

interface AppSettingRow {
  key: string;
  value_json: string;
  value_type: string;
  category: string;
  description: string;
  is_restart_required: number;
  updated_at: string;
}

function mapRowToAppSetting(row: AppSettingRow): AppSetting {
  return AppSettingSchema.parse({
    key: row.key,
    valueJson: row.value_json,
    valueType: row.value_type,
    category: row.category,
    description: row.description,
    isRestartRequired: row.is_restart_required === 1,
    updatedAt: row.updated_at,
  });
}

export class AppSettingRepository {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  public listAll(): AppSetting[] {
    const rows = this.db
      .prepare('SELECT * FROM app_settings ORDER BY category ASC, key ASC')
      .all() as AppSettingRow[];
    return rows.map(mapRowToAppSetting);
  }

  public get(rawKey: string): AppSetting | null {
    const key: AppSettingKey = assertNonSensitiveSettingKey(rawKey);
    const row = this.db
      .prepare('SELECT * FROM app_settings WHERE key = ?')
      .get(key) as AppSettingRow | undefined;
    return row ? mapRowToAppSetting(row) : null;
  }

  public updateValue(
    rawKey: string,
    valueJson: string,
    nowIso: string = new Date().toISOString()
  ): AppSetting {
    const key: AppSettingKey = assertNonSensitiveSettingKey(rawKey);
    // Validate that valueJson is valid JSON before storing
    JSON.parse(valueJson);

    const result = this.db
      .prepare(
        'UPDATE app_settings SET value_json = ?, updated_at = ? WHERE key = ?'
      )
      .run(valueJson, nowIso, key);

    if (result.changes === 0) {
      throw new Error(`SETTING_NOT_FOUND: Setting "${key}" does not exist`);
    }

    const updated = this.get(key);
    if (!updated) {
      throw new Error(`SETTING_READBACK_FAILED: Setting "${key}" missing after update`);
    }
    return updated;
  }

  public set(
    rawKey: string,
    value: unknown,
    category: 'SERVER' | 'OVERLAY' | 'ENGINE' | 'AUDIO' | 'DEMO' | 'RETENTION' = 'ENGINE',
    nowIso: string = new Date().toISOString()
  ): AppSetting {
    const key: AppSettingKey = assertNonSensitiveSettingKey(rawKey);
    const valueJson = JSON.stringify(value);
    const valueType =
      typeof value === 'boolean'
        ? 'BOOLEAN'
        : typeof value === 'number'
        ? 'NUMBER'
        : typeof value === 'string'
        ? 'STRING'
        : 'JSON';

    this.db
      .prepare(`
        INSERT INTO app_settings (key, value_json, value_type, category, description, is_restart_required, updated_at)
        VALUES (?, ?, ?, ?, 'Dynamic app setting', 0, ?)
        ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
      `)
      .run(key, valueJson, valueType, category, nowIso);

    const updated = this.get(key);
    if (!updated) {
      throw new Error(`SETTING_READBACK_FAILED: Setting "${key}" missing after upsert`);
    }
    return updated;
  }
}
