/**
 * The Singularity Odyssey — Cấu hình Sprite cho Bộ Nạp Sprite (agent-sprite-forge 3.0 & Atlas)
 * Toàn bộ 24 nhân vật thuộc 6 Kỷ nguyên sử dụng chuyển động frame thực tế cắt từ Concept Sheets.
 * TUYỆT ĐỐI KHÔNG sửa logic chiến đấu.
 */

import { getUnitFrameOverride, type UnitFrameConfig } from './frameOverrides';

export interface AnimationEvent {
  name: string; // 'hit' | 'step_l' | 'step_r' | 'sfx'
  frame: number; // Chỉ số khung hình (0-based) trong clip
  atMs?: number;
}

export interface AnimationClipConfig {
  name: 'idle' | 'walk' | 'attack' | 'hurt' | 'die';
  startFrame: number;
  frameCount: number;
  fps: number;
  loop: boolean;
  hitFrame?: number; // Khung ghim trúng đòn cận chiến (0-based)
  releaseFrame?: number; // Khung thả đạn / bắn cung cho lính tầm xa (0-based)
  stridePx?: number;
  minDisplayTime?: number; // Thời gian hiển thị tối thiểu (giây) chống nhấp nháy
  events?: AnimationEvent[];
  durationsMs?: number[];
}

export interface SpriteConfig {
  unitId: string;
  name: string;
  age: number;
  atlasPath: string; // Đường dẫn tới file Atlas PNG
  manifestPath?: string; // Đường dẫn tới animation.json (3.0)
  format: 'FORGE_3_0' | 'ASEPRITE_ARRAY' | 'GRID';
  frameSize: { width: number; height: number }; // 256x256
  anchor: { x: number; y: number }; // Điểm neo chân [0.5, 0.90] hoặc [0.5, 0.68] cho quân bay
  hitbox: { x: number; y: number; width: number; height: number }; // Hộp trúng đòn tương đối so với anchor
  stridePx?: number; // Độ dài sải chân trong 1 chu kỳ walk
  targetHeight?: number; // Chiều cao hiển thị thực tế (pixels)
  flying?: boolean; // Quân bay / drone bập bồng theo code
  frameOverride?: UnitFrameConfig;
  clips: {
    idle?: AnimationClipConfig;
    walk?: AnimationClipConfig;
    attack?: AnimationClipConfig;
    hurt?: AnimationClipConfig;
    die?: AnimationClipConfig;
    [key: string]: AnimationClipConfig | undefined;
  };
}

/**
 * Công cụ hiệu chỉnh tốc độ đi để khớp bước chân hoạt ảnh, tránh trượt chân:
 * speed (px/s) = (stridePx * fps) / walkFramesCount
 */
export function calculateSyncedWalkSpeed(stridePx: number, fps: number, frameCount: number): number {
  if (frameCount <= 0 || fps <= 0) return 95;
  return Math.round((stridePx * fps) / frameCount);
}

/**
 * Cấu hình Sprite cho toàn bộ 24 quân thuộc 6 Kỷ Nguyên
 */
