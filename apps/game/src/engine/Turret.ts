/**
 * The Singularity Odyssey — Turret Defense System
 * Quản lý 3 vị trí tháp canh phòng thủ trên nóc căn cứ (Mua, bán hoàn tiền 70%, tự động nhắm bắn).
 */

import { type Team, type TurretConfig } from '../data/ages';
import { type Unit } from './Unit';

export class Turret {
  public readonly config: TurretConfig;
  public readonly slotIndex: number;
  public readonly team: Team;
  public cooldownTimer: number = 0;
  public x: number = 0;
  public y: number = 0;
  public damageMultiplier: number = 1.0;
  public rangeMultiplier: number = 1.0;

  constructor(
    config: TurretConfig,
    slotIndex: number,
    team: Team,
    x: number,
    y: number,
    damageMultiplier: number = 1.0,
    rangeMultiplier: number = 1.0
  ) {
    this.config = config;
    this.slotIndex = slotIndex;
    this.team = team;
    this.x = x;
    this.y = y;
    this.damageMultiplier = damageMultiplier;
    this.rangeMultiplier = rangeMultiplier;
  }

  public get range(): number {
    return this.config.range * this.rangeMultiplier;
  }

  public get damage(): number {
    return this.config.damage * this.damageMultiplier;
  }

  public update(
    dt: number,
    enemies: readonly Unit[],
    onFire: (turret: Turret, target: Unit) => void
  ): void {
    if (this.cooldownTimer > 0) {
      this.cooldownTimer -= dt;
    }

    if (this.cooldownTimer <= 0) {
      // Tìm kẻ địch gần nhất còn sống trong tầm bắn
      let nearestDist = Infinity;
      let target: Unit | null = null;
      const effectiveRange = this.range;

      for (const enemy of enemies) {
        if (!enemy.isAlive) continue;
        const dist = Math.abs(enemy.x - this.x);
        if (dist <= effectiveRange && dist < nearestDist) {
          nearestDist = dist;
          target = enemy;
        }
      }

      if (target) {
        this.cooldownTimer = this.config.fireRate;
        onFire(this, target);
      }
    }
  }
}

export class TurretManager {
  public slots: (Turret | null)[] = [null];
  public readonly team: Team;
  public readonly baseX: number;
  public readonly baseY: number;
  public damageMultiplier: number = 1.0;
  public rangeMultiplier: number = 1.0;
  public maxSlots: number = 3;

  constructor(team: Team, baseX: number, baseY: number) {
    this.team = team;
    this.baseX = baseX;
    this.baseY = baseY;
  }

  public reset(): void {
    this.slots = [null];
    this.damageMultiplier = 1.0;
    this.rangeMultiplier = 1.0;
  }

  public canAddSlot(): boolean {
    return this.slots.length < this.maxSlots;
  }

  public addSlot(): boolean {
    if (this.slots.length >= this.maxSlots) return false;
    this.slots.push(null);
    return true;
  }

  public setUpgradeMultipliers(dmg: number, range: number): void {
    this.damageMultiplier = dmg;
    this.rangeMultiplier = range;
    for (const t of this.slots) {
      if (t) {
        t.damageMultiplier = dmg;
        t.rangeMultiplier = range;
      }
    }
  }

  /**
   * Tính toán vị trí X, Y của từng slot trên nóc căn cứ (khớp 100% với nóc thành Renderer)
   */
  public getSlotPosition(slotIndex: number): { x: number; y: number } {
    const dir = this.team === 'LEFT' ? 1 : -1;
    const slotOffsets = [
      { x: -55 * dir, y: -245 },
      { x: 0, y: -265 },
      { x: 55 * dir, y: -245 },
    ];
    const off = slotOffsets[slotIndex] || slotOffsets[0]!;
    return {
      x: this.baseX + off.x,
      y: 540 + off.y,
    };
  }

  public buildTurret(slotIndex: number, config: TurretConfig): boolean {
    if (slotIndex < 0 || slotIndex >= this.slots.length) return false;
    const pos = this.getSlotPosition(slotIndex);
    this.slots[slotIndex] = new Turret(
      config,
      slotIndex,
      this.team,
      pos.x,
      pos.y,
      this.damageMultiplier,
      this.rangeMultiplier
    );
    return true;
  }

  public sellTurret(slotIndex: number): number {
    if (slotIndex < 0 || slotIndex >= this.slots.length) return 0;
    const turret = this.slots[slotIndex];
    if (!turret) return 0;

    const refund = Math.floor(turret.config.cost * turret.config.sellRefundRate);
    this.slots[slotIndex] = null;
    return refund;
  }

  public update(
    dt: number,
    enemies: readonly Unit[],
    onFire: (turret: Turret, target: Unit) => void
  ): void {
    for (const turret of this.slots) {
      if (turret) {
        turret.update(dt, enemies, onFire);
      }
    }
  }
}
