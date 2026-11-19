/**
 * The Singularity Odyssey — Combat Particle System & Pooled VFX Engine
 *
 * Object Pool tĩnh (không cấp phát mới trong vòng lặp 60Hz):
 * - Particle Pool (900 hạt): Tia lửa, bụi gót chân, khói, mảnh vụn, tàn lửa môi trường
 * - Slash VFX Pool (24 vệt chém 3 biến thể, xoay ±15°, 80-120ms, Additive blending)
 * - Reward Orb Pool (48 xu vàng & orb XP xanh bay theo đường cong Quadratic Bezier về HUD)
 * - Trauma & Micro Screen Shake (2-3px trong 100ms cho đòn kill / đòn nặng)
 */

import { type Team } from '../data/ages';
import { CONFIG } from '../data/combatFeelConfig';
import { graphicsSettings } from '../data/graphicsSettings';

export type ParticleShape = 'CIRCLE' | 'STAR' | 'RING' | 'SPARK' | 'STREAK' | 'GLOW' | 'SMOKE' | 'DEBRIS';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
  size: number;
  alpha: number;
  baseAlpha: number;
  life: number;
  maxLife: number;
  shape: ParticleShape;
  active: boolean;
  additive: boolean;
  gravity: number;
  drag: number;
  grow: number;
  rotation: number;
  spin: number;
}

export type HitVfxTier = 'NORMAL' | 'HEAVY' | 'KILL';

export interface SlashEffect {
  x: number;
  y: number;
  dir: number;
  variant: number; // 0 | 1 | 2
  rotation: number; // radian (±15 deg)
  scale: number;
  color: number;
  life: number;
  maxLife: number; // 60..125ms theo tier
  alpha: number;
  tier: HitVfxTier;
  active: boolean;
}

export interface RewardOrb {
  kind: 'GOLD' | 'XP';
  team: Team;
  worldX: number;
  startY: number;
  ctrlOffsetX: number;
  arcHeight: number;
  targetScreenX: number;
  targetScreenY: number;
  screenX: number;
  screenY: number;
  elapsed: number;
  duration: number;
  spin: number;
  scale: number;
  mergedCount: number;
  active: boolean;
}

export interface UltimateIntroBanner {
  active: boolean;
  name: string;
  themeColor: number;
  timer: number;
  duration: number;
}

export interface ScreenFlash {
  color: number;
  alpha: number;
  decay: number;
}

interface EmitOptions {
  speed?: number;
  life?: number;
  size?: number;
  additive?: boolean;
  gravity?: number;
  drag?: number;
  grow?: number;
  alpha?: number;
  angle?: number;
  spread?: number;
  jitter?: number;
}

export class ParticleSystem {
  public static readonly MAX_PARTICLES = 900;
  private pool: Particle[] = [];
  public activeParticles: Particle[] = [];

  // Pool Slash VFX (3 biến thể, additive)
  private slashPool: SlashEffect[] = [];
  public activeSlashes: SlashEffect[] = [];

  // Pool Xu vàng & Orb XP bay cong Bezier về HUD
  private orbPool: RewardOrb[] = [];
  public activeRewardOrbs: RewardOrb[] = [];
  private rewardListeners: Array<(team: Team, kind: 'GOLD' | 'XP') => void> = [];
  public cameraX: number = 0;

  // Rung màn hình micro 2-3px trong 100ms (cho đòn kill / đòn nặng)
  public microShakeTimer: number = 0;
  public microShakeDuration: number = CONFIG.hitFeedback.shakeDurationMs / 1000;
  public microShakeAmpPx: number = 0;

  // Màn giới thiệu chiêu cuối
  public ultimateIntro: UltimateIntroBanner = {
    active: false,
    name: '',
    themeColor: 0xf59e0b,
    timer: 0,
    duration: 0.8,
  };

  /** Lóe sáng toàn màn hình (chiêu cuối, nổ lớn) */
  public screenFlash: ScreenFlash = { color: 0xffffff, alpha: 0, decay: 3 };

