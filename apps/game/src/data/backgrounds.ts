/**
 * The Singularity Odyssey — Cấu hình Bối Cảnh Parallax 4 Lớp Cho 6 Kỷ Nguyên
 * 100% vẽ bằng PIXI.Graphics procedural (Zero ảnh ngoài).
 */

export interface BackgroundPalette {
  skyGradient: [number, number]; // [topColor, bottomColor]
  sunMoonColor?: number;
  farMountainColor: number;
  midHillsColor: number;
  groundSurfaceColor: number;
  groundBaseColor: number;
  accentDetailColor: number;
  frontlineColor: number;
}

export interface BackgroundConfig {
  ageId: number;
  name: string;
  palette: BackgroundPalette;
  // Chi tiết đặc thù của từng kỷ nguyên
  landmarks: {
    type: 'VOLCANO' | 'CASTLE' | 'WINDMILL_CHURCH' | 'SKYSCRAPERS' | 'FLYING_CARS' | 'MATRIX_DATA_PILLARS';
    cloudColor: number;
  };
}

export const BACKGROUNDS_DATA: Record<number, BackgroundConfig> = {
  // 1. TIỀN SỬ: Núi lửa, khói bụi, cây dương xỉ cổ đại, mây nguyên thủy
  1: {
    ageId: 1,
    name: 'Tiền Sử',
    palette: {
      skyGradient: [0x2c1004, 0x7c2d12],
      sunMoonColor: 0xf97316,
      farMountainColor: 0x451a03,
      midHillsColor: 0x271005,
      groundSurfaceColor: 0x78350f,
      groundBaseColor: 0x451a03,
      accentDetailColor: 0x15803d, // Dương xỉ xanh lá
      frontlineColor: 0xf59e0b,
    },
    landmarks: {
      type: 'VOLCANO',
      cloudColor: 0x573422,
    },
  },

  // 2. TRUNG CỔ: Rừng núi, lâu đài đá xa xôi, đồi cỏ cờ trận
  2: {
    ageId: 2,
    name: 'Trung Cổ',
    palette: {
      skyGradient: [0x0f172a, 0x1e293b],
      sunMoonColor: 0xe2e8f0,
      farMountainColor: 0x1e293b,
      midHillsColor: 0x0f172a,
      groundSurfaceColor: 0x1e3a5f,
      groundBaseColor: 0x0f172a,
      accentDetailColor: 0x22c55e, // Cỏ xanh mướt
      frontlineColor: 0x38bdf8,
    },
    landmarks: {
      type: 'CASTLE',
      cloudColor: 0x334155,
    },
  },

  // 3. PHỤC HƯNG: Hoàng hôn châu Âu, nhà thờ mái vòm, cối xay gió
  3: {
    ageId: 3,
    name: 'Phục Hưng',
    palette: {
      skyGradient: [0x4c0519, 0x831843],
      sunMoonColor: 0xfde047,
      farMountainColor: 0x500724,
      midHillsColor: 0x380419,
      groundSurfaceColor: 0x701a75,
      groundBaseColor: 0x4a044e,
      accentDetailColor: 0xfbbf24, // Hoa vàng, đá hoa cương
      frontlineColor: 0xf43f5e,
    },
    landmarks: {
      type: 'WINDMILL_CHURCH',
      cloudColor: 0x701a75,
    },
  },

  // 4. HIỆN ĐẠI: Thành phố chọc trời, sương khói công nghiệp, đường nhựa
  4: {
    ageId: 4,
    name: 'Hiện Đại',
    palette: {
      skyGradient: [0x020617, 0x0f172a],
      sunMoonColor: 0x94a3b8,
      farMountainColor: 0x0f172a,
      midHillsColor: 0x020617,
      groundSurfaceColor: 0x1e293b,
      groundBaseColor: 0x0b1120,
      accentDetailColor: 0xef4444, // Đèn tín hiệu đỏ
      frontlineColor: 0x10b981,
    },
    landmarks: {
      type: 'SKYSCRAPERS',
      cloudColor: 0x1e293b,
    },
  },

  // 5. TƯƠNG LAI: Cyberpunk neon, xe bay lơ lửng, cầu plasma
  5: {
    ageId: 5,
    name: 'Tương Lai',
    palette: {
      skyGradient: [0x050515, 0x1e1035],
      sunMoonColor: 0xec4899,
      farMountainColor: 0x150b28,
      midHillsColor: 0x0d061a,
      groundSurfaceColor: 0x083344,
      groundBaseColor: 0x03151f,
      accentDetailColor: 0x06b6d4, // Viền neon lam
      frontlineColor: 0x22d3ee,
    },
    landmarks: {
      type: 'FLYING_CARS',
      cloudColor: 0x3b0764,
    },
  },

  // 6. KỶ NGUYÊN AI: Lưới ma trận Matrix vô cực, cột dữ liệu xanh ngọc
  6: {
    ageId: 6,
    name: 'Kỷ Nguyên AI',
    palette: {
      skyGradient: [0x02110c, 0x04241a],
      sunMoonColor: 0x10b981,
      farMountainColor: 0x021f16,
      midHillsColor: 0x01140e,
      groundSurfaceColor: 0x022c22,
      groundBaseColor: 0x011b15,
      accentDetailColor: 0x34d399, // Mạch bán dẫn phát quang
      frontlineColor: 0x10b981,
    },
    landmarks: {
      type: 'MATRIX_DATA_PILLARS',
      cloudColor: 0x064e3b,
    },
  },
};
