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
import { Unit, type CombatEvent } from './Unit';
import { UpgradeManager, type UpgradeLevels } from './Upgrades';
import { getModeMatchConfig, type GameMode, type ModeMatchConfig } from '../data/modes';

export type { GameMode, ModeMatchConfig };

export type WorldCommand =
  | { team: Team; type: 'SPAWN_UNIT'; config: UnitConfig }
  | { team: Team; type: 'AGE_UP' }
  | { team: Team; type: 'UPGRADE_UNIT'; unitType: UnitType }
  | { team: Team; type: 'UPGRADE_TURRET' }
  | { team: Team; type: 'ADD_TURRET_SLOT' }
  | { team: Team; type: 'BUILD_TURRET'; slotIndex: number; config?: TurretConfig }
  | { team: Team; type: 'SELL_TURRET'; slotIndex: number }
  | { team: Team; type: 'ULTIMATE' };

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

export type GameStatus = 'PAUSED' | 'PLAYING' | 'VICTORY' | 'DEFEAT';
export type MatchEndReason = 'BASE_DESTROYED' | 'SURRENDER' | 'ADMIN_END' | 'UNFINISHED';

export interface WorldSnapshot {
  status: GameStatus;
  endReason: MatchEndReason | null;
  gameMode: GameMode;
  matchTime: number;
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

  // Tự chơi lại (Auto-restart)
  public autoRestartTimer: number | null = null;
  public autoRestartCancelled: boolean = false;

  // Tổng sát thương gây ra bởi mỗi phe (để phân định nếu 2 base cùng vỡ trong 1 tick)
  public playerTotalDamageDealt: number = 0;
  public botTotalDamageDealt: number = 0;

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

  // Hàng đợi lệnh điều khiển đồng thời giữa Người chơi và Bot
  public isUpdating: boolean = false;
  public commandQueue: WorldCommand[] = [];

  // Đăng ký lắng nghe thay đổi trạng thái cho React HUD
  private subscribers: ((snapshot: WorldSnapshot) => void)[] = [];
  private hudNotifyCooldown: number = 0;
  private nextUnitId = 1;
  private isHeadless: boolean = false;

  constructor(isHeadless: boolean = false) {
    this.isHeadless = isHeadless;
    this.playerUltimate.random = () => this.random();
    this.botUltimate.random = () => this.random();
    this.botAI.rng = () => this.random();
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
    if (sourceTeam === 'LEFT') {
      this.playerTotalDamageDealt += amount;
    } else if (sourceTeam === 'RIGHT') {
      this.botTotalDamageDealt += amount;
    }
  }

  /**
   * Đầu hàng (Surrender) - tính thua cho bên đầu hàng
   */
  public surrender(surrenderingTeam: Team = 'LEFT'): void {
    if (this.status !== 'PLAYING') return;
    this.endReason = 'SURRENDER';
    if (surrenderingTeam === 'LEFT') {
      this.status = 'DEFEAT';
    } else {
      this.status = 'VICTORY';
    }
    this.onMatchEnded();
    this.notifySubscribers();
  }

