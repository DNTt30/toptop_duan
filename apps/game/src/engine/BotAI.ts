/**
 * The Singularity Odyssey — Bot AI System
 * AI điều khiển phe đối phương (RIGHT) với 3 mức độ khó: Dễ (Easy), Vừa (Normal), Khó (Hard).
 * Đưa ra quyết định mua quân, xây tháp và tung kỹ năng tối thượng dựa trên thế trận.
 */

import { type Team, type UnitConfig, type UnitType } from '../data/ages';
import { UPGRADE_CONFIG } from '../data/upgrades';
import { type AgeManager } from './AgeManager';
import { type Economy } from './Economy';
import { type TurretManager } from './Turret';
import { type UltimateManager } from './Ultimate';
import { type Unit } from './Unit';
import { type UpgradeManager } from './Upgrades';

export type BotDifficulty = 'EASY' | 'NORMAL' | 'HARD';
export type BotStrategy = 'BALANCED' | 'SPAM_UNITS' | 'FOCUS_UPGRADE';

export class BotAI {
  public difficulty: BotDifficulty = 'NORMAL';
  public strategy: BotStrategy = 'BALANCED';
  public team: Team = 'RIGHT';
  public decisionCooldown: number = 0;

  constructor(
    difficulty: BotDifficulty = 'NORMAL',
    team: Team = 'RIGHT',
    strategy: BotStrategy = 'BALANCED'
  ) {
    this.difficulty = difficulty;
    this.team = team;
    this.strategy = strategy;
  }

  public setDifficulty(diff: BotDifficulty): void {
    this.difficulty = diff;
  }

  public setStrategy(strategy: BotStrategy): void {
    this.strategy = strategy;
  }

  public update(
    dt: number,
    botEconomy: Economy,
    botAge: AgeManager,
    botTurrets: TurretManager,
    botUltimate: UltimateManager,
    botUnits: readonly Unit[],
    playerUnits: readonly Unit[],
    onTriggerUltimate: () => void,
    botUpgrades?: UpgradeManager
  ): void {
    this.decisionCooldown -= dt;
    if (this.decisionCooldown > 0) return;

    // Thiết lập nhịp suy nghĩ theo độ khó (có jitter nhẹ để tránh 2 bot lockstep)
    const baseInterval = this.difficulty === 'EASY' ? 2.5 : this.difficulty === 'NORMAL' ? 1.2 : 0.6;
    const jitter = (Math.random() - 0.5) * (baseInterval * 0.4);
    this.decisionCooldown = Math.max(0.2, baseInterval + jitter);

    const ageConfig = botAge.getConfig();

    // 1. Kiểm tra lên Kỷ Nguyên mới
    if (botEconomy.canAgeUp(botAge.currentAge)) {
      if (this.difficulty !== 'EASY' || Math.random() < 0.6) {
        if (botAge.advanceAge()) {
          botEconomy.setAge(botAge.currentAge);
          if (botUpgrades) {
            botUpgrades.onAgeAdvance();
            botTurrets.setUpgradeMultipliers(
              botUpgrades.getTurretDamageMultiplier(),
              botUpgrades.getTurretRangeMultiplier()
            );
          }
        }
      }
    }

    // 2. Quyết định sử dụng Tuyệt Chiêu Tối Thượng
    if (botUltimate.canTrigger(botAge.currentAge)) {
      const alivePlayers = playerUnits.filter((u) => u.isAlive);
      const enemyThreateningBase =
        this.team === 'RIGHT'
          ? alivePlayers.some((u) => u.x > 1150)
          : alivePlayers.some((u) => u.x < 450);

      if (this.difficulty === 'EASY') {
        if (enemyThreateningBase && Math.random() < 0.45) {
          onTriggerUltimate();
        }
      } else if (this.difficulty === 'NORMAL') {
        // NORMAL: Tung chiêu khi căn cứ bị đe dọa hoặc địch có cụm quân đông (>= 5 lính)
        if (enemyThreateningBase || alivePlayers.length >= 5) {
          onTriggerUltimate();
        }
      } else {
        // HARD: Tung chiêu khi căn cứ nguy cấp HOẶC địch có từ 4 lính dồn dập HOẶC địch tràn qua sân mình
        const enemyPastMid =
          this.team === 'RIGHT'
            ? alivePlayers.filter((u) => u.x > 850).length >= 2
            : alivePlayers.filter((u) => u.x < 750).length >= 2;
        if (enemyThreateningBase || alivePlayers.length >= 4 || enemyPastMid) {
          onTriggerUltimate();
        }
      }
    }

    // 3. Quyết định mua nâng cấp tháp canh thành (nếu có botUpgrades và chiến thuật cho phép)
    if (botUpgrades) {
      this.evaluateUpgrades(botEconomy, botAge.currentAge, botUpgrades, botTurrets);
    }

    // 4. Quyết định mua Tháp Canh
    this.evaluateTurretPurchase(botEconomy, ageConfig.turrets, botTurrets, botAge.currentAge);

    // 5. Quyết định sản xuất Lính (Spawn Units)
    this.evaluateUnitSpawn(botEconomy, ageConfig.units, botUnits, playerUnits);
  }

