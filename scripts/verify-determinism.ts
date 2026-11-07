/**
 * Script kiểm chứng tính tái hiện deterministic của mô phỏng
 * Override Math.random bằng Mulberry32 PRNG với seed xác định.
 * Chạy 2 lượt (Run A và Run B) với cùng seed 42 (10 ván mỗi lượt).
 * So sánh từng chỉ số: winner, duration, baseHp, damage, gold.
 */

import { World } from '../apps/game/src/engine/World';
import { BotAI, type BotStrategy, type BotDifficulty } from '../apps/game/src/engine/BotAI';

function createMulberry32(seed: number) {
  let s = seed >>> 0;
  return function () {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface MatchRecord {
  index: number;
  winner: string;
  duration: number;
  baseL: number;
  baseR: number;
  damageL: number;
  damageR: number;
  goldL: number;
  goldR: number;
}

function runSuiteWithSeed(masterSeed: number, count: number = 10): MatchRecord[] {
  const originalMathRandom = Math.random;
  const originalDateNow = Date.now;

  // Cố định PRNG theo seed
  const prng = createMulberry32(masterSeed);
  Math.random = prng;
  let fakeTime = 1700000000000;
  Date.now = () => (fakeTime += 16);

  const records: MatchRecord[] = [];

  try {
    for (let i = 1; i <= count; i++) {
      const world = new World(true);
      world.random = prng;
      world.setGameMode('SOLO');

      const strat: BotStrategy = i % 2 === 0 ? 'SPAM_UNITS' : 'BALANCED';
      const leftAI = new BotAI('NORMAL', 'LEFT', strat);
      world.botAI.team = 'RIGHT';
      world.botAI.setDifficulty('NORMAL');
      world.botAI.setStrategy(strat);

      const dt = 1 / 60;
      const maxTicks = 60 * 300; // 300s

      for (let tick = 0; tick < maxTicks; tick++) {
        leftAI.update(
          dt,
          world.playerEconomy,
          world.playerAge,
          world.playerTurrets,
          world.playerUltimate,
          world.playerUnits,
          world.botUnits,
          () => world.triggerUltimate('LEFT'),
          world.playerUpgrades
        );
        world.update(dt);

        if (world.status !== 'PLAYING') break;
      }

      records.push({
        index: i,
        winner: world.status,
        duration: Number(world.matchTime.toFixed(3)),
        baseL: Math.round(world.playerBaseHp),
        baseR: Math.round(world.botBaseHp),
        damageL: Math.round(world.playerTotalDamageDealt),
        damageR: Math.round(world.botTotalDamageDealt),
        goldL: Math.round(world.playerEconomy.totalGoldEarned),
        goldR: Math.round(world.botEconomy.totalGoldEarned),
      });
    }
  } finally {
    Math.random = originalMathRandom;
    Date.now = originalDateNow;
  }

  return records;
}

console.log('--- CHẠY LƯỢT 1 (RUN A, SEED 42) ---');
const runA = runSuiteWithSeed(42, 10);
console.log('--- CHẠY LƯỢT 2 (RUN B, SEED 42) ---');
const runB = runSuiteWithSeed(42, 10);

console.log('\n=== SO SÁNH TỪNG VÁN GIỮA 2 LẦN CHẠY ===');
let identicalCount = 0;

for (let i = 0; i < 10; i++) {
  const a = runA[i]!;
  const b = runB[i]!;

  const isIdentical =
    a.winner === b.winner &&
    a.duration === b.duration &&
    a.baseL === b.baseL &&
    a.baseR === b.baseR &&
    a.damageL === b.damageL &&
    a.damageR === b.damageR &&
    a.goldL === b.goldL &&
    a.goldR === b.goldR;

  if (isIdentical) identicalCount++;

  console.log(
    `Ván ${a.index}: ` +
    `Winner (${a.winner} vs ${b.winner}) | ` +
    `Dur (${a.duration}s vs ${b.duration}s) | ` +
    `DmgL (${a.damageL} vs ${b.damageL}) | ` +
    `DmgR (${a.damageR} vs ${b.damageR}) -> ` +
    `${isIdentical ? '✅ GIỐNG HỆT 100%' : '❌ KHÁC BIỆT'}`
  );
}

console.log(`\nKết quả: ${identicalCount}/10 ván giống hệt nhau bit-for-bit (Tỉ lệ trùng khớp: ${(identicalCount / 10) * 100}%)`);
