/**
 * The Singularity Odyssey — Headless Bot vs Bot Simulation
 * Tự động chạy hàng trăm/nghìn trận đấu giữa các trường phái chiến thuật:
 * - SPAM_UNITS: Chỉ mua lính liên tục, không bao giờ mua nâng cấp.
 * - FOCUS_UPGRADE: Tích cực mua nâng cấp lính và tháp tối đa trước.
 * - BALANCED: Cân bằng giữa mua lính và mua nâng cấp khi có thặng dư vàng.
 *
 * Đọc cấu hình luật trận đấu trực tiếp từ `data/modes.ts` (không hardcode hằng số riêng).
 * Hỗ trợ tham số dòng lệnh CLI:
 *   --maxSeconds=<sec> (mặc định 900)
 *   --profile=<solo|live> (mặc định solo)
 *   --matches=<num> (mặc định 1000)
 */

import { BotAI, type BotDifficulty, type BotStrategy } from './engine/BotAI';
import { World, type MatchEndReason } from './engine/World';
import { getModeMatchConfig, type GameMode } from './data/modes';

export interface MatchMetrics {
  matchIndex: number;
  winner: 'LEFT' | 'RIGHT' | 'DRAW';
  durationSeconds: number;
  endReason: MatchEndReason;
  wasStalled: boolean;
  leftAge: number;
  rightAge: number;
  leftGoldEarned: number;
  leftGoldSpent: number;
  rightGoldEarned: number;
  rightGoldSpent: number;
  leftUpgrades: number;
  rightUpgrades: number;
  leftStrategy: BotStrategy;
  rightStrategy: BotStrategy;
}

export interface SimOptions {
  maxSeconds: number;
  profile: GameMode;
  totalMatches: number;
}

export function parseCliArgs(): SimOptions {
  const args = process.argv.slice(2);
  let maxSeconds = 900;
  let profile: GameMode = 'SOLO';
  let totalMatches = 1000;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--maxSeconds' && args[i + 1]) {
      maxSeconds = Number(args[++i]) || 900;
    } else if (arg.startsWith('--maxSeconds=')) {
      maxSeconds = Number(arg.split('=')[1]) || 900;
    } else if (arg === '--profile' && args[i + 1]) {
      const p = args[++i]!.toUpperCase();
      profile = p === 'LIVE' ? 'LIVE' : 'SOLO';
    } else if (arg.startsWith('--profile=')) {
      const p = arg.split('=')[1]!.toUpperCase();
      profile = p === 'LIVE' ? 'LIVE' : 'SOLO';
    } else if (arg === '--matches' && args[i + 1]) {
      totalMatches = Number(args[++i]) || 1000;
    } else if (arg.startsWith('--matches=')) {
      totalMatches = Number(arg.split('=')[1]) || 1000;
    }
  }

  return { maxSeconds, profile, totalMatches };
}

export function runSingleMatch(
  matchIndex: number,
  leftDifficulty: BotDifficulty,
  rightDifficulty: BotDifficulty,
  leftStrategy: BotStrategy,
  rightStrategy: BotStrategy,
  options: { maxSeconds: number; profile: GameMode }
): MatchMetrics {
  const world = new World(true); // Headless mode (zero audio, zero DOM)

  // Đồng bộ cấu hình chế độ và luật từ đúng nguồn modes.ts
  world.setGameMode(options.profile);
  const modeConfig = getModeMatchConfig(options.profile);
  world.setMatchConfig(modeConfig);

  const leftAI = new BotAI(leftDifficulty, 'LEFT', leftStrategy);
  world.botAI.team = 'RIGHT';
  world.botAI.setDifficulty(rightDifficulty);
  world.botAI.setStrategy(rightStrategy);

  const dt = 1 / 60; // 60 ticks/s
  const maxTicks = Math.round(options.maxSeconds * 60);

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

    if (world.status !== 'PLAYING') {
      const winner: 'LEFT' | 'RIGHT' | 'DRAW' =
        world.status === 'VICTORY' ? 'LEFT' : world.status === 'DEFEAT' ? 'RIGHT' : 'DRAW';
      return {
        matchIndex,
        winner,
        durationSeconds: world.matchTime,
        endReason: world.endReason || 'BASE_DESTROYED',
        wasStalled: world.hasEverStalled,
        leftAge: world.playerAge.currentAge,
        rightAge: world.botAge.currentAge,
        leftGoldEarned: world.playerEconomy.totalGoldEarned,
        leftGoldSpent: world.playerEconomy.totalGoldSpent,
        rightGoldEarned: world.botEconomy.totalGoldEarned,
        rightGoldSpent: world.botEconomy.totalGoldSpent,
        leftUpgrades: world.playerUpgrades.totalUpgradesPurchased,
        rightUpgrades: world.botUpgrades.totalUpgradesPurchased,
        leftStrategy,
        rightStrategy,
      };
    }
  }

  // Khi hết trần maxSeconds: KHÔNG tự phân thắng thua theo máu/cấp/XP.
  // Ghi nhận endReason = UNFINISHED và kết quả là DRAW.
  return {
    matchIndex,
    winner: 'DRAW',
    durationSeconds: world.matchTime,
    endReason: 'UNFINISHED',
    wasStalled: world.hasEverStalled,
    leftAge: world.playerAge.currentAge,
    rightAge: world.botAge.currentAge,
    leftGoldEarned: world.playerEconomy.totalGoldEarned,
    leftGoldSpent: world.playerEconomy.totalGoldSpent,
    rightGoldEarned: world.botEconomy.totalGoldEarned,
    rightGoldSpent: world.botEconomy.totalGoldSpent,
    leftUpgrades: world.playerUpgrades.totalUpgradesPurchased,
    rightUpgrades: world.botUpgrades.totalUpgradesPurchased,
    leftStrategy,
    rightStrategy,
  };
}