  /** Bộ đếm thời gian nội bộ */
  public time: number = 0;
  public screenShakeEnabled: boolean = true;

  constructor() {
    for (let i = 0; i < ParticleSystem.MAX_PARTICLES; i++) {
      this.pool.push(ParticleSystem.blank());
    }
    for (let i = 0; i < CONFIG.slashVfx.poolSize; i++) {
      this.slashPool.push({
        x: 0,
        y: 0,
        dir: 1,
        variant: 0,
        rotation: 0,
        scale: 1,
        color: 0xffffff,
        life: 0,
        maxLife: 0.08,
        alpha: 0,
        tier: 'NORMAL',
        active: false,
      });
    }
    for (let i = 0; i < CONFIG.death.orbPoolSize; i++) {
      this.orbPool.push({
        kind: 'GOLD',
        team: 'LEFT',
        worldX: 0,
        startY: 500,
        ctrlOffsetX: 0,
        arcHeight: CONFIG.death.orbArcHeightPx,
        targetScreenX: 110,
        targetScreenY: 115,
        screenX: 0,
        screenY: 0,
        elapsed: 0,
        duration: CONFIG.death.orbFlightMs / 1000,
        spin: 0,
        scale: 1,
        mergedCount: 1,
        active: false,
      });
    }
  }

  private static blank(): Particle {
    return {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      color: 0xffffff,
      size: 4,
      alpha: 1,
      baseAlpha: 1,
      life: 0,
      maxLife: 1,
      shape: 'CIRCLE',
      active: false,
      additive: false,
      gravity: 120,
      drag: 0,
      grow: 0,
      rotation: 0,
      spin: 0,
    };
  }

  public get freeCount(): number {
    return this.pool.length;
  }

  private get particlesOn(): boolean {
    return graphicsSettings.get().particles;
  }

  private get glowOn(): boolean {
    return graphicsSettings.get().glow;
  }

  public subscribeRewardArrive(cb: (team: Team, kind: 'GOLD' | 'XP') => void): () => void {
    this.rewardListeners.push(cb);
    return () => {
      this.rewardListeners = this.rewardListeners.filter((l) => l !== cb);
    };
  }

  /**
   * Rung màn hình cục bộ 2-3px trong 100ms cho đòn kết liễu hoặc đòn nặng
   */
  public triggerMicroShake(
    ampPx: number = CONFIG.hitFeedback.heavyShakePx,
    durationMs: number = CONFIG.hitFeedback.shakeDurationMs
  ): void {
    if (!this.screenShakeEnabled || !graphicsSettings.get().screenShake) return;
    if (ampPx >= this.microShakeAmpPx || this.microShakeTimer <= 0) {
      this.microShakeAmpPx = ampPx;
      this.microShakeDuration = Math.max(0.02, durationMs / 1000);
      this.microShakeTimer = this.microShakeDuration;
    }
  }

  /** Bộ phát hạt tổng quát có cấu hình chi tiết */
  public burst(x: number, y: number, count: number, color: number, shape: ParticleShape, o: EmitOptions = {}): void {
    if (!this.particlesOn) return;
    const speed = o.speed ?? 80;
    const life = o.life ?? 0.5;
    const size = o.size ?? 4;
    let additive = o.additive ?? false;
    if (additive && !this.glowOn) {
      if (shape === 'GLOW') return;
      additive = false;
    }
    const spread = o.spread ?? Math.PI * 2;
    const center = o.angle ?? 0;
    const jitter = o.jitter ?? 0;

    for (let i = 0; i < count; i++) {
      const p = this.pool.pop();
      if (!p) break;

      const angle = spread >= Math.PI * 2 ? Math.random() * Math.PI * 2 : center + (Math.random() - 0.5) * spread;
      const spd = (0.35 + Math.random() * 0.65) * speed;

      p.x = x + (jitter ? (Math.random() - 0.5) * jitter * 2 : 0);
      p.y = y + (jitter ? (Math.random() - 0.5) * jitter : 0);
      p.vx = Math.cos(angle) * spd;
      p.vy = Math.sin(angle) * spd;
      p.color = color;
      p.shape = shape;
      p.size = size * (0.65 + Math.random() * 0.7);
      p.baseAlpha = o.alpha ?? 1.0;
      p.alpha = p.baseAlpha;
      p.life = 0;
      p.maxLife = life * (0.85 + Math.random() * 0.3);
      p.active = true;
      p.additive = additive;
      p.gravity = o.gravity ?? 120;
      p.drag = o.drag ?? 0;
      p.grow = o.grow ?? 0;
      p.rotation = Math.random() * Math.PI * 2;
      p.spin = (Math.random() - 0.5) * 14;

      this.activeParticles.push(p);
    }
  }

