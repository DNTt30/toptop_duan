/**
 * The Singularity Odyssey — Unit Entity & State Machine
 * Quản lý vòng đời (WALK -> ATTACK -> DIE), tìm mục tiêu, khắc chế sát thương,
 * đòn đánh 3 pha lệch pha, hit-stop cục bộ, knockback easing, squash & stretch, ghost HP bar.
 * TUYỆT ĐỐI KHÔNG làm sai lệch gameplay logic (damage, speed nền, cost, đối xứng).
 */

import {
  getCounterMultiplier,
  LANE_WIDTH,
  type Team,
  type UnitConfig,
  type UnitType,
} from '../data/ages';
import { CONFIG } from '../data/combatFeelConfig';
import { getSpriteConfig, type SpriteConfig } from '../data/sprites';
import { AnimationController, type AnimState } from './AnimationController';
import { particleSystem } from './ParticleSystem';
import { StatusEffectManager } from './StatusEffect';

export type UnitState = 'WALK' | 'ATTACK' | 'DIE';

export interface CombatEvent {
  type: 'MELEE_HIT' | 'RANGED_SHOOT' | 'SHOCKWAVE' | 'CONVERT' | 'DEATH';
  sourceUnit: Unit;
  targetUnit?: Unit;
  targetBase?: boolean;
  damage?: number;
  damageType?: UnitType;
  x: number;
  y: number;
  footY?: number;
  isHeavy?: boolean;
  isCrit?: boolean;
}

export class Unit {
  public readonly id: string;
  public readonly config: UnitConfig;
  public readonly spriteConfig: SpriteConfig | null;
  public team: Team;
  public state: UnitState = 'WALK';
  public isAlive: boolean = true;

  public x: number = 0;
  public y: number = 0;
  public plannedX: number = 0;
  public prevX: number = 0;
  public prevY: number = 0;
  public customWeaponDataUrl: string | null = null;
  public baseY: number = 520; // Trục Y mặt đường chiến đấu
  public readonly laneOffsetY: number = 0; // Độ lệch trục Y sâu ±4px theo làn

  public hp: number;
  public maxHp: number;
  public attackCooldown: number = 0;
  public damageMultiplier: number = 1.0;
  public hpMultiplier: number = 1.0;
  public upgradeLevel: number = 0;

  public readonly status: StatusEffectManager = new StatusEffectManager();

  // Cơ chế đặc biệt Kỷ Nguyên AI
  public energy: number = 0;
  public maxEnergy: number = 100;
  public hologramImmuneTimer: number = 0;
  public copyBuffTimer: number = 0;

  // Game feel & biến thiên sinh học (chỉ bật trong trận thật để bảo toàn 100% đối xứng test headless)
  public readonly enableOrganicVariance: boolean;
  public readonly speedVariance: number = 1.0; // ±5% tốc độ di chuyển
  public readonly spawnCooldownMultiplier: number = 1.0; // ±12% cooldown gốc random khi spawn
  public firstAttackDelay: number = 0; // 0..150ms lệch pha đòn đầu
  public hasAttackedOnce: boolean = false;
  public swingCount: number = 0; // Đếm số nhát đánh để kích hoạt VFX mức Mạnh theo chu kỳ

  // Hit feedback timers (lấy thời lượng từ CONFIG)
  public knockbackTimer: number = 0;
  public squashTimer: number = 0;

  // Thanh máu thông minh & Ghost Bar trắng 0.4s
  public ghostHp: number;
  public ghostHpDelayTimer: number = 0;
  public hasTakenDamage: boolean = false;
  public inCombatTimer: number = 0;

  // Thời lượng hoạt ảnh chết, giữ xác 300ms & mờ dần 400ms
  public deathAnimDuration: number = 0.64;
  public corpseHoldDuration: number = CONFIG.death.corpseHoldMs / 1000;
  public corpseFadeDuration: number = CONFIG.death.corpseFadeMs / 1000;
  public deathDuration: number = 0.6;

