/**
 * The Singularity Odyssey — Upgrade Manager
 * Quản lý hệ thống nâng cấp lính (3 cấp cho MELEE, RANGED, TANK, SPECIAL) và nâng cấp tháp canh.
 * Áp dụng ngay cho quân đang sống trên sân và quân mới.
 * Tự động tính toán bảo lưu 50% số cấp cũ khi tiến hóa lên kỷ nguyên mới.
 */

import type { UnitType } from '../data/ages';
import { UPGRADE_CONFIG } from '../data/upgrades';
import type { Economy } from './Economy';
import type { TurretManager } from './Turret';
import type { Unit } from './Unit';

export interface UpgradeLevels {
  MELEE: number;
  RANGED: number;
  TANK: number;
  SPECIAL: number;
}

export class UpgradeManager {
  public levels: UpgradeLevels = {
    MELEE: 0,
    RANGED: 0,
    TANK: 0,
    SPECIAL: 0,
  };
  public turretLevel: number = 0;
  public totalUpgradesPurchased: number = 0;

  public reset(): void {
    this.levels = {
      MELEE: 0,
      RANGED: 0,
      TANK: 0,
      SPECIAL: 0,
    };
    this.turretLevel = 0;
    this.totalUpgradesPurchased = 0;
  }

  public getUnitLevel(type: UnitType): number {
    return this.levels[type] ?? 0;
  }

  public getDamageMultiplier(type: UnitType): number {
    const level = this.getUnitLevel(type);
    return 1 + level * UPGRADE_CONFIG.unit.damageBonusPerLevel; // +20% mỗi cấp
  }

  public getHpMultiplier(type: UnitType): number {
    const level = this.getUnitLevel(type);
    return 1 + level * UPGRADE_CONFIG.unit.hpBonusPerLevel; // +15% mỗi cấp
  }

  public getTurretDamageMultiplier(): number {
    return 1 + this.turretLevel * UPGRADE_CONFIG.turret.damageBonusPerLevel; // +25% mỗi cấp
  }

  public getTurretRangeMultiplier(): number {
    return 1 + this.turretLevel * UPGRADE_CONFIG.turret.rangeBonusPerLevel; // +10% mỗi cấp
  }

  /**
   * Kiểm tra xem có thể nâng cấp loại quân này không
   */
  public canUpgradeUnit(type: UnitType, economy: Economy, currentAge: number): boolean {
    const currentLvl = this.getUnitLevel(type);
    if (currentLvl >= UPGRADE_CONFIG.unit.maxLevel) return false;
    const cost = UPGRADE_CONFIG.getUnitUpgradeCost(currentLvl, currentAge);
    if (cost === null) return false;
    return economy.canAfford(cost);
  }

  /**
   * Thực hiện nâng cấp loại quân (áp dụng cho cả quân đang sống trên sân và quân mới)
   */
  public upgradeUnit(
    type: UnitType,
    economy: Economy,
    currentAge: number,
    aliveUnits: Unit[]
  ): boolean {
    const currentLvl = this.getUnitLevel(type);
    if (currentLvl >= UPGRADE_CONFIG.unit.maxLevel) return false;

    const cost = UPGRADE_CONFIG.getUnitUpgradeCost(currentLvl, currentAge);
    if (cost === null || !economy.spendGold(cost)) return false;

    this.levels[type] = currentLvl + 1;
    this.totalUpgradesPurchased += 1;

    const dmgMult = this.getDamageMultiplier(type);
    const hpMult = this.getHpMultiplier(type);
    const newLvl = this.levels[type];

    // Cập nhật ngay lập tức cho tất cả quân cùng loại đang chiến đấu trên sân
    for (const unit of aliveUnits) {
      if (unit.isAlive && unit.config.type === type) {
        unit.applyUpgrade(dmgMult, hpMult, newLvl);
      }
    }

    return true;
  }

  /**
   * Kiểm tra có thể nâng cấp tháp canh không
   */
  public canUpgradeTurret(economy: Economy, currentAge: number): boolean {
    if (this.turretLevel >= UPGRADE_CONFIG.turret.maxLevel) return false;
    const cost = UPGRADE_CONFIG.getTurretUpgradeCost(this.turretLevel, currentAge);
    if (cost === null) return false;
    return economy.canAfford(cost);
  }

  /**
   * Thực hiện nâng cấp tháp canh
   */
  public upgradeTurret(economy: Economy, currentAge: number, turretMgr?: TurretManager): boolean {
    if (this.turretLevel >= UPGRADE_CONFIG.turret.maxLevel) return false;
    const cost = UPGRADE_CONFIG.getTurretUpgradeCost(this.turretLevel, currentAge);
    if (cost === null || !economy.spendGold(cost)) return false;

    this.turretLevel += 1;
    this.totalUpgradesPurchased += 1;

    if (turretMgr) {
      turretMgr.setUpgradeMultipliers(
        this.getTurretDamageMultiplier(),
        this.getTurretRangeMultiplier()
      );
    }

    return true;
  }

  /**
   * Kích hoạt khi tiến hóa lên kỷ nguyên mới:
   * "Khi lên kỷ nguyên, quân mới giữ lại 50% số cấp cũ (làm tròn xuống)."
   */
  public onAgeAdvance(): void {
    const ratio = UPGRADE_CONFIG.unit.carryOverRatio;
    this.levels.MELEE = Math.floor(this.levels.MELEE * ratio);
    this.levels.RANGED = Math.floor(this.levels.RANGED * ratio);
    this.levels.TANK = Math.floor(this.levels.TANK * ratio);
    this.levels.SPECIAL = Math.floor(this.levels.SPECIAL * ratio);
    this.turretLevel = Math.floor(this.turretLevel * ratio);
  }
}
