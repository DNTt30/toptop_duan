/**
 * The Singularity Odyssey — Cấu Hình Trung Tâm Animation, Game Feel & Hiệu Năng (CONFIG)
 * Mọi thông số đều có đơn vị rõ ràng (ms, px, deg, %, Hz, s, alpha) để tinh chỉnh trực tiếp bằng tay.
 */

export const CONFIG = {
  /** 0. Vòng lặp Fixed Timestep 60Hz & Debug */
  loop: {
    fixedHz: 60, // Tần số mô phỏng logic cố định (Hz)
    fixedStepSec: 1 / 60, // Thời lượng mỗi tick logic (s)
    maxDeltaMs: 50, // Giới hạn delta mỗi frame tối đa để tránh nhảy cóc (ms)
    maxStepsPerFrame: 2, // Giới hạn tối đa 2 step bù/frame chống spiral of death (ticks)
    dropExcessAccumulator: true, // Bỏ phần thời gian dư khi vượt quá 2 step bù thay vì cố bù
    debugToggleKey: 'F3', // Phím bật/tắt bảng hiệu năng debug
  },

  /** 1. Đòn đánh 3 pha (Anticipation / Strike / Recovery) & Lệch pha */
  attack: {
    anticipationMs: 105, // Pha lấy đà kéo gậy: 3 khung x 35ms (ms)
    strikeMs: 90, // Pha vung chém nhanh: 2 khung x 45ms (ms)
    recoveryMs: 180, // Pha thu gậy hồi chiêu: 3 khung x 60ms (ms)
    frameDurationsMs: [35, 35, 35, 45, 45, 60, 60, 60] as readonly number[], // Thời lượng từng khung 0..7 (ms)
    hitFrame: 3, // Chỉ số khung hình trừ máu & nổ VFX (0-based, đầu pha Strike)
    cooldownVariancePct: 0.12, // Biên độ random cooldown gốc của mỗi đơn vị khi spawn (±12%)
    firstHitPhaseMaxMs: 150, // Độ trễ ngẫu nhiên đòn đầu 0-150ms để 2 bên không chạm cùng frame (ms)
    perSwingJitterMs: 30, // Độ lệch ngẫu nhiên cộng thêm ở mỗi đòn đánh tiếp theo (±30ms)
    minOpponentDesyncMs: 45, // Độ lệch tối thiểu giữa 2 đơn vị đối đầu trực tiếp ở đòn đầu (ms)
    heavyEveryNHits: 3, // Chu kỳ đòn đánh nâng cấp hiệu ứng thị giác lên mức Mạnh (số đòn)
    standoffGapPx: 26, // Khoảng cách đứng giữa 2 mép sprite đối đầu: 20-30px (px)
  },

  /** 2. Hit Feedback (Hit-stop, White Flash, Knockback, Squash & Stretch, Screen Shake) */
  hitFeedback: {
    hitStopMs: 60, // Đóng băng cục bộ mặc định khi chạm đòn (ms)
    normalHitStopMs: 55, // Hit-stop cho đòn thường (ms)
    heavyHitStopMs: 85, // Hit-stop dài hơn cho đòn mạnh / crit (ms)
    killHitStopMs: 95, // Hit-stop cực đại cho đòn kết liễu (ms)
    whiteFlashMs: 80, // Thời lượng chớp trắng sprite bằng offscreen cache (ms)
    knockbackPx: 6, // Khoảng giật lùi khi trúng đòn (px)
    knockbackDurationMs: 140, // Thời gian ease-out giật lùi rồi trả về vị trí (ms)
    squashScaleX: 1.08, // Độ phình ngang khi trúng đòn / tiếp đất (tỉ lệ)
    squashScaleY: 0.92, // Độ nén dọc khi trúng đòn / tiếp đất (tỉ lệ)
    squashDurationMs: 100, // Thời gian phục hồi scale 1.08/0.92 -> 1.0 (ms)
    killShakePx: 3.0, // Rung màn hình khi hạ gục đơn vị (px)
    heavyShakePx: 2.5, // Rung màn hình cho đòn nặng / crit / Tank (px)
    shakeDurationMs: 100, // Thời gian rung chấn đòn kết liễu / đòn nặng (ms)
  },

  /** 3. Số sát thương (Floating Damage Number Pool & Auto-merge) */
  damageNumber: {
    poolSize: 30, // Số lượng node văn bản tối đa trong pool
    risePx: 35, // Quãng đường bay lên của số sát thương (px)
    lifetimeMs: 700, // Tổng thời gian tồn tại & mờ dần (ms)
    popDurationMs: 120, // Thời gian thu nhỏ pop scale 1.4 -> 1.0 (ms)
    popStartScale: 1.4, // Tỉ lệ phóng đại ban đầu khi pop (tỉ lệ)
    jitterXPx: 10, // Độ lệch ngang ngẫu nhiên (±10px)
    headOffsetYPx: 112, // Độ cao đặt phía trên đầu nhân vật tính từ mặt sàn (px)
    mergeWindowMs: 150, // Cửa sổ gộp sát thương liên tiếp trên cùng 1 mục tiêu (ms)
    dealtColor: 0xffffff, // Màu trắng cho sát thương gây ra bởi phe ta (hex)
    dealtCritColor: 0xfef08a, // Màu vàng sáng cho đòn crit gây ra (hex)
    receivedColor: 0xf87171, // Màu đỏ cho sát thương phe ta nhận vào (hex)
    baseFontSizePx: 18, // Cỡ chữ sát thương thường (px)
    critFontSizePx: 24, // Cỡ chữ sát thương crit + viền đậm hơn (px)
  },

  /** 4. Slash VFX & Hạt va chạm (Thang 3 mức: Thường / Mạnh / Kết liễu) */
  slashVfx: {
    poolSize: 24, // Số lượng hiệu ứng chém trong pool
    variants: 3, // Số biến thể hình dạng vệt chém
    rotationJitterDeg: 15, // Độ xoay ngẫu nhiên quanh điểm chạm (±15 deg)
    minLifeMs: 60, // Tuổi thọ tối thiểu của vệt chém thường (ms)
    maxLifeMs: 120, // Tuổi thọ tối đa của vệt chém (ms)
    normalMinLifeMs: 60, // Mức Thường: tuổi thọ vệt cung ngắn tối thiểu (ms)
    normalMaxLifeMs: 80, // Mức Thường: tuổi thọ vệt cung ngắn tối đa (ms)
    normalScale: 0.95, // Mức Thường: tỉ lệ kích thước vệt cung (tỉ lệ)
    normalSparkMin: 6, // Mức Thường: số tia lửa nhỏ tối thiểu (hạt)
    normalSparkMax: 7, // Mức Thường: số tia lửa nhỏ tối đa (hạt)
    heavyMinLifeMs: 85, // Mức Mạnh: tuổi thọ vệt cung to tối thiểu (ms)
    heavyMaxLifeMs: 115, // Mức Mạnh: tuổi thọ vệt cung to tối đa (ms)
    heavyScale: 1.32, // Mức Mạnh: tỉ lệ phóng đại vệt cung to hơn (tỉ lệ)
    heavySparkMin: 8, // Mức Mạnh: số tia lửa tối thiểu (hạt)
    heavySparkMax: 10, // Mức Mạnh: số tia lửa tối đa (hạt)
    killMinLifeMs: 100, // Mức Kết liễu: tuổi thọ vệt chém kết liễu tối thiểu (ms)
    killMaxLifeMs: 125, // Mức Kết liễu: tuổi thọ vệt chém kết liễu tối đa (ms)
    killScale: 1.52, // Mức Kết liễu: tỉ lệ vệt chém kết liễu cực đại (tỉ lệ)
    killSparkMin: 9, // Mức Kết liễu: số tia lửa kết liễu tối thiểu (hạt)
    killSparkMax: 10, // Mức Kết liễu: số tia lửa kết liễu tối đa (hạt)
    sparkMinCount: 6, // Số tia lửa tối thiểu mỗi lần va chạm
    sparkMaxCount: 10, // Số tia lửa tối đa mỗi lần va chạm
    sparkMinLifeMs: 200, // Tuổi thọ tia lửa tối thiểu (ms)
    sparkMaxLifeMs: 300, // Tuổi thọ tia lửa tối đa (ms)
    weaponReachOffsetPx: 28, // Độ vươn từ tâm attacker tới đầu vũ khí để đặt điểm chạm (px)
    weaponHitHeightPx: 54, // Độ cao điểm chạm vũ khí so với mặt đất (px)
  },

  /** 5. Animation Chết & Phần Thưởng Bay Bezier Về HUD */
  death: {
    animFrameCount: 9, // Số frame hoạt ảnh giật lùi -> quỵ -> ngã nằm đất (8-10 frame)
    animFps: 14, // Tốc độ phát clip DIE (fps)
    corpseHoldMs: 300, // Thời gian giữ xác nguyên alpha trên mặt đất (ms)
    corpseFadeMs: 400, // Thời gian mờ dần biến mất (ms)
    coinCountMin: 2, // Số xu vàng tối thiểu bắn ra khi hạ địch
    coinCountMax: 4, // Số xu vàng tối đa bắn ra khi hạ địch
    xpOrbCount: 2, // Số orb XP xanh bay về thanh XP
    orbFlightMs: 650, // Thời gian bay theo đường cong Bezier về HUD (ms)
    orbArcHeightPx: 115, // Độ vồng tối đa của đường cong Bezier (px)
    orbPoolSize: 40, // Giới hạn tối đa 40 hạt phần thưởng trong pool (tự gộp xu khi vượt giới hạn)
    hudPulseMs: 220, // Thời gian nhịp phóng nhẹ HUD khi xu/orb chạm tới (ms)
  },

  /** 6. Chuyển động đám đông & Nhịp bước */
  crowd: {
    speedVariancePct: 0.05, // Biên độ random tốc độ di chuyển từng cá thể (±5%)
    laneJitterYPx: 6, // Độ lệch trục Y sâu theo làn giữa các cá thể (±6px)
    separationMinGapPx: 74, // Khoảng cách tách vật lý tối thiểu cùng phe (px)
    separationVisualGapPx: 98, // Khoảng tách thị giác tối thiểu tránh chồng sprite (px)
    separationSmoothRate: 0.30, // Hệ số làm mượt dịch chuyển tách đàn (0..1)
    rearUnitDimPct: 0.08, // Độ giảm sáng cho đơn vị phía sau không giao tranh (~8%)
    rearUnitTintHex: 0xebebeb, // Màu tint tương ứng 92% độ sáng cho đơn vị phía sau (hex)
    shadowAlpha: 0.35, // Độ mờ chuẩn của bóng ellipse dưới chân (alpha)
    stepBobPx: 1.5, // Biên độ nhún cơ thể nhẹ theo từng bước chân: 1-2px (px)
    footDustIntervalFrames: 4, // Khoảng cách frame tạo bụi chạm gót (4 frame = 1 bước)
  },

  /** 7. Phân biệt phe & Thanh máu */
  teamAndHealth: {
    allyHpColor: 0x22c55e, // Màu thanh máu phe ta xanh lá (hex)
    allyAccentBlue: 0x38bdf8, // Màu xanh dương nhận diện phe P1 (hex)
    enemyHpColor: 0xef4444, // Màu thanh máu phe địch đỏ (hex)
    ghostBarDelayMs: 400, // Thời gian giữ đoạn ghost trắng trước khi tụt (ms = 0.4s)
    ghostBarDrainPerSec: 1.6, // Tốc độ tụt của ghost bar sau thời gian trễ (tỉ lệ HP/s)
    barWidthPx: 48, // Chiều rộng thanh máu trên đầu lính (px)
    barHeightPx: 6, // Chiều cao thanh máu trên đầu lính (px)
    combatBarShowMs: 2500, // Thời gian duy trì hiển thị thanh máu sau khi giao tranh (ms)
    playerArrowSizePx: 10, // Kích thước mũi tên xanh chỉ báo dưới chân đơn vị P1 (px)
    playerArrowPulseHz: 3.2, // Tần số nhấp nháy/pulse mũi tên xanh dưới chân (Hz)
    allyHeadbandColor: 0x2563eb, // Màu băng đô/vải phe P1 xanh dương (hex)
    enemyHeadbandColor: 0xdc2626, // Màu băng đô/vải phe P2 đỏ (hex)
  },

  /** 8. Độ tương phản & Bối cảnh nền */
  contrastAndBg: {
    enableBgDim: true, // Bật lớp phủ tối/giảm bão hòa nhẹ sau làn chiến đấu
    bgDimAlpha: 0.22, // Độ đậm lớp phủ tách nền khỏi nhân vật (alpha)
    enableEmbers: true, // Bật hạt tàn lửa / môi trường bay nhẹ
    emberIntervalMs: 90, // Chu kỳ thả hạt tàn lửa môi trường (ms)
    parallaxSkyFactor: 0.05, // Hệ số trôi nền trời xa
    parallaxCloudFactor: 0.08, // Hệ số trôi lớp mây
    parallaxFarFactor: 0.20, // Hệ số trôi núi xa
    parallaxMidFactor: 0.45, // Hệ số trôi cảnh quan/cây cối trung cảnh
  },

  /** 9. Giao diện HUD */
  hud: {
    minFontSizePx: 12, // Cỡ chữ tối thiểu trên HUD (px)
    radialCooldownSizePx: 44, // Đường kính vòng quét cooldown tròn trên ô đơn vị (px)
  },
} as const;

export type CombatFeelConfig = typeof CONFIG;
