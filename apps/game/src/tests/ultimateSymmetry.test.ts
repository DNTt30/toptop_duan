import { describe, it, expect } from 'vitest';
import { UltimateManager } from '../engine/Ultimate';
import { mirrorX } from '../engine/symmetry';
import { AGES_DATA, LANE_WIDTH } from '../data/ages';
import { Unit } from '../engine/Unit';

describe('Bước 3: Vùng rơi và tầm Ultimate (Ultimate.ts) đối xứng gương hoàn hảo', () => {
  it('Tọa độ vùng rơi ngẫu nhiên khi không có quân địch đối xứng gương qua trục giữa', () => {
    const leftUlti = new UltimateManager('LEFT');
    const rightUlti = new UltimateManager('RIGHT');

    // Cùng một chuỗi số ngẫu nhiên giả lập
    const pseudoRandom = () => 0.42;
    leftUlti.random = pseudoRandom;
    rightUlti.random = pseudoRandom;

    const resLeft = leftUlti.trigger(3, [], () => {}); // Age 3: Cannonade
    const resRight = rightUlti.trigger(3, [], () => {});

    expect(resLeft.success).toBe(true);
    expect(resRight.success).toBe(true);

    const shellsLeft = resLeft.barrageShells!;
    const shellsRight = resRight.barrageShells!;
    expect(shellsLeft.length).toBe(shellsRight.length);

    for (let i = 0; i < shellsLeft.length; i++) {
      const sl = shellsLeft[i]!;
      const sr = shellsRight[i]!;

      // Phép chiếu gương đối xứng chính xác qua tâm sân: mirrorX(x) = LANE_WIDTH - x
      expect(mirrorX(sl.targetX)).toBeCloseTo(sr.targetX, 4);
      expect(mirrorX(sl.startX)).toBeCloseTo(sr.startX, 4);
      expect(sl.delay).toBeCloseTo(sr.delay, 4);
      expect(sl.speed).toBeCloseTo(sr.speed, 4);
    }
  });

  it('Tọa độ vùng rơi ngẫu nhiên nhắm vào cụm quân địch đối xứng gương qua trục giữa', () => {
    const leftUlti = new UltimateManager('LEFT');
    const rightUlti = new UltimateManager('RIGHT');

    // Lập một PRNG xác định cho cả 2 bên
    const createPrng = (seed: number) => {
      let s = seed;
      return () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
      };
    };

    leftUlti.random = createPrng(12345);
    rightUlti.random = createPrng(12345);

    // Tạo 2 nhóm quân địch đối xứng gương hoàn hảo
    const unitConfig = AGES_DATA[1]!.units[0]!;
    const enemyRight1 = new Unit('r1', unitConfig, 'RIGHT', 3000);
    const enemyRight2 = new Unit('r2', unitConfig, 'RIGHT', 3200);

    const enemyLeft1 = new Unit('l1', unitConfig, 'LEFT', mirrorX(3000));
    const enemyLeft2 = new Unit('l2', unitConfig, 'LEFT', mirrorX(3200));

    // Left cast vào enemiesRight; Right cast vào enemiesLeft
    const resLeft = leftUlti.trigger(3, [enemyRight1, enemyRight2], () => {});
    const resRight = rightUlti.trigger(3, [enemyLeft1, enemyLeft2], () => {});

    expect(resLeft.success).toBe(true);
    expect(resRight.success).toBe(true);

    const shellsLeft = resLeft.barrageShells!;
    const shellsRight = resRight.barrageShells!;

    for (let i = 0; i < shellsLeft.length; i++) {
      const sl = shellsLeft[i]!;
      const sr = shellsRight[i]!;

      expect(mirrorX(sl.targetX)).toBeCloseTo(sr.targetX, 4);
      expect(mirrorX(sl.startX)).toBeCloseTo(sr.startX, 4);
      expect(sl.delay).toBeCloseTo(sr.delay, 4);
      expect(sl.speed).toBeCloseTo(sr.speed, 4);
    }
  });

  it('Kỷ nguyên 6: System Reboot khóa mục tiêu đối xứng gương qua tâm', () => {
    const leftUlti = new UltimateManager('LEFT');
    const rightUlti = new UltimateManager('RIGHT');

    const unitConfig = AGES_DATA[1]!.units[0]!;
    // Địch của Left là quân Right tại x=2800
    const enemyRight = new Unit('r1', unitConfig, 'RIGHT', 2800);
    // Địch của Right là quân Left tại x=mirrorX(2800)=1680
    const enemyLeft = new Unit('l1', unitConfig, 'LEFT', mirrorX(2800));

    let leftDamagedTargetX = -1;
    let rightDamagedTargetX = -1;

    leftUlti.trigger(6, [enemyRight], (target) => {
      leftDamagedTargetX = target.x;
    });

    rightUlti.trigger(6, [enemyLeft], (target) => {
      rightDamagedTargetX = target.x;
    });

    expect(leftDamagedTargetX).toBe(2800);
    expect(rightDamagedTargetX).toBe(mirrorX(2800));
    expect(mirrorX(leftDamagedTargetX)).toBe(rightDamagedTargetX);
  });
});
