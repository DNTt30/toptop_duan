/**
 * Cấu hình thông số Độ Khó và Chiến Thuật AI (The Singularity Odyssey)
 * Sử dụng tỉ lệ khoảng cách tương đối (fraction 0.0 - 1.0) và hạ tầng đối xứng,
 * triệt tiêu hoàn toàn hằng số pixel tuyệt đối từ sân cũ.
 */

import { type BotDifficulty } from '../engine/BotAI';

export interface BotDifficultyConfig {
  decisionIntervalBase: number;
  decisionJitterFraction: number;
  ageUpAcceptProbability: number;
  /**
   * Khoảng cách từ căn cứ NHÀ (tính theo tỉ lệ 0.0 - 1.0 của chiều dài sân chiến đấu).
   * Ví dụ 0.3 = Địch áp sát trong phạm vi 30% cự ly sân nhà tính từ căn cứ.
   */
  threatDistanceFraction: number;
  threatUltimateProbability: number;
  swarmingEnemiesCount: number;
  pastMidEnemiesCount: number;
  canAddTurretSlot: boolean;
  turretBuyGoldMultiplier: number;
}

export const BOT_DIFFICULTY_CONFIGS: Record<BotDifficulty, BotDifficultyConfig> = {
  EASY: {
    decisionIntervalBase: 2.5,
    decisionJitterFraction: 0.4,
    ageUpAcceptProbability: 0.6,
    threatDistanceFraction: 0.20,
    threatUltimateProbability: 0.45,
    swarmingEnemiesCount: 999,
    pastMidEnemiesCount: 999,
    canAddTurretSlot: false,
    turretBuyGoldMultiplier: 3.0,
  },
  NORMAL: {
    decisionIntervalBase: 1.2,
    decisionJitterFraction: 0.4,
    ageUpAcceptProbability: 1.0,
    threatDistanceFraction: 0.30,
    threatUltimateProbability: 1.0,
    swarmingEnemiesCount: 5,
    pastMidEnemiesCount: 999,
    canAddTurretSlot: true,
    turretBuyGoldMultiplier: 1.8,
  },
  HARD: {
    decisionIntervalBase: 0.6,
    decisionJitterFraction: 0.4,
    ageUpAcceptProbability: 1.0,
    threatDistanceFraction: 0.40,
    threatUltimateProbability: 1.0,
    swarmingEnemiesCount: 4,
    pastMidEnemiesCount: 2,
    canAddTurretSlot: true,
    turretBuyGoldMultiplier: 1.1,
  },
};

export const STRATEGY_BALANCE_CONFIG = {
  FOCUS_UPGRADE: {
    /**
     * Ngưỡng đe dọa tính từ căn cứ nhà (fraction 0..1): 25% sân nhà
     */
    threatDistanceFraction: 0.25,
    /**
     * Số quân sống tối thiểu trên chiến trường trước khi nhịn tiền nâng cấp.
     * Đảm bảo không bao giờ bị bế tắc 0 quân khi hai phe cùng chơi FOCUS_UPGRADE.
     */
    minTroopsOnField: 1,
    /**
     * Nếu tích lũy vàng vượt mức này thì vẫn mua lính dù đang ưu tiên nâng cấp
     */
    maxGoldReserveBeforeSpawn: 150,
  },
  BALANCED: {
    minTroopsOnField: 2,
    saveGoldThreshold: 180,
  },
};
