import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_GRAPHICS,
  graphicsSettings,
  sanitizeGraphicsOptions,
} from '../data/graphicsSettings';
import { ParticleSystem } from '../engine/ParticleSystem';

describe('Giai đoạn A — GraphicsSettings & ParticleSystem VFX', () => {
  beforeEach(() => {
    graphicsSettings.reset();
  });

  it('sanitizeGraphicsOptions bảo vệ kiểu dữ liệu và giới hạn shakeIntensity', () => {
    const clean = sanitizeGraphicsOptions({
      shadows: false,
      glow: 'invalid',
      shakeIntensity: 99,
      particles: 123,
    });
    expect(clean.shadows).toBe(false);
    expect(clean.glow).toBe(DEFAULT_GRAPHICS.glow);
    expect(clean.particles).toBe(DEFAULT_GRAPHICS.particles);
    expect(clean.shakeIntensity).toBe(2);

    const low = sanitizeGraphicsOptions({ shakeIntensity: -5 });
    expect(low.shakeIntensity).toBe(0.25);
  });

  it('graphicsSettings hỗ trợ set, reset và subscribe đồng bộ', () => {
    let notified = 0;
    const unsub = graphicsSettings.subscribe(() => {
      notified++;
    });

    graphicsSettings.set('shadows', false);
    expect(graphicsSettings.get().shadows).toBe(false);
    expect(notified).toBe(1);

    graphicsSettings.reset();
    expect(graphicsSettings.get().shadows).toBe(true);
    expect(notified).toBe(2);
    unsub();
  });

  it('ParticleSystem phát đa lớp hiệu ứng và thu hồi hạt về pool khi hết thời gian', () => {
    const ps = new ParticleSystem();
    expect(ps.freeCount).toBe(ParticleSystem.MAX_PARTICLES);

    ps.spawnHitSparks(300, 540);
    ps.spawnExplosion(500, 520, 0xf97316, 48);
    ps.spawnFootDust(200, 540, 1);
    ps.spawnSlashArc(250, 540, 1);
    ps.spawnMuzzleFlash(260, 490, 1);

    expect(ps.activeParticles.length).toBeGreaterThan(20);
    expect(ps.screenFlash.alpha).toBeGreaterThan(0);

    // Chạy update đủ lâu để toàn bộ hạt hết life và thu hồi về pool
    for (let i = 0; i < 120; i++) {
      ps.update(1 / 60);
    }
    expect(ps.activeParticles.length).toBe(0);
    expect(ps.freeCount).toBe(ParticleSystem.MAX_PARTICLES);
    expect(ps.screenFlash.alpha).toBe(0);
  });

  it('ParticleSystem tôn trọng cài đặt tắt hạt, tắt phát sáng và tắt rung màn hình', () => {
    const ps = new ParticleSystem();

    graphicsSettings.set('particles', false);
    ps.spawnExplosion(400, 500, 0xf97316, 48);
    expect(ps.activeParticles.length).toBe(0);

    graphicsSettings.set('particles', true);
    graphicsSettings.set('glow', false);
    ps.spawnHitSparks(400, 540);
    // Khi tắt glow: không có hạt GLOW hoặc additive
    expect(ps.activeParticles.every((p) => p.shape !== 'GLOW' && !p.additive)).toBe(true);

    ps.update(0.1);
    const strongShake = ps.getShakeOffset(8);
    expect(Math.hypot(strongShake.x, strongShake.y)).toBeGreaterThan(0);

    graphicsSettings.set('screenShake', false);
    const disabledShake = ps.getShakeOffset(8);
    expect(disabledShake).toEqual({ x: 0, y: 0, rot: 0 });
  });

  it('graphicsSettings hỗ trợ preset Thấp / Trung bình / Cao và Custom', () => {
    expect(graphicsSettings.getQuality()).toBe('HIGH');

    graphicsSettings.setQuality('LOW');
    expect(graphicsSettings.getQuality()).toBe('LOW');
    expect(graphicsSettings.get().particles).toBe(false);
    expect(graphicsSettings.get().glow).toBe(false);

    graphicsSettings.setQuality('MEDIUM');
    expect(graphicsSettings.getQuality()).toBe('MEDIUM');
    expect(graphicsSettings.get().particles).toBe(true);
    expect(graphicsSettings.get().motionTrails).toBe(false);

    graphicsSettings.set('motionTrails', true);
    expect(graphicsSettings.getQuality()).toBe('CUSTOM');
  });

  it('triggerUltimateIntro không lóe trắng che màn hình', () => {
    const ps = new ParticleSystem();
    ps.triggerUltimateIntro('Mưa Thiên Thạch', 0xf97316);
    expect(ps.ultimateIntro.active).toBe(true);
    expect(ps.screenFlash.alpha).toBe(0);
  });
});
