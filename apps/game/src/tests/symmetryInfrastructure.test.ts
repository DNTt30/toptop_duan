import { describe, expect, it } from 'vitest';
import { BASE_WIDTH, LANE_WIDTH } from '../data/ages';
import {
  distanceFromEnemyBase,
  distanceFromOwnBase,
  fractionFromOwnBase,
  mirrorX,
  xFromOwnBaseFraction,
} from '../engine/symmetry';

describe('BƯỚC 1: Hạ Tầng Đối Xứng (Symmetry Infrastructure)', () => {
  const leftBaseX = BASE_WIDTH; // 140
  const rightBaseX = LANE_WIDTH - BASE_WIDTH; // 4340
  const centerX = LANE_WIDTH / 2; // 2240

  it('1. mirrorX phản chiếu gương qua tâm sân và thỏa mãn tính chất đảo ngược (Invertible)', () => {
    expect(mirrorX(leftBaseX)).toBe(rightBaseX);
    expect(mirrorX(rightBaseX)).toBe(leftBaseX);
    expect(mirrorX(centerX)).toBe(centerX);

    const testPoints = [0, 100, 500, 1500, 2240, 3100, 4480];
    for (const p of testPoints) {
      expect(mirrorX(mirrorX(p))).toBe(p);
    }
  });

  it('2. distanceFromOwnBase và distanceFromEnemyBase đối xứng hoàn toàn giữa hai phe', () => {
    // Tại căn cứ nhà
    expect(distanceFromOwnBase('LEFT', leftBaseX)).toBe(0);
    expect(distanceFromOwnBase('RIGHT', rightBaseX)).toBe(0);

    // Tại căn cứ địch
    expect(distanceFromEnemyBase('LEFT', rightBaseX)).toBe(0);
    expect(distanceFromEnemyBase('RIGHT', leftBaseX)).toBe(0);

    // Tại tâm sân: khoảng cách đến căn cứ nhà của hai phe phải bằng nhau tuyệt đối
    expect(distanceFromOwnBase('LEFT', centerX)).toBe(distanceFromOwnBase('RIGHT', centerX));
    expect(distanceFromEnemyBase('LEFT', centerX)).toBe(distanceFromEnemyBase('RIGHT', centerX));

    // Điểm dời 500px từ căn cứ nhà
    const leftAdv500 = leftBaseX + 500;
    const rightAdv500 = rightBaseX - 500;
    expect(distanceFromOwnBase('LEFT', leftAdv500)).toBe(500);
    expect(distanceFromOwnBase('RIGHT', rightAdv500)).toBe(500);
    expect(distanceFromEnemyBase('LEFT', leftAdv500)).toBe(distanceFromEnemyBase('RIGHT', rightAdv500));
  });

  it('3. fractionFromOwnBase và xFromOwnBaseFraction chuyển đổi 2 chiều chính xác', () => {
    expect(fractionFromOwnBase('LEFT', leftBaseX)).toBeCloseTo(0, 5);
    expect(fractionFromOwnBase('RIGHT', rightBaseX)).toBeCloseTo(0, 5);

    expect(fractionFromOwnBase('LEFT', centerX)).toBeCloseTo(0.5, 5);
    expect(fractionFromOwnBase('RIGHT', centerX)).toBeCloseTo(0.5, 5);

    expect(fractionFromOwnBase('LEFT', rightBaseX)).toBeCloseTo(1.0, 5);
    expect(fractionFromOwnBase('RIGHT', leftBaseX)).toBeCloseTo(1.0, 5);

    // Kiểm tra round-trip 2 chiều
    const fractions = [0.0, 0.25, 0.33, 0.5, 0.75, 1.0];
    for (const f of fractions) {
      const leftX = xFromOwnBaseFraction('LEFT', f);
      const rightX = xFromOwnBaseFraction('RIGHT', f);

      // Tọa độ của Right phải là gương của Left
      expect(mirrorX(leftX)).toBeCloseTo(rightX, 5);

      expect(fractionFromOwnBase('LEFT', leftX)).toBeCloseTo(f, 5);
      expect(fractionFromOwnBase('RIGHT', rightX)).toBeCloseTo(f, 5);
    }
  });
});