  private evaluateUpgrades(
    economy: Economy,
    currentAge: number,
    upgrades: UpgradeManager,
    botTurrets?: TurretManager
  ): void {
    if (this.strategy === 'SPAM_UNITS') return;

    // Chỉ nâng cấp vũ khí trên thành
    if (upgrades.canUpgradeTurret(economy, currentAge)) {
      upgrades.upgradeTurret(economy, currentAge, botTurrets);
    }
  }

  private evaluateTurretPurchase(
    economy: Economy,
    turrets: readonly any[],
    turretManager: TurretManager,
    currentAge: number = 1
  ): void {
    if (!turrets || turrets.length === 0) return;
    const turretConfig = turrets[0];
    if (!turretConfig) return;

    // Tìm slot tháp còn trống; nếu đã kín thì mở thêm slot khi dư vàng (Normal/Hard)
    let emptySlotIdx = turretManager.slots.findIndex((s) => s === null);
    if (emptySlotIdx === -1) {
      if (this.difficulty !== 'EASY' && turretManager.canAddSlot()) {
        const slotCost = UPGRADE_CONFIG.getAddSlotCost(turretManager.slots.length, currentAge);
        if (economy.gold >= slotCost * 1.5 && economy.spendGold(slotCost)) {
          turretManager.addSlot();
          emptySlotIdx = turretManager.slots.findIndex((s) => s === null);
        }
      }
      if (emptySlotIdx === -1) return;
    }

    const goldThreshold =
      this.difficulty === 'EASY'
        ? turretConfig.cost * 3.0
        : this.difficulty === 'NORMAL'
        ? turretConfig.cost * 1.8
        : turretConfig.cost * 1.1;

    if (economy.gold >= goldThreshold) {
      if (economy.spendGold(turretConfig.cost)) {
        turretManager.buildTurret(emptySlotIdx, turretConfig);
      }
    }
  }

