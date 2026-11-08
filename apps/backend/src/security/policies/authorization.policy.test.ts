import { describe, expect, it } from 'vitest';
import { AuthorizationPolicy, type AuthActor } from './authorization.policy';
import { OverlaySessionStore } from '../overlay-session-store';
import { NodeDevSecretCipher } from '../ciphers';

describe('AuthorizationPolicy (Single Source of Truth)', () => {
  const managerActor: AuthActor = { role: 'MANAGER', instanceId: 'manager-test-1' };
  const overlayActor: AuthActor = { role: 'OVERLAY', instanceId: 'overlay-test-1' };
  const publicActor: AuthActor = AuthorizationPolicy.publicActor();

  describe('Phân quyền theo vai trò (Role Permissions)', () => {
    it('cho phép Manager thực hiện toàn bộ sự kiện trong allowlist quản trị', () => {
      expect(AuthorizationPolicy.can(managerActor, 'demo:trigger_gift')).toBe(true);
      expect(AuthorizationPolicy.can(managerActor, 'settings:update')).toBe(true);
      expect(AuthorizationPolicy.can(managerActor, 'security:approve_overlay_pair')).toBe(true);
      expect(AuthorizationPolicy.can(managerActor, 'queue:control')).toBe(true);
      expect(AuthorizationPolicy.can(managerActor, 'HTTP_HEALTH_CHECK')).toBe(true);

      const authResult = AuthorizationPolicy.authorize(managerActor, 'demo:trigger_gift');
      expect(authResult.allowed).toBe(true);
      expect(authResult.errorCode).toBeUndefined();
    });

    it('cho phép Overlay thực hiện các sự kiện báo cáo thực thi', () => {
      expect(AuthorizationPolicy.can(overlayActor, 'overlay:telemetry')).toBe(true);
      expect(AuthorizationPolicy.can(overlayActor, 'overlay:execution_started')).toBe(true);
      expect(AuthorizationPolicy.can(overlayActor, 'overlay:execution_completed')).toBe(true);
      expect(AuthorizationPolicy.can(overlayActor, 'overlay:action_cancelled')).toBe(true);

      const authResult = AuthorizationPolicy.authorize(overlayActor, 'overlay:telemetry');
      expect(authResult.allowed).toBe(true);
    });

    it('cho phép Public chỉ thực hiện các action công khai hợp lệ', () => {
      expect(AuthorizationPolicy.can(publicActor, 'HTTP_HEALTH_CHECK')).toBe(true);
      expect(AuthorizationPolicy.can(publicActor, 'HTTP_PAIR_REQUEST')).toBe(true);
      expect(AuthorizationPolicy.can(publicActor, 'HTTP_SERVE_STATIC')).toBe(true);
    });

    it('chặn và báo lỗi FORBIDDEN_ROLE khi Overlay cố can thiệp quyền của Manager', () => {
      expect(AuthorizationPolicy.can(overlayActor, 'demo:trigger_gift')).toBe(false);
      expect(AuthorizationPolicy.can(overlayActor, 'queue:control')).toBe(false);

      const authResult = AuthorizationPolicy.authorize(overlayActor, 'demo:trigger_gift');
      expect(authResult.allowed).toBe(false);
      expect(authResult.errorCode).toBe('FORBIDDEN_ROLE');
    });

    it('chặn và báo lỗi FORBIDDEN_ROLE khi Manager cố giả lập sự kiện của Overlay', () => {
      expect(AuthorizationPolicy.can(managerActor, 'overlay:telemetry')).toBe(false);

      const authResult = AuthorizationPolicy.authorize(managerActor, 'overlay:telemetry');
      expect(authResult.allowed).toBe(false);
      expect(authResult.errorCode).toBe('FORBIDDEN_ROLE');
    });

    it('chặn và báo lỗi UNAUTHORIZED khi Public cố gọi action nội bộ', () => {
      expect(AuthorizationPolicy.can(publicActor, 'demo:trigger_gift')).toBe(false);
      expect(AuthorizationPolicy.can(publicActor, 'overlay:telemetry')).toBe(false);

      const authResult = AuthorizationPolicy.authorize(publicActor, 'demo:trigger_gift');
      expect(authResult.allowed).toBe(false);
      expect(authResult.errorCode).toBe('UNAUTHORIZED');
    });

    it('assertAllowed ném lỗi kèm errorCode chính xác', () => {
      expect(() => {
        AuthorizationPolicy.assertAllowed(overlayActor, 'demo:trigger_gift');
      }).toThrowError(/not permitted/);

      try {
        AuthorizationPolicy.assertAllowed(overlayActor, 'demo:trigger_gift');
      } catch (err: any) {
        expect(err.errorCode).toBe('FORBIDDEN_ROLE');
      }
    });
  });

  describe('Xác thực danh tính (Authentication Helpers)', () => {
    it('xác thực thành công Manager bằng token bí mật bảo vệ timing-attack', () => {
      const validActor = AuthorizationPolicy.authenticateManager('secret-token-123', 'secret-token-123', 'mgr-1');
      expect(validActor).not.toBeNull();
      expect(validActor?.role).toBe('MANAGER');
      expect(validActor?.instanceId).toBe('mgr-1');

      const invalidActor = AuthorizationPolicy.authenticateManager('wrong-token', 'secret-token-123');
      expect(invalidActor).toBeNull();

      const emptyActor = AuthorizationPolicy.authenticateManager('', 'secret-token-123');
      expect(emptyActor).toBeNull();
    });

    it('xác thực thành công Overlay qua SessionStore', () => {
      const cipher = new NodeDevSecretCipher();
      const mockLogger = {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      } as any;
      const tmpFile = 'D:/toptop_duan/test-results/test-overlay-session.dat';
      const store = new OverlaySessionStore(tmpFile, cipher, mockLogger);

      const issuedToken = store.issue();
      const validOverlay = AuthorizationPolicy.authenticateOverlay(issuedToken, store, 'overlay-node-1');

      expect(validOverlay).not.toBeNull();
      expect(validOverlay?.role).toBe('OVERLAY');
      expect(validOverlay?.instanceId).toBe('overlay-node-1');

      const invalidOverlay = AuthorizationPolicy.authenticateOverlay('invalid-overlay-token-length-greater-than-32-chars-long', store);
      expect(invalidOverlay).toBeNull();
    });
  });

  describe('Type Guards', () => {
    it('nhận diện chính xác sự kiện thuộc allowlist của Manager hay Overlay', () => {
      expect(AuthorizationPolicy.isManagerEvent('demo:trigger_gift')).toBe(true);
      expect(AuthorizationPolicy.isManagerEvent('overlay:telemetry')).toBe(false);

      expect(AuthorizationPolicy.isOverlayEvent('overlay:telemetry')).toBe(true);
      expect(AuthorizationPolicy.isOverlayEvent('demo:trigger_gift')).toBe(false);
      expect(AuthorizationPolicy.isOverlayEvent('unknown_event')).toBe(false);
    });
  });
});
