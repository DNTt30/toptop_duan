/**
 * The Singularity Odyssey — Dữ liệu cấu hình 6 Kỷ Nguyên
 * Toàn bộ chỉ số, khắc chế, kỹ năng và thời gian đều được cấu hình tập trung tại đây.
 * TUYỆT ĐỐI KHÔNG hardcode chỉ số trong mã nguồn logic engine.
 */

export type UnitType = 'MELEE' | 'RANGED' | 'TANK' | 'SPECIAL';
export type Team = 'LEFT' | 'RIGHT';

/**
 * Hệ số khắc chế tam giác:
 * MELEE > RANGED > TANK > MELEE
 * - Bên chiếm ưu thế: x1.25 sát thương
 * - Bên thất thế: x0.80 sát thương
 * - Cùng loại hoặc SPECIAL: x1.00
 */
export const COUNTER_MULTIPLIER = {
  ADVANTAGE: 1.35,
  DISADVANTAGE: 0.75,
  NEUTRAL: 1.0,
} as const;

export function getCounterMultiplier(attackerType: UnitType, defenderType: UnitType): number {
  if (attackerType === 'SPECIAL' || defenderType === 'SPECIAL') return COUNTER_MULTIPLIER.NEUTRAL;
  if (attackerType === defenderType) return COUNTER_MULTIPLIER.NEUTRAL;

  if (
    (attackerType === 'MELEE' && defenderType === 'RANGED') ||
    (attackerType === 'RANGED' && defenderType === 'TANK') ||
    (attackerType === 'TANK' && defenderType === 'MELEE')
  ) {
    return COUNTER_MULTIPLIER.ADVANTAGE;
  }

  if (
    (attackerType === 'RANGED' && defenderType === 'MELEE') ||
    (attackerType === 'TANK' && defenderType === 'RANGED') ||
    (attackerType === 'MELEE' && defenderType === 'TANK')
  ) {
    return COUNTER_MULTIPLIER.DISADVANTAGE;
  }

  return COUNTER_MULTIPLIER.NEUTRAL;
}

export interface UnitConfig {
  id: string;
  name: string;
  type: UnitType;
  cost: number;
  spawnTime: number; // Thời gian chờ sản xuất (giây)
  hp: number;
  damage: number;
  range: number; // Khoảng cách tấn công (pixels)
  attackSpeed: number; // Giây giữa mỗi đòn đánh
  speed: number; // Tốc độ di chuyển (pixel/giây)
  size: { width: number; height: number };
  color: number; // Mã màu HEX cho Pixi Graphics
  accentColor: number;
  flying?: boolean;
  bountyGold: number;
  bountyXp: number;
  description: string;
  specialAbility?: string;
}

export interface TurretConfig {
  id: string;
  name: string;
  cost: number;
  sellRefundRate: number; // Tỷ lệ hoàn tiền khi bán (0.7)
  range: number;
  damage: number;
  fireRate: number; // Giây giữa các lần bắn
  color: number;
  projectileSpeed: number;
  description: string;
}

export interface UltimateConfig {
  id: string;
  name: string;
  cooldown: number; // Thời gian hồi chiêu tăng dần theo kỷ nguyên (giây)
  description: string;
  effectType: 'METEOR_SHOWER' | 'SYSTEM_REBOOT' | 'ARROW_RAIN' | 'CANNONADE' | 'AIRSTRIKE' | 'ION_CANNON';
  damagePercentMaxHp: number; // Sát thương theo % máu tối đa (không bao giờ 100%)
  wavesCount: number; // Số đợt dội đòn
  aoeRadius: number; // Vùng ảnh hưởng (pixels thế giới)
  stunDuration: number; // Thời gian làm choáng (giây)
}

