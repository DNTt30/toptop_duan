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

interface ScenarioReport {
  id: string;
  name: string;
  totalMatches: number;
  baseDestroyedCount: number;
  baseDestroyedPct: number;
  unfinishedCount: number;
  unfinishedPct: number;
  leftWins: number;
  rightWins: number;
  leftWinratePct: number;
  rightWinratePct: number;
  ci95Lower: number;
  ci95Upper: number;
  medianDuration: number;
  p90Duration: number;
  meanDuration: number;
  rushLossOrUnfinishedSamples: Array<{
    matchIndex: number;
    winner: string;
    durationSeconds: number;
    leftAge: number;
    rightAge: number;
    leftBaseHp: number;
    rightBaseHp: number;
    leftTurrets: number;
    rightTurrets: number;
    frontlineBias: number;
  }>;
}

function calculateConfidenceInterval95(wins: number, totalDecided: number): { lower: number; upper: number } {
  if (totalDecided <= 0) return { lower: 0, upper: 0 };
  const p = wins / totalDecided;
  const z = 1.96;
  const z2 = z * z;
  const denominator = 1 + z2 / totalDecided;
  const center = (p + z2 / (2 * totalDecided)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p) + z2 / (4 * totalDecided)) / totalDecided)) / denominator;

  const lower = Math.max(0, Number(((center - half) * 100).toFixed(1)));
  const upper = Math.min(100, Number(((center + half) * 100).toFixed(1)));
  return { lower, upper };
}

async function runScenarioInParallel(config: ScenarioConfig, threadCount: number): Promise<ScenarioReport> {
  const tasksPerWorker = Math.ceil(config.matches / threadCount);
  const workerPromises: Promise<MatchOutcome[]>[] = [];

  const workerScript = path.resolve(__dirname, 'matchWorker.ts');

  for (let i = 0; i < threadCount; i++) {
    const startIdx = i * tasksPerWorker + 1;
    const endIdx = Math.min((i + 1) * tasksPerWorker, config.matches);
    if (startIdx > endIdx) continue;

    const workerTasks: MatchTask[] = [];
    for (let m = startIdx; m <= endIdx; m++) {
      workerTasks.push({
        matchIndex: m,
        leftDiff: config.leftDiff,
        rightDiff: config.rightDiff,
        leftStrat: config.leftStrat,
        rightStrat: config.rightStrat,
        maxSeconds: config.maxSeconds,
      });
    }

    const p = new Promise<MatchOutcome[]>((resolve, reject) => {
      const worker = new Worker(workerScript, {
        workerData: workerTasks,
        execArgv: ['--import', 'tsx'],
      });
      worker.on('message', (outcomes: MatchOutcome[]) => resolve(outcomes));
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
      });
    });

    workerPromises.push(p);
  }

  const nestedOutcomes = await Promise.all(workerPromises);
  const outcomes = nestedOutcomes.flat();

  let leftWins = 0;
  let rightWins = 0;
  let unfinished = 0;
  let baseDestroyed = 0;
  const durations: number[] = [];

  const rushLossOrUnfinishedSamples: ScenarioReport['rushLossOrUnfinishedSamples'] = [];

  for (const o of outcomes) {
    durations.push(o.durationSeconds);
    if (o.winner === 'LEFT') {
      leftWins++;
      baseDestroyed++;
    } else if (o.winner === 'RIGHT') {
      rightWins++;
      baseDestroyed++;
    } else {
      unfinished++;
    }

    // Ghi nhận mẫu ván RUSH thua hoặc unfinished
    const isRushLeft = config.leftStrat === 'RUSH';
    const isRushRight = config.rightStrat === 'RUSH';
    const rushFailed =
      (isRushLeft && (o.winner === 'RIGHT' || o.winner === 'UNFINISHED')) ||
      (isRushRight && (o.winner === 'LEFT' || o.winner === 'UNFINISHED'));

    if (rushFailed && rushLossOrUnfinishedSamples.length < 5) {
      rushLossOrUnfinishedSamples.push({
        matchIndex: o.matchIndex,
        winner: o.winner,
        durationSeconds: o.durationSeconds,
        leftAge: o.leftAge,
        rightAge: o.rightAge,
        leftBaseHp: o.leftBaseHp,
        rightBaseHp: o.rightBaseHp,
        leftTurrets: o.leftTurretCount,
        rightTurrets: o.rightTurretCount,
        frontlineBias: o.frontlineBias,
      });
    }
  }

  const totalDecided = leftWins + rightWins;
  const leftWinratePct = totalDecided > 0 ? Number(((leftWins / totalDecided) * 100).toFixed(1)) : 0;
  const rightWinratePct = totalDecided > 0 ? Number(((rightWins / totalDecided) * 100).toFixed(1)) : 0;
  const { lower: ci95Lower, upper: ci95Upper } = calculateConfidenceInterval95(leftWins, totalDecided);

  durations.sort((a, b) => a - b);
  const medianDuration = durations[Math.floor(durations.length * 0.5)] || 0;
  const p90Duration = durations[Math.floor(durations.length * 0.9)] || 0;
  const meanDuration = Number((durations.reduce((acc, d) => acc + d, 0) / durations.length).toFixed(1));

  return {
    id: config.id,
    name: config.name,
    totalMatches: config.matches,
    baseDestroyedCount: baseDestroyed,
    baseDestroyedPct: Number(((baseDestroyed / config.matches) * 100).toFixed(1)),
    unfinishedCount: unfinished,
    unfinishedPct: Number(((unfinished / config.matches) * 100).toFixed(1)),
    leftWins,
    rightWins,
    leftWinratePct,
    rightWinratePct,
    ci95Lower,
    ci95Upper,
    medianDuration,
    p90Duration,
    meanDuration,
    rushLossOrUnfinishedSamples,
  };
}