  public emit(
    x: number,
    y: number,
    count: number,
    color: number,
    shape: 'CIRCLE' | 'STAR' | 'RING' | 'SPARK' = 'CIRCLE',
    speed: number = 80,
    lifeTime: number = 0.5,
    size: number = 4
  ): void {
    this.burst(x, y, count, color, shape, { speed, life: lifeTime, size });
  }

  /**
   * Hạng mục 4 & C: Sinh vệt chém Slash VFX 3 mức (NORMAL: 60-80ms ngắn | HEAVY: 85-115ms to | KILL: 100-125ms cực đại)
   * tại đúng điểm chạm vũ khí, 3 biến thể, xoay ±15°, Additive blending.
   */
  public spawnSlashVfx(
    contactX: number,
    contactY: number,
    dir: number,
    color: number = 0xfef08a,
    tier: HitVfxTier = 'NORMAL'
  ): void {
    if (!this.particlesOn) return;
    const s = this.slashPool.pop();
    if (!s) return;

    const minMs =
      tier === 'KILL'
        ? CONFIG.slashVfx.killMinLifeMs
        : tier === 'HEAVY'
        ? CONFIG.slashVfx.heavyMinLifeMs
        : CONFIG.slashVfx.normalMinLifeMs;
    const maxMs =
      tier === 'KILL'
        ? CONFIG.slashVfx.killMaxLifeMs
        : tier === 'HEAVY'
        ? CONFIG.slashVfx.heavyMaxLifeMs
        : CONFIG.slashVfx.normalMaxLifeMs;
    const baseScale =
      tier === 'KILL'
        ? CONFIG.slashVfx.killScale
        : tier === 'HEAVY'
        ? CONFIG.slashVfx.heavyScale
        : CONFIG.slashVfx.normalScale;

    const lifeSec = (minMs + Math.random() * Math.max(1, maxMs - minMs)) / 1000;
    const jitterRad = ((Math.random() * 2 - 1) * CONFIG.slashVfx.rotationJitterDeg * Math.PI) / 180;

    s.x = contactX;
    s.y = contactY;
    s.dir = dir;
    s.variant = Math.floor(Math.random() * CONFIG.slashVfx.variants);
    s.rotation = jitterRad;
    s.scale = baseScale * (0.94 + Math.random() * 0.14);
    s.color = color;
    s.life = 0;
    s.maxLife = lifeSec;
    s.alpha = 1.0;
    s.tier = tier;
    s.active = true;

    this.activeSlashes.push(s);
  }

