/**
 * The Singularity Odyssey — Age Manager
 * Quản lý thời kỳ hiện tại, chuyển giao công nghệ, mở khóa danh sách quân, tháp và chiêu cuối.
 */

import { AGES_DATA, type AgeConfig, type Team } from '../data/ages';

export class AgeManager {
  public currentAge: number = 1;
  public readonly team: Team;

  constructor(team: Team, initialAge: number = 1) {
    this.team = team;
    this.currentAge = initialAge;
  }

  public reset(initialAge: number = 1): void {
    this.currentAge = initialAge;
  }

  public getConfig(): AgeConfig {
    return AGES_DATA[this.currentAge] || AGES_DATA[1]!;
  }

  public getNextConfig(): AgeConfig | null {
    return AGES_DATA[this.currentAge + 1] || null;
  }

  public hasMaxAge(): boolean {
    return !AGES_DATA[this.currentAge + 1];
  }

  public getAgeProgressPercent(currentXp: number): number {
    const next = this.getNextConfig();
    if (!next) return 1.0;
    const currentBaseXp = this.getConfig().xpRequired;
    const needed = next.xpRequired - currentBaseXp;
    const currentAccum = Math.max(0, currentXp - currentBaseXp);
    return Math.min(1.0, currentAccum / needed);
  }

  /**
   * Tiến hóa lên kỷ nguyên tiếp theo
   */
  public advanceAge(): boolean {
    if (this.hasMaxAge()) return false;
    this.currentAge += 1;
    return true;
  }

  /**
   * Đặt trực tiếp thời kỳ (hỗ trợ chuyển thẳng sang Kỷ Nguyên AI để test)
   */
  public setAge(ageId: number): void {
    if (AGES_DATA[ageId]) {
      this.currentAge = ageId;
    }
  }
}
