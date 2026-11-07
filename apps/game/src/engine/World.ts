/**
 * The Singularity Odyssey — World & Combat Simulation Engine
 * Trọng tâm mô phỏng toàn bộ logic chiến đấu hai phe (LEFT vs RIGHT) trên đường chạy 1D 1600px.
 * Tách biệt 100% khỏi React, hỗ trợ chạy Headless (để chạy bot vs bot 1000 trận).
 */

import {
  AGES_DATA,
  BASE_MAX_HP,
  BASE_WIDTH,
  LANE_WIDTH,
  MAX_UNITS_PER_TEAM,
  type Team,
  type TurretConfig,
  type UnitConfig,
  type UnitType,
} from '../data/ages';
import { getKillBountyGold, getKillBountyXp } from '../data/economy';
import { getSpriteConfig } from '../data/sprites';
import { UPGRADE_CONFIG } from '../data/upgrades';
import { AgeManager } from './AgeManager';
import { audioSynth } from './AudioSynth';
import { BotAI, type BotDifficulty } from './BotAI';
import { Economy } from './Economy';
import { particleSystem } from './ParticleSystem';
import { Projectile, ProjectilePool } from './Projectile';
import { Turret, TurretManager } from './Turret';
import { type BarrageShellSpec, UltimateManager } from './Ultimate';
import { Unit } from './Unit';
import { UpgradeManager, type UpgradeLevels } from './Upgrades';
import { getModeMatchConfig, type GameMode, type ModeMatchConfig } from '../data/modes';

export type { GameMode, ModeMatchConfig };

export interface FloatingText {
  id: string;
  text: string;
  x: number;
  y: number;
  color: number;
  duration: number;
  maxDuration: number;
  vy: number;
}

export type GameStatus = 'PAUSED' | 'PLAYING' | 'VICTORY' | 'DEFEAT' | 'DRAW';
export type MatchEndReason = 'BASE_DESTROYED' | 'STALL_DRAIN' | 'TIMEOUT' | 'DRAW' | 'UNFINISHED';

export interface WorldSnapshot {
  status: GameStatus;
  endReason: MatchEndReason | null;
  gameMode: GameMode;
  matchTime: number;
  matchDurationSec: number | null;
  isSuddenDeath: boolean;
  stallDrainActive: boolean;
  stallDrainDps: number;
  autoRestartRemaining: number | null;
  playerBaseHp: number;
  botBaseHp: number;
  playerAge: number;
  botAge: number;
  playerGold: number;
  playerXp: number;
  playerQueue: { id: string; unitId: string; progress: number; duration: number }[];
  playerUltiCooldownPercent: number;
  botUltiCooldownPercent: number;
  playerUnitCount: number;
  botUnitCount: number;
  glitchActive: boolean;
  screenShake: number;
  playerUpgradeLevels: UpgradeLevels;
  playerTurretLevel: number;
  playerTurretSlotsCount: number;
  rightGold: number;
  rightXp: number;
  rightQueue: { id: string; unitId: string; progress: number; duration: number }[];
  rightUpgradeLevels: UpgradeLevels;
  rightTurretLevel: number;
  rightTurretSlotsCount: number;
  cameraX: number;
  frontlineX: number;
  laneWidth: number;
}

export class World {
  public status: GameStatus = 'PLAYING';
  public endReason: MatchEndReason | null = null;
  public gameMode: GameMode = 'SOLO';
  public matchConfig: ModeMatchConfig = getModeMatchConfig('SOLO');
  public matchTime: number = 0;
  public cameraX: number = 0;

  // Bế tắc (Stall detection & drain)
  public stallTimer: number = 0;
  public isStallDrainActive: boolean = false;
  public stallDrainDuration: number = 0;
  public currentStallDrainDps: number = 0;
  public hasEverStalled: boolean = false;

  // Đột tử (Sudden Death) khi hết giờ mà hòa máu căn cứ
  public isSuddenDeath: boolean = false;

  // Tự chơi lại (Auto-restart)
  public autoRestartTimer: number | null = null;
  public autoRestartCancelled: boolean = false;

  // Tổng sát thương gây ra bởi mỗi phe (để phân định hòa)
  public playerTotalDamageDealt: number = 0;
  public botTotalDamageDealt: number = 0;

  // Cờ theo dõi sát thương trong tick hiện tại
  public damageDealtInTick: boolean = false;

  // Hỗ trợ Seed determinism
  public random: () => number = Math.random;

  // Căn cứ
  public readonly baseLeftX = BASE_WIDTH;
  public readonly baseRightX = LANE_WIDTH - BASE_WIDTH;
  public playerBaseHp = BASE_MAX_HP;
  public botBaseHp = BASE_MAX_HP;

  // Quản lý phe Trái (Player / Streamer)
  public readonly playerEconomy = new Economy(175, 1);
  public readonly playerAge = new AgeManager('LEFT', 1);
  public readonly playerTurrets = new TurretManager('LEFT', this.baseLeftX, 520);
  public readonly playerUltimate = new UltimateManager('LEFT');
  public readonly playerUpgrades = new UpgradeManager();
  public playerUnits: Unit[] = [];

  // Quản lý phe Phải (Bot AI / Đối thủ)
  public readonly botEconomy = new Economy(175, 1);
  public readonly botAge = new AgeManager('RIGHT', 1);
  public readonly botTurrets = new TurretManager('RIGHT', this.baseRightX, 520);
  public readonly botUltimate = new UltimateManager('RIGHT');
  public readonly botUpgrades = new UpgradeManager();
  public botUnits: Unit[] = [];
  public readonly botAI = new BotAI('NORMAL');

  // Đạn đạo & Object Pool
  public readonly projectilePool = new ProjectilePool(120);
  public pendingBarrageShells: { team: Team; spec: BarrageShellSpec; timer: number }[] = [];

  // Hiệu ứng chữ bay (Floating Text)
  public floatingTexts: FloatingText[] = [];

