/**
 * The Singularity Odyssey — Ultimate Ability System
 * Kỹ năng tối thượng theo từng Kỷ Nguyên.
 * Hỗ trợ cơ chế Mưa Đạn Pháo / Thiên Thạch rơi ngẫu nhiên từ bầu trời (~8 quả, tỉ lệ trúng tự nhiên ~20%–80%).
 */

import { AGES_DATA, BASE_WIDTH, LANE_WIDTH, type Team } from '../data/ages';
import { type Unit } from './Unit';

export interface BarrageShellSpec {
  delay: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  speed: number;
  radius: number;
  splashRadius: number;
  color: number;
  damagePercentMaxHp: number;
  stunDuration: number;
}

export interface UltimateExecutionResult {
  success: boolean;
  ageId: number;
  effectType: string;
  name: string;
  glitchScreen?: boolean;
  glitchDuration?: number;
  meteorsCount?: number;
  barrageShells?: BarrageShellSpec[];
  affectedCount: number;
}

export class UltimateManager {
  public cooldownTimer: number = 0;
  public readonly team: Team;
  public resurrectPoolRemaining: number = 5; // Tối đa 5 quân hồi sinh từ System Reboot
  public random: () => number = Math.random;

  constructor(team: Team) {
    this.team = team;
  }

  public reset(): void {
    this.cooldownTimer = 0;
    this.resurrectPoolRemaining = 5;
  }

  public update(dt: number): void {
    if (this.cooldownTimer > 0) {
      this.cooldownTimer -= dt;
      if (this.cooldownTimer < 0) this.cooldownTimer = 0;
    }
  }

  public canTrigger(currentAge: number): boolean {
    const config = AGES_DATA[currentAge]?.ultimate;
    if (!config) return false;
    return this.cooldownTimer <= 0;
  }

  public getCooldownPercent(currentAge: number): number {
    const config = AGES_DATA[currentAge]?.ultimate;
    if (!config || config.cooldown <= 0) return 0;
    return Math.min(1.0, this.cooldownTimer / config.cooldown);
  }

