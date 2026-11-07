import { describe, expect, it } from 'vitest';
import { BASE_MAX_HP } from '../data/ages';
import { DEFAULT_MODE_MATCH_CONFIGS, getModeMatchConfig } from '../data/modes';
import { World } from '../engine/World';

describe('Task T1: Chống bế tắc và tự chơi lại (Stall Detection, Drain & Auto-restart)', () => {
  it('1. Cấu hình mặc định đúng theo chế độ: matchDurationSec null, stallDetectSec 60s (live: 30s), autoRestartDelaySec null (live: 10s)', () => {
    const soloCfg = getModeMatchConfig('SOLO');
    expect(soloCfg.matchDurationSec).toBeNull();
    expect(soloCfg.stallDetectSec).toBe(60);
    expect(soloCfg.autoRestartDelaySec).toBeNull();
    expect(soloCfg.stallDrainInitialDps).toBe(2);
    expect(soloCfg.stallDrainRampIntervalSec).toBe(10);
    expect(soloCfg.stallDrainRampDps).toBe(1);

    const liveCfg = getModeMatchConfig('LIVE');
    expect(liveCfg.matchDurationSec).toBeNull();
    expect(liveCfg.stallDetectSec).toBe(30);
    expect(liveCfg.autoRestartDelaySec).toBe(10);
  });

  it('2. Không ai gây sát thương trong N giây thì bật drain; căn cứ mất máu theo giây và tăng dần', () => {
    const world = new World(true);
    world.setMatchConfig({
      stallDetectSec: 10,
      stallDrainInitialDps: 2,
      stallDrainRampIntervalSec: 10,
      stallDrainRampDps: 1,
    });

    // Chạy 9 giây mô phỏng mà không có sát thương nào
    const dt = 1 / 60;
    for (let i = 0; i < 9 * 60; i++) {
      world.update(dt);
    }

    expect(world.isStallDrainActive).toBe(false);
    expect(world.playerBaseHp).toBe(BASE_MAX_HP);
    expect(world.botBaseHp).toBe(BASE_MAX_HP);

    // Chạy thêm 2 giây (tổng 11s > 10s) -> Kích hoạt chế độ bế tắc
    for (let i = 0; i < 2 * 60; i++) {
      world.update(dt);
    }

    expect(world.isStallDrainActive).toBe(true);
    expect(world.hasEverStalled).toBe(true);
    expect(world.currentStallDrainDps).toBe(2);
    expect(world.playerBaseHp).toBeLessThan(BASE_MAX_HP);
    expect(world.botBaseHp).toBeLessThan(BASE_MAX_HP);

    const hpAfter1sDrain = world.playerBaseHp;

    // Chạy thêm 10 giây trong chế độ bế tắc -> Tốc độ rút máu tăng lên 3 HP/s (2 + 1)
    for (let i = 0; i < 10 * 60; i++) {
      world.update(dt);
    }

    expect(world.currentStallDrainDps).toBe(3);
    expect(world.playerBaseHp).toBeLessThan(hpAfter1sDrain);

    // Snapshot phản ánh đúng trạng thái bế tắc cho HUD
    const snap = world.getSnapshot();
    expect(snap.stallDrainActive).toBe(true);
    expect(snap.stallDrainDps).toBe(3);
  });

  it('3. Có sát thương trở lại thì tắt chế độ bế tắc ngay lập tức', () => {
    const world = new World(true);
    world.setMatchConfig({ stallDetectSec: 5 });

    // Đẩy thời gian qua 6 giây để kích hoạt drain
    for (let i = 0; i < 6 * 60; i++) {
      world.update(1 / 60);
    }
    expect(world.isStallDrainActive).toBe(true);

    // Phát sinh sát thương
    world.recordDamage(50, 'LEFT');
    world.update(1 / 60);

    expect(world.isStallDrainActive).toBe(false);
    expect(world.stallTimer).toBe(0);
    expect(world.currentStallDrainDps).toBe(0);

    const snap = world.getSnapshot();
    expect(snap.stallDrainActive).toBe(false);
  });

  it('4. Căn cứ bị phá vẫn kết thúc như cũ (BASE_DESTROYED)', () => {
    const world = new World(true);

    // Bot đánh sập căn cứ Player
    world.recordDamage(1000, 'RIGHT');
    world.playerBaseHp = 0;
    world.update(1 / 60);

    expect(world.status).toBe('DEFEAT');
    expect(world.endReason).toBe('BASE_DESTROYED');

    // Reset và thử Player đánh sập căn cứ Bot
    world.reset();
    world.recordDamage(1000, 'LEFT');
    world.botBaseHp = 0;
    world.update(1 / 60);

    expect(world.status).toBe('VICTORY');
    expect(world.endReason).toBe('BASE_DESTROYED');
  });

  it('5. Căn cứ bị rút cạn máu do bế tắc kết thúc với STALL_DRAIN', () => {
    const world = new World(true);
    world.setMatchConfig({ stallDetectSec: 1, stallDrainInitialDps: 500 });

    // Cho bế tắc kích hoạt và rút sạch máu căn cứ
    for (let i = 0; i < 4 * 60; i++) {
      world.update(1 / 60);
      if (world.status !== 'PLAYING') break;
    }

    expect(world.status).not.toBe('PLAYING');
    expect(['STALL_DRAIN', 'DRAW']).toContain(world.endReason);
  });

  it('6. Hai căn cứ cùng về 0 trong một tick: phân định theo tổng sát thương gây ra hoặc DRAW', () => {
    // Trường hợp 6a: Player gây nhiều sát thương hơn -> VICTORY
    const worldA = new World(true);
    worldA.recordDamage(800, 'LEFT');
    worldA.recordDamage(400, 'RIGHT');
    worldA.playerBaseHp = 0;
    worldA.botBaseHp = 0;
    worldA.update(1 / 60);

    expect(worldA.status).toBe('VICTORY');
    expect(worldA.endReason).toBe('BASE_DESTROYED');

    // Trường hợp 6b: Bot gây nhiều sát thương hơn -> DEFEAT
    const worldB = new World(true);
    worldB.recordDamage(300, 'LEFT');
    worldB.recordDamage(900, 'RIGHT');
    worldB.playerBaseHp = 0;
    worldB.botBaseHp = 0;
    worldB.update(1 / 60);

    expect(worldB.status).toBe('DEFEAT');
    expect(worldB.endReason).toBe('BASE_DESTROYED');

    // Trường hợp 6c: Tổng sát thương bằng nhau -> DRAW
    const worldC = new World(true);
    worldC.recordDamage(500, 'LEFT');
    worldC.recordDamage(500, 'RIGHT');
    worldC.playerBaseHp = 0;
    worldC.botBaseHp = 0;
    worldC.update(1 / 60);

    expect(worldC.status).toBe('DRAW');
    expect(worldC.endReason).toBe('DRAW');
  });

  it('7. Tạm dừng (PAUSED) không làm chạy bộ đếm bế tắc', () => {
    const world = new World(true);
    world.setMatchConfig({ stallDetectSec: 10 });

    // Chạy 4 giây bình thường
    for (let i = 0; i < 4 * 60; i++) {
      world.update(1 / 60);
    }
    expect(world.stallTimer).toBeCloseTo(4, 1);

    // Tạm dừng game
    world.status = 'PAUSED';

    // Update 5 giây nữa
    for (let i = 0; i < 5 * 60; i++) {
      world.update(1 / 60);
    }

    // Bộ đếm bế tắc và thời gian trận không đổi
    expect(world.stallTimer).toBeCloseTo(4, 1);
    expect(world.matchTime).toBeCloseTo(4, 1);
    expect(world.isStallDrainActive).toBe(false);
  });

  it('8. autoRestart đếm ngược và tự động reset ván, có thể hủy thủ công', () => {
    const world = new World(true);
    world.setMatchConfig({ autoRestartDelaySec: 3 });

    // Trận kết thúc
    world.botBaseHp = 0;
    world.update(1 / 60);

    expect(world.status).toBe('VICTORY');
    expect(world.autoRestartTimer).toBeCloseTo(3, 1);

    // Sau 2 giây: vẫn ở màn hình kết thúc, bộ đếm giảm
    world.update(2);
    expect(world.status).toBe('VICTORY');
    expect(world.autoRestartTimer).toBeCloseTo(1, 1);

    // Sau 1.5 giây nữa: tự động reset ván mới
    world.update(1.5);
    expect(world.status).toBe('PLAYING');
    expect(world.playerBaseHp).toBe(BASE_MAX_HP);
    expect(world.botBaseHp).toBe(BASE_MAX_HP);
    expect(world.matchTime).toBe(0);

    // Thử hủy auto-restart
    world.setMatchConfig({ autoRestartDelaySec: 3 });
    world.playerBaseHp = 0;
    world.update(1 / 60);
    expect(world.status).toBe('DEFEAT');
    expect(world.autoRestartTimer).toBeCloseTo(3, 1);

    // Người chơi bấm Hủy
    world.cancelAutoRestart();
    expect(world.autoRestartTimer).toBeNull();

    // Chạy thêm 5 giây: không bao giờ tự reset
    world.update(5);
    expect(world.status).toBe('DEFEAT');
  });

  it('9. Kết quả mô phỏng giống nhau khi cùng seed (Deterministic)', () => {
    const world1 = new World(true);
    world1.setSeed(12345);
    const r1 = [world1.random(), world1.random(), world1.random()];

    const world2 = new World(true);
    world2.setSeed(12345);
    const r2 = [world2.random(), world2.random(), world2.random()];

    expect(r1).toEqual(r2);
  });

  it('10. Với cấu hình mặc định (matchDurationSec = null), hành vi trận đấu không đổi, không timeout ép buộc', () => {
    const world = new World(true);
    world.setGameMode('SOLO');
    expect(world.matchConfig.matchDurationSec).toBeNull();

    // Chạy qua 500 giây mô phỏng (quá thời lượng thông thường)
    world.update(500);

    // Nếu không ai đánh và có stall drain thì drain, nhưng không bị TIMEOUT ép buộc
    expect(world.endReason).not.toBe('TIMEOUT');
  });

  it('11. Khi cấu hình matchDurationSec: hết giờ bên nhiều máu căn cứ hơn thắng, hòa thì vào sudden death', () => {
    const world = new World(true);
    world.setMatchConfig({ matchDurationSec: 100, stallDetectSec: null });

    world.playerBaseHp = 800;
    world.botBaseHp = 500;
    world.update(101);

    expect(world.status).toBe('VICTORY');
    expect(world.endReason).toBe('TIMEOUT');

    // Thử trường hợp hòa máu căn cứ -> Sudden Death
    const worldSd = new World(true);
    worldSd.setMatchConfig({ matchDurationSec: 100, stallDetectSec: null });
    worldSd.playerBaseHp = 600;
    worldSd.botBaseHp = 600;
    worldSd.update(101);

    expect(worldSd.isSuddenDeath).toBe(true);
    expect(worldSd.status).toBe('PLAYING');
  });
});
