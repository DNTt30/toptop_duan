import { Worker } from 'worker_threads';
import os from 'os';
import path from 'path';
import { type BotDifficulty, type BotStrategy } from '../apps/game/src/engine/BotAI';
import { type MatchOutcome, type MatchTask } from './matchWorker';

interface ScenarioConfig {
  id: string;
  name: string;
  leftDiff: BotDifficulty;
  rightDiff: BotDifficulty;
  leftStrat: BotStrategy;
  rightStrat: BotStrategy;
  matches: number;
  maxSeconds: number;
}

interface ScenarioResult {
  id: string;
  name: string;
  totalMatches: number;
  decidedMatches: number;
  leftWins: number;
  rightWins: number;
  unfinished: number;
  unfinishedPct: number;
  leftWinratePct: number;
  rightWinratePct: number;
  ci95Lower: number;
  ci95Upper: number;
  avgFrontlineBias: number;
  avgZeroUnitsLeft: number;
  avgZeroUnitsRight: number;
}

function calculateConfidenceInterval95(wins: number, totalDecided: number): { lower: number; upper: number } {
  if (totalDecided <= 0) return { lower: 0, upper: 0 };
  const p = wins / totalDecided;
  // Wilson score interval 95% (z = 1.95996)
  const z = 1.96;
  const z2 = z * z;
  const denominator = 1 + z2 / totalDecided;
  const center = (p + z2 / (2 * totalDecided)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p) + z2 / (4 * totalDecided)) / totalDecided)) / denominator;

  const lower = Math.max(0, Number(((center - half) * 100).toFixed(1)));
  const upper = Math.min(100, Number(((center + half) * 100).toFixed(1)));
  return { lower, upper };
}

async function runScenarioInParallel(
  scenario: ScenarioConfig,
  numWorkers: number
): Promise<ScenarioResult> {
  const tasksPerWorker = Math.ceil(scenario.matches / numWorkers);
  const workerPromises: Promise<MatchOutcome[]>[] = [];

  const workerScript = path.resolve(__dirname, 'matchWorker.ts');

  for (let w = 0; w < numWorkers; w++) {
    const startIdx = w * tasksPerWorker + 1;
    const endIdx = Math.min(scenario.matches, (w + 1) * tasksPerWorker);
    if (startIdx > scenario.matches) break;

    const workerTasks: MatchTask[] = [];
    for (let m = startIdx; m <= endIdx; m++) {
      workerTasks.push({
        matchIndex: m,
        leftDiff: scenario.leftDiff,
        rightDiff: scenario.rightDiff,
        leftStrat: scenario.leftStrat,
        rightStrat: scenario.rightStrat,
        maxSeconds: scenario.maxSeconds,
      });
    }

    const p = new Promise<MatchOutcome[]>((resolve, reject) => {
      const worker = new Worker(workerScript, {
        workerData: workerTasks,
        execArgv: ['--import', 'tsx'],
      });
      worker.on('message', (outcomes) => resolve(outcomes));
      worker.on('error', (err) => reject(err));
      worker.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
      });
    });

    workerPromises.push(p);
  }

  const allChunks = await Promise.all(workerPromises);
  const outcomes: MatchOutcome[] = allChunks.flat();

  const totalMatches = outcomes.length;
  const leftWins = outcomes.filter((o) => o.winner === 'LEFT').length;
  const rightWins = outcomes.filter((o) => o.winner === 'RIGHT').length;
  const unfinished = outcomes.filter((o) => o.winner === 'UNFINISHED').length;
  const decided = leftWins + rightWins;

  const leftWinrate = decided > 0 ? (leftWins / decided) * 100 : 0;
  const rightWinrate = decided > 0 ? (rightWins / decided) * 100 : 0;
  const ci = calculateConfidenceInterval95(leftWins, decided);

  const avgFrontline = outcomes.reduce((sum, o) => sum + o.frontlineBias, 0) / totalMatches;
  const avgZeroLeft = outcomes.reduce((sum, o) => sum + o.zeroTicksLeftPct, 0) / totalMatches;
  const avgZeroRight = outcomes.reduce((sum, o) => sum + o.zeroTicksRightPct, 0) / totalMatches;

  return {
    id: scenario.id,
    name: scenario.name,
    totalMatches,
    decidedMatches: decided,
    leftWins,
    rightWins,
    unfinished,
    unfinishedPct: Number(((unfinished / totalMatches) * 100).toFixed(1)),
    leftWinratePct: Number(leftWinrate.toFixed(1)),
    rightWinratePct: Number(rightWinrate.toFixed(1)),
    ci95Lower: ci.lower,
    ci95Upper: ci.upper,
    avgFrontlineBias: Number(avgFrontline.toFixed(1)),
    avgZeroUnitsLeft: Number(avgZeroLeft.toFixed(1)),
    avgZeroUnitsRight: Number(avgZeroRight.toFixed(1)),
  };
}

