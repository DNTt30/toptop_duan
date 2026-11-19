import { describe, it, expect, beforeEach } from 'vitest';
import { AGES_DATA } from '../data/ages';
import { CONFIG } from '../data/combatFeelConfig';
import { graphicsSettings } from '../data/graphicsSettings';
import { getSpriteConfig } from '../data/sprites';
import { AnimationController } from '../engine/AnimationController';
import { GameLoop } from '../engine/GameLoop';
import { ParticleSystem } from '../engine/ParticleSystem';
import { Unit } from '../engine/Unit';
import { World } from '../engine/World';

describe('Combat Feel & Animation Upgrade Verification', () => {
  beforeEach(() => {
    // Đảm bảo môi trường test sạch giữa các case
  });

  it('1. CONFIG tập trung đầy đủ thông số chuẩn và đúng ràng buộc đơn vị (Round 1 & Round 2)', () => {
    expect(CONFIG.loop.fixedHz).toBe(60);
    expect(CONFIG.loop.fixedStepSec).toBeCloseTo(1 / 60, 6);
    expect(CONFIG.loop.maxDeltaMs).toBe(50);
    expect(CONFIG.loop.maxStepsPerFrame).toBe(2);
    expect(CONFIG.loop.dropExcessAccumulator).toBe(true);

    const sumAttackMs = CONFIG.attack.frameDurationsMs.reduce((a, b) => a + b, 0);
    expect(sumAttackMs).toBe(CONFIG.attack.anticipationMs + CONFIG.attack.strikeMs + CONFIG.attack.recoveryMs);
    expect(CONFIG.attack.firstHitPhaseMaxMs).toBe(150);
    expect(CONFIG.attack.perSwingJitterMs).toBe(30);
    expect(CONFIG.attack.standoffGapPx).toBeGreaterThanOrEqual(20);
    expect(CONFIG.attack.standoffGapPx).toBeLessThanOrEqual(30);

    expect(CONFIG.hitFeedback.hitStopMs).toBe(60);
    expect(CONFIG.hitFeedback.heavyHitStopMs).toBeGreaterThan(CONFIG.hitFeedback.normalHitStopMs);
    expect(CONFIG.hitFeedback.killHitStopMs).toBeGreaterThanOrEqual(CONFIG.hitFeedback.heavyHitStopMs);
    expect(CONFIG.hitFeedback.whiteFlashMs).toBe(80);
    expect(CONFIG.hitFeedback.knockbackPx).toBe(6);
    expect(CONFIG.hitFeedback.squashDurationMs).toBe(100);
    expect(CONFIG.hitFeedback.shakeDurationMs).toBe(100);

    expect(CONFIG.damageNumber.poolSize).toBe(30);
    expect(CONFIG.damageNumber.mergeWindowMs).toBe(150);
    expect(CONFIG.damageNumber.lifetimeMs).toBe(700);

    expect(CONFIG.death.animFrameCount).toBe(9);
    expect(CONFIG.death.corpseHoldMs).toBe(300);
    expect(CONFIG.death.corpseFadeMs).toBe(400);
    expect(CONFIG.death.orbPoolSize).toBe(40);

    expect(CONFIG.crowd.laneJitterYPx).toBe(6);
    expect(CONFIG.crowd.rearUnitDimPct).toBeCloseTo(0.08, 4);
    expect(CONFIG.crowd.shadowAlpha).toBe(0.35);
    expect(CONFIG.teamAndHealth.ghostBarDelayMs).toBe(400);
    expect(CONFIG.hud.minFontSizePx).toBeGreaterThanOrEqual(12);
  });

  it('2. Đòn đánh 3 pha chỉ nổ hitFrame tại pha Strike, kích hoạt Hit-stop 60ms & DIE chạy tuần tự 9 frame', () => {
    const cavemanSprite = getSpriteConfig('stone_melee');
    expect(cavemanSprite).not.toBeNull();
    const anim = new AnimationController(cavemanSprite, 'WALK');

    expect(anim.requestState('ATTACK', true)).toBe(true);
    const t1 = anim.update(0.03);
    expect(t1.triggerHitEvent).toBe(false);
    expect(t1.frameIndex).toBe(0);

    const t2 = anim.update(0.05);
    expect(t2.triggerHitEvent).toBe(false);
    expect(t2.frameIndex).toBe(2);

    const t3 = anim.update(0.03);
    expect(t3.frameIndex).toBe(3);
    expect(t3.triggerHitEvent).toBe(true);
    expect(anim.hitStopTimer).toBeCloseTo(CONFIG.hitFeedback.hitStopMs / 1000, 5);

    const duringStop = anim.update(0.03);
    expect(duringStop.frameIndex).toBe(3);
    expect(duringStop.triggerHitEvent).toBe(false);

    anim.hitStopTimer = 0;
    expect(anim.requestState('DIE', true)).toBe(true);
    const dieFrames = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const r = anim.update(0.05);
      dieFrames.add(r.frameIndex);
    }
    expect(dieFrames.has(0) || dieFrames.has(1)).toBe(true);
    expect(dieFrames.has(4) || dieFrames.has(5)).toBe(true);
    expect(dieFrames.has(8)).toBe(true);
  });

  it('3. World floatingTexts giới hạn pool 30, tự gộp cùng target trong 150ms và phân biệt màu gây/nhận', () => {
    const world = new World(true);

    world.addDamageNumber(25, 'enemy_1', 1200, 520, 'LEFT', false);
    world.addDamageNumber(15, 'enemy_1', 1200, 520, 'LEFT', true);
    expect(world.floatingTexts.length).toBe(1);
    expect(world.floatingTexts[0]!.text).toBe('-40!');
    expect(world.floatingTexts[0]!.color).toBe(CONFIG.damageNumber.dealtCritColor);

    world.addDamageNumber(20, 'enemy_2', 1300, 520, 'LEFT', false);
    world.addDamageNumber(18, 'ally_1', 900, 520, 'RIGHT', false);
    expect(world.floatingTexts[1]!.color).toBe(CONFIG.damageNumber.dealtColor);
    expect(world.floatingTexts[2]!.color).toBe(CONFIG.damageNumber.receivedColor);

    for (let i = 0; i < 45; i++) {
      world.addDamageNumber(10 + i, `target_${i}`, 1000 + i * 10, 520, 'LEFT', false);
    }
    expect(world.floatingTexts.length).toBe(CONFIG.damageNumber.poolSize);
  });

  it('4. ParticleSystem: Thang Slash VFX 3 mức (NORMAL/HEAVY/KILL), Pool Orb tối đa 40 tự gộp khi vượt ngưỡng', () => {
    const prevParticles = graphicsSettings.get().particles;
    graphicsSettings.set('particles', true);
    const ps = new ParticleSystem();

    ps.spawnSlashVfx(500, 466, 1, 0xffffff, 'NORMAL');
    ps.spawnSlashVfx(500, 466, 1, 0xfde047, 'HEAVY');
    ps.spawnSlashVfx(500, 466, 1, 0xfef08a, 'KILL');
    expect(ps.activeSlashes.length).toBe(3);

    const [sNormal, sHeavy, sKill] = ps.activeSlashes;
    expect(sNormal!.maxLife).toBeGreaterThanOrEqual(CONFIG.slashVfx.normalMinLifeMs / 1000 - 1e-4);
    expect(sNormal!.maxLife).toBeLessThanOrEqual(CONFIG.slashVfx.normalMaxLifeMs / 1000 + 1e-4);
    expect(sHeavy!.scale).toBeGreaterThan(sNormal!.scale);
    expect(sKill!.scale).toBeGreaterThan(sHeavy!.scale);
    expect(sKill!.maxLife).toBeGreaterThanOrEqual(sNormal!.maxLife);

    // Đổ tràn pool Slash 24 -> vẫn giữ nguyên tối đa 24
    for (let i = 0; i < 30; i++) {
      ps.spawnSlashVfx(500, 466, 1, 0xffffff, 'NORMAL');
    }
    expect(ps.activeSlashes.length).toBe(CONFIG.slashVfx.poolSize);

    // Tia lửa mức KILL nhiều hơn hoặc bằng tối thiểu KILL
    ps.clear();
    ps.spawnHitSparks(600, 466, 0xffe066, 520, 'NORMAL');
    expect(ps.activeParticles.length).toBeGreaterThanOrEqual(CONFIG.slashVfx.normalSparkMin);

    // Pool RewardOrb tối đa 40: thả 55 hạt -> giữ đúng 40 hạt và phần vượt tự động gộp (tổng mergedCount === 55)
    ps.clear();
    const arrived: Array<{ team: string; kind: string }> = [];
    const unsub = ps.subscribeRewardArrive((team, kind) => {
      arrived.push({ team, kind });
    });

    ps.spawnRewardOrbs(800, 480, 'LEFT', 35, 20);
    expect(ps.activeRewardOrbs.length).toBe(CONFIG.death.orbPoolSize);
    const totalMerged = ps.activeRewardOrbs.reduce((sum, orb) => sum + orb.mergedCount, 0);
    expect(totalMerged).toBe(55);

    for (let t = 0; t < 20; t++) {
      ps.update(0.05);
    }
    expect(arrived.length).toBe(CONFIG.death.orbPoolSize);
    expect(ps.activeRewardOrbs.length).toBe(0);
    unsub();
    graphicsSettings.set('particles', prevParticles);
  });

  it('5. Unit phân tách rõ Headless (đối xứng 100%) vs Trận thật (organic variance), giữ Ghost Bar 0.4s', () => {
    const cavemanCfg = AGES_DATA[1]!.units[0]!;
    const headlessUnit = new Unit('h1', cavemanCfg, 'LEFT', 200, 520, 1, 1, 0, false);
    expect(headlessUnit.speedVariance).toBe(1.0);
    expect(headlessUnit.spawnCooldownMultiplier).toBe(1.0);
    expect(headlessUnit.firstAttackDelay).toBe(0);
    expect(Math.abs(headlessUnit.laneOffsetY)).toBeLessThanOrEqual(CONFIG.crowd.laneJitterYPx + 1e-6);

    const organicUnit = new Unit('o1', cavemanCfg, 'LEFT', 200, 520, 1, 1, 0, true);
    expect(organicUnit.speedVariance).toBeGreaterThanOrEqual(1 - CONFIG.crowd.speedVariancePct - 1e-6);
    expect(organicUnit.speedVariance).toBeLessThanOrEqual(1 + CONFIG.crowd.speedVariancePct + 1e-6);
    expect(organicUnit.spawnCooldownMultiplier).toBeGreaterThanOrEqual(1 - CONFIG.attack.cooldownVariancePct - 1e-6);
    expect(organicUnit.spawnCooldownMultiplier).toBeLessThanOrEqual(1 + CONFIG.attack.cooldownVariancePct + 1e-6);
    expect(Math.abs(organicUnit.laneOffsetY)).toBeLessThanOrEqual(CONFIG.crowd.laneJitterYPx + 1e-6);
    expect(organicUnit.firstAttackDelay).toBeGreaterThanOrEqual(0);
    expect(organicUnit.firstAttackDelay).toBeLessThanOrEqual(CONFIG.attack.firstHitPhaseMaxMs / 1000 + 1e-6);

    const noop = () => {};
    const initialMaxHp = organicUnit.maxHp;
    organicUnit.takeDamage(30, 'MELEE', headlessUnit);
    expect(organicUnit.hasTakenDamage).toBe(true);
    expect(organicUnit.hurtFlashTimer).toBeCloseTo(CONFIG.hitFeedback.whiteFlashMs / 1000, 5);
    expect(organicUnit.knockbackTimer).toBeCloseTo(CONFIG.hitFeedback.knockbackDurationMs / 1000, 5);
    expect(organicUnit.squashTimer).toBeCloseTo(CONFIG.hitFeedback.squashDurationMs / 1000, 5);
    expect(organicUnit.ghostHp).toBe(initialMaxHp);

    for (let i = 0; i < 15; i++) {
      organicUnit.update(1 / 60, [], [headlessUnit], 3000, noop);
    }
    expect(organicUnit.ghostHp).toBe(initialMaxHp);

    for (let i = 0; i < 20; i++) {
      organicUnit.update(1 / 60, [], [headlessUnit], 3000, noop);
    }
    expect(organicUnit.ghostHp).toBeLessThan(initialMaxHp);
    expect(organicUnit.ghostHp).toBeGreaterThanOrEqual(organicUnit.hp);
  });

  it('6. GameLoop chống Spiral of Death: tối đa 2 step bù/frame và bỏ phần accumulator dư', () => {
    const prevRaf = globalThis.requestAnimationFrame;
    const prevCancelRaf = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = (() => 1) as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => {}) as unknown as typeof cancelAnimationFrame;

    try {
      let stepCalls = 0;
      const loop = new GameLoop(
        () => {
          stepCalls++;
        },
        () => {}
      );
      (loop as any).isRunning = true;
      (loop as any).lastTime = 1000;
      (loop as any).fpsSampleStartMs = 1000;

      // Delta 50ms (= 3 ticks 60Hz): chỉ chạy đúng 2 step và bỏ 1 tick dư để không spiral of death
      (loop as any).tick(1050);
      expect(stepCalls).toBe(2);
      expect(loop.perfStats.simSteps).toBe(2);
      expect(loop.perfStats.droppedSteps).toBe(1);
      expect((loop as any).accumulator).toBe(0);
    } finally {
      globalThis.requestAnimationFrame = prevRaf;
      globalThis.cancelAnimationFrame = prevCancelRaf;
    }
  });

  it('7. Hạng mục B & D: Đòn đánh 1v1 lệch nhịp (0 impact trùng tick) và 4v4 không đan xen tiền tuyến', () => {
    const world = new World(false);
    world.setGameMode('LOCAL_2P');
    world.playerUnits = [];
    world.botUnits = [];

    const cavemanCfg = { ...AGES_DATA[1]!.units[0]!, hp: 320 }; // Kéo dài duel để log nhiều nhát chém
    const uL = world.spawnUnit(cavemanCfg, 'LEFT')!;
    const uR = world.spawnUnit(cavemanCfg, 'RIGHT')!;
    uL.x = 2000;
    uR.x = 2130;

    for (let i = 0; i < 360; i++) {
      world.update(1 / 60);
    }

    expect(world.impactLogs.length).toBeGreaterThanOrEqual(4);
    const leftTicks = new Set(world.impactLogs.filter((l) => l.team === 'LEFT').map((l) => l.tick));
    const rightTicks = new Set(world.impactLogs.filter((l) => l.team === 'RIGHT').map((l) => l.tick));
    let simultaneousHits = 0;
    for (const t of leftTicks) {
      if (rightTicks.has(t)) simultaneousHits++;
    }
    expect(simultaneousHits).toBe(0);

    // Kiểm tra 4v4 không đan xen tiền tuyến (Hạng mục D)
    world.reset();
    world.setGameMode('LOCAL_2P');
    const c1 = AGES_DATA[1]!.units[0]!;
    for (const d of [0, 95, 190, 285]) {
      const a = world.spawnUnit(c1, 'LEFT')!;
      a.x = 1800 - d;
      const b = world.spawnUnit(c1, 'RIGHT')!;
      b.x = 2050 + d;
    }
    for (let i = 0; i < 180; i++) {
      world.update(1 / 60);
      const aliveL = world.playerUnits.filter((u) => u.isAlive);
      const aliveR = world.botUnits.filter((u) => u.isAlive);
      if (aliveL.length > 0 && aliveR.length > 0) {
        const maxLeftX = Math.max(...aliveL.map((u) => u.x));
        const minRightX = Math.min(...aliveR.map((u) => u.x));
        expect(maxLeftX).toBeLessThan(minRightX);
      }
    }
  });
});