  // Trạng thái đồ họa & Sprite Animation (AnimationController thời gian thực)
  public readonly anim: AnimationController;
  public walkAnimPhase: number = Math.random() * Math.PI * 2;
  public attackAnimProgress: number = 0; // 0 -> 1 khi đang vung đòn
  public hurtFlashTimer: number = 0;
  public deathFadeTimer: number = 0;
  public recoilOffset: number = 0;

  public get hurtboxWidth(): number {
    return this.spriteConfig?.hurtbox?.width ?? this.config.size.width;
  }

  public get currentClip(): 'idle' | 'walk' | 'attack' | 'hurt' | 'die' {
    return this.anim.currentClip;
  }
  public set currentClip(val: 'idle' | 'walk' | 'attack' | 'hurt' | 'die') {
    this.anim.requestState(val.toUpperCase() as AnimState);
  }

  public get currentFrameIndex(): number {
    return this.anim.currentFrameIndex;
  }
  public set currentFrameIndex(val: number) {
    this.anim.currentFrameIndex = val;
  }

  public get clipTimer(): number {
    return this.anim.elapsedTime;
  }
  public set clipTimer(val: number) {
    this.anim.elapsedTime = val;
  }

  public get hasTriggeredHitThisSwing(): boolean {
    return this.anim.hasTriggeredHitThisSwing;
  }
  public set hasTriggeredHitThisSwing(val: boolean) {
    this.anim.hasTriggeredHitThisSwing = val;
  }

  // Quân bay / Drone
  public flyingTimer: number = Math.random() * Math.PI * 2;
  public flyingOffset: number = 0;

  // Mục tiêu chờ đòn đánh trúng (ghim theo hitFrame)
  private pendingAttackTargetUnit?: Unit;
  private pendingAttackTargetBase?: boolean;
  public lastAttackWasMeleeFallback: boolean = false;

  constructor(
    id: string,
    config: UnitConfig,
    team: Team,
    startX: number,
    startY: number = 520,
    damageMultiplier: number = 1.0,
    hpMultiplier: number = 1.0,
    upgradeLevel: number = 0,
    enableOrganicVariance: boolean = false
  ) {
    this.id = id;
    this.config = config;
    this.spriteConfig = getSpriteConfig(config.id);
    this.anim = new AnimationController(this.spriteConfig, 'WALK');
    this.team = team;
    this.x = startX;
    this.plannedX = startX;
    this.prevX = startX;
    this.baseY = startY;
    this.enableOrganicVariance = enableOrganicVariance;

    const isFlying = !!config.flying || !!this.spriteConfig?.flying;
    if (isFlying) {
      this.y = startY - 70 + (Math.random() - 0.5) * 6;
      this.laneOffsetY = 0;
    } else {
      this.y = startY;
      // Lệch trục Y ±4px theo CONFIG để tách lớp chồng chéo khi hành quân đông
      this.laneOffsetY = (Math.random() * 2 - 1) * CONFIG.crowd.laneJitterYPx;
    }

    if (enableOrganicVariance) {
      const walkFrames = this.spriteConfig?.clips.walk?.frameCount || 8;
      // Random pha bắt đầu walk cycle, tốc độ ±5%, cooldown ±12% khi spawn, và trễ pha đòn đầu 0-150ms
      this.walkAnimPhase = Math.random() * walkFrames;
      this.speedVariance = 1 + (Math.random() * 2 - 1) * CONFIG.crowd.speedVariancePct;
      this.spawnCooldownMultiplier = 1 + (Math.random() * 2 - 1) * CONFIG.attack.cooldownVariancePct;
      this.firstAttackDelay = (Math.random() * CONFIG.attack.firstHitPhaseMaxMs) / 1000;
    }

    this.damageMultiplier = damageMultiplier;
    this.hpMultiplier = hpMultiplier;
    this.upgradeLevel = upgradeLevel;
    this.maxHp = Math.round(config.hp * hpMultiplier);
    this.hp = this.maxHp;
    this.ghostHp = this.maxHp;

    // Tính tổng thời lượng chết = animation ngã (9F) + giữ xác (300ms) + fade (400ms)
    if (this.spriteConfig?.clips.die && this.spriteConfig.clips.die.frameCount >= 6) {
      this.deathAnimDuration = this.anim.getClipDuration('die');
      this.corpseHoldDuration = CONFIG.death.corpseHoldMs / 1000;
      this.corpseFadeDuration = CONFIG.death.corpseFadeMs / 1000;
      this.deathDuration = this.deathAnimDuration + this.corpseHoldDuration + this.corpseFadeDuration;
    } else {
      this.deathAnimDuration = 0.25;
      this.corpseHoldDuration = 0;
      this.corpseFadeDuration = 0.35;
      this.deathDuration = 0.6;
    }

    if (config.specialAbility === 'IMMUNE_4S_COPY_BUFF') {
      this.hologramImmuneTimer = 4.0;
      this.status.applyEffect('IMMUNE_PHYSICAL', 4.0, 1.0, 'REFRESH');
    }
  }