  private evaluateUnitSpawn(
    economy: Economy,
    units: readonly UnitConfig[],
    botUnits: readonly Unit[],
    playerUnits: readonly Unit[]
  ): void {
    if (economy.spawnQueue.length >= 3) return; // Đang có quân trong hàng đợi

    const alivePlayers = playerUnits.filter((u) => u.isAlive);
    const [melee, ranged, tank, special] = units;
    if (!melee || !ranged || !tank) return;

    // 1. CHIẾN THUẬT SPAM QUÂN (RUSH & SWARM ĐỘI HÌNH)
    if (this.strategy === 'SPAM_UNITS') {
      const hasTank = botUnits.some((u) => u.isAlive && u.config.type === 'TANK');
      if (!hasTank && economy.canAfford(tank.cost)) {
        economy.enqueueUnit(tank);
        return;
      }
      if (economy.canAfford(ranged.cost) && Math.random() < 0.5) {
        economy.enqueueUnit(ranged);
        return;
      }
      if (economy.canAfford(melee.cost)) {
        economy.enqueueUnit(melee);
        return;
      }
      return;
    }

    // 2. CHIẾN THUẬT FOCUS UPGRADE (ƯU TIÊN TUYỆT ĐỐI NÂNG CẤP ĐẦU TIÊN)
    if (this.strategy === 'FOCUS_UPGRADE') {
      const isUnderThreat = alivePlayers.some((u) =>
        this.team === 'RIGHT' ? u.x > 3400 : u.x < 1100
      );
      if (!isUnderThreat) {
        return; // Nhịn tiền để nâng cấp lính trước
      }
    }

    // 3. CHIẾN THUẬT BALANCED (CÓ TỪ 2 LÍNH GIỮ ĐƯỜNG -> DÀNH TIỀN NÂNG CẤP)
    if (this.strategy === 'BALANCED') {
      const myAlive = botUnits.filter((u) => u.isAlive).length;
      if (myAlive >= 2 && economy.gold < 180) {
        return; // Đang có quân giữ đường, gom tiền nâng cấp
      }
    }

    let chosenConfig: UnitConfig = melee;

    if (this.difficulty === 'EASY') {
      // DỄ: Chọn ngẫu nhiên lính nào đủ tiền mua
      const affordable = units.filter((u) => economy.canAfford(u.cost));
      if (affordable.length > 0) {
        chosenConfig = affordable[Math.floor(Math.random() * affordable.length)]!;
        economy.enqueueUnit(chosenConfig);
      }
      return;
    }

    if (this.difficulty === 'NORMAL') {
      // VỪA: 65% khắc chế lính tiên phong, 35% biến hóa chiến thuật ngẫu nhiên
      const roll = Math.random();
      const frontPlayer =
        this.team === 'RIGHT'
          ? alivePlayers.sort((a, b) => b.x - a.x)[0]
          : alivePlayers.sort((a, b) => a.x - b.x)[0];

      if (roll < 0.65 && frontPlayer) {
        if (frontPlayer.config.type === 'TANK' && economy.canAfford(ranged.cost)) {
          chosenConfig = ranged; // Ranged khắc chế Tank
        } else if (frontPlayer.config.type === 'RANGED' && economy.canAfford(melee.cost)) {
          chosenConfig = melee; // Melee khắc chế Ranged
        } else if (frontPlayer.config.type === 'MELEE' && economy.canAfford(tank.cost)) {
          chosenConfig = tank; // Tank khắc chế Melee
        } else if (special && economy.canAfford(special.cost) && Math.random() < 0.4) {
          chosenConfig = special;
        } else {
          chosenConfig = melee;
        }
      } else {
        // Biến hóa ngẫu nhiên trong số lính đủ tiền mua
        const affordable = units.filter((u) => economy.canAfford(u.cost));
        if (affordable.length > 0) {
          chosenConfig = affordable[Math.floor(Math.random() * affordable.length)]!;
        }
      }

      if (economy.canAfford(chosenConfig.cost)) {
        economy.enqueueUnit(chosenConfig);
      }
      return;
    }

    // KHÓ (HARD): Phân tích toàn bộ đội hình đối phương và tối ưu hóa tài nguyên
    let playerMeleeCount = 0;
    let playerRangedCount = 0;
    let playerTankCount = 0;

    for (const p of alivePlayers) {
      if (p.config.type === 'MELEE') playerMeleeCount++;
      else if (p.config.type === 'RANGED') playerRangedCount++;
      else if (p.config.type === 'TANK') playerTankCount++;
    }

    // Nếu người chơi có nhiều Melee -> Triệu hồi Tank che chắn
    if (playerMeleeCount >= playerRangedCount && playerMeleeCount >= playerTankCount) {
      if (economy.canAfford(tank.cost)) {
        chosenConfig = tank;
      } else if (economy.canAfford(melee.cost)) {
        chosenConfig = melee;
      }
    }
    // Nếu người chơi có nhiều Ranged -> Đua tốc độ với Melee áp sát
    else if (playerRangedCount > playerMeleeCount && playerRangedCount >= playerTankCount) {
      if (economy.canAfford(melee.cost)) {
        chosenConfig = melee;
      }
    }
    // Nếu người chơi có nhiều Tank -> Xạ thủ Ranged x1.25 sát thương
    else {
      if (economy.canAfford(ranged.cost)) {
        chosenConfig = ranged;
      }
    }

    // Thỉnh thoảng ra quân Special (Cực mạnh ở Kỷ Nguyên AI: Neural Hacker, Quantum Mech, Avatar)
    if (special && economy.canAfford(special.cost) && Math.random() < 0.35) {
      chosenConfig = special;
    }

    if (economy.canAfford(chosenConfig.cost)) {
      economy.enqueueUnit(chosenConfig);
    }
  }
}