  /**
   * Lệnh quản trị kết thúc trận (ADMIN_END) - dùng cho chế độ LIVE hoặc debug
   */
  public adminEndMatch(winnerTeam?: Team | null): void {
    if (this.status !== 'PLAYING') return;
    this.endReason = 'ADMIN_END';
    if (winnerTeam === 'LEFT') {
      this.status = 'VICTORY';
    } else if (winnerTeam === 'RIGHT') {
      this.status = 'DEFEAT';
    } else {
      this.status = this.playerBaseHp >= this.botBaseHp ? 'VICTORY' : 'DEFEAT';
    }
    this.onMatchEnded();
    this.notifySubscribers();
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
    this.autoRestartTimer = null;
    this.autoRestartCancelled = false;
    this.playerTotalDamageDealt = 0;
    this.botTotalDamageDealt = 0;
    this.playerBaseHp = BASE_MAX_HP;
    this.botBaseHp = BASE_MAX_HP;
    this.commandQueue = [];
    this.isUpdating = false;

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
      } else if (this.status === 'DEFEAT') {
        audioSynth.playDefeat();
      }
    }
    if (this.matchConfig.autoRestartDelaySec !== null && this.matchConfig.autoRestartDelaySec > 0) {
      this.autoRestartTimer = this.matchConfig.autoRestartDelaySec;
      this.autoRestartCancelled = false;
    }
  }

  public queueCommand(cmd: WorldCommand): void {
    this.commandQueue.push(cmd);
  }

  public processCommandQueue(): void {
    if (this.commandQueue.length === 0) return;
    const commands = [...this.commandQueue];
    this.commandQueue = [];
    for (const cmd of commands) {
      this.executeCommand(cmd);
    }
  }

  public executeCommand(cmd: WorldCommand): boolean {
    switch (cmd.type) {
      case 'SPAWN_UNIT':
        return this.executeSpawnUnit(cmd.team, cmd.config);
      case 'AGE_UP':
        return this.executeAgeUp(cmd.team);
      case 'UPGRADE_UNIT':
        return this.executeUpgradeUnit(cmd.team, cmd.unitType);
      case 'UPGRADE_TURRET':
        return this.executeUpgradeTurret(cmd.team);
      case 'ADD_TURRET_SLOT':
        return this.executeAddTurretSlot(cmd.team);
      case 'BUILD_TURRET':
        return this.executeBuildTurret(cmd.team, cmd.slotIndex, cmd.config);
      case 'SELL_TURRET':
        return this.executeSellTurret(cmd.team, cmd.slotIndex) > 0;
      case 'ULTIMATE':
        return this.triggerUltimate(cmd.team);
    }
  }

  private updatePendingBarrageShells(dt: number): void {
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
  }

  private checkBaseDestruction(): void {
    if (this.status !== 'PLAYING') return;

    if (this.playerBaseHp <= 0 && this.botBaseHp <= 0) {
      const pOverkillHp = this.playerBaseHp;
      const bOverkillHp = this.botBaseHp;
      this.playerBaseHp = 0;
      this.botBaseHp = 0;

      // Nấc 1: Bên có máu âm ít hơn thắng (ví dụ -5 HP thắng -50 HP)
      if (pOverkillHp > bOverkillHp) {
        this.status = 'VICTORY';
      } else if (bOverkillHp > pOverkillHp) {
        this.status = 'DEFEAT';
      }
      // Nấc 2: Nếu máu âm bằng nhau, bên gây tổng sát thương lớn hơn thắng
      else if (this.playerTotalDamageDealt > this.botTotalDamageDealt) {
        this.status = 'VICTORY';
      } else if (this.botTotalDamageDealt > this.playerTotalDamageDealt) {
        this.status = 'DEFEAT';
      }
      // Nấc 3: Tổng máu quân còn sống trên sân, sau đó là tổng vàng kiếm được
      else {
        const playerUnitsAliveHp = this.playerUnits
          .filter((u) => u.isAlive)
          .reduce((sum, u) => sum + u.hp, 0);
        const botUnitsAliveHp = this.botUnits
          .filter((u) => u.isAlive)
          .reduce((sum, u) => sum + u.hp, 0);

        if (playerUnitsAliveHp > botUnitsAliveHp) {
          this.status = 'VICTORY';
        } else if (botUnitsAliveHp > playerUnitsAliveHp) {
          this.status = 'DEFEAT';
        } else if (this.playerEconomy.totalGoldEarned > this.botEconomy.totalGoldEarned) {
          this.status = 'VICTORY';
        } else if (this.botEconomy.totalGoldEarned > this.playerEconomy.totalGoldEarned) {
          this.status = 'DEFEAT';
        }
        // Nấc 4: Quyết định ngẫu nhiên dựa trên RNG seed (không dùng >= để không thiên vị)
        else {
          this.status = this.random() < 0.5 ? 'VICTORY' : 'DEFEAT';
        }
      }

      this.endReason = 'BASE_DESTROYED';
      this.onMatchEnded();
    } else if (this.playerBaseHp <= 0) {
      this.playerBaseHp = 0;
      this.status = 'DEFEAT';
      this.endReason = 'BASE_DESTROYED';
      this.onMatchEnded();
    } else if (this.botBaseHp <= 0) {
      this.botBaseHp = 0;
      this.status = 'VICTORY';
      this.endReason = 'BASE_DESTROYED';
      this.onMatchEnded();
    }
  }

  /**
   * Bước chạy mô phỏng chính (Fixed Timestep 60Hz) — Vòng lặp 2 Pha Đồng Thời
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

    this.isUpdating = true;
    try {
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

      // ==========================================================
      // PHA 0: XỬ LÝ LỆNH ĐỒNG THỜI (COMMAND PHASE)
      // Các lệnh từ người chơi và bot được xếp hàng đợi và xử lý đồng thời
      // ==========================================================
      if (this.gameMode === 'SOLO') {
        this.botAI.update(
          dt,
          this.botEconomy,
          this.botAge,
          this.botTurrets,
          this.botUltimate,
          this.botUnits,
          this.playerUnits,
          () => this.queueCommand({ team: 'RIGHT', type: 'ULTIMATE' }),
          this.botUpgrades,
          this.playerAge.currentAge
        );
      }
      this.processCommandQueue();

      // Cập nhật Kinh tế & Sinh lính đã hoàn tất huấn luyện
      const playerCompleted = this.playerEconomy.update(dt);
      for (const config of playerCompleted) {
        this.spawnUnit(config, 'LEFT');
      }

      const botCompleted = this.botEconomy.update(dt);
      for (const config of botCompleted) {
        this.spawnUnit(config, 'RIGHT');
      }

      // Cập nhật Cooldown Tuyệt chiêu & Hàng đợi Mưa Pháo Ngẫu Nhiên
      this.playerUltimate.update(dt);
      this.botUltimate.update(dt);
      this.updatePendingBarrageShells(dt);

      // ==========================================================
      // PHA 1: PHA QUYẾT ĐỊNH (DECISION PHASE)
      // Cả hai phe cùng đọc trạng thái tại đầu tick.
      // KHÔNG trừ máu hay di chuyển thực tế ở pha này.
      // ==========================================================
      const queuedCombatEvents: CombatEvent[] = [];
      const onCombatIntent = (evt: CombatEvent) => {
        queuedCombatEvents.push(evt);
      };

      const playerSnapshot = [...this.playerUnits];
      const botSnapshot = [...this.botUnits];

      // Đơn vị hai bên cùng tính toán hành động dựa trên snapshot đầu tick
      for (let i = 0; i < playerSnapshot.length; i++) {
        playerSnapshot[i]!.planUpdate(
          dt,
          playerSnapshot,
          botSnapshot,
          this.baseRightX,
          onCombatIntent
        );
      }

      for (let i = 0; i < botSnapshot.length; i++) {
        botSnapshot[i]!.planUpdate(
          dt,
          botSnapshot,
          playerSnapshot,
          this.baseLeftX,
          onCombatIntent
        );
      }

      // Tháp canh hai phe cùng quét mục tiêu và lên kế hoạch khai hỏa
      const queuedTurretShots: { turret: Turret; target: Unit }[] = [];
      this.playerTurrets.update(dt, botSnapshot, (turret, target) => {
        queuedTurretShots.push({ turret, target });
      });
      this.botTurrets.update(dt, playerSnapshot, (turret, target) => {
        queuedTurretShots.push({ turret, target });
      });

      // Đạn đạo di chuyển và xác định va chạm
      const activeProjectiles = [...this.projectilePool.getActive()];
      const impactingProjectiles: Projectile[] = [];
      for (const proj of activeProjectiles) {
        const hit = proj.update(dt);
        if (hit) {
          impactingProjectiles.push(proj);
        }
      }

      // ==========================================================
      // PHA 2: PHA THỰC THI (EXECUTION PHASE)
      // Áp dụng đồng thời di chuyển, sát thương, xóa quân chết, cộng vàng/XP.
      // Nếu hai quân cùng đánh nhau chết trong tick này, CẢ HAI CÙNG CHẾT.
      // ==========================================================

      // 2.1. Áp dụng đồng thời di chuyển đã lên kế hoạch
      for (let i = 0; i < this.playerUnits.length; i++) {
        this.playerUnits[i]!.applyPlannedMovement();
      }
      for (let i = 0; i < this.botUnits.length; i++) {
        this.botUnits[i]!.applyPlannedMovement();
      }

      // 2.2. Khai hỏa đạn tháp canh
      for (const ts of queuedTurretShots) {
        this.fireTurretProjectile(ts.turret, ts.target);
      }

      // 2.3. Giải quyết toàn bộ đòn đánh và sát thương cận chiến / tầm xa của lính
      for (const evt of queuedCombatEvents) {
        this.handleCombatEvent(evt);
      }

      // 2.4. Giải quyết va chạm đạn đạo
      for (const proj of impactingProjectiles) {
        this.handleProjectileImpact(proj);
        this.projectilePool.release(proj);
      }

      // 2.5. Cập nhật Chữ bay (Floating Text)
      for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
        const ft = this.floatingTexts[i]!;
        ft.duration += dt;
        ft.y += ft.vy * dt;
        if (ft.duration >= ft.maxDuration) {
          this.floatingTexts.splice(i, 1);
        }
      }

      // 2.6. Xóa quân đã chết và hết thời gian fade out
      for (let i = this.playerUnits.length - 1; i >= 0; i--) {
        const unit = this.playerUnits[i]!;
        if (!unit.isAlive && unit.deathFadeTimer >= unit.deathDuration) {
          this.playerUnits.splice(i, 1);
        }
      }
      for (let i = this.botUnits.length - 1; i >= 0; i--) {
        const unit = this.botUnits[i]!;
        if (!unit.isAlive && unit.deathFadeTimer >= unit.deathDuration) {
          this.botUnits.splice(i, 1);
        }
      }

      // 2.7. Kiểm tra Điều Kiện Thắng / Thua (Căn cứ bị phá hủy)
      this.checkBaseDestruction();

      // Giới hạn tần suất re-render của React HUD (~80ms)
      this.hudNotifyCooldown -= dt;
      if (this.hudNotifyCooldown <= 0 || this.status !== 'PLAYING') {
        this.hudNotifyCooldown = 0.08;
        this.notifySubscribers();
      }
    } finally {
      this.isUpdating = false;
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
        if (evt.targetUnit && evt.targetUnit.isAlive) {
          const dmgType = evt.damageType || evt.sourceUnit?.config.type || 'MELEE';
          evt.targetUnit.takeDamage(evt.damage, dmgType, evt.sourceUnit, (e: any) => this.handleCombatEvent(e));
        } else if (evt.targetBase || !evt.targetUnit) {
          if (evt.sourceUnit.team === 'LEFT') {
            this.botBaseHp -= evt.damage;
            this.recordDamage(evt.damage, 'LEFT');
          } else {
            this.playerBaseHp -= evt.damage;
            this.recordDamage(evt.damage, 'RIGHT');
          }
        }
        break;
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
  // THỰC THI LỆNH ĐỒNG THỜI (COMMAND EXECUTION)
  // ==========================================

  public executeSpawnUnit(team: Team, unitConfig: UnitConfig): boolean {
    const list = team === 'LEFT' ? this.playerUnits : this.botUnits;
    const eco = team === 'LEFT' ? this.playerEconomy : this.botEconomy;
    if (list.length >= MAX_UNITS_PER_TEAM) return false;
    return eco.enqueueUnit(unitConfig);
  }

  public executeAgeUp(team: Team): boolean {
    const eco = team === 'LEFT' ? this.playerEconomy : this.botEconomy;
    const ageMgr = team === 'LEFT' ? this.playerAge : this.botAge;
    const upg = team === 'LEFT' ? this.playerUpgrades : this.botUpgrades;
    const turrets = team === 'LEFT' ? this.playerTurrets : this.botTurrets;
    const baseTextX = team === 'LEFT' ? this.baseLeftX + 50 : this.baseRightX - 50;
    const textColor = team === 'LEFT' ? 0xfacc15 : 0xf87171;

    if (eco.canAgeUp(ageMgr.currentAge)) {
      if (ageMgr.advanceAge()) {
        eco.setAge(ageMgr.currentAge);
        upg.onAgeAdvance();
        turrets.setUpgradeMultipliers(
          upg.getTurretDamageMultiplier(),
          upg.getTurretRangeMultiplier()
        );
        if (!this.isHeadless) audioSynth.playAgeUp();
        this.addFloatingText('AGE UPGRADE!', baseTextX, 440, textColor);
        this.notifySubscribers();
        return true;
      }
    }
    return false;
  }

  public executeUpgradeUnit(team: Team, type: UnitType): boolean {
    const upg = team === 'LEFT' ? this.playerUpgrades : this.botUpgrades;
    const eco = team === 'LEFT' ? this.playerEconomy : this.botEconomy;
    const ageMgr = team === 'LEFT' ? this.playerAge : this.botAge;
    const units = team === 'LEFT' ? this.playerUnits : this.botUnits;
    const baseTextX = team === 'LEFT' ? this.baseLeftX + 60 : this.baseRightX - 60;
    const textColor = team === 'LEFT' ? 0x38bdf8 : 0xf87171;

    const success = upg.upgradeUnit(type, eco, ageMgr.currentAge, units);
    if (success) {
      const lvl = upg.getUnitLevel(type);
      if (!this.isHeadless) audioSynth.playUpgrade();
      this.addFloatingText(`UPGRADE ${type} LV${lvl}!`, baseTextX, 430, textColor);
      this.notifySubscribers();
    }
    return success;
  }

  public executeUpgradeTurret(team: Team): boolean {
    const upg = team === 'LEFT' ? this.playerUpgrades : this.botUpgrades;
    const eco = team === 'LEFT' ? this.playerEconomy : this.botEconomy;
    const ageMgr = team === 'LEFT' ? this.playerAge : this.botAge;
    const turrets = team === 'LEFT' ? this.playerTurrets : this.botTurrets;
    const baseTextX = team === 'LEFT' ? this.baseLeftX + 60 : this.baseRightX - 60;
    const textColor = team === 'LEFT' ? 0x4ade80 : 0xf87171;

    const success = upg.upgradeTurret(eco, ageMgr.currentAge, turrets);
    if (success) {
      const lvl = upg.turretLevel;
      if (!this.isHeadless) audioSynth.playUpgrade();
      this.addFloatingText(`TURRET UPGRADE LV${lvl}!`, baseTextX, 410, textColor);
      this.notifySubscribers();
    }
    return success;
  }

  public executeAddTurretSlot(team: Team): boolean {
    const turrets = team === 'LEFT' ? this.playerTurrets : this.botTurrets;
    const ageMgr = team === 'LEFT' ? this.playerAge : this.botAge;
    const eco = team === 'LEFT' ? this.playerEconomy : this.botEconomy;
    const baseTextX = team === 'LEFT' ? this.baseLeftX + 60 : this.baseRightX - 60;
    const textColor = team === 'LEFT' ? 0xa855f7 : 0xf87171;

    if (!turrets.canAddSlot()) return false;
    const cost = UPGRADE_CONFIG.getAddSlotCost(turrets.slots.length, ageMgr.currentAge);
    if (!eco.spendGold(cost)) return false;

    if (turrets.addSlot()) {
      if (!this.isHeadless) audioSynth.playUpgrade();
      this.addFloatingText(`+1 TURRET SLOT!`, baseTextX, 390, textColor);
      this.notifySubscribers();
      return true;
    }
    return false;
  }

  public executeBuildTurret(team: Team, slotIndex: number, config?: TurretConfig): boolean {
    const turrets = team === 'LEFT' ? this.playerTurrets : this.botTurrets;
    const ageMgr = team === 'LEFT' ? this.playerAge : this.botAge;
    const eco = team === 'LEFT' ? this.playerEconomy : this.botEconomy;
    const baseTextX = team === 'LEFT' ? this.baseLeftX + 50 : this.baseRightX - 50;

    const turretConfig = config || ageMgr.getConfig().turrets[0];
    if (!turretConfig) return false;
    if (slotIndex < 0 || slotIndex >= turrets.slots.length) return false;
    if (turrets.slots[slotIndex] !== null) return false;
    if (!eco.spendGold(turretConfig.cost)) return false;

    if (turrets.buildTurret(slotIndex, turretConfig)) {
      if (!this.isHeadless) audioSynth.playUpgrade();
      this.addFloatingText(`-${turretConfig.cost}G`, baseTextX, 420, 0xef4444);
      this.notifySubscribers();
      return true;
    }
    return false;
  }

  public executeSellTurret(team: Team, slotIndex: number): number {
    const turrets = team === 'LEFT' ? this.playerTurrets : this.botTurrets;
    const eco = team === 'LEFT' ? this.playerEconomy : this.botEconomy;
    const baseTextX = team === 'LEFT' ? this.baseLeftX + 50 : this.baseRightX - 50;

    const refund = turrets.sellTurret(slotIndex);
    if (refund > 0) {
      eco.addGold(refund);
      if (!this.isHeadless) audioSynth.playUpgrade();
      this.addFloatingText(`+${refund}G`, baseTextX, 420, 0xfacc15);
      this.notifySubscribers();
    }
    return refund;
  }

  // ==========================================
  // HÀNH ĐỘNG TỪ NGƯỜI CHƠI / GIAO DIỆN (PHE TRÁI)
  // ==========================================

  public spawnPlayerUnit(unitConfig: UnitConfig): boolean {
    if (this.playerUnits.length >= MAX_UNITS_PER_TEAM) return false;
    if (!this.playerEconomy.canAfford(unitConfig.cost)) return false;
    if (this.isUpdating) {
      this.queueCommand({ team: 'LEFT', type: 'SPAWN_UNIT', config: unitConfig });
      return true;
    }
    return this.executeSpawnUnit('LEFT', unitConfig);
  }

  public ageUpPlayer(): boolean {
    if (!this.playerEconomy.canAgeUp(this.playerAge.currentAge)) return false;
    if (this.isUpdating) {
      this.queueCommand({ team: 'LEFT', type: 'AGE_UP' });
      return true;
    }
    return this.executeAgeUp('LEFT');
  }

  public upgradePlayerUnit(type: UnitType): boolean {
    if (this.isUpdating) {
      this.queueCommand({ team: 'LEFT', type: 'UPGRADE_UNIT', unitType: type });
      return true;
    }
    return this.executeUpgradeUnit('LEFT', type);
  }

  public upgradePlayerTurret(): boolean {
    if (this.isUpdating) {
      this.queueCommand({ team: 'LEFT', type: 'UPGRADE_TURRET' });
      return true;
    }
    return this.executeUpgradeTurret('LEFT');
  }

  public addPlayerTurretSlot(): boolean {
    if (!this.playerTurrets.canAddSlot()) return false;
    if (this.isUpdating) {
      this.queueCommand({ team: 'LEFT', type: 'ADD_TURRET_SLOT' });
      return true;
    }
    return this.executeAddTurretSlot('LEFT');
  }

  public buildPlayerTurret(slotIndex: number, config?: TurretConfig): boolean {
    if (this.isUpdating) {
      this.queueCommand({ team: 'LEFT', type: 'BUILD_TURRET', slotIndex, config });
      return true;
    }
    return this.executeBuildTurret('LEFT', slotIndex, config);
  }

  public sellPlayerTurret(slotIndex: number): number {
    if (this.isUpdating) {
      this.queueCommand({ team: 'LEFT', type: 'SELL_TURRET', slotIndex });
      return 1;
    }
    return this.executeSellTurret('LEFT', slotIndex);
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
    if (!this.botEconomy.canAfford(unitConfig.cost)) return false;
    if (this.isUpdating) {
      this.queueCommand({ team: 'RIGHT', type: 'SPAWN_UNIT', config: unitConfig });
      return true;
    }
    return this.executeSpawnUnit('RIGHT', unitConfig);
  }

  public ageUpRight(): boolean {
    if (!this.botEconomy.canAgeUp(this.botAge.currentAge)) return false;
    if (this.isUpdating) {
      this.queueCommand({ team: 'RIGHT', type: 'AGE_UP' });
      return true;
    }
    return this.executeAgeUp('RIGHT');
  }

  public upgradeRightUnit(type: UnitType): boolean {
    if (this.isUpdating) {
      this.queueCommand({ team: 'RIGHT', type: 'UPGRADE_UNIT', unitType: type });
      return true;
    }
    return this.executeUpgradeUnit('RIGHT', type);
  }

  public upgradeRightTurret(): boolean {
    if (this.isUpdating) {
      this.queueCommand({ team: 'RIGHT', type: 'UPGRADE_TURRET' });
      return true;
    }
    return this.executeUpgradeTurret('RIGHT');
  }

  public addRightTurretSlot(): boolean {
    if (!this.botTurrets.canAddSlot()) return false;
    if (this.isUpdating) {
      this.queueCommand({ team: 'RIGHT', type: 'ADD_TURRET_SLOT' });
      return true;
    }
    return this.executeAddTurretSlot('RIGHT');
  }

  public buildRightTurret(slotIndex: number, config?: TurretConfig): boolean {
    if (this.isUpdating) {
      this.queueCommand({ team: 'RIGHT', type: 'BUILD_TURRET', slotIndex, config });
      return true;
    }
    return this.executeBuildTurret('RIGHT', slotIndex, config);
  }

  public sellRightTurret(slotIndex: number): number {
    if (this.isUpdating) {
      this.queueCommand({ team: 'RIGHT', type: 'SELL_TURRET', slotIndex });
      return 1;
    }
    return this.executeSellTurret('RIGHT', slotIndex);
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

  /**
   * Định nghĩa tiền tuyến giao tranh chuẩn:
   * - Trung bình vị trí quân tiên phong (đầu hàng) của hai phe.
   * - Khi MỘT TRONG HAI PHE KHÔNG CÒN QUÂN SỐNG: trả về null (thay vì giá trị mặc định).
   */
  public get combatFrontlineX(): number | null {
    let leftLead: number | null = null;
    for (let i = 0; i < this.playerUnits.length; i++) {
      const u = this.playerUnits[i]!;
      if (u.isAlive && (leftLead === null || u.x > leftLead)) {
        leftLead = u.x;
      }
    }

    let rightLead: number | null = null;
    for (let i = 0; i < this.botUnits.length; i++) {
      const u = this.botUnits[i]!;
      if (u.isAlive && (rightLead === null || u.x < rightLead)) {
        rightLead = u.x;
      }
    }

    if (leftLead === null || rightLead === null) {
      return null;
    }

    return (leftLead + rightLead) / 2;
  }

  public getSnapshot(): WorldSnapshot {
    return {
      status: this.status,
      endReason: this.endReason,
      gameMode: this.gameMode,
      matchTime: this.matchTime,
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