  public applyUpgrade(damageMultiplier: number, hpMultiplier: number, level: number): void {
    this.upgradeLevel = level;
    this.damageMultiplier = damageMultiplier;
    this.hpMultiplier = hpMultiplier;
    const oldMax = this.maxHp;
    this.maxHp = Math.round(this.config.hp * hpMultiplier);
    const hpGain = this.maxHp - oldMax;
    if (hpGain > 0) {
      this.hp = Math.min(this.maxHp, this.hp + hpGain);
      this.ghostHp = Math.max(this.ghostHp, this.hp);
    }
  }

  public get direction(): number {
    return this.team === 'LEFT' ? 1 : -1;
  }

  public planUpdate(
    dt: number,
    allies: readonly Unit[],
    enemies: readonly Unit[],
    enemyBaseX: number,
    onCombatEvent: (event: CombatEvent) => void
  ): void {
    this.internalUpdate(dt, allies, enemies, enemyBaseX, onCombatEvent, true);
  }

  public applyPlannedMovement(): void {
    this.x = this.plannedX;
  }

  public update(
    dt: number,
    allies: readonly Unit[],
    enemies: readonly Unit[],
    enemyBaseX: number,
    onCombatEvent: (event: CombatEvent) => void
  ): void {
    this.internalUpdate(dt, allies, enemies, enemyBaseX, onCombatEvent, false);
    this.applyPlannedMovement();
  }

