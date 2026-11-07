/**
 * Phép thử Đối Xứng Hệ Thống (Symmetry Verification Test) — PHẦN 2
 * Chạy 1000 ván Bot vs Bot cùng chiến thuật cho cả 2 phe:
 * 1. BALANCED vs BALANCED (1000 ván)
 * 2. SPAM_UNITS vs SPAM_UNITS (1000 ván)
 * 3. FOCUS_UPGRADE vs FOCUS_UPGRADE (1000 ván)
 *
 * Tiêu chí đối xứng: Winrate của mỗi phe phải nằm trong khoảng 45% - 55%.
 */

import { BotAI, type BotStrategy } from './engine/BotAI';
import { World } from './engine/World';
import { getModeMatchConfig } from './data/modes';
import { LANE_WIDTH } from './data/ages';

interface SymmetryMatchResult {
  matchIndex: number;
  winner: 'LEFT' | 'RIGHT' | 'UNFINISHED';
  durationSeconds: number;
  zeroTicksLeftPct: number;
  zeroTicksRightPct: number;
  avgFrontline: number | null;
  bothBasesDestroyed: boolean;
}

interface SymmetrySummary {
  strategy: BotStrategy;
  totalMatches: number;
  leftWins: number;
  rightWins: number;
  unfinished: number;
  bothBasesDestroyedCount: number;
  leftWinrateDecided: number;
  rightWinrateDecided: number;
  avgDuration: number;
  medianDuration: number;
  avgZeroUnitsLeft: number;
  avgZeroUnitsRight: number;
  avgFrontlineBias: number;
}

function runSymmetryMatch(
  matchIndex: number,
  strategy: BotStrategy,
  maxSeconds: number = 900
): SymmetryMatchResult {
  const world = new World(true); // Headless mode
  world.setGameMode('SOLO');
  world.setMatchConfig(getModeMatchConfig('SOLO'));

  // Cả hai phe đều dùng cùng chiến thuật và độ khó NORMAL
  const leftAI = new BotAI('NORMAL', 'LEFT', strategy);
  world.botAI.team = 'RIGHT';
  world.botAI.setDifficulty('NORMAL');
  world.botAI.setStrategy(strategy);

  const dt = 1 / 60;
  const maxTicks = Math.round(maxSeconds * 60);

  let zeroTicksLeft = 0;
  let zeroTicksRight = 0;
  const frontlineSamples: number[] = [];

  let bothBasesDestroyed = false;

  for (let tick = 0; tick < maxTicks; tick++) {
    // Lưu máu căn cứ trước tick để phát hiện cả 2 vỡ cùng tick
    const pBaseBefore = world.playerBaseHp;
    const bBaseBefore = world.botBaseHp;

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

    const leftAlive = world.playerUnits.filter((u) => u.isAlive).length;
    const rightAlive = world.botUnits.filter((u) => u.isAlive).length;

    if (leftAlive === 0) zeroTicksLeft++;
    if (rightAlive === 0) zeroTicksRight++;

    const fl = world.combatFrontlineX;
    if (fl !== null && tick % 60 === 0) {
      frontlineSamples.push(fl);
    }

    if (world.status !== 'PLAYING') {
      if (pBaseBefore > 0 && bBaseBefore > 0 && world.playerBaseHp === 0 && world.botBaseHp === 0) {
        bothBasesDestroyed = true;
      }

      const winner = world.status === 'VICTORY' ? 'LEFT' : 'RIGHT';
      const totalTicks = Math.max(1, tick + 1);

      let avgFrontline: number | null = null;
      if (frontlineSamples.length > 0) {
        avgFrontline = frontlineSamples.reduce((a, b) => a + b, 0) / frontlineSamples.length;
      }

      return {
        matchIndex,
        winner,
        durationSeconds: world.matchTime,
        zeroTicksLeftPct: Number(((zeroTicksLeft / totalTicks) * 100).toFixed(1)),
        zeroTicksRightPct: Number(((zeroTicksRight / totalTicks) * 100).toFixed(1)),
        avgFrontline,
        bothBasesDestroyed,
      };
    }
  }

  // Quá trần maxSeconds mà chưa xong
  const totalTicks = maxTicks;
  let avgFrontline: number | null = null;
  if (frontlineSamples.length > 0) {
    avgFrontline = frontlineSamples.reduce((a, b) => a + b, 0) / frontlineSamples.length;
  }

  return {
    matchIndex,
    winner: 'UNFINISHED',
    durationSeconds: world.matchTime,
    zeroTicksLeftPct: Number(((zeroTicksLeft / totalTicks) * 100).toFixed(1)),
    zeroTicksRightPct: Number(((zeroTicksRight / totalTicks) * 100).toFixed(1)),
    avgFrontline,
    bothBasesDestroyed: false,
  };
}

