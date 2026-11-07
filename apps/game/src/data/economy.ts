/**
 * The Singularity Odyssey — Cấu hình Kinh tế (Data-driven Economy)
 * Toàn bộ hằng số và công thức kinh tế được tập trung tại đây, tuyệt đối không hardcode.
 */

export interface EconomyConfig {
  /** Vàng tự sinh cơ bản mỗi giây ở Kỷ nguyên 1 */
  basePassiveGoldRate: number;
  /** Tỷ lệ gia tăng vàng tự sinh mỗi khi lên kỷ nguyên (+10% = 0.10) */
  passiveGoldAgeGrowth: number;
  /** Tỷ lệ thưởng vàng khi tiêu diệt lính đối phương theo % giá tiền lính (60% = 0.60) */
  bountyGoldRatio: number;
  /** Tỷ lệ thưởng điểm kinh nghiệm XP khi tiêu diệt lính đối phương theo % giá tiền lính (100% = 1.00) */
  bountyXpRatio: number;
  /** Vàng khởi đầu trận đấu */
  initialGold: number;
  /** Tỷ lệ hoàn tiền khi bán tháp canh */
  turretSellRefundRatio: number;
}

export const ECONOMY_CONFIG: EconomyConfig = {
  basePassiveGoldRate: 3.0,
  passiveGoldAgeGrowth: 0.10, // +10% mỗi kỷ nguyên
  bountyGoldRatio: 0.60,      // 60% giá mua quân
  bountyXpRatio: 1.00,        // 100% giá mua quân
  initialGold: 175,           // Đủ mua 1-2 quân mở màn
  turretSellRefundRatio: 0.70,
};

/**
 * Tính toán tốc độ tự sinh vàng mỗi giây dựa trên Kỷ nguyên hiện tại (1 -> 6)
 * Kỷ nguyên 1: 3.0
 * Kỷ nguyên 2: 3.0 * (1 + 0.10 * 1) = 3.3
 * Kỷ nguyên 6: 3.0 * (1 + 0.10 * 5) = 4.5
 */
export function getPassiveGoldRate(age: number): number {
  const safeAge = Math.max(1, Math.min(6, age));
  return ECONOMY_CONFIG.basePassiveGoldRate * (1 + ECONOMY_CONFIG.passiveGoldAgeGrowth * (safeAge - 1));
}

/**
 * Tính lượng vàng nhận được khi tiêu diệt quân địch (làm tròn nguyên)
 */
export function getKillBountyGold(unitCost: number): number {
  return Math.max(1, Math.round(unitCost * ECONOMY_CONFIG.bountyGoldRatio));
}

/**
 * Tính lượng XP nhận được khi tiêu diệt quân địch (làm tròn nguyên)
 */
export function getKillBountyXp(unitCost: number): number {
  return Math.max(1, Math.round(unitCost * ECONOMY_CONFIG.bountyXpRatio));
}
