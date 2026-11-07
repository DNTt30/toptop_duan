/**
 * The Singularity Odyssey — Combat Particle System (Hiệu Năng Cao 60 FPS)
 * Tối ưu hóa bằng Object Pool tĩnh:
 * - Tia lửa va chạm (Hit sparks) & bụi chém
 * - Vệt đạn đạo (Projectile trails)
 * - Vòng sóng nổ (Shockwave rings) & mảnh văng vụn nổ
 * - Hiệu ứng xuất trận (Spawn dust/flash)
 * - Hiệu ứng tử trận (Star & coin particles bay lên)
 * - Màn giới thiệu Ultimate 0.8s (Tên chiêu thức hoành tráng giữa màn hình)
 */

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  shape: 'CIRCLE' | 'STAR' | 'RING' | 'SPARK';
  active: boolean;
}

export interface UltimateIntroBanner {
  active: boolean;
  name: string;
  themeColor: number;
  timer: number;
  duration: number; // 0.8s
}

export class ParticleSystem {
  public static readonly MAX_PARTICLES = 350;
  private pool: Particle[] = [];
  public activeParticles: Particle[] = [];

  // Màn giới thiệu chiêu cuối
  public ultimateIntro: UltimateIntroBanner = {
    active: false,
    name: '',
    themeColor: 0xf59e0b,
    timer: 0,
    duration: 0.8,
  };

  // Cài đặt rung lắc màn hình
  public screenShakeEnabled: boolean = true;

  constructor() {
    for (let i = 0; i < ParticleSystem.MAX_PARTICLES; i++) {
      this.pool.push({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        color: 0xffffff,
        size: 4,
        alpha: 1,
        life: 0,
        maxLife: 1,
        shape: 'CIRCLE',
        active: false,
      });
    }
  }

  public emit(
    x: number,
    y: number,
    count: number,
    color: number,
    shape: 'CIRCLE' | 'STAR' | 'RING' | 'SPARK' = 'CIRCLE',
    speed: number = 80,
    lifeTime: number = 0.5,
    size: number = 4
  ): void {
    for (let i = 0; i < count; i++) {
      const p = this.pool.pop();
      if (!p) break;

      const angle = Math.random() * Math.PI * 2;
      const spd = (0.3 + Math.random() * 0.7) * speed;

      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * spd;
      p.vy = Math.sin(angle) * spd;
      p.color = color;
      p.shape = shape;
      p.size = size * (0.6 + Math.random() * 0.8);
      p.alpha = 1.0;
      p.life = 0;
      p.maxLife = lifeTime * (0.8 + Math.random() * 0.4);
      p.active = true;

      this.activeParticles.push(p);
    }
  }

  // 1. Chớp đánh cận chiến + bụi
  public spawnHitSparks(x: number, y: number, color: number = 0xffe066): void {
    this.emit(x, y, 6, color, 'SPARK', 110, 0.25, 4);
    this.emit(x, y + 10, 4, 0x94a3b8, 'CIRCLE', 40, 0.35, 3);
  }

  // 2. Vụ nổ vòng sóng chấn động + mảnh vụn
  public spawnExplosion(x: number, y: number, color: number = 0xf97316, radius: number = 24): void {
    // Vòng sóng sốc nổ nở rộng
    this.emit(x, y, 1, color, 'RING', 0, 0.45, radius);
    // Mảnh vụn lửa
    this.emit(x, y, 14, color, 'CIRCLE', 160, 0.5, 6);
    this.emit(x, y, 8, 0xfef08a, 'STAR', 120, 0.4, 5);
  }

  // 3. Khói bụi xuất trận tại căn cứ
  public spawnGateDust(x: number, y: number, color: number = 0x64748b): void {
    for (let i = 0; i < 8; i++) {
      const p = this.pool.pop();
      if (!p) break;
      p.x = x + (Math.random() - 0.5) * 30;
      p.y = y;
      p.vx = (Math.random() - 0.5) * 50;
      p.vy = -Math.random() * 60 - 20; // Bay bốc lên
      p.color = color;
      p.shape = 'CIRCLE';
      p.size = 5 + Math.random() * 6;
      p.alpha = 0.75;
      p.life = 0;
      p.maxLife = 0.6;
      p.active = true;
      this.activeParticles.push(p);
    }
  }

  // 4. Ngôi sao cartoon văng lên khi lính tử trận
  public spawnDeathStars(x: number, y: number, bountyColor: number = 0xfacc15): void {
    for (let i = 0; i < 6; i++) {
      const p = this.pool.pop();
      if (!p) break;
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.5; // Hướng lên trời
      const spd = 70 + Math.random() * 80;
      p.x = x;
      p.y = y - 20;
      p.vx = Math.cos(angle) * spd;
      p.vy = Math.sin(angle) * spd;
      p.color = bountyColor;
      p.shape = 'STAR';
      p.size = 6 + Math.random() * 4;
      p.alpha = 1.0;
      p.life = 0;
      p.maxLife = 0.65;
      p.active = true;
      this.activeParticles.push(p);
    }
  }

  // 5. Vệt đạn bay (Trail)
  public spawnTrail(x: number, y: number, color: number): void {
    const p = this.pool.pop();
    if (!p) return;
    p.x = x + (Math.random() - 0.5) * 4;
    p.y = y + (Math.random() - 0.5) * 4;
    p.vx = (Math.random() - 0.5) * 10;
    p.vy = (Math.random() - 0.5) * 10;
    p.color = color;
    p.shape = 'CIRCLE';
    p.size = 3.5;
    p.alpha = 0.7;
    p.life = 0;
    p.maxLife = 0.22;
    p.active = true;
    this.activeParticles.push(p);
  }

  // Vệt bụi đạn đá máy bắn đá
  public spawnDust(x: number, y: number): void {
    const p = this.pool.pop();
    if (!p) return;
    p.x = x + (Math.random() - 0.5) * 6;
    p.y = y + (Math.random() - 0.5) * 6;
    p.vx = (Math.random() - 0.5) * 15;
    p.vy = -Math.random() * 20 - 4;
    p.color = 0x78716c;
    p.shape = 'CIRCLE';
    p.size = Math.random() * 4 + 2;
    p.alpha = 0.55;
    p.life = 0;
    p.maxLife = 0.3;
    p.active = true;
    this.activeParticles.push(p);
  }

  // 6. Kích hoạt giới thiệu Ultimate 0.8s
  public triggerUltimateIntro(name: string, themeColor: number): void {
    this.ultimateIntro.active = true;
    this.ultimateIntro.name = name;
    this.ultimateIntro.themeColor = themeColor;
    this.ultimateIntro.timer = 0.8;
    this.ultimateIntro.duration = 0.8;
  }

  public update(dt: number): void {
    // Cập nhật banner Ultimate Intro
    if (this.ultimateIntro.active) {
      this.ultimateIntro.timer -= dt;
      if (this.ultimateIntro.timer <= 0) {
        this.ultimateIntro.active = false;
      }
    }

    // Cập nhật các hạt active
    for (let i = this.activeParticles.length - 1; i >= 0; i--) {
      const p = this.activeParticles[i]!;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        this.activeParticles.splice(i, 1);
        this.pool.push(p);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // Trọng lực rơi nhẹ
      p.vy += 120 * dt;

      // Độ mờ giảm dần
      p.alpha = Math.max(0, 1.0 - p.life / p.maxLife);
      if (p.shape === 'RING') {
        p.size += 80 * dt; // Vòng sóng nở to dần
      }
    }
  }
}

export const particleSystem = new ParticleSystem();
