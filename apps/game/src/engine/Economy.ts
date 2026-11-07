/**
 * The Singularity Odyssey — Economy & Spawn Queue System
 * Quản lý vàng (tự sinh + giết lính), điểm XP tiến hóa và hàng đợi sản xuất lính (Spawn Queue).
 */

import { AGES_DATA, type UnitConfig } from '../data/ages';
import { ECONOMY_CONFIG, getPassiveGoldRate } from '../data/economy';

export interface QueuedUnit {
  id: string;
  config: UnitConfig;
  progress: number; // Thời gian đã chờ (giây)
  duration: number; // Tổng thời gian cần chờ
}

export class Economy {
  public gold: number;
  public xp: number;
  public currentAge: number = 1;
  public passiveGoldRate: number; // Vàng cộng thêm mỗi giây
  public spawnQueue: QueuedUnit[] = [];
  public readonly maxQueueSize: number = 5;

  // Thống kê kinh tế phục vụ mô phỏng và cân bằng game
  public totalGoldEarned: number = 0;
  public totalGoldSpent: number = 0;
  public totalPassiveGold: number = 0;
  public totalBountyGold: number = 0;
  public totalXpEarned: number = 0;

  constructor(initialGold: number = ECONOMY_CONFIG.initialGold, age: number = 1) {
    this.gold = initialGold;
    this.totalGoldEarned = initialGold;
    this.xp = 0;
    this.currentAge = age;
    this.passiveGoldRate = getPassiveGoldRate(age);
  }

  public reset(initialGold: number = ECONOMY_CONFIG.initialGold, age: number = 1): void {
    this.gold = initialGold;
    this.xp = 0;
    this.currentAge = age;
    this.passiveGoldRate = getPassiveGoldRate(age);
    this.spawnQueue = [];
    this.totalGoldEarned = initialGold;
    this.totalGoldSpent = 0;
    this.totalPassiveGold = 0;
    this.totalBountyGold = 0;
    this.totalXpEarned = 0;
  }

  public setAge(age: number): void {
    this.currentAge = age;
    this.passiveGoldRate = getPassiveGoldRate(age);
  }

  /**
   * Cập nhật tài nguyên và hàng đợi sản xuất mỗi tick
   * Trả về danh sách UnitConfig của những quân đã hoàn tất huấn luyện để World tạo thực thể
   */
  public update(dt: number): UnitConfig[] {
    // 1. Tự sinh vàng theo giây (+10% mỗi kỷ nguyên)
    const passiveGain = this.passiveGoldRate * dt;
    this.gold += passiveGain;
    this.totalGoldEarned += passiveGain;
    this.totalPassiveGold += passiveGain;

    const completedUnits: UnitConfig[] = [];

    // 2. Tiến trình sản xuất lính trong hàng đợi (lính đầu tiên được train)
    if (this.spawnQueue.length > 0) {
      const current = this.spawnQueue[0];
      if (current) {
        current.progress += dt;
        if (current.progress >= current.duration) {
          completedUnits.push(current.config);
          this.spawnQueue.shift();
        }
      }
    }

    return completedUnits;
  }

  public addGold(amount: number, isBounty: boolean = false): void {
    const val = Math.max(0, amount);
    this.gold += val;
    this.totalGoldEarned += val;
    if (isBounty) {
      this.totalBountyGold += val;
    }
  }

  public addXp(amount: number): void {
    const val = Math.max(0, amount);
    this.xp += val;
    this.totalXpEarned += val;
  }

  public canAfford(cost: number): boolean {
    return this.gold >= cost;
  }

  public spendGold(cost: number): boolean {
    if (this.canAfford(cost)) {
      this.gold -= cost;
      this.totalGoldSpent += cost;
      return true;
    }
    return false;
  }

  /**
   * Đưa lính vào hàng đợi huấn luyện
   */
  public enqueueUnit(config: UnitConfig): boolean {
    if (this.spawnQueue.length >= this.maxQueueSize) {
      return false; // Hàng đợi đã đầy
    }

    if (!this.spendGold(config.cost)) {
      return false; // Không đủ vàng
    }

    this.spawnQueue.push({
      id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      config,
      progress: 0,
      duration: config.spawnTime,
    });

    return true;
  }

  /**
   * Hủy lính đang chờ trong hàng đợi (hoàn tiền)
   */
  public cancelQueue(index: number): boolean {
    if (index < 0 || index >= this.spawnQueue.length) return false;
    const item = this.spawnQueue.splice(index, 1)[0];
    if (item) {
      this.addGold(item.config.cost);
      return true;
    }
    return false;
  }

  /**
   * Kiểm tra xem đã đủ điều kiện lên kỷ nguyên tiếp theo chưa
   */
  public canAgeUp(currentAge: number): boolean {
    const nextAge = currentAge + 1;
    const nextConfig = AGES_DATA[nextAge];
    if (!nextConfig) return false; // Đã đạt kỷ nguyên tối đa
    return this.xp >= nextConfig.xpRequired;
  }

  /**
   * Tiêu hao XP để tiến hóa kỷ nguyên
   */
  public performAgeUp(currentAge: number): boolean {
    if (!this.canAgeUp(currentAge)) return false;
    // Trong Age of War cổ điển, XP tích lũy dùng làm mốc tiến hóa (không nhất thiết phải trừ sạch)
    return true;
  }
}
