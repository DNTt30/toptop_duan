/**
 * The Singularity Odyssey — Hệ Thống Tinh Chỉnh Frame Thủ Công (Manual Frame Overrides)
 * Cho phép người dùng trực tiếp điều chỉnh từng pixel [X, Y, W, H, Ground Y, dy] của từng frame
 * và lưu trữ bền vững vào localStorage để áp dụng ngay lập tức vào Preview và Game Engine.
 */

export interface FrameBox {
  x: number; // Tọa độ X trên dải strip gốc (0..344)
  y: number; // Tọa độ Y trên dải strip gốc (0..106 hoặc 106..223)
  w: number; // Độ rộng khung cắt (pixels)
  h: number; // Chiều cao khung cắt (pixels)
  dx?: number; // Vi chỉnh bù trừ tọa độ ngang khi hiển thị (pixels)
  dy?: number; // Vi chỉnh bù trừ độ cao để chân chạm đúng mặt sàn (pixels)
}

export interface UnitFrameConfig {
  unitId: string;
  unitName: string;
  age: number;
  groundBaselineY: number; // Đường chân đất chuẩn (pixels từ đỉnh strip)
  scale: number; // Tỷ lệ phóng to hiển thị (mặc định ~ 1.95 - 2.2)
  walkFrames: FrameBox[];
  attackFrames: FrameBox[];
}

import { gameSettings, STORAGE_KEYS } from './settings';

const STORAGE_KEY = STORAGE_KEYS.FRAME_OVERRIDES;

// Cấu hình mẫu đã được cân chỉnh chuẩn xác 100% cho Người Vượn Đập Gậy (Caveman)
export const DEFAULT_FRAME_PRESETS: Record<string, Partial<UnitFrameConfig>> = {
  stone_melee: {
    groundBaselineY: 81,
    scale: 2.2,
    walkFrames: [
      { x: 48, y: 0, w: 74, h: 82, dx: 0, dy: 0 },
      { x: 124, y: 0, w: 72, h: 82, dx: 0, dy: 0 },
      { x: 198, y: 0, w: 70, h: 82, dx: 0, dy: 0 },
      { x: 270, y: 0, w: 72, h: 82, dx: 0, dy: 0 },
    ],
    attackFrames: [
      { x: 38, y: 0, w: 94, h: 116, dx: 0, dy: 0 },
      { x: 136, y: 0, w: 112, h: 116, dx: 0, dy: 0 },
      { x: 250, y: 0, w: 94, h: 116, dx: 0, dy: 0 },
    ],
  },
  stone_ranged: {
    groundBaselineY: 86,
    scale: 2.0,
    walkFrames: [
      { x: 55, y: 0, w: 70, h: 86, dx: 0, dy: 0 },
      { x: 120, y: 0, w: 72, h: 86, dx: 0, dy: 0 },
      { x: 190, y: 0, w: 72, h: 86, dx: 0, dy: 0 },
      { x: 258, y: 0, w: 76, h: 86, dx: 0, dy: 0 },
    ],
    attackFrames: [
      { x: 55, y: 106, w: 75, h: 90, dx: 0, dy: 0 },
      { x: 125, y: 106, w: 108, h: 90, dx: 0, dy: 0 },
      { x: 235, y: 106, w: 105, h: 90, dx: 0, dy: 0 },
    ],
  },
  med_melee: {
    groundBaselineY: 88,
    scale: 2.0,
    walkFrames: [
      { x: 42, y: 0, w: 75, h: 88, dx: 0, dy: 0 },
      { x: 118, y: 0, w: 72, h: 88, dx: 0, dy: 0 },
      { x: 182, y: 0, w: 76, h: 88, dx: 0, dy: 0 },
      { x: 258, y: 0, w: 78, h: 88, dx: 0, dy: 0 },
    ],
    attackFrames: [
      { x: 32, y: 106, w: 78, h: 92, dx: 0, dy: 0 },
      { x: 102, y: 106, w: 90, h: 92, dx: 0, dy: 0 },
      { x: 182, y: 106, w: 86, h: 92, dx: 0, dy: 0 },
      { x: 262, y: 106, w: 78, h: 92, dx: 0, dy: 0 },
    ],
  },
  mod_tank: {
    groundBaselineY: 96,
    scale: 1.8,
    walkFrames: [
      { x: 12, y: 0, w: 76, h: 98, dx: 0, dy: 0 },
      { x: 90, y: 0, w: 76, h: 98, dx: 0, dy: 0 },
      { x: 168, y: 0, w: 76, h: 98, dx: 0, dy: 0 },
      { x: 246, y: 0, w: 76, h: 98, dx: 0, dy: 0 },
    ],
    attackFrames: [
      { x: 12, y: 106, w: 76, h: 100, dx: 0, dy: 0 },
      { x: 90, y: 106, w: 76, h: 100, dx: 0, dy: 0 },
      { x: 168, y: 106, w: 76, h: 100, dx: 0, dy: 0 },
      { x: 246, y: 106, w: 76, h: 100, dx: 0, dy: 0 },
    ],
  },
};

