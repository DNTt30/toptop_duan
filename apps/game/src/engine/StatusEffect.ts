/**
 * The Singularity Odyssey — Status Effect System
 * Quản lý các hiệu ứng trạng thái (buff/debuff/khống chế/bảo hộ/chuyển phe)
 * Có duration, stack rule, tái sử dụng linh hoạt cho mọi kỷ nguyên.
 */

export type StatusEffectType =
  | 'SLOW' // Giảm tốc chạy và tốc đánh
  | 'STUN' // Đóng băng, không thể di chuyển hoặc tấn công
  | 'ARMOR_SHRED' // Giảm giáp, nhận thêm sát thương (%)
  | 'BUFF_DAMAGE' // Tăng sát thương gây ra (%)
  | 'BUFF_SPEED' // Tăng tốc chạy và tốc đánh (%)
  | 'SHIELD' // Lá chắn hấp thụ sát thương (điểm máu ảo)
  | 'IMMUNE_PHYSICAL' // Miễn nhiễm hoàn toàn sát thương vật lý
  | 'REBOOT_MARKED'; // Đánh dấu bởi System Reboot (khi chết có 30% hồi sinh phe đối diện)

export type StackRule = 'REFRESH' | 'EXTEND' | 'STACK_INTENSITY';

export interface StatusEffect {
  id: string;
  type: StatusEffectType;
  duration: number; // Thời gian còn lại (giây)
  maxDuration: number;
  value: number; // Giá trị hiệu ứng (ví dụ: 0.35 cho -35% slow, hoặc 150 điểm shield)
  stackRule: StackRule;
  stacks: number;
  maxStacks: number;
  sourceUnitId?: string;
}

export class StatusEffectManager {
  private effects: Map<StatusEffectType, StatusEffect> = new Map();

  /**
   * Thêm hoặc làm mới hiệu ứng
   */
  public applyEffect(
    type: StatusEffectType,
    duration: number,
    value: number = 0,
    stackRule: StackRule = 'REFRESH',
    maxStacks: number = 3,
    sourceUnitId?: string
  ): void {
    const existing = this.effects.get(type);
    if (!existing) {
      this.effects.set(type, {
        id: `eff_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        type,
        duration,
        maxDuration: duration,
        value,
        stackRule,
        stacks: 1,
        maxStacks,
        sourceUnitId,
      });
      return;
    }

    switch (stackRule) {
      case 'REFRESH':
        existing.duration = Math.max(existing.duration, duration);
        existing.value = value;
        break;
      case 'EXTEND':
        existing.duration += duration;
        existing.value = Math.max(existing.value, value);
        break;
      case 'STACK_INTENSITY':
        existing.duration = Math.max(existing.duration, duration);
        if (existing.stacks < maxStacks) {
          existing.stacks += 1;
        }
        break;
    }
  }

  /**
   * Cập nhật thời gian còn lại mỗi tick
   */
  public update(dt: number): void {
    for (const [type, effect] of this.effects.entries()) {
      effect.duration -= dt;
      if (effect.duration <= 0) {
        this.effects.delete(type);
      }
    }
  }

  public has(type: StatusEffectType): boolean {
    return this.effects.has(type);
  }

  public get(type: StatusEffectType): StatusEffect | undefined {
    return this.effects.get(type);
  }

  public remove(type: StatusEffectType): void {
    this.effects.delete(type);
  }

  public clear(): void {
    this.effects.clear();
  }

  public getAll(): StatusEffect[] {
    return Array.from(this.effects.values());
  }

  // ==========================================
  // CÁC HÀM TÍNH TOÁN CHỈ SỐ THEO HIỆU ỨNG
  // ==========================================

  /**
   * Kiểm tra xem đơn vị có bị choáng/đóng băng không
   */
  public isStunned(): boolean {
    return this.effects.has('STUN');
  }

  /**
   * Kiểm tra xem đơn vị có đang miễn nhiễm sát thương vật lý không
   */
  public isImmunePhysical(): boolean {
    return this.effects.has('IMMUNE_PHYSICAL');
  }

  /**
   * Hệ số nhân tốc độ di chuyển và tốc độ đánh
   */
  public getSpeedMultiplier(): number {
    if (this.isStunned()) return 0;
    let mult = 1.0;

    const slow = this.effects.get('SLOW');
    if (slow) {
      mult *= Math.max(0.2, 1.0 - slow.value);
    }

    const buff = this.effects.get('BUFF_SPEED');
    if (buff) {
      mult *= 1.0 + buff.value * buff.stacks;
    }

    return mult;
  }

  /**
   * Hệ số nhân sát thương gây ra
   */
  public getOutgoingDamageMultiplier(): number {
    const buff = this.effects.get('BUFF_DAMAGE');
    if (buff) {
      return 1.0 + buff.value * buff.stacks;
    }
    return 1.0;
  }

  /**
   * Hệ số nhân sát thương nhận vào (ví dụ do giảm giáp ARMOR_SHRED)
   */
  public getIncomingDamageMultiplier(): number {
    const shred = this.effects.get('ARMOR_SHRED');
    if (shred) {
      return 1.0 + shred.value * shred.stacks;
    }
    return 1.0;
  }

  /**
   * Hấp thụ sát thương bằng Shield nếu có
   * Trả về lượng sát thương còn sót lại sau khi trừ khiên
   */
  public absorbDamage(damage: number): number {
    const shield = this.effects.get('SHIELD');
    if (!shield || shield.value <= 0) return damage;

    if (shield.value >= damage) {
      shield.value -= damage;
      return 0;
    } else {
      const remainingDamage = damage - shield.value;
      this.effects.delete('SHIELD');
      return remainingDamage;
    }
  }
}
