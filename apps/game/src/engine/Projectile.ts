/**
 * The Singularity Odyssey — Projectile System & Object Pooling
 * Quản lý đạn tầm xa (đá ném, mũi tên, đạn pháo, laser, mã độc neural)
 * Tái sử dụng đối tượng qua Pool để đảm bảo 60 FPS không bị spike Garbage Collector.
 */

import { type Team, type UnitType } from '../data/ages';
import { type StatusEffectType } from './StatusEffect';

export interface ProjectileEffect {
  type: StatusEffectType;
  duration: number;
  value: number;
}

export class Projectile {
  public id: string = '';
  public active: boolean = false;

  public x: number = 0;
  public y: number = 0;
  public prevX: number = 0;
  public prevY: number = 0;
  public targetX: number = 0;
  public targetY: number = 0;
  public targetUnitId: string | null = null;

  public speed: number = 400;
  public damage: number = 20;
  public attackerType: UnitType = 'RANGED';
  public sourceTeam: Team = 'LEFT';
  public color: number = 0xffffff;
  public radius: number = 4;
  public splashRadius: number = 0; // Bán kính nổ lan (AoE)

  // Hiệu ứng đặc biệt mang theo
  public effectsToApply: ProjectileEffect[] = [];
  public convertChance: number = 0; // Dành cho Neural Hacker (15%)
  public damagePercentMaxHp: number = 0; // Sát thương % máu tối đa (dành cho mưa đạn pháo Ultimate)
  public isUltimateBarrage: boolean = false;

  public vx: number = 0;
  public vy: number = 0;
  public lifeTime: number = 0;
  public maxLifeTime: number = 4.0; // Tự hủy sau 4 giây nếu lạc mục tiêu

  public init(
    id: string,
    startX: number,
    startY: number,
    targetX: number,
    targetY: number,
    targetUnitId: string | null,
    damage: number,
    attackerType: UnitType,
    sourceTeam: Team,
    speed: number,
    color: number,
    radius: number = 4,
    splashRadius: number = 0,
    effectsToApply: ProjectileEffect[] = [],
    convertChance: number = 0
  ): void {
    this.id = id;
    this.active = true;
    this.x = startX;
    this.y = startY;
    this.prevX = startX;
    this.prevY = startY;
    this.targetX = targetX;
    this.targetY = targetY;
    this.targetUnitId = targetUnitId;
    this.damage = damage;
    this.attackerType = attackerType;
    this.sourceTeam = sourceTeam;
    this.speed = speed;
    this.color = color;
    this.radius = radius;
    this.splashRadius = splashRadius;
    this.effectsToApply = effectsToApply;
    this.convertChance = convertChance;
    this.lifeTime = 0;

    const dx = targetX - startX;
    const dy = targetY - startY;
    const dist = Math.hypot(dx, dy) || 1;
    this.vx = (dx / dist) * speed;
    this.vy = (dy / dist) * speed;
  }

  public update(dt: number): boolean {
    if (!this.active) return false;

    this.prevX = this.x;
    this.prevY = this.y;

    this.lifeTime += dt;
    if (this.lifeTime >= this.maxLifeTime) {
      this.active = false;
      return false;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Kiểm tra chạm gần đích
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const distRemaining = Math.hypot(dx, dy);

    if (distRemaining <= Math.max(12, this.speed * dt)) {
      this.x = this.targetX;
      this.y = this.targetY;
      return true; // Báo hiệu đã trúng đích
    }

    return false;
  }

  public reset(): void {
    this.active = false;
    this.targetUnitId = null;
    this.effectsToApply = [];
    this.convertChance = 0;
    this.splashRadius = 0;
    this.damagePercentMaxHp = 0;
    this.isUltimateBarrage = false;
  }
}

/**
 * Object Pool cho Projectiles để tối ưu hóa bộ nhớ 60 FPS
 */
export class ProjectilePool {
  private pool: Projectile[] = [];
  private activeList: Projectile[] = [];
  private nextId = 1;

  constructor(initialCapacity: number = 80) {
    for (let i = 0; i < initialCapacity; i++) {
      this.pool.push(new Projectile());
    }
  }

  public acquire(): Projectile {
    let p = this.pool.pop();
    if (!p) {
      p = new Projectile();
    }
    p.id = `proj_${this.nextId++}`;
    this.activeList.push(p);
    return p;
  }

  public release(projectile: Projectile): void {
    projectile.reset();
    const idx = this.activeList.indexOf(projectile);
    if (idx !== -1) {
      this.activeList.splice(idx, 1);
    }
    this.pool.push(projectile);
  }

  public getActive(): readonly Projectile[] {
    return this.activeList;
  }

  public clear(): void {
    for (const p of this.activeList) {
      p.reset();
      this.pool.push(p);
    }
    this.activeList.length = 0;
  }
}
