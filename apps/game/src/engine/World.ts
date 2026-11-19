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
import { particleSystem, type HitVfxTier } from './ParticleSystem';
import { Projectile, ProjectilePool } from './Projectile';
import { Turret, TurretManager } from './Turret';
import { type BarrageShellSpec, UltimateManager } from './Ultimate';
import { Unit, type CombatEvent } from './Unit';
import { UpgradeManager, type UpgradeLevels } from './Upgrades';
import { getModeMatchConfig, type GameMode, type ModeMatchConfig } from '../data/modes';
import { CONFIG } from '../data/combatFeelConfig';

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
  startY: number;
  y: number;
  color: number;
  duration: number;
  maxDuration: number;
  vy: number;
  risePx: number;
  scale: number;
  isCrit: boolean;
  targetKey?: string;
  damageAmount?: number;
  strokeWidth: number;
  active: boolean;
}

export interface CombatImpactLog {
  tick: number;
  timeMs: number;
  attackerId: string;
  team: Team;
  targetId: string;
  damage: number;
  tier: HitVfxTier;
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

  // Hiệu ứng chữ bay (Object Pool tái sử dụng, tối đa CONFIG.damageNumber.poolSize = 30)
  private floatingTextPool: FloatingText[] = [];
  public floatingTexts: FloatingText[] = [];
  private nextTextId = 1;

  // Trạng thái hiệu ứng màn hình
  public screenShake: number = 0;
  public glitchActive: boolean = false;
  public glitchTimer: number = 0;

  // Hàng đợi lệnh điều khiển đồng thời giữa Người chơi và Bot
  public isUpdating: boolean = false;
  public commandQueue: WorldCommand[] = [];

  // Đăng ký lắng nghe thay đổi trạng thái cho React HUD (chỉ push khi snapshot đổi)
  private subscribers: ((snapshot: WorldSnapshot) => void)[] = [];
  private hudNotifyCooldown: number = 0;
  private lastHudSignature: string = '';
  public onHudNotifyMeasured?: (touches: number, elapsedMs: number) => void;
  private nextUnitId = 1;
  private isHeadless: boolean = false;

  // Log thời điểm va chạm thực tế (phục vụ xác minh lệch pha đòn đánh Hạng mục B)
  public simTickCount: number = 0;
  public readonly impactLogs: CombatImpactLog[] = [];

  // Bộ đệm tái sử dụng mỗi tick 60Hz (tránh tạo mảng mới / GC pause mỗi tick)
  private readonly queuedCombatEventsBuf: CombatEvent[] = [];
  private readonly playerSnapshotBuf: Unit[] = [];
  private readonly botSnapshotBuf: Unit[] = [];
  private readonly queuedTurretShotsBuf: { turret: Turret; target: Unit }[] = [];
  private readonly activeProjectilesBuf: Projectile[] = [];
  private readonly impactingProjectilesBuf: Projectile[] = [];

  constructor(isHeadless: boolean = false) {
    this.isHeadless = isHeadless;
    this.playerUltimate.random = () => this.random();
    this.botUltimate.random = () => this.random();
    this.botAI.rng = () => this.random();
    for (let i = 0; i < CONFIG.damageNumber.poolSize; i++) {
      this.floatingTextPool.push(World.blankFloatingText());
    }
  }