  /**
   * Hạng mục 4 & C: Tia lửa va chạm theo thang 3 mức (NORMAL / HEAVY / KILL) tại điểm chạm vũ khí + bụi đất ở chân
   */
  public spawnHitSparks(
    contactX: number,
    contactY: number,
    color: number = 0xffe066,
    footY?: number,
    tier: HitVfxTier = 'NORMAL'
  ): void {
    const cy = footY !== undefined ? contactY : contactY - 38;
    const groundY = footY !== undefined ? footY : contactY;

    const minSparks =
      tier === 'KILL'
        ? CONFIG.slashVfx.killSparkMin
        : tier === 'HEAVY'
        ? CONFIG.slashVfx.heavySparkMin
        : CONFIG.slashVfx.normalSparkMin;
    const maxSparks =
      tier === 'KILL'
        ? CONFIG.slashVfx.killSparkMax
        : tier === 'HEAVY'
        ? CONFIG.slashVfx.heavySparkMax
        : CONFIG.slashVfx.normalSparkMax;

    const sparkCount = minSparks + Math.floor(Math.random() * Math.max(1, maxSparks - minSparks + 1));
    const sparkLifeSec =
      (CONFIG.slashVfx.sparkMinLifeMs +
        Math.random() * (CONFIG.slashVfx.sparkMaxLifeMs - CONFIG.slashVfx.sparkMinLifeMs)) /
      1000;
    const sparkSpeed = tier === 'KILL' ? 370 : tier === 'HEAVY' ? 325 : 265;
    const sparkSize = tier === 'KILL' ? 7.2 : tier === 'HEAVY' ? 6.4 : 5.2;

    this.burst(contactX, cy, sparkCount, color, 'STREAK', {
      speed: sparkSpeed,
      life: sparkLifeSec,
      size: sparkSize,
      additive: true,
      gravity: 540,
      drag: 3.2,
      alpha: 0.94,
    });

    if (tier === 'HEAVY' || tier === 'KILL') {
      this.burst(contactX, cy, 1, tier === 'KILL' ? 0xfef08a : 0xffffff, 'GLOW', {
        speed: 0,
        life: tier === 'KILL' ? 0.14 : 0.10,
        size: tier === 'KILL' ? 22 : 16,
        additive: true,
        gravity: 0,
        grow: tier === 'KILL' ? 75 : 50,
        alpha: 0.75,
      });
    }

    this.burst(contactX, groundY - 4, tier === 'NORMAL' ? 2 : 3, 0xa8a29e, 'SMOKE', {
      speed: 36,
      life: 0.34,
      size: 4.4,
      gravity: -22,
      drag: 2.8,
      grow: 13,
      alpha: 0.34,
      angle: -Math.PI / 2,
      spread: Math.PI,
      jitter: 6,
    });
  }