  private internalUpdate(
    dt: number,
    allies: readonly Unit[],
    enemies: readonly Unit[],
    enemyBaseX: number,
    onCombatEvent: (event: CombatEvent) => void,
    deferDamage: boolean
  ): void {
    this.prevX = this.x;
    this.prevY = this.y;
    this.plannedX = this.x;

    // Cập nhật bộ đếm hiệu ứng thị giác bất kể hit-stop
    if (this.hurtFlashTimer > 0) {
      this.hurtFlashTimer = Math.max(0, this.hurtFlashTimer - dt);
    }
    if (this.squashTimer > 0) {
      this.squashTimer = Math.max(0, this.squashTimer - dt);
    }
    if (this.knockbackTimer > 0) {
      this.knockbackTimer = Math.max(0, this.knockbackTimer - dt);
      const totalKb = Math.max(0.01, CONFIG.hitFeedback.knockbackDurationMs / 1000);
      const progress = 1 - this.knockbackTimer / totalKb;
      if (progress < 0.4) {
        const up = progress / 0.4;
        const easeOutPush = 1 - (1 - up) * (1 - up);
        this.recoilOffset = CONFIG.hitFeedback.knockbackPx * easeOutPush;
      } else {
        const down = (progress - 0.4) / 0.6;
        const easeOutReturn = (1 - down) * (1 - down);
        this.recoilOffset = CONFIG.hitFeedback.knockbackPx * easeOutReturn;
      }
    } else if (this.recoilOffset > 0) {
      this.recoilOffset = 0;
    }

    // Cập nhật Ghost HP Bar sau độ trễ 0.4s
    if (this.ghostHp > this.hp) {
      if (this.ghostHpDelayTimer > 0) {
        this.ghostHpDelayTimer = Math.max(0, this.ghostHpDelayTimer - dt);
      } else {
        this.ghostHp = Math.max(
          this.hp,
          this.ghostHp - this.maxHp * CONFIG.teamAndHealth.ghostBarDrainPerSec * dt
        );
      }
    }

    if (this.inCombatTimer > 0) {
      this.inCombatTimer = Math.max(0, this.inCombatTimer - dt);
    }

    if (!this.isAlive) {
      if (this.state === 'DIE') {
        this.deathFadeTimer += dt;
        this.anim.requestState('DIE');
        this.anim.update(dt);
      }
      return;
    }

    // Hit-stop 60ms cục bộ: Đóng băng cả attacker và target vừa bị đánh mà KHÔNG dừng toàn game
    if (this.anim.hitStopTimer > 0) {
      this.anim.update(dt);
      return;
    }

    const isFlying = !!this.config.flying || !!this.spriteConfig?.flying;
    if (isFlying) {
      this.flyingTimer += dt;
      this.flyingOffset = Math.sin(this.flyingTimer * 3.5) * 8;
    }

    this.status.update(dt);

    if (this.hologramImmuneTimer > 0) {
      this.hologramImmuneTimer -= dt;
      if (this.hologramImmuneTimer <= 0) {
        this.status.remove('IMMUNE_PHYSICAL');
      }
    }

    if (this.config.specialAbility === 'IMMUNE_4S_COPY_BUFF') {
      this.copyBuffTimer += dt;
      if (this.copyBuffTimer >= 1.5) {
        this.copyBuffTimer = 0;
        this.copyNearbyAllyBuffs(allies);
      }
    }

    if (this.status.isStunned()) {
      this.anim.requestState('HURT', true);
      this.anim.update(dt);
      return;
    }

    // QUY TẮC 1: ATTACK không bị ngắt giữa chừng (chạy đủ Anticipation -> Strike -> Recovery)
    if (this.anim.state === 'ATTACK') {
      this.state = 'ATTACK';
      this.inCombatTimer = CONFIG.teamAndHealth.combatBarShowMs / 1000;
      const animRes = this.anim.update(dt);
      const clipDur = Math.max(0.1, this.anim.attackClipDuration);
      this.attackAnimProgress = Math.max(0.02, Math.min(0.98, this.anim.elapsedTime / clipDur));
      if (animRes.triggerHitEvent) {
        this.executeHitEvent(this.pendingAttackTargetUnit, this.pendingAttackTargetBase, onCombatEvent, deferDamage);
      }
      if (animRes.attackFinished) {
        const speedMult = this.status.getSpeedMultiplier();
        const dur = this.anim.attackClipDuration;
        // Hạng mục B: Cooldown ±12% (random khi spawn) + mỗi đòn sau random thêm ±30ms
        const perSwingJitterSec = this.enableOrganicVariance
          ? ((Math.random() * 2 - 1) * CONFIG.attack.perSwingJitterMs) / 1000
          : 0;
        const nominalCd =
          (this.config.attackSpeed * this.spawnCooldownMultiplier) / Math.max(0.3, speedMult) +
          perSwingJitterSec;
        const effectiveCd = Math.max(nominalCd, dur);
        this.attackCooldown = Math.max(0.05, effectiveCd - dur);
        this.attackAnimProgress = 0;
        this.state = (this.anim.state as AnimState) === 'ATTACK' ? 'ATTACK' : 'WALK';
      }
      return;
    }

    if (this.attackCooldown > 0) {
      this.attackCooldown -= dt;
    }

    if (this.attackAnimProgress > 0) {
      this.attackAnimProgress = Math.max(0, this.attackAnimProgress - dt * 2.5);
    }

    const targetInfo = this.findTarget(allies, enemies, enemyBaseX);

    if (targetInfo.shouldAttack) {
      this.state = 'ATTACK';
      this.inCombatTimer = CONFIG.teamAndHealth.combatBarShowMs / 1000;

      // Hạng mục B: Đảm bảo 2 đơn vị đối đầu trực tiếp luôn lệch pha đòn đầu >= 45ms, không chạm cùng frame
      if (
        this.enableOrganicVariance &&
        !this.hasAttackedOnce &&
        targetInfo.targetUnit &&
        !targetInfo.targetUnit.hasAttackedOnce
      ) {
        const minDesyncSec = CONFIG.attack.minOpponentDesyncMs / 1000;
        const diff = Math.abs(this.firstAttackDelay - targetInfo.targetUnit.firstAttackDelay);
        if (diff < minDesyncSec && this.team === 'RIGHT') {
          this.firstAttackDelay = Math.min(
            CONFIG.attack.firstHitPhaseMaxMs / 1000,
            targetInfo.targetUnit.firstAttackDelay + minDesyncSec + Math.random() * 0.025
          );
          if (Math.abs(this.firstAttackDelay - targetInfo.targetUnit.firstAttackDelay) < minDesyncSec) {
            this.firstAttackDelay = Math.max(0, targetInfo.targetUnit.firstAttackDelay - minDesyncSec);
          }
        }
      }

      // Lệch pha đòn đầu 0-150ms để 2 quân vừa gặp nhau không chạm cùng frame
      if (!this.hasAttackedOnce && this.firstAttackDelay > 0) {
        this.firstAttackDelay = Math.max(0, this.firstAttackDelay - dt);
        if (this.anim.state !== 'IDLE') {
          this.anim.requestState('IDLE');
        }
        this.anim.update(dt);
        return;
      }

      if (this.attackCooldown <= 0) {
        this.hasAttackedOnce = true;
        this.startAttackSwing(targetInfo.targetUnit, targetInfo.targetBase);
        const animRes = this.anim.update(dt);
        if (animRes.triggerHitEvent) {
          this.executeHitEvent(this.pendingAttackTargetUnit, this.pendingAttackTargetBase, onCombatEvent, deferDamage);
        }
      } else {
        if (this.anim.state !== 'IDLE') {
          this.anim.requestState('IDLE');
          this.anim.elapsedTime = (Math.abs(this.x) * 0.017) % 0.5;
        }
        this.anim.update(dt);
      }
    } else if (targetInfo.isBlockedByAlly) {
      this.state = 'WALK';
      if (this.anim.state !== 'IDLE') {
        this.anim.requestState('IDLE');
        this.anim.elapsedTime = (Math.abs(this.x) * 0.023) % 0.7;
      }
      this.anim.update(dt);
    } else {
      this.state = 'WALK';
      this.anim.requestState('WALK');
      this.anim.update(dt);

      const speedMult = this.status.getSpeedMultiplier() * this.speedVariance;
      const desiredStepMag = this.config.speed * speedMult * dt;
      let actualStepMag = desiredStepMag;

      if (Number.isFinite(targetInfo.minAllyMargin)) {
        actualStepMag = Math.min(actualStepMag, Math.max(0, targetInfo.minAllyMargin));
      }
      if (Number.isFinite(targetInfo.minEnemyStandoffMargin)) {
        actualStepMag = Math.min(actualStepMag, Math.max(0, targetInfo.minEnemyStandoffMargin));
      }

      this.plannedX = this.x + actualStepMag * this.direction;
      if (!deferDamage) {
        this.x = this.plannedX;
      }

      // Đồng bộ bước chân chính xác với quãng đường di chuyển (tránh foot sliding)
      const stridePx = this.spriteConfig?.stridePx || 48;
      const walkClip = this.spriteConfig?.clips.walk;
      const walkFrameCount = walkClip?.frameCount || 8;
      const distPerFrame = stridePx / Math.max(1, walkFrameCount);
      const animStepMag =
        actualStepMag > 0
          ? actualStepMag
          : targetInfo.blockingAlly
          ? Math.min(
              desiredStepMag,
              targetInfo.blockingAlly.config.speed *
                targetInfo.blockingAlly.speedVariance *
                targetInfo.blockingAlly.status.getSpeedMultiplier() *
                dt
            )
          : 0;
      const frameAdvance = animStepMag / distPerFrame;

      this.walkAnimPhase += frameAdvance;
      if (this.anim.state === 'WALK') {
        this.anim.currentFrameIndex = Math.floor(this.walkAnimPhase) % walkFrameCount;
      }
    }
  }

