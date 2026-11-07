/**
 * The Singularity Odyssey — Unit Entity & State Machine
 * Quản lý vòng đời (WALK -> ATTACK -> DIE), tìm mục tiêu, khắc chế sát thương,
 * và các cơ chế đặc biệt của Kỷ Nguyên AI (Hacker convert, Mech hấp thụ sóng đẩy lùi, Hologram miễn thương).
 * Tích hợp bộ nạp hoạt ảnh sprite từ agent-sprite-forge (hit frame trigger, stride sync, die fallback, flying).
 * TUYỆT ĐỐI KHÔNG sửa logic chiến đấu.
 */

import {
  getCounterMultiplier,
  LANE_WIDTH,
  type Team,
  type UnitConfig,
  type UnitType,
} from '../data/ages';
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
  x: number;
  y: number;
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
  public prevX: number = 0;
  public prevY: number = 0;
  public customWeaponDataUrl: string | null = null;
  public baseY: number = 520; // Trục Y mặt đường chiến đấu

  public hp: number;
  public maxHp: number;
  public attackCooldown: number = 0;
  public damageMultiplier: number = 1.0;
  public hpMultiplier: number = 1.0;
  public upgradeLevel: number = 0;

  public readonly status: StatusEffectManager = new StatusEffectManager();

  // Cơ chế đặc biệt Kỷ Nguyên AI
  public energy: number = 0; // Thanh năng lượng cho Quantum Synthesizer Mech (0 - 100)
  public maxEnergy: number = 100;
  public hologramImmuneTimer: number = 0; // Đếm ngược 4s miễn sát thương vật lý cho AI Avatar
  public copyBuffTimer: number = 0;

  // Trạng thái đồ họa & Sprite Animation (AnimationController thời gian thực)
  public readonly anim: AnimationController;
  public walkAnimPhase: number = Math.random() * Math.PI * 2;
  public attackAnimProgress: number = 0; // 0 -> 1 khi đang vung đòn
  public hurtFlashTimer: number = 0;
  public deathFadeTimer: number = 0;
  public readonly deathDuration: number = 0.6;
  public recoilOffset: number = 0; // Giật lùi bằng code khi bị trúng đòn

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

  constructor(
    id: string,
    config: UnitConfig,
    team: Team,
    startX: number,
    startY: number = 520,
    damageMultiplier: number = 1.0,
    hpMultiplier: number = 1.0,
    upgradeLevel: number = 0
  ) {
    this.id = id;
    this.config = config;
    this.spriteConfig = getSpriteConfig(config.id);
    this.anim = new AnimationController(this.spriteConfig, 'WALK');
    this.team = team;
    this.x = startX;
    this.baseY = startY;

    // Quân bay / drone được nâng cao độ so với mặt đất
    const isFlying = !!config.flying || !!this.spriteConfig?.flying;
    if (isFlying) {
      this.y = startY - 70 + (Math.random() - 0.5) * 6;
    } else {
      this.y = startY + (Math.random() - 0.5) * 2; // Giữ chân nhân vật thẳng hàng trên mặt đất
    }

    this.damageMultiplier = damageMultiplier;
    this.hpMultiplier = hpMultiplier;
    this.upgradeLevel = upgradeLevel;
    this.maxHp = Math.round(config.hp * hpMultiplier);
    this.hp = this.maxHp;

    // Khởi tạo năng lực đặc biệt nếu có
    if (config.specialAbility === 'IMMUNE_4S_COPY_BUFF') {
      this.hologramImmuneTimer = 4.0;
      this.status.applyEffect('IMMUNE_PHYSICAL', 4.0, 1.0, 'REFRESH');
    }
  }

  /**
   * Cập nhật chỉ số nâng cấp ngay khi đang trên chiến trường
   */
  public applyUpgrade(damageMultiplier: number, hpMultiplier: number, level: number): void {
    this.upgradeLevel = level;
    this.damageMultiplier = damageMultiplier;
    this.hpMultiplier = hpMultiplier;
    const oldMax = this.maxHp;
    this.maxHp = Math.round(this.config.hp * hpMultiplier);
    const hpGain = this.maxHp - oldMax;
    if (hpGain > 0) {
      this.hp = Math.min(this.maxHp, this.hp + hpGain);
    }
  }

  public get direction(): number {
    return this.team === 'LEFT' ? 1 : -1;
  }

  /**
   * Cập nhật logic đơn vị mỗi tick
   */
  public update(
    dt: number,
    allies: readonly Unit[],
    enemies: readonly Unit[],
    enemyBaseX: number,
    onCombatEvent: (event: CombatEvent) => void
  ): void {
    this.prevX = this.x;
    this.prevY = this.y;

    if (!this.isAlive) {
      if (this.state === 'DIE') {
        this.deathFadeTimer += dt;
        this.anim.requestState('DIE');
        this.anim.update(dt);
      }
      return;
    }

    // Giảm dần độ giật lùi recoil do trúng đòn
    if (this.recoilOffset > 0) {
      this.recoilOffset = Math.max(0, this.recoilOffset - dt * 25);
    }

    // Cập nhật dao động bập bồng cho quân bay / drone
    const isFlying = !!this.config.flying || !!this.spriteConfig?.flying;
    if (isFlying) {
      this.flyingTimer += dt;
      this.flyingOffset = Math.sin(this.flyingTimer * 3.5) * 8;
    }

    // Cập nhật hiệu ứng trạng thái
    this.status.update(dt);

    if (this.hurtFlashTimer > 0) {
      this.hurtFlashTimer -= dt;
    }

    // Cập nhật bộ đếm Hologram 4s
    if (this.hologramImmuneTimer > 0) {
      this.hologramImmuneTimer -= dt;
      if (this.hologramImmuneTimer <= 0) {
        this.status.remove('IMMUNE_PHYSICAL');
      }
    }

    // AI Avatar Hologram liên tục sao chép buff đồng minh lân cận (mỗi 1.5s quét 1 lần)
    if (this.config.specialAbility === 'IMMUNE_4S_COPY_BUFF') {
      this.copyBuffTimer += dt;
      if (this.copyBuffTimer >= 1.5) {
        this.copyBuffTimer = 0;
        this.copyNearbyAllyBuffs(allies);
      }
    }

    // Nếu bị đóng băng/choáng (STUN), dừng toàn bộ hành động và phát clip HURT
    if (this.status.isStunned()) {
      this.anim.requestState('HURT', true);
      this.anim.update(dt);
      return;
    }

    // QUY TẮC 1: ATTACK không bị ngắt giữa chừng, phải chạy hết clip (trừ DIE)
    if (this.anim.state === 'ATTACK') {
      this.state = 'ATTACK';
      const animRes = this.anim.update(dt);
      if (animRes.triggerHitEvent) {
        this.executeHitEvent(this.pendingAttackTargetUnit, this.pendingAttackTargetBase, onCombatEvent);
      }
      if (animRes.attackFinished) {
        const speedMult = this.status.getSpeedMultiplier();
        const clipDur = this.anim.attackClipDuration;
        const nominalCd = this.config.attackSpeed / Math.max(0.3, speedMult);
        const effectiveCd = Math.max(nominalCd, clipDur);
        // Cooldown tấn công luôn >= độ dài clip attack
        this.attackCooldown = Math.max(0.05, effectiveCd - clipDur);
        this.attackAnimProgress = 0;
        this.state = (this.anim.state as AnimState) === 'ATTACK' ? 'ATTACK' : 'WALK';
      }
      return;
    }

    if (this.attackCooldown > 0) {
      this.attackCooldown -= dt;
    }

    if (this.attackAnimProgress > 0) {
      this.attackAnimProgress -= dt * 2.5;
      if (this.attackAnimProgress < 0) this.attackAnimProgress = 0;
    }

    // Tìm kiếm mục tiêu phía trước
    const targetInfo = this.findTarget(allies, enemies, enemyBaseX);

    if (targetInfo.shouldAttack) {
      this.state = 'ATTACK';
      if (this.attackCooldown <= 0) {
        this.startAttackSwing(targetInfo.targetUnit, targetInfo.targetBase);
        const animRes = this.anim.update(dt);
        if (animRes.triggerHitEvent) {
          this.executeHitEvent(this.pendingAttackTargetUnit, this.pendingAttackTargetBase, onCombatEvent);
        }
      } else {
        // Đang chờ hồi chiêu giữa 2 lần đánh: chơi clip IDLE
        this.anim.requestState('IDLE');
        this.anim.update(dt);
      }
    } else if (targetInfo.isBlockedByAlly) {
      // Đang bị lính đồng minh đi trước chặn đường, đứng chờ (IDLE)
      this.state = 'WALK';
      this.anim.requestState('IDLE');
      this.anim.update(dt);
    } else {
      // Tiếp tục hành quân tiến về căn cứ đối phương (hoặc bám đuôi mượt theo đồng minh đang bước đi)
      this.state = 'WALK';
      this.anim.requestState('WALK');
      this.anim.update(dt);

      const speedMult = this.status.getSpeedMultiplier();
      const desiredStepMag = this.config.speed * speedMult * dt;
      const actualStepMag = Number.isFinite(targetInfo.minAllyMargin)
        ? Math.min(desiredStepMag, Math.max(0, targetInfo.minAllyMargin))
        : desiredStepMag;
      this.x += actualStepMag * this.direction;

      // Đồng bộ bước chân tránh trượt: Quãng đường di chuyển chia cho cự ly từng frame
      const stridePx = this.spriteConfig?.stridePx || 64;
      const walkClip = this.spriteConfig?.clips.walk;
      const walkFrameCount = walkClip?.frameCount || 4;
      const distPerFrame = stridePx / Math.max(1, walkFrameCount);
      const animStepMag =
        actualStepMag > 0
          ? actualStepMag
          : targetInfo.blockingAlly
          ? Math.min(
              desiredStepMag,
              targetInfo.blockingAlly.config.speed *
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

  /**
   * Bắt đầu một lượt vung vũ khí tấn công
   */
  private startAttackSwing(targetUnit?: Unit, targetBase?: boolean): void {
    this.state = 'ATTACK';
    this.pendingAttackTargetUnit = targetUnit;
    this.pendingAttackTargetBase = targetBase;
    this.attackAnimProgress = 1.0;
    this.anim.requestState('ATTACK');
  }

  /**
   * Thực thi đòn đánh và tính sát thương khi chạm đúng hitFrame
   */
  public lastAttackWasMeleeFallback: boolean = false;

  private executeHitEvent(
    targetUnit: Unit | undefined,
    targetBase: boolean | undefined,
    onCombatEvent: (event: CombatEvent) => void
  ): void {
    this.attackAnimProgress = 1.0;
    const baseDmg = this.config.damage * this.damageMultiplier * this.status.getOutgoingDamageMultiplier();

    const MELEE_FALLBACK_DIST = 65;
    let edgeDistToTarget = Infinity;
    if (targetUnit && targetUnit.isAlive) {
      edgeDistToTarget = Math.max(
        0,
        Math.abs(targetUnit.x - this.x) - (this.config.size.width / 2 + targetUnit.config.size.width / 2)
      );
    }

    const isRangedCapable = this.config.type === 'RANGED' || this.config.range > 80;
    const isFlying = !!this.config.flying || !!this.spriteConfig?.flying;
    // Khi cung thủ / lính tầm xa bị địch áp sát gần (<= 65px) thì chuyển sang đánh cận chiến bằng tay
    const switchToHandMelee = isRangedCapable && !isFlying && targetUnit !== undefined && edgeDistToTarget <= MELEE_FALLBACK_DIST;
    this.lastAttackWasMeleeFallback = switchToHandMelee;

    if (isRangedCapable && !switchToHandMelee) {
      // Đơn vị tầm xa phóng đạn khi ở xa
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
      // Đơn vị cận chiến hoặc cung thủ đánh bằng tay khi địch áp sát
      const meleeDmg = switchToHandMelee ? baseDmg * 0.85 : baseDmg;
      if (targetUnit && targetUnit.isAlive) {
        targetUnit.takeDamage(meleeDmg, switchToHandMelee ? 'MELEE' : this.config.type, this, onCombatEvent);
      }
      onCombatEvent({
        type: 'MELEE_HIT',
        sourceUnit: this,
        targetUnit,
        targetBase,
        damage: meleeDmg,
        x: targetUnit ? targetUnit.x : this.x + 35 * this.direction,
        y: this.y,
      });
    }
  }

  /**
   * Quét và tìm mục tiêu gần nhất phía trước mặt
   */
  private findTarget(
    allies: readonly Unit[],
    enemies: readonly Unit[],
    enemyBaseX: number
  ): {
    shouldAttack: boolean;
    isBlockedByAlly: boolean;
    minAllyMargin: number;
    blockingAlly?: Unit;
    targetUnit?: Unit;
    targetBase?: boolean;
  } {
    const isLeft = this.team === 'LEFT';
    const myFrontX = this.x + (this.config.size.width / 2) * this.direction;
    const meIsFlying = !!this.config.flying || !!this.spriteConfig?.flying;

    // 1. Giữ khoảng cách đội hình đều đặn giữa các quân đồng minh cùng làn
    let minAllyMargin = Infinity;
    let blockingAlly: Unit | undefined;
    for (const ally of allies) {
      if (ally.id === this.id || !ally.isAlive) continue;
      const allyIsFlying = !!ally.config.flying || !!ally.spriteConfig?.flying;
      if (allyIsFlying !== meIsFlying) continue;

      const signedDelta = (ally.x - this.x) * this.direction;
      if (signedDelta > 0 || (signedDelta === 0 && ally.id < this.id)) {
        const requiredGap = Math.max(65.5, (this.config.size.width + ally.config.size.width) * 0.65 + 24);
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

    // 2. Tìm kẻ địch gần nhất phía trước
    let nearestEnemy: Unit | null = null;
    let minEnemyDist = Infinity;

    for (const enemy of enemies) {
      if (!enemy.isAlive) continue;
      const isAhead = isLeft ? enemy.x >= this.x - 15 : enemy.x <= this.x + 15;
      if (isAhead) {
        // Khoảng cách từ mép thân lính đến mép thân địch
        const edgeDist = Math.max(
          0,
          Math.abs(enemy.x - this.x) - (this.config.size.width / 2 + enemy.config.size.width / 2)
        );
        if (edgeDist < minEnemyDist) {
          minEnemyDist = edgeDist;
          nearestEnemy = enemy;
        }
      }
    }

    // Nếu có kẻ địch trong tầm đánh
    if (nearestEnemy && minEnemyDist <= this.config.range) {
      return {
        shouldAttack: true,
        isBlockedByAlly: false,
        minAllyMargin,
        blockingAlly,
        targetUnit: nearestEnemy,
      };
    }

    // 3. Kiểm tra khoảng cách tới căn cứ địch
    const distToBase = Math.abs(enemyBaseX - myFrontX);
    if (distToBase <= this.config.range) {
      return {
        shouldAttack: true,
        isBlockedByAlly: false,
        minAllyMargin,
        blockingAlly,
        targetBase: true,
      };
    }

    return { shouldAttack: false, isBlockedByAlly, minAllyMargin, blockingAlly };
  }

  /**
   * Tiếp nhận sát thương từ đối phương
   */
  public takeDamage(
    rawDamage: number,
    attackerType: UnitType,
    attacker: Unit | null,
    onCombatEvent?: (event: CombatEvent) => void
  ): void {
    // DIE không bao giờ bị ngắt, quân chết không còn nhận sát thương
    if (!this.isAlive || this.state === 'DIE' || this.anim.state === 'DIE') return;

    // 1. Kiểm tra miễn sát thương vật lý (AI Avatar 4s đầu)
    if (this.status.isImmunePhysical()) {
      return;
    }

    // 2. Tính hệ số khắc chế
    const counterMult = getCounterMultiplier(attackerType, this.config.type);
    let finalDamage = rawDamage * counterMult;

    // 3. Tính hệ số debuff giảm giáp (ARMOR_SHRED)
    finalDamage *= this.status.getIncomingDamageMultiplier();

    // 4. Trừ vào khiên chắn trước nếu có
    finalDamage = this.status.absorbDamage(finalDamage);

    if (finalDamage <= 0) return;

    // 5. Năng lực Quantum Synthesizer Mech: Hấp thụ sát thương tích lũy thành Năng Lượng
    if (this.config.specialAbility === 'ENERGY_ABSORB_SHOCKWAVE') {
      this.energy += finalDamage * 0.45;
      if (this.energy >= this.maxEnergy) {
        this.energy = 0;
        // Kích hoạt sóng chấn động đẩy lùi kẻ địch 120px và gây 250 AoE
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
    // Nháy trắng khi trúng đòn + giật lùi nhẹ bằng code
    this.hurtFlashTimer = 0.12;
    this.recoilOffset = 4.5;

    // HURT chỉ chen vào khi bị choáng hoặc đẩy lùi mạnh; đòn thường chỉ nháy trắng + giật lùi, không ngắt ATTACK
    if (this.status.isStunned()) {
      this.anim.requestState('HURT', true);
    }

    if (this.hp <= 0) {
      this.hp = 0;
      this.isAlive = false;
      this.state = 'DIE';
      this.anim.requestState('DIE');
      this.deathFadeTimer = 0;

      // Fallback code nếu thiếu clip die: bay ngôi sao cartoon
      if (!this.spriteConfig?.clips.die) {
        particleSystem.spawnDeathStars(this.x, this.y - 25);
      }

      if (onCombatEvent) {
        onCombatEvent({
          type: 'DEATH',
          sourceUnit: this,
          x: this.x,
          y: this.y,
        });
      }
    }
  }

  /**
   * Đổi phe đơn vị (kỹ năng của Neural Hacker)
   */
  public convertTeam(): void {
    this.team = this.team === 'LEFT' ? 'RIGHT' : 'LEFT';
    this.attackCooldown = 0.5;
    this.status.clear();
  }

  /**
   * Đẩy lùi vị trí đơn vị (hiệu ứng sóng xung kích từ Quantum Mech)
   */
  public knockback(distance: number): void {
    // Đẩy lùi ngược hướng tiến công
    this.x -= distance * this.direction;
    this.x = Math.max(30, Math.min(LANE_WIDTH - 30, this.x));
    // Đẩy lùi mạnh chen ngang hoạt ảnh bằng clip HURT
    if (distance >= 40) {
      this.anim.requestState('HURT', true);
    }
  }

  /**
   * Sao chép hiệu ứng buff của đồng minh xung quanh (cho AI Avatar)
   */
  private copyNearbyAllyBuffs(allies: readonly Unit[]): void {
    for (const ally of allies) {
      if (ally.id === this.id || !ally.isAlive) continue;
      const dist = Math.abs(ally.x - this.x);
      if (dist <= 160) {
        const allyEffects = ally.status.getAll();
        for (const eff of allyEffects) {
          if (eff.type === 'BUFF_DAMAGE' || eff.type === 'BUFF_SPEED' || eff.type === 'SHIELD') {
            this.status.applyEffect(eff.type, eff.duration, eff.value, eff.stackRule, eff.maxStacks);
          }
        }
      }
    }
  }
}