  /**
   * Hạng mục 5 & E: Xu vàng & Orb XP xanh bắn ra và bay theo đường cong Quadratic Bezier về HUD.
   * Giới hạn pool tối đa 40 hạt (CONFIG.death.orbPoolSize = 40), tự động gộp xu/orb khi vượt giới hạn.
   */
  public spawnRewardOrbs(
    worldX: number,
    worldY: number,
    beneficiaryTeam: Team,
    goldCount: number,
    xpCount: number
  ): void {
    if (!this.particlesOn) return;
    // Mục tiêu màn hình chuẩn 1280x720 về khối tài nguyên HUD của phe hưởng thưởng
    const goldTarget = beneficiaryTeam === 'LEFT' ? { x: 86, y: 112 } : { x: 1125, y: 58 };
    const xpTarget = beneficiaryTeam === 'LEFT' ? { x: 256, y: 112 } : { x: 1205, y: 58 };

    const pushOrb = (kind: 'GOLD' | 'XP', idx: number) => {
      if (this.activeRewardOrbs.length >= CONFIG.death.orbPoolSize || this.orbPool.length === 0) {
        // Tự động gộp vào hạt đang bay cùng loại & cùng phe (ưu tiên hạt mới sinh nhất)
        let mergeCandidate: RewardOrb | null = null;
        for (let i = this.activeRewardOrbs.length - 1; i >= 0; i--) {
          const existing = this.activeRewardOrbs[i]!;
          if (existing.active && existing.kind === kind && existing.team === beneficiaryTeam) {
            if (!mergeCandidate || existing.elapsed < mergeCandidate.elapsed) {
              mergeCandidate = existing;
            }
          }
        }
        if (!mergeCandidate && this.activeRewardOrbs.length > 0) {
          mergeCandidate = this.activeRewardOrbs[this.activeRewardOrbs.length - 1]!;
        }
        if (mergeCandidate) {
          mergeCandidate.mergedCount = (mergeCandidate.mergedCount || 1) + 1;
          mergeCandidate.scale = Math.min(1.55, 1.0 + (mergeCandidate.mergedCount - 1) * 0.12);
        }
        return;
      }

      const orb = this.orbPool.pop();
      if (!orb) return;
      const target = kind === 'GOLD' ? goldTarget : xpTarget;
      orb.kind = kind;
      orb.team = beneficiaryTeam;
      orb.worldX = worldX + (Math.random() - 0.5) * 18;
      orb.startY = worldY - 18 - Math.random() * 14;
      orb.ctrlOffsetX = (Math.random() - 0.5) * 140;
      orb.arcHeight = CONFIG.death.orbArcHeightPx + (Math.random() * 40 - 15) + idx * 8;
      orb.targetScreenX = target.x;
      orb.targetScreenY = target.y;
      orb.screenX = orb.worldX - this.cameraX;
      orb.screenY = orb.startY;
      orb.elapsed = 0;
      orb.duration = (CONFIG.death.orbFlightMs / 1000) * (0.9 + Math.random() * 0.25);
      orb.spin = Math.random() * Math.PI * 2;
      orb.scale = 1.0;
      orb.mergedCount = 1;
      orb.active = true;
      this.activeRewardOrbs.push(orb);
    };

    for (let i = 0; i < goldCount; i++) pushOrb('GOLD', i);
    for (let i = 0; i < xpCount; i++) pushOrb('XP', i);
  }

  public spawnExplosion(x: number, y: number, color: number = 0xf97316, radius: number = 24): void {
    const r = Math.max(12, radius);
    this.burst(x, y, 1, 0xffffff, 'GLOW', { speed: 0, life: 0.16, size: r * 1.1, additive: true, gravity: 0, grow: r * 6 });
    this.burst(x, y, 1, color, 'GLOW', { speed: 0, life: 0.38, size: r * 1.3, additive: true, gravity: 0, grow: r * 3, alpha: 0.85 });
    this.burst(x, y, 1, color, 'RING', { speed: 0, life: 0.45, size: r * 0.6, gravity: 0, grow: r * 7 });
    this.burst(x, y, 1, 0xffffff, 'RING', { speed: 0, life: 0.25, size: r * 0.4, gravity: 0, grow: r * 10, alpha: 0.7, additive: true });
    this.burst(x, y, 14, color, 'CIRCLE', { speed: r * 5, life: 0.42, size: r * 0.28, additive: true, gravity: -60, drag: 4, grow: -r * 0.4 });
    this.burst(x, y, 8, 0xfef08a, 'CIRCLE', { speed: r * 3.5, life: 0.3, size: r * 0.2, additive: true, gravity: -40, drag: 5 });
    this.burst(x, y, 16, 0xfde68a, 'STREAK', { speed: r * 14, life: 0.5, size: 9, additive: true, gravity: 600, drag: 1.5 });
    this.burst(x, y, 10, 0x44403c, 'SMOKE', {
      speed: r * 2.2, life: 1.2, size: r * 0.35, gravity: -55, drag: 2, grow: r * 0.9, alpha: 0.55, jitter: r * 0.4,
    });
    this.burst(x, y, 8, 0x292524, 'DEBRIS', { speed: r * 9, life: 0.85, size: 4, gravity: 900, drag: 0.6, angle: -Math.PI / 2, spread: Math.PI * 1.2 });
    this.burst(x, y, 4, 0xfef08a, 'STAR', { speed: r * 4, life: 0.4, size: 5 });

    if (r >= 40) this.flashScreen(color, 0.12, 2.2);
  }