  private startAttackSwing(targetUnit?: Unit, targetBase?: boolean): void {
    this.state = 'ATTACK';
    this.swingCount++;
    this.pendingAttackTargetUnit = targetUnit;
    this.pendingAttackTargetBase = targetBase;
    this.attackAnimProgress = 0.04;
    this.anim.requestState('ATTACK');
  }

  private executeHitEvent(
    targetUnit: Unit | undefined,
    targetBase: boolean | undefined,
    onCombatEvent: (event: CombatEvent) => void,
    deferDamage: boolean = false
  ): void {
    this.attackAnimProgress = Math.max(this.attackAnimProgress, 0.5);
    const baseDmg = this.config.damage * this.damageMultiplier * this.status.getOutgoingDamageMultiplier();

    const MELEE_FALLBACK_DIST = 65;
    let edgeDistToTarget = Infinity;
    if (targetUnit && targetUnit.isAlive) {
      edgeDistToTarget = Math.max(
        0,
        Math.abs(targetUnit.x - this.x) - (this.hurtboxWidth / 2 + targetUnit.hurtboxWidth / 2)
      );
    }

    const isRangedCapable = this.config.type === 'RANGED' || this.config.range > 80;
    const isFlying = !!this.config.flying || !!this.spriteConfig?.flying;
    const switchToHandMelee =
      isRangedCapable && !isFlying && targetUnit !== undefined && edgeDistToTarget <= MELEE_FALLBACK_DIST;
    this.lastAttackWasMeleeFallback = switchToHandMelee;

    if (isRangedCapable && !switchToHandMelee) {
      onCombatEvent({
        type: 'RANGED_SHOOT',
        sourceUnit: this,
        targetUnit,
        targetBase,
        damage: baseDmg,
        x: this.x + (this.config.size.width / 2) * this.direction,
        y: this.y - 12,
      });
    } else {
      const meleeDmg = switchToHandMelee ? baseDmg * 0.85 : baseDmg;
      const dmgType = switchToHandMelee ? 'MELEE' : this.config.type;
      if (!deferDamage && targetUnit && targetUnit.isAlive) {
        targetUnit.takeDamage(meleeDmg, dmgType, this, onCombatEvent);
      }
      // Điểm chạm thực tế của đầu vũ khí phía thân mục tiêu (không đặt tại giữa 2 đơn vị)
      const weaponReachX = this.x + (this.hurtboxWidth * 0.45 + CONFIG.slashVfx.weaponReachOffsetPx) * this.direction;
      const contactX = targetUnit
        ? Math.max(
            Math.min(this.x, targetUnit.x),
            Math.min(Math.max(this.x, targetUnit.x), targetUnit.x - this.direction * (targetUnit.hurtboxWidth * 0.35))
          )
        : weaponReachX;
      const groundRenderY = 540 + this.laneOffsetY;
      const contactY = groundRenderY - CONFIG.slashVfx.weaponHitHeightPx;
      const isHeavy =
        this.config.type === 'TANK' ||
        this.config.type === 'SPECIAL' ||
        (this.enableOrganicVariance && this.swingCount % CONFIG.attack.heavyEveryNHits === 0);

      onCombatEvent({
        type: 'MELEE_HIT',
        sourceUnit: this,
        targetUnit,
        targetBase,
        damage: meleeDmg,
        damageType: dmgType,
        x: contactX,
        y: contactY,
        footY: groundRenderY,
        isHeavy,
        isCrit: false,
      });
    }
  }

