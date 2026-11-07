/**
 * The Singularity Odyssey — Cấu hình Hệ thống Nâng cấp (Data-driven Upgrades)
 * Toàn bộ chỉ số, giá tiền, hệ số và tỷ lệ bảo lưu cấp khi lên kỷ nguyên.
 * Tuyệt đối không hardcode trong engine.
 */

import type { UnitType } from './ages';

export interface UnitUpgradeData {
  maxLevel: number;
  damageBonusPerLevel: number; // +20% mỗi cấp
  hpBonusPerLevel: number;     // +15% mỗi cấp
  baseCosts: readonly [number, number, number]; // [150, 300, 600]
  carryOverRatio: number;      // Giữ lại 50% cấp khi lên kỷ nguyên
}

export interface TurretUpgradeData {
  maxLevel: number;
  damageBonusPerLevel: number; // +25% mỗi cấp
  rangeBonusPerLevel: number;  // +10% mỗi cấp
  baseCosts: readonly [number, number, number]; // [200, 400, 800]
  addSlotBaseCost: number;     // Giá mua thêm slot cắm tháp
}

export const UPGRADE_CONFIG = {
  unit: {
    maxLevel: 3,
    damageBonusPerLevel: 0.20, // +20% sát thương mỗi cấp
    hpBonusPerLevel: 0.15,     // +15% máu mỗi cấp
    baseCosts: [180, 360, 720] as const, // Cân bằng: tạo cửa sổ cơ hội cho chiến thuật Rush lính đầu trận
    carryOverRatio: 0.5,       // 50% làm tròn xuống
  },
  turret: {
    maxLevel: 3,
    damageBonusPerLevel: 0.25, // +25% sát thương tháp mỗi cấp
    rangeBonusPerLevel: 0.10,  // +10% tầm bắn mỗi cấp
    baseCosts: [220, 440, 880] as const,
    addSlotBaseCost: 350,      // Giá mua thêm 1 ô tháp canh
  },
  /**
   * Hệ số giá theo Kỷ nguyên (Kỷ nguyên 1 = x1, Kỷ nguyên 2 = x2, v.v.)
   */
  getEraCostMultiplier(age: number): number {
    return Math.max(1, age);
  },
  /**
   * Tính giá nâng cấp lính cho cấp tiếp theo (level: 0 -> 1, 1 -> 2, 2 -> 3)
   */
  getUnitUpgradeCost(currentLevel: number, age: number): number | null {
    if (currentLevel >= UPGRADE_CONFIG.unit.maxLevel) return null;
    const base = UPGRADE_CONFIG.unit.baseCosts[currentLevel];
    if (base === undefined) return null;
    return base * UPGRADE_CONFIG.getEraCostMultiplier(age);
  },
  /**
   * Tính giá nâng cấp tháp cho cấp tiếp theo
   */
  getTurretUpgradeCost(currentLevel: number, age: number): number | null {
    if (currentLevel >= UPGRADE_CONFIG.turret.maxLevel) return null;
    const base = UPGRADE_CONFIG.turret.baseCosts[currentLevel];
    if (base === undefined) return null;
    return base * UPGRADE_CONFIG.getEraCostMultiplier(age);
  },
  /**
   * Giá mở thêm slot cắm tháp
   */
  getAddSlotCost(currentSlots: number, age: number): number {
    return UPGRADE_CONFIG.turret.addSlotBaseCost * currentSlots * UPGRADE_CONFIG.getEraCostMultiplier(age);
  },
} as const;
