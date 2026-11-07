/**
 * The Singularity Odyssey — Live Stream Interactive Ingress
 * Xử lý sự kiện từ Livestream (TikTok Live, YouTube, OBS Chat)
 * Có Rate Limiting (1 lệnh/2s mỗi người dùng) và giả lập MockLiveSource để test trên Local.
 */

import { type World } from '../engine/World';

export interface ILiveEventSource {
  onChat(user: string, text: string): boolean;
  onLike(user: string, count: number): void;
  onGift(user: string, giftName: string, count: number): void;
}

export class LiveEventManager implements ILiveEventSource {
  private userLastCommandTime: Map<string, number> = new Map();
  public readonly rateLimitSeconds: number = 2.0;

  constructor(private readonly world: World) {}

  /**
   * Kiểm tra xem user có bị rate limit không (1 lệnh / 2 giây)
   */
  private checkRateLimit(user: string): boolean {
    const now = Date.now();
    const lastTime = this.userLastCommandTime.get(user.toLowerCase()) || 0;
    if (now - lastTime < this.rateLimitSeconds * 1000) {
      return false; // Bị giới hạn tần suất
    }
    this.userLastCommandTime.set(user.toLowerCase(), now);
    return true;
  }

  /**
   * Xử lý bình luận Chat điều khiển trận đánh
   * !1, !melee -> Sinh lính Melee
   * !2, !ranged -> Sinh lính Ranged
   * !3, !tank -> Sinh lính Tank
   * !4, !special -> Sinh lính Special
   * !up, !age -> Tiến hóa Kỷ Nguyên
   * !ulti -> Kích hoạt Tuyệt chiêu
   */
  public onChat(user: string, text: string): boolean {
    const cleanText = text.trim().toLowerCase();

    if (!this.checkRateLimit(user)) {
      return false;
    }

    const ageConfig = this.world.playerAge.getConfig();
    const [melee, ranged, tank, special] = ageConfig.units;

    if (cleanText === '!1' || cleanText === '1' || cleanText.includes('melee') || cleanText.includes('kiem')) {
      if (melee) {
        this.world.playerEconomy.addGold(melee.cost); // Trợ cấp vàng từ chat
        this.world.spawnPlayerUnit(melee);
        this.world.addFloatingText(`${user}: !1 MELEE`, this.world.baseLeftX + 40, 480, 0x38bdf8);
        return true;
      }
    }

    if (cleanText === '!2' || cleanText === '2' || cleanText.includes('ranged') || cleanText.includes('ban')) {
      if (ranged) {
        this.world.playerEconomy.addGold(ranged.cost);
        this.world.spawnPlayerUnit(ranged);
        this.world.addFloatingText(`${user}: !2 RANGED`, this.world.baseLeftX + 40, 480, 0x38bdf8);
        return true;
      }
    }

    if (cleanText === '!3' || cleanText === '3' || cleanText.includes('tank') || cleanText.includes('giap')) {
      if (tank) {
        this.world.playerEconomy.addGold(tank.cost);
        this.world.spawnPlayerUnit(tank);
        this.world.addFloatingText(`${user}: !3 TANK`, this.world.baseLeftX + 40, 480, 0x38bdf8);
        return true;
      }
    }

    if (cleanText === '!4' || cleanText === '4' || cleanText.includes('special') || cleanText.includes('hacker') || cleanText.includes('ai')) {
      if (special) {
        this.world.playerEconomy.addGold(special.cost);
        this.world.spawnPlayerUnit(special);
        this.world.addFloatingText(`${user}: !4 SPECIAL`, this.world.baseLeftX + 40, 480, 0x10b981);
        return true;
      }
    }

    if (cleanText === '!up' || cleanText === '!age' || cleanText.includes('tien hoa')) {
      if (this.world.playerEconomy.canAgeUp(this.world.playerAge.currentAge)) {
        this.world.ageUpPlayer();
        this.world.addFloatingText(`${user}: AGE UP!`, this.world.baseLeftX + 40, 430, 0xfacc15);
        return true;
      }
    }

    if (cleanText === '!ulti' || cleanText === '!reboot' || cleanText.includes('chieu cuoi')) {
      if (this.world.playerUltimate.canTrigger(this.world.playerAge.currentAge)) {
        this.world.triggerUltimate('LEFT');
        this.world.addFloatingText(`${user}: ULTIMATE!`, 800, 300, 0xf59e0b);
        return true;
      }
    }

    return false;
  }

  /**
   * Xử lý lượt Thả Tim (Like)
   */
  public onLike(user: string, count: number): void {
    const goldBonus = Math.max(1, Math.floor(count * 0.8));
    const xpBonus = Math.max(2, Math.floor(count * 1.5));

    this.world.playerEconomy.addGold(goldBonus);
    this.world.playerEconomy.addXp(xpBonus);

    this.world.addFloatingText(`+${goldBonus}G +${xpBonus}XP (Tim)`, this.world.baseLeftX + 80, 490, 0xf472b6);
  }

  /**
   * Xử lý Quà Tặng (Gift)
   */
  public onGift(user: string, giftName: string, count: number): void {
    const cleanGift = giftName.toLowerCase();
    const ageConfig = this.world.playerAge.getConfig();
    const [, , tank, special] = ageConfig.units;

    if (cleanGift.includes('rose') || cleanGift.includes('hoa') || cleanGift.includes('tim')) {
      // Quà nhỏ: Triệu hồi Tank che chắn
      if (tank) {
        this.world.playerEconomy.addGold(tank.cost);
        this.world.spawnPlayerUnit(tank);
        this.world.addFloatingText(`🎁 ${user} tặng ${giftName} x${count}`, this.world.baseLeftX + 40, 450, 0xf43f5e);
      }
    } else {
      // Quà lớn: Triệu hồi Special Unit hoặc Kích hoạt thẳng Chiêu Cuối
      if (special) {
        this.world.playerEconomy.addGold(special.cost);
        this.world.spawnPlayerUnit(special);
      }
      this.world.playerUltimate.cooldownTimer = 0; // Hồi chiêu ngay lập tức
      this.world.triggerUltimate('LEFT');
      this.world.addFloatingText(`👑 ĐẠI LỄ TẶNG QUÀ: ${user} x${count}!`, 800, 270, 0xfbbf24);
    }
  }
}