  // Trạng thái hiệu ứng màn hình
  public screenShake: number = 0;
  public glitchActive: boolean = false;
  public glitchTimer: number = 0;

  // Đăng ký lắng nghe thay đổi trạng thái cho React HUD
  private subscribers: ((snapshot: WorldSnapshot) => void)[] = [];
  private hudNotifyCooldown: number = 0;
  private nextUnitId = 1;
  private isHeadless: boolean = false;

  constructor(isHeadless: boolean = false) {
    this.isHeadless = isHeadless;
  }

  public initDefaultTurrets(): void {
    const defaultTurret = AGES_DATA[1]?.turrets[0];
    if (defaultTurret) {
      this.playerTurrets.buildTurret(0, defaultTurret);
      this.botTurrets.buildTurret(0, defaultTurret);
    }
  }

  public setGameMode(mode: GameMode): void {
    this.gameMode = mode;
    this.matchConfig = getModeMatchConfig(mode);
    this.notifySubscribers();
  }

  public setMatchConfig(customConfig: Partial<ModeMatchConfig>): void {
    this.matchConfig = { ...this.matchConfig, ...customConfig };
    this.notifySubscribers();
  }

  public cancelAutoRestart(): void {
    this.autoRestartCancelled = true;
    this.autoRestartTimer = null;
    this.notifySubscribers();
  }

  public setSeed(seed: number): void {
    let s = seed >>> 0;
    this.random = () => {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  public recordDamage(amount: number, sourceTeam: Team | null): void {
    if (amount <= 0) return;
    this.damageDealtInTick = true;
    this.stallTimer = 0;
    if (this.isStallDrainActive) {
      this.isStallDrainActive = false;
      this.stallDrainDuration = 0;
      this.currentStallDrainDps = 0;
    }
    if (sourceTeam === 'LEFT') {
      this.playerTotalDamageDealt += amount;
    } else if (sourceTeam === 'RIGHT') {
      this.botTotalDamageDealt += amount;
    }
  }

  public isAnyUnitInCombat(): boolean {
    for (let i = 0; i < this.playerUnits.length; i++) {
      const u = this.playerUnits[i]!;
      if (u.isAlive && u.state === 'ATTACK') return true;
    }
    for (let i = 0; i < this.botUnits.length; i++) {
      const u = this.botUnits[i]!;
      if (u.isAlive && u.state === 'ATTACK') return true;
    }
    return false;
  }

  public setBotDifficulty(diff: BotDifficulty): void {
    this.botAI.setDifficulty(diff);
  }

  public subscribe(callback: (snapshot: WorldSnapshot) => void): () => void {
    this.subscribers.push(callback);
    callback(this.getSnapshot());
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== callback);
    };
  }

  public reset(): void {
    this.status = 'PLAYING';
    this.endReason = null;
    this.matchTime = 0;
    this.stallTimer = 0;
    this.isStallDrainActive = false;
    this.stallDrainDuration = 0;
    this.currentStallDrainDps = 0;
    this.hasEverStalled = false;
    this.isSuddenDeath = false;
    this.autoRestartTimer = null;
    this.autoRestartCancelled = false;
    this.playerTotalDamageDealt = 0;
    this.botTotalDamageDealt = 0;
    this.damageDealtInTick = false;
    this.playerBaseHp = BASE_MAX_HP;
    this.botBaseHp = BASE_MAX_HP;

    this.playerEconomy.reset();
    this.playerAge.reset(1);
    this.playerTurrets.reset();
    this.playerUltimate.reset();
    this.playerUpgrades.reset();
    this.playerUnits = [];

    this.botEconomy.reset();
    this.botAge.reset(1);
    this.botTurrets.reset();
    this.botUltimate.reset();
    this.botUpgrades.reset();
    this.botUnits = [];

    this.projectilePool.clear();
    this.pendingBarrageShells = [];
    this.floatingTexts = [];
    this.screenShake = 0;
    this.glitchActive = false;
    this.glitchTimer = 0;

    this.notifySubscribers();
  }

  private onMatchEnded(): void {
    if (!this.isHeadless) {
      if (this.status === 'VICTORY') {
        audioSynth.playVictory();
      } else if (this.status === 'DEFEAT' || this.status === 'DRAW') {
        audioSynth.playDefeat();
      }
    }
    if (this.matchConfig.autoRestartDelaySec !== null && this.matchConfig.autoRestartDelaySec > 0) {
      this.autoRestartTimer = this.matchConfig.autoRestartDelaySec;
      this.autoRestartCancelled = false;
    }
  }

