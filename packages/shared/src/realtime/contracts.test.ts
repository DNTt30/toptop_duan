import { describe, expect, it } from 'vitest';
import {
  normalizeExternalEventId,
} from '../domain/execution';
import {
  DemoTriggerGiftPayloadSchema,
  DemoRunScenarioPayloadSchema,
  QueueControlPayloadSchema,
  MANAGER_EVENT_ALLOWLIST,
  ManagerHandshakeAuthSchema,
  OVERLAY_EVENT_ALLOWLIST,
  OverlayExecutionCompletedPayloadSchema,
  OverlayHandshakeAuthSchema,
  OverlayTelemetryPayloadSchema,
} from './contracts';

describe('S2 shared realtime contracts', () => {
  it('keeps manager and overlay allowlists disjoint', () => {
    const overlap = MANAGER_EVENT_ALLOWLIST.filter((name) =>
      (OVERLAY_EVENT_ALLOWLIST as readonly string[]).includes(name)
    );
    expect(overlap).toEqual([]);
  });

  it('accepts a valid demo gift payload and trims sender name', () => {
    const parsed = DemoTriggerGiftPayloadSchema.parse({ senderName: '  Minh Anh  ' });
    expect(parsed.senderName).toBe('Minh Anh');
  });

  it.each([
    [{ senderName: 'Minh Anh', isAdmin: true }, 'unknown field'],
    [{ senderName: '' }, 'empty'],
    [{ senderName: 'x'.repeat(49) }, 'too long'],
    [{ senderName: '<img src=x onerror=alert(1)>' }, 'html markup'],
    [{ senderName: 'Minh\u0000Anh' }, 'control char'],
    [{ senderName: 'Minh Anh', giftCount: 0 }, 'gift count below 1'],
    [{ senderName: 'Minh Anh', giftCount: 1.5 }, 'non-integer count'],
  ])('rejects invalid demo payload (%s, %s)', (payload) => {
    expect(DemoTriggerGiftPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects overlay handshake carrying a token field (strict)', () => {
    const result = OverlayHandshakeAuthSchema.safeParse({
      protocolVersion: '1.0',
      clientType: 'OVERLAY',
      instanceId: 'ovl_1',
      token: 'should-never-be-here',
    });
    expect(result.success).toBe(false);
  });

  it('requires a long manager token', () => {
    expect(
      ManagerHandshakeAuthSchema.safeParse({
        protocolVersion: '1.0',
        clientType: 'MANAGER',
        token: 'short',
        instanceId: 'mgr_1',
      }).success
    ).toBe(false);
  });

  it('requires fallbackReasonCode only for FALLBACK_2D completions', () => {
    const id = '7c1f3d2e-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
    expect(
      OverlayExecutionCompletedPayloadSchema.safeParse({
        executionId: id,
        completionMode: 'FALLBACK_2D',
        actualDurationMs: 4000,
      }).success
    ).toBe(false);
    expect(
      OverlayExecutionCompletedPayloadSchema.safeParse({
        executionId: id,
        completionMode: 'FALLBACK_2D',
        actualDurationMs: 4000,
        fallbackReasonCode: 'MODEL_LOAD_FAILED',
      }).success
    ).toBe(true);
    expect(
      OverlayExecutionCompletedPayloadSchema.safeParse({
        executionId: id,
        completionMode: 'PRIMARY_3D',
        actualDurationMs: 4000,
        fallbackReasonCode: 'MODEL_LOAD_FAILED',
      }).success
    ).toBe(false);
  });

  it('rejects telemetry with unknown fields', () => {
    expect(
      OverlayTelemetryPayloadSchema.safeParse({
        readyToPlay: true,
        webglAvailable: true,
        hack: 1,
      }).success
    ).toBe(false);
  });

  it.each([
    [undefined, null],
    [null, null],
    ['', null],
    ['   ', null],
    [42, null],
    ['  evt_1 ', 'evt_1'],
  ])('normalizes external_event_id %j → %j', (raw, expected) => {
    expect(normalizeExternalEventId(raw)).toBe(expected);
  });

  it('validates QueueControlPayloadSchema for all 4 actions and rejects unknown actions or extra fields', () => {
    for (const action of ['PAUSE', 'RESUME', 'SKIP', 'CLEAR']) {
      const res = QueueControlPayloadSchema.safeParse({ action, reason: 'Operator test' });
      expect(res.success).toBe(true);
    }
    expect(QueueControlPayloadSchema.safeParse({ action: 'INVALID_ACTION' }).success).toBe(false);
    expect(QueueControlPayloadSchema.safeParse({ action: 'PAUSE', extraField: 123 }).success).toBe(false);
  });

  it('validates DemoRunScenarioPayloadSchema for all 4 scenarios and rejects unknown scenarios', () => {
    for (const scenario of ['SINGLE_BURST', 'CONCURRENT_SENDERS', 'VIP_INTERRUPT', 'QUEUE_OVERLOAD']) {
      const res = DemoRunScenarioPayloadSchema.safeParse({ scenario });
      expect(res.success).toBe(true);
    }
    expect(DemoRunScenarioPayloadSchema.safeParse({ scenario: 'HACK' }).success).toBe(false);
  });
});
