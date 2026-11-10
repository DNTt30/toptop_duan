import { describe, it, expect, beforeEach } from 'vitest';
import { AnimationController, STATE_PRIORITY, type AnimState } from '../engine/AnimationController';
import { type SpriteConfig } from '../data/sprites';

describe('AnimationController — Priority FSM & Action Events', () => {
  let mockCavemanConfig: SpriteConfig;

  beforeEach(() => {
    mockCavemanConfig = {
      unitId: 'stone_melee',
      name: 'Người Vượn Đập Gậy',
      age: 1,
      atlasPath: '/sprites/prehistoric/caveman_action_atlas.png',
      manifestPath: '/sprites/prehistoric/caveman_action_animation.json',
      format: 'FORGE_3_0',
      frameSize: { width: 256, height: 256 },
      anchor: { x: 0.5, y: 0.90 },
      hurtbox: { width: 64, height: 130, offsetX: 0, offsetY: -65 },
      hitbox: { x: -35, y: -190, width: 70, height: 190 },
      stridePx: 64,
      targetHeight: 200,
      flying: false,
      clips: {
        idle: { name: 'idle', startFrame: 0, frameCount: 4, fps: 8, loop: true },
        walk: { name: 'walk', startFrame: 8, frameCount: 8, fps: 12, loop: true, stridePx: 64 },
        attack: {
          name: 'attack',
          startFrame: 16,
          frameCount: 8,
          fps: 12,
          loop: false,
          hitFrame: 2,
          events: [
            { name: 'hit', frame: 2, atMs: 166, type: 'HIT_FRAME' },
            { name: 'sound_swing', frame: 1, atMs: 83, type: 'SOUND', sound: 'melee_swing' },
            { name: 'vfx_slash', frame: 2, atMs: 166, type: 'VFX', vfx: 'slash_spark' },
          ],
        },
        hurt: { name: 'hurt', startFrame: 24, frameCount: 3, fps: 12, loop: false },
        die: { name: 'die', startFrame: 27, frameCount: 5, fps: 10, loop: false },
      },
    };
  });

  it('AN-001: Bảng ưu tiên State Priority đúng thứ tự chuẩn xác', () => {
    expect(STATE_PRIORITY.DIE).toBe(100);
    expect(STATE_PRIORITY.HURT).toBe(80);
    expect(STATE_PRIORITY.ATTACK).toBe(60);
    expect(STATE_PRIORITY.WALK).toBe(40);
    expect(STATE_PRIORITY.IDLE).toBe(10);
  });

  it('AN-002: DIE có quyền lực tuyệt đối (ngắt ngay cả khi đang ATTACK)', () => {
    const ctrl = new AnimationController(mockCavemanConfig, 'ATTACK');
    expect(ctrl.state).toBe('ATTACK');

    const transitioned = ctrl.requestState('DIE');
    expect(transitioned).toBe(true);
    expect(ctrl.state).toBe('DIE');

    // Sau khi đã DIE, không thể chuyển sang bất kỳ trạng thái nào khác
    expect(ctrl.requestState('WALK')).toBe(false);
    expect(ctrl.state).toBe('DIE');
  });

  it('AN-003: ATTACK bảo vệ trọn vẹn clip đòn đánh (không bị ngắt bởi WALK hoặc HURT thường)', () => {
    const ctrl = new AnimationController(mockCavemanConfig, 'ATTACK');
    expect(ctrl.state).toBe('ATTACK');

    // WALK không thể ngắt ATTACK
    expect(ctrl.requestState('WALK')).toBe(false);
    expect(ctrl.state).toBe('ATTACK');
    expect(ctrl.queuedState).toBe('WALK');

    // Đòn đánh thường (HURT không có flag isHeavyHurt) không thể ngắt ATTACK
    expect(ctrl.requestState('HURT', false)).toBe(false);
    expect(ctrl.state).toBe('ATTACK');

    // Choáng nặng (isHeavyHurt = true) mới có thể ngắt ATTACK
    expect(ctrl.requestState('HURT', true)).toBe(true);
    expect(ctrl.state).toBe('HURT');
  });

  it('AN-004: Quét trúng sự kiện HIT_FRAME tại đúng frame 2 kèm hit-stop', () => {
    const ctrl = new AnimationController(mockCavemanConfig, 'ATTACK');
    // Frame 0: chưa có hit event
    let res = ctrl.update(0.01);
    expect(res.triggerHitEvent).toBe(false);
    expect(ctrl.hitStopTimer).toBe(0);

    // Tiến thời gian đến frame 2 (tại fps=12: frame 2 xuất hiện tại t >= 2 / 12 = 0.166s)
    res = ctrl.update(0.18);
    expect(res.frameIndex).toBe(2);
    expect(res.triggerHitEvent).toBe(true);
    expect(ctrl.hitStopTimer).toBeGreaterThan(0); // Hit-stop kích hoạt!

    // Sự kiện trong dispatched events phải có HIT_FRAME và VFX
    const hasHit = res.events.some(e => e.type === 'HIT_FRAME');
    expect(hasHit).toBe(true);
  });

  it('AN-005: Hoàn tất đòn đánh tự động chuyển sang queuedState', () => {
    const ctrl = new AnimationController(mockCavemanConfig, 'ATTACK');
    ctrl.requestState('WALK'); // Enqueue WALK
    expect(ctrl.queuedState).toBe('WALK');

    // Cho clip attack chạy hết (8 frame / 12 fps = 0.667s)
    ctrl.update(0.7);

    expect(ctrl.state).toBe('WALK');
    expect(ctrl.queuedState).toBeNull();
  });
});