  private findTarget(
    allies: readonly Unit[],
    enemies: readonly Unit[],
    enemyBaseX: number
  ): {
    shouldAttack: boolean;
    isBlockedByAlly: boolean;
    minAllyMargin: number;
    minEnemyStandoffMargin: number;
    blockingAlly?: Unit;
    targetUnit?: Unit;
    targetBase?: boolean;
  } {
    const isLeft = this.team === 'LEFT';
    const myFrontX = this.x + (this.config.size.width / 2) * this.direction;
    const meIsFlying = !!this.config.flying || !!this.spriteConfig?.flying;

    // 1. Giữ khoảng cách tách đội hình cùng phe (Separation steering)
    let minAllyMargin = Infinity;
    let blockingAlly: Unit | undefined;
    for (const ally of allies) {
      if (ally.id === this.id || !ally.isAlive) continue;
      const allyIsFlying = !!ally.config.flying || !!ally.spriteConfig?.flying;
      if (allyIsFlying !== meIsFlying) continue;

      const signedDelta = (ally.x - this.x) * this.direction;
      if (signedDelta > 0 || (signedDelta === 0 && ally.id < this.id)) {
        const requiredGap = Math.max(
          CONFIG.crowd.separationMinGapPx,
          (this.config.size.width + ally.config.size.width) * 0.65 + 24
        );
        const margin = signedDelta - requiredGap;
        if (margin < minAllyMargin) {
          minAllyMargin = margin;
          blockingAlly = ally;
        }
      }
    }

    const allyIsWalking = Boolean(
      blockingAlly &&
        blockingAlly.state === 'WALK' &&
        blockingAlly.currentClip === 'walk' &&
        !blockingAlly.status.isStunned()
    );
    const isBlockedByAlly = minAllyMargin <= 0 && !allyIsWalking;

    // 2. Tìm kẻ địch gần nhất phía trước & giữ khoảng cách đứng tối thiểu 20-30px (không chồng sprite)
    let nearestEnemy: Unit | null = null;
    let minEnemyDist = Infinity;
    let minEnemyStandoffMargin = Infinity;
    const minStandoff = Math.min(this.config.range, CONFIG.attack.standoffGapPx);

    for (const enemy of enemies) {
      if (!enemy.isAlive) continue;
      const enemyIsFlying = !!enemy.config.flying || !!enemy.spriteConfig?.flying;
      if (!meIsFlying && !enemyIsFlying) {
        const signedCenterDist = (enemy.x - this.x) * this.direction;
        const overlapGuard = Math.max(15, (this.hurtboxWidth + enemy.hurtboxWidth) * 0.5);
        // Chỉ chặn bởi kẻ địch phía trước hoặc đang chồng lên mình, bỏ qua kẻ địch đã bị bỏ lại phía sau
        if (signedCenterDist >= -overlapGuard) {
          const signedEdgeDist =
            signedCenterDist - (this.hurtboxWidth / 2 + enemy.hurtboxWidth / 2);
          const standoffMargin = signedEdgeDist - minStandoff;
          if (standoffMargin < minEnemyStandoffMargin) {
            minEnemyStandoffMargin = standoffMargin;
          }
        }
      }
      const isAhead = isLeft ? enemy.x >= this.x - 15 : enemy.x <= this.x + 15;
      if (isAhead) {
        const edgeDist = Math.max(
          0,
          Math.abs(enemy.x - this.x) - (this.hurtboxWidth / 2 + enemy.hurtboxWidth / 2)
        );
        if (edgeDist < minEnemyDist) {
          minEnemyDist = edgeDist;
          nearestEnemy = enemy;
        }
      }
    }

    if (nearestEnemy && minEnemyDist <= this.config.range) {
      return {
        shouldAttack: true,
        isBlockedByAlly: false,
        minAllyMargin,
        minEnemyStandoffMargin,
        blockingAlly,
        targetUnit: nearestEnemy,
      };
    }

    const distToBase = Math.abs(enemyBaseX - myFrontX);
    if (distToBase <= this.config.range) {
      return {
        shouldAttack: true,
        isBlockedByAlly: false,
        minAllyMargin,
        minEnemyStandoffMargin,
        blockingAlly,
        targetBase: true,
      };
    }

    return {
      shouldAttack: false,
      isBlockedByAlly,
      minAllyMargin,
      minEnemyStandoffMargin,
      blockingAlly,
    };
  }