  /**
   * Kích hoạt Tuyệt Chiêu Tối Thượng
   */
  public trigger(
    currentAge: number,
    enemies: readonly Unit[],
    onDamageDealt: (target: Unit, damage: number) => void,
    onCombatEvent?: (evt: any) => void
  ): UltimateExecutionResult {
    const config = AGES_DATA[currentAge]?.ultimate;
    if (!config || this.cooldownTimer > 0) {
      return { success: false, ageId: currentAge, effectType: '', name: '', affectedCount: 0 };
    }

    this.cooldownTimer = config.cooldown;
    let affectedCount = 0;

    const aliveEnemies = enemies.filter((e) => e.isAlive);
    const isTeamLeft = this.team === 'LEFT';
    const dir = isTeamLeft ? 1 : -1;

    // KỶ NGUYÊN 6: SYSTEM REBOOT (TÁI LẬP ĐIỂM KỲ DỊ)
    if (config.effectType === 'SYSTEM_REBOOT') {
      let targetCenter = LANE_WIDTH / 2;
      if (aliveEnemies.length > 0) {
        let leadX = aliveEnemies[0]!.x;
        for (const e of aliveEnemies) {
          if (isTeamLeft ? e.x < leadX : e.x > leadX) leadX = e.x;
        }
        targetCenter = leadX;
      }

      this.resurrectPoolRemaining = 5;
      for (const enemy of aliveEnemies) {
        if (Math.abs(enemy.x - targetCenter) > config.aoeRadius) continue;
        enemy.status.applyEffect('STUN', config.stunDuration, 1.0, 'REFRESH');
        enemy.status.applyEffect('REBOOT_MARKED', 3.5, 0.3, 'REFRESH');
        const damage = enemy.maxHp * config.damagePercentMaxHp;
        enemy.takeDamage(damage, 'SPECIAL', null, onCombatEvent);
        onDamageDealt(enemy, damage);
        affectedCount++;
      }

      return {
        success: true,
        ageId: currentAge,
        effectType: config.effectType,
        name: config.name,
        glitchScreen: true,
        glitchDuration: 2.0,
        affectedCount,
      };
    }

    // MƯA ĐẠN PHÁO / THIÊN THẠCH RƠI NGẪU NHIÊN (8 QUẢ, TỈ LỆ TRÚNG NGẪU NHIÊN ~20% - 80%)
    // Áp dụng cho Đại Pháo Hoàng Gia (CANNONADE) và các chiêu mưa đạn từ trên trời
    const shellCount = 8;
    const minLaneX = BASE_WIDTH + 90;
    const maxLaneX = LANE_WIDTH - BASE_WIDTH - 90;

    // Vùng rơi mặc định đối xứng gương hoàn hảo qua tâm sân
    const ownBaseBuffer = BASE_WIDTH + 260; // 400px
    const enemyBaseBuffer = BASE_WIDTH + 90; // 230px
    let zoneMinX = isTeamLeft ? ownBaseBuffer : enemyBaseBuffer;
    let zoneMaxX = isTeamLeft ? LANE_WIDTH - enemyBaseBuffer : LANE_WIDTH - ownBaseBuffer;

    if (aliveEnemies.length > 0) {
      const xs = aliveEnemies.map((e) => e.x);
      const minEx = Math.min(...xs);
      const maxEx = Math.max(...xs);
      const centerEx = (minEx + maxEx) / 2;
      const halfSpan = Math.max(360, (maxEx - minEx) / 2 + 240);
      zoneMinX = Math.max(minLaneX, centerEx - halfSpan);
      zoneMaxX = Math.min(maxLaneX, centerEx + halfSpan);
    }

    const shellColors: Record<string, number> = {
      METEOR_SHOWER: 0xf97316,
      ARROW_RAIN: 0xfacc15,
      CANNONADE: 0xd97706,
      AIRSTRIKE: 0xef4444,
      ION_CANNON: 0x38bdf8,
    };
    const shellColor = shellColors[config.effectType] || 0xf59e0b;
    const splashRadius = config.effectType === 'ARROW_RAIN' ? 62 : 70;
    const shellRadius = config.effectType === 'ARROW_RAIN' ? 7 : 12;

    const barrageShells: BarrageShellSpec[] = [];
    for (let i = 0; i < shellCount; i++) {
      const delay = i * 0.14 + this.random() * 0.06;
      const speed = 640 + this.random() * 90;
      const startY = -80 - this.random() * 40;
      const estFlightTime = delay + (536 - startY) / speed;

      let targetX: number;
      if (aliveEnemies.length > 0 && this.random() < 0.72) {
        // Nhắm đón đầu quanh khu vực quân địch nhưng kèm độ lệch ngẫu nhiên (±165px)
        // Với bán kính nổ 62-70px -> Xác suất mỗi quả trúng ~42-50% (dao động tự nhiên ~20% - 80% trên 8 quả!)
        const pick = aliveEnemies[Math.floor(this.random() * aliveEnemies.length)]!;
        const moveDir = pick.team === 'LEFT' ? 1 : -1;
        const predictedX =
          pick.state === 'WALK' ? pick.x + moveDir * pick.config.speed * estFlightTime : pick.x;
        const scatter = (this.random() - 0.5) * 330;
        // Nhân dir vào scatter để đảm bảo phép chiếu gương đối xứng tuyệt đối qua tâm sân
        targetX = Math.max(minLaneX, Math.min(maxLaneX, predictedX + dir * scatter));
      } else {
        // Rơi phân bổ ngẫu nhiên trên vùng chiến sự (đối xứng gương qua tâm)
        const span = Math.max(120, zoneMaxX - zoneMinX);
        const r = this.random();
        targetX = isTeamLeft ? zoneMinX + r * span : zoneMaxX - r * span;
        targetX = Math.max(minLaneX, Math.min(maxLaneX, targetX));
      }

      barrageShells.push({
        delay,
        startX: targetX - dir * (130 + this.random() * 70),
        startY,
        targetX,
        targetY: 536,
        speed,
        radius: shellRadius,
        splashRadius,
        color: shellColor,
        damagePercentMaxHp: config.damagePercentMaxHp * 0.75,
        stunDuration: config.stunDuration,
      });
    }

    return {
      success: true,
      ageId: currentAge,
      effectType: config.effectType,
      name: config.name,
      meteorsCount: shellCount,
      barrageShells,
      affectedCount: barrageShells.length,
    };
  }

  /**
   * Kiểm tra cơ hội hồi sinh đơn vị vừa chết nếu có REBOOT_MARKED
   */
  public tryClaimRebootResurrect(unit: Unit): boolean {
    if (this.resurrectPoolRemaining <= 0) return false;
    if (!unit.status.has('REBOOT_MARKED')) return false;

    const roll = this.random();
    if (roll < 0.3) {
      this.resurrectPoolRemaining -= 1;
      return true;
    }
    return false;
  }
}
