/**
 * The Singularity Odyssey — Module Hạ Tầng Đối Xứng (Symmetry Infrastructure)
 * Đảm bảo tính công bằng và đối xứng gương hoàn hảo cho mọi phép tính tọa độ,
 * khoảng cách, vùng ảnh hưởng và điều kiện AI trên sân đấu.
 */

import { BASE_WIDTH, LANE_WIDTH, type Team } from '../data/ages';

/**
 * Lấy tọa độ đối xứng gương qua tâm sân (LANE_WIDTH / 2)
 */
export function mirrorX(x: number, laneWidth: number = LANE_WIDTH): number {
  return laneWidth - x;
}

/**
 * Khoảng cách từ vị trí x đến căn cứ nhà của phe chỉ định
 */
export function distanceFromOwnBase(team: Team, x: number, laneWidth: number = LANE_WIDTH): number {
  const ownBaseX = team === 'LEFT' ? BASE_WIDTH : laneWidth - BASE_WIDTH;
  return Math.abs(x - ownBaseX);
}

/**
 * Khoảng cách từ vị trí x đến căn cứ đối phương của phe chỉ định
 */
export function distanceFromEnemyBase(team: Team, x: number, laneWidth: number = LANE_WIDTH): number {
  const enemyBaseX = team === 'LEFT' ? laneWidth - BASE_WIDTH : BASE_WIDTH;
  return Math.abs(x - enemyBaseX);
}

/**
 * Tính vị trí x tương đối theo tỉ lệ khoảng cách giữa 2 căn cứ (0.0 = Cửa thành nhà, 1.0 = Cửa thành địch)
 */
export function fractionFromOwnBase(team: Team, x: number, laneWidth: number = LANE_WIDTH): number {
  const playableWidth = laneWidth - 2 * BASE_WIDTH;
  if (playableWidth <= 0) return 0;
  const dist = distanceFromOwnBase(team, x, laneWidth);
  return Math.max(0, Math.min(1, dist / playableWidth));
}

/**
 * Chuyển đổi tỉ lệ khoảng cách từ căn cứ nhà (fraction 0..1) sang tọa độ x thực tế trên chiến trường
 */
export function xFromOwnBaseFraction(team: Team, fraction: number, laneWidth: number = LANE_WIDTH): number {
  const ownBaseX = team === 'LEFT' ? BASE_WIDTH : laneWidth - BASE_WIDTH;
  const dir = team === 'LEFT' ? 1 : -1;
  const playableWidth = laneWidth - 2 * BASE_WIDTH;
  return ownBaseX + dir * (Math.max(0, Math.min(1, fraction)) * playableWidth);
}

/**
 * Kiểm tra xem vị trí x có nằm trong nửa sân nhà của phe team hay không
 */
export function isInOwnHalf(team: Team, x: number, laneWidth: number = LANE_WIDTH): boolean {
  const midX = laneWidth / 2;
  return team === 'LEFT' ? x <= midX : x >= midX;
}