export const SPRITE_CONFIGS: Record<string, SpriteConfig> = {
  // ==========================================
  // KỶ NGUYÊN 1: TIỀN SỬ (PREHISTORIC)
  // ==========================================
  stone_melee: {
    unitId: 'stone_melee',
    name: 'Người Vượn Đập Gậy',
    age: 1,
    atlasPath: '/sprites/prehistoric/caveman_atlas.png',
    manifestPath: '/sprites/prehistoric/caveman_animation.json',
    format: 'FORGE_3_0',
    frameSize: { width: 256, height: 256 },
    anchor: { x: 0.5, y: 0.90 },
    hitbox: { x: -35, y: -190, width: 70, height: 190 },
    stridePx: 64,
    targetHeight: 200,
    flying: false,
    clips: {
      idle: { name: 'idle', startFrame: 0, frameCount: 4, fps: 8, loop: true },
      walk: { name: 'walk', startFrame: 8, frameCount: 8, fps: 12, loop: true, stridePx: 64 },
      attack: {
        name: 'attack',
        startFrame: 16,
        frameCount: 8,
        fps: 12,
        loop: false,
        hitFrame: 3,
        events: [{ name: 'hit', frame: 3, atMs: 250 }],
      },
      hurt: { name: 'hurt', startFrame: 24, frameCount: 3, fps: 12, loop: false },
      die: { name: 'die', startFrame: 27, frameCount: 3, fps: 10, loop: false },
    },
  },
  stone_ranged: {
    unitId: 'stone_ranged',
    name: 'Thợ Săn Ném Đá',
    age: 1,
    atlasPath: '/sprites/prehistoric/hunter_atlas.png',
    manifestPath: '/sprites/prehistoric/hunter_animation.json',
    format: 'FORGE_3_0',
    frameSize: { width: 256, height: 256 },
    anchor: { x: 0.5, y: 0.90 },
    hitbox: { x: -30, y: -180, width: 60, height: 180 },
    stridePx: 60,
    targetHeight: 180,
    flying: false,
    clips: {
      idle: { name: 'idle', startFrame: 0, frameCount: 4, fps: 8, loop: true },
      walk: { name: 'walk', startFrame: 6, frameCount: 4, fps: 10, loop: true, stridePx: 60 },
      attack: {
        name: 'attack',
        startFrame: 12,
        frameCount: 3,
        fps: 12,
        loop: false,
        hitFrame: 1,
        releaseFrame: 1,
        events: [{ name: 'hit', frame: 1, atMs: 83 }],
      },
      hurt: { name: 'hurt', startFrame: 18, frameCount: 2, fps: 8, loop: false },
      die: { name: 'die', startFrame: 20, frameCount: 2, fps: 8, loop: false },
    },
  },
  stone_tank: {
    unitId: 'stone_tank',
    name: 'Dũng Sĩ Cưỡi Khủng Long',
    age: 1,
    atlasPath: '/sprites/prehistoric/dino_atlas.png',
    manifestPath: '/sprites/prehistoric/dino_animation.json',
    format: 'FORGE_3_0',
    frameSize: { width: 256, height: 256 },
    anchor: { x: 0.5, y: 0.90 },
    hitbox: { x: -55, y: -210, width: 110, height: 210 },
    stridePx: 80,
    targetHeight: 220,
    flying: false,
    clips: {
      idle: { name: 'idle', startFrame: 0, frameCount: 4, fps: 8, loop: true },
      walk: { name: 'walk', startFrame: 6, frameCount: 3, fps: 10, loop: true, stridePx: 80 },
      attack: {
        name: 'attack',
        startFrame: 12,
        frameCount: 3,
        fps: 12,
        loop: false,
        hitFrame: 1,
        events: [{ name: 'hit', frame: 1, atMs: 83 }],
      },
      hurt: { name: 'hurt', startFrame: 18, frameCount: 2, fps: 8, loop: false },
      die: { name: 'die', startFrame: 20, frameCount: 2, fps: 8, loop: false },
    },
  },
  stone_special: {
    unitId: 'stone_special',
    name: 'Thầy Mo Nguyên Thủy',
    age: 1,
    atlasPath: '/sprites/prehistoric/shaman_atlas.png',
    manifestPath: '/sprites/prehistoric/shaman_animation.json',
    format: 'FORGE_3_0',
    frameSize: { width: 256, height: 256 },
    anchor: { x: 0.5, y: 0.90 },
    hitbox: { x: -35, y: -180, width: 70, height: 180 },
    stridePx: 64,
    targetHeight: 190,
    flying: false,
    clips: {
      idle: { name: 'idle', startFrame: 0, frameCount: 4, fps: 8, loop: true },
      walk: { name: 'walk', startFrame: 6, frameCount: 4, fps: 10, loop: true, stridePx: 64 },
      attack: {
        name: 'attack',
        startFrame: 12,
        frameCount: 4,
        fps: 12,
        loop: false,
        hitFrame: 1,
        releaseFrame: 1,
        events: [{ name: 'hit', frame: 1, atMs: 83 }],
      },
      hurt: { name: 'hurt', startFrame: 18, frameCount: 2, fps: 8, loop: false },
      die: { name: 'die', startFrame: 20, frameCount: 2, fps: 8, loop: false },
    },
  },
  // ==========================================
  // KỶ NGUYÊN 2: TRUNG CỔ (MEDIEVAL)
  // ==========================================
  med_melee: {
    unitId: 'med_melee',
    name: 'Kiếm Sĩ Giáp Sắt',
    age: 2,
    atlasPath: '/sprites/medieval/knight_atlas.png',
    manifestPath: '/sprites/medieval/knight_animation.json',
    format: 'FORGE_3_0',
    frameSize: { width: 256, height: 256 },
    anchor: { x: 0.5, y: 0.90 },
    hitbox: { x: -35, y: -190, width: 70, height: 190 },
    stridePx: 64,
    targetHeight: 200,
    flying: false,
    clips: {
      idle: { name: 'idle', startFrame: 0, frameCount: 4, fps: 8, loop: true },
      walk: { name: 'walk', startFrame: 6, frameCount: 4, fps: 10, loop: true, stridePx: 64 },
      attack: {
        name: 'attack',
        startFrame: 12,
        frameCount: 4,
        fps: 12,
        loop: false,
        hitFrame: 1,
        events: [{ name: 'hit', frame: 1, atMs: 83 }],
      },
      hurt: { name: 'hurt', startFrame: 18, frameCount: 2, fps: 8, loop: false },
      die: { name: 'die', startFrame: 20, frameCount: 2, fps: 8, loop: false },
    },
  },
  med_ranged: {
    unitId: 'med_ranged',
    name: 'Cung Thủ Tên Lửa',
    age: 2,
    atlasPath: '/sprites/medieval/archer_atlas.png',
    manifestPath: '/sprites/medieval/archer_animation.json',
    format: 'FORGE_3_0',
    frameSize: { width: 256, height: 256 },
    anchor: { x: 0.5, y: 0.90 },
    hitbox: { x: -32, y: -180, width: 65, height: 180 },
    stridePx: 60,
    targetHeight: 185,
    flying: false,
    clips: {
      idle: { name: 'idle', startFrame: 0, frameCount: 4, fps: 8, loop: true },
      walk: { name: 'walk', startFrame: 6, frameCount: 4, fps: 10, loop: true, stridePx: 60 },
      attack: {
        name: 'attack',
        startFrame: 12,
        frameCount: 4,
        fps: 12,
        loop: false,
        hitFrame: 1,
        releaseFrame: 1,
        events: [{ name: 'hit', frame: 1, atMs: 83 }],
      },
      hurt: { name: 'hurt', startFrame: 18, frameCount: 2, fps: 8, loop: false },
      die: { name: 'die', startFrame: 20, frameCount: 2, fps: 8, loop: false },
    },
  },
  med_tank: {
    unitId: 'med_tank',
    name: 'Hiệp Sĩ Kỵ Mã Thiết Giáp',
    age: 2,
    atlasPath: '/sprites/medieval/cavalry_atlas.png',
    manifestPath: '/sprites/medieval/cavalry_animation.json',
    format: 'FORGE_3_0',
    frameSize: { width: 256, height: 256 },
    anchor: { x: 0.5, y: 0.90 },
    hitbox: { x: -60, y: -220, width: 120, height: 220 },
    stridePx: 90,
    targetHeight: 225,
    flying: false,
    clips: {
      idle: { name: 'idle', startFrame: 0, frameCount: 4, fps: 8, loop: true },
      walk: { name: 'walk', startFrame: 6, frameCount: 4, fps: 10, loop: true, stridePx: 90 },
      attack: {
        name: 'attack',
        startFrame: 12,
        frameCount: 4,
        fps: 12,
        loop: false,
        hitFrame: 1,
        events: [{ name: 'hit', frame: 1, atMs: 83 }],
      },
      hurt: { name: 'hurt', startFrame: 18, frameCount: 2, fps: 8, loop: false },
      die: { name: 'die', startFrame: 20, frameCount: 2, fps: 8, loop: false },
    },
  },
  med_special: {
    unitId: 'med_special',
    name: 'Tu Sĩ Trận Địa',
    age: 2,
    atlasPath: '/sprites/medieval/priest_atlas.png',
    manifestPath: '/sprites/medieval/priest_animation.json',
    format: 'FORGE_3_0',
    frameSize: { width: 256, height: 256 },
    anchor: { x: 0.5, y: 0.90 },
    hitbox: { x: -35, y: -185, width: 70, height: 185 },
    stridePx: 64,
    targetHeight: 190,
    flying: false,
    clips: {
      idle: { name: 'idle', startFrame: 0, frameCount: 4, fps: 8, loop: true },
      walk: { name: 'walk', startFrame: 6, frameCount: 4, fps: 10, loop: true, stridePx: 64 },
      attack: {
        name: 'attack',
        startFrame: 12,
        frameCount: 4,
        fps: 12,
        loop: false,
        hitFrame: 1,
        releaseFrame: 1,
        events: [{ name: 'hit', frame: 1, atMs: 83 }],
      },
      hurt: { name: 'hurt', startFrame: 18, frameCount: 2, fps: 8, loop: false },
      die: { name: 'die', startFrame: 20, frameCount: 2, fps: 8, loop: false },
    },
  },
  // ==========================================
  // KỶ NGUYÊN 3: PHỤC HƯNG (RENAISSANCE)
  // ==========================================
  ren_melee: {
    unitId: 'ren_melee',
    name: 'Lính Giáo Pike',
    age: 3,
    atlasPath: '/sprites/renaissance/pike_atlas.png',
    manifestPath: '/sprites/renaissance/pike_animation.json',
    format: 'FORGE_3_0',
    frameSize: { width: 256, height: 256 },
    anchor: { x: 0.5, y: 0.90 },
    hitbox: { x: -35, y: -190, width: 70, height: 190 },
    stridePx: 64,
    targetHeight: 200,
    flying: false,
    clips: {
      idle: { name: 'idle', startFrame: 0, frameCount: 4, fps: 8, loop: true },
      walk: { name: 'walk', startFrame: 6, frameCount: 4, fps: 10, loop: true, stridePx: 64 },
      attack: {
        name: 'attack',
        startFrame: 12,
        frameCount: 4,
        fps: 12,
        loop: false,
        hitFrame: 1,
        events: [{ name: 'hit', frame: 1, atMs: 83 }],
      },
      hurt: { name: 'hurt', startFrame: 18, frameCount: 2, fps: 8, loop: false },
      die: { name: 'die', startFrame: 20, frameCount: 2, fps: 8, loop: false },
    },
  },
  ren_ranged: {
    unitId: 'ren_ranged',
    name: 'Ngự Lâm Súng Hỏa Mai',
    age: 3,
    atlasPath: '/sprites/renaissance/musket_atlas.png',
    manifestPath: '/sprites/renaissance/musket_animation.json',
    format: 'FORGE_3_0',
    frameSize: { width: 256, height: 256 },
    anchor: { x: 0.5, y: 0.90 },
    hitbox: { x: -32, y: -180, width: 65, height: 180 },
    stridePx: 60,
    targetHeight: 185,
    flying: false,
    clips: {
      idle: { name: 'idle', startFrame: 0, frameCount: 4, fps: 8, loop: true },
      walk: { name: 'walk', startFrame: 6, frameCount: 4, fps: 10, loop: true, stridePx: 60 },
      attack: {
        name: 'attack',
        startFrame: 12,
        frameCount: 4,
        fps: 12,
        loop: false,
        hitFrame: 1,
        releaseFrame: 1,
        events: [{ name: 'hit', frame: 1, atMs: 83 }],
      },
      hurt: { name: 'hurt', startFrame: 18, frameCount: 2, fps: 8, loop: false },
      die: { name: 'die', startFrame: 20, frameCount: 2, fps: 8, loop: false },
    },
  },
  ren_tank: {
    unitId: 'ren_tank',
    name: 'Chiến Xa Pháo Đồng',
    age: 3,
    atlasPath: '/sprites/renaissance/cannon_cart_atlas.png',
    manifestPath: '/sprites/renaissance/cannon_cart_animation.json',
    format: 'FORGE_3_0',
    frameSize: { width: 256, height: 256 },
    anchor: { x: 0.5, y: 0.90 },
    hitbox: { x: -60, y: -210, width: 120, height: 210 },
    stridePx: 70,
    targetHeight: 220,
    flying: false,
    clips: {
      idle: { name: 'idle', startFrame: 0, frameCount: 4, fps: 8, loop: true },
      walk: { name: 'walk', startFrame: 6, frameCount: 4, fps: 10, loop: true, stridePx: 70 },
      attack: {
        name: 'attack',
        startFrame: 12,
        frameCount: 4,
        fps: 12,
        loop: false,
        hitFrame: 1,
        events: [{ name: 'hit', frame: 1, atMs: 83 }],
      },
      hurt: { name: 'hurt', startFrame: 18, frameCount: 2, fps: 8, loop: false },
      die: { name: 'die', startFrame: 20, frameCount: 2, fps: 8, loop: false },
    },
  },
  ren_special: {
    unitId: 'ren_special',
    name: 'Dù Lượn Da Vinci',
    age: 3,
    atlasPath: '/sprites/renaissance/glider_atlas.png',
    manifestPath: '/sprites/renaissance/glider_animation.json',
    format: 'FORGE_3_0',
    frameSize: { width: 256, height: 256 },
    anchor: { x: 0.5, y: 0.68 },
    hitbox: { x: -50, y: -160, width: 100, height: 160 },
    stridePx: 64,
    targetHeight: 195,
    flying: true,
    clips: {
      idle: { name: 'idle', startFrame: 0, frameCount: 4, fps: 8, loop: true },
      walk: { name: 'walk', startFrame: 6, frameCount: 4, fps: 10, loop: true, stridePx: 64 },
      attack: {
        name: 'attack',
        startFrame: 12,
        frameCount: 4,
        fps: 12,
        loop: false,
        hitFrame: 1,
        releaseFrame: 1,
        events: [{ name: 'hit', frame: 1, atMs: 83 }],
      },
      hurt: { name: 'hurt', startFrame: 18, frameCount: 2, fps: 8, loop: false },
      die: { name: 'die', startFrame: 20, frameCount: 2, fps: 8, loop: false },
    },
  },
  // ==========================================
  // KỶ NGUYÊN 4: HIỆN ĐẠI (MODERN WARFARE)
  // ==========================================
  mod_melee: {
    unitId: 'mod_melee',
    name: 'Đặc Nhiệm Cận Chiến',
    age: 4,
    atlasPath: '/sprites/modern/specops_atlas.png',
    manifestPath: '/sprites/modern/specops_animation.json',
    format: 'FORGE_3_0',
    frameSize: { width: 256, height: 256 },
    anchor: { x: 0.5, y: 0.90 },
    hitbox: { x: -35, y: -185, width: 70, height: 185 },
    stridePx: 64,
    targetHeight: 195,
    flying: false,
    clips: {
      idle: { name: 'idle', startFrame: 0, frameCount: 4, fps: 8, loop: true },
      walk: { name: 'walk', startFrame: 6, frameCount: 4, fps: 10, loop: true, stridePx: 64 },
      attack: {
        name: 'attack',
        startFrame: 12,
        frameCount: 4,
        fps: 12,
        loop: false,
        hitFrame: 1,
        events: [{ name: 'hit', frame: 1, atMs: 83 }],
      },
      hurt: { name: 'hurt', startFrame: 18, frameCount: 2, fps: 8, loop: false },
      die: { name: 'die', startFrame: 20, frameCount: 2, fps: 8, loop: false },
    },
  },
  mod_ranged: {
    unitId: 'mod_ranged',
    name: 'Xạ Thủ Bắn Tỉa Sniper',
    age: 4,
    atlasPath: '/sprites/modern/sniper_atlas.png',
    manifestPath: '/sprites/modern/sniper_animation.json',
    format: 'FORGE_3_0',
    frameSize: { width: 256, height: 256 },
    anchor: { x: 0.5, y: 0.90 },
    hitbox: { x: -32, y: -180, width: 65, height: 180 },
    stridePx: 60,
    targetHeight: 185,
    flying: false,
    clips: {
      idle: { name: 'idle', startFrame: 0, frameCount: 4, fps: 8, loop: true },
      walk: { name: 'walk', startFrame: 6, frameCount: 4, fps: 10, loop: true, stridePx: 60 },
      attack: {
        name: 'attack',
        startFrame: 12,
        frameCount: 4,
        fps: 12,
        loop: false,
        hitFrame: 1,
        releaseFrame: 1,
        events: [{ name: 'hit', frame: 1, atMs: 83 }],
      },
      hurt: { name: 'hurt', startFrame: 18, frameCount: 2, fps: 8, loop: false },
      die: { name: 'die', startFrame: 20, frameCount: 2, fps: 8, loop: false },
    },
  },
  mod_tank: {
    unitId: 'mod_tank',
    name: 'Xe Tăng Chủ Lực MBT',
    age: 4,
    atlasPath: '/sprites/modern/tank_atlas.png',
    manifestPath: '/sprites/modern/tank_animation.json',
    format: 'FORGE_3_0',
    frameSize: { width: 256, height: 256 },
    anchor: { x: 0.5, y: 0.90 },
    hitbox: { x: -65, y: -210, width: 130, height: 210 },
    stridePx: 80,
    targetHeight: 230,
    flying: false,
    clips: {
      idle: { name: 'idle', startFrame: 0, frameCount: 4, fps: 8, loop: true },
      walk: { name: 'walk', startFrame: 6, frameCount: 4, fps: 10, loop: true, stridePx: 80 },
      attack: {
        name: 'attack',
        startFrame: 12,
        frameCount: 4,
        fps: 12,
        loop: false,
        hitFrame: 1,
        events: [{ name: 'hit', frame: 1, atMs: 83 }],
      },
      hurt: { name: 'hurt', startFrame: 18, frameCount: 2, fps: 8, loop: false },
      die: { name: 'die', startFrame: 20, frameCount: 2, fps: 8, loop: false },
    },
  },
  mod_special: {
    unitId: 'mod_special',
    name: 'Trực Thăng Vũ Trang Apache',
    age: 4,
    atlasPath: '/sprites/modern/apache_atlas.png',
    manifestPath: '/sprites/modern/apache_animation.json',
    format: 'FORGE_3_0',
    frameSize: { width: 256, height: 256 },
    anchor: { x: 0.5, y: 0.68 },
    hitbox: { x: -60, y: -170, width: 120, height: 170 },
    stridePx: 75,
    targetHeight: 210,
    flying: true,
    clips: {
      idle: { name: 'idle', startFrame: 0, frameCount: 4, fps: 8, loop: true },
      walk: { name: 'walk', startFrame: 6, frameCount: 4, fps: 10, loop: true, stridePx: 75 },
      attack: {
        name: 'attack',
        startFrame: 12,
        frameCount: 4,
        fps: 12,
        loop: false,
        hitFrame: 1,
        releaseFrame: 1,
        events: [{ name: 'hit', frame: 1, atMs: 83 }],
      },
      hurt: { name: 'hurt', startFrame: 18, frameCount: 2, fps: 8, loop: false },
      die: { name: 'die', startFrame: 20, frameCount: 2, fps: 8, loop: false },
    },
  },
  // ==========================================
  // KỶ NGUYÊN 5: TƯƠNG LAI (FUTURISTIC)
  // ==========================================
  fut_melee: {
    unitId: 'fut_melee',
    name: 'Kiếm Sĩ Plasma Lướt Gió',
    age: 5,
    atlasPath: '/sprites/futuristic/plasma_sword_atlas.png',
    manifestPath: '/sprites/futuristic/plasma_sword_animation.json',
    format: 'FORGE_3_0',
    frameSize: { width: 256, height: 256 },
    anchor: { x: 0.5, y: 0.90 },
    hitbox: { x: -37, y: -190, width: 75, height: 190 },
    stridePx: 70,
    targetHeight: 200,
    flying: false,
    clips: {
      idle: { name: 'idle', startFrame: 0, frameCount: 4, fps: 8, loop: true },
      walk: { name: 'walk', startFrame: 6, frameCount: 4, fps: 10, loop: true, stridePx: 70 },
      attack: {
        name: 'attack',
        startFrame: 12,
        frameCount: 4,
        fps: 12,
        loop: false,
        hitFrame: 1,
        events: [{ name: 'hit', frame: 1, atMs: 83 }],
      },
      hurt: { name: 'hurt', startFrame: 18, frameCount: 2, fps: 8, loop: false },
      die: { name: 'die', startFrame: 20, frameCount: 2, fps: 8, loop: false },
    },
  },
  fut_ranged: {
    unitId: 'fut_ranged',
    name: 'Xạ Thủ Xung Điện Railgun',
    age: 5,
    atlasPath: '/sprites/futuristic/railgun_atlas.png',
    manifestPath: '/sprites/futuristic/railgun_animation.json',
    format: 'FORGE_3_0',
    frameSize: { width: 256, height: 256 },
    anchor: { x: 0.5, y: 0.90 },
    hitbox: { x: -35, y: -185, width: 70, height: 185 },
    stridePx: 64,
    targetHeight: 190,
    flying: false,
    clips: {
      idle: { name: 'idle', startFrame: 0, frameCount: 4, fps: 8, loop: true },
      walk: { name: 'walk', startFrame: 6, frameCount: 4, fps: 10, loop: true, stridePx: 64 },
      attack: {
        name: 'attack',
        startFrame: 12,
        frameCount: 4,
        fps: 12,
        loop: false,
        hitFrame: 1,
        releaseFrame: 1,
        events: [{ name: 'hit', frame: 1, atMs: 83 }],
      },
      hurt: { name: 'hurt', startFrame: 18, frameCount: 2, fps: 8, loop: false },
      die: { name: 'die', startFrame: 20, frameCount: 2, fps: 8, loop: false },
    },
  },
  fut_tank: {
    unitId: 'fut_tank',
    name: 'Robot Titan Mech Hai Chân',
    age: 5,
    atlasPath: '/sprites/futuristic/titan_mech_atlas.png',
    manifestPath: '/sprites/futuristic/titan_mech_animation.json',
    format: 'FORGE_3_0',
    frameSize: { width: 256, height: 256 },
    anchor: { x: 0.5, y: 0.90 },
    hitbox: { x: -70, y: -230, width: 140, height: 230 },
    stridePx: 85,
    targetHeight: 240,
    flying: false,
    clips: {
      idle: { name: 'idle', startFrame: 0, frameCount: 4, fps: 8, loop: true },
      walk: { name: 'walk', startFrame: 6, frameCount: 4, fps: 10, loop: true, stridePx: 85 },
      attack: {
        name: 'attack',
        startFrame: 12,
        frameCount: 4,
        fps: 12,
        loop: false,
        hitFrame: 1,
        events: [{ name: 'hit', frame: 1, atMs: 83 }],
      },
      hurt: { name: 'hurt', startFrame: 18, frameCount: 2, fps: 8, loop: false },
      die: { name: 'die', startFrame: 20, frameCount: 2, fps: 8, loop: false },
    },
  },
  fut_special: {
    unitId: 'fut_special',
    name: 'Cyborg Drone Carrier',
    age: 5,
    atlasPath: '/sprites/futuristic/carrier_atlas.png',
    manifestPath: '/sprites/futuristic/carrier_animation.json',
    format: 'FORGE_3_0',
    frameSize: { width: 256, height: 256 },
    anchor: { x: 0.5, y: 0.68 },
    hitbox: { x: -55, y: -175, width: 110, height: 175 },
    stridePx: 64,
    targetHeight: 205,
    flying: true,
    clips: {
      idle: { name: 'idle', startFrame: 0, frameCount: 4, fps: 8, loop: true },
      walk: { name: 'walk', startFrame: 6, frameCount: 4, fps: 10, loop: true, stridePx: 64 },
      attack: {
        name: 'attack',
        startFrame: 12,
        frameCount: 4,
        fps: 12,
        loop: false,
        hitFrame: 1,
        releaseFrame: 1,
        events: [{ name: 'hit', frame: 1, atMs: 83 }],
      },
      hurt: { name: 'hurt', startFrame: 18, frameCount: 2, fps: 8, loop: false },
      die: { name: 'die', startFrame: 20, frameCount: 2, fps: 8, loop: false },
    },
  },
  // ==========================================
  // KỶ NGUYÊN 6: SINGULARITY (AI ERA)
  // ==========================================
  ai_drone_swarm: {
    unitId: 'ai_drone_swarm',
    name: 'Bầy Drone Nano Tự Trị',
    age: 6,
    atlasPath: '/sprites/ai/drone_swarm_atlas.png',
    manifestPath: '/sprites/ai/drone_swarm_animation.json',
    format: 'FORGE_3_0',
    frameSize: { width: 256, height: 256 },
    anchor: { x: 0.5, y: 0.68 },
    hitbox: { x: -40, y: -160, width: 80, height: 160 },
    stridePx: 70,
    targetHeight: 190,
    flying: true,
    clips: {
      idle: { name: 'idle', startFrame: 0, frameCount: 4, fps: 8, loop: true },
      walk: { name: 'walk', startFrame: 6, frameCount: 4, fps: 10, loop: true, stridePx: 70 },
      attack: {
        name: 'attack',
        startFrame: 12,
        frameCount: 4,
        fps: 12,
        loop: false,
        hitFrame: 1,
        releaseFrame: 1,
        events: [{ name: 'hit', frame: 1, atMs: 83 }],
      },
      hurt: { name: 'hurt', startFrame: 18, frameCount: 2, fps: 8, loop: false },
      die: { name: 'die', startFrame: 20, frameCount: 2, fps: 8, loop: false },
    },
  },
  ai_neural_hacker: {
    unitId: 'ai_neural_hacker',
    name: 'Neural Hacker',
    age: 6,
    atlasPath: '/sprites/ai/hacker_atlas.png',
    manifestPath: '/sprites/ai/hacker_animation.json',
    format: 'FORGE_3_0',
    frameSize: { width: 256, height: 256 },
    anchor: { x: 0.5, y: 0.90 },
    hitbox: { x: -35, y: -185, width: 70, height: 185 },
    stridePx: 64,
    targetHeight: 195,
    flying: false,
    clips: {
      idle: { name: 'idle', startFrame: 0, frameCount: 4, fps: 8, loop: true },
      walk: { name: 'walk', startFrame: 6, frameCount: 4, fps: 10, loop: true, stridePx: 64 },
      attack: {
        name: 'attack',
        startFrame: 12,
        frameCount: 4,
        fps: 12,
        loop: false,
        hitFrame: 1,
        releaseFrame: 1,
        events: [{ name: 'hit', frame: 1, atMs: 83 }],
      },
      hurt: { name: 'hurt', startFrame: 18, frameCount: 2, fps: 8, loop: false },
      die: { name: 'die', startFrame: 20, frameCount: 2, fps: 8, loop: false },
    },
  },
  ai_quantum_synth: {
    unitId: 'ai_quantum_synth',
    name: 'Quantum Synthesizer Mech',
    age: 6,
    atlasPath: '/sprites/ai/synth_mech_atlas.png',
    manifestPath: '/sprites/ai/synth_mech_animation.json',
    format: 'FORGE_3_0',
    frameSize: { width: 256, height: 256 },
    anchor: { x: 0.5, y: 0.90 },
    hitbox: { x: -70, y: -230, width: 140, height: 230 },
    stridePx: 85,
    targetHeight: 240,
    flying: false,
    clips: {
      idle: { name: 'idle', startFrame: 0, frameCount: 4, fps: 8, loop: true },
      walk: { name: 'walk', startFrame: 6, frameCount: 4, fps: 10, loop: true, stridePx: 85 },
      attack: {
        name: 'attack',
        startFrame: 12,
        frameCount: 4,
        fps: 12,
        loop: false,
        hitFrame: 1,
        events: [{ name: 'hit', frame: 1, atMs: 83 }],
      },
      hurt: { name: 'hurt', startFrame: 18, frameCount: 2, fps: 8, loop: false },
      die: { name: 'die', startFrame: 20, frameCount: 2, fps: 8, loop: false },
    },
  },
  ai_avatar_hologram: {
    unitId: 'ai_avatar_hologram',
    name: 'AI Avatar Hologram',
    age: 6,
    atlasPath: '/sprites/ai/avatar_atlas.png',
    manifestPath: '/sprites/ai/avatar_animation.json',
    format: 'FORGE_3_0',
    frameSize: { width: 256, height: 256 },
    anchor: { x: 0.5, y: 0.90 },
    hitbox: { x: -35, y: -190, width: 70, height: 190 },
    stridePx: 64,
    targetHeight: 200,
    flying: false,
    clips: {
      idle: { name: 'idle', startFrame: 0, frameCount: 4, fps: 8, loop: true },
      walk: { name: 'walk', startFrame: 6, frameCount: 4, fps: 10, loop: true, stridePx: 64 },
      attack: {
        name: 'attack',
        startFrame: 12,
        frameCount: 4,
        fps: 12,
        loop: false,
        hitFrame: 1,
        events: [{ name: 'hit', frame: 1, atMs: 83 }],
      },
      hurt: { name: 'hurt', startFrame: 18, frameCount: 2, fps: 8, loop: false },
      die: { name: 'die', startFrame: 20, frameCount: 2, fps: 8, loop: false },
    },
  },
};

// Tương thích ngược alias
SPRITE_CONFIGS.ai_hologram_avatar = SPRITE_CONFIGS.ai_avatar_hologram;
SPRITE_CONFIGS.u_pre_warrior = SPRITE_CONFIGS.stone_melee;
SPRITE_CONFIGS.u_pre_hunter = SPRITE_CONFIGS.stone_ranged;
SPRITE_CONFIGS.u_pre_dino = SPRITE_CONFIGS.stone_tank;
SPRITE_CONFIGS.u_pre_shaman = SPRITE_CONFIGS.stone_special;
SPRITE_CONFIGS.u_mod_apache = SPRITE_CONFIGS.mod_special;
SPRITE_CONFIGS.u_ai_swarm = SPRITE_CONFIGS.ai_drone_swarm;

/**
 * Lấy cấu hình Sprite theo unitId hoặc trả về null
 */
export function getSpriteConfig(unitId: string): SpriteConfig | null {
  const base = SPRITE_CONFIGS[unitId];
  if (!base) return null;

  const override = getUnitFrameOverride(unitId);
  if (!override) return base;

  return {
    ...base,
    frameOverride: override,
  };
}