  public takeDamage(
    rawDamage: number,
    attackerType: UnitType,
    attacker: Unit | null,
    onCombatEvent?: (event: CombatEvent) => void
  ): void {
    if (!this.isAlive || this.state === 'DIE' || this.anim.state === 'DIE') return;

    if (this.status.isImmunePhysical()) {
      return;
    }

    const counterMult = getCounterMultiplier(attackerType, this.config.type);
    let finalDamage = rawDamage * counterMult;
    finalDamage *= this.status.getIncomingDamageMultiplier();
    finalDamage = this.status.absorbDamage(finalDamage);

    if (finalDamage <= 0) return;

    if (this.config.specialAbility === 'ENERGY_ABSORB_SHOCKWAVE') {
      this.energy += finalDamage * 0.45;
      if (this.energy >= this.maxEnergy) {
        this.energy = 0;
        if (onCombatEvent) {
          onCombatEvent({
            type: 'SHOCKWAVE',
            sourceUnit: this,
            damage: 250,
            x: this.x,
            y: this.y,
          });
        }
      }
    }

    this.hp -= finalDamage;
    this.hasTakenDamage = true;
    this.inCombatTimer = CONFIG.teamAndHealth.combatBarShowMs / 1000;
    this.ghostHpDelayTimer = CONFIG.teamAndHealth.ghostBarDelayMs / 1000;

    // Hit Feedback: White Flash 80ms, Knockback 6px (140ms ease-out), Squash & Stretch 100ms, Hit-stop 60ms
    this.hurtFlashTimer = CONFIG.hitFeedback.whiteFlashMs / 1000;
    this.knockbackTimer = CONFIG.hitFeedback.knockbackDurationMs / 1000;
    this.squashTimer = CONFIG.hitFeedback.squashDurationMs / 1000;

    if (this.status.isStunned()) {
      this.anim.requestState('HURT', true);
    }

    if (this.hp <= 0) {
      this.hp = 0;
      this.isAlive = false;
      this.state = 'DIE';
      this.anim.requestState('DIE');
      this.deathFadeTimer = 0;

      if (this.spriteConfig?.clips.die && this.spriteConfig.clips.die.frameCount >= 6) {
        this.deathAnimDuration = this.anim.getClipDuration('die');
        this.deathDuration = this.deathAnimDuration + this.corpseHoldDuration + this.corpseFadeDuration;
      }

      if (!this.spriteConfig?.clips.die) {
        particleSystem.spawnDeathStars(this.x, this.y - 25);
      }

      if (onCombatEvent) {
        onCombatEvent({
          type: 'DEATH',
          sourceUnit: this,
          x: this.x,
          y: this.y,
          footY: 540 + this.laneOffsetY,
        });
      }
    } else if (attacker) {
      // Đóng băng cả target còn sống trong 60ms khớp với attacker
      this.anim.applyHitStop(CONFIG.hitFeedback.hitStopMs / 1000);
    }
  }

  public convertTeam(): void {
    this.team = this.team === 'LEFT' ? 'RIGHT' : 'LEFT';
    this.attackCooldown = 0.5;
    this.status.clear();
  }

  public knockback(distance: number): void {
    this.x -= distance * this.direction;
    this.x = Math.max(30, Math.min(LANE_WIDTH - 30, this.x));
    if (distance >= 40) {
      this.anim.requestState('HURT', true);
    }
  }

  private copyNearbyAllyBuffs(allies: readonly Unit[]): void {
    for (const ally of allies) {
      if (ally.id === this.id || !ally.isAlive) continue;
      const dist = Math.abs(ally.x - this.x);
      if (dist <= 160) {
        const allyEffects = ally.status.getAll();
        for (const eff of allyEffects) {
          if (eff.type === 'BUFF_SPEED' || eff.type === 'BUFF_DAMAGE' || eff.type === 'SHIELD') {
            this.status.applyEffect(eff.type, eff.duration * 0.5, eff.value, 'REFRESH');
          }
        }
      }
    }
  }
}