export function testStrategySymmetry(
  strategy: BotStrategy,
  matchCount: number = 1000,
  maxSeconds: number = 900
): SymmetrySummary {
  console.log(`\n======================================================================`);
  console.log(`⚔️ ĐANG CHẠY PHÉP THỬ ĐỐI XỨNG: [${strategy}] vs [${strategy}] (${matchCount} TRẬN)`);
  console.log(`======================================================================`);

  const results: SymmetryMatchResult[] = [];
  const start = Date.now();

  for (let i = 1; i <= matchCount; i++) {
    const res = runSymmetryMatch(i, strategy, maxSeconds);
    results.push(res);
    if (i % 250 === 0 || i === matchCount) {
      console.log(`   [Tiến độ: ${i}/${matchCount}] Trận ${i}: Kết quả ${res.winner} (${res.durationSeconds.toFixed(1)}s)`);
    }
  }

  const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`⏱️ Hoàn thành sau ${elapsedSec}s (~${(matchCount / Number(elapsedSec)).toFixed(0)} trận/s)`);

  const leftWins = results.filter((r) => r.winner === 'LEFT').length;
  const rightWins = results.filter((r) => r.winner === 'RIGHT').length;
  const unfinished = results.filter((r) => r.winner === 'UNFINISHED').length;
  const bothBasesCount = results.filter((r) => r.bothBasesDestroyed).length;

  const decidedCount = leftWins + rightWins;
  const leftWinrate = decidedCount > 0 ? (leftWins / decidedCount) * 100 : 0;
  const rightWinrate = decidedCount > 0 ? (rightWins / decidedCount) * 100 : 0;

  const durations = results.map((r) => r.durationSeconds).sort((a, b) => a - b);
  const avgDuration = durations.reduce((a, b) => a + b, 0) / matchCount;
  const medianDuration = durations[Math.floor(durations.length * 0.5)] || 0;

  const avgZeroLeft = results.reduce((a, r) => a + r.zeroTicksLeftPct, 0) / matchCount;
  const avgZeroRight = results.reduce((a, r) => a + r.zeroTicksRightPct, 0) / matchCount;

  const validFl = results.filter((r) => r.avgFrontline !== null);
  const overallFl =
    validFl.length > 0
      ? validFl.reduce((a, r) => a + r.avgFrontline!, 0) / validFl.length
      : LANE_WIDTH / 2;
  const frontlineBias = overallFl - LANE_WIDTH / 2;

  const summary: SymmetrySummary = {
    strategy,
    totalMatches: matchCount,
    leftWins,
    rightWins,
    unfinished,
    bothBasesDestroyedCount: bothBasesCount,
    leftWinrateDecided: Number(leftWinrate.toFixed(1)),
    rightWinrateDecided: Number(rightWinrate.toFixed(1)),
    avgDuration: Number(avgDuration.toFixed(1)),
    medianDuration: Number(medianDuration.toFixed(1)),
    avgZeroUnitsLeft: Number(avgZeroLeft.toFixed(1)),
    avgZeroUnitsRight: Number(avgZeroRight.toFixed(1)),
    avgFrontlineBias: Number(frontlineBias.toFixed(1)),
  };

  console.log(`\n📊 KẾT QUẢ [${strategy} vs ${strategy}]:`);
  console.log(`- Phe Trái (Left) Thắng:   ${leftWins} trận (${summary.leftWinrateDecided}% trên các ván phân định)`);
  console.log(`- Phe Phải (Right) Thắng:  ${rightWins} trận (${summary.rightWinrateDecided}% trên các ván phân định)`);
  console.log(`- Chưa xong (UNFINISHED):  ${unfinished} trận (${((unfinished / matchCount) * 100).toFixed(1)}%)`);
  console.log(`- Vỡ 2 base cùng 1 tick:   ${bothBasesCount} trận`);
  console.log(`- Thời lượng trung vị:     ${summary.medianDuration}s (TB: ${summary.avgDuration}s)`);
  console.log(`- % Trống quân Phe Trái:   ${summary.avgZeroUnitsLeft}%`);
  console.log(`- % Trống quân Phe Phải:   ${summary.avgZeroUnitsRight}%`);
  console.log(`- Độ lệch tiền tuyến:      ${summary.avgFrontlineBias > 0 ? '+' : ''}${summary.avgFrontlineBias} px (Tâm sân: ${LANE_WIDTH / 2} px)`);

  const isSymmetric = leftWinrate >= 45 && leftWinrate <= 55;
  console.log(
    isSymmetric
      ? `✅ ĐẠT CHUẨN ĐỐI XỨNG: Winrate trong khoảng [45% - 55%]`
      : `❌ BẤT ĐỐI XỨNG: Winrate lệch ngoài [45% - 55%] (Nghiêng về ${leftWinrate > 55 ? 'Phe Trái' : 'Phe Phải'})`
  );

  return summary;
}

export function runFullSymmetrySuite() {
  console.log('======================================================================');
  console.log('🔬 KHỞI ĐỘNG BỘ TEST ĐỐI XỨNG TOÀN DIỆN (3.000 TRẬN)');
  console.log('======================================================================');

  const s1 = testStrategySymmetry('BALANCED', 1000);
  const s2 = testStrategySymmetry('SPAM_UNITS', 1000);
  const s3 = testStrategySymmetry('FOCUS_UPGRADE', 1000);

  console.log('\n======================================================================');
  console.log('🏆 TỔNG HỢP KẾT QUẢ ĐỐI XỨNG (3 MATCHUPS):');
  console.log('======================================================================');
  console.table([s1, s2, s3]);
}

if (process.argv[1]?.endsWith('symmetryTest.ts')) {
  runFullSymmetrySuite();
}
