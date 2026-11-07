/**
 * Cấu hình chế độ chơi và luật trận đấu (The Singularity Odyssey)
 * Thiết lập theo chế độ: SOLO, LOCAL_2P, ONLINE_2P, LIVE
 */

export type GameMode = 'SOLO' | 'LOCAL_2P' | 'ONLINE_2P' | 'LIVE';

export interface ModeMatchConfig {
  /**
   * Thời lượng trận tối đa (giây).
   * null (tắt) mặc định cho mọi chế độ.
   * Nếu có giá trị thì khi hết giờ bên nào nhiều máu căn cứ hơn sẽ thắng;
   * nếu hòa điểm máu căn cứ thì chuyển sang trạng thái đột tử (Sudden Death).
   */
  matchDurationSec: number | null;

  /**
   * Thời gian không có sát thương để kích hoạt chế độ "bế tắc" (giây).
   * - SOLO / LOCAL_2P / ONLINE_2P: 60s
   * - LIVE: 30s
   * - null để tắt
   */
  stallDetectSec: number | null;

  /**
   * Thời gian đếm ngược tự động chơi lại ván mới sau khi trận kết thúc (giây).
   * - LIVE: 10s
   * - Các chế độ khác: null (không tự chơi lại, người chơi bấm nút thủ công)
   */
  autoRestartDelaySec: number | null;

  /**
   * Tốc độ rút máu ban đầu của cả hai căn cứ khi bế tắc (HP / giây).
   * Mặc định: 2 HP/s.
   */
  stallDrainInitialDps: number;

  /**
   * Khoảng thời gian tăng tốc độ rút máu (giây).
   * Mặc định: mỗi 10 giây.
   */
  stallDrainRampIntervalSec: number;

  /**
   * Mức tăng tốc độ rút máu sau mỗi khoảng thời gian (HP / giây).
   * Mặc định: +1 HP/s mỗi 10 giây.
   */
  stallDrainRampDps: number;
}

export const DEFAULT_MODE_MATCH_CONFIGS: Record<GameMode, ModeMatchConfig> = {
  SOLO: {
    matchDurationSec: null,
    stallDetectSec: 60,
    autoRestartDelaySec: null,
    stallDrainInitialDps: 2,
    stallDrainRampIntervalSec: 10,
    stallDrainRampDps: 1,
  },
  LOCAL_2P: {
    matchDurationSec: null,
    stallDetectSec: 60,
    autoRestartDelaySec: null,
    stallDrainInitialDps: 2,
    stallDrainRampIntervalSec: 10,
    stallDrainRampDps: 1,
  },
  ONLINE_2P: {
    matchDurationSec: null,
    stallDetectSec: 60,
    autoRestartDelaySec: null,
    stallDrainInitialDps: 2,
    stallDrainRampIntervalSec: 10,
    stallDrainRampDps: 1,
  },
  LIVE: {
    matchDurationSec: null,
    stallDetectSec: 30,
    autoRestartDelaySec: 10,
    stallDrainInitialDps: 2,
    stallDrainRampIntervalSec: 10,
    stallDrainRampDps: 1,
  },
};

export function getModeMatchConfig(mode: GameMode): ModeMatchConfig {
  const cfg = DEFAULT_MODE_MATCH_CONFIGS[mode];
  if (!cfg) {
    return { ...DEFAULT_MODE_MATCH_CONFIGS.SOLO };
  }
  return { ...cfg };
}
