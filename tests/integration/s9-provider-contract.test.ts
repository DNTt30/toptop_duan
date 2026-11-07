import { describe, expect, it } from 'vitest';
import {
  LIVE_CONNECTION_STATES,
  LIVE_SUPPORTED_PROVIDERS,
  LiveConnectionStateSchema,
  LiveConnectionSummarySchema,
  LiveProviderApiKeyPayloadSchema,
  LiveProviderConfigSchema,
  LiveSupportedProviderSchema,
  TikFinityLoopbackUrlSchema,
  EulerStreamCloudUrlSchema,
} from '@buddhalive/shared';

describe('Milestone S9 — T-29: Live Provider Configuration Contract & Validation', () => {
  describe('1. Provider Separation & State Lifecycle', () => {
    it('defines exactly two supported live providers (TIKFINITY & EULERSTREAM) and excludes DEMO', () => {
      expect(LIVE_SUPPORTED_PROVIDERS).toEqual(['TIKFINITY', 'EULERSTREAM']);

      // DEMO không phải là một Live Provider
      const demoCheck = LiveSupportedProviderSchema.safeParse('DEMO');
      expect(demoCheck.success).toBe(false);

      // Thư viện reverse-engineered không được phép
      const connectorCheck = LiveSupportedProviderSchema.safeParse('TIKTOK_CONNECTOR');
      expect(connectorCheck.success).toBe(false);

      expect(LiveSupportedProviderSchema.parse('TIKFINITY')).toBe('TIKFINITY');
      expect(LiveSupportedProviderSchema.parse('EULERSTREAM')).toBe('EULERSTREAM');
    });

    it('defines all 7 mandatory connection lifecycle states', () => {
      expect(LIVE_CONNECTION_STATES).toEqual([
        'DISCONNECTED',
        'CONFIGURED',
        'CONNECTING',
        'CONNECTED',
        'RECEIVING_EVENTS',
        'RECONNECTING',
        'ERROR',
      ]);

      for (const state of LIVE_CONNECTION_STATES) {
        expect(LiveConnectionStateSchema.parse(state)).toBe(state);
      }

      // Trạng thái lạ bị từ chối
      expect(LiveConnectionStateSchema.safeParse('UNKNOWN_STATE').success).toBe(false);
    });
  });

  describe('2. TikFinity Provider-Specific Configuration & Loopback Enforcement', () => {
    it('parses valid default TikFinity config targeting ws://127.0.0.1:21213', () => {
      const parsed = LiveProviderConfigSchema.parse({
        provider: 'TIKFINITY',
      });

      expect(parsed.provider).toBe('TIKFINITY');
      expect(parsed.endpointUrl).toBe('ws://127.0.0.1:21213');
      expect(parsed.streamerUsername).toBe('');
      expect(parsed.autoConnectOnStart).toBe(false);
      expect(parsed.hasApiKey).toBe(false);
    });

    it('allows localhost and IPv6 loopback for TikFinity endpoint', () => {
      expect(TikFinityLoopbackUrlSchema.safeParse('ws://localhost:21213').success).toBe(true);
      expect(TikFinityLoopbackUrlSchema.safeParse('ws://127.0.0.1:21213').success).toBe(true);
      expect(TikFinityLoopbackUrlSchema.safeParse('ws://[::1]:21213').success).toBe(true);
      expect(TikFinityLoopbackUrlSchema.safeParse('wss://localhost:21213').success).toBe(true);
    });

    it('strictly REJECTS non-loopback or non-ws endpoints for TikFinity', () => {
      // Host ngoại vi nguy hiểm bị chặn
      const remote1 = TikFinityLoopbackUrlSchema.safeParse('ws://external-hacker.com:21213');
      expect(remote1.success).toBe(false);

      // Địa chỉ IP mạng LAN bị chặn (chỉ cho phép loopback của chính máy đó)
      const lanIp = TikFinityLoopbackUrlSchema.safeParse('ws://192.168.1.100:21213');
      expect(lanIp.success).toBe(false);

      // Sai giao thức (HTTP thay vì WebSocket)
      const httpProto = TikFinityLoopbackUrlSchema.safeParse('http://127.0.0.1:21213');
      expect(httpProto.success).toBe(false);
    });

    it('rejects TikFinity config with extra unexpected fields (strict schema)', () => {
      const result = LiveProviderConfigSchema.safeParse({
        provider: 'TIKFINITY',
        unexpectedToken: 'malicious_injection',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('3. EulerStream Provider-Specific Configuration & Cloud URL Validation', () => {
    it('parses valid EulerStream config with required streamerUsername', () => {
      const parsed = LiveProviderConfigSchema.parse({
        provider: 'EULERSTREAM',
        streamerUsername: 'thichminhtue_official',
      });

      expect(parsed.provider).toBe('EULERSTREAM');
      expect(parsed.endpointUrl).toBe('wss://ws.eulerstream.com');
      expect(parsed.streamerUsername).toBe('thichminhtue_official');
      expect(parsed.autoConnectOnStart).toBe(false);
      expect(parsed.hasApiKey).toBe(false);
    });

    it('strictly requires streamerUsername for EulerStream', () => {
      const missingUsername = LiveProviderConfigSchema.safeParse({
        provider: 'EULERSTREAM',
        streamerUsername: '',
      });
      expect(missingUsername.success).toBe(false);
    });

    it('validates EulerStream WebSocket protocol (ws: or wss:)', () => {
      expect(
        EulerStreamCloudUrlSchema.safeParse('wss://ws.eulerstream.com').success
      ).toBe(true);
      expect(
        EulerStreamCloudUrlSchema.safeParse('ws://custom-proxy.internal/v1/stream').success
      ).toBe(true);

      // Sai giao thức
      expect(
        EulerStreamCloudUrlSchema.safeParse('https://ws.eulerstream.com').success
      ).toBe(false);

      // URL rác
      expect(EulerStreamCloudUrlSchema.safeParse('not-a-valid-url').success).toBe(false);
    });
  });

  describe('4. Secret Separation & API Key Protection', () => {
    it('strictly REJECTS plaintext apiKey inside standard LiveProviderConfigSchema', () => {
      // Người dùng hoặc frontend không được phép gửi apiKey trong LiveProviderConfig
      const withKeyTikFinity = LiveProviderConfigSchema.safeParse({
        provider: 'TIKFINITY',
        apiKey: 'secret_key_leaked',
      });
      expect(withKeyTikFinity.success).toBe(false);

      const withKeyEuler = LiveProviderConfigSchema.safeParse({
        provider: 'EULERSTREAM',
        streamerUsername: 'streamer_01',
        apiKey: 'secret_key_leaked',
      });
      expect(withKeyEuler.success).toBe(false);
    });

    it('accepts API Key exclusively via isolated LiveProviderApiKeyPayloadSchema', () => {
      const validPayload = LiveProviderApiKeyPayloadSchema.parse({
        provider: 'EULERSTREAM',
        apiKey: 'euler_live_key_998877665544',
      });

      expect(validPayload.provider).toBe('EULERSTREAM');
      expect(validPayload.apiKey).toBe('euler_live_key_998877665544');

      // Từ chối key quá ngắn
      const shortKey = LiveProviderApiKeyPayloadSchema.safeParse({
        provider: 'EULERSTREAM',
        apiKey: 'short',
      });
      expect(shortKey.success).toBe(false);

      // Từ chối cấp API Key cho TikFinity (TikFinity không dùng API Key)
      const tikFinityKey = LiveProviderApiKeyPayloadSchema.safeParse({
        provider: 'TIKFINITY' as any,
        apiKey: 'some_key',
      });
      expect(tikFinityKey.success).toBe(false);
    });
  });

  describe('5. LiveConnectionSummarySchema for UI & Socket.IO State Snapshot', () => {
    it('validates safe UI summary payload with zero secret leakage', () => {
      const summary = LiveConnectionSummarySchema.parse({
        provider: 'TIKFINITY',
        state: 'CONNECTED',
        streamerUsername: '@thichminhtue',
        endpointUrl: 'ws://127.0.0.1:21213',
        hasApiKey: false,
        eventsReceived: 42,
        lastEventAt: '2026-11-01T13:20:00.000Z',
        lastError: null,
      });

      expect(summary.state).toBe('CONNECTED');
      expect(summary.eventsReceived).toBe(42);
      expect((summary as any).apiKey).toBeUndefined();
    });

    it('supports all 7 states in LiveConnectionSummary', () => {
      for (const state of LIVE_CONNECTION_STATES) {
        const summary = LiveConnectionSummarySchema.parse({
          provider: 'EULERSTREAM',
          state,
          streamerUsername: 'channel_1',
          endpointUrl: 'wss://ws.eulerstream.com/v1/stream',
          hasApiKey: true,
          eventsReceived: 0,
          lastEventAt: null,
          lastError: state === 'ERROR' ? 'Connection refused' : null,
        });
        expect(summary.state).toBe(state);
      }
    });
  });
});
