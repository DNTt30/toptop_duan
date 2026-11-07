import { World } from '../apps/game/src/engine/World';
import { BotAI } from '../apps/game/src/engine/BotAI';
import { type Unit } from '../apps/game/src/engine/Unit';

interface DeathStats {
  byUnit: number;
  byTurret: number;
  byUltimate: number;
}

export function traceUnfinishedMatch() {
  const world = new World(true);
  world.setGameMode('SOLO');
  const leftAI = new BotAI('NORMAL', 'LEFT', 'BALANCED');
  world.botAI.team = 'RIGHT';
  world.botAI.setDifficulty('NORMAL');
  world.botAI.setStrategy('BALANCED');

  const deathStats = {
    LEFT: { byUnit: 0, byTurret: 0, byUltimate: 0 },
    RIGHT: { byUnit: 0, byTurret: 0, byUltimate: 0 },
  };

  // Monkey-patch để đếm nguồn gây chết quân
  const origHandleCombatEvent = (world as any).handleCombatEvent.bind(world);
  let lastAttackerType: 'UNIT' | 'TURRET' | 'ULTIMATE' = 'UNIT';

  // Theo dõi đạn tháp
  const origFireTurret = (world as any).fireTurretProjectile.bind(world);
  (world as any).fireTurretProjectile = function (turret: any, target: any) {
    lastAttackerType = 'TURRET';
    return origFireTurret(turret, target);
  };

  console.log('========================================================================================');
  console.log('⏱️ LOG THEO DÕI MỖI 30 GIÂY VÁN ĐẤU UNFINISHED (NORMAL/NORMAL BALANCED - 900 GIÂY)');
  console.log('========================================================================================');
  console.log('| Thời gian | Quân (L/R) | Tháp (L/R) | Vàng giữ (L/R) | Kỷ nguyên (L/R) | Máu Base (L/R) | Tiền tuyến (px) |');
  console.log('| :---: | :---: | :---: | :---: | :---: | :---: | :---: |');

  const dt = 1 / 60;
  for (let tick = 0; tick <= 60 * 900; tick++) {
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

    if (tick % (60 * 30) === 0) {
      const sec = Math.round(tick / 60);
      const unitsL = world.playerUnits.filter((u) => u.isAlive).length;
      const unitsR = world.botUnits.filter((u) => u.isAlive).length;
      const turretsL = world.playerTurrets.slots.filter(Boolean).length;
      const turretsR = world.botTurrets.slots.filter(Boolean).length;
      const goldL = Math.round(world.playerEconomy.gold);
      const goldR = Math.round(world.botEconomy.gold);
      const ageL = world.playerAge.currentAge;
      const ageR = world.botAge.currentAge;
      const baseL = Math.round(world.playerBaseHp);
      const baseR = Math.round(world.botBaseHp);
      const fl = world.combatFrontlineX !== null ? Math.round(world.combatFrontlineX) : 'Trống';

      console.log(
        `| ${sec}s | ${unitsL} / ${unitsR} | ${turretsL} / ${turretsR} | ${goldL}G / ${goldR}G | Đời ${ageL} / Đời ${ageR} | ${baseL} / ${baseR} | ${fl} |`
      );
    }
  }

  console.log('========================================================================================\n');
  console.log('📊 TỔNG KẾT KINH TẾ & CHI TIÊU SAU 900 GIÂY:');
  console.log(`- Phe Trái (Left):  Tổng kiếm được ${Math.round(world.playerEconomy.totalGoldEarned)}G | Đã tiêu ${Math.round(world.playerEconomy.totalGoldSpent)}G | Còn dư ${Math.round(world.playerEconomy.gold)}G`);
  console.log(`- Phe Phải (Right): Tổng kiếm được ${Math.round(world.botEconomy.totalGoldEarned)}G | Đã tiêu ${Math.round(world.botEconomy.totalGoldSpent)}G | Còn dư ${Math.round(world.botEconomy.gold)}G`);
  console.log(`- Nâng cấp tháp: Phe Trái Lv${world.playerUpgrades.turretLevel} (${world.playerTurrets.slots.length} ô) | Phe Phải Lv${world.botUpgrades.turretLevel} (${world.botTurrets.slots.length} ô)`);
  console.log(`- Sát thương gây ra: Phe Trái ${Math.round(world.playerTotalDamageDealt)} | Phe Phải ${Math.round(world.botTotalDamageDealt)}`);
}

traceUnfinishedMatch();