  public spawnGateDust(x: number, y: number, color: number = 0x64748b): void {
    this.burst(x, y, 10, color, 'SMOKE', {
      speed: 70, life: 0.75, size: 7, gravity: -40, drag: 2.5, grow: 26, alpha: 0.6, angle: -Math.PI / 2, spread: Math.PI * 1.1, jitter: 20,
    });
    this.burst(x, y - 30, 1, 0xffffff, 'GLOW', { speed: 0, life: 0.25, size: 28, additive: true, gravity: 0, grow: 90, alpha: 0.55 });
  }

  public spawnDeathStars(x: number, y: number, bountyColor: number = 0xfacc15): void {
    this.burst(x, y - 20, 4, bountyColor, 'STAR', {
      speed: 130, life: 0.5, size: 6, angle: -Math.PI / 2, spread: 1.5,
    });
    this.spawnFallDust(x, y);
  }

  /** Bụi tung lên khi thân thể ngã xuống đất */
  public spawnFallDust(x: number, groundY: number): void {
    this.burst(x, groundY, 7, 0x9ca3af, 'SMOKE', {
      speed: 65, life: 0.55, size: 5, gravity: -20, drag: 3, grow: 18, alpha: 0.42, angle: -Math.PI / 2, spread: Math.PI * 0.9, jitter: 14,
    });
  }

  /** Bụi gót chân khi bước chạy (gọi đúng frame chạm gót) */
  public spawnFootDust(x: number, groundY: number, dir: number, color: number = 0xa8a29e): void {
    this.burst(x - dir * 6, groundY - 2, 2, color, 'SMOKE', {
      speed: 28, life: 0.34, size: 3.2, gravity: -16, drag: 3, grow: 10, alpha: 0.34, angle: dir > 0 ? -Math.PI * 0.85 : -Math.PI * 0.15, spread: 0.85,
    });
  }

  public spawnMuzzleFlash(x: number, y: number, dir: number, color: number = 0xfde68a): void {
    this.burst(x, y, 1, color, 'GLOW', { speed: 0, life: 0.09, size: 16, additive: true, gravity: 0, grow: 60 });
    this.burst(x, y, 4, color, 'STREAK', { speed: 220, life: 0.12, size: 5, additive: true, gravity: 0, drag: 6, angle: dir > 0 ? 0 : Math.PI, spread: 0.6 });
  }

  public spawnSlashArc(x: number, y: number, dir: number, color: number = 0xffffff): void {
    this.spawnSlashVfx(x + dir * CONFIG.slashVfx.weaponReachOffsetPx, y - CONFIG.slashVfx.weaponHitHeightPx, dir, color);
  }

  public spawnTrail(x: number, y: number, color: number): void {
    if (!this.particlesOn) return;
    const p = this.pool.pop();
    if (!p) return;
    p.x = x + (Math.random() - 0.5) * 4;
    p.y = y + (Math.random() - 0.5) * 4;
    p.vx = (Math.random() - 0.5) * 10;
    p.vy = (Math.random() - 0.5) * 10;
    p.color = color;
    p.shape = 'CIRCLE';
    p.size = 3.8;
    p.baseAlpha = 0.8;
    p.alpha = 0.8;
    p.life = 0;
    p.maxLife = 0.26;
    p.active = true;
    p.additive = this.glowOn;
    p.gravity = 0;
    p.drag = 0;
    p.grow = -8;
    p.rotation = 0;
    p.spin = 0;
    this.activeParticles.push(p);
  }

  public spawnDust(x: number, y: number): void {
    this.burst(x, y, 1, 0x78716c, 'SMOKE', { speed: 15, life: 0.4, size: 3, gravity: -20, drag: 2, grow: 10, alpha: 0.5, jitter: 3 });
  }