export function runSimulationSuite(customOptions?: Partial<SimOptions>): MatchMetrics[] {
  const cliOptions = parseCliArgs();
  const options: SimOptions = { ...cliOptions, ...customOptions };

  console.log(`======================================================================`);
  console.log(`🚀 BẮT ĐẦU CHẠY MÔ PHỎNG HEADLESS ${options.totalMatches} TRẬN KIỂM CHỨNG CÂN BẰNG`);
  console.log(`- Profile: ${options.profile} | Trần tối đa: ${options.maxSeconds}s | modes.ts config sync`);
  console.log(`======================================================================\n`);

  const startTime = Date.now();
  const allMatches: MatchMetrics[] = [];

  for (let i = 1; i <= options.totalMatches; i++) {
    let leftStrat: BotStrategy = 'BALANCED';
    let rightStrat: BotStrategy = 'BALANCED';

    if (i <= options.totalMatches * 0.25) {
      leftStrat = 'BALANCED';
      rightStrat = 'BALANCED';
    } else if (i <= options.totalMatches * 0.5) {
      if (i % 2 === 0) {
        leftStrat = 'SPAM_UNITS';
        rightStrat = 'FOCUS_UPGRADE';
      } else {
        leftStrat = 'FOCUS_UPGRADE';
        rightStrat = 'SPAM_UNITS';
      }
    } else if (i <= options.totalMatches * 0.75) {
      if (i % 2 === 0) {
        leftStrat = 'SPAM_UNITS';
        rightStrat = 'BALANCED';
      } else {
        leftStrat = 'BALANCED';
        rightStrat = 'SPAM_UNITS';
      }
    } else {
      if (i % 2 === 0) {
        leftStrat = 'FOCUS_UPGRADE';
        rightStrat = 'BALANCED';
      } else {
        leftStrat = 'BALANCED';
        rightStrat = 'FOCUS_UPGRADE';
      }
    }

    const match = runSingleMatch(i, 'NORMAL', 'NORMAL', leftStrat, rightStrat, {
      maxSeconds: options.maxSeconds,
      profile: options.profile,
    });
    allMatches.push(match);

    if (i % 200 === 0 || i === options.totalMatches) {
      console.log(`[Tiến độ: ${i}/${options.totalMatches}] Trận ${i}: ${leftStrat} vs ${rightStrat} -> Kết quả: ${match.winner} (${match.endReason})`);
    }
  }

  const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);

  // 1. Thống kê thời lượng (Average, Median p50, p90)
  const durations = allMatches.map((m) => m.durationSeconds);
  const totalDuration = durations.reduce((acc, d) => acc + d, 0);
  const avgDuration = (totalDuration / options.totalMatches).toFixed(1);

  const sortedDurations = [...durations].sort((a, b) => a - b);
  const medianDuration = (sortedDurations[Math.floor(sortedDurations.length * 0.5)] || 0).toFixed(1);
  const p90Duration = (sortedDurations[Math.floor(sortedDurations.length * 0.9)] || 0).toFixed(1);

  // 2. Thống kê theo lý do kết thúc trận (endReason)
  const reasonCounts: Record<MatchEndReason, number> = {
    BASE_DESTROYED: 0,
    STALL_DRAIN: 0,
    TIMEOUT: 0,
    DRAW: 0,
    UNFINISHED: 0,
  };
  let drawsCount = 0;
  let stalledMatchesCount = 0;

  for (const m of allMatches) {
    reasonCounts[m.endReason] = (reasonCounts[m.endReason] || 0) + 1;
    if (m.winner === 'DRAW') drawsCount++;
    if (m.wasStalled) stalledMatchesCount++;
  }

  // 3. Tỷ lệ thắng từng chiến thuật CHỈ TÍNH TRÊN CÁC VÁN BASE_DESTROYED
  const baseDestroyedMatches = allMatches.filter((m) => m.endReason === 'BASE_DESTROYED');

  interface StratStats {
    matchesDecided: number;
    wins: number;
    losses: number;
    totalUpgrades: number;
    totalGoldEarned: number;
    totalGoldSpent: number;
  }

  const stratStats: Record<BotStrategy, StratStats> = {
    SPAM_UNITS: { matchesDecided: 0, wins: 0, losses: 0, totalUpgrades: 0, totalGoldEarned: 0, totalGoldSpent: 0 },
    FOCUS_UPGRADE: { matchesDecided: 0, wins: 0, losses: 0, totalUpgrades: 0, totalGoldEarned: 0, totalGoldSpent: 0 },
    BALANCED: { matchesDecided: 0, wins: 0, losses: 0, totalUpgrades: 0, totalGoldEarned: 0, totalGoldSpent: 0 },
  };

  // Tính số liệu cho toàn bộ các trận để đo Gold & Upgrades
  for (const m of allMatches) {
    stratStats[m.leftStrategy].totalUpgrades += m.leftUpgrades;
    stratStats[m.leftStrategy].totalGoldEarned += m.leftGoldEarned;
    stratStats[m.leftStrategy].totalGoldSpent += m.leftGoldSpent;

    stratStats[m.rightStrategy].totalUpgrades += m.rightUpgrades;
    stratStats[m.rightStrategy].totalGoldEarned += m.rightGoldEarned;
    stratStats[m.rightStrategy].totalGoldSpent += m.rightGoldSpent;
  }

  // Chỉ tính Win/Loss trên tập BASE_DESTROYED
  for (const m of baseDestroyedMatches) {
    stratStats[m.leftStrategy].matchesDecided++;
    stratStats[m.rightStrategy].matchesDecided++;

    if (m.winner === 'LEFT') {
      stratStats[m.leftStrategy].wins++;
      stratStats[m.rightStrategy].losses++;
    } else if (m.winner === 'RIGHT') {
      stratStats[m.rightStrategy].wins++;
      stratStats[m.leftStrategy].losses++;
    }
  }

  console.log(`\n======================================================================`);
  console.log(`📊 KẾT QUẢ ĐO ĐẠC HỆ THỐNG SAU ${options.totalMatches} TRẬN ĐẤU`);
  console.log(`======================================================================`);
  console.log(`⏱️ Thời gian mô phỏng: ${elapsedSeconds}s (~${(options.totalMatches / Number(elapsedSeconds)).toFixed(0)} trận/s)`);
  console.log(`⏳ Thời lượng trận:`);
  console.log(`   - Trung bình (Mean):   ${avgDuration}s`);
  console.log(`   - Trung vị (Median):  ${medianDuration}s`);
  console.log(`   - Phân vị p90:         ${p90Duration}s\n`);

  console.log(`🏁 PHÂN TÍCH LÝ DO KẾT THÚC TRẬN (END REASON):`);
  console.log(`- BASE_DESTROYED (Căn cứ bị phá):  ${((reasonCounts.BASE_DESTROYED / options.totalMatches) * 100).toFixed(1)}% (${reasonCounts.BASE_DESTROYED}/${options.totalMatches} trận)`);
  console.log(`- STALL_DRAIN (Rút cạn bế tắc):   ${((reasonCounts.STALL_DRAIN / options.totalMatches) * 100).toFixed(1)}% (${reasonCounts.STALL_DRAIN}/${options.totalMatches} trận)`);
  console.log(`- TIMEOUT (Hết giờ theo luật):    ${((reasonCounts.TIMEOUT / options.totalMatches) * 100).toFixed(1)}% (${reasonCounts.TIMEOUT}/${options.totalMatches} trận)`);
  console.log(`- DRAW (Hòa kết thúc):            ${((reasonCounts.DRAW / options.totalMatches) * 100).toFixed(1)}% (${reasonCounts.DRAW}/${options.totalMatches} trận)`);
  console.log(`- UNFINISHED (Chưa xong tại ${options.maxSeconds}s): ${((reasonCounts.UNFINISHED / options.totalMatches) * 100).toFixed(1)}% (${reasonCounts.UNFINISHED}/${options.totalMatches} trận) [BÁO RIÊNG - LOẠI KHỎI WINRATE]`);
  console.log(`- Tổng % Ván Hòa (Tất cả lý do):   ${((drawsCount / options.totalMatches) * 100).toFixed(1)}% (${drawsCount}/${options.totalMatches} trận)\n`);

  console.log(`📈 HIỆU QUẢ CHIẾN THUẬT (CHỈ TÍNH TRÊN ${baseDestroyedMatches.length} VÁN BASE_DESTROYED):`);
  for (const [strat, stat] of Object.entries(stratStats) as [BotStrategy, StratStats][]) {
    const winRate = stat.matchesDecided > 0 ? ((stat.wins / stat.matchesDecided) * 100).toFixed(1) : '0.0';
    const avgUpgrades = (stat.totalUpgrades / options.totalMatches).toFixed(1);
    const avgGoldSpent = Math.round(stat.totalGoldSpent / options.totalMatches);
    console.log(
      `- Chiến thuật [${strat}]: Thắng ${winRate}% (${stat.wins}/${stat.matchesDecided} ván phân định) | Nâng cấp TB: ${avgUpgrades}/trận | Tiêu: ${avgGoldSpent}G`
    );
  }

  console.log(`======================================================================\n`);
  return allMatches;
}

// Chạy trực tiếp khi gọi qua CLI
if (import.meta.url.startsWith('file:') && process.argv[1]?.includes('sim')) {
  runSimulationSuite();
}
