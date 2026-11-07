/**
 * The Singularity Odyssey — Bot AI System
 * AI điều khiển phe đối phương (RIGHT) hoặc phe người chơi giả lập (LEFT)
 * 3 mức độ khó: Dễ (Easy), Vừa (Normal), Khó (Hard).
 * 5 trường phái chiến thuật:
 * - BALANCED: Cân bằng giữa mua lính và mua nâng cấp khi có thặng dư vàng.
 * - SPAM_UNITS: Chỉ mua lính liên tục, không bao giờ mua nâng cấp.
 * - FOCUS_UPGRADE: Tích cực mua nâng cấp lính và tháp tối đa trước.
 * - RUSH: Tiến hóa sớm nhất có thể, dồn quân thành đợt (chờ đủ N quân rồi cùng xuất), dùng ultimate khi đợt quân đang đẩy hoặc khi địch dồn cụm.
 * - TIMING: Tích đủ lên kỷ nguyên cao hơn đối phương rồi đẩy bằng đội quân thế hệ mới.
 */

import { type Team, type UnitConfig, type UnitType } from '../data/ages';
import { BOT_DIFFICULTY_CONFIGS, STRATEGY_BALANCE_CONFIG } from '../data/aiBalance';
import { UPGRADE_CONFIG } from '../data/upgrades';
import { type AgeManager } from './AgeManager';
import { type Economy } from './Economy';
import { distanceFromOwnBase, fractionFromOwnBase } from './symmetry';
import { type TurretManager } from './Turret';
import { type UltimateManager } from './Ultimate';
import { type Unit } from './Unit';
import { type UpgradeManager } from './Upgrades';

export type BotDifficulty = 'EASY' | 'NORMAL' | 'HARD';
export type BotStrategy = 'BALANCED' | 'SPAM_UNITS' | 'FOCUS_UPGRADE' | 'RUSH' | 'TIMING';

export class BotAI {
  public difficulty: BotDifficulty = 'NORMAL';
  public strategy: BotStrategy = 'BALANCED';
  public team: Team = 'RIGHT';
  public decisionCooldown: number = 0;
  public rng: () => number = Math.random;