async function main() {
  const cpuCount = Math.max(2, os.cpus().length - 1);
  console.log(`========================================================================================`);
  console.log(`🚀 BẮT ĐẦU CHẠY THỰC NGHIỆM BƯỚC 1: ĐO CHIẾN THUẬT NGƯỜI CHƠI GIẢ (RUSH / TIMING)`);
  console.log(`- 8 Kịch Bản Đổi Bên | Mỗi Kịch Bản: 1.000 Ván | maxSeconds: 900s | Độ Khó: NORMAL`);
  console.log(`- Đa luồng: ${cpuCount} Worker Threads`);
  console.log(`========================================================================================\n`);

  const scenarios: ScenarioConfig[] = [
    // Cặp 1: RUSH vs BALANCED
    { id: 'P1_A', name: 'RUSH (Trái) vs BALANCED (Phải)', leftDiff: 'NORMAL', rightDiff: 'NORMAL', leftStrat: 'RUSH', rightStrat: 'BALANCED', matches: 1000, maxSeconds: 900 },
    { id: 'P1_B', name: 'BALANCED (Trái) vs RUSH (Phải)', leftDiff: 'NORMAL', rightDiff: 'NORMAL', leftStrat: 'BALANCED', rightStrat: 'RUSH', matches: 1000, maxSeconds: 900 },

    // Cặp 2: TIMING vs BALANCED
    { id: 'P2_A', name: 'TIMING (Trái) vs BALANCED (Phải)', leftDiff: 'NORMAL', rightDiff: 'NORMAL', leftStrat: 'TIMING', rightStrat: 'BALANCED', matches: 1000, maxSeconds: 900 },
    { id: 'P2_B', name: 'BALANCED (Trái) vs TIMING (Phải)', leftDiff: 'NORMAL', rightDiff: 'NORMAL', leftStrat: 'BALANCED', rightStrat: 'TIMING', matches: 1000, maxSeconds: 900 },

    // Cặp 3: RUSH vs SPAM_UNITS
    { id: 'P3_A', name: 'RUSH (Trái) vs SPAM_UNITS (Phải)', leftDiff: 'NORMAL', rightDiff: 'NORMAL', leftStrat: 'RUSH', rightStrat: 'SPAM_UNITS', matches: 1000, maxSeconds: 900 },
    { id: 'P3_B', name: 'SPAM_UNITS (Trái) vs RUSH (Phải)', leftDiff: 'NORMAL', rightDiff: 'NORMAL', leftStrat: 'SPAM_UNITS', rightStrat: 'RUSH', matches: 1000, maxSeconds: 900 },

    // Cặp 4: RUSH vs FOCUS_UPGRADE
    { id: 'P4_A', name: 'RUSH (Trái) vs FOCUS_UPGRADE (Phải)', leftDiff: 'NORMAL', rightDiff: 'NORMAL', leftStrat: 'RUSH', rightStrat: 'FOCUS_UPGRADE', matches: 1000, maxSeconds: 900 },
    { id: 'P4_B', name: 'FOCUS_UPGRADE (Trái) vs RUSH (Phải)', leftDiff: 'NORMAL', rightDiff: 'NORMAL', leftStrat: 'FOCUS_UPGRADE', rightStrat: 'RUSH', matches: 1000, maxSeconds: 900 },
  ];

  const startTime = Date.now();
  const allReports: ScenarioReport[] = [];

  for (const s of scenarios) {
    const t0 = Date.now();
    process.stdout.write(`⏳ Chạy [${s.name}] (1000 ván)... `);
    const report = await runScenarioInParallel(s, cpuCount);
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`Xong (${sec}s): Phá căn cứ: ${report.baseDestroyedPct}% | Winrate Trái: ${report.leftWinratePct}% | Trung vị: ${report.medianDuration}s`);
    allReports.push(report);
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n========================================================================================`);
  console.log(`🏁 HOÀN TẤT ĐO 8.000 VÁN SAU ${totalTime}s (~${(8000 / Number(totalTime)).toFixed(0)} ván/s)`);
  console.log(`========================================================================================\n`);

  console.log(JSON.stringify(allReports, null, 2));
}

main().catch((err) => {
  console.error('Lỗi khi chạy thực nghiệm:', err);
  process.exit(1);
});
