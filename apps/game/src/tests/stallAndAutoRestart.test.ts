import { describe, expect, it } from 'vitest';
import { BASE_MAX_HP } from '../data/ages';
import { getModeMatchConfig } from '../data/modes';
import { World } from '../engine/World';

describe('Task T1c: Quy luật căn cứ, Đầu hàng, Admin End và Tự chơi lại', () => {
  it('1. Cấu hình mặc định đúng theo chế độ: autoRestartDelaySec null (SOLO, LOCAL_2P, ONLINE_2P), 10s (LIVE)', () => {
    const soloCfg = getModeMatchConfig('SOLO');
    expect(soloCfg.autoRestartDelaySec).toBeNull();

    const localCfg = getModeMatchConfig('LOCAL_2P');
    expect(localCfg.autoRestartDelaySec).toBeNull();

    const onlineCfg = getModeMatchConfig('ONLINE_2P');
    expect(onlineCfg.autoRestartDelaySec).toBeNull();

    const liveCfg = getModeMatchConfig('LIVE');
    expect(liveCfg.autoRestartDelaySec).toBe(10);
  });

  it('2. Luật căn cứ bất di bất dịch: căn cứ KHÔNG BAO GIỜ bị rút máu tự động khi không bị tấn công', () => {
    const world = new World(true);
    // Chế độ 2 người chơi (không có bot AI tự động spawn lính)
    world.setGameMode('LOCAL_2P');

    // Chạy 300 giây mô phỏng (~5 phút) mà không có bất kỳ đòn đánh nào
    const dt = 1 / 60;
    for (let i = 0; i < 300 * 60; i++) {
      world.update(dt);
    }

    // Máu căn cứ cả 2 phe phải giữ nguyên vẹn 100%
    expect(world.playerBaseHp).toBe(BASE_MAX_HP);
    expect(world.botBaseHp).toBe(BASE_MAX_HP);
    expect(world.status).toBe('PLAYING');
    expect(world.endReason).toBeNull();
  });

  it('3. Căn cứ bị phá kết thúc với BASE_DESTROYED', () => {
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

  it('4. Hai căn cứ cùng về 0 trong một tick: phân định theo tổng sát thương gây ra', () => {
    // Trường hợp 4a: Player gây nhiều sát thương hơn -> VICTORY
    const worldA = new World(true);
    worldA.recordDamage(800, 'LEFT');
    worldA.recordDamage(400, 'RIGHT');
    worldA.playerBaseHp = 0;
    worldA.botBaseHp = 0;
    worldA.update(1 / 60);

    expect(worldA.status).toBe('VICTORY');
    expect(worldA.endReason).toBe('BASE_DESTROYED');

    // Trường hợp 4b: Bot gây nhiều sát thương hơn -> DEFEAT
    const worldB = new World(true);
    worldB.recordDamage(300, 'LEFT');
    worldB.recordDamage(900, 'RIGHT');
    worldB.playerBaseHp = 0;
    worldB.botBaseHp = 0;
    worldB.update(1 / 60);

    expect(worldB.status).toBe('DEFEAT');
    expect(worldB.endReason).toBe('BASE_DESTROYED');
  });

  it('5. Tính năng Đầu hàng (surrender): tính thua cho bên đầu hàng với lý do SURRENDER', () => {
    // Phe Trái đầu hàng -> DEFEAT cho phe Trái
    const worldLeft = new World(true);
    worldLeft.surrender('LEFT');

    expect(worldLeft.status).toBe('DEFEAT');
    expect(worldLeft.endReason).toBe('SURRENDER');

    // Phe Phải đầu hàng -> VICTORY cho phe Trái
    const worldRight = new World(true);
    worldRight.surrender('RIGHT');

    expect(worldRight.status).toBe('VICTORY');
    expect(worldRight.endReason).toBe('SURRENDER');

    // Khi trận đã kết thúc, gọi surrender không làm thay đổi trạng thái
    worldRight.surrender('LEFT');
    expect(worldRight.status).toBe('VICTORY');
    expect(worldRight.endReason).toBe('SURRENDER');
  });

  it('6. Lệnh Quản trị (ADMIN_END): kết thúc trận ngay lập tức với lý do ADMIN_END', () => {
    const world = new World(true);
    world.playerBaseHp = 800;
    world.botBaseHp = 600;

    // Admin cưỡng chế kết thúc mà không chỉ định bên thắng -> phân định theo máu
    world.adminEndMatch();
    expect(world.status).toBe('VICTORY');
    expect(world.endReason).toBe('ADMIN_END');

    // Admin chỉ định phe Phải thắng
    const worldAdminRight = new World(true);
    worldAdminRight.adminEndMatch('RIGHT');
    expect(worldAdminRight.status).toBe('DEFEAT');
    expect(worldAdminRight.endReason).toBe('ADMIN_END');

    // Admin chỉ định phe Trái thắng
    const worldAdminLeft = new World(true);
    worldAdminLeft.adminEndMatch('LEFT');
    expect(worldAdminLeft.status).toBe('VICTORY');
    expect(worldAdminLeft.endReason).toBe('ADMIN_END');
  });

  it('7. autoRestart đếm ngược và tự động reset ván, có thể hủy thủ công', () => {
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

  it('8. Kết quả mô phỏng giống nhau khi cùng seed (Deterministic)', () => {
    const world1 = new World(true);
    world1.setSeed(12345);
    const r1 = [world1.random(), world1.random(), world1.random()];

    const world2 = new World(true);
    world2.setSeed(12345);
    const r2 = [world2.random(), world2.random(), world2.random()];

    expect(r1).toEqual(r2);
  });
});
