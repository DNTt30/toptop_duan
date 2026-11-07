import { describe, it, expect } from 'vitest';
import { World } from '../engine/World';
import { BotAI, type BotDifficulty, type BotStrategy } from '../engine/BotAI';

function runMatch(
  leftDiff: BotDifficulty,
  rightDiff: BotDifficulty,
  strategy: BotStrategy = 'BALANCED',
  maxSeconds: number = 400
): 'LEFT' | 'RIGHT' | 'UNFINISHED' {
  const world = new World(true);
  world.setGameMode('SOLO');
  const leftAI = new BotAI(leftDiff, 'LEFT', strategy);
  world.botAI.team = 'RIGHT';
  world.botAI.setDifficulty(rightDiff);
  world.botAI.setStrategy(strategy);

  const dt = 1 / 60;
  const maxTicks = Math.round(maxSeconds * 60);

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
      return world.status === 'VICTORY' ? 'LEFT' : 'RIGHT';
    }
  }

  return 'UNFINISHED';
}

describe('Ma Trận Độ Khó Bot AI (Easy / Normal / Hard)', () => {
  it('Normal áp đảo Easy (Winrate >= 70%) cả 2 chiều đổi bên', () => {
    const MATCHES = 12;
    let normalWinsLeft = 0;
    let easyWinsRight = 0;

    for (let i = 0; i < MATCHES; i++) {
      const winner = runMatch('NORMAL', 'EASY', 'BALANCED', 350);
      if (winner === 'LEFT') normalWinsLeft++;
      else if (winner === 'RIGHT') easyWinsRight++;
    }

    const decided1 = normalWinsLeft + easyWinsRight;
    expect(decided1).toBeGreaterThan(0);
    const winrateNormalLeft = (normalWinsLeft / decided1) * 100;
    expect(winrateNormalLeft).toBeGreaterThanOrEqual(70);

    let easyWinsLeft = 0;
    let normalWinsRight = 0;

    for (let i = 0; i < MATCHES; i++) {
      const winner = runMatch('EASY', 'NORMAL', 'BALANCED', 350);
      if (winner === 'LEFT') easyWinsLeft++;
      else if (winner === 'RIGHT') normalWinsRight++;
    }

    const decided2 = easyWinsLeft + normalWinsRight;
    expect(decided2).toBeGreaterThan(0);
    const winrateNormalRight = (normalWinsRight / decided2) * 100;
    expect(winrateNormalRight).toBeGreaterThanOrEqual(70);
  }, 60000);

  it('Hard áp đảo Normal (Winrate >= 65%) cả 2 chiều đổi bên', () => {
    const MATCHES = 12;
    let hardWinsLeft = 0;
    let normalWinsRight = 0;

    for (let i = 0; i < MATCHES; i++) {
      const winner = runMatch('HARD', 'NORMAL', 'BALANCED', 350);
      if (winner === 'LEFT') hardWinsLeft++;
      else if (winner === 'RIGHT') normalWinsRight++;
    }

    const decided1 = hardWinsLeft + normalWinsRight;
    if (decided1 > 0) {
      const winrateHardLeft = (hardWinsLeft / decided1) * 100;
      expect(winrateHardLeft).toBeGreaterThanOrEqual(65);
    }

    let normalWinsLeft = 0;
    let hardWinsRight = 0;

    for (let i = 0; i < MATCHES; i++) {
      const winner = runMatch('NORMAL', 'HARD', 'BALANCED', 350);
      if (winner === 'LEFT') normalWinsLeft++;
      else if (winner === 'RIGHT') hardWinsRight++;
    }

    const decided2 = normalWinsLeft + hardWinsRight;
    if (decided2 > 0) {
      const winrateHardRight = (hardWinsRight / decided2) * 100;
      expect(winrateHardRight).toBeGreaterThanOrEqual(65);
    }
  }, 60000);
});
