/**
 * The Singularity Odyssey — Sân Khấu Chiến Trường 2D PixiJS v8
 * Đồ họa Chuẩn Livestream OBS / TikTok:
 * - Viewport chuẩn 1280x720 (chia 12% HUD trên, 68% Chiến trường, 20% Thanh mua quân)
 * - Safe Area 6% mỗi cạnh
 * - Nền Parallax 4 lớp cho cả 6 Kỷ Nguyên kèm hiệu ứng Crossfade 1.5s
 * - Căn cứ khổng lồ 260x220px, cờ màu phe phấp phới, 3 ô tháp canh nét đứt
 * - Nhân vật Chibi siêu to 90-110px, đầu to 45%, viền đậm 3px, bóng elip dưới chân
 * - Chỉ báo tiền tuyến (Frontline Indicator) tại điểm trung bình giao tranh
 * - Hệ thống hạt Particle (hit sparks, shockwaves, death stars, trails)
 * - Màn giới thiệu Ultimate 0.8s hoành tráng
 */

import { Application, Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { BACKGROUNDS_DATA, type BackgroundConfig } from '../data/backgrounds';
import { AGES_DATA, BASE_MAX_HP, LANE_WIDTH, type Team } from '../data/ages';
import { getSpriteConfig, type SpriteConfig } from '../data/sprites';
import { particleSystem } from './ParticleSystem';
import { spriteLoader } from './SpriteLoader';
import { type Unit } from './Unit';
import { type World } from './World';

export class GameRenderer {
  private app: Application | null = null;
  private rootContainer: Container = new Container();
  public worldContainer: Container = new Container();

  // Texture Cache & Sprites
  private textureMap: Map<string, Texture> = new Map();
  private baseLeftSprite: Sprite = new Sprite();
  private baseRightSprite: Sprite = new Sprite();
  private panoramaBgSprites: [Sprite, Sprite, Sprite] = [new Sprite(), new Sprite(), new Sprite()];
  private panoramaContainer: Container = new Container();
  private unitSpriteContainer: Container = new Container();
  private unitSpritePool: Sprite[] = [];
  private turretSpriteContainer: Container = new Container();
  private turretSpritePool: Sprite[] = [];

  // Các lớp hiển thị phân tầng
  private skyGraphics: Graphics = new Graphics();
  private farMountainGraphics: Graphics = new Graphics();
  private midLandmarkGraphics: Graphics = new Graphics();
  private groundGraphics: Graphics = new Graphics();

  // Lớp Crossfade nền cũ khi đổi kỷ nguyên
  private prevBgContainer: Container = new Container();
  private currentBgContainer: Container = new Container();
  private crossfadeTimer: number = 0;
  private readonly crossfadeDuration: number = 1.5;

  private frontlineGraphics: Graphics = new Graphics();
  private baseGraphics: Graphics = new Graphics();
  private turretGraphics: Graphics = new Graphics();
  private unitGraphics: Graphics = new Graphics();
  private projGraphics: Graphics = new Graphics();
  private particleGraphics: Graphics = new Graphics();
  private fxContainer: Container = new Container();
  private glitchGraphics: Graphics = new Graphics();
  private ultimateIntroGraphics: Graphics = new Graphics();
  private ultimateIntroText: Text | null = null;
  private glitchBannerText: Text | null = null;

  // Text Pool tái sử dụng
  private textPool: Text[] = [];

  // Viewport thiết kế
  public readonly V_WIDTH = 1280;
  public readonly V_HEIGHT = 720;
  public readonly GROUND_Y = 540; // Trục Y mặt đường lane chiến đấu
  public readonly SAFE_X = 1280 * 0.06; // ~76px
  public readonly SAFE_Y = 720 * 0.06; // ~43px

  // Tọa độ căn cứ thế giới (World X)
  public get BASE_LEFT_X(): number {
    return this.world.baseLeftX;
  }
  public get BASE_RIGHT_X(): number {
    return this.world.baseRightX;
  }

  // Camera & Điều khiển bản đồ dài 4480px
  public cameraX: number = 0;
  public targetCameraX: number = 0;
  public manualControlTimer: number = 0;
  private isDragging: boolean = false;
  private dragStartX: number = 0;
  private dragStartCameraX: number = 0;

  private scaleFactor: number = 1.0;
  private baseContainerX: number = 0;
  private baseContainerY: number = 0;
  private isTransparent: boolean = false;
  private isPortrait: boolean = false;

  // Quản lý thời kỳ & hiệu ứng
  private activeAgeId: number = 1;
  private prevAgeId: number = 1;
  private flagWavePhase: number = 0;
  private smokePhase: number = 0;

  // Bản đồ lưu tên người gọi lính (viewer chat name) hiển thị 3s
  private summonerLabels: Map<string, { name: string; timer: number }> = new Map();

  // Debug overlays cho Hitbox & Foot Anchor
  public showHitboxes: boolean = false;
  public showFootAnchors: boolean = false;

  constructor(private readonly world: World) {}

  public async init(container: HTMLElement, isTransparent: boolean = false): Promise<void> {
    this.isTransparent = isTransparent;
    this.app = new Application();

    await this.app.init({
      resizeTo: container,
      backgroundAlpha: isTransparent ? 0.0 : 1.0,
      backgroundColor: isTransparent ? 0x000000 : 0x070b14,
      antialias: false,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });

    this.app.canvas.style.display = 'block';
    this.app.canvas.style.width = '100%';
    this.app.canvas.style.height = '100%';
    container.appendChild(this.app.canvas);

    // Cấu trúc phân tầng
    this.rootContainer = new Container();
    this.app.stage.addChild(this.rootContainer);

    this.prevBgContainer = new Container();
    this.currentBgContainer = new Container();

    this.skyGraphics = new Graphics();
    this.farMountainGraphics = new Graphics();
    this.midLandmarkGraphics = new Graphics();
    this.groundGraphics = new Graphics();

    this.panoramaContainer = new Container();
    for (const s of this.panoramaBgSprites) {
      this.panoramaContainer.addChild(s);
    }

    this.currentBgContainer.addChild(this.skyGraphics);
    this.currentBgContainer.addChild(this.farMountainGraphics);
    this.currentBgContainer.addChild(this.panoramaContainer);
    this.currentBgContainer.addChild(this.midLandmarkGraphics);

    this.rootContainer.addChild(this.prevBgContainer);
    this.rootContainer.addChild(this.currentBgContainer);
    this.rootContainer.addChild(this.worldContainer);
    this.rootContainer.addChild(this.glitchGraphics);
    this.rootContainer.addChild(this.ultimateIntroGraphics);

    this.worldContainer.addChild(this.groundGraphics);
    this.worldContainer.addChild(this.frontlineGraphics);
    this.worldContainer.addChild(this.baseLeftSprite);
    this.worldContainer.addChild(this.baseRightSprite);
    this.worldContainer.addChild(this.baseGraphics);
    this.worldContainer.addChild(this.turretGraphics);
    this.worldContainer.addChild(this.turretSpriteContainer);
    this.worldContainer.addChild(this.unitSpriteContainer);
    this.worldContainer.addChild(this.unitGraphics);
    this.worldContainer.addChild(this.projGraphics);
    this.worldContainer.addChild(this.particleGraphics);
    this.worldContainer.addChild(this.fxContainer);

    // Lắng nghe sự kiện kéo chuột/cảm ứng để xem chiến trường thủ công
    const canvas = this.app.canvas;
    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartCameraX = this.cameraX;
      this.manualControlTimer = 3.0; // Giữ camera thủ công 3 giây
    });

    window.addEventListener('pointermove', (e: PointerEvent) => {
      if (!this.isDragging) return;
      const delta = (e.clientX - this.dragStartX) / this.scaleFactor;
      this.cameraX = Math.max(0, Math.min(LANE_WIDTH - this.V_WIDTH, this.dragStartCameraX - delta));
      this.manualControlTimer = 3.0;
    });

    const stopDrag = () => {
      this.isDragging = false;
    };
    window.addEventListener('pointerup', stopDrag);
    window.addEventListener('pointercancel', stopDrag);

    // Tải trước textures đồ họa
    await this.preloadTextures();

    // Khởi tạo Text Pool cho số sát thương và tên viewer
    for (let i = 0; i < 45; i++) {
      const t = new Text({
        text: '',
        style: {
          fontSize: 18,
          fontWeight: '900',
          fill: 0xffffff,
          stroke: { color: 0x000000, width: 4 },
        },
      });
      t.anchor.set(0.5);
      t.visible = false;
      this.textPool.push(t);
      this.fxContainer.addChild(t);
    }

    // Banner Ultimate Intro
    this.ultimateIntroText = new Text({
      text: '',
      style: {
        fontSize: 42,
        fontWeight: '900',
        fill: 0xfacc15,
        stroke: { color: 0x000000, width: 8 },
        letterSpacing: 3,
      },
    });
    this.ultimateIntroText.anchor.set(0.5);
    this.ultimateIntroText.x = this.V_WIDTH / 2;
    this.ultimateIntroText.y = this.V_HEIGHT / 2 - 30;
    this.ultimateIntroText.visible = false;
    this.ultimateIntroGraphics.addChild(this.ultimateIntroText);

    // Banner System Reboot
    this.glitchBannerText = new Text({
      text: '⚠️ [SYSTEM REBOOT — MATRIX GLITCH] ⚠️',
      style: {
        fontSize: 34,
        fontWeight: '900',
        fill: 0x10b981,
        stroke: { color: 0x022c22, width: 6 },
        letterSpacing: 2,
      },
    });
    this.glitchBannerText.anchor.set(0.5);
    this.glitchBannerText.x = this.V_WIDTH / 2;
    this.glitchBannerText.y = 200;
    this.glitchBannerText.visible = false;
    this.glitchGraphics.addChild(this.glitchBannerText);

    this.onResize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    window.addEventListener('resize', () => {
      if (container) {
        this.onResize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
      }
    });

    this.renderFullBackground(this.skyGraphics, this.farMountainGraphics, this.midLandmarkGraphics, this.groundGraphics, 1);
  }

  private async preloadTextures(): Promise<void> {
    const list: [string, string][] = [
      ['base_age1_left', './assets/bases/prehistoric_base_left.png'],
      ['base_age1_right', './assets/bases/prehistoric_base_right.png'],
      ['base_age2_left', './assets/bases/medieval_base_left.png'],
      ['base_age2_right', './assets/bases/medieval_base_right.png'],
      ['base_age3_left', './assets/bases/renaissance_base_left.png'],
      ['base_age3_right', './assets/bases/renaissance_base_right.png'],
      ['turret_age1_1', './assets/turrets/prehistoric_turret_1.png'],
      ['turret_age1_2', './assets/turrets/prehistoric_turret_2.png'],
      ['turret_age1_3', './assets/turrets/prehistoric_turret_3.png'],
      ['turret_age2_1', './assets/turrets/medieval_turret_1.png'],
      ['turret_age2_2', './assets/turrets/medieval_turret_2.png'],
      ['turret_age2_3', './assets/turrets/medieval_turret_3.png'],
      ['turret_age3_1', './assets/turrets/renaissance_turret_1.png'],
      ['turret_age3_2', './assets/turrets/renaissance_turret_2.png'],
      ['turret_age3_3', './assets/turrets/renaissance_turret_3.png'],
      ['bg_panorama_age1', './assets/backgrounds/prehistoric_bg_panorama.png'],
      ['bg_panorama_age2', './assets/backgrounds/medieval_bg_panorama.png'],
      ['bg_panorama_age3', './assets/backgrounds/renaissance_bg_panorama.png'],
      // Units 6 Kỷ Nguyên
      ['unit_age1_melee', './assets/units/age1_unit_melee.png'],
      ['unit_age1_ranged', './assets/units/age1_unit_ranged.png'],
      ['unit_age1_tank', './assets/units/age1_unit_tank.png'],
      ['unit_age1_special', './assets/units/age1_unit_special.png'],
      ['unit_age2_melee', './assets/units/age2_unit_melee.png'],
      ['unit_age2_ranged', './assets/units/age2_unit_ranged.png'],
      ['unit_age2_tank', './assets/units/age2_unit_tank.png'],
      ['unit_age2_special', './assets/units/age2_unit_special.png'],
      ['unit_age3_melee', './assets/units/age3_unit_melee.png'],
      ['unit_age3_ranged', './assets/units/age3_unit_ranged.png'],
      ['unit_age3_tank', './assets/units/age3_unit_tank.png'],
      ['unit_age3_special', './assets/units/age3_unit_special.png'],
      ['unit_age4_melee', './assets/units/age4_unit_melee.png'],
      ['unit_age4_ranged', './assets/units/age4_unit_ranged.png'],
      ['unit_age4_tank', './assets/units/age4_unit_tank.png'],
      ['unit_age4_special', './assets/units/age4_unit_special.png'],
      ['unit_age5_melee', './assets/units/age5_unit_melee.png'],
      ['unit_age5_ranged', './assets/units/age5_unit_ranged.png'],
      ['unit_age5_tank', './assets/units/age5_unit_tank.png'],
      ['unit_age5_special', './assets/units/age5_unit_special.png'],
      ['unit_age6_melee', './assets/units/age6_unit_melee.png'],
      ['unit_age6_ranged', './assets/units/age6_unit_ranged.png'],
      ['unit_age6_tank', './assets/units/age6_unit_tank.png'],
      ['unit_age6_special', './assets/units/age6_unit_special.png'],
    ];

    await Promise.allSettled(
      list.map(async ([key, url]) => {
        try {
          const tex = await Assets.load(url);
          if (tex) this.textureMap.set(key, tex);
        } catch (e) {
          // Fallback
        }
      })
    );

    // Nạp trước Sprite Atlas Kỷ nguyên 1 và nạp nền toàn bộ 6 Kỷ nguyên
    await this.preloadAgeSprites(1);
    void this.preloadAllAges();
  }

  /**
   * Nạp trước toàn bộ Sprite của tất cả 6 kỷ nguyên để triệt tiêu độ trễ
   */
  public async preloadAllAges(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (let age = 1; age <= 6; age++) {
      promises.push(this.preloadAgeSprites(age));
    }
    await Promise.all(promises);
  }

  /**
   * Nạp trước toàn bộ Sprite của một kỷ nguyên để giảm draw call
   */
  public async preloadAgeSprites(age: number): Promise<void> {
    const ageConfig = AGES_DATA[age];
    if (ageConfig) {
      const configs = ageConfig.units.map((u) => getSpriteConfig(u.id)).filter(Boolean) as SpriteConfig[];
      await spriteLoader.preloadAgeSprites(age, configs);
    }
  }

  public registerSummoner(unitId: string, viewerName: string): void {
    this.summonerLabels.set(unitId, { name: viewerName, timer: 3.0 });
  }

  public onResize(windowWidth: number, windowHeight: number): void {
    if (!this.app) return;

    const w = windowWidth > 0 ? windowWidth : window.innerWidth;
    const h = windowHeight > 0 ? windowHeight : window.innerHeight;

    this.isPortrait = h > w;

    // Viewport thiết kế chuẩn: 1280x720
    const scaleX = w / this.V_WIDTH;
    const scaleY = h / this.V_HEIGHT;
    this.scaleFactor = Math.min(scaleX, scaleY);

    this.baseContainerX = (w - this.V_WIDTH * this.scaleFactor) / 2;
    if (this.isPortrait) {
      // Trong màn hình dọc (TikTok LIVE 720x1280), định vị sàn đấu ở phần trên trung tâm
      this.baseContainerY = Math.max(90, (h - this.V_HEIGHT * this.scaleFactor) * 0.26);
    } else {
      this.baseContainerY = (h - this.V_HEIGHT * this.scaleFactor) / 2;
    }

    this.rootContainer.scale.set(this.scaleFactor);
    this.rootContainer.x = this.baseContainerX;
    this.rootContainer.y = this.baseContainerY;
  }

  /**
   * Vòng lặp render chính
   */
  public render(_interpolation: number): void {
    if (!this.app) return;

    const dt = 1 / 60;
    this.flagWavePhase += dt * 4;
    this.smokePhase += dt * 2;

    // Cập nhật hệ thống hạt
    particleSystem.update(dt);

    // Cập nhật nhãn tên viewer
    for (const [id, label] of this.summonerLabels.entries()) {
      label.timer -= dt;
      if (label.timer <= 0) {
        this.summonerLabels.delete(id);
      }
    }

    // 1. Kiểm tra chuyển Kỷ Nguyên để kích hoạt Crossfade 1.5s
    const currentAge = this.world.playerAge.currentAge;
    if (currentAge !== this.activeAgeId) {
      this.startBackgroundCrossfade(currentAge);
    }

    // Cập nhật Crossfade timer
    if (this.crossfadeTimer > 0) {
      this.crossfadeTimer -= dt;
      const progress = Math.max(0, this.crossfadeTimer / this.crossfadeDuration);
      this.prevBgContainer.alpha = progress;
      if (this.crossfadeTimer <= 0) {
        this.prevBgContainer.removeChildren();
      }
    }

    // 2. Rung lắc màn hình (Screen Shake)
    if (particleSystem.screenShakeEnabled && this.world.screenShake > 0) {
      const shakeAmt = this.world.screenShake * 4.0;
      this.rootContainer.position.set(
        this.baseContainerX + (Math.random() - 0.5) * shakeAmt,
        this.baseContainerY + (Math.random() - 0.5) * shakeAmt
      );
    } else {
      this.rootContainer.position.set(this.baseContainerX, this.baseContainerY);
    }

    // 2.5 Cập nhật Camera theo Tiền Tuyến hoặc Điều khiển thủ công (quay về sau 3s)
    this.updateCamera(dt);

    // Di chuyển thế giới theo Camera
    this.worldContainer.position.set(-this.cameraX, 0);

    // Hiệu ứng Parallax cho các lớp nền
    this.skyGraphics.position.set(-this.cameraX * 0.05, 0);
    this.farMountainGraphics.position.set(-this.cameraX * 0.20, 0);
    this.midLandmarkGraphics.position.set(-this.cameraX * 0.45, 0);
    this.panoramaContainer.x = -this.cameraX * 0.45;

    // 3. Vẽ Chỉ báo Tiền Tuyến (Frontline Indicator)
    this.drawFrontlineIndicator();

    // 4. Vẽ Căn cứ Khổng lồ 260x220px + 3 ô Tháp canh
    this.drawBasesAndTurrets();

    // 5. Vẽ Nhân vật Chibi to 90-110px viền 3px
    this.drawChibiUnitsBatch();

    // 6. Vẽ Đạn đạo
    this.drawProjectiles();

    // 7. Vẽ Hạt chiến đấu (Sparks, Explosions, Trails, Death Stars)
    this.drawParticles();

    // 8. Vẽ Chữ sát thương & Nhãn Viewer
    this.drawFloatingLabels();

    // 9. Giới thiệu Ultimate 0.8s
    this.drawUltimateIntro();

    // 10. Glitch Matrix nếu có
    this.drawGlitchEffect();
  }

  /**
   * Di chuyển camera thủ công (phím mũi tên hoặc kéo chuột)
   */
  public moveCameraManual(deltaX: number): void {
    this.cameraX = Math.max(0, Math.min(LANE_WIDTH - this.V_WIDTH, this.cameraX + deltaX));
    this.manualControlTimer = 3.0; // Giữ góc nhìn thủ công 3 giây
  }

  /**
   * Nhảy camera tới vị trí cụ thể trong thế giới (click minimap)
   */
  public jumpCamera(worldX: number): void {
    this.cameraX = Math.max(0, Math.min(LANE_WIDTH - this.V_WIDTH, worldX));
    this.manualControlTimer = 3.0;
  }

  /**
   * Cập nhật chuyển động camera bám tiền tuyến bằng lerp
   */
  private updateCamera(dt: number): void {
    if (this.manualControlTimer > 0) {
      this.manualControlTimer -= dt;
    } else {
      // Tự động bám tiền tuyến (Frontline) bằng lerp
      const frontlineX = this.world.frontlineX;
      this.targetCameraX = Math.max(
        0,
        Math.min(LANE_WIDTH - this.V_WIDTH, frontlineX - this.V_WIDTH / 2)
      );
      this.cameraX += (this.targetCameraX - this.cameraX) * (1 - Math.exp(-dt * 4.0));
    }
    this.cameraX = Math.max(0, Math.min(LANE_WIDTH - this.V_WIDTH, this.cameraX));
    this.world.cameraX = this.cameraX;
  }

  // ==========================================
  // 1. NỀN PARALLAX 4 LỚP & CROSSFADE
  // ==========================================

  private startBackgroundCrossfade(newAgeId: number): void {
    this.prevAgeId = this.activeAgeId;
    this.activeAgeId = newAgeId;
    this.crossfadeTimer = this.crossfadeDuration;

    // Đảm bảo nạp trước sprite thời kỳ mới (bảo toàn sprite thời kỳ cũ cho quân đang sống)
    void this.preloadAgeSprites(newAgeId);

    // Chuyển container hiện tại sang container cũ để làm mờ
    this.prevBgContainer.removeChildren();
    const oldSky = new Graphics();
    const oldFar = new Graphics();
    const oldMid = new Graphics();
    const oldGnd = new Graphics();
    this.renderFullBackground(oldSky, oldFar, oldMid, oldGnd, this.prevAgeId);
    this.prevBgContainer.addChild(oldSky);
    this.prevBgContainer.addChild(oldFar);
    this.prevBgContainer.addChild(oldMid);
    this.prevBgContainer.addChild(oldGnd);
    this.prevBgContainer.alpha = 1.0;

    // Vẽ nền mới vào currentBgContainer
    this.renderFullBackground(this.skyGraphics, this.farMountainGraphics, this.midLandmarkGraphics, this.groundGraphics, this.activeAgeId);
  }

  private renderFullBackground(
    sky: Graphics,
    far: Graphics,
    mid: Graphics,
    ground: Graphics,
    ageId: number
  ): void {
    sky.clear();
    far.clear();
    mid.clear();
    ground.clear();

    if (this.isTransparent) return;

    const bg = BACKGROUNDS_DATA[ageId] || BACKGROUNDS_DATA[1]!;
    const p = bg.palette;

    // --- LỚP 1: BẦU TRỜI TOÀN MÀN HÌNH (MỞ RỘNG TRÊN & HAI BÊN, GỘP CHUNG VÙNG THANH MÁU CĂN CỨ) ---
    const skyLeft = -1800;
    const skyWidth = this.V_WIDTH + 4200;
    const skyTop = -1200;
    sky.rect(skyLeft, skyTop, skyWidth, this.GROUND_Y - skyTop).fill(p.skyGradient[0]);
    // Tầng mây cao dịu mắt phía trên cùng (bao phủ vùng HUD căn cứ bạn & địch)
    sky.rect(skyLeft, -400, skyWidth, 560).fill({ color: p.skyGradient[0], alpha: 0.9 });
    sky.rect(skyLeft, 180, skyWidth, this.GROUND_Y - 180).fill({ color: p.skyGradient[1], alpha: 0.42 });
    // Dải hoàng hôn / chân trời ấm áp
    sky.rect(skyLeft, 330, skyWidth, this.GROUND_Y - 330).fill({ color: p.skyGradient[1], alpha: 0.72 });

    // Những dải mây mờ tự nhiên trên bầu trời mở rộng
    for (let cx = -800; cx < this.V_WIDTH + 2200; cx += 340) {
      const cy = 65 + ((Math.abs(cx) * 17) % 130);
      sky.ellipse(cx, cy, 95, 22).fill({ color: 0xffffff, alpha: ageId >= 5 ? 0.06 : 0.14 });
      sky.ellipse(cx + 45, cy + 6, 70, 16).fill({ color: 0xffffff, alpha: ageId >= 5 ? 0.05 : 0.11 });
    }

    // Mặt trời / Mặt trăng / Quả cầu lượng tử
    if (p.sunMoonColor) {
      sky.circle(this.V_WIDTH * 0.72, 130, 50).fill(p.sunMoonColor);
      sky.circle(this.V_WIDTH * 0.72, 130, 66).stroke({ width: 5, color: p.sunMoonColor, alpha: 0.28 });
    }

    // --- LỚP 2: DÃY NÚI / SKYLINE XA TRẢI RỘNG TOÀN BẢN ĐỒ ---
    for (let tileOffset = -1280; tileOffset <= this.V_WIDTH + 1280; tileOffset += 1280) {
      far.poly([
        tileOffset, this.GROUND_Y,
        tileOffset + 120, 250,
        tileOffset + 320, 385,
        tileOffset + 490, 230,
        tileOffset + 720, 375,
        tileOffset + 950, 215,
        tileOffset + 1120, 355,
        tileOffset + 1280, 265,
        tileOffset + 1280, this.GROUND_Y,
      ]).fill(p.farMountainColor);
    }

    // --- LỚP 3: VẬT THỂ ĐẶC TRƯNG TỪNG THỜI KỲ (MID LANDMARKS & PANORAMA KỶ NGUYÊN 1-3) ---
    const panoramaTex = this.textureMap.get(`bg_panorama_age${ageId}`);
    if (panoramaTex && ageId >= 1 && ageId <= 3) {
      this.panoramaContainer.visible = true;
      const panoH = ageId === 1 ? 285 : ageId === 2 ? 305 : 320;
      const panoW = 1420;
      const startOffsets = [-320, -320 + panoW, -320 + panoW * 2];
      for (let i = 0; i < this.panoramaBgSprites.length; i++) {
        const sp = this.panoramaBgSprites[i]!;
        sp.visible = true;
        sp.texture = panoramaTex;
        sp.anchor.set(0, 0);
        sp.x = startOffsets[i]!;
        sp.y = this.GROUND_Y - panoH;
        sp.width = panoW + 2; // Chồng mí 2px tránh khe hở
        sp.height = panoH;
        // Đảo chiều tấm giữa để nối liền mạch không thấy vết cắt
        if (i === 1) {
          sp.anchor.set(1, 0);
          sp.scale.x = -Math.abs(sp.scale.x);
        }
      }
    } else {
      this.panoramaContainer.visible = false;
      for (const sp of this.panoramaBgSprites) sp.visible = false;
      for (let landmarkOffset = 0; landmarkOffset <= 2400; landmarkOffset += 1200) {
        this.renderAgeLandmark(mid, bg.landmarks.type, p, landmarkOffset);
      }
    }

    // --- LỚP 4: MẶT ĐẤT & ĐỊA TẦNG MỞ RỘNG XUỐNG DƯỚI TOÀN MÀN HÌNH (KHÔNG CÒN KHOẢNG TRỐNG ĐÁY) ---
    const gndLeft = -1800;
    const gndWidth = LANE_WIDTH + 3600;
    const gndBottomHeight = this.V_HEIGHT - this.GROUND_Y + 2200;

    // Nền địa tầng sâu mở rộng hết đáy màn hình
    ground.rect(gndLeft, this.GROUND_Y, gndWidth, gndBottomHeight).fill(p.groundBaseColor);
    // Lớp đất / móng thành trung tầng (tạo chiều sâu mặt cắt 2.5D phong phú)
    ground.rect(gndLeft, this.GROUND_Y + 72, gndWidth, 95).fill({ color: 0x090d16, alpha: 0.28 });
    ground.rect(gndLeft, this.GROUND_Y + 167, gndWidth, gndBottomHeight).fill({ color: 0x020617, alpha: 0.52 });

    // Bề mặt đường chiến đấu chính + viền cỏ / đá sáng
    ground.rect(gndLeft, this.GROUND_Y, gndWidth, 16).fill(p.groundSurfaceColor);
    ground.rect(gndLeft, this.GROUND_Y, gndWidth, 3).fill({ color: 0xffffff, alpha: 0.18 });
    ground.rect(gndLeft, this.GROUND_Y + 70, gndWidth, 3).fill({ color: 0x000000, alpha: 0.35 });

    // Chi tiết địa tầng phong phú theo từng Kỷ nguyên trải dài toàn bản đồ (lấp đầy vùng dưới thanh mua quân)
    if (ageId === 1) {
      // Tiền sử: Cỏ dại mép đường, đá tảng, rễ cây cổ thụ & hóa thạch dưới lòng đất
      for (let x = -400; x < LANE_WIDTH + 400; x += 65) {
        ground.circle(x, this.GROUND_Y + 24, 5).fill(0x522305);
        ground.circle(x + 26, this.GROUND_Y + 48, 8).fill(0x381703);
        ground.ellipse(x + 14, this.GROUND_Y + 108, 22, 11).fill({ color: 0x291205, alpha: 0.65 });
        ground.circle(x + 45, this.GROUND_Y + 138, 12).fill({ color: 0x78350f, alpha: 0.35 });
      }
    } else if (ageId === 2 || ageId === 3) {
      // Trung cổ & Phục hưng: Tường kè đá hộc pháo đài, vòm cống ngầm La Mã/Phục Hưng ở tầng dưới
      const archColor = ageId === 3 ? 0x451a03 : 0x0f172a;
      const brickTint = ageId === 3 ? 0x9a3412 : 0x334155;
      for (let x = -400; x < LANE_WIDTH + 400; x += 48) {
        ground.rect(x, this.GROUND_Y + 18, 42, 14).fill({ color: brickTint, alpha: 0.45 });
        ground.rect(x + 22, this.GROUND_Y + 36, 42, 14).fill({ color: archColor, alpha: 0.38 });
        ground.rect(x, this.GROUND_Y + 54, 42, 14).fill({ color: brickTint, alpha: 0.32 });
      }
      // Hàng vòm đá chân thành phía dưới cùng
      for (let x = -360; x < LANE_WIDTH + 360; x += 140) {
        ground.roundRect(x, this.GROUND_Y + 84, 84, 76, 36).fill({ color: archColor, alpha: 0.55 });
        ground.roundRect(x, this.GROUND_Y + 84, 84, 76, 36).stroke({ width: 3, color: brickTint, alpha: 0.5 });
      }
    } else if (ageId === 4) {
      // Hiện đại: Đường nhựa chiến thuật, dải phân cách vàng đen & hầm boong-ke bê tông cốt thép dưới đáy
      for (let x = -400; x < LANE_WIDTH + 400; x += 64) {
        ground.rect(x, this.GROUND_Y + 34, 34, 5).fill(0xfacc15);
        ground.rect(x + 10, this.GROUND_Y + 84, 44, 56).stroke({ width: 2, color: 0x334155, alpha: 0.65 });
      }
    } else if (ageId >= 5) {
      // Tương lai & AI: Đường dẫn truyền quang học & lõi năng lượng ngầm phát sáng xuống tận đáy
      ground.rect(gndLeft, this.GROUND_Y, gndWidth, 3).fill(p.accentDetailColor);
      for (let x = -400; x < LANE_WIDTH + 400; x += 80) {
        ground.rect(x, this.GROUND_Y, 2, 180).fill({ color: p.accentDetailColor, alpha: 0.35 });
        ground.rect(x, this.GROUND_Y + 38, 46, 2).fill({ color: p.accentDetailColor, alpha: 0.28 });
        ground.circle(x + 40, this.GROUND_Y + 112, 10).stroke({ width: 2, color: p.accentDetailColor, alpha: 0.4 });
        ground.circle(x + 40, this.GROUND_Y + 112, 4).fill({ color: p.accentDetailColor, alpha: 0.55 });
      }
    }
  }

  private renderAgeLandmark(g: Graphics, type: string, p: any, offsetX: number = 0): void {
    if (type === 'VOLCANO') {
      // Núi lửa phun khói + cây dương xỉ cổ đại
      g.poly([
        offsetX + 200, this.GROUND_Y,
        offsetX + 340, 260,
        offsetX + 370, 260,
        offsetX + 510, this.GROUND_Y,
      ]).fill(p.midHillsColor);
      // Miệng núi lửa đỏ rực
      g.ellipse(offsetX + 355, 260, 20, 6).fill(0xd97706);
      // Dương xỉ tiền sử
      for (const treeX of [140, 580, 840, 1020]) {
        g.rect(offsetX + treeX, this.GROUND_Y - 40, 6, 40).fill(0x381703);
        g.circle(offsetX + treeX + 3, this.GROUND_Y - 45, 18).fill(p.accentDetailColor);
      }
    } else if (type === 'CASTLE') {
      // Lâu đài đá cổ kính
      g.rect(offsetX + 540, 280, 160, 120).fill(p.midHillsColor);
      g.rect(offsetX + 525, 250, 40, 150).fill(p.midHillsColor);
      g.rect(offsetX + 695, 250, 40, 150).fill(p.midHillsColor);
      // Mái tháp chóp nón
      g.poly([offsetX + 525, 250, offsetX + 545, 200, offsetX + 565, 250]).fill(0x1d4ed8);
      g.poly([offsetX + 695, 250, offsetX + 715, 200, offsetX + 735, 250]).fill(0x1d4ed8);
    } else if (type === 'WINDMILL_CHURCH') {
      // Nhà thờ vòm + cối xay gió
      g.poly([offsetX + 400, this.GROUND_Y, offsetX + 440, 310, offsetX + 480, this.GROUND_Y]).fill(p.midHillsColor);
      g.circle(offsetX + 440, 310, 24).fill(p.accentDetailColor);
      // Cánh cối xay gió
      g.rect(offsetX + 780, 300, 50, 120).fill(p.midHillsColor);
      g.circle(offsetX + 805, 300, 8).fill(0xffffff);
    } else if (type === 'SKYSCRAPERS') {
      // Khối cao ốc đô thị
      for (let i = 0; i < 9; i++) {
        const hX = offsetX + 260 + i * 85;
        const hY = 220 + (i % 3) * 45;
        g.rect(hX, hY, 70, this.GROUND_Y - hY).fill(p.midHillsColor);
        // Cửa sổ vàng
        g.rect(hX + 15, hY + 20, 8, 8).fill(0xfef08a);
        g.rect(hX + 45, hY + 40, 8, 8).fill(0xfef08a);
      }
    } else if (type === 'FLYING_CARS') {
      // Tháp Cyberpunk và xe bay
      g.poly([offsetX + 320, this.GROUND_Y, offsetX + 360, 200, offsetX + 400, this.GROUND_Y]).fill(p.midHillsColor);
      g.rect(offsetX + 800, 180, 80, 250).fill(p.midHillsColor);
      // Xe bay neon lướt
      g.roundRect(offsetX + 620, 220, 34, 10, 4).fill(0x06b6d4);
      g.rect(offsetX + 590, 224, 28, 2).fill(0x22d3ee);
    } else if (type === 'MATRIX_DATA_PILLARS') {
      // Cột dữ liệu ma trận Monolith
      for (let i = 0; i < 6; i++) {
        const pX = offsetX + 220 + i * 160;
        const pH = 240 + (i % 2) * 50;
        g.rect(pX, this.GROUND_Y - pH, 30, pH).fill(0x022c22);
        g.rect(pX + 12, this.GROUND_Y - pH, 6, pH).fill(0x10b981);
      }
    }
  }

  // ==========================================
  // 2. CHỈ BÁO TIỀN TUYẾN (FRONTLINE INDICATOR)
  // ==========================================

  private drawFrontlineIndicator(): void {
    const g = this.frontlineGraphics;
    g.clear();

    const alivePlayer = this.world.playerUnits.filter((u) => u.isAlive);
    const aliveBot = this.world.botUnits.filter((u) => u.isAlive);

    let frontlineX = this.V_WIDTH / 2;
    if (alivePlayer.length > 0 && aliveBot.length > 0) {
      // Tính trung bình tọa độ lính tiên phong 2 phe
      const playerFrontX = Math.max(...alivePlayer.map((u) => u.x));
      const botFrontX = Math.min(...aliveBot.map((u) => u.x));
      frontlineX = (playerFrontX + botFrontX) / 2;
    } else if (alivePlayer.length > 0) {
      frontlineX = Math.max(...alivePlayer.map((u) => u.x)) + 40;
    } else if (aliveBot.length > 0) {
      frontlineX = Math.min(...aliveBot.map((u) => u.x)) - 40;
    }

    frontlineX = Math.max(this.BASE_LEFT_X + 120, Math.min(this.BASE_RIGHT_X - 120, frontlineX));

    // Mũi tên chỉ báo tiền tuyến mờ tinh tế tại mặt đường
    const bounceY = Math.sin(this.flagWavePhase * 2) * 4;
    const arrowY = this.GROUND_Y - 26 + bounceY;

    g.poly([
      frontlineX - 10, arrowY - 14,
      frontlineX + 10, arrowY - 14,
      frontlineX, arrowY,
    ]).fill({ color: 0x38bdf8, alpha: 0.5 });

    g.ellipse(frontlineX, this.GROUND_Y, 14, 4).fill({ color: 0x38bdf8, alpha: 0.35 });
  }

  // ==========================================
  // 3. CĂN CỨ KHỔNG LỒ 260x220px + 3 Ô THÁP CANH
  // ==========================================

  private drawBasesAndTurrets(): void {
    const g = this.baseGraphics;
    g.clear();

    const pAge = this.world.playerAge.currentAge;
    const bAge = this.world.botAge.currentAge;

    // Căn cứ Trái (Người chơi - Cờ Xanh)
    const leftTex = this.textureMap.get(`base_age${pAge}_left`);
    if (leftTex && pAge >= 1 && pAge <= 3) {
      this.baseLeftSprite.visible = true;
      this.baseLeftSprite.texture = leftTex;
      this.baseLeftSprite.anchor.set(0.5, 1.0);
      this.baseLeftSprite.position.set(this.BASE_LEFT_X, this.GROUND_Y);
      this.baseLeftSprite.width = pAge === 3 ? 256 : 240;
      this.baseLeftSprite.height = 260;
      // Bóng chân
      g.ellipse(this.BASE_LEFT_X, this.GROUND_Y + 4, 130, 16).fill({ color: 0x000000, alpha: 0.5 });
      // 3 ô tháp trên nóc
      this.renderTurretSlotOutlines(g, this.BASE_LEFT_X, this.GROUND_Y - 260, 1, this.world.playerTurrets.slots.length);
    } else {
      this.baseLeftSprite.visible = false;
      this.drawEpicBase(g, this.BASE_LEFT_X, this.GROUND_Y, pAge, 'LEFT', this.world.playerBaseHp);
    }

    // Căn cứ Phải (Đối thủ Bot - Cờ Đỏ)
    const rightTex = this.textureMap.get(`base_age${bAge}_right`);
    if (rightTex && bAge >= 1 && bAge <= 3) {
      this.baseRightSprite.visible = true;
      this.baseRightSprite.texture = rightTex;
      this.baseRightSprite.anchor.set(0.5, 1.0);
      this.baseRightSprite.position.set(this.BASE_RIGHT_X, this.GROUND_Y);
      this.baseRightSprite.width = bAge === 3 ? 256 : 240;
      this.baseRightSprite.height = 260;
      // Bóng chân
      g.ellipse(this.BASE_RIGHT_X, this.GROUND_Y + 4, 130, 16).fill({ color: 0x000000, alpha: 0.5 });
      // 3 ô tháp trên nóc
      this.renderTurretSlotOutlines(g, this.BASE_RIGHT_X, this.GROUND_Y - 260, -1, this.world.botTurrets.slots.length);
    } else {
      this.baseRightSprite.visible = false;
      this.drawEpicBase(g, this.BASE_RIGHT_X, this.GROUND_Y, bAge, 'RIGHT', this.world.botBaseHp);
    }

    // Thanh máu tích hợp trực tiếp trên đỉnh Căn cứ Bạn & Căn cứ Địch trong không gian Map
    this.drawWorldBaseHealthBar(g, this.BASE_LEFT_X, this.GROUND_Y - 306, this.world.playerBaseHp, BASE_MAX_HP, true);
    this.drawWorldBaseHealthBar(g, this.BASE_RIGHT_X, this.GROUND_Y - 306, this.world.botBaseHp, BASE_MAX_HP, false);

    // Vẽ Tháp canh trên 3 ô nóc căn cứ
    this.drawTurretSlots();
  }

  private drawWorldBaseHealthBar(
    g: Graphics,
    baseX: number,
    barY: number,
    hp: number,
    maxHp: number,
    isLeft: boolean
  ): void {
    const barW = 190;
    const barH = 14;
    const pct = Math.max(0, Math.min(1, hp / maxHp));
    const fillColor = isLeft ? (pct < 0.25 ? 0xef4444 : 0x22c55e) : 0xef4444;
    const borderColor = isLeft ? 0x38bdf8 : 0xf87171;

    g.roundRect(baseX - barW / 2 - 2, barY - 2, barW + 4, barH + 4, 8).fill({ color: 0x090d16, alpha: 0.78 });
    if (pct > 0) {
      g.roundRect(baseX - barW / 2, barY, barW * pct, barH, 6).fill(fillColor);
      g.roundRect(baseX - barW / 2, barY, barW * pct, barH * 0.45, 4).fill({ color: 0xffffff, alpha: 0.22 });
    }
    g.roundRect(baseX - barW / 2 - 2, barY - 2, barW + 4, barH + 4, 8).stroke({ width: 2, color: borderColor, alpha: 0.9 });
  }

  private drawEpicBase(
    g: Graphics,
    x: number,
    groundY: number,
    age: number,
    team: Team,
    hp: number
  ): void {
    const isLeft = team === 'LEFT';
    const dir = isLeft ? 1 : -1;
    const teamFlagColor = isLeft ? 0x2563eb : 0xdc2626;

    // Kích thước chuẩn: Rộng 220px, Cao 260px
    const baseW = 220;
    const baseH = 260;
    const topY = groundY - baseH;

    // Bóng đổ mờ khổng lồ dưới chân căn cứ
    g.ellipse(x, groundY + 4, 130, 16).fill({ color: 0x000000, alpha: 0.5 });

    if (age === 1) {
      // 1. TIỀN SỬ: Hang đá xếp tầng khổng lồ
      g.circle(x - 30 * dir, groundY - 120, 100).fill(0x572808);
      g.circle(x + 25 * dir, groundY - 100, 85).fill(0x78350f);
      g.circle(x - 10 * dir, groundY - 180, 75).fill(0x92400e);

      // Cửa hang tối hun hút
      g.roundRect(x - 45 * dir, groundY - 130, 90, 130, 20).fill(0x1a0a03);

      // Bó đuốc bập bùng 2 bên cửa
      for (const tOffset of [-55, 55]) {
        const torchX = x + tOffset * dir;
        g.rect(torchX - 3, groundY - 80, 6, 35).fill(0x381703);
        const flamePulse = 10 + Math.sin(this.flagWavePhase * 3) * 3;
        g.circle(torchX, groundY - 86, flamePulse).fill(0xf97316);
        g.circle(torchX, groundY - 86, flamePulse * 0.5).fill(0xfef08a);
      }
    } else if (age === 2) {
      // 2. TRUNG CỔ: Lâu đài đá kiên cố, tường thành răng cưa
      g.rect(x - baseW / 2 + 10, topY + 20, baseW - 20, baseH - 20).fill(0x334155);
      g.rect(x - baseW / 2 + 18, topY + 28, baseW - 36, baseH - 28).fill(0x1e293b);

      // Tháp phụ bên ngoài
      g.rect(x + (baseW / 2 - 35) * dir, topY - 15, 45, baseH + 15).fill(0x475569);
      g.poly([
        x + (baseW / 2 - 40) * dir, topY - 15,
        x + (baseW / 2 - 15) * dir, topY - 55,
        x + (baseW / 2 + 15) * dir, topY - 15,
      ]).fill(teamFlagColor);

      // Cổng vòm gỗ bọc sắt rèn
      g.roundRect(x - 45 * dir, groundY - 120, 90, 120, 24).fill(0x0f172a);
      g.rect(x - 35 * dir, groundY - 110, 70, 110).fill(0x451a03);
      g.rect(x - 4 * dir, groundY - 110, 8, 110).fill(0x71717a);

      // Hoa văn gạch đá phiến
      for (let gy = topY + 45; gy < groundY - 40; gy += 25) {
        g.rect(x - 70, gy, 140, 2).fill({ color: 0x64748b, alpha: 0.5 });
      }
    } else if (age === 3) {
      // 3. PHỤC HƯNG: Pháo đài gạch đỏ Da Vinci, bánh răng cơ khí
      g.rect(x - baseW / 2 + 10, topY + 25, baseW - 20, baseH - 25).fill(0x78350f);
      g.rect(x - baseW / 2 + 18, topY + 33, baseW - 36, baseH - 33).fill(0x9a3412);

      // Mái vòm tròn kiểu Baroque Da Vinci
      g.ellipse(x, topY + 25, 65, 35).fill(0xb45309);
      g.circle(x, topY - 10, 8).fill(0xfef08a);

      // Bánh răng đồng hồ cơ khí xoay chậm
      const gearSpin = this.flagWavePhase * 0.5;
      const gearX = x - 40 * dir;
      const gearY = topY + 80;
      g.circle(gearX, gearY, 26).fill(0xd97706);
      g.circle(gearX, gearY, 26).stroke({ width: 4, color: 0x78350f });
      g.circle(gearX, gearY, 10).fill(0x451a03);

      // Cổng mái vòm cổ điển
      g.roundRect(x - 40 * dir, groundY - 115, 80, 115, 20).fill(0x1c1917);
    } else if (age === 4) {
      // 4. HIỆN ĐẠI: Boong-ke bọc thép kiên cố, tháp radar
      g.rect(x - baseW / 2 + 10, topY + 40, baseW - 20, baseH - 40).fill(0x1e3a2b);
      g.rect(x - baseW / 2 + 20, topY + 50, baseW - 40, baseH - 50).fill(0x14281f);

      // Các tấm giáp thép đinh tán
      for (let py = topY + 60; py < groundY - 30; py += 35) {
        g.rect(x - 75, py, 150, 28).stroke({ width: 2, color: 0x2e5641 });
        g.circle(x - 70, py + 5, 2.5).fill(0x86efac);
        g.circle(x + 70, py + 5, 2.5).fill(0x86efac);
      }

      // Đĩa radar xoay trên nóc
      const radarX = x + 30 * dir;
      const radarY = topY + 15;
      g.rect(radarX - 3, radarY, 6, 25).fill(0x94a3b8);
      const radarAngle = Math.sin(this.flagWavePhase * 2) * 20;
      g.ellipse(radarX + radarAngle, radarY - 6, 22, 9).fill(0x64748b);
      g.ellipse(radarX + radarAngle, radarY - 6, 22, 9).stroke({ width: 2, color: 0x22c55e });

      // Cửa thép trượt chống bom
      g.rect(x - 38 * dir, groundY - 95, 76, 95).fill(0x0a1410);
      g.rect(x - 34 * dir, groundY - 90, 68, 6).fill(0xfacc15); // Vạch sọc vàng đen
    } else if (age === 5) {
      // 5. TƯƠNG LAI: Căn cứ Cyberpunk Plasma Shield & Đèn Neon
      g.rect(x - baseW / 2 + 15, topY + 15, baseW - 30, baseH - 15).fill(0x083344);
      g.rect(x - baseW / 2 + 22, topY + 22, baseW - 44, baseH - 22).fill(0x0e7490);

      // Tấm khiên năng lượng Plasma bán cầu phát sáng mờ
      const shieldGlow = 0.25 + Math.sin(this.flagWavePhase * 2) * 0.15;
      g.circle(x, groundY - 120, 125).stroke({ width: 3, color: 0x06b6d4, alpha: shieldGlow });
      g.circle(x, groundY - 120, 125).fill({ color: 0x22d3ee, alpha: 0.08 });

      // Dải neon Cyberpunk
      for (let ly = topY + 45; ly < groundY - 30; ly += 30) {
        g.rect(x - 65, ly, 130, 4).fill(0x06b6d4);
        g.circle(x - 65, ly + 2, 5).fill(0xec4899);
        g.circle(x + 65, ly + 2, 5).fill(0xec4899);
      }

      // Cổng dịch chuyển teleport
      g.roundRect(x - 38 * dir, groundY - 105, 76, 105, 12).fill(0x020617);
      g.ellipse(x - 38 * dir, groundY - 50, 24, 45).fill({ color: 0x06b6d4, alpha: 0.7 });
    } else if (age === 6) {
      // 6. KỶ NGUYÊN AI: Tháp Lượng Tử Monolith góc cạnh
      g.rect(x - baseW / 2 + 20, topY, baseW - 40, baseH).fill(0x064e3b);
      g.rect(x - baseW / 2 + 28, topY + 8, baseW - 56, baseH - 8).fill(0x022c22);

      // Mạch ma trận phát quang
      for (let my = topY + 30; my < groundY - 20; my += 35) {
        g.rect(x - 70, my, 140, 3).fill(0x10b981);
        g.circle(x - 70, my + 1, 5).fill(0x34d399);
        g.circle(x + 70, my + 1, 5).fill(0x34d399);
      }

      // Khối lượng tử Quantum Core lơ lửng đỉnh tháp
      const coreFloatY = topY - 30 + Math.sin(this.flagWavePhase) * 6;
      g.circle(x, coreFloatY, 32).fill(0x10b981);
      g.circle(x, coreFloatY, 18).fill(0x6ee7b7);
      g.circle(x, coreFloatY, 8).fill(0xffffff);
    }

    // Cờ phe bay phấp phới trên đỉnh căn cứ
    const flagPoleX = x + (baseW / 2 - 30) * dir;
    g.rect(flagPoleX - 2, topY - 45, 4, 55).fill(0xe2e8f0);
    const wave = Math.sin(this.flagWavePhase) * 8;
    g.poly([
      flagPoleX, topY - 45,
      flagPoleX + 38 * dir + wave, topY - 35,
      flagPoleX, topY - 20,
    ]).fill(teamFlagColor);

    // 3 Ô THÁP CANH HIỂN THỊ NÉT ĐỨT TRÊN NÓC
    const unlockedCount = isLeft ? this.world.playerTurrets.slots.length : this.world.botTurrets.slots.length;
    this.renderTurretSlotOutlines(g, x, topY, dir, unlockedCount);
  }

  private renderTurretSlotOutlines(
    g: Graphics,
    baseX: number,
    topY: number,
    dir: number,
    unlockedCount: number = 1
  ): void {
    const slotOffsets = [
      { x: -55 * dir, y: 15 },
      { x: 0, y: -5 },
      { x: 55 * dir, y: 15 },
    ];

    for (let i = 0; i < unlockedCount && i < 3; i++) {
      const pos = slotOffsets[i]!;
      const sx = baseX + pos.x;
      const sy = topY + pos.y;

      // Nền ô tháp đã mở khóa
      g.roundRect(sx - 20, sy - 16, 40, 32, 6).fill({ color: 0x0f172a, alpha: 0.55 });
      g.roundRect(sx - 20, sy - 16, 40, 32, 6).stroke({ width: 1.5, color: 0x64748b, alpha: 0.75 });
      // Ký hiệu "+"
      g.rect(sx - 6, sy - 1.5, 12, 3).fill({ color: 0x94a3b8, alpha: 0.75 });
      g.rect(sx - 1.5, sy - 6, 3, 12).fill({ color: 0x94a3b8, alpha: 0.75 });
    }
  }

  private getTurretEraFromId(turretId: string): number {
    if (turretId.startsWith('stone_')) return 1;
    if (turretId.startsWith('med_')) return 2;
    if (turretId.startsWith('ren_')) return 3;
    if (turretId.startsWith('mod_')) return 4;
    if (turretId.startsWith('fut_')) return 5;
    if (turretId.startsWith('ai_')) return 6;
    return 1;
  }

  private drawTurretSlots(): void {
    const g = this.turretGraphics;
    g.clear();

    for (const s of this.turretSpritePool) {
      s.visible = false;
    }
    let spriteIdx = 0;

    const drawManagerTurrets = (manager: any, baseX: number, dir: number, upgradeLevel: number) => {
      const topY = this.GROUND_Y - 260;
      const slotOffsets = [
        { x: -55 * dir, y: 15 },
        { x: 0, y: -5 },
        { x: 55 * dir, y: 15 },
      ];

      for (let i = 0; i < manager.slots.length; i++) {
        const turret = manager.slots[i];
        if (!turret) continue;
        const off = slotOffsets[i];
        if (!off) continue;

        const tx = baseX + off.x;
        const ty = topY + off.y;

        // Xác định đúng Kỷ nguyên thật của khẩu pháo đã mua (không lấy nhầm Kỷ nguyên hiện tại hoặc map cũ)
        const turretEra = this.getTurretEraFromId(turret.config.id);
        const lvl = Math.min(3, Math.max(1, Math.max(upgradeLevel, i + 1)));
        const isFiring = turret.cooldownTimer > turret.config.fireRate - 0.26;

        if (turretEra >= 1 && turretEra <= 3) {
          const texKey = `turret_age${turretEra}_${lvl}`;
          const tex = this.textureMap.get(texKey);
          if (tex && tex.source) {
            let s = this.turretSpritePool[spriteIdx];
            if (!s) {
              s = new Sprite();
              this.turretSpritePool.push(s);
              this.turretSpriteContainer.addChild(s);
            }
            spriteIdx++;
            s.visible = true;
            s.texture = tex;
            s.anchor.set(0.5, 0.85);
            s.position.set(tx, ty);

            const scale = turretEra === 3 ? 0.34 : 0.38;
            const recoilAngle = isFiring ? dir * -0.2 : 0;
            s.rotation = recoilAngle;
            s.scale.set(scale * dir, scale);
            continue;
          }
        }

        // Vẽ Vũ khí Thành Hiện Đại / Tương Lai / AI (Kỷ nguyên 4-6) chuẩn sắc nét
        const recoilX = isFiring ? -5 * dir : 0;
        if (turretEra === 4) {
          // Súng máy Gatling / Pháo phòng không Hiện Đại
          g.roundRect(tx - 16, ty - 6, 32, 18, 4).fill(0x1e293b);
          g.circle(tx, ty - 8, 12).fill(0x365314);
          g.rect(tx + recoilX, ty - 13, 30 * dir, 4).fill(0x94a3b8);
          g.rect(tx + recoilX, ty - 7, 30 * dir, 4).fill(0x64748b);
          if (isFiring) {
            g.circle(tx + 34 * dir, ty - 9, 7).fill(0xfacc15);
          }
        } else if (turretEra === 5) {
          // Tháp Pháo Laser Plasma Tương Lai
          g.roundRect(tx - 16, ty - 4, 32, 16, 5).fill(0x083344);
          g.circle(tx, ty - 10, 13).fill(0x0e7490);
          g.rect(tx + recoilX, ty - 13, 32 * dir, 6).fill(0x22d3ee);
          g.circle(tx, ty - 10, 6).fill(0xec4899);
        } else {
          // Lõi Pháo Lượng Tử AI Singularity
          const hover = Math.sin(this.flagWavePhase * 2 + i) * 4;
          g.poly([tx - 14, ty + 10, tx + 14, ty + 10, tx, ty - 18 + hover]).fill(0x064e3b);
          g.circle(tx, ty - 14 + hover, 9).fill(0x10b981);
          g.circle(tx, ty - 14 + hover, 4).fill(0xffffff);
        }
      }
    };

    drawManagerTurrets(
      this.world.playerTurrets,
      this.BASE_LEFT_X,
      1,
      this.world.playerUpgrades.turretLevel
    );
    drawManagerTurrets(
      this.world.botTurrets,
      this.BASE_RIGHT_X,
      -1,
      this.world.botUpgrades.turretLevel
    );
  }

  // ==========================================
  // 4. NHÂN VẬT CHIBI TO RÕ (90-110px, VIỀN 3px, ĐẦU 45%)
  // ==========================================

  private drawChibiUnitsBatch(): void {
    const g = this.unitGraphics;
    g.clear();

    const allUnits = [...this.world.playerUnits, ...this.world.botUnits];
    allUnits.sort((a, b) => a.y - b.y);

    let spriteIdx = 0;

    for (const unit of allUnits) {
      const isLeft = unit.team === 'LEFT';
      const dir = unit.direction;

      const isTank = unit.config.type === 'TANK';
      const isSpecial = unit.config.type === 'SPECIAL';
      const isFlying = !!unit.config.flying || !!unit.spriteConfig?.flying;
      const unitH = isTank ? 115 : isSpecial ? 105 : 95;
      const unitW = isTank ? 65 : 50;

      // Chi tiết bằng code: Mờ dần khi chết
      const fadeAlpha = !unit.isAlive ? Math.max(0, 1.0 - unit.deathFadeTimer / unit.deathDuration) : 1.0;

      const unitX = unit.x;
      const unitY = this.GROUND_Y + (unit.y - 520) * 0.4;

      // 1. Chi tiết bằng code: Bóng elip dưới chân tách riêng (thu nhỏ mờ khi bay)
      const shadowScale = isFlying ? Math.max(0.35, 1.0 - Math.abs(unit.flyingOffset) / 120) : 1.0;
      const shadowW = unitW * 0.52 * shadowScale;
      const shadowH = 7.5 * shadowScale;
      g.ellipse(unitX, unitY + 4, shadowW, shadowH).fill({ color: 0x000000, alpha: 0.38 * fadeAlpha });

      // Hào quang hiệu ứng Stun / Immune Physical
      if (unit.status.isStunned()) {
        g.circle(unitX, unitY - unitH * 0.5, unitH * 0.55).stroke({ width: 4, color: 0x38bdf8, alpha: fadeAlpha });
      }
      if (unit.status.isImmunePhysical()) {
        g.circle(unitX, unitY - unitH * 0.5, unitH * 0.6).stroke({ width: 4, color: 0xa7f3d0, alpha: fadeAlpha });
      }

      // 2. Chi tiết bằng code: Nhún nhẹ khi đi (walk bounce)
      const walkBounce = unit.state === 'WALK' && unit.currentClip === 'walk' && !isFlying
        ? Math.abs(Math.sin(unit.walkAnimPhase * Math.PI)) * 2.8
        : 0;
      const actualY = unitY + unit.flyingOffset - walkBounce;

      const isMeleeStrike =
        unit.config.type === 'MELEE' ||
        unit.config.type === 'TANK' ||
        unit.lastAttackWasMeleeFallback;
      const lunge =
        unit.state === 'ATTACK'
          ? dir * Math.sin(unit.attackAnimProgress * Math.PI) * (isMeleeStrike ? 16 : -3)
          : 0;

      // 3. Chi tiết bằng code: Giật lùi (recoilOffset) khi trúng đòn
      const recoilX = -dir * (unit.recoilOffset || 0);
      const finalX = unitX + lunge + recoilX;

      // Texture từ SpriteLoader
      const spriteTex = spriteLoader.getFrameTexture(unit.config.id, unit.currentClip, unit.currentFrameIndex);

      // Fallback texture
      const unitEra = unit.spriteConfig?.age || (isLeft ? this.world.playerAge.currentAge : this.world.botAge.currentAge);
      const typeKey = unit.config.type.toLowerCase();
      const texKey = `unit_age${unitEra}_${typeKey}`;
      const legacyTex = this.textureMap.get(texKey);

      if (spriteTex) {
        let sprite = this.unitSpritePool[spriteIdx];
        if (!sprite) {
          sprite = new Sprite();
          this.unitSpritePool.push(sprite);
          this.unitSpriteContainer.addChild(sprite);
        }
        spriteIdx++;

        sprite.visible = true;
        sprite.texture = spriteTex;
        const anchor = unit.spriteConfig?.anchor || { x: 0.5, y: 0.90 };
        sprite.anchor.set(anchor.x, anchor.y);
        sprite.position.set(finalX, actualY);

        const targetH = unit.spriteConfig?.targetHeight || unitH;
        const texH = spriteTex.height || 256;
        const scale = targetH / texH;
        sprite.scale.set(scale * dir, scale);
        sprite.alpha = fadeAlpha;

        // 4. Chi tiết bằng code: Nháy trắng khi trúng đòn
        if (unit.hurtFlashTimer > 0) {
          sprite.tint = 0xffe4e6;
          g.ellipse(finalX, actualY - unitH * 0.48, unitW * 0.52, unitH * 0.46).fill({
            color: 0xffffff,
            alpha: 0.48 * fadeAlpha,
          });
        } else {
          sprite.tint = 0xffffff;
        }
      } else if (legacyTex && legacyTex.source) {
        let sprite = this.unitSpritePool[spriteIdx];
        if (!sprite) {
          sprite = new Sprite();
          this.unitSpritePool.push(sprite);
          this.unitSpriteContainer.addChild(sprite);
        }
        spriteIdx++;

        sprite.visible = true;
        sprite.texture = legacyTex;
        sprite.anchor.set(0.5, 1.0);
        sprite.position.set(finalX, actualY);

        const texH = legacyTex.height || 400;
        const scaleY = unitH / texH;
        const scaleX = (unitH / texH) * dir;
        sprite.scale.set(scaleX, scaleY);
        sprite.alpha = fadeAlpha;

        if (unit.hurtFlashTimer > 0) {
          sprite.tint = 0xffe4e6;
          g.ellipse(finalX, actualY - unitH * 0.48, unitW * 0.52, unitH * 0.46).fill({
            color: 0xffffff,
            alpha: 0.48 * fadeAlpha,
          });
        } else {
          sprite.tint = 0xffffff;
        }
      } else {
        // Fallback 3: Vẽ Vector PIXI.Graphics Chibi (không bao giờ crash game)
        this.drawCrispChibiUnit(g, unit);
      }

      // Hiển thị Debug Hộp trúng đòn (Hitbox) & Điểm neo chân (Foot Anchor)
      if (this.showHitboxes && unit.spriteConfig?.hitbox) {
        const hb = unit.spriteConfig.hitbox;
        const hbX = dir === 1 ? unitX + hb.x : unitX - hb.x - hb.width;
        const hbY = actualY + hb.y;
        g.rect(hbX, hbY, hb.width, hb.height).stroke({ width: 2, color: 0xef4444, alpha: 0.85 });
      }

      if (this.showFootAnchors) {
        g.moveTo(unitX - 8, actualY).lineTo(unitX + 8, actualY).stroke({ width: 2, color: 0x06b6d4, alpha: 0.9 });
        g.moveTo(unitX, actualY - 8).lineTo(unitX, actualY + 8).stroke({ width: 2, color: 0x06b6d4, alpha: 0.9 });
        g.circle(unitX, actualY, 3).fill(0x22d3ee);
      }

      // Thanh máu mini trên đầu
      const hpPct = Math.max(0, unit.hp / unit.maxHp);
      const barW = Math.max(45, unitW + 10);
      const barY = unitY - unitH - 12;
      const hpColor = hpPct < 0.3 ? 0xef4444 : 0x22c55e;

      g.roundRect(unitX - barW / 2, barY, barW, 6, 3).fill({ color: 0x0f172a, alpha: 0.85 * fadeAlpha });
      g.roundRect(unitX - barW / 2, barY, barW * hpPct, 6, 3).fill({ color: hpColor, alpha: fadeAlpha });
    }

    // Ẩn các sprite không dùng trong pool
    for (let i = spriteIdx; i < this.unitSpritePool.length; i++) {
      this.unitSpritePool[i]!.visible = false;
    }
  }

  private drawCrispChibiUnit(g: Graphics, unit: Unit): void {
    const isLeft = unit.team === 'LEFT';
    const dir = unit.direction;

    // TỶ LỆ CHIBI CHUẨN: Chiều cao 95 - 110px! (To gấp đôi trước đây)
    const isTank = unit.config.type === 'TANK';
    const isSpecial = unit.config.type === 'SPECIAL';
    const unitH = isTank ? 115 : isSpecial ? 105 : 95;
    const unitW = isTank ? 65 : 50;

    const fadeAlpha = !unit.isAlive ? Math.max(0.1, 1.0 - unit.deathFadeTimer / unit.deathDuration) : 1.0;
    const bobbing = unit.state === 'WALK' ? Math.sin(unit.walkAnimPhase) * 4 : 0;

    const unitX = unit.x;
    const chibiY = this.GROUND_Y + (unit.y - 520) * 0.4 + bobbing; // Đặt đúng trên lane 540

    // BÓNG ĐỔ ELIP MỜ DƯỚI CHÂN
    g.ellipse(unitX, chibiY + 4, unitW * 0.45, 8).fill({ color: 0x000000, alpha: 0.35 * fadeAlpha });

    // Hào quang hiệu ứng Stun / Immune Physical
    if (unit.status.isStunned()) {
      g.circle(unitX, chibiY - unitH * 0.5, unitH * 0.55).stroke({ width: 4, color: 0x38bdf8, alpha: fadeAlpha });
    }
    if (unit.status.isImmunePhysical()) {
      g.circle(unitX, chibiY - unitH * 0.5, unitH * 0.6).stroke({ width: 4, color: 0xa7f3d0, alpha: fadeAlpha });
    }

    // 1. THÂN HÌNH CHIBI
    const bodyH = unitH * 0.52;
    const bodyW = unitW;
    const bodyY = chibiY - bodyH;
    const bodyColor = unit.hurtFlashTimer > 0 ? 0xffffff : unit.config.color;

    // Viền đen đậm 3px
    g.roundRect(unitX - bodyW / 2, bodyY, bodyW, bodyH, 12).fill({ color: bodyColor, alpha: fadeAlpha });
    g.roundRect(unitX - bodyW / 2, bodyY, bodyW, bodyH, 12).stroke({ width: 3, color: 0x0f172a, alpha: fadeAlpha });

    // Huy hiệu màu phe trên ngực áo
    g.circle(unitX - 6 * dir, bodyY + 18, 6).fill({ color: isLeft ? 0x38bdf8 : 0xef4444, alpha: fadeAlpha });

    // 2. ĐẦU TO CHIBI (~45% CHIỀU CAO)
    const headRadius = unitH * 0.24; // Bán kính ~24px -> Đường kính 48px (~45% chiều cao)
    const headY = bodyY - headRadius * 0.7;
    const headColor = unit.hurtFlashTimer > 0 ? 0xffffff : unit.config.accentColor;

    g.circle(unitX, headY, headRadius).fill({ color: headColor, alpha: fadeAlpha });
    g.circle(unitX, headY, headRadius).stroke({ width: 3, color: 0x0f172a, alpha: fadeAlpha });

    // Đôi mắt to tròn Chibi nhìn về hướng đi
    const eyeOffsetX = 7 * dir;
    g.circle(unitX + eyeOffsetX, headY - 2, 5.5).fill({ color: 0x0f172a, alpha: fadeAlpha });
    // Đốm trắng long lanh trong mắt
    g.circle(unitX + eyeOffsetX + 1.5 * dir, headY - 3.5, 2).fill({ color: 0xffffff, alpha: fadeAlpha });

    // 3. VŨ KHÍ RÕ RÀNG THEO HỆ QUÂN
    const swing = unit.attackAnimProgress * 30 * dir;

    if (unit.config.type === 'MELEE') {
      // Kiếm / Gậy to bản
      g.rect(unitX + (bodyW / 2) * dir + swing, bodyY + 8, 26 * dir, 9).fill({ color: 0xf59e0b, alpha: fadeAlpha });
      g.rect(unitX + (bodyW / 2) * dir + swing, bodyY + 8, 26 * dir, 9).stroke({ width: 2, color: 0x0f172a, alpha: fadeAlpha });
    } else if (unit.config.type === 'RANGED') {
      // Súng / Cung tên
      g.rect(unitX + (bodyW / 2) * dir, bodyY + 10, 24 * dir, 7).fill({ color: 0x94a3b8, alpha: fadeAlpha });
      if (unit.config.specialAbility === 'NEURAL_CONVERT') {
        g.circle(unitX + (bodyW / 2 + 24) * dir, bodyY + 13, 5).fill({ color: 0x10b981, alpha: fadeAlpha });
      }
    } else if (unit.config.type === 'TANK') {
      // Khiên chắn hộ thể to dày
      g.roundRect(unitX + (bodyW / 2 - 8) * dir, bodyY - 8, 14 * dir, bodyH + 12, 6).fill({ color: 0x64748b, alpha: fadeAlpha });
      g.roundRect(unitX + (bodyW / 2 - 8) * dir, bodyY - 8, 14 * dir, bodyH + 12, 6).stroke({ width: 2, color: 0x0f172a, alpha: fadeAlpha });

      if (unit.config.specialAbility === 'ENERGY_ABSORB_SHOCKWAVE') {
        const ePct = Math.min(1.0, unit.energy / unit.maxEnergy);
        g.rect(unitX - bodyW / 2, headY - headRadius - 16, bodyW, 5).fill({ color: 0x064e3b, alpha: fadeAlpha });
        g.rect(unitX - bodyW / 2, headY - headRadius - 16, bodyW * ePct, 5).fill({ color: 0x34d399, alpha: fadeAlpha });
      }
    }

    // 4. THANH MÁU MINI TRÊN ĐẦU (Xanh lá, đỏ khi dưới 30%)
    const hpPct = Math.max(0, unit.hp / unit.maxHp);
    const barW = Math.max(45, bodyW + 10);
    const barY = headY - headRadius - 10;
    const hpColor = hpPct < 0.3 ? 0xef4444 : 0x22c55e;

    g.roundRect(unitX - barW / 2, barY, barW, 6, 3).fill({ color: 0x0f172a, alpha: 0.85 * fadeAlpha });
    g.roundRect(unitX - barW / 2, barY, barW * hpPct, 6, 3).fill({ color: hpColor, alpha: fadeAlpha });
  }

  // ==========================================
  // 5. ĐẠN ĐẠO & VỆT SÁNG (TRAILS)
  // ==========================================

  private drawProjectiles(): void {
    const g = this.projGraphics;
    g.clear();

    for (const proj of this.world.projectilePool.getActive()) {
      if (proj.isUltimateBarrage) {
        // Đạn Đại Pháo Hoàng Gia / Mưa Thiên Thạch rơi chéo rực lửa từ bầu trời
        const speed = Math.hypot(proj.vx, proj.vy) || 1;
        const ux = -proj.vx / speed;
        const uy = -proj.vy / speed;
        const tailLen = proj.radius * 4.2;

        g.poly([
          proj.x - uy * proj.radius * 0.9, proj.y + ux * proj.radius * 0.9,
          proj.x + uy * proj.radius * 0.9, proj.y - ux * proj.radius * 0.9,
          proj.x + ux * tailLen, proj.y + uy * tailLen,
        ]).fill({ color: proj.color, alpha: 0.55 });

        g.poly([
          proj.x - uy * proj.radius * 0.5, proj.y + ux * proj.radius * 0.5,
          proj.x + uy * proj.radius * 0.5, proj.y - ux * proj.radius * 0.5,
          proj.x + ux * (tailLen * 0.65), proj.y + uy * (tailLen * 0.65),
        ]).fill({ color: 0xfef08a, alpha: 0.85 });

        g.circle(proj.x, proj.y, proj.radius * 1.25).fill({ color: proj.color, alpha: 0.45 });
        g.circle(proj.x, proj.y, proj.radius).fill(0x292524);
        g.circle(proj.x, proj.y, proj.radius).stroke({ width: 2.5, color: proj.color });
        g.circle(proj.x - 2, proj.y - 2, proj.radius * 0.45).fill(0xfef08a);
        particleSystem.spawnTrail(proj.x, proj.y, proj.color);
      } else if (proj.radius >= 8) {
        // Đá tảng Máy Bắn Đá (Catapult Boulder): Khối đá cuội to tròn có bóng đổ & vệt bụi
        g.circle(proj.x, proj.y, proj.radius).fill(0x44403c);
        g.circle(proj.x, proj.y, proj.radius).stroke({ width: 2, color: 0x1c1917 });
        g.circle(proj.x - 2, proj.y - 2, proj.radius * 0.45).fill(0x78716c);
        particleSystem.spawnDust(proj.x, proj.y);
      } else {
        // Đầu đạn thông thường
        g.circle(proj.x, proj.y, proj.radius * 1.3).fill(proj.color);
        g.circle(proj.x, proj.y, proj.radius * 0.7).fill(0xffffff);
        particleSystem.spawnTrail(proj.x, proj.y, proj.color);
      }
    }
  }

  // ==========================================
  // 6. HỆ THỐNG HẠT PARTICLE SYSTEM
  // ==========================================

  private drawParticles(): void {
    const g = this.particleGraphics;
    g.clear();

    for (const p of particleSystem.activeParticles) {
      if (p.shape === 'CIRCLE') {
        g.circle(p.x, p.y, p.size).fill({ color: p.color, alpha: p.alpha });
      } else if (p.shape === 'RING') {
        g.circle(p.x, p.y, p.size).stroke({ width: 3, color: p.color, alpha: p.alpha });
      } else if (p.shape === 'STAR') {
        // Ngôi sao vàng cartoon khi lính chết
        g.poly([
          p.x, p.y - p.size,
          p.x + p.size * 0.4, p.y - p.size * 0.3,
          p.x + p.size, p.y - p.size * 0.3,
          p.x + p.size * 0.5, p.y + p.size * 0.2,
          p.x + p.size * 0.7, p.y + p.size,
          p.x, p.y + p.size * 0.5,
          p.x - p.size * 0.7, p.y + p.size,
          p.x - p.size * 0.5, p.y + p.size * 0.2,
          p.x - p.size, p.y - p.size * 0.3,
          p.x - p.size * 0.4, p.y - p.size * 0.3,
        ]).fill({ color: p.color, alpha: p.alpha });
      } else if (p.shape === 'SPARK') {
        g.rect(p.x - p.size, p.y - 1, p.size * 2, 2).fill({ color: p.color, alpha: p.alpha });
      }
    }
  }

  // ==========================================
  // 7. CHỮ SÁT THƯƠNG & TÊN VIEWER CHAT
  // ==========================================

  private drawFloatingLabels(): void {
    const fts = this.world.floatingTexts;
    let poolIdx = 0;

    // Số sát thương bay
    for (let i = 0; i < fts.length && poolIdx < this.textPool.length; i++) {
      const ft = fts[i]!;
      const t = this.textPool[poolIdx++]!;
      t.text = ft.text;
      t.style.fill = ft.color;
      t.style.fontSize = 20;
      t.x = ft.x;
      t.y = ft.y;
      t.alpha = Math.max(0, 1.0 - ft.duration / ft.maxDuration);
      t.visible = true;
    }

    // Tên viewer gọi lính trên đầu
    for (const unit of this.world.playerUnits) {
      if (poolIdx >= this.textPool.length) break;
      const label = this.summonerLabels.get(unit.id);
      if (label && label.timer > 0) {
        const t = this.textPool[poolIdx++]!;
        t.text = `👑 ${label.name}`;
        t.style.fill = 0xfacc15;
        t.style.fontSize = 15;
        t.x = unit.x;
        t.y = this.GROUND_Y - 120;
        t.alpha = Math.min(1.0, label.timer);
        t.visible = true;
      }
    }

    // Ẩn các text còn thừa trong pool
    for (; poolIdx < this.textPool.length; poolIdx++) {
      this.textPool[poolIdx]!.visible = false;
    }
  }

  // ==========================================
  // 8. GIỚI THIỆU ULTIMATE 0.8S & GLITCH MATRIX
  // ==========================================

  private drawUltimateIntro(): void {
    const g = this.ultimateIntroGraphics;
    g.clear();

    const intro = particleSystem.ultimateIntro;
    if (!intro.active) {
      if (this.ultimateIntroText) this.ultimateIntroText.visible = false;
      return;
    }

    // Màn đen mờ nhẹ phủ chiến trường (0.55 alpha)
    g.rect(0, 0, this.V_WIDTH, this.V_HEIGHT).fill({ color: 0x000000, alpha: 0.65 });

    // Chữ tên tuyệt chiêu hoành tráng
    if (this.ultimateIntroText) {
      this.ultimateIntroText.text = `⚡ ${intro.name.toUpperCase()} ⚡`;
      this.ultimateIntroText.style.fill = intro.themeColor;
      this.ultimateIntroText.visible = true;
      this.ultimateIntroText.scale.set(1.0 + Math.sin(intro.timer * 8) * 0.08);
    }
  }

  private drawGlitchEffect(): void {
    const g = this.glitchGraphics;
    g.clear();

    const isActive = this.world.glitchActive;
    if (this.glitchBannerText) {
      this.glitchBannerText.visible = isActive;
    }

    if (!isActive) return;

    // Scanlines Matrix xanh ngọc
    for (let i = 0; i < 14; i++) {
      const y = Math.random() * this.V_HEIGHT;
      const h = 4 + Math.random() * 22;
      g.rect(0, y, this.V_WIDTH, h).fill({ color: 0x10b981, alpha: 0.35 });
    }
  }

  public destroy(): void {
    this.app?.destroy(true, { children: true });
    this.app = null;
  }
}
