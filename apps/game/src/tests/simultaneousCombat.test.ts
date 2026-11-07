import { describe, it, expect } from 'vitest';
import { World } from '../engine/World';
import { AGES_DATA, LANE_WIDTH, type UnitConfig } from '../data/ages';

describe('Bước 2: Thứ tự tick đồng thời 2 pha (Decision & Execution Phase)', () => {
  it('Hai lính cận chiến giống hệt nhau đánh nhau -> mất máu và chết cùng tick', () => {
    const world = new World(true); // Headless mode
    world.setGameMode('SOLO');

    // Dùng quân cận chiến Tiền Sử (Caveman Club)
    const cavemanConfig = AGES_DATA[1]!.units[0]!;

    // Đặt 2 quân đối xứng chính xác quanh tâm chiến trường (LANE_WIDTH / 2 = 2240)
    // Khoảng cách ban đầu là 120px (vừa đủ ngoài tầm đánh 35px, cùng bước vào tầm đánh ở cùng tick)
    const centerX = LANE_WIDTH / 2;
    const u1 = world.spawnUnit(cavemanConfig, 'LEFT')!;
    const u2 = world.spawnUnit(cavemanConfig, 'RIGHT')!;

    u1.x = centerX - 60;
    u1.plannedX = u1.x;
    u2.x = centerX + 60;
    u2.plannedX = u2.x;

    expect(u1.hp).toBe(u2.hp);
    expect(u1.isAlive).toBe(true);
    expect(u2.isAlive).toBe(true);

    let bothDiedSameTick = false;
    let u1DiedTick = -1;
    let u2DiedTick = -1;

    // Chạy mô phỏng từng tick (1/60s)
    const dt = 1 / 60;
    for (let tick = 0; tick < 600; tick++) {
      world.update(dt);

      // Cả hai cùng mất máu đối xứng trong suốt trận đấu
      if (u1.isAlive && u2.isAlive) {
        expect(u1.hp).toBe(u2.hp);
      }

      if (!u1.isAlive && u1DiedTick === -1) {
        u1DiedTick = tick;
      }
      if (!u2.isAlive && u2DiedTick === -1) {
        u2DiedTick = tick;
      }

      if (!u1.isAlive && !u2.isAlive) {
        bothDiedSameTick = u1DiedTick === u2DiedTick;
        break;
      }
    }

    // Tiêu chí bắt buộc: Cả hai lính cùng chết ở cùng một tick!
    // Không có hiện tượng quân phe Player đi trước đánh chết Bot khiến Bot không kịp trả đòn.
    expect(u1DiedTick).toBeGreaterThan(0);
    expect(u2DiedTick).toBe(u1DiedTick);
    expect(bothDiedSameTick).toBe(true);
    expect(u1.isAlive).toBe(false);
    expect(u2.isAlive).toBe(false);
  });

  it('Hàng đợi lệnh (Command Queue) xử lý đồng thời không phụ thuộc thứ tự gọi', () => {
    const world = new World(true);
    world.setGameMode('LOCAL_2P'); // Chế độ 2 người chơi (không có BotAI tự động mua)

    world.playerEconomy.addGold(500);
    world.botEconomy.addGold(500);

    const stoneMelee = AGES_DATA[1]!.units[0]!;

    // Giả lập trong quá trình chạy tick: lệnh của Player và Bot cùng được đưa vào hàng đợi
    world.queueCommand({ team: 'RIGHT', type: 'SPAWN_UNIT', config: stoneMelee });
    world.queueCommand({ team: 'LEFT', type: 'SPAWN_UNIT', config: stoneMelee });

    expect(world.commandQueue.length).toBe(2);

    // Khi tick chạy, cả hai lệnh được xử lý đồng thời trong Phase 0
    world.update(1 / 60);

    expect(world.commandQueue.length).toBe(0);
    expect(world.playerEconomy.spawnQueue.length).toBe(1);
    expect(world.botEconomy.spawnQueue.length).toBe(1);
  });

  it('Hai căn cứ bị phá hủy cùng tick được giải quyết đồng thời', () => {
    const world = new World(true);
    world.setGameMode('SOLO');

    world.playerBaseHp = 10;
    world.botBaseHp = 10;

    // Gây sát thương chết người lên cả 2 căn cứ trong cùng tick
    const meleeCfg: UnitConfig = AGES_DATA[1]!.units[0]!;
    const uLeft = world.spawnUnit(meleeCfg, 'LEFT')!;
    const uRight = world.spawnUnit(meleeCfg, 'RIGHT')!;

    uLeft.x = world.baseRightX - 30; // Áp sát căn cứ phải
    uRight.x = world.baseLeftX + 30; // Áp sát căn cứ trái

    let matchEnded = false;
    for (let i = 0; i < 120; i++) {
      world.update(1 / 60);
      if (world.status !== 'PLAYING') {
        matchEnded = true;
        break;
      }
    }

    expect(matchEnded).toBe(true);
    expect(world.endReason).toBe('BASE_DESTROYED');
    // Cả 2 base đều về 0
    expect(world.playerBaseHp).toBe(0);
    expect(world.botBaseHp).toBe(0);
  });
});