  /** Hạt môi trường bay lơ lửng theo kỷ nguyên */
  public spawnAmbient(x: number, y: number, ageId: number): void {
    if (!this.particlesOn || !CONFIG.contrastAndBg.enableEmbers) return;
    if (ageId === 1) {
      this.burst(x, y, 1, Math.random() < 0.5 ? 0xfb923c : 0xfde047, 'CIRCLE', {
        speed: 24, life: 3.0, size: 1.8, additive: true, gravity: -14, drag: 0.3, alpha: 0.78, angle: -Math.PI / 2, spread: 1.2,
      });
    } else if (ageId <= 3) {
      this.burst(x, y, 1, 0xfef9c3, 'CIRCLE', { speed: 14, life: 3.6, size: 1.6, additive: true, gravity: -4, drag: 0.2, alpha: 0.45 });
    } else if (ageId === 4) {
      this.burst(x, y, 1, 0x94a3b8, 'DEBRIS', { speed: 18, life: 4, size: 2, gravity: 10, drag: 0.4, alpha: 0.5 });
    } else {
      this.burst(x, y, 1, ageId === 5 ? 0x22d3ee : 0x34d399, 'SPARK', {
        speed: 20, life: 2.6, size: 2.5, additive: true, gravity: -10, drag: 0.3, alpha: 0.7, angle: -Math.PI / 2, spread: 0.6,
      });
    }
  }

  public flashScreen(color: number, alpha: number, decay: number = 3): void {
    if (!graphicsSettings.get().ultimateFlash) return;
    if (alpha < this.screenFlash.alpha) return;
    this.screenFlash.color = color;
    this.screenFlash.alpha = Math.min(1, alpha);
    this.screenFlash.decay = decay;
  }

  /**
   * Rung màn hình: kết hợp Trauma lớn (chiêu cuối / pháo) và Micro Shake (2-3px trong 100ms khi kill / đòn nặng)
   */
  public getShakeOffset(strength: number): { x: number; y: number; rot: number } {
    const g = graphicsSettings.get();
    if (!this.screenShakeEnabled || !g.screenShake) return { x: 0, y: 0, rot: 0 };

    const t = this.time;
    const nx = Math.sin(t * 61.3) * 0.6 + Math.sin(t * 37.1 + 1.7) * 0.4;
    const ny = Math.sin(t * 53.7 + 0.5) * 0.6 + Math.sin(t * 29.3 + 2.9) * 0.4;
    const nr = Math.sin(t * 43.9 + 4.1);

    let totalAmp = 0;
    let rot = 0;

    if (strength > 0) {
      const trauma = Math.min(1, strength / 10);
      totalAmp += (trauma * trauma * 26 + strength * 0.9) * g.shakeIntensity;
      rot += nr * trauma * trauma * 0.022 * g.shakeIntensity;
    }

    if (this.microShakeTimer > 0 && this.microShakeAmpPx > 0) {
      const k = Math.max(0, this.microShakeTimer / Math.max(0.01, this.microShakeDuration));
      totalAmp += this.microShakeAmpPx * k * g.shakeIntensity;
    }

    if (totalAmp <= 0.01) return { x: 0, y: 0, rot: 0 };
    return { x: nx * totalAmp, y: ny * totalAmp, rot };
  }

  public triggerUltimateIntro(name: string, themeColor: number): void {
    this.ultimateIntro.active = true;
    this.ultimateIntro.name = name;
    this.ultimateIntro.themeColor = themeColor;
    this.ultimateIntro.timer = 0.8;
    this.ultimateIntro.duration = 0.8;
  }