export interface AgeConfig {
  id: number;
  name: string;
  title: string;
  xpRequired: number; // Ngưỡng XP để lên kỷ nguyên này (Kỷ nguyên 1 là 0)
  themeColor: number;
  baseColor: number;
  groundColor: number;
  skyColor: number;
  units: [UnitConfig, UnitConfig, UnitConfig, UnitConfig]; // 4 quân: MELEE, RANGED, TANK, SPECIAL
  turrets: TurretConfig[];
  ultimate: UltimateConfig;
}

export const BASE_MAX_HP = 1000;
export const MAX_UNITS_PER_TEAM = 30;
export const LANE_WIDTH = 4480; // Bản đồ dài 3.5 lần viewport (1280 * 3.5 = 4480px)
export const BASE_WIDTH = 220;
export const TURRET_SLOTS_COUNT = 3;

// ==========================================
// CẤU HÌNH CHI TIẾT 6 KỶ NGUYÊN
// ==========================================

export const AGES_DATA: Record<number, AgeConfig> = {
  // ----------------------------------------------------
  // KỶ NGUYÊN 1: THỜI TIỀN SỬ (THE STONE AGE)
  // ----------------------------------------------------
  1: {
    id: 1,
    name: 'Tiền Sử',
    title: 'Kỷ Nguyên Đồ Đá',
    xpRequired: 0,
    themeColor: 0xd97706, // Vàng đất / Cam nguyên thủy
    baseColor: 0x78350f,
    groundColor: 0x451a03,
    skyColor: 0x0f172a,
    units: [
      {
        id: 'stone_melee',
        name: 'Người Vượn Đập Gậy',
        type: 'MELEE',
        cost: 25,
        spawnTime: 2.0,
        hp: 110,
        damage: 26,
        range: 50,
        attackSpeed: 1.0,
        speed: 120,
        size: { width: 32, height: 44 },
        color: 0xb45309,
        accentColor: 0xfef08a,
        bountyGold: 20,
        bountyXp: 35,
        description: 'Lính cận chiến giá rẻ, tốc độ di chuyển nhanh, khắc chế lính tầm xa.',
      },
      {
        id: 'stone_ranged',
        name: 'Thợ Săn Ném Đá',
        type: 'RANGED',
        cost: 40,
        spawnTime: 2.5,
        hp: 75,
        damage: 30,
        range: 240,
        attackSpeed: 1.3,
        speed: 105,
        size: { width: 28, height: 42 },
        color: 0xd97706,
        accentColor: 0x94a3b8,
        bountyGold: 30,
        bountyXp: 50,
        description: 'Tầm xa ném đá chuẩn xác, gây áp lực từ phía sau hàng chống chịu.',
      },
      {
        id: 'stone_tank',
        name: 'Dũng Sĩ Cưỡi Khủng Long',
        type: 'TANK',
        cost: 95,
        spawnTime: 4.5,
        hp: 360,
        damage: 34,
        range: 55,
        attackSpeed: 1.7,
        speed: 95,
        size: { width: 50, height: 56 },
        color: 0x92400e,
        accentColor: 0x22c55e,
        bountyGold: 70,
        bountyXp: 110,
        description: 'Lượng máu khổng lồ, che chắn làn đạn cho lính ném đá.',
      },
      {
        id: 'stone_special',
        name: 'Thầy Mo Nguyên Thủy',
        type: 'SPECIAL',
        cost: 130,
        spawnTime: 5.5,
        hp: 160,
        damage: 32,
        range: 180,
        attackSpeed: 2.0,
        speed: 110,
        size: { width: 34, height: 48 },
        color: 0xe11d48,
        accentColor: 0x38bdf8,
        bountyGold: 95,
        bountyXp: 150,
        description: 'Gõ mõ triệu hồi lửa tổ tiên, đòn đánh nổ lan phạm vi nhỏ (AoE 60px).',
        specialAbility: 'AOE_SPLASH',
      },
    ],
    turrets: [
      {
        id: 'stone_slingshot',
        name: 'Ụ Ném Đá Nguyên Thủy',
        cost: 75,
        sellRefundRate: 0.7,
        range: 260,
        damage: 30,
        fireRate: 1.5,
        color: 0x78350f,
        projectileSpeed: 380,
        description: 'Tháp phòng thủ cơ bản, bắn đá chặn đường lính áp sát.',
      },
    ],
    ultimate: {
      id: 'stone_meteor',
      name: 'Mưa Thiên Thạch',
      cooldown: 45,
      description: 'Mưa đá lửa từ trời rơi xuống thành 3 đợt, gây 35% máu tối đa trong vùng 400px và làm choáng 1.2s.',
      effectType: 'METEOR_SHOWER',
      damagePercentMaxHp: 0.35,
      wavesCount: 3,
      aoeRadius: 400,
      stunDuration: 1.2,
    },
  },

  // ----------------------------------------------------
  // KỶ NGUYÊN 2: TRUNG CỔ (MEDIEVAL) - Placeholder stat cơ sở
  // ----------------------------------------------------
  2: {
    id: 2,
    name: 'Trung Cổ',
    title: 'Kỷ Nguyên Lâu Đài & Cung Kiếm',
    xpRequired: 450,
    themeColor: 0x3b82f6,
    baseColor: 0x1e3a8a,
    groundColor: 0x1c1917,
    skyColor: 0x0f172a,
    units: [
      {
        id: 'med_melee',
        name: 'Kiếm Sĩ Giáp Sắt',
        type: 'MELEE',
        cost: 45,
        spawnTime: 2.2,
        hp: 190,
        damage: 42,
        range: 48,
        attackSpeed: 1.1,
        speed: 122,
        size: { width: 34, height: 46 },
        color: 0x2563eb,
        accentColor: 0xf1f5f9,
        bountyGold: 35,
        bountyXp: 55,
        description: 'Kiếm bén giáp dày, xung kích hàng tiền tuyến.',
      },
      {
        id: 'med_ranged',
        name: 'Cung Thủ Tên Lửa',
        type: 'RANGED',
        cost: 65,
        spawnTime: 2.8,
        hp: 110,
        damage: 50,
        range: 240,
        attackSpeed: 1.3,
        speed: 106,
        size: { width: 30, height: 44 },
        color: 0x1d4ed8,
        accentColor: 0xf97316,
        bountyGold: 50,
        bountyXp: 75,
        description: 'Bắn tên tẩm dầu thiêu đốt kẻ địch.',
      },
      {
        id: 'med_tank',
        name: 'Hiệp Sĩ Kỵ Mã Thiết Giáp',
        type: 'TANK',
        cost: 150,
        spawnTime: 5.0,
        hp: 500,
        damage: 58,
        range: 60,
        attackSpeed: 1.6,
        speed: 96,
        size: { width: 54, height: 60 },
        color: 0x1e40af,
        accentColor: 0xfacc15,
        bountyGold: 110,
        bountyXp: 160,
        description: 'Lớp giáp thép kiên cố cản đường mọi đòn tấn công.',
      },
      {
        id: 'med_special',
        name: 'Tu Sĩ Trận Địa',
        type: 'SPECIAL',
        cost: 190,
        spawnTime: 6.0,
        hp: 230,
        damage: 46,
        range: 200,
        attackSpeed: 1.9,
        speed: 112,
        size: { width: 36, height: 50 },
        color: 0x8b5cf6,
        accentColor: 0xfef08a,
        bountyGold: 140,
        bountyXp: 210,
        description: 'Thánh quang phục hồi sinh lực cho đồng minh gần nhất.',
        specialAbility: 'HEAL_AURA',
      },
    ],
    turrets: [
      {
        id: 'med_ballista',
        name: 'Tháp Nỏ Khổng Lồ',
        cost: 120,
        sellRefundRate: 0.7,
        range: 290,
        damage: 52,
        fireRate: 1.4,
        color: 0x1e3a8a,
        projectileSpeed: 440,
        description: 'Mũi nỏ thép uy lực tầm xa.',
      },
    ],
    ultimate: {
      id: 'med_arrow_rain',
      name: 'Mưa Bão Tên Lửa',
      cooldown: 52,
      description: 'Hàng vạn mũi tên rực lửa dội 4 đợt, gây 38% máu tối đa trong vùng 450px.',
      effectType: 'ARROW_RAIN',
      damagePercentMaxHp: 0.38,
      wavesCount: 4,
      aoeRadius: 450,
      stunDuration: 1.4,
    },
  },

  // ----------------------------------------------------
  // KỶ NGUYÊN 3: PHỤC HƯNG & THUỐC SÚNG (Placeholder)
  // ----------------------------------------------------
  3: {
    id: 3,
    name: 'Phục Hưng',
    title: 'Kỷ Nguyên Hỏa Mai & Đại Bác',
    xpRequired: 1100,
    themeColor: 0x854d0e,
    baseColor: 0x581c87,
    groundColor: 0x1c1917,
    skyColor: 0x0f172a,
    units: [
      {
        id: 'ren_melee',
        name: 'Lính Giáo Pike',
        type: 'MELEE',
        cost: 70,
        spawnTime: 2.4,
        hp: 280,
        damage: 66,
        range: 55,
        attackSpeed: 1.1,
        speed: 125,
        size: { width: 34, height: 46 },
        color: 0xb45309,
        accentColor: 0xf1f5f9,
        bountyGold: 55,
        bountyXp: 80,
        description: 'Mũi giáo dài cản bước bộ binh.',
      },
      {
        id: 'ren_ranged',
        name: 'Ngự Lâm Súng Hỏa Mai',
        type: 'RANGED',
        cost: 100,
        spawnTime: 3.0,
        hp: 160,
        damage: 82,
        range: 260,
        attackSpeed: 1.5,
        speed: 108,
        size: { width: 30, height: 44 },
        color: 0xd97706,
        accentColor: 0xef4444,
        bountyGold: 75,
        bountyXp: 110,
        description: 'Sức công phá xuyên thủng giáp thép.',
      },
      {
        id: 'ren_tank',
        name: 'Chiến Xa Pháo Đồng',
        type: 'TANK',
        cost: 220,
        spawnTime: 5.5,
        hp: 720,
        damage: 92,
        range: 65,
        attackSpeed: 1.7,
        speed: 96,
        size: { width: 56, height: 60 },
        color: 0x78350f,
        accentColor: 0xeab308,
        bountyGold: 160,
        bountyXp: 230,
        description: 'Cỗ máy hỏa lực đồng nặng nề.',
      },
      {
        id: 'ren_special',
        name: 'Dù Lượn Da Vinci',
        type: 'SPECIAL',
        cost: 270,
        spawnTime: 6.5,
        hp: 310,
        damage: 76,
        range: 210,
        attackSpeed: 1.8,
        speed: 115,
        size: { width: 40, height: 50 },
        color: 0x9333ea,
        accentColor: 0x38bdf8,
        flying: true,
        bountyGold: 200,
        bountyXp: 300,
        description: 'Bay trên không thả lựu đạn gây choáng.',
        specialAbility: 'AIR_BOMB',
      },
    ],
    turrets: [
      {
        id: 'ren_cannon',
        name: 'Khẩu Đội Thần Công',
        cost: 170,
        sellRefundRate: 0.7,
        range: 310,
        damage: 85,
        fireRate: 1.6,
        color: 0x78350f,
        projectileSpeed: 460,
        description: 'Pháo nổ sát thương uy lực.',
      },
    ],
    ultimate: {
      id: 'ren_cannonade',
      name: 'Đại Pháo Hoàng Gia',
      cooldown: 60,
      description: 'Pháo binh đồng loạt dội 4 đợt đạn, gây 42% máu tối đa trong vùng 500px.',
      effectType: 'CANNONADE',
      damagePercentMaxHp: 0.42,
      wavesCount: 4,
      aoeRadius: 500,
      stunDuration: 1.6,
    },
  },

  // ----------------------------------------------------
  // KỶ NGUYÊN 4: HIỆN ĐẠI (MODERN WARFARE - Placeholder)
  // ----------------------------------------------------
  4: {
    id: 4,
    name: 'Hiện Đại',
    title: 'Kỷ Nguyên Cơ Giới Hóa',
    xpRequired: 2100,
    themeColor: 0x15803d,
    baseColor: 0x166534,
    groundColor: 0x1e293b,
    skyColor: 0x020617,
    units: [
      {
        id: 'mod_melee',
        name: 'Đặc Nhiệm Cận Chiến',
        type: 'MELEE',
        cost: 110,
        spawnTime: 2.5,
        hp: 380,
        damage: 110,
        range: 50,
        attackSpeed: 1.0,
        speed: 126,
        size: { width: 34, height: 46 },
        color: 0x15803d,
        accentColor: 0xf1f5f9,
        bountyGold: 85,
        bountyXp: 120,
        description: 'Áp sát tác chiến tốc độ cực nhanh.',
      },
      {
        id: 'mod_ranged',
        name: 'Xạ Thủ Bắn Tỉa Sniper',
        type: 'RANGED',
        cost: 150,
        spawnTime: 3.2,
        hp: 210,
        damage: 135,
        range: 280,
        attackSpeed: 1.6,
        speed: 110,
        size: { width: 30, height: 44 },
        color: 0x166534,
        accentColor: 0xef4444,
        bountyGold: 115,
        bountyXp: 160,
        description: 'Hạ gục mục tiêu từ cự ly siêu xa.',
      },
      {
        id: 'mod_tank',
        name: 'Xe Tăng Chủ Lực MBT',
        type: 'TANK',
        cost: 320,
        spawnTime: 6.0,
        hp: 960,
        damage: 150,
        range: 70,
        attackSpeed: 1.8,
        speed: 98,
        size: { width: 62, height: 60 },
        color: 0x14532d,
        accentColor: 0xeab308,
        bountyGold: 240,
        bountyXp: 340,
        description: 'Bọc thép hợp kim siêu bền bỉ.',
      },
      {
        id: 'mod_special',
        name: 'Trực Thăng Vũ Trang Apache',
        type: 'SPECIAL',
        cost: 390,
        spawnTime: 7.0,
        hp: 420,
        damage: 125,
        range: 230,
        attackSpeed: 1.7,
        speed: 118,
        size: { width: 44, height: 50 },
        color: 0x047857,
        accentColor: 0x38bdf8,
        flying: true,
        bountyGold: 290,
        bountyXp: 410,
        description: 'Tác chiến đường không phóng rocket dội lửa.',
        specialAbility: 'AIR_ROCKET',
      },
    ],
    turrets: [
      {
        id: 'mod_gatling',
        name: 'Ụ Súng Máy Gatling Minigun',
        cost: 230,
        sellRefundRate: 0.7,
        range: 330,
        damage: 135,
        fireRate: 1.1,
        color: 0x166534,
        projectileSpeed: 520,
        description: 'Tốc độ bắn cực cao quét sạch lính tiếp cận.',
      },
    ],
    ultimate: {
      id: 'mod_airstrike',
      name: 'Không Kích B-52',
      cooldown: 68,
      description: 'Phi đội dội 5 đợt bom cháy, gây 46% máu tối đa trong vùng 600px.',
      effectType: 'AIRSTRIKE',
      damagePercentMaxHp: 0.46,
      wavesCount: 5,
      aoeRadius: 600,
      stunDuration: 1.7,
    },
  },

  // ----------------------------------------------------
  // KỶ NGUYÊN 5: TƯƠNG LAI (CYBER FUTURISTIC - Placeholder)
  // ----------------------------------------------------
  5: {
    id: 5,
    name: 'Tương Lai',
    title: 'Kỷ Nguyên Cyberpunk & Năng Lượng Plasma',
    xpRequired: 3500,
    themeColor: 0x06b6d4,
    baseColor: 0x0e7490,
    groundColor: 0x090d16,
    skyColor: 0x020617,
    units: [
      {
        id: 'fut_melee',
        name: 'Kiếm Sĩ Plasma Lướt Gió',
        type: 'MELEE',
        cost: 160,
        spawnTime: 2.6,
        hp: 520,
        damage: 180,
        range: 52,
        attackSpeed: 0.95,
        speed: 128,
        size: { width: 34, height: 46 },
        color: 0x06b6d4,
        accentColor: 0x22d3ee,
        bountyGold: 125,
        bountyXp: 180,
        description: 'Gươm ánh sáng chém rách mọi lớp phòng thủ.',
      },
      {
        id: 'fut_ranged',
        name: 'Xạ Thủ Xung Điện Railgun',
        type: 'RANGED',
        cost: 220,
        spawnTime: 3.5,
        hp: 290,
        damage: 220,
        range: 300,
        attackSpeed: 1.6,
        speed: 112,
        size: { width: 30, height: 44 },
        color: 0x0891b2,
        accentColor: 0x67e8f9,
        bountyGold: 170,
        bountyXp: 240,
        description: 'Đạn chùm sóng xung kích xuyên nhiều mục tiêu.',
      },
      {
        id: 'fut_tank',
        name: 'Robot Titan Mech Hai Chân',
        type: 'TANK',
        cost: 440,
        spawnTime: 6.5,
        hp: 1350,
        damage: 240,
        range: 75,
        attackSpeed: 1.7,
        speed: 100,
        size: { width: 66, height: 64 },
        color: 0x0e7490,
        accentColor: 0xa855f7,
        bountyGold: 340,
        bountyXp: 480,
        description: 'Khung giáp Titan lá chắn từ trường kiên cố.',
      },
      {
        id: 'fut_special',
        name: 'Cyborg Drone Carrier',
        type: 'SPECIAL',
        cost: 520,
        spawnTime: 7.5,
        hp: 640,
        damage: 200,
        range: 250,
        attackSpeed: 1.6,
        speed: 120,
        size: { width: 44, height: 52 },
        color: 0x8b5cf6,
        accentColor: 0x38bdf8,
        bountyGold: 410,
        bountyXp: 570,
        description: 'Phóng drone tự hành bảo hộ hàng tiền tuyến.',
        specialAbility: 'DRONE_SHIELD',
      },
    ],
    turrets: [
      {
        id: 'fut_laser',
        name: 'Trụ Laser Hội Tụ Phân Cực',
        cost: 320,
        sellRefundRate: 0.7,
        range: 350,
        damage: 210,
        fireRate: 1.0,
        color: 0x0891b2,
        projectileSpeed: 600,
        description: 'Chùm sáng liên tục thiêu rụi mục tiêu trong tầm.',
      },
    ],
    ultimate: {
      id: 'fut_ion_cannon',
      name: 'Pháo Quỹ Đạo Ion',
      cooldown: 76,
      description: 'Chùm tia vệ tinh dội 5 đợt sóng ion, gây 50% máu tối đa trong vùng 700px.',
      effectType: 'ION_CANNON',
      damagePercentMaxHp: 0.50,
      wavesCount: 5,
      aoeRadius: 700,
      stunDuration: 1.8,
    },
  },

  // ----------------------------------------------------
  // KỶ NGUYÊN 6: SIÊU TRÍ TUỆ AI (THE SINGULARITY AGE)
  // Thực thi đầy đủ 100% theo yêu cầu thiết kế
  // ----------------------------------------------------
  6: {
    id: 6,
    name: 'Kỷ Nguyên AI',
    title: 'Điểm Kỳ Dị: Siêu Trí Tuệ Toàn Năng',
    xpRequired: 5200,
    themeColor: 0x10b981, // Xanh Matrix / Neon Lượng Tử
    baseColor: 0x064e3b,
    groundColor: 0x022c22,
    skyColor: 0x020617,
    units: [
      {
        id: 'ai_drone_swarm',
        name: 'Bầy Drone Nano Tự Trị',
        type: 'MELEE',
        cost: 210,
        spawnTime: 2.4,
        hp: 680,
        damage: 260,
        range: 52,
        attackSpeed: 0.85, // Đánh cực nhanh
        speed: 132, // Chạy như bay
        size: { width: 36, height: 46 },
        color: 0x10b981,
        accentColor: 0x6ee7b7,
        bountyGold: 160,
        bountyXp: 230,
        description: 'Đàn nano drone bay lắt léo áp sát cắn rỉa với tốc độ kinh hoàng.',
      },
      {
        id: 'ai_neural_hacker',
        name: 'Neural Hacker',
        type: 'RANGED',
        cost: 320,
        spawnTime: 3.8,
        hp: 420,
        damage: 320,
        range: 310,
        attackSpeed: 1.5,
        speed: 115,
        size: { width: 32, height: 46 },
        color: 0x059669,
        accentColor: 0x34d399,
        bountyGold: 240,
        bountyXp: 340,
        description: 'Bắn mã độc gây slow (-35%) + giảm giáp (+25% sát thương nhận), 15% cơ hội đổi phe lính địch (không đổi Tank).',
        specialAbility: 'NEURAL_CONVERT',
      },
      {
        id: 'ai_quantum_synth',
        name: 'Quantum Synthesizer Mech',
        type: 'TANK',
        cost: 580,
        spawnTime: 7.0,
        hp: 2100,
        damage: 340,
        range: 80,
        attackSpeed: 1.6,
        speed: 102,
        size: { width: 70, height: 68 },
        color: 0x047857,
        accentColor: 0xa7f3d0,
        bountyGold: 450,
        bountyXp: 620,
        description: 'Hấp thụ 100% sát thương vào thanh năng lượng; khi đầy (100) phóng sóng xung kích đẩy lùi kẻ địch 120px và gây 250 AoE.',
        specialAbility: 'ENERGY_ABSORB_SHOCKWAVE',
      },
      {
        id: 'ai_avatar_hologram',
        name: 'AI Avatar Hologram',
        type: 'SPECIAL',
        cost: 650,
        spawnTime: 8.0,
        hp: 850,
        damage: 290,
        range: 260,
        attackSpeed: 1.4,
        speed: 124,
        size: { width: 44, height: 54 },
        color: 0x34d399,
        accentColor: 0xf0fdf4,
        bountyGold: 510,
        bountyXp: 720,
        description: 'Miễn sát thương vật lý trong 4s đầu ra sân; liên tục sao chép hiệu ứng buff của đồng minh trong bán kính 160px.',
        specialAbility: 'IMMUNE_4S_COPY_BUFF',
      },
    ],
    turrets: [
      {
        id: 'ai_emp_core',
        name: 'Trụ Xung Lượng Tử AI EMP',
        cost: 420,
        sellRefundRate: 0.7,
        range: 380,
        damage: 280,
        fireRate: 0.9,
        color: 0x059669,
        projectileSpeed: 680,
        description: 'Bắn sóng logic cao tần, khóa mục tiêu tự động và gây choáng ngắt quãng.',
      },
    ],
    ultimate: {
      id: 'ai_system_reboot',
      name: 'System Reboot (Tái Lập Điểm Kỳ Dị)',
      cooldown: 85,
      description: 'Hiệu ứng Glitch màn hình 2s: Đóng băng 2s, gây sát thương 55% máu tối đa trong vùng 800px; 30% hồi sinh lính địch tử trận làm đồng minh (tối đa 5 quân).',
      effectType: 'SYSTEM_REBOOT',
      damagePercentMaxHp: 0.55,
      wavesCount: 6,
      aoeRadius: 800,
      stunDuration: 2.0,
    },
  },
};
