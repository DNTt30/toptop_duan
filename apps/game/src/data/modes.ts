/**
 * Cấu hình chế độ chơi và luật trận đấu (The Singularity Odyssey)
 * Thiết lập theo chế độ: SOLO, LOCAL_2P, ONLINE_2P, LIVE
 */

export type GameMode = 'SOLO' | 'LOCAL_2P' | 'ONLINE_2P' | 'LIVE';

export interface ModeMatchConfig {
  /**
   * Thời gian đếm ngược tự động chơi lại ván mới sau khi trận kết thúc (giây).
   * - LIVE: 10s
   * - Các chế độ khác: null (không tự chơi lại, người chơi bấm nút thủ công)
   */
  autoRestartDelaySec: number | null;
}

export const DEFAULT_MODE_MATCH_CONFIGS: Record<GameMode, ModeMatchConfig> = {
  SOLO: {
    autoRestartDelaySec: null,
  },
  LOCAL_2P: {
    autoRestartDelaySec: null,
  },
  ONLINE_2P: {
    autoRestartDelaySec: null,
  },
  LIVE: {
    autoRestartDelaySec: 10,
  },
};

export function getModeMatchConfig(mode: GameMode): ModeMatchConfig {
  const cfg = DEFAULT_MODE_MATCH_CONFIGS[mode];
  if (!cfg) {
    return { ...DEFAULT_MODE_MATCH_CONFIGS.SOLO };
  }
  return { ...cfg };
}
