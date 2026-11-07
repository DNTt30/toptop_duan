import { describe, it, expect } from 'vitest';
import { World } from '../engine/World';

describe('BƯỚC 5: Chuỗi phân định 4 nấc khi hai căn cứ vỡ cùng tick', () => {
  it('Nấc 1: Bên có máu âm ít hơn thắng (-5 HP thắng -50 HP)', () => {
    const world = new World(true);
    world.setGameMode('SOLO');
    world.status = 'PLAYING';

    // P1 nhận 1005 damage (còn -5 HP), Bot nhận 1050 damage (còn -50 HP)
    world.playerBaseHp = -5;
    world.botBaseHp = -50;

    // Kích hoạt kiểm tra vỡ căn cứ
    world.update(1 / 60);

    expect(world.status).toBe('VICTORY');
    expect(world.endReason).toBe('BASE_DESTROYED');
    expect(world.playerBaseHp).toBe(0);
    expect(world.botBaseHp).toBe(0);

    // Đảo ngược: P1 nhận -50 HP, Bot nhận -5 HP -> Bot thắng (DEFEAT)
    const world2 = new World(true);
    world2.setGameMode('SOLO');
    world2.status = 'PLAYING';
    world2.playerBaseHp = -50;
    world2.botBaseHp = -5;

    world2.update(1 / 60);

    expect(world2.status).toBe('DEFEAT');
    expect(world2.endReason).toBe('BASE_DESTROYED');
  });

  it('Nấc 2: Máu âm bằng nhau -> Bên gây tổng sát thương lớn hơn thắng', () => {
    const world = new World(true);
    world.setGameMode('SOLO');
    world.status = 'PLAYING';

    world.playerBaseHp = -20;
    world.botBaseHp = -20;

    // P1 gây 5000 damage, Bot gây 4000 damage
    world.playerTotalDamageDealt = 5000;
    world.botTotalDamageDealt = 4000;

    world.update(1 / 60);

    expect(world.status).toBe('VICTORY');

    // Đảo chiều: Bot gây 6000 damage, P1 gây 5000 damage -> Bot thắng (DEFEAT)
    const world2 = new World(true);
    world2.setGameMode('SOLO');
    world2.status = 'PLAYING';
    world2.playerBaseHp = -20;
    world2.botBaseHp = -20;
    world2.playerTotalDamageDealt = 5000;
    world2.botTotalDamageDealt = 6000;

    world2.update(1 / 60);

    expect(world2.status).toBe('DEFEAT');
  });

  it('Nấc 3: Sát thương bằng nhau -> Tính tổng máu quân sống trên sân, rồi tổng vàng kiếm được', () => {
    // 3a. So sánh tổng máu quân sống
    const world = new World(true);
    world.setGameMode('SOLO');
    world.status = 'PLAYING';

    world.playerBaseHp = -10;
    world.botBaseHp = -10;
    world.playerTotalDamageDealt = 3000;
    world.botTotalDamageDealt = 3000;

    // Spawn 1 lính cho P1 (HP 500) và 1 lính cho Bot (HP 300)
    const pUnit = world.spawnUnit(world.playerAge.getConfig().units[0]!, 'LEFT');
    const bUnit = world.spawnUnit(world.botAge.getConfig().units[0]!, 'RIGHT');
    if (pUnit && bUnit) {
      pUnit.hp = 500;
      bUnit.hp = 300;
    }

    world.update(1 / 60);

    expect(world.status).toBe('VICTORY');

    // 3b. Máu quân sống bằng nhau -> So sánh tổng vàng kiếm được
    const world2 = new World(true);
    world2.setGameMode('SOLO');
    world2.status = 'PLAYING';
    world2.playerBaseHp = -10;
    world2.botBaseHp = -10;
    world2.playerTotalDamageDealt = 3000;
    world2.botTotalDamageDealt = 3000;

    world2.playerEconomy.totalGoldEarned = 1500;
    world2.botEconomy.totalGoldEarned = 1200;

    world2.update(1 / 60);

    expect(world2.status).toBe('VICTORY');

    // Đảo chiều vàng
    const world3 = new World(true);
    world3.setGameMode('SOLO');
    world3.status = 'PLAYING';
    world3.playerBaseHp = -10;
    world3.botBaseHp = -10;
    world3.playerTotalDamageDealt = 3000;
    world3.botTotalDamageDealt = 3000;

    world3.playerEconomy.totalGoldEarned = 1200;
    world3.botEconomy.totalGoldEarned = 1800;

    world3.update(1 / 60);

    expect(world3.status).toBe('DEFEAT');
  });

  it('Nấc 4: Mọi chỉ số bằng nhau tuyệt đối -> Quyết định xác định theo RNG seed (không dùng >=)', () => {
    // Test seed ra < 0.5 -> VICTORY
    const world1 = new World(true);
    world1.setGameMode('SOLO');
    world1.status = 'PLAYING';
    world1.playerBaseHp = -10;
    world1.botBaseHp = -10;
    world1.playerTotalDamageDealt = 1000;
    world1.botTotalDamageDealt = 1000;
    world1.playerEconomy.totalGoldEarned = 500;
    world1.botEconomy.totalGoldEarned = 500;
    world1.random = () => 0.25; // < 0.5

    world1.update(1 / 60);
    expect(world1.status).toBe('VICTORY');

    // Test seed ra >= 0.5 -> DEFEAT
    const world2 = new World(true);
    world2.setGameMode('SOLO');
    world2.status = 'PLAYING';
    world2.playerBaseHp = -10;
    world2.botBaseHp = -10;
    world2.playerTotalDamageDealt = 1000;
    world2.botTotalDamageDealt = 1000;
    world2.playerEconomy.totalGoldEarned = 500;
    world2.botEconomy.totalGoldEarned = 500;
    world2.random = () => 0.75; // >= 0.5

    world2.update(1 / 60);
    expect(world2.status).toBe('DEFEAT');
  });
});
