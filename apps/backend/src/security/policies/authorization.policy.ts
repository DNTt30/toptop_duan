import {
  MANAGER_EVENT_ALLOWLIST,
  OVERLAY_EVENT_ALLOWLIST,
  type ClientRole,
  type ManagerInboundEvent,
  type OverlayInboundEvent,
  type SocketErrorCode,
} from '@buddhalive/shared';
import { constantTimeEquals } from '../tokens';
import type { OverlaySessionStore } from '../overlay-session-store';

/**
 * Định nghĩa tập hợp các vai trò người dùng trong hệ thống BuddhaLive.
 * Single Source of Truth cho toàn bộ phân quyền.
 */
export type AuthRole = 'MANAGER' | 'OVERLAY' | 'PUBLIC';

/**
 * Các hành động HTTP endpoints bảo vệ.
 */
export const HTTP_ACTIONS = [
  'HTTP_HEALTH_CHECK',
  'HTTP_PAIR_REQUEST',
  'HTTP_SERVE_STATIC',
  'HTTP_SERVE_ASSET',
  'HTTP_MANAGE_SETTINGS',
  'HTTP_DIAGNOSTICS',
] as const;
export type HttpAction = (typeof HTTP_ACTIONS)[number];

/**
 * Toàn bộ hành động trong hệ thống: bao gồm Socket events và HTTP actions.
 */
export type SystemAction = ManagerInboundEvent | OverlayInboundEvent | HttpAction;

/**
 * Đại diện cho một tác nhân (Actor) đã hoặc chưa xác thực danh tính.
 */
export interface AuthActor {
  readonly role: AuthRole;
  readonly instanceId?: string;
  readonly overlaySessionId?: string;
  readonly authenticatedAt?: string;
}

/**
 * Kết quả phân quyền chi tiết.
 */
export interface AuthorizationResult {
  readonly allowed: boolean;
  readonly errorCode?: SocketErrorCode;
  readonly reason?: string;
}

/**
 * BẢNG PHÂN QUYỀN TẬP TRUNG (SINGLE SOURCE OF TRUTH)
 * Mọi quy tắc "Ai được làm gì" được định nghĩa duy nhất tại đây.
 */
const ROLE_PERMISSIONS: Record<AuthRole, ReadonlySet<SystemAction>> = {
  MANAGER: new Set<SystemAction>([
    ...MANAGER_EVENT_ALLOWLIST,
    'HTTP_HEALTH_CHECK',
    'HTTP_SERVE_STATIC',
    'HTTP_SERVE_ASSET',
    'HTTP_MANAGE_SETTINGS',
    'HTTP_DIAGNOSTICS',
  ]),
  OVERLAY: new Set<SystemAction>([
    ...OVERLAY_EVENT_ALLOWLIST,
    'HTTP_HEALTH_CHECK',
    'HTTP_SERVE_STATIC',
    'HTTP_SERVE_ASSET',
  ]),
  PUBLIC: new Set<SystemAction>([
    'HTTP_HEALTH_CHECK',
    'HTTP_PAIR_REQUEST',
    'HTTP_SERVE_STATIC',
    'HTTP_SERVE_ASSET',
  ]),
};

/**
 * Policy kiểm soát phân quyền tập trung cho BuddhaLive.
 * Tuân thủ quy tắc kiến trúc Single Source of Truth.
 */
export class AuthorizationPolicy {
  /**
   * Tạo Actor công khai (chưa xác thực).
   */
  public static publicActor(): AuthActor {
    return { role: 'PUBLIC' };
  }

  /**
   * Xác thực và tạo Manager Actor từ Manager Token.
   */
  public static authenticateManager(
    providedToken: string | null | undefined,
    expectedToken: string,
    instanceId?: string
  ): AuthActor | null {
    if (!providedToken || !expectedToken) {
      return null;
    }
    if (!constantTimeEquals(providedToken, expectedToken)) {
      return null;
    }
    return {
      role: 'MANAGER',
      instanceId,
      authenticatedAt: new Date().toISOString(),
    };
  }

  /**
   * Xác thực và tạo Overlay Actor từ Overlay Session Token.
   */
  public static authenticateOverlay(
    providedToken: string | null | undefined,
    sessionStore: OverlaySessionStore,
    instanceId?: string
  ): AuthActor | null {
    if (!providedToken) {
      return null;
    }
    if (!sessionStore.isValid(providedToken)) {
      return null;
    }
    return {
      role: 'OVERLAY',
      instanceId,
      authenticatedAt: new Date().toISOString(),
    };
  }

  /**
   * Kiểm tra nhanh: Actor có quyền thực hiện action này không?
   */
  public static can(actor: AuthActor, action: SystemAction): boolean {
    const permissions = ROLE_PERMISSIONS[actor.role];
    if (!permissions) {
      return false;
    }
    return permissions.has(action);
  }

  /**
   * Ủy quyền hành động và trả về mã lỗi Socket chuẩn nếu thất bại.
   */
  public static authorize(actor: AuthActor, action: SystemAction): AuthorizationResult {
    // 1. Kiểm tra actor có role hợp lệ
    if (!actor || !actor.role) {
      return {
        allowed: false,
        errorCode: 'UNAUTHORIZED',
        reason: 'Missing or invalid authentication actor',
      };
    }

    // 2. Kiểm tra quyền cụ thể theo bảng phân quyền
    const permissions = ROLE_PERMISSIONS[actor.role];
    if (!permissions || !permissions.has(action)) {
      // Phân định mã lỗi phù hợp
      if (actor.role === 'PUBLIC') {
        return {
          allowed: false,
          errorCode: 'UNAUTHORIZED',
          reason: `Action '${action}' requires authenticated role`,
        };
      }
      return {
        allowed: false,
        errorCode: 'FORBIDDEN_ROLE',
        reason: `Role '${actor.role}' is not permitted to perform action '${action}'`,
      };
    }

    return { allowed: true };
  }

  /**
   * Throw error nếu actor không có quyền thực hiện action.
   */
  public static assertAllowed(actor: AuthActor, action: SystemAction): void {
    const result = this.authorize(actor, action);
    if (!result.allowed) {
      const err = new Error(result.reason || `Action '${action}' forbidden for role '${actor.role}'`);
      (err as any).errorCode = result.errorCode || 'FORBIDDEN_ROLE';
      throw err;
    }
  }

  /**
   * Kiểm tra xem sự kiện socket có thuộc quyền của Manager hay không.
   */
  public static isManagerEvent(eventName: string): eventName is ManagerInboundEvent {
    return (MANAGER_EVENT_ALLOWLIST as readonly string[]).includes(eventName);
  }

  /**
   * Kiểm tra xem sự kiện socket có thuộc quyền của Overlay hay không.
   */
  public static isOverlayEvent(eventName: string): eventName is OverlayInboundEvent {
    return (OVERLAY_EVENT_ALLOWLIST as readonly string[]).includes(eventName);
  }
}