  constructor(
    difficulty: BotDifficulty = 'NORMAL',
    team: Team = 'RIGHT',
    strategy: BotStrategy = 'BALANCED',
    rng?: () => number
  ) {
    this.difficulty = difficulty;
    this.team = team;
    this.strategy = strategy;
    if (rng) {
      this.rng = rng;
    }
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
    botUpgrades?: UpgradeManager,
    opponentAge: number = 1
  ): void {
    this.decisionCooldown -= dt;
    if (this.decisionCooldown > 0) return;

    const diffCfg = BOT_DIFFICULTY_CONFIGS[this.difficulty];

    // Thiết lập nhịp suy nghĩ theo độ khó (có jitter nhẹ để tránh 2 bot lockstep)
    const baseInterval = diffCfg.decisionIntervalBase;
    const jitter = (this.rng() - 0.5) * (baseInterval * diffCfg.decisionJitterFraction);
    this.decisionCooldown = Math.max(0.2, baseInterval + jitter);

    const ageConfig = botAge.getConfig();

    // 1. Kiểm tra lên Kỷ Nguyên mới
    if (botEconomy.canAgeUp(botAge.currentAge)) {
      // RUSH và TIMING luôn tiến hóa ngay lập tức 100% khi đủ XP
      const shouldAgeUp =
        this.strategy === 'RUSH' ||
        this.strategy === 'TIMING' ||
        this.rng() < diffCfg.ageUpAcceptProbability;

      if (shouldAgeUp) {
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

    // 2. Quyết định sử dụng Tuyệt Chiêu Tối Thượng (Đối xứng theo tỉ lệ cự ly từ căn cứ nhà)
    if (botUltimate.canTrigger(botAge.currentAge)) {
      const alivePlayers = playerUnits.filter((u) => u.isAlive);
      const enemyThreateningBase = alivePlayers.some(
        (u) => fractionFromOwnBase(this.team, u.x) <= diffCfg.threatDistanceFraction
      );

      const enemyPastMid =
        alivePlayers.filter((u) => fractionFromOwnBase(this.team, u.x) <= 0.5).length >=
        diffCfg.pastMidEnemiesCount;

      if (this.strategy === 'RUSH') {
        const aliveBots = botUnits.filter((u) => u.isAlive);
        const myPushingUnits = aliveBots.filter((u) => fractionFromOwnBase(this.team, u.x) > 0.45);
        // Dùng ultimate khi đợt quân đang đẩy hoặc khi địch dồn cụm
        const isPushing = aliveBots.length >= 3 && myPushingUnits.length >= 2;
        const isEnemyClustered = alivePlayers.length >= 3 || enemyThreateningBase;
        if (isPushing || isEnemyClustered) {
          onTriggerUltimate();
        }
      } else if (this.strategy === 'TIMING') {
        const aliveBots = botUnits.filter((u) => u.isAlive);
        const myPushingUnits = aliveBots.filter((u) => fractionFromOwnBase(this.team, u.x) > 0.40);
        // Khi đã vượt kỷ nguyên và đợt quân thế hệ mới đang tràn qua sân địch -> tung ulti hủy diệt
        const isTimingPush = botAge.currentAge > opponentAge && myPushingUnits.length >= 2;
        if (isTimingPush || enemyThreateningBase || alivePlayers.length >= 4) {
          onTriggerUltimate();
        }
      } else if (this.difficulty === 'EASY') {
        if (enemyThreateningBase && this.rng() < diffCfg.threatUltimateProbability) {
          onTriggerUltimate();
        }
      } else if (this.difficulty === 'NORMAL') {
        // NORMAL: Tung chiêu khi căn cứ bị đe dọa hoặc địch có cụm quân đông (>= 5 lính)
        if (enemyThreateningBase || alivePlayers.length >= diffCfg.swarmingEnemiesCount) {
          onTriggerUltimate();
        }
      } else {
        // HARD: Tung chiêu khi căn cứ nguy cấp HOẶC địch có cụm đông HOẶC tràn qua sân nhà
        if (
          enemyThreateningBase ||
          alivePlayers.length >= diffCfg.swarmingEnemiesCount ||
          enemyPastMid
        ) {
          onTriggerUltimate();
        }
      }
    }

    // 3. Quyết định mua nâng cấp tháp canh thành và lính
    if (botUpgrades) {
      this.evaluateUpgrades(botEconomy, botAge.currentAge, botUpgrades, botTurrets, botUnits, opponentAge);
    }

    // 4. Quyết định mua Tháp Canh
    this.evaluateTurretPurchase(botEconomy, ageConfig.turrets, botTurrets, botAge.currentAge, opponentAge);

    // 5. Quyết định sản xuất Lính (Spawn Units)
    this.evaluateUnitSpawn(
      botEconomy,
      ageConfig.units,
      botUnits,
      playerUnits,
      botUpgrades,
      botAge.currentAge,
      opponentAge
    );
  }

  private evaluateUpgrades(
    economy: Economy,
    currentAge: number,
    upgrades: UpgradeManager,
    botTurrets?: TurretManager,
    botUnits: readonly Unit[] = [],
    opponentAge: number = 1
  ): void {
    // SPAM_UNITS và RUSH không mua nâng cấp, dồn 100% vàng vào quân lực
    if (this.strategy === 'SPAM_UNITS' || this.strategy === 'RUSH') return;

    // TIMING: chỉ nâng cấp tháp khi chưa lên đời nếu dư nhiều tiền (> 250G)
    if (this.strategy === 'TIMING') {
      if (currentAge <= opponentAge) {
        if (economy.gold >= 250 && upgrades.canUpgradeTurret(economy, currentAge)) {
          upgrades.upgradeTurret(economy, currentAge, botTurrets);
        }
        return;
      }
      // Khi đã vượt kỷ nguyên: ưu tiên dồn lính trước, chỉ nâng cấp khi còn thặng dư >= 250G
      if (economy.gold >= 250) {
        if (upgrades.canUpgradeTurret(economy, currentAge)) {
          upgrades.upgradeTurret(economy, currentAge, botTurrets);
        }
      }
      return;
    }

    // 1. Nâng cấp vũ khí trên thành
    if (upgrades.canUpgradeTurret(economy, currentAge)) {
      upgrades.upgradeTurret(economy, currentAge, botTurrets);
    }

    // 2. Nâng cấp đơn vị lính (Ưu tiên cho FOCUS_UPGRADE hoặc khi dư dả vàng)
    if (this.strategy === 'FOCUS_UPGRADE' || economy.gold >= 250) {
      const unitTypes: UnitType[] = ['MELEE', 'TANK', 'RANGED'];
      for (const t of unitTypes) {
        if (upgrades.canUpgradeUnit(t, economy, currentAge)) {
          upgrades.upgradeUnit(t, economy, currentAge, botUnits as Unit[]);
          break;
        }
      }
    }
  }

  private evaluateTurretPurchase(
    economy: Economy,
    turrets: readonly any[],
    turretManager: TurretManager,
    currentAge: number = 1,
    opponentAge: number = 1
  ): void {
    if (!turrets || turrets.length === 0) return;
    const turretConfig = turrets[0];
    if (!turretConfig) return;

    // RUSH không mua tháp canh để dồn vàng cho đợt đẩy
    if (this.strategy === 'RUSH') return;

    // TIMING: Chỉ mua tối đa 1 tháp cơ bản khi slot 0 trống để hỗ trợ thủ nhà
    if (this.strategy === 'TIMING') {
      if (turretManager.slots[0] === null && economy.canAfford(turretConfig.cost)) {
        if (economy.spendGold(turretConfig.cost)) {
          turretManager.buildTurret(0, turretConfig);
        }
      }
      return;
    }

    const diffCfg = BOT_DIFFICULTY_CONFIGS[this.difficulty];

    // Tìm slot tháp còn trống; nếu đã kín thì mở thêm slot khi dư vàng (Normal/Hard)
    let emptySlotIdx = turretManager.slots.findIndex((s) => s === null);
    if (emptySlotIdx === -1) {
      if (diffCfg.canAddTurretSlot && turretManager.canAddSlot()) {
        const slotCost = UPGRADE_CONFIG.getAddSlotCost(turretManager.slots.length, currentAge);
        if (economy.gold >= slotCost * 1.5 && economy.spendGold(slotCost)) {
          turretManager.addSlot();
          emptySlotIdx = turretManager.slots.findIndex((s) => s === null);
        }
      }
      if (emptySlotIdx === -1) return;
    }

    const goldThreshold = turretConfig.cost * diffCfg.turretBuyGoldMultiplier;
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
    playerUnits: readonly Unit[],
    upgrades?: UpgradeManager,
    currentAge: number = 1,
    opponentAge: number = 1
  ): void {
    if (economy.spawnQueue.length >= 3) return; // Đang có quân trong hàng đợi

    const alivePlayers = playerUnits.filter((u) => u.isAlive);
    const [melee, ranged, tank, special] = units;
    if (!melee || !ranged || !tank) return;

    // 1. CHIẾN THUẬT RUSH: DỒN QUÂN THÀNH ĐỢT (WAVE RUSH)
    if (this.strategy === 'RUSH') {
      const myAlive = botUnits.filter((u) => u.isAlive);
      const isUnderThreat = alivePlayers.some(
        (u) => fractionFromOwnBase(this.team, u.x) <= 0.30
      );

      // Tình huống khẩn cấp: căn cứ bị uy hiếp và trên sân ít hơn 2 quân
      if (isUnderThreat && myAlive.length < 2) {
        if (economy.canAfford(tank.cost)) {
          economy.enqueueUnit(tank);
          return;
        }
        if (economy.canAfford(melee.cost)) {
          economy.enqueueUnit(melee);
          return;
        }
      }

      // Ngưỡng chi phí một đợt quân 3 con (Tank + Ranged + Melee)
      const waveCost = tank.cost + ranged.cost + melee.cost;

      // Nếu đang gom quân và chưa đủ waveCost
      if (economy.gold < waveCost) {
        // Nếu trên sân hoàn toàn trống quân (0 quân sống) và đủ tiền mua lính giữ đường:
        if (myAlive.length === 0 && economy.canAfford(tank.cost)) {
          economy.enqueueUnit(tank);
        }
        return;
      }

      // Đã tích đủ waveCost -> Bung toàn bộ đợt quân dồn dập
      if (economy.canAfford(tank.cost) && economy.spawnQueue.length < 3) {
        economy.enqueueUnit(tank);
      }
      if (economy.canAfford(ranged.cost) && economy.spawnQueue.length < 3) {
        economy.enqueueUnit(ranged);
      }
      if (economy.canAfford(melee.cost) && economy.spawnQueue.length < 3) {
        economy.enqueueUnit(melee);
      }
      if (special && economy.canAfford(special.cost) && economy.spawnQueue.length < 3) {
        economy.enqueueUnit(special);
      }
      return;
    }

    // 2. CHIẾN THUẬT TIMING: TÍCH ĐỦ LÊN KỶ NGUYÊN RỒI ĐẨY BẰNG ĐỘI QUÂN THẾ HỆ MỚI
    if (this.strategy === 'TIMING') {
      const myAlive = botUnits.filter((u) => u.isAlive);

      // Giai đoạn 1: Chưa vượt kỷ nguyên -> Phòng thủ giữ nhịp, tiết kiệm tối đa vàng
      if (currentAge <= opponentAge) {
        if (myAlive.length < 2) {
          if (economy.canAfford(melee.cost)) {
            economy.enqueueUnit(melee);
            return;
          }
          if (economy.canAfford(tank.cost)) {
            economy.enqueueUnit(tank);
            return;
          }
        }
        return; // Đã có quân giữ nhịp, giữ vàng để bung khi lên đời!
      }

      // Giai đoạn 2: ĐÃ VƯỢT KỶ NGUYÊN (currentAge > opponentAge) -> CỬA SỔ TIMING BÙNG NỔ!
      // Bung toàn bộ kho vàng mua dồn dập các đơn vị tối tân của kỷ nguyên mới
      if (economy.canAfford(tank.cost) && economy.spawnQueue.length < 3) {
        economy.enqueueUnit(tank);
      }
      if (special && economy.canAfford(special.cost) && economy.spawnQueue.length < 3) {
        economy.enqueueUnit(special);
      }
      if (economy.canAfford(ranged.cost) && economy.spawnQueue.length < 3) {
        economy.enqueueUnit(ranged);
      }
      if (economy.canAfford(melee.cost) && economy.spawnQueue.length < 3) {
        economy.enqueueUnit(melee);
      }
      return;
    }

    // 3. CHIẾN THUẬT SPAM QUÂN (RUSH & SWARM ĐỘI HÌNH)
    if (this.strategy === 'SPAM_UNITS') {
      const hasTank = botUnits.some((u) => u.isAlive && u.config.type === 'TANK');
      if (!hasTank && economy.canAfford(tank.cost)) {
        economy.enqueueUnit(tank);
        return;
      }
      if (economy.canAfford(ranged.cost) && this.rng() < 0.5) {
        economy.enqueueUnit(ranged);
        return;
      }
      if (economy.canAfford(melee.cost)) {
        economy.enqueueUnit(melee);
        return;
      }
      return;
    }

    // 4. CHIẾN THUẬT FOCUS UPGRADE (ƯU TIÊN NÂNG CẤP ĐẦU TIÊN)
    if (this.strategy === 'FOCUS_UPGRADE') {
      const myAliveCount = botUnits.filter((u) => u.isAlive).length;
      // BẮT BUỘC giữ ít nhất 2 quân trên sân (1 Tank che chắn + 1 Melee/Ranged)
      if (myAliveCount < 2) {
        const hasTank = botUnits.some((u) => u.isAlive && u.config.type === 'TANK');
        if (!hasTank && economy.canAfford(tank.cost)) {
          economy.enqueueUnit(tank);
          return;
        }
        if (economy.canAfford(melee.cost)) {
          economy.enqueueUnit(melee);
          return;
        }
      }

      const isUnderThreat = alivePlayers.some(
        (u) => fractionFromOwnBase(this.team, u.x) <= 0.35
      );

      // Nếu không bị đe dọa: nhịn tiền nếu sắp đủ mua nâng cấp tiếp theo
      if (!isUnderThreat && upgrades) {
        let minUpgradeCost: number | null = null;
        for (const t of ['MELEE', 'TANK', 'RANGED'] as const) {
          const lvl = upgrades.getUnitLevel(t);
          if (lvl < UPGRADE_CONFIG.unit.maxLevel) {
            const c = UPGRADE_CONFIG.getUnitUpgradeCost(lvl, currentAge);
            if (c !== null && (minUpgradeCost === null || c < minUpgradeCost)) {
              minUpgradeCost = c;
            }
          }
        }
        // Chỉ nhịn tiền khi đang gom dưới 180 vàng và thực sự có nâng cấp
        if (minUpgradeCost !== null && economy.gold < minUpgradeCost && economy.gold < 180) {
          return;
        }
      }
    }

    // 5. CHIẾN THUẬT BALANCED
    if (this.strategy === 'BALANCED') {
      const myAlive = botUnits.filter((u) => u.isAlive).length;
      const isUnderThreat = alivePlayers.some(
        (u) => fractionFromOwnBase(this.team, u.x) <= 0.30
      );
      if (!isUnderThreat && myAlive >= 2 && economy.gold < 150) {
        return; // Đang có quân giữ đường, gom tiền nâng cấp
      }
    }

    let chosenConfig: UnitConfig = melee;

    if (this.difficulty === 'EASY') {
      // DỄ: Chọn ngẫu nhiên lính nào đủ tiền mua
      const affordable = units.filter((u) => economy.canAfford(u.cost));
      if (affordable.length > 0) {
        chosenConfig = affordable[Math.floor(this.rng() * affordable.length)]!;
        economy.enqueueUnit(chosenConfig);
      }
      return;
    }

    if (this.difficulty === 'NORMAL') {
      // VỪA: 65% khắc chế lính tiên phong, 35% biến hóa chiến thuật ngẫu nhiên
      const roll = this.rng();
      let frontPlayer: Unit | undefined;
      let minDistance = Infinity;
      for (const u of alivePlayers) {
        const d = distanceFromOwnBase(this.team, u.x);
        if (d < minDistance) {
          minDistance = d;
          frontPlayer = u;
        }
      }

      if (roll < 0.65 && frontPlayer) {
        if (frontPlayer.config.type === 'TANK' && economy.canAfford(ranged.cost)) {
          chosenConfig = ranged; // Ranged khắc chế Tank
        } else if (frontPlayer.config.type === 'RANGED' && economy.canAfford(melee.cost)) {
          chosenConfig = melee; // Melee khắc chế Ranged
        } else if (frontPlayer.config.type === 'MELEE' && economy.canAfford(tank.cost)) {
          chosenConfig = tank; // Tank khắc chế Melee
        } else if (special && economy.canAfford(special.cost) && this.rng() < 0.4) {
          chosenConfig = special;
        } else {
          chosenConfig = melee;
        }
      } else {
        // Biến hóa ngẫu nhiên trong số lính đủ tiền mua
        const affordable = units.filter((u) => economy.canAfford(u.cost));
        if (affordable.length > 0) {
          chosenConfig = affordable[Math.floor(this.rng() * affordable.length)]!;
        }
      }

      if (economy.canAfford(chosenConfig.cost)) {
        economy.enqueueUnit(chosenConfig);
        // Nếu còn dư vàng và hàng đợi còn chỗ: tiếp tục mua thêm 1 quân hỗ trợ tạo đợt đẩy (wave push)
        if (economy.spawnQueue.length < 2) {
          const supportUnits = units.filter((u) => u.type !== 'TANK' && economy.canAfford(u.cost));
          if (supportUnits.length > 0) {
            economy.enqueueUnit(supportUnits[0]!);
          }
        }
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
    if (special && economy.canAfford(special.cost) && this.rng() < 0.35) {
      chosenConfig = special;
    }

    if (economy.canAfford(chosenConfig.cost)) {
      economy.enqueueUnit(chosenConfig);
      // Hard: Wave push hiệu quả cao khi còn dư vàng
      if (economy.spawnQueue.length < 2) {
        const supportUnits = units.filter((u) => u.type !== 'TANK' && economy.canAfford(u.cost));
        if (supportUnits.length > 0) {
          economy.enqueueUnit(supportUnits[0]!);
        }
      }
    }
  }
}
