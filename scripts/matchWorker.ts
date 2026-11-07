import { parentPort, workerData } from 'worker_threads';
import { World } from '../apps/game/src/engine/World';
import { BotAI, type BotDifficulty, type BotStrategy } from '../apps/game/src/engine/BotAI';
import { LANE_WIDTH } from '../apps/game/src/data/ages';

function createMulberry32(seed: number) {
  let s = seed >>> 0;
  return function () {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface MatchTask {
  matchIndex: number;
  leftDiff: BotDifficulty;
  rightDiff: BotDifficulty;
  leftStrat: BotStrategy;
  rightStrat: BotStrategy;
  maxSeconds: number;
}

export interface MatchOutcome {
  matchIndex: number;
  winner: 'LEFT' | 'RIGHT' | 'UNFINISHED';
  durationSeconds: number;
  zeroTicksLeftPct: number;
  zeroTicksRightPct: number;
  frontlineBias: number;
}

export function runSingleMatchFast(task: MatchTask): MatchOutcome {
  const prng = createMulberry32(task.matchIndex * 10007 + 42);
  const origRandom = Math.random;
  Math.random = prng;

  try {
    const world = new World(true);
    world.random = prng;
    world.setGameMode('SOLO');

    const leftAI = new BotAI(task.leftDiff, 'LEFT', task.leftStrat);
    world.botAI.team = 'RIGHT';
    world.botAI.setDifficulty(task.rightDiff);
    world.botAI.setStrategy(task.rightStrat);

    const dt = 1 / 60;
    const maxTicks = Math.round(task.maxSeconds * 60);

    let zeroTicksLeft = 0;
    let zeroTicksRight = 0;
    let frontlineSum = 0;
    let frontlineSamples = 0;

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

      const leftAlive = world.playerUnits.some((u) => u.isAlive);
      const rightAlive = world.botUnits.some((u) => u.isAlive);

      if (!leftAlive) zeroTicksLeft++;
      if (!rightAlive) zeroTicksRight++;

      if (tick % 120 === 0 && leftAlive && rightAlive) {
        const fl = world.combatFrontlineX;
        if (fl !== null) {
          frontlineSum += fl;
          frontlineSamples++;
        }
      }

      if (world.status !== 'PLAYING') {
        const winner = world.status === 'VICTORY' ? 'LEFT' : 'RIGHT';
        const totalTicks = Math.max(1, tick + 1);
        const avgFl = frontlineSamples > 0 ? frontlineSum / frontlineSamples : LANE_WIDTH / 2;
        return {
          matchIndex: task.matchIndex,
          winner,
          durationSeconds: Number(world.matchTime.toFixed(1)),
          zeroTicksLeftPct: Number(((zeroTicksLeft / totalTicks) * 100).toFixed(1)),
          zeroTicksRightPct: Number(((zeroTicksRight / totalTicks) * 100).toFixed(1)),
          frontlineBias: Number((avgFl - LANE_WIDTH / 2).toFixed(1)),
        };
      }
    }

    const totalTicks = maxTicks;
    const avgFl = frontlineSamples > 0 ? frontlineSum / frontlineSamples : LANE_WIDTH / 2;
    return {
      matchIndex: task.matchIndex,
      winner: 'UNFINISHED',
      durationSeconds: Number(world.matchTime.toFixed(1)),
      zeroTicksLeftPct: Number(((zeroTicksLeft / totalTicks) * 100).toFixed(1)),
      zeroTicksRightPct: Number(((zeroTicksRight / totalTicks) * 100).toFixed(1)),
      frontlineBias: Number((avgFl - LANE_WIDTH / 2).toFixed(1)),
    };
  } finally {
    Math.random = origRandom;
  }
}

if (parentPort) {
  const outcomes: MatchOutcome[] = [];
  for (const t of workerData as MatchTask[]) {
    outcomes.push(runSingleMatchFast(t));
  }
  parentPort.postMessage(outcomes);
}