  private static blankFloatingText(): FloatingText {
    return {
      id: '',
      text: '',
      x: 0,
      startY: 0,
      y: 0,
      color: 0xffffff,
      duration: 0,
      maxDuration: 0.7,
      vy: 0,
      risePx: 0,
      scale: 1,
      isCrit: false,
      strokeWidth: 4,
      active: false,
    };
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
    for (const ft of this.floatingTexts) {
      ft.active = false;
      this.floatingTextPool.push(ft);
    }
    this.floatingTexts.length = 0;
    this.screenShake = 0;
    if (!this.isHeadless) {
      particleSystem.clear();
    }
    this.glitchActive = false;
    this.glitchTimer = 0;
    this.simTickCount = 0;
    this.impactLogs.length = 0;
    this.lastHudSignature = '';

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
        this.hudNotifyCooldown = 0.1;
        const sig = this.computeHudSignature();
        if (sig !== this.lastHudSignature) {
          this.notifySubscribers(sig);
        }
      }
      return;
    }

    this.isUpdating = true;
    try {
      this.matchTime += dt;
      this.simTickCount++;

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
      // Tái sử dụng toàn bộ buffer mảng nhằm loại bỏ GC pause mỗi tick 60Hz.
      // ==========================================================
      const queuedCombatEvents = this.queuedCombatEventsBuf;
      queuedCombatEvents.length = 0;

      const playerSnapshot = this.playerSnapshotBuf;
      playerSnapshot.length = 0;
      for (let i = 0; i < this.playerUnits.length; i++) {
        playerSnapshot.push(this.playerUnits[i]!);
      }

      const botSnapshot = this.botSnapshotBuf;
      botSnapshot.length = 0;
      for (let i = 0; i < this.botUnits.length; i++) {
        botSnapshot.push(this.botUnits[i]!);
      }

      // Đơn vị hai bên cùng tính toán hành động dựa trên snapshot đầu tick
      for (let i = 0; i < playerSnapshot.length; i++) {
        playerSnapshot[i]!.planUpdate(
          dt,
          playerSnapshot,
          botSnapshot,
          this.baseRightX,
          this.queueCombatIntent
        );
      }

      for (let i = 0; i < botSnapshot.length; i++) {
        botSnapshot[i]!.planUpdate(
          dt,
          botSnapshot,
          playerSnapshot,
          this.baseLeftX,
          this.queueCombatIntent
        );
      }

      // Tháp canh hai phe cùng quét mục tiêu và lên kế hoạch khai hỏa
      const queuedTurretShots = this.queuedTurretShotsBuf;
      queuedTurretShots.length = 0;
      this.playerTurrets.update(dt, botSnapshot, this.queueTurretShot);
      this.botTurrets.update(dt, playerSnapshot, this.queueTurretShot);

      // Đạn đạo di chuyển và xác định va chạm
      const activeProjectiles = this.activeProjectilesBuf;
      activeProjectiles.length = 0;
      const liveProjs = this.projectilePool.getActive();
      for (let i = 0; i < liveProjs.length; i++) {
        activeProjectiles.push(liveProjs[i]!);
      }
      const impactingProjectiles = this.impactingProjectilesBuf;
      impactingProjectiles.length = 0;
      for (let i = 0; i < activeProjectiles.length; i++) {
        const proj = activeProjectiles[i]!;
        if (proj.update(dt)) {
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

      // 2.5. Cập nhật Chữ bay (Ease-out bay lên 35px, pop scale 1.4 -> 1.0 trong 120ms, thu hồi về pool)
      const popSec = Math.max(0.02, CONFIG.damageNumber.popDurationMs / 1000);
      for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
        const ft = this.floatingTexts[i]!;
        ft.duration += dt;
        if (ft.duration >= ft.maxDuration) {
          ft.active = false;
          const last = this.floatingTexts.pop()!;
          if (i < this.floatingTexts.length) {
            this.floatingTexts[i] = last;
          }
          this.floatingTextPool.push(ft);
          continue;
        }
        if (ft.risePx > 0) {
          const t = ft.duration / ft.maxDuration;
          const easeOut = 1 - Math.pow(1 - t, 3);
          ft.y = ft.startY - ft.risePx * easeOut;
        } else {
          ft.y += ft.vy * dt;
        }
        if (ft.duration < popSec) {
          const pt = ft.duration / popSec;
          const popEase = 1 - Math.pow(1 - pt, 2);
          ft.scale = CONFIG.damageNumber.popStartScale - (CONFIG.damageNumber.popStartScale - 1.0) * popEase;
        } else {
          ft.scale = 1.0;
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

      // Chỉ đẩy snapshot xuống React HUD khi giá trị hiển thị thực sự thay đổi (tránh render DOM dư mỗi frame)
      this.hudNotifyCooldown -= dt;
      if (this.hudNotifyCooldown <= 0 || this.status !== 'PLAYING') {
        this.hudNotifyCooldown = 0.08;
        const sig = this.computeHudSignature();
        if (sig !== this.lastHudSignature) {
          this.notifySubscribers(sig);
        }
      }
    } finally {
      this.isUpdating = false;
    }
  }

  private readonly queueCombatIntent = (evt: CombatEvent): void => {
    this.queuedCombatEventsBuf.push(evt);
  };

  private readonly queueTurretShot = (turret: Turret, target: Unit): void => {
    this.queuedTurretShotsBuf.push({ turret, target });
  };

  // ==========================================
  // XỬ LÝ SỰ KIỆN TÁC CHIẾN (COMBAT EVENTS)
  // ==========================================

  private handleCombatEvent(evt: any): void {
    switch (evt.type) {
      case 'MELEE_HIT': {
        this.recordDamage(evt.damage, evt.sourceUnit?.team || null);
        const isHeavy = Boolean(
          evt.isHeavy ||
            evt.sourceUnit?.config.type === 'TANK' ||
            evt.sourceUnit?.config.type === 'SPECIAL'
        );
        const isCrit = Boolean(evt.isCrit);

        let killedTarget = false;
        let resolvedTargetId = 'unknown';

        if (evt.targetUnit && evt.targetUnit.isAlive) {
          resolvedTargetId = evt.targetUnit.id;
          const dmgType = evt.damageType || evt.sourceUnit?.config.type || 'MELEE';
          const targetFootY = 540 + (evt.targetUnit.laneOffsetY || 0);
          evt.targetUnit.takeDamage(evt.damage, dmgType, evt.sourceUnit, (e: any) =>
            this.handleCombatEvent(e)
          );
          killedTarget = !evt.targetUnit.isAlive;
          this.addDamageNumber(
            evt.damage,
            evt.targetUnit.id,
            evt.targetUnit.x,
            targetFootY,
            evt.sourceUnit.team,
            isCrit
          );
        } else if (evt.targetBase || !evt.targetUnit) {
          const baseKey = evt.sourceUnit.team === 'LEFT' ? 'base_right' : 'base_left';
          resolvedTargetId = baseKey;
          if (evt.sourceUnit.team === 'LEFT') {
            this.botBaseHp -= evt.damage;
            this.recordDamage(evt.damage, 'LEFT');
            killedTarget = this.botBaseHp <= 0;
          } else {
            this.playerBaseHp -= evt.damage;
            this.recordDamage(evt.damage, 'RIGHT');
            killedTarget = this.playerBaseHp <= 0;
          }
          this.addDamageNumber(evt.damage, baseKey, evt.x, 540, evt.sourceUnit.team, isCrit);
        }

        // Thang VFX 3 mức (Hạng mục C): NORMAL (tia lửa nhỏ + vệt ngắn) -> HEAVY (vệt to + hit-stop dài) -> KILL (tối đa)
        const vfxTier: HitVfxTier = killedTarget ? 'KILL' : isHeavy || isCrit ? 'HEAVY' : 'NORMAL';

        if (this.impactLogs.length < 120) {
          this.impactLogs.push({
            tick: this.simTickCount,
            timeMs: Math.round(this.matchTime * 1000),
            attackerId: evt.sourceUnit?.id || 'unknown',
            team: evt.sourceUnit?.team || 'LEFT',
            targetId: resolvedTargetId,
            damage: Math.round(evt.damage),
            tier: vfxTier,
          });
        }

        if (!this.isHeadless) {
          audioSynth.playMeleeHit();
          const slashColor =
            vfxTier === 'KILL' || isCrit ? 0xfef08a : vfxTier === 'HEAVY' ? 0xfde047 : 0xffffff;
          particleSystem.spawnSlashVfx(
            evt.x,
            evt.y,
            evt.sourceUnit?.direction || 1,
            slashColor,
            vfxTier
          );
          particleSystem.spawnHitSparks(
            evt.x,
            evt.y,
            vfxTier === 'NORMAL' ? 0xffe066 : 0xfacc15,
            evt.footY,
            vfxTier
          );

          // Căn chỉnh Hit-stop theo 3 mức: Thường 55ms, Mạnh 85ms, Kết liễu 95ms
          const stopSec =
            (vfxTier === 'KILL'
              ? CONFIG.hitFeedback.killHitStopMs
              : vfxTier === 'HEAVY'
              ? CONFIG.hitFeedback.heavyHitStopMs
              : CONFIG.hitFeedback.normalHitStopMs) / 1000;
          if (evt.sourceUnit?.anim) {
            evt.sourceUnit.anim.hitStopTimer = stopSec;
          }
          if (evt.targetUnit?.isAlive && evt.targetUnit?.anim) {
            evt.targetUnit.anim.hitStopTimer = stopSec;
          }

          // Chỉ rung nhẹ 2.5px cho đòn mạnh/crit (đòn kết liễu rung 3px tại DEATH)
          if (vfxTier === 'HEAVY') {
            particleSystem.triggerMicroShake(
              CONFIG.hitFeedback.heavyShakePx,
              CONFIG.hitFeedback.shakeDurationMs
            );
          }
        }
        break;
      }

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

        // Thưởng Vàng (60% giá quân) và XP (100% giá quân) — giữ nguyên gameplay logic
        const bountyGold = getKillBountyGold(deadUnit.config.cost);
        const bountyXp = getKillBountyXp(deadUnit.config.cost);
        eco.addGold(bountyGold, true);
        eco.addXp(bountyXp);

        if (!this.isHeadless) {
          // Rung 3px trong 100ms khi kết liễu đơn vị + Bụi ngã + Xu vàng / Orb XP bay Bezier về HUD
          particleSystem.triggerMicroShake(
            CONFIG.hitFeedback.killShakePx,
            CONFIG.hitFeedback.shakeDurationMs
          );
          particleSystem.spawnFallDust(deadUnit.x, evt.footY ?? 540);
          const coinCount =
            CONFIG.death.coinCountMin +
            Math.floor(this.random() * (CONFIG.death.coinCountMax - CONFIG.death.coinCountMin + 1));
          particleSystem.spawnRewardOrbs(
            deadUnit.x,
            evt.footY ?? 540,
            killerTeam,
            coinCount,
            CONFIG.death.xpOrbCount
          );
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
          this.addDamageNumber(
            dmg,
            enemy.id,
            enemy.x,
            540 + (enemy.laneOffsetY || 0),
            proj.sourceTeam,
            proj.isUltimateBarrage
          );
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
      this.addDamageNumber(
        proj.damage,
        hitUnit.id,
        hitUnit.x,
        540 + (hitUnit.laneOffsetY || 0),
        proj.sourceTeam,
        false
      );
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
        // Chỉ rung màn hình khi tung Chiêu cuối, không che màn hình bằng banner/ảnh intro
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
      lvl,
      !this.isHeadless
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

  private acquireFloatingText(): FloatingText {
    const slot = this.floatingTextPool.pop();
    if (slot) return slot;
    const oldest = this.floatingTexts.shift();
    if (oldest) return oldest;
    return World.blankFloatingText();
  }

  /**
   * Hạng mục 3: Sinh số sát thương pooled (tối đa 30), tự gộp cùng target trong 150ms,
   * bay lên 35px ease-out trong 700ms, pop scale 1.4 -> 1.0 trong 120ms đầu.
   */
  public addDamageNumber(
    amount: number,
    targetKey: string,
    worldX: number,
    footRenderY: number,
    attackerTeam: Team,
    isCrit: boolean = false
  ): void {
    const rounded = Math.round(amount);
    if (rounded <= 0) return;

    const mergeWindowSec = CONFIG.damageNumber.mergeWindowMs / 1000;
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i]!;
      if (ft.active && ft.targetKey === targetKey && ft.duration <= mergeWindowSec) {
        ft.damageAmount = (ft.damageAmount || 0) + amount;
        ft.isCrit = ft.isCrit || isCrit;
        ft.text = `-${Math.round(ft.damageAmount)}${ft.isCrit ? '!' : ''}`;
        if (ft.isCrit) {
          ft.color = attackerTeam === 'LEFT' ? CONFIG.damageNumber.dealtCritColor : CONFIG.damageNumber.receivedColor;
          ft.strokeWidth = 5;
        }
        ft.startY = ft.y;
        ft.duration = 0;
        ft.scale = CONFIG.damageNumber.popStartScale;
        return;
      }
    }

    const ft = this.acquireFloatingText();
    const jitterX = (this.random() * 2 - 1) * CONFIG.damageNumber.jitterXPx;
    const headY = footRenderY - CONFIG.damageNumber.headOffsetYPx;
    const color =
      attackerTeam === 'LEFT'
        ? isCrit
          ? CONFIG.damageNumber.dealtCritColor
          : CONFIG.damageNumber.dealtColor
        : CONFIG.damageNumber.receivedColor;

    ft.id = `dmg_${this.nextTextId++}`;
    ft.text = `-${rounded}${isCrit ? '!' : ''}`;
    ft.x = worldX + jitterX;
    ft.startY = headY;
    ft.y = headY;
    ft.color = color;
    ft.duration = 0;
    ft.maxDuration = CONFIG.damageNumber.lifetimeMs / 1000;
    ft.vy = 0;
    ft.risePx = CONFIG.damageNumber.risePx;
    ft.scale = CONFIG.damageNumber.popStartScale;
    ft.isCrit = isCrit;
    ft.targetKey = targetKey;
    ft.damageAmount = amount;
    ft.strokeWidth = isCrit ? 5 : 4;
    ft.active = true;
    this.floatingTexts.push(ft);
  }

  public addFloatingText(text: string, x: number, y: number, color: number): void {
    const ft = this.acquireFloatingText();
    ft.id = `ft_${this.nextTextId++}`;
    ft.text = text;
    ft.x = x;
    ft.startY = y;
    ft.y = y;
    ft.color = color;
    ft.duration = 0;
    ft.maxDuration = 1.0;
    ft.vy = -35;
    ft.risePx = 0;
    ft.scale = 1.0;
    ft.isCrit = false;
    ft.targetKey = undefined;
    ft.damageAmount = undefined;
    ft.strokeWidth = 4;
    ft.active = true;
    this.floatingTexts.push(ft);
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

  private computeHudSignature(): string {
    const pq = this.playerEconomy.spawnQueue;
    const bq = this.botEconomy.spawnQueue;
    const pFirst = pq[0];
    const bFirst = bq[0];
    const pUlti = Math.round(this.playerUltimate.getCooldownPercent(this.playerAge.currentAge) * 40);
    const bUlti = Math.round(this.botUltimate.getCooldownPercent(this.botAge.currentAge) * 40);
    const pQStr = pFirst ? `${pq.length}:${pFirst.config.id}:${Math.round((pFirst.progress / pFirst.duration) * 24)}` : '0';
    const bQStr = bFirst ? `${bq.length}:${bFirst.config.id}:${Math.round((bFirst.progress / bFirst.duration) * 24)}` : '0';
    const restartSec = this.autoRestartTimer !== null ? Math.ceil(this.autoRestartTimer) : -1;
    return [
      this.status,
      this.gameMode,
      Math.floor(this.matchTime),
      Math.round(this.playerBaseHp),
      Math.round(this.botBaseHp),
      Math.floor(this.playerEconomy.gold),
      Math.floor(this.playerEconomy.xp),
      Math.floor(this.botEconomy.gold),
      Math.floor(this.botEconomy.xp),
      this.playerUnits.length,
      this.botUnits.length,
      this.playerAge.currentAge,
      this.botAge.currentAge,
      this.playerUpgrades.turretLevel,
      this.botUpgrades.turretLevel,
      this.playerTurrets.slots.length,
      this.botTurrets.slots.length,
      pUlti,
      bUlti,
      pQStr,
      bQStr,
      restartSec,
    ].join('|');
  }

  private notifySubscribers(precomputedSig?: string): void {
    this.lastHudSignature = precomputedSig ?? this.computeHudSignature();
    if (this.subscribers.length === 0) return;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const snap = this.getSnapshot();
    for (const sub of this.subscribers) {
      sub(snap);
    }
    if (this.onHudNotifyMeasured && typeof performance !== 'undefined') {
      this.onHudNotifyMeasured(1, performance.now() - t0);
    }
  }
}