  /**
   * Bước chạy mô phỏng chính (Fixed Timestep 60Hz)
   */
  public update(dt: number): void {
    if (this.status !== 'PLAYING') {
      if (this.autoRestartTimer !== null && !this.autoRestartCancelled) {
        this.autoRestartTimer -= dt;
        if (this.autoRestartTimer <= 0) {
          this.autoRestartTimer = null;
          this.reset();
          return;
        }
      }
      this.hudNotifyCooldown -= dt;
      if (this.hudNotifyCooldown <= 0) {
        this.hudNotifyCooldown = 0.08;
        this.notifySubscribers();
      }
      return;
    }

    this.matchTime += dt;

    // 1. Cập nhật hiệu ứng Glitch và Rung màn hình
    if (this.glitchTimer > 0) {
      this.glitchTimer -= dt;
      if (this.glitchTimer <= 0) {
        this.glitchActive = false;
      }
    }

    if (this.screenShake > 0) {
      this.screenShake -= dt * 10;
      if (this.screenShake < 0) this.screenShake = 0;
    }

    // 2. Cập nhật Kinh tế & Hàng đợi sản xuất lính
    const playerCompleted = this.playerEconomy.update(dt);
    for (const config of playerCompleted) {
      this.spawnUnit(config, 'LEFT');
    }

    const botCompleted = this.botEconomy.update(dt);
    for (const config of botCompleted) {
      this.spawnUnit(config, 'RIGHT');
    }

    // 3. Cập nhật Cooldown Tuyệt chiêu & Hàng đợi Mưa Pháo Ngẫu Nhiên
    this.playerUltimate.update(dt);
    this.botUltimate.update(dt);

    for (let i = this.pendingBarrageShells.length - 1; i >= 0; i--) {
      const item = this.pendingBarrageShells[i]!;
      item.timer -= dt;
      if (item.timer <= 0) {
        const s = item.spec;
        const proj = this.projectilePool.acquire();
        proj.init(
          `ult_shell_${Date.now()}_${this.random()}`,
          s.startX,
          s.startY,
          s.targetX,
          s.targetY,
          null,
          0,
          'SPECIAL',
          item.team,
          s.speed,
          s.color,
          s.radius,
          s.splashRadius,
          s.stunDuration > 0 ? [{ type: 'STUN', duration: s.stunDuration, value: 1.0 }] : [],
          0
        );
        proj.damagePercentMaxHp = s.damagePercentMaxHp;
        proj.isUltimateBarrage = true;
        this.pendingBarrageShells.splice(i, 1);
      }
    }

    // 4. Bot AI đưa ra quyết định (chỉ hoạt động trong chế độ Chơi Đơn)
    if (this.gameMode === 'SOLO') {
      this.botAI.update(
        dt,
        this.botEconomy,
        this.botAge,
        this.botTurrets,
        this.botUltimate,
        this.botUnits,
        this.playerUnits,
        () => this.triggerUltimate('RIGHT'),
        this.botUpgrades
      );
    }

    // 5. Cập nhật Lính phe Player
    for (let i = this.playerUnits.length - 1; i >= 0; i--) {
      const unit = this.playerUnits[i]!;
      unit.update(
        dt,
        this.playerUnits,
        this.botUnits,
        this.baseRightX,
        (evt) => this.handleCombatEvent(evt)
      );

      // Nếu lính đã chết và hết thời gian fade out -> Xóa khỏi mảng
      if (!unit.isAlive && unit.deathFadeTimer >= unit.deathDuration) {
        this.playerUnits.splice(i, 1);
      }
    }

    // 6. Cập nhật Lính phe Bot
    for (let i = this.botUnits.length - 1; i >= 0; i--) {
      const unit = this.botUnits[i]!;
      unit.update(
        dt,
        this.botUnits,
        this.playerUnits,
        this.baseLeftX,
        (evt) => this.handleCombatEvent(evt)
      );

      if (!unit.isAlive && unit.deathFadeTimer >= unit.deathDuration) {
        this.botUnits.splice(i, 1);
      }
    }

    // 7. Cập nhật Tháp Canh
    this.playerTurrets.update(dt, this.botUnits, (turret, target) => {
      this.fireTurretProjectile(turret, target);
    });

    this.botTurrets.update(dt, this.playerUnits, (turret, target) => {
      this.fireTurretProjectile(turret, target);
    });

    // 8. Cập nhật Đạn đạo (Projectiles)
    const activeProjectiles = [...this.projectilePool.getActive()];
    for (const proj of activeProjectiles) {
      const hit = proj.update(dt);
      if (hit) {
        this.handleProjectileImpact(proj);
        this.projectilePool.release(proj);
      }
    }

    // 9. Cập nhật Chữ bay (Floating Text)
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i]!;
      ft.duration += dt;
      ft.y += ft.vy * dt;
      if (ft.duration >= ft.maxDuration) {
        this.floatingTexts.splice(i, 1);
      }
    }

    // 10. Kiểm tra Bế Tắc (Stall Detection & Drain)
    if (this.damageDealtInTick) {
      this.stallTimer = 0;
      if (this.isStallDrainActive) {
        this.isStallDrainActive = false;
        this.stallDrainDuration = 0;
        this.currentStallDrainDps = 0;
      }
      this.damageDealtInTick = false;
    } else if (this.isAnyUnitInCombat()) {
      this.stallTimer = 0;
    } else {
      if (this.matchConfig.stallDetectSec !== null) {
        this.stallTimer += dt;
        if (this.stallTimer >= this.matchConfig.stallDetectSec) {
          this.isStallDrainActive = true;
          this.hasEverStalled = true;
        }
      }
    }

    if (this.isStallDrainActive) {
      this.stallDrainDuration += dt;
      const rampSteps = Math.floor(this.stallDrainDuration / this.matchConfig.stallDrainRampIntervalSec);
      this.currentStallDrainDps = this.matchConfig.stallDrainInitialDps + rampSteps * this.matchConfig.stallDrainRampDps;

      const drainAmount = this.currentStallDrainDps * dt;
      this.playerBaseHp = Math.max(0, this.playerBaseHp - drainAmount);
      this.botBaseHp = Math.max(0, this.botBaseHp - drainAmount);
    }

    // 11. Kiểm tra Hết Giờ (Timeout / Sudden Death)
    if (this.matchConfig.matchDurationSec !== null && !this.isSuddenDeath) {
      if (this.matchTime >= this.matchConfig.matchDurationSec) {
        if (this.playerBaseHp > this.botBaseHp) {
          this.status = 'VICTORY';
          this.endReason = 'TIMEOUT';
          this.onMatchEnded();
        } else if (this.botBaseHp > this.playerBaseHp) {
          this.status = 'DEFEAT';
          this.endReason = 'TIMEOUT';
          this.onMatchEnded();
        } else {
          // Bằng máu căn cứ: vào Sudden Death (tiếp tục đánh cho đến khi một căn cứ bị phá)
          this.isSuddenDeath = true;
        }
      }
    }

    // 12. Kiểm tra Điều Kiện Thắng / Thua (Căn cứ bị phá hủy hoặc rút cạn máu)
    if (this.status === 'PLAYING') {
      if (this.playerBaseHp <= 0 && this.botBaseHp <= 0) {
        this.playerBaseHp = 0;
        this.botBaseHp = 0;
        if (this.playerTotalDamageDealt > this.botTotalDamageDealt) {
          this.status = 'VICTORY';
          this.endReason = this.isStallDrainActive ? 'STALL_DRAIN' : 'BASE_DESTROYED';
        } else if (this.botTotalDamageDealt > this.playerTotalDamageDealt) {
          this.status = 'DEFEAT';
          this.endReason = this.isStallDrainActive ? 'STALL_DRAIN' : 'BASE_DESTROYED';
        } else {
          this.status = 'DRAW';
          this.endReason = 'DRAW';
        }
        this.onMatchEnded();
      } else if (this.playerBaseHp <= 0) {
        this.playerBaseHp = 0;
        this.status = 'DEFEAT';
        this.endReason = this.isStallDrainActive ? 'STALL_DRAIN' : 'BASE_DESTROYED';
        this.onMatchEnded();
      } else if (this.botBaseHp <= 0) {
        this.botBaseHp = 0;
        this.status = 'VICTORY';
        this.endReason = this.isStallDrainActive ? 'STALL_DRAIN' : 'BASE_DESTROYED';
        this.onMatchEnded();
      }
    }

    // 11. Giới hạn tần suất re-render của React HUD (Throttle ~12.5 FPS / 80ms)
    // Tách rời hoàn toàn khỏi vòng lặp 60 FPS của Canvas, triệt tiêu giật lag DOM
    this.hudNotifyCooldown -= dt;
    if (this.hudNotifyCooldown <= 0 || this.status !== 'PLAYING') {
      this.hudNotifyCooldown = 0.08;
      this.notifySubscribers();
    }
  }

  // ==========================================
  // XỬ LÝ SỰ KIỆN TÁC CHIẾN (COMBAT EVENTS)
  // ==========================================

  private handleCombatEvent(evt: any): void {
    switch (evt.type) {
      case 'MELEE_HIT':
        this.recordDamage(evt.damage, evt.sourceUnit?.team || null);
        if (!this.isHeadless) {
          audioSynth.playMeleeHit();
          particleSystem.spawnHitSparks(evt.x, evt.y);
        }
        // Chi tiết bằng code: Rung màn hình khi Tank cận chiến đập trúng
        if (evt.sourceUnit?.config.type === 'TANK') {
          this.screenShake = Math.max(this.screenShake, 4.5);
        }
        this.addFloatingText(`-${Math.round(evt.damage)}`, evt.x, evt.y - 20, 0xf87171);
        if (evt.targetBase || !evt.targetUnit) {
          if (evt.sourceUnit.team === 'LEFT') {
            this.botBaseHp -= evt.damage;
            this.recordDamage(evt.damage, 'LEFT');
          } else {
            this.playerBaseHp -= evt.damage;
            this.recordDamage(evt.damage, 'RIGHT');
          }
        }
        break;

      case 'RANGED_SHOOT': {
        const isLaser = evt.sourceUnit.team === 'LEFT' ? this.playerAge.currentAge >= 5 : this.botAge.currentAge >= 5;
        if (!this.isHeadless) audioSynth.playRangedShoot(isLaser);

        const proj = this.projectilePool.acquire();
        const targetX = evt.targetUnit ? evt.targetUnit.x : evt.sourceUnit.team === 'LEFT' ? this.baseRightX : this.baseLeftX;
        const targetY = evt.targetUnit ? evt.targetUnit.y : 520;

        // Xử lý cơ chế đặc biệt của Neural Hacker (Kỷ Nguyên AI)
        const isNeuralHacker = evt.sourceUnit.config.specialAbility === 'NEURAL_CONVERT';
        const effects = isNeuralHacker
          ? [
              { type: 'SLOW' as const, duration: 3.0, value: 0.35 },
              { type: 'ARMOR_SHRED' as const, duration: 3.0, value: 0.25 },
            ]
          : [];

        proj.init(
          `proj_${Date.now()}`,
          evt.x,
          evt.y,
          targetX,
          targetY,
          evt.targetUnit ? evt.targetUnit.id : null,
          evt.damage,
          evt.sourceUnit.config.type,
          evt.sourceUnit.team,
          evt.sourceUnit.config.specialAbility === 'AOE_SPLASH' ? 360 : 480,
          evt.sourceUnit.config.accentColor,
          evt.sourceUnit.config.specialAbility === 'AOE_SPLASH' ? 6 : 4,
          evt.sourceUnit.config.specialAbility === 'AOE_SPLASH' ? 65 : 0,
          effects,
          isNeuralHacker ? 0.15 : 0 // 15% xác suất convert lính đối phương
        );
        break;
      }

      case 'SHOCKWAVE': {
        this.recordDamage(evt.damage, evt.sourceUnit?.team || null);
        // Sóng chấn động đẩy lùi từ Quantum Synthesizer Mech
        if (!this.isHeadless) {
          audioSynth.playExplosion();
          particleSystem.spawnExplosion(evt.x, evt.y, 0x34d399, 45);
        }
        this.screenShake = 6.0;
        this.addFloatingText('QUANTUM BURST!', evt.x, evt.y - 35, 0x34d399);

        const targets = evt.sourceUnit.team === 'LEFT' ? this.botUnits : this.playerUnits;
        for (const target of targets) {
          if (!target.isAlive) continue;
          const dist = Math.abs(target.x - evt.x);
          if (dist <= 140) {
            target.knockback(120);
            target.takeDamage(evt.damage, 'SPECIAL', evt.sourceUnit, (e) => this.handleCombatEvent(e));
            this.addFloatingText(`-${evt.damage}`, target.x, target.y - 20, 0x10b981);
          }
        }
        break;
      }

      case 'DEATH': {
        const deadUnit = evt.sourceUnit as Unit;
        const killerTeam: Team = deadUnit.team === 'LEFT' ? 'RIGHT' : 'LEFT';
        const eco = killerTeam === 'LEFT' ? this.playerEconomy : this.botEconomy;

        if (!this.isHeadless) {
          particleSystem.spawnDeathStars(deadUnit.x, deadUnit.y, 0xfacc15);
        }

        // Thưởng Vàng (60% giá quân) và XP (100% giá quân) theo data/economy.ts
        const bountyGold = getKillBountyGold(deadUnit.config.cost);
        const bountyXp = getKillBountyXp(deadUnit.config.cost);
        eco.addGold(bountyGold, true);
        eco.addXp(bountyXp);

        // Hiển thị chữ "+vàng" bay lên tại chỗ lính chết
        if (killerTeam === 'LEFT') {
          this.addFloatingText(`+${bountyGold}G`, deadUnit.x, deadUnit.y - 30, 0xfbbf24);
        } else {
          this.addFloatingText(`+${bountyGold}G`, deadUnit.x, deadUnit.y - 30, 0xf87171);
        }

        // Kiểm tra cơ chế hồi sinh System Reboot (30% cơ hội)
        const ultiMgr = killerTeam === 'LEFT' ? this.playerUltimate : this.botUltimate;
        if (ultiMgr.tryClaimRebootResurrect(deadUnit)) {
          this.resurrectUnitAsAlly(deadUnit, killerTeam);
        }
        break;
      }
    }
  }

  /**
   * Đạn chạm đích
   */
  private handleProjectileImpact(proj: Projectile): void {
    const isSplash = proj.splashRadius > 0;
    const enemyList = proj.sourceTeam === 'LEFT' ? this.botUnits : this.playerUnits;

    if (isSplash) {
      if (proj.isUltimateBarrage) {
        this.screenShake = Math.max(this.screenShake, 5.0);
      } else if (proj.attackerType === 'TANK') {
        this.screenShake = Math.max(this.screenShake, 3.8);
      }
      if (!this.isHeadless) {
        audioSynth.playExplosion();
        particleSystem.spawnExplosion(proj.x, proj.y, proj.color, proj.isUltimateBarrage ? 48 : 36);
      }
      for (const enemy of enemyList) {
        if (!enemy.isAlive) continue;
        const dist = Math.abs(enemy.x - proj.x);
        if (dist <= proj.splashRadius) {
          for (const eff of proj.effectsToApply) {
            enemy.status.applyEffect(eff.type, eff.duration, eff.value, 'REFRESH');
          }
          const dmg = proj.damagePercentMaxHp > 0 ? enemy.maxHp * proj.damagePercentMaxHp : proj.damage;
          this.recordDamage(dmg, proj.sourceTeam);
          enemy.takeDamage(dmg, proj.attackerType, null, (evt) => this.handleCombatEvent(evt));
          this.addFloatingText(`-${Math.round(dmg)}`, enemy.x, enemy.y - 20, proj.isUltimateBarrage ? 0xfbbf24 : 0xf87171);
        }
      }
      if (!proj.isUltimateBarrage) {
        const baseReach = Math.max(90, proj.splashRadius);
        if (proj.sourceTeam === 'LEFT' && (Math.abs(proj.x - this.baseRightX) <= baseReach || proj.x >= this.baseRightX)) {
          this.botBaseHp -= proj.damage;
          this.recordDamage(proj.damage, 'LEFT');
          this.addFloatingText(`-${Math.round(proj.damage)}`, this.baseRightX, 480, 0xf87171);
        } else if (proj.sourceTeam === 'RIGHT' && (Math.abs(proj.x - this.baseLeftX) <= baseReach || proj.x <= this.baseLeftX)) {
          this.playerBaseHp -= proj.damage;
          this.recordDamage(proj.damage, 'RIGHT');
          this.addFloatingText(`-${Math.round(proj.damage)}`, this.baseLeftX, 480, 0xf87171);
        }
      }
      return;
    }

    // Đạn đơn mục tiêu
    let hitUnit: Unit | null = null;
    if (proj.targetUnitId) {
      hitUnit = enemyList.find((u) => u.id === proj.targetUnitId && u.isAlive) || null;
    }

    if (!hitUnit) {
      // Tìm đơn vị gần nhất tại điểm đạn rơi
      hitUnit =
        enemyList.find((u) => u.isAlive && Math.abs(u.x - proj.x) <= 35) || null;
    }

    if (hitUnit) {
      if (!this.isHeadless) {
        particleSystem.spawnHitSparks(hitUnit.x, hitUnit.y, proj.color);
      }
      // 1. Áp dụng hiệu ứng debuff kèm theo (slow, armor_shred)
      for (const eff of proj.effectsToApply) {
        hitUnit.status.applyEffect(eff.type, eff.duration, eff.value, 'REFRESH');
      }

      // 2. Kiểm tra xác suất Hack chuyển phe của Neural Hacker (15%, không convert Tank)
      if (proj.convertChance > 0 && hitUnit.config.type !== 'TANK') {
        if (this.random() < proj.convertChance) {
          this.convertUnitTeam(hitUnit);
          return;
        }
      }

      this.recordDamage(proj.damage, proj.sourceTeam);
      hitUnit.takeDamage(proj.damage, proj.attackerType, null, (evt) => this.handleCombatEvent(evt));
      this.addFloatingText(`-${Math.round(proj.damage)}`, hitUnit.x, hitUnit.y - 20, 0xf87171);
    } else {
      // Nếu đạn bay trúng Căn cứ
      if (proj.sourceTeam === 'LEFT' && (Math.abs(proj.x - this.baseRightX) <= 90 || proj.x >= this.baseRightX)) {
        this.botBaseHp -= proj.damage;
        this.recordDamage(proj.damage, 'LEFT');
        this.addFloatingText(`-${Math.round(proj.damage)}`, this.baseRightX, 480, 0xf87171);
      } else if (proj.sourceTeam === 'RIGHT' && (Math.abs(proj.x - this.baseLeftX) <= 90 || proj.x <= this.baseLeftX)) {
        this.playerBaseHp -= proj.damage;
        this.recordDamage(proj.damage, 'RIGHT');
        this.addFloatingText(`-${Math.round(proj.damage)}`, this.baseLeftX, 480, 0xf87171);
      }
    }
  }

  /**
   * Tháp canh / Máy bắn đá khai hỏa
   */
  private fireTurretProjectile(turret: Turret, target: Unit): void {
    if (!this.isHeadless) audioSynth.playTurretShoot();

    const proj = this.projectilePool.acquire();
    proj.init(
      `turret_proj_${Date.now()}_${this.random()}`,
      turret.x,
      turret.y,
      target.x,
      target.y,
      target.id,
      turret.damage,
      'RANGED',
      turret.team,
      turret.config.projectileSpeed || 420,
      turret.config.color || 0x78350f,
      9, // Boulders / đá tảng to 9px rõ rệt
      60 // Sát thương va chạm chấn động AoE 60px
    );
  }

  /**
   * Chuyển phe một đơn vị (Neural Hacker)
   */
  private convertUnitTeam(unit: Unit): void {
    if (unit.team === 'LEFT') {
      const idx = this.playerUnits.indexOf(unit);
      if (idx !== -1) this.playerUnits.splice(idx, 1);
      unit.convertTeam();
      this.botUnits.push(unit);
    } else {
      const idx = this.botUnits.indexOf(unit);
      if (idx !== -1) this.botUnits.splice(idx, 1);
      unit.convertTeam();
      this.playerUnits.push(unit);
    }

    if (!this.isHeadless) audioSynth.playGlitchReboot();
    this.addFloatingText('HACKED & CONVERTED!', unit.x, unit.y - 35, 0x10b981);
  }

  /**
   * Hồi sinh quân địch vừa chết thành quân phe ta (System Reboot 30% chance)
   */
  private resurrectUnitAsAlly(deadUnit: Unit, resurrectTeam: Team): void {
    const list = resurrectTeam === 'LEFT' ? this.playerUnits : this.botUnits;
    if (list.length >= MAX_UNITS_PER_TEAM) return;

    const newUnit = new Unit(
      `revive_${this.nextUnitId++}`,
      deadUnit.config,
      resurrectTeam,
      deadUnit.x,
      deadUnit.baseY
    );
    newUnit.hp = Math.round(newUnit.maxHp * 0.5); // Hồi sinh với 50% HP
    list.push(newUnit);

    this.addFloatingText('REBOOTED ALLY!', deadUnit.x, deadUnit.y - 40, 0x34d399);
  }

  // ==========================================
  // HÀNH ĐỘNG TỪ NGƯỜI CHƠI / GIAO DIỆN
  // ==========================================

  public spawnPlayerUnit(unitConfig: UnitConfig): boolean {
    if (this.playerUnits.length >= MAX_UNITS_PER_TEAM) return false;
    return this.playerEconomy.enqueueUnit(unitConfig);
  }

  public ageUpPlayer(): boolean {
    if (this.playerEconomy.canAgeUp(this.playerAge.currentAge)) {
      if (this.playerAge.advanceAge()) {
        this.playerEconomy.setAge(this.playerAge.currentAge);
        // Khi lên kỷ nguyên, giữ lại 50% số cấp cũ (làm tròn xuống)
        this.playerUpgrades.onAgeAdvance();
        this.playerTurrets.setUpgradeMultipliers(
          this.playerUpgrades.getTurretDamageMultiplier(),
          this.playerUpgrades.getTurretRangeMultiplier()
        );
        if (!this.isHeadless) audioSynth.playAgeUp();
        this.addFloatingText('AGE UPGRADE!', this.baseLeftX + 50, 440, 0xfacc15);
        this.notifySubscribers();
        return true;
      }
    }
    return false;
  }

  public upgradePlayerUnit(type: UnitType): boolean {
    const success = this.playerUpgrades.upgradeUnit(
      type,
      this.playerEconomy,
      this.playerAge.currentAge,
      this.playerUnits
    );
    if (success) {
      const lvl = this.playerUpgrades.getUnitLevel(type);
      if (!this.isHeadless) audioSynth.playUpgrade();
      this.addFloatingText(`UPGRADE ${type} LV${lvl}!`, this.baseLeftX + 60, 430, 0x38bdf8);
      this.notifySubscribers();
    }
    return success;
  }

  public upgradePlayerTurret(): boolean {
    const success = this.playerUpgrades.upgradeTurret(
      this.playerEconomy,
      this.playerAge.currentAge,
      this.playerTurrets
    );
    if (success) {
      const lvl = this.playerUpgrades.turretLevel;
      if (!this.isHeadless) audioSynth.playUpgrade();
      this.addFloatingText(`TURRET UPGRADE LV${lvl}!`, this.baseLeftX + 60, 410, 0x4ade80);
      this.notifySubscribers();
    }
    return success;
  }

  public addPlayerTurretSlot(): boolean {
    if (!this.playerTurrets.canAddSlot()) return false;
    const cost = UPGRADE_CONFIG.getAddSlotCost(
      this.playerTurrets.slots.length,
      this.playerAge.currentAge
    );
    if (!this.playerEconomy.spendGold(cost)) return false;

    if (this.playerTurrets.addSlot()) {
      if (!this.isHeadless) audioSynth.playUpgrade();
      this.addFloatingText(`+1 TURRET SLOT!`, this.baseLeftX + 60, 390, 0xa855f7);
      this.notifySubscribers();
      return true;
    }
    return false;
  }

  public buildPlayerTurret(slotIndex: number, config?: TurretConfig): boolean {
    const turretConfig = config || this.playerAge.getConfig().turrets[0];
    if (!turretConfig) return false;
    if (slotIndex < 0 || slotIndex >= this.playerTurrets.slots.length) return false;
    if (this.playerTurrets.slots[slotIndex] !== null) return false;
    if (!this.playerEconomy.spendGold(turretConfig.cost)) return false;

    if (this.playerTurrets.buildTurret(slotIndex, turretConfig)) {
      if (!this.isHeadless) audioSynth.playUpgrade();
      this.addFloatingText(`-${turretConfig.cost}G`, this.baseLeftX + 50, 420, 0xef4444);
      this.notifySubscribers();
      return true;
    }
    return false;
  }

  public sellPlayerTurret(slotIndex: number): number {
    const refund = this.playerTurrets.sellTurret(slotIndex);
    if (refund > 0) {
      this.playerEconomy.addGold(refund);
      if (!this.isHeadless) audioSynth.playUpgrade();
      this.addFloatingText(`+${refund}G`, this.baseLeftX + 50, 420, 0xfacc15);
      this.notifySubscribers();
    }
    return refund;
  }

  public setPlayerAge(ageId: number): void {
    this.playerAge.setAge(ageId);
    this.playerEconomy.setAge(ageId);
    this.playerUpgrades.onAgeAdvance();
    this.playerTurrets.setUpgradeMultipliers(
      this.playerUpgrades.getTurretDamageMultiplier(),
      this.playerUpgrades.getTurretRangeMultiplier()
    );
    this.notifySubscribers();
  }

  // ==========================================
  // HÀNH ĐỘNG CHO NGƯỜI CHƠI 2 (PHE PHẢI / GUEST)
  // ==========================================

  public spawnRightUnit(unitConfig: UnitConfig): boolean {
    if (this.botUnits.length >= MAX_UNITS_PER_TEAM) return false;
    return this.botEconomy.enqueueUnit(unitConfig);
  }

  public ageUpRight(): boolean {
    if (this.botEconomy.canAgeUp(this.botAge.currentAge)) {
      if (this.botAge.advanceAge()) {
        this.botEconomy.setAge(this.botAge.currentAge);
        this.botUpgrades.onAgeAdvance();
        this.botTurrets.setUpgradeMultipliers(
          this.botUpgrades.getTurretDamageMultiplier(),
          this.botUpgrades.getTurretRangeMultiplier()
        );
        if (!this.isHeadless) audioSynth.playAgeUp();
        this.addFloatingText('AGE UPGRADE!', this.baseRightX - 50, 440, 0xf87171);
        this.notifySubscribers();
        return true;
      }
    }
    return false;
  }

  public upgradeRightUnit(type: UnitType): boolean {
    const success = this.botUpgrades.upgradeUnit(
      type,
      this.botEconomy,
      this.botAge.currentAge,
      this.botUnits
    );
    if (success) {
      const lvl = this.botUpgrades.getUnitLevel(type);
      if (!this.isHeadless) audioSynth.playUpgrade();
      this.addFloatingText(`UPGRADE ${type} LV${lvl}!`, this.baseRightX - 60, 430, 0xf87171);
      this.notifySubscribers();
    }
    return success;
  }

  public upgradeRightTurret(): boolean {
    const success = this.botUpgrades.upgradeTurret(
      this.botEconomy,
      this.botAge.currentAge,
      this.botTurrets
    );
    if (success) {
      const lvl = this.botUpgrades.turretLevel;
      if (!this.isHeadless) audioSynth.playUpgrade();
      this.addFloatingText(`TURRET UPGRADE LV${lvl}!`, this.baseRightX - 60, 410, 0xf87171);
      this.notifySubscribers();
    }
    return success;
  }

  public addRightTurretSlot(): boolean {
    if (!this.botTurrets.canAddSlot()) return false;
    const cost = UPGRADE_CONFIG.getAddSlotCost(
      this.botTurrets.slots.length,
      this.botAge.currentAge
    );
    if (!this.botEconomy.spendGold(cost)) return false;

    if (this.botTurrets.addSlot()) {
      if (!this.isHeadless) audioSynth.playUpgrade();
      this.addFloatingText(`+1 TURRET SLOT!`, this.baseRightX - 60, 390, 0xf87171);
      this.notifySubscribers();
      return true;
    }
    return false;
  }

  public buildRightTurret(slotIndex: number, config?: TurretConfig): boolean {
    const turretConfig = config || this.botAge.getConfig().turrets[0];
    if (!turretConfig) return false;
    if (slotIndex < 0 || slotIndex >= this.botTurrets.slots.length) return false;
    if (this.botTurrets.slots[slotIndex] !== null) return false;
    if (!this.botEconomy.spendGold(turretConfig.cost)) return false;

    if (this.botTurrets.buildTurret(slotIndex, turretConfig)) {
      if (!this.isHeadless) audioSynth.playUpgrade();
      this.addFloatingText(`-${turretConfig.cost}G`, this.baseRightX - 50, 420, 0xef4444);
      this.notifySubscribers();
      return true;
    }
    return false;
  }

  public sellRightTurret(slotIndex: number): number {
    const refund = this.botTurrets.sellTurret(slotIndex);
    if (refund > 0) {
      this.botEconomy.addGold(refund);
      if (!this.isHeadless) audioSynth.playUpgrade();
      this.addFloatingText(`+${refund}G`, this.baseRightX - 50, 420, 0xfacc15);
      this.notifySubscribers();
    }
    return refund;
  }

  public syncNotify(): void {
    this.notifySubscribers();
  }

  public setRightAge(ageId: number): void {
    this.botAge.setAge(ageId);
    this.botEconomy.setAge(ageId);
    this.botUpgrades.onAgeAdvance();
    this.botTurrets.setUpgradeMultipliers(
      this.botUpgrades.getTurretDamageMultiplier(),
      this.botUpgrades.getTurretRangeMultiplier()
    );
    this.notifySubscribers();
  }

  public triggerUltimate(team: Team): boolean {
    const isPlayer = team === 'LEFT';
    const ultiMgr = isPlayer ? this.playerUltimate : this.botUltimate;
    const ageMgr = isPlayer ? this.playerAge : this.botAge;
    const enemies = isPlayer ? this.botUnits : this.playerUnits;

    if (!ultiMgr.canTrigger(ageMgr.currentAge)) return false;

    const result = ultiMgr.trigger(
      ageMgr.currentAge,
      enemies,
      (target, damage) => {
        this.recordDamage(damage, team);
        this.addFloatingText(`-${Math.round(damage)}`, target.x, target.y - 25, 0xef4444);
      },
      (evt) => this.handleCombatEvent(evt)
    );

    if (result.success) {
      this.screenShake = 10.0;

      if (result.barrageShells && result.barrageShells.length > 0) {
        for (const spec of result.barrageShells) {
          this.pendingBarrageShells.push({
            team,
            spec,
            timer: spec.delay,
          });
        }
      }

      if (!this.isHeadless) {
        particleSystem.triggerUltimateIntro(result.name, ageMgr.getConfig().themeColor);
      }

      if (result.glitchScreen) {
        this.glitchActive = true;
        this.glitchTimer = result.glitchDuration || 2.0;
        if (!this.isHeadless) audioSynth.playGlitchReboot();
      } else {
        if (!this.isHeadless) audioSynth.playExplosion();
      }

      this.addFloatingText(`ULTIMATE: ${result.name.toUpperCase()}!`, this.frontlineX, 300, 0xf59e0b);
      this.notifySubscribers();
      return true;
    }

    return false;
  }

  public spawnUnit(config: UnitConfig, team: Team): Unit | null {
    const list = team === 'LEFT' ? this.playerUnits : this.botUnits;
    if (list.length >= MAX_UNITS_PER_TEAM) return null;

    const upg = team === 'LEFT' ? this.playerUpgrades : this.botUpgrades;
    const dmgMult = upg.getDamageMultiplier(config.type);
    const hpMult = upg.getHpMultiplier(config.type);
    const lvl = upg.getUnitLevel(config.type);

    const defaultStartX = team === 'LEFT' ? this.baseLeftX + 45 : this.baseRightX - 45;
    let startX = defaultStartX;
    const isNewFlying = !!config.flying || !!getSpriteConfig(config.id)?.flying;
    const minSpawnGap = 68;

    // Giữ khoảng cách đều đặn ngay khi bước ra khỏi cổng thành (không chồng đè lính vừa triệu hồi)
    for (const ally of list) {
      if (!ally.isAlive) continue;
      const allyFlying = !!ally.config.flying || !!ally.spriteConfig?.flying;
      if (allyFlying !== isNewFlying) continue;

      if (team === 'LEFT') {
        if (ally.x < defaultStartX + minSpawnGap) {
          startX = Math.min(startX, ally.x - minSpawnGap);
        }
      } else {
        if (ally.x > defaultStartX - minSpawnGap) {
          startX = Math.max(startX, ally.x + minSpawnGap);
        }
      }
    }
    startX = Math.max(-2200, Math.min(LANE_WIDTH + 2200, startX));

    const unit = new Unit(
      `u_${this.nextUnitId++}`,
      config,
      team,
      startX,
      520,
      dmgMult,
      hpMult,
      lvl
    );
    list.push(unit);

    if (!this.isHeadless) {
      particleSystem.spawnGateDust(Math.max(40, Math.min(LANE_WIDTH - 40, startX)), 540);
      if (team === 'LEFT') {
        audioSynth.playSpawn();
      }
    }

    return unit;
  }

  public addFloatingText(text: string, x: number, y: number, color: number): void {
    this.floatingTexts.push({
      id: `ft_${Date.now()}_${this.random()}`,
      text,
      x,
      y,
      color,
      duration: 0,
      maxDuration: 1.0,
      vy: -35,
    });
  }

  public get frontlineX(): number {
    let leftLead = this.baseLeftX;
    for (const u of this.playerUnits) {
      if (u.isAlive && u.x > leftLead) leftLead = u.x;
    }
    let rightLead = this.baseRightX;
    for (const u of this.botUnits) {
      if (u.isAlive && u.x < rightLead) rightLead = u.x;
    }
    return (leftLead + rightLead) / 2;
  }

  public getSnapshot(): WorldSnapshot {
    return {
      status: this.status,
      endReason: this.endReason,
      gameMode: this.gameMode,
      matchTime: this.matchTime,
      matchDurationSec: this.matchConfig.matchDurationSec,
      isSuddenDeath: this.isSuddenDeath,
      stallDrainActive: this.isStallDrainActive,
      stallDrainDps: this.currentStallDrainDps,
      autoRestartRemaining: this.autoRestartTimer,
      playerBaseHp: this.playerBaseHp,
      botBaseHp: this.botBaseHp,
      playerAge: this.playerAge.currentAge,
      botAge: this.botAge.currentAge,
      playerGold: Math.floor(this.playerEconomy.gold),
      playerXp: Math.floor(this.playerEconomy.xp),
      playerQueue: this.playerEconomy.spawnQueue.map((q) => ({
        id: q.id,
        unitId: q.config.id,
        progress: q.progress,
        duration: q.duration,
      })),
      playerUltiCooldownPercent: this.playerUltimate.getCooldownPercent(this.playerAge.currentAge),
      botUltiCooldownPercent: this.botUltimate.getCooldownPercent(this.botAge.currentAge),
      playerUnitCount: this.playerUnits.length,
      botUnitCount: this.botUnits.length,
      glitchActive: this.glitchActive,
      screenShake: this.screenShake,
      playerUpgradeLevels: { ...this.playerUpgrades.levels },
      playerTurretLevel: this.playerUpgrades.turretLevel,
      playerTurretSlotsCount: this.playerTurrets.slots.length,
      rightGold: Math.floor(this.botEconomy.gold),
      rightXp: Math.floor(this.botEconomy.xp),
      rightQueue: this.botEconomy.spawnQueue.map((q) => ({
        id: q.id,
        unitId: q.config.id,
        progress: q.progress,
        duration: q.duration,
      })),
      rightUpgradeLevels: { ...this.botUpgrades.levels },
      rightTurretLevel: this.botUpgrades.turretLevel,
      rightTurretSlotsCount: this.botTurrets.slots.length,
      cameraX: Math.round(this.cameraX),
      frontlineX: Math.round(this.frontlineX),
      laneWidth: LANE_WIDTH,
    };
  }

  private notifySubscribers(): void {
    if (this.subscribers.length === 0) return;
    const snap = this.getSnapshot();
    for (const sub of this.subscribers) {
      sub(snap);
    }
  }
}
