import { describe, expect, it } from 'vitest';
import {
  AppSettingSchema,
  DEFAULT_APP_SETTINGS,
  assertNonSensitiveSettingKey,
} from './app-setting';

describe('AppSetting schema & security key guard', () => {
  it('validates all 13 default seed settings under strict schema', () => {
    expect(DEFAULT_APP_SETTINGS).toHaveLength(13);
    const now = new Date().toISOString();
    for (const seed of DEFAULT_APP_SETTINGS) {
      const parsed = AppSettingSchema.parse({
        ...seed,
        updatedAt: now,
      });
      expect(parsed.key).toBe(seed.key);
    }
  });

  it('rejects sensitive keys containing token, secret, password, cookie, or api_key', () => {
    for (const badKey of [
      'security.overlayToken',
      'security.managerToken',
      'tiktok.session_cookie',
      'auth.password',
      'client.api_key',
    ]) {
      expect(() => assertNonSensitiveSettingKey(badKey)).toThrow(
        /FORBIDDEN_SENSITIVE_SETTING_KEY/
      );
    }
  });

  it('rejects unknown setting keys and unexpected extra properties (.strict())', () => {
    expect(() => assertNonSensitiveSettingKey('unknown.random_key')).toThrow(
      /UNKNOWN_SETTING_KEY/
    );

    const result = AppSettingSchema.safeParse({
      ...DEFAULT_APP_SETTINGS[0],
      updatedAt: new Date().toISOString(),
      unexpectedExtraField: 'evil',
    });
    expect(result.success).toBe(false);
  });
});