async function main() {
  const cpuCount = Math.max(2, os.cpus().length - 1); // Dùng 11 cores
  console.log(`========================================================================================`);
  console.log(`🚀 KHỞI ĐỘNG HỆ THỐNG ĐO TOÀN DIỆN PHẦN 3b (${cpuCount} THREADS PARALLEL)`);
  console.log(`- Mỗi kịch bản: 1.000 ván | maxSeconds: 900s | Cố định PRNG seed`);
  console.log(`========================================================================================\n`);

  // 1. NHÓM ĐỐI XỨNG (9 DÒNG)
  const symmetryScenarios: ScenarioConfig[] = [
    { id: 'S1', name: 'Easy/Easy BALANCED', leftDiff: 'EASY', rightDiff: 'EASY', leftStrat: 'BALANCED', rightStrat: 'BALANCED', matches: 1000, maxSeconds: 900 },
    { id: 'S2', name: 'Easy/Easy SPAM_UNITS', leftDiff: 'EASY', rightDiff: 'EASY', leftStrat: 'SPAM_UNITS', rightStrat: 'SPAM_UNITS', matches: 1000, maxSeconds: 900 },
    { id: 'S3', name: 'Easy/Easy FOCUS_UPGRADE', leftDiff: 'EASY', rightDiff: 'EASY', leftStrat: 'FOCUS_UPGRADE', rightStrat: 'FOCUS_UPGRADE', matches: 1000, maxSeconds: 900 },
    { id: 'S4', name: 'Normal/Normal BALANCED', leftDiff: 'NORMAL', rightDiff: 'NORMAL', leftStrat: 'BALANCED', rightStrat: 'BALANCED', matches: 1000, maxSeconds: 900 },
    { id: 'S5', name: 'Normal/Normal SPAM_UNITS', leftDiff: 'NORMAL', rightDiff: 'NORMAL', leftStrat: 'SPAM_UNITS', rightStrat: 'SPAM_UNITS', matches: 1000, maxSeconds: 900 },
    { id: 'S6', name: 'Normal/Normal FOCUS_UPGRADE', leftDiff: 'NORMAL', rightDiff: 'NORMAL', leftStrat: 'FOCUS_UPGRADE', rightStrat: 'FOCUS_UPGRADE', matches: 1000, maxSeconds: 900 },
    { id: 'S7', name: 'Hard/Hard BALANCED', leftDiff: 'HARD', rightDiff: 'HARD', leftStrat: 'BALANCED', rightStrat: 'BALANCED', matches: 1000, maxSeconds: 900 },
    { id: 'S8', name: 'Hard/Hard SPAM_UNITS', leftDiff: 'HARD', rightDiff: 'HARD', leftStrat: 'SPAM_UNITS', rightStrat: 'SPAM_UNITS', matches: 1000, maxSeconds: 900 },
    { id: 'S9', name: 'Hard/Hard FOCUS_UPGRADE', leftDiff: 'HARD', rightDiff: 'HARD', leftStrat: 'FOCUS_UPGRADE', rightStrat: 'FOCUS_UPGRADE', matches: 1000, maxSeconds: 900 },
  ];

  // 2. NHÓM MA TRẬN ĐỘ KHÓ (6 DÒNG ĐỔI BÊN)
  const difficultyScenarios: ScenarioConfig[] = [
    { id: 'D1_A', name: 'Hard vs Normal', leftDiff: 'HARD', rightDiff: 'NORMAL', leftStrat: 'BALANCED', rightStrat: 'BALANCED', matches: 1000, maxSeconds: 900 },
    { id: 'D1_B', name: 'Normal vs Hard', leftDiff: 'NORMAL', rightDiff: 'HARD', leftStrat: 'BALANCED', rightStrat: 'BALANCED', matches: 1000, maxSeconds: 900 },
    { id: 'D2_A', name: 'Normal vs Easy', leftDiff: 'NORMAL', rightDiff: 'EASY', leftStrat: 'BALANCED', rightStrat: 'BALANCED', matches: 1000, maxSeconds: 900 },
    { id: 'D2_B', name: 'Easy vs Normal', leftDiff: 'EASY', rightDiff: 'NORMAL', leftStrat: 'BALANCED', rightStrat: 'BALANCED', matches: 1000, maxSeconds: 900 },
    { id: 'D3_A', name: 'Hard vs Easy', leftDiff: 'HARD', rightDiff: 'EASY', leftStrat: 'BALANCED', rightStrat: 'BALANCED', matches: 1000, maxSeconds: 900 },
    { id: 'D3_B', name: 'Easy vs Hard', leftDiff: 'EASY', rightDiff: 'HARD', leftStrat: 'BALANCED', rightStrat: 'BALANCED', matches: 1000, maxSeconds: 900 },
  ];

  const startTime = Date.now();
  const allResults: ScenarioResult[] = [];

  console.log('--- ĐANG CHẠY 9 NHÓM ĐỐI XỨNG ---');
  for (const s of symmetryScenarios) {
    const t0 = Date.now();
    process.stdout.write(`⏳ Chạy [${s.name}] (1000 ván)... `);
    const res = await runScenarioInParallel(s, cpuCount);
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`Xong (${sec}s): Ván phân định: ${res.decidedMatches}/${res.totalMatches} | Winrate: ${res.leftWinratePct}% / ${res.rightWinratePct}% | UNFINISHED: ${res.unfinishedPct}%`);
    allResults.push(res);
  }

  console.log('\n--- ĐANG CHẠY 6 NHÓM MA TRẬN ĐỘ KHÓ ---');
  for (const d of difficultyScenarios) {
    const t0 = Date.now();
    process.stdout.write(`⏳ Chạy [${d.name}] (1000 ván)... `);
    const res = await runScenarioInParallel(d, cpuCount);
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`Xong (${sec}s): Ván phân định: ${res.decidedMatches}/${res.totalMatches} | Winrate: ${res.leftWinratePct}% / ${res.rightWinratePct}% | UNFINISHED: ${res.unfinishedPct}%`);
    allResults.push(res);
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n========================================================================================`);
  console.log(`🏁 HOÀN TẤT TOÀN BỘ 15.000 VÁN SAU ${totalTime}s (~${(15000 / Number(totalTime)).toFixed(0)} ván/s)`);
  console.log(`========================================================================================\n`);

  console.log(JSON.stringify(allResults, null, 2));
}

main().catch((err) => {
  console.error('Lỗi khi chạy benchmark:', err);
  process.exit(1);
});
