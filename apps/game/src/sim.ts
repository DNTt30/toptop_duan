/**
 * The Singularity Odyssey — Headless Bot vs Bot Simulation (1000 Matches)
 * Chạy 1000 trận đấu tự động giữa các trường phái chiến thuật:
 * - SPAM_UNITS: Chỉ mua lính liên tục, không bao giờ mua nâng cấp.
 * - FOCUS_UPGRADE: Tích cực mua nâng cấp lính và tháp tối đa trước.
 * - BALANCED: Cân bằng giữa mua lính và mua nâng cấp khi có thặng dư vàng.
 *
 * Đo đạc: Thời gian trận trung bình, Vàng thu/chi, Tần suất mua nâng cấp, Tỷ lệ thắng.
 */

import { BotAI, type BotDifficulty, type BotStrategy } from './engine/BotAI';
import { World } from './engine/World';

interface MatchMetrics {
  winner: 'LEFT' | 'RIGHT' | 'DRAW';
  durationSeconds: number;
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

function runSingleMatch(
  leftDifficulty: BotDifficulty,
  rightDifficulty: BotDifficulty,
  leftStrategy: BotStrategy,
  rightStrategy: BotStrategy,
  maxMatchSeconds: number = 360
): MatchMetrics {
  const world = new World(true); // Headless mode (zero audio, zero DOM)

  const leftAI = new BotAI(leftDifficulty, 'LEFT', leftStrategy);
  world.botAI.team = 'RIGHT';
  world.botAI.setDifficulty(rightDifficulty);
  world.botAI.setStrategy(rightStrategy);

  const dt = 1 / 60; // 60 ticks/s
  const maxTicks = maxMatchSeconds * 60;

  for (let tick = 0; tick < maxTicks; tick++) {
    // Left bot tự động ra quyết định
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
      return {
        winner: world.status === 'VICTORY' ? 'LEFT' : 'RIGHT',
        durationSeconds: world.matchTime,
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

  // Phân định thắng thua khi hết giờ dựa trên HP căn cứ và XP
  let winner: 'LEFT' | 'RIGHT' | 'DRAW' = 'DRAW';
  if (world.playerBaseHp > world.botBaseHp) {
    winner = 'LEFT';
  } else if (world.botBaseHp > world.playerBaseHp) {
    winner = 'RIGHT';
  } else if (world.playerAge.currentAge > world.botAge.currentAge) {
    winner = 'LEFT';
  } else if (world.botAge.currentAge > world.playerAge.currentAge) {
    winner = 'RIGHT';
  } else if (world.playerEconomy.xp > world.botEconomy.xp) {
    winner = 'LEFT';
  } else if (world.botEconomy.xp > world.playerEconomy.xp) {
    winner = 'RIGHT';
  }

  return {
    winner,
    durationSeconds: world.matchTime,
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

export function runSimulationSuite(totalMatches: number = 1000): void {
  console.log(`======================================================================`);
  console.log(`🚀 BẮT ĐẦU CHẠY MÔ PHỎNG HEADLESS ${totalMatches} TRẬN KIỂM CHỨNG CÂN BẰNG`);
  console.log(`======================================================================\n`);

  const startTime = Date.now();

  const allMatches: MatchMetrics[] = [];

  // Phân chia các cặp đối đầu chiến thuật:
  // 1. 250 trận: BALANCED vs BALANCED (Đối xứng nền tảng)
  // 2. 250 trận: SPAM_UNITS vs FOCUS_UPGRADE (125 lượt đi + 125 lượt về)
  // 3. 250 trận: SPAM_UNITS vs BALANCED (125 lượt đi + 125 lượt về)
  // 4. 250 trận: FOCUS_UPGRADE vs BALANCED (125 lượt đi + 125 lượt về)

  for (let i = 1; i <= totalMatches; i++) {
    let leftStrat: BotStrategy = 'BALANCED';
    let rightStrat: BotStrategy = 'BALANCED';

    if (i <= 250) {
      // Nhóm 1: Cân bằng vs Cân bằng
      leftStrat = 'BALANCED';
      rightStrat = 'BALANCED';
    } else if (i <= 500) {
      // Nhóm 2: Spam Quân vs Nâng Cấp
      if (i % 2 === 0) {
        leftStrat = 'SPAM_UNITS';
        rightStrat = 'FOCUS_UPGRADE';
      } else {
        leftStrat = 'FOCUS_UPGRADE';
        rightStrat = 'SPAM_UNITS';
      }
    } else if (i <= 750) {
      // Nhóm 3: Spam Quân vs Cân Bằng
      if (i % 2 === 0) {
        leftStrat = 'SPAM_UNITS';
        rightStrat = 'BALANCED';
      } else {
        leftStrat = 'BALANCED';
        rightStrat = 'SPAM_UNITS';
      }
    } else {
      // Nhóm 4: Nâng Cấp vs Cân Bằng
      if (i % 2 === 0) {
        leftStrat = 'FOCUS_UPGRADE';
        rightStrat = 'BALANCED';
      } else {
        leftStrat = 'BALANCED';
        rightStrat = 'FOCUS_UPGRADE';
      }
    }

    const match = runSingleMatch('NORMAL', 'NORMAL', leftStrat, rightStrat);
    allMatches.push(match);

    if (i % 200 === 0 || i === totalMatches) {
      console.log(`[Tiến độ: ${i}/${totalMatches}] Trận vừa chạy: ${leftStrat} vs ${rightStrat} -> Thắng: ${match.winner}`);
    }
  }

  const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);

  // 1. Thống kê chung
  const totalDuration = allMatches.reduce((acc, m) => acc + m.durationSeconds, 0);
  const avgDuration = (totalDuration / totalMatches).toFixed(1);

  const avgLeftGoldEarned = Math.round(allMatches.reduce((acc, m) => acc + m.leftGoldEarned, 0) / totalMatches);
  const avgLeftGoldSpent = Math.round(allMatches.reduce((acc, m) => acc + m.leftGoldSpent, 0) / totalMatches);
  const avgRightGoldEarned = Math.round(allMatches.reduce((acc, m) => acc + m.rightGoldEarned, 0) / totalMatches);
  const avgRightGoldSpent = Math.round(allMatches.reduce((acc, m) => acc + m.rightGoldSpent, 0) / totalMatches);

  // 2. Thống kê theo chiến thuật
  interface StratStats {
    matches: number;
    wins: number;
    losses: number;
    draws: number;
    totalUpgrades: number;
    totalGoldEarned: number;
    totalGoldSpent: number;
  }

  const stratStats: Record<BotStrategy, StratStats> = {
    SPAM_UNITS: { matches: 0, wins: 0, losses: 0, draws: 0, totalUpgrades: 0, totalGoldEarned: 0, totalGoldSpent: 0 },
    FOCUS_UPGRADE: { matches: 0, wins: 0, losses: 0, draws: 0, totalUpgrades: 0, totalGoldEarned: 0, totalGoldSpent: 0 },
    BALANCED: { matches: 0, wins: 0, losses: 0, draws: 0, totalUpgrades: 0, totalGoldEarned: 0, totalGoldSpent: 0 },
  };

  for (const m of allMatches) {
    // Left
    stratStats[m.leftStrategy].matches++;
    stratStats[m.leftStrategy].totalUpgrades += m.leftUpgrades;
    stratStats[m.leftStrategy].totalGoldEarned += m.leftGoldEarned;
    stratStats[m.leftStrategy].totalGoldSpent += m.leftGoldSpent;

    if (m.winner === 'LEFT') stratStats[m.leftStrategy].wins++;
    else if (m.winner === 'RIGHT') stratStats[m.leftStrategy].losses++;
    else stratStats[m.leftStrategy].draws++;

    // Right
    stratStats[m.rightStrategy].matches++;
    stratStats[m.rightStrategy].totalUpgrades += m.rightUpgrades;
    stratStats[m.rightStrategy].totalGoldEarned += m.rightGoldEarned;
    stratStats[m.rightStrategy].totalGoldSpent += m.rightGoldSpent;

    if (m.winner === 'RIGHT') stratStats[m.rightStrategy].wins++;
    else if (m.winner === 'LEFT') stratStats[m.rightStrategy].losses++;
    else stratStats[m.rightStrategy].draws++;
  }

  // 3. Phân tích đối đầu trực diện Spam vs Focus Upgrade
  const spamVsUpgradeMatches = allMatches.filter(
    (m) =>
      (m.leftStrategy === 'SPAM_UNITS' && m.rightStrategy === 'FOCUS_UPGRADE') ||
      (m.leftStrategy === 'FOCUS_UPGRADE' && m.rightStrategy === 'SPAM_UNITS')
  );
  let spamWinsVsUpgrade = 0;
  let upgradeWinsVsSpam = 0;
  for (const m of spamVsUpgradeMatches) {
    const spamTeam = m.leftStrategy === 'SPAM_UNITS' ? 'LEFT' : 'RIGHT';
    if (m.winner === spamTeam) spamWinsVsUpgrade++;
    else if (m.winner !== 'DRAW') upgradeWinsVsSpam++;
  }

  console.log(`\n======================================================================`);
  console.log(`📊 KẾT QUẢ ĐO ĐẠC HỆ THỐNG SAU ${totalMatches} TRẬN ĐẤU`);
  console.log(`======================================================================`);
  console.log(`⏱️ Thời gian mô phỏng: ${elapsedSeconds}s (~${(totalMatches / Number(elapsedSeconds)).toFixed(0)} trận/s)`);
  console.log(`⏳ Thời gian trận trung bình: ${avgDuration}s (Chuẩn thiết kế: 90 - 240s)`);
  console.log(`💰 Vàng thu / chi trung bình: Left (${avgLeftGoldEarned}G / ${avgLeftGoldSpent}G) vs Right (${avgRightGoldEarned}G / ${avgRightGoldSpent}G)\n`);

  console.log(`📈 HIỆU QUẢ THEO TỪNG CHIẾN THUẬT:`);
  for (const [strat, stat] of Object.entries(stratStats) as [BotStrategy, StratStats][]) {
    const winRate = ((stat.wins / stat.matches) * 100).toFixed(1);
    const avgUpgrades = (stat.totalUpgrades / stat.matches).toFixed(1);
    const avgGoldSpent = Math.round(stat.totalGoldSpent / stat.matches);
    console.log(
      `- Chiến thuật [${strat}]: Thắng ${winRate}% (${stat.wins}/${stat.matches} trận) | Mua trung bình ${avgUpgrades} nâng cấp/trận | Tiêu ${avgGoldSpent}G`
    );
  }

  console.log(`\n⚔️ ĐỐI ĐẦU TRỰC TIẾP [SPAM QUÂN] VS [TẬP TRUNG NÂNG CẤP] (${spamVsUpgradeMatches.length} trận):`);
  const spamWinRate = ((spamWinsVsUpgrade / spamVsUpgradeMatches.length) * 100).toFixed(1);
  const upgWinRate = ((upgradeWinsVsSpam / spamVsUpgradeMatches.length) * 100).toFixed(1);
  console.log(`- Spam Quân thắng: ${spamWinRate}% (${spamWinsVsUpgrade} trận)`);
  console.log(`- Tập trung Nâng Cấp thắng: ${upgWinRate}% (${upgradeWinsVsSpam} trận)`);

  const maxGap = Math.abs(Number(spamWinRate) - Number(upgWinRate));
  if (maxGap > 40) {
    console.log(`\n⚠️ CẢNH BÁO: Tồn tại chiến thuật áp đảo chênh lệch ${maxGap.toFixed(1)}%! Cần cân bằng lại giá hoặc chỉ số.`);
  } else {
    console.log(`\n✅ CÂN BẰNG TỐT: Không có chiến thuật nào thắng áp đảo (> 70%). Cả hai trường phái đều có cơ hội thắng tùy thời điểm.`);
  }
  console.log(`======================================================================\n`);
}

runSimulationSuite(1000);