  public update(dt: number): void {
    this.time += dt;

    if (this.microShakeTimer > 0) {
      this.microShakeTimer = Math.max(0, this.microShakeTimer - dt);
      if (this.microShakeTimer === 0) this.microShakeAmpPx = 0;
    }

    if (this.ultimateIntro.active) {
      this.ultimateIntro.timer -= dt;
      if (this.ultimateIntro.timer <= 0) {
        this.ultimateIntro.active = false;
      }
    }

    if (this.screenFlash.alpha > 0) {
      this.screenFlash.alpha = Math.max(0, this.screenFlash.alpha - this.screenFlash.decay * dt);
    }

    // 1. Cập nhật các hạt thường (swap-remove O(1))
    const list = this.activeParticles;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i]!;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        const last = list.pop()!;
        if (i < list.length) list[i] = last;
        this.pool.push(p);
        continue;
      }

      if (p.drag > 0) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.spin * dt;

      if (p.grow !== 0) p.size = Math.max(0.3, p.size + p.grow * dt);
      if (p.shape === 'RING' && p.grow === 0) {
        p.size += 80 * dt;
      }

      const t = p.life / p.maxLife;
      p.alpha = p.shape === 'SMOKE' ? p.baseAlpha * (1 - t * t) : Math.max(0, p.baseAlpha * (1.0 - t));
    }

    // 2. Cập nhật Slash VFX Pool (80-120ms, thu hồi O(1))
    for (let i = this.activeSlashes.length - 1; i >= 0; i--) {
      const s = this.activeSlashes[i]!;
      s.life += dt;
      if (s.life >= s.maxLife) {
        s.active = false;
        const last = this.activeSlashes.pop()!;
        if (i < this.activeSlashes.length) this.activeSlashes[i] = last;
        this.slashPool.push(s);
        continue;
      }
      const prog = s.life / s.maxLife;
      // Nở nhẹ đầu đòn rồi mờ nhanh (ease-out)
      s.alpha = Math.max(0, 1 - prog * prog);
    }

    // 3. Cập nhật Xu vàng & Orb XP bay theo đường cong Quadratic Bezier về HUD
    for (let i = this.activeRewardOrbs.length - 1; i >= 0; i--) {
      const orb = this.activeRewardOrbs[i]!;
      orb.elapsed += dt;
      orb.spin += dt * 10;
      const rawT = orb.elapsed / Math.max(0.05, orb.duration);
      if (rawT >= 1) {
        orb.active = false;
        const team = orb.team;
        const kind = orb.kind;
        const last = this.activeRewardOrbs.pop()!;
        if (i < this.activeRewardOrbs.length) this.activeRewardOrbs[i] = last;
        this.orbPool.push(orb);
        for (const cb of this.rewardListeners) {
          cb(team, kind);
        }
        continue;
      }

      // Easing nhanh dần vào HUD
      const u = rawT * rawT * (2.2 - 1.2 * rawT);
      const inv = 1 - u;
      const p0x = orb.worldX - this.cameraX;
      const p0y = orb.startY;
      const p2x = orb.targetScreenX;
      const p2y = orb.targetScreenY;
      const p1x = (p0x + p2x) * 0.5 + orb.ctrlOffsetX;
      const p1y = Math.min(p0y, p2y) - orb.arcHeight;

      orb.screenX = inv * inv * p0x + 2 * inv * u * p1x + u * u * p2x;
      orb.screenY = inv * inv * p0y + 2 * inv * u * p1y + u * u * p2y;
      orb.scale = rawT < 0.2 ? 0.6 + (rawT / 0.2) * 0.55 : Math.max(0.75, 1.15 - rawT * 0.4);
    }
  }

  public clear(): void {
    for (const p of this.activeParticles) {
      p.active = false;
      this.pool.push(p);
    }
    this.activeParticles.length = 0;

    for (const s of this.activeSlashes) {
      s.active = false;
      this.slashPool.push(s);
    }
    this.activeSlashes.length = 0;

    for (const orb of this.activeRewardOrbs) {
      orb.active = false;
      this.orbPool.push(orb);
    }
    this.activeRewardOrbs.length = 0;

    this.screenFlash.alpha = 0;
    this.microShakeTimer = 0;
    this.microShakeAmpPx = 0;
    this.ultimateIntro.active = false;
  }
}

export const particleSystem = new ParticleSystem();
