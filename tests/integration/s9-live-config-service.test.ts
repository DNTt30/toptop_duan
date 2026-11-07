import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  LiveConfigService,
  NodeDevSecretCipher,
} from '../../apps/backend/src';
import {
  LiveConnectionSummarySchema,
  TikFinityConfigSchema,
  EulerStreamConfigSchema,
} from '../../packages/shared/src';

describe('Milestone S9 - T-30: LiveConfigService & Desktop Provider Configuration', () => {
  let tempBase: string;
  let cipher: NodeDevSecretCipher;
  let service: LiveConfigService;

  beforeEach(() => {
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bls-s9-config-'));
    cipher = new NodeDevSecretCipher();
    service = new LiveConfigService({
      baseDir: tempBase,
      cipher,
    });
  });

  afterEach(() => {
    if (fs.existsSync(tempBase)) {
      fs.rmSync(tempBase, { recursive: true, force: true });
    }
  });

  it('starts in DISCONNECTED state with no initial configuration', () => {
    const config = service.getConfig();
    expect(config).toBeNull();

    const summary = service.getConnectionSummary();
    expect(summary.provider).toBe('NONE');
    expect(summary.state).toBe('DISCONNECTED');
    expect(summary.hasApiKey).toBe(false);
    expect(summary.eventsReceived).toBe(0);
    expect(summary.lastEventAt).toBeNull();
    expect(summary.lastError).toBeNull();

    // Xác thực schema
    expect(LiveConnectionSummarySchema.safeParse(summary).success).toBe(true);
  });

  it('saves and loads valid TikFinity configuration targeting loopback host', () => {
    const saveResult = service.saveConfig({
      provider: 'TIKFINITY',
      endpointUrl: 'ws://127.0.0.1:21213',
      streamerUsername: '@streamer_vn',
      autoConnectOnStart: true,
      hasApiKey: false,
    });

    expect(saveResult.ok).toBe(true);
    expect(saveResult.config?.provider).toBe('TIKFINITY');

    const loaded = service.getConfig();
    expect(loaded).not.toBeNull();
    expect(loaded?.provider).toBe('TIKFINITY');
    expect(loaded?.endpointUrl).toBe('ws://127.0.0.1:21213');
    expect(loaded?.streamerUsername).toBe('@streamer_vn');
    expect(loaded?.hasApiKey).toBe(false);

    const summary = service.getConnectionSummary();
    expect(summary.provider).toBe('TIKFINITY');
    expect(summary.state).toBe('CONFIGURED');
    expect(summary.endpointUrl).toBe('ws://127.0.0.1:21213');
  });

  it('rejects TikFinity configuration targeting non-loopback external hosts', () => {
    const invalidResult = service.saveConfig({
      provider: 'TIKFINITY',
      endpointUrl: 'ws://external-hacker.com:21213',
      streamerUsername: '',
      autoConnectOnStart: false,
      hasApiKey: false,
    });

    expect(invalidResult.ok).toBe(false);
    expect(invalidResult.error).toContain('INVALID_TIKFINITY_ENDPOINT');

    // Không bị ghi đè cấu hình lỗi
    expect(service.getConfig()).toBeNull();
  });

  it('saves EulerStream configuration and requires streamerUsername', () => {
    // Thất bại nếu thiếu streamerUsername
    const missingUsernameRes = service.saveConfig({
      provider: 'EULERSTREAM',
      endpointUrl: 'wss://ws.eulerstream.com',
      streamerUsername: '',
      autoConnectOnStart: false,
      hasApiKey: false,
    });
    expect(missingUsernameRes.ok).toBe(false);
    expect(missingUsernameRes.error).toContain('Streamer username is required');

    // Thành công khi điền đủ thông tin
    const validRes = service.saveConfig({
      provider: 'EULERSTREAM',
      endpointUrl: 'wss://ws.eulerstream.com',
      streamerUsername: '@buddha_streamer',
      autoConnectOnStart: false,
      hasApiKey: false,
    });
    expect(validRes.ok).toBe(true);
    expect(service.getConfig()?.streamerUsername).toBe('@buddha_streamer');
  });

  it('securely encrypts EulerStream API key via DPAPI vault without exposing plaintext in config', () => {
    // 1. Lưu config EulerStream
    service.saveConfig({
      provider: 'EULERSTREAM',
      endpointUrl: 'wss://ws.eulerstream.com',
      streamerUsername: '@buddha_streamer',
      autoConnectOnStart: false,
      hasApiKey: false,
    });

    // 2. Lưu API Key bí mật
    const rawApiKey = 'euler_secret_key_abcdef1234567890';
    const keySaveResult = service.saveApiKey({
      provider: 'EULERSTREAM',
      apiKey: rawApiKey,
    });
    expect(keySaveResult.ok).toBe(true);

    // 3. Kiểm tra config file trên đĩa tuyệt đối không chứa rawApiKey
    const configDiskPath = path.join(tempBase, 'config', 'live-provider.json');
    const rawConfigDisk = fs.readFileSync(configDiskPath, 'utf8');
    expect(rawConfigDisk).not.toContain(rawApiKey);
    expect(rawConfigDisk).toContain('"hasApiKey": true');

    // 4. Kiểm tra vault file trên đĩa chứa dữ liệu mã hóa base64, không chứa plaintext
    const vaultDiskPath = path.join(tempBase, 'config', 'live-vault.enc');
    const rawVaultDisk = fs.readFileSync(vaultDiskPath, 'utf8');
    expect(rawVaultDisk).not.toContain(rawApiKey);

    // 5. Backend giải mã chính xác
    const decryptedKey = service.getApiKey('EULERSTREAM');
    expect(decryptedKey).toBe(rawApiKey);

    // 6. Tóm tắt kết nối Summary báo hasApiKey = true nhưng không để lộ secret
    const summary = service.getConnectionSummary();
    expect(summary.hasApiKey).toBe(true);
    expect(JSON.stringify(summary)).not.toContain(rawApiKey);
  });

  it('clears API key securely from vault and resets hasApiKey flag', () => {
    service.saveConfig({
      provider: 'EULERSTREAM',
      endpointUrl: 'wss://ws.eulerstream.com',
      streamerUsername: '@buddha_streamer',
      autoConnectOnStart: false,
      hasApiKey: false,
    });

    service.saveApiKey({
      provider: 'EULERSTREAM',
      apiKey: 'euler_secret_key_to_be_deleted_123',
    });
    expect(service.hasApiKey('EULERSTREAM')).toBe(true);

    // Xóa khóa
    const clearRes = service.clearApiKey('EULERSTREAM');
    expect(clearRes.ok).toBe(true);
    expect(service.hasApiKey('EULERSTREAM')).toBe(false);
    expect(service.getApiKey('EULERSTREAM')).toBeNull();

    // Summary cập nhật hasApiKey = false
    const summary = service.getConnectionSummary();
    expect(summary.hasApiKey).toBe(false);
  });

  it('tracks connection state lifecycle and incoming events accurately', () => {
    service.saveConfig({
      provider: 'TIKFINITY',
      endpointUrl: 'ws://127.0.0.1:21213',
      streamerUsername: '@buddha',
      autoConnectOnStart: false,
      hasApiKey: false,
    });

    expect(service.getConnectionSummary().state).toBe('CONFIGURED');

    service.updateConnectionState('CONNECTING');
    expect(service.getConnectionSummary().state).toBe('CONNECTING');

    service.updateConnectionState('CONNECTED');
    expect(service.getConnectionSummary().state).toBe('CONNECTED');

    // Ghi nhận sự kiện LIVE
    service.recordIncomingEvent();
    expect(service.getConnectionSummary().state).toBe('RECEIVING_EVENTS');
    expect(service.getConnectionSummary().eventsReceived).toBe(1);
    expect(service.getConnectionSummary().lastEventAt).not.toBeNull();

    service.recordIncomingEvent();
    expect(service.getConnectionSummary().eventsReceived).toBe(2);

    // Lỗi kết nối
    service.updateConnectionState('ERROR', 'ECONNREFUSED 127.0.0.1:21213');
    const errSummary = service.getConnectionSummary();
    expect(errSummary.state).toBe('ERROR');
    expect(errSummary.lastError).toBe('ECONNREFUSED 127.0.0.1:21213');
  });
});