/**
 * Tải toàn bộ cấu hình tinh chỉnh từ localStorage (kết hợp với preset mặc định)
 */
export function loadAllFrameOverrides(): Record<string, UnitFrameConfig> {
  const result: Record<string, UnitFrameConfig> = {};
  const raw = gameSettings.getFrameOverridesRaw();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      Object.assign(result, parsed);
    } catch (e) {
      console.warn('[FrameOverrides] Không thể đọc cấu hình:', e);
    }
  }
  return result;
}

/**
 * Lấy cấu hình tinh chỉnh của 1 quân cụ thể
 */
export function getUnitFrameOverride(unitId: string): UnitFrameConfig | null {
  const all = loadAllFrameOverrides();
  const raw = all[unitId] || DEFAULT_FRAME_PRESETS[unitId];
  if (!raw) return null;

  return {
    unitId: raw.unitId || unitId,
    unitName: raw.unitName || (unitId === 'stone_melee' ? 'Người Vượn Đập Gậy' : unitId),
    age: raw.age || 1,
    groundBaselineY: typeof raw.groundBaselineY === 'number' ? raw.groundBaselineY : 84,
    scale: typeof raw.scale === 'number' ? raw.scale : 2.0,
    walkFrames: Array.isArray(raw.walkFrames) && raw.walkFrames.length > 0 ? raw.walkFrames : [
      { x: 44, y: 0, w: 80, h: 92, dx: 0, dy: 0 },
      { x: 124, y: 0, w: 78, h: 92, dx: 0, dy: 0 },
      { x: 196, y: 0, w: 76, h: 92, dx: 0, dy: 0 },
      { x: 264, y: 0, w: 78, h: 92, dx: 0, dy: 0 },
    ],
    attackFrames: Array.isArray(raw.attackFrames) && raw.attackFrames.length > 0 ? raw.attackFrames : [
      { x: 38, y: 106, w: 92, h: 102, dx: 0, dy: 0 },
      { x: 135, y: 106, w: 108, h: 102, dx: 0, dy: 0 },
      { x: 248, y: 106, w: 94, h: 102, dx: 0, dy: 0 },
    ],
  };
}

/**
 * Lưu cấu hình tinh chỉnh của 1 quân vào localStorage
 */
export function saveUnitFrameOverride(cfg: UnitFrameConfig): void {
  try {
    const all = loadAllFrameOverrides();
    all[cfg.unitId] = cfg;
    gameSettings.setFrameOverridesRaw(JSON.stringify(all));
  } catch (e) {
    console.error('[FrameOverrides] Không thể lưu cấu hình:', e);
  }
}

/**
 * Xóa cấu hình tùy chỉnh để khôi phục lại mặc định
 */
export function resetUnitFrameOverride(unitId: string): void {
  try {
    const all = loadAllFrameOverrides();
    delete all[unitId];
    gameSettings.setFrameOverridesRaw(JSON.stringify(all));
  } catch (e) {
    console.error('[FrameOverrides] Lỗi khi reset override:', e);
  }
}
