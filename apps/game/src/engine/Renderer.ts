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

import { Application, Assets, Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import { BACKGROUNDS_DATA, type BackgroundConfig } from '../data/backgrounds';
import { AGES_DATA, BASE_MAX_HP, LANE_WIDTH, type Team } from '../data/ages';
import { CONFIG } from '../data/combatFeelConfig';
import { getSpriteConfig, type SpriteConfig } from '../data/sprites';
import { particleSystem, ParticleSystem } from './ParticleSystem';
import { spriteLoader } from './SpriteLoader';
import { gameSettings, STORAGE_KEYS } from '../data/settings';
import { graphicsSettings } from '../data/graphicsSettings';
import { type Unit } from './Unit';
import { type World } from './World';

/** Trạng thái hiệu ứng riêng từng lính (WeakMap tự giải phóng khi lính bị hủy) */
interface UnitFxState {
  lastStep: number;
  lastAttackProgress: number;
  visualSepOffset: number;
  smoothLunge: number;
  smoothRecoil: number;
}

interface TextSlotMeta {
  text: string;
  fill: number;
  fontSize: number;
  strokeW: number;
}

export interface RendererDebugStats {
  units: number;
  projectiles: number;
  floatingTexts: number;
  particles: number;
  maxParticles: number;
  slashes: number;
  rewardOrbs: number;
  entities: number;
  vramMb: number;
}

/** Màu vệt dư ảnh theo phe */
const TEAM_GHOST_COLOR: Record<Team, number> = { LEFT: 0x7dd3fc, RIGHT: 0xfca5a5 };

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
  private customWeaponSpriteContainer: Container = new Container();
  private customWeaponSpritePool: Sprite[] = [];
  private customWeaponTextures: Map<string, Texture> = new Map();
  private turretSpriteContainer: Container = new Container();
  private turretSpritePool: Sprite[] = [];
  private unsubscribeSettings: (() => void) | null = null;

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

  // ===== 4 LỚP LAYOUT CHIẾN ĐẤU (1: Mưa thiên thạch -> 2: Quân -> 3: Cây cối -> 4: Trời mây) =====
  private layer4SkyContainer: Container = new Container();
  private skySprite: Sprite = new Sprite();
  private skyTextureCache: Map<number, Texture> = new Map();
  private cloudsContainer: Container = new Container();
  private cloudSprites: Sprite[] = [];
  private cloudTextureCache: Map<number, Texture> = new Map();
  private cloudsCachedAge: number = -1;
  private cloudsData: Array<{ x: number; y: number; scale: number; speed: number; alpha: number; phase: number }> = [];
  private layer3TreesContainer: Container = new Container();
  private bgDimOverlay: Graphics = new Graphics();
  private layer2UnitsContainer: Container = new Container();
  private playerArrowGraphics: Graphics = new Graphics();
  private layer1MeteorContainer: Container = new Container();
  private meteorGlowGraphics: Graphics = new Graphics();
  private meteorGraphics: Graphics = new Graphics();

  // ===== GIAI ĐOẠN A & GAME FEEL: Bóng đổ mềm, Phát sáng Additive, White Flash Cache, Slash 3 biến thể, Xu/XP Bezier =====
  /** Lớp bóng đổ nằm DƯỚI nhân vật & thành trì */
  private shadowGraphics: Graphics = new Graphics();
  /** Lớp phát sáng (blendMode 'add') cho hạt & đạn */
  private particleGlowGraphics: Graphics = new Graphics();
  private projGlowGraphics: Graphics = new Graphics();
  /** Sprite vệt chém Slash VFX (3 biến thể, additive) */
  private slashContainer: Container = new Container();
  private slashSpritePool: Sprite[] = [];
  private slashTextures: Texture[] = [];
  /** Offscreen white flash cache (chớp trắng 80ms khi bị đánh) */
  private whiteFlashTexCache: Map<Texture, Texture> = new Map();
  /** Sprite chồng tạo chớp trắng thật khi trúng đòn */
  private unitFlashContainer: Container = new Container();
  private unitFlashPool: Sprite[] = [];
  /** Sprite vệt dư ảnh khi lao tới chém */
  private ghostContainer: Container = new Container();
  private ghostPool: Sprite[] = [];
  /** Xu vàng & Orb XP bay theo đường cong Bezier về HUD (tọa độ màn hình 1280x720) */
  private rewardOrbGraphics: Graphics = new Graphics();
  /** Cache key để không vẽ lại baseGraphics mỗi frame khi HP/tuổi không đổi */
  private lastBaseRenderKey: string = '';
  /** Phe của người chơi hiện tại (mặc định LEFT, GUEST online là RIGHT) */
  public playerControlledTeam: Team = 'LEFT';
  /** Lóe sáng toàn màn hình & vệt tốc độ chiêu cuối */
  private screenFlashGraphics: Graphics = new Graphics();
  private ultimateFxGraphics: Graphics = new Graphics();
  private unitFx: WeakMap<Unit, UnitFxState> = new WeakMap();
  private ambientTimer: number = 0;
  private glitchGraphics: Graphics = new Graphics();
  private ultimateIntroGraphics: Graphics = new Graphics();
  private ultimateIntroText: Text | null = null;
  private glitchBannerText: Text | null = null;

  // Text Pool tái sử dụng + metadata dirty-check để tránh re-rasterize chữ mỗi frame
  private textPool: Text[] = [];
  private textPoolMeta: TextSlotMeta[] = [];

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
  public smoothedFrontlineX: number = 0;
  public manualControlTimer: number = 0;
  public isPixelMode: boolean = true;
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
  private botPreloadedAge: number = 1;
  private hasPanoramaActive: boolean = false;
  private flagWavePhase: number = 0;
  private smokePhase: number = 0;

  // Bản đồ lưu tên người gọi lính (viewer chat name) hiển thị 3s
  private summonerLabels: Map<string, { name: string; timer: number }> = new Map();

  // Bộ đệm tái sử dụng mỗi frame để không cấp phát mảng mới (chống GC pause)
  private readonly sepUnitsBuf: Unit[] = [];
  private readonly sortedUnitsBuf: Unit[] = [];

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
      autoStart: false,
    });
    // Dừng ticker tự động của PixiJS vì GameLoop 60Hz chủ động điều phối app.render() mỗi frame
    if (this.app.ticker) {
      this.app.ticker.autoStart = false;
      this.app.ticker.stop();
    }

    this.app.canvas.style.display = 'block';
    this.app.canvas.style.width = '100%';
    this.app.canvas.style.height = '100%';
    this.app.canvas.style.imageRendering = 'pixelated';
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

    this.currentBgContainer.addChild(this.layer4SkyContainer);
    this.currentBgContainer.addChild(this.layer3TreesContainer);

    this.skySprite.visible = false;
    this.layer4SkyContainer.addChild(this.skySprite);
    this.layer4SkyContainer.addChild(this.skyGraphics);
    this.layer4SkyContainer.addChild(this.cloudsContainer);
    this.layer4SkyContainer.addChild(this.farMountainGraphics);
    this.initAnimatedClouds();

    this.layer3TreesContainer.addChild(this.panoramaContainer);
    this.layer3TreesContainer.addChild(this.midLandmarkGraphics);

    this.rootContainer.addChild(this.prevBgContainer);
    this.rootContainer.addChild(this.currentBgContainer);
    this.rootContainer.addChild(this.bgDimOverlay);
    this.rootContainer.addChild(this.worldContainer);
    this.rootContainer.addChild(this.rewardOrbGraphics);
    this.rootContainer.addChild(this.glitchGraphics);
    this.rootContainer.addChild(this.screenFlashGraphics);
    this.rootContainer.addChild(this.ultimateIntroGraphics);

    // Vệt tốc độ chiêu cuối nằm giữa lớp phủ tối và chữ tên chiêu
    this.ultimateFxGraphics.blendMode = 'add';
    this.ultimateIntroGraphics.addChild(this.ultimateFxGraphics);

    // Lớp phát sáng cộng màu & vệt chém Slash VFX additive
    this.particleGlowGraphics.blendMode = 'add';
    this.projGlowGraphics.blendMode = 'add';
    this.meteorGlowGraphics.blendMode = 'add';
    this.slashContainer.blendMode = 'add';
    this.initSlashTextures();

    // Lớp 3 (Mặt đất thuộc cây cối / địa hình)
    this.worldContainer.addChild(this.groundGraphics);

    // Lớp 2: Quân (Bóng đổ, mũi tên xanh người chơi, thành trì, tháp canh, dư ảnh, nhân vật, white flash)
    this.layer2UnitsContainer.addChild(this.shadowGraphics);
    this.layer2UnitsContainer.addChild(this.playerArrowGraphics);
    this.layer2UnitsContainer.addChild(this.frontlineGraphics);
    this.layer2UnitsContainer.addChild(this.baseLeftSprite);
    this.layer2UnitsContainer.addChild(this.baseRightSprite);
    this.layer2UnitsContainer.addChild(this.baseGraphics);
    this.layer2UnitsContainer.addChild(this.turretGraphics);
    this.layer2UnitsContainer.addChild(this.turretSpriteContainer);
    this.layer2UnitsContainer.addChild(this.ghostContainer);
    this.layer2UnitsContainer.addChild(this.unitSpriteContainer);
    this.layer2UnitsContainer.addChild(this.unitFlashContainer);
    this.layer2UnitsContainer.addChild(this.customWeaponSpriteContainer);
    this.layer2UnitsContainer.addChild(this.unitGraphics);
    this.worldContainer.addChild(this.layer2UnitsContainer);

    // Lớp 1 (Trên cùng): Đạn đạo, Hạt nổ, Slash VFX 3 biến thể, Chữ sát thương & Mưa Thiên Thạch
    this.layer1MeteorContainer.addChild(this.projGlowGraphics);
    this.layer1MeteorContainer.addChild(this.projGraphics);
    this.layer1MeteorContainer.addChild(this.particleGraphics);
    this.layer1MeteorContainer.addChild(this.particleGlowGraphics);
    this.layer1MeteorContainer.addChild(this.slashContainer);
    this.layer1MeteorContainer.addChild(this.fxContainer);
    this.layer1MeteorContainer.addChild(this.meteorGlowGraphics);
    this.layer1MeteorContainer.addChild(this.meteorGraphics);
    this.worldContainer.addChild(this.layer1MeteorContainer);

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

    // Khởi tạo Text Pool cho số sát thương (30) + nhãn viewer (10) kèm metadata dirty-check
    const totalTexts = CONFIG.damageNumber.poolSize + 10;
    for (let i = 0; i < totalTexts; i++) {
      const t = new Text({
        text: '',
        style: {
          fontSize: CONFIG.damageNumber.baseFontSizePx,
          fontWeight: '900',
          fill: 0xffffff,
          stroke: { color: 0x000000, width: 4 },
        },
      });
      t.anchor.set(0.5);
      t.visible = false;
      this.textPool.push(t);
      this.textPoolMeta.push({
        text: '',
        fill: 0xffffff,
        fontSize: CONFIG.damageNumber.baseFontSizePx,
        strokeW: 4,
      });
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

    this.unsubscribeSettings = gameSettings.subscribe((key) => {
      if (key === STORAGE_KEYS.CUSTOM_WEAPON) {
        for (const tex of this.customWeaponTextures.values()) {
          try {
            tex.destroy(true);
          } catch {
            // ignore
          }
        }
        this.customWeaponTextures.clear();
      }
    });
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

    // Chỉ nạp sẵn Kỷ nguyên 1 khi khởi động (tiết kiệm >140MB VRAM GPU); các kỷ nguyên sau nạp lười khi tiến hóa
    await this.preloadAgeSprites(1);
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
    if (this.skySprite.visible) {
      this.skySprite.y = this.isPortrait ? -400 : 0;
      this.skySprite.height = this.isPortrait ? 860 : 460;
    }
  }

  /**
   * Vòng lặp render chính (điều phối trực tiếp từ GameLoop 60Hz, không chạy ticker trùng lặp)
   */
  public render(interpolation: number = 1.0, realDt: number = CONFIG.loop.fixedStepSec): void {
    if (!this.app) return;

    const dt = Math.min(CONFIG.loop.maxDeltaMs / 1000, Math.max(0.001, realDt));
    this.flagWavePhase += dt * 4;
    this.smokePhase += dt * 2;

    // 1. Kiểm tra chuyển Kỷ Nguyên để kích hoạt Crossfade 1.5s & nạp lười sprite Bot khi Bot tiến hóa
    const currentAge = this.world.playerAge.currentAge;
    if (currentAge !== this.activeAgeId) {
      this.startBackgroundCrossfade(currentAge);
    }
    const currentBotAge = this.world.botAge.currentAge;
    if (currentBotAge !== this.botPreloadedAge) {
      this.botPreloadedAge = currentBotAge;
      void this.preloadAgeSprites(currentBotAge);
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

    // 2. Rung lắc màn hình mượt (nhiễu đa tần + micro shake 2-3px khi kill/nặng)
    const shake = particleSystem.getShakeOffset(this.world.screenShake);
    if (shake.x !== 0 || shake.y !== 0 || shake.rot !== 0) {
      const cx = this.V_WIDTH / 2;
      const cy = this.V_HEIGHT / 2;
      this.rootContainer.pivot.set(cx, cy);
      this.rootContainer.rotation = shake.rot;
      this.rootContainer.position.set(
        this.baseContainerX + (cx + shake.x) * this.scaleFactor,
        this.baseContainerY + (cy + shake.y) * this.scaleFactor
      );
    } else {
      this.rootContainer.pivot.set(0, 0);
      this.rootContainer.rotation = 0;
      this.rootContainer.position.set(this.baseContainerX, this.baseContainerY);
    }

    // 2.5 Cập nhật Camera theo Tiền Tuyến & đồng bộ cameraX cho Reward Orbs bay về HUD
    this.updateCamera(dt);
    const worldCamX = this.isPixelMode ? Math.round(this.cameraX) : this.cameraX;
    this.worldContainer.position.set(-worldCamX, 0);
    particleSystem.cameraX = worldCamX;

    // Cập nhật hệ thống hạt, Slash VFX & Xu/Orb XP bay Bezier
    particleSystem.update(dt);

    // Cập nhật nhãn tên viewer
    for (const [id, label] of this.summonerLabels.entries()) {
      label.timer -= dt;
      if (label.timer <= 0) {
        this.summonerLabels.delete(id);
      }
    }

    // Hiệu ứng Parallax theo CONFIG: Lớp 4 Trời mây trôi nhẹ, Lớp 3 Cây cối
    const skyParallaxX = -worldCamX * CONFIG.contrastAndBg.parallaxSkyFactor;
    this.skySprite.x = -160 + skyParallaxX;
    this.skyGraphics.position.set(skyParallaxX, 0);
    this.updateAndDrawClouds(dt, worldCamX);
    this.farMountainGraphics.position.set(-worldCamX * CONFIG.contrastAndBg.parallaxFarFactor, 0);
    this.midLandmarkGraphics.position.set(-worldCamX * CONFIG.contrastAndBg.parallaxMidFactor, 0);
    this.panoramaContainer.x = -worldCamX * CONFIG.contrastAndBg.parallaxMidFactor;
    for (let i = 0; i < this.panoramaBgSprites.length; i++) {
      const sp = this.panoramaBgSprites[i]!;
      const tileLeft = sp.x + this.panoramaContainer.x;
      sp.visible = this.hasPanoramaActive && tileLeft < this.V_WIDTH + 64 && tileLeft + 1426 > -64;
    }

    // 3. Xóa chỉ báo frontline chung ở giữa đường (đã chuyển sang mũi tên xanh dưới chân từng lính P1)
    this.frontlineGraphics.clear();

    // 3.5 Bóng đổ mềm của thành trì & đạn bay
    this.shadowGraphics.clear();
    this.drawStaticShadows(interpolation);

    // 3.6 Hạt tàn lửa / môi trường theo kỷ nguyên (CONFIG.contrastAndBg.enableEmbers)
    this.updateAmbientParticles(dt);

    // 4. Vẽ Căn cứ Khổng lồ + 3 ô Tháp canh (cache theo dirty key)
    this.drawBasesAndTurrets();

    // 5. Vẽ Nhân vật Chibi (Nội suy + White Flash cache + Ghost HP + Mũi tên xanh P1)
    this.drawChibiUnitsBatch(interpolation);

    // 6. Vẽ Đạn đạo (Nội suy)
    this.drawProjectiles(interpolation);

    // 7. Vẽ Hạt chiến đấu & Slash VFX 3 biến thể tại điểm chạm
    this.drawParticles();
    this.drawSlashVfx();

    // 8. Vẽ Xu vàng & Orb XP bay cong Bezier về HUD
    this.drawRewardOrbs();

    // 9. Vẽ Chữ sát thương & Nhãn Viewer (cached style)
    this.drawFloatingLabels();

    // 10. Giới thiệu Ultimate 0.8s & Glitch Matrix & Lóe sáng
    this.drawUltimateIntro();
    this.drawGlitchEffect();
    this.drawScreenFlash();

    // Render 1 lần duy nhất mỗi frame do GameLoop điều phối
    this.app.render();
  }

  // ==========================================
  // GIAI ĐOẠN A — BÓNG ĐỔ MỀM, HẠT MÔI TRƯỜNG, LÓE MÀN HÌNH
  // ==========================================

  /**
   * Bóng elip mềm 3 lớp (lớp ngoài rộng & nhạt, lõi nhỏ & đậm) — giả lập gradient không tốn shader.
   */
  private drawSoftShadow(g: Graphics, x: number, y: number, w: number, h: number, alpha: number): void {
    if (alpha <= 0.01 || w <= 0 || h <= 0) return;
    g.ellipse(x, y, w * 1.28, h * 1.4).fill({ color: 0x000000, alpha: alpha * 0.22 });
    g.ellipse(x, y, w, h).fill({ color: 0x000000, alpha: alpha * 0.38 });
    g.ellipse(x, y, w * 0.62, h * 0.58).fill({ color: 0x000000, alpha: alpha * 0.5 });
  }

  /** Bóng thành trì 2 bên + bóng đạn bay chiếu xuống mặt đường */
  private drawStaticShadows(interpolation: number): void {
    if (!graphicsSettings.get().shadows) return;
    const g = this.shadowGraphics;

    // Thành trì: bóng rộng, lệch nhẹ theo hướng nắng (nắng chiếu từ trên-phải)
    this.drawSoftShadow(g, this.BASE_LEFT_X - 10, this.GROUND_Y + 5, 140, 15, 0.85);
    this.drawSoftShadow(g, this.BASE_RIGHT_X - 10, this.GROUND_Y + 5, 140, 15, 0.85);

    // Đạn bay: bóng thu nhỏ & nhạt dần theo độ cao
    const interp = Math.max(0, Math.min(1.0, interpolation));
    for (const proj of this.world.projectilePool.getActive()) {
      const px = proj.prevX !== undefined ? proj.prevX + (proj.x - proj.prevX) * interp : proj.x;
      const py = proj.prevY !== undefined ? proj.prevY + (proj.y - proj.prevY) * interp : proj.y;
      const height = Math.max(0, this.GROUND_Y - py);
      const k = Math.max(0.25, 1 - height / 420);
      const r = Math.max(3, proj.radius) * 1.4;
      this.drawSoftShadow(g, px, this.GROUND_Y + 4, r * k, r * 0.32 * k, 0.6 * k);
    }
  }

  /** Thả hạt môi trường (tàn lửa / bụi nắng / tro / hạt dữ liệu) quanh khung camera */
  private updateAmbientParticles(dt: number): void {
    if (!CONFIG.contrastAndBg.enableEmbers) return;
    this.ambientTimer -= dt;
    if (this.ambientTimer > 0) return;
    this.ambientTimer = CONFIG.contrastAndBg.emberIntervalMs / 1000;
    if (particleSystem.freeCount < 380) return;
    const age = this.activeAgeId;
    const x = this.cameraX + Math.random() * this.V_WIDTH;
    const y = age === 1 ? this.GROUND_Y - 4 - Math.random() * 30 : 120 + Math.random() * (this.GROUND_Y - 160);
    particleSystem.spawnAmbient(x, y, age);
  }

  private drawScreenFlash(): void {
    const g = this.screenFlashGraphics;
    g.clear();
    const f = particleSystem.screenFlash;
    if (f.alpha <= 0.005) return;
    g.rect(-2400, -2400, this.V_WIDTH + 4800, this.V_HEIGHT + 4800).fill({ color: f.color, alpha: f.alpha });
  }

  /**
   * Thống kê hiệu năng phục vụ bảng debug F3
   */
  public getDebugStats(): RendererDebugStats {
    const units = this.world.playerUnits.length + this.world.botUnits.length;
    const projectiles = this.world.projectilePool.getActive().length;
    const floatingTexts = this.world.floatingTexts.length;
    const particles = particleSystem.activeParticles.length;
    const slashes = particleSystem.activeSlashes.length;
    const rewardOrbs = particleSystem.activeRewardOrbs.length;
    return {
      units,
      projectiles,
      floatingTexts,
      particles,
      maxParticles: ParticleSystem.MAX_PARTICLES,
      slashes,
      rewardOrbs,
      entities: units + projectiles + floatingTexts,
      vramMb: spriteLoader.getTotalVramUsageMb(),
    };
  }

  /** Tạo Texture bầu trời & mặt trời cached trên Canvas2D (thay cho 33x overdraw polygon mỗi frame) */
  private getSkyTexture(ageId: number, hasPano: boolean): Texture | null {
    const cached = this.skyTextureCache.get(ageId);
    if (cached) return cached;
    if (typeof document === 'undefined') return null;

    const bg = BACKGROUNDS_DATA[ageId] || BACKGROUNDS_DATA[1]!;
    const p = bg.palette;
    const panoPalettes: Record<number, { top: number; mid: number; horizon: number; glow: number }> = {
      1: { top: 0x3b0d11, mid: 0x881c1a, horizon: 0xd9531e, glow: 0xf59e0b },
      2: { top: 0x1e3a8a, mid: 0x2b77e6, horizon: 0x3ca1fb, glow: 0x93c5fd },
      3: { top: 0x78350f, mid: 0xc26d27, horizon: 0xf8b258, glow: 0xfde68a },
    };
    const panoPal = hasPano ? panoPalettes[ageId] : null;
    const toCss = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;

    const canvas = document.createElement('canvas');
    canvas.width = 820;
    canvas.height = 230;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Khớp tỷ lệ 1:1 tại scale 2x (width = 1640, height = 460) vùng bầu trời y=[0..460], phủ kín cả cameraX max=3200
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    if (panoPal) {
      grad.addColorStop(0.0, toCss(panoPal.top));
      grad.addColorStop(0.45, toCss(panoPal.mid));
      grad.addColorStop(0.8, toCss(panoPal.horizon));
      grad.addColorStop(1.0, toCss(panoPal.glow));
    } else {
      grad.addColorStop(0.0, toCss(p.skyGradient[0]));
      grad.addColorStop(1.0, toCss(p.skyGradient[1]));
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (p.sunMoonColor) {
      const sunCx = (this.V_WIDTH * 0.62 - -160) * 0.5;
      const sunCy = (panoPal ? 292 : 130) * 0.5;
      const sunGrad = ctx.createRadialGradient(sunCx, sunCy, 12, sunCx, sunCy, 66);
      sunGrad.addColorStop(0.0, 'rgba(254, 240, 138, 0.96)');
      sunGrad.addColorStop(0.32, 'rgba(251, 191, 36, 0.85)');
      sunGrad.addColorStop(0.55, 'rgba(245, 158, 11, 0.28)');
      sunGrad.addColorStop(1.0, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.arc(sunCx, sunCy, 66, 0, Math.PI * 2);
      ctx.fill();
    }

    if (CONFIG.contrastAndBg.enableBgDim && hasPano) {
      ctx.fillStyle = `rgba(9, 13, 22, ${CONFIG.contrastAndBg.bgDimAlpha})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const tex = Texture.from(canvas);
    if (tex.source) {
      tex.source.scaleMode = 'nearest';
    }
    this.skyTextureCache.set(ageId, tex);
    return tex;
  }

  /** Tạo texture mây cel-shaded trên offscreen canvas (cache 1 lần theo kỷ nguyên thay cho 170 ellipse/frame) */
  private getCloudTexture(age: number): Texture | null {
    const cached = this.cloudTextureCache.get(age);
    if (cached) return cached;
    if (typeof document === 'undefined') return null;

    const canvas = document.createElement('canvas');
    canvas.width = 180;
    canvas.height = 68;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const toCss = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;
    const outlineCol = toCss(age === 1 ? 0x6b2019 : age === 3 ? 0x92400e : age >= 5 ? 0x0f172a : 0x64748b);
    const shadeCol = toCss(age === 1 ? 0xc2512d : age === 3 ? 0xd97706 : age >= 5 ? 0x1e293b : 0xcbd5e1);
    const bodyCol = toCss(age === 1 ? 0xfcd392 : age === 3 ? 0xfde68a : age >= 5 ? 0x475569 : 0xf8fafc);
    const hiCol = toCss(age === 1 ? 0xfef3c7 : 0xffffff);

    const cx = 90;
    const cy = 36;
    const puffs: Array<[number, number, number, number]> = [
      [-44, 6, 30, 14],
      [44, 7, 28, 13],
      [-20, -4, 36, 20],
      [18, -2, 32, 18],
      [0, 5, 58, 14],
    ];
    const drawEllipses = (color: string, dx: number, dy: number, rxScale: number, ryScale: number, pad: number = 0) => {
      ctx.fillStyle = color;
      for (const [ox, oy, rw, rh] of puffs) {
        ctx.beginPath();
        ctx.ellipse(cx + ox + dx, cy + oy + dy, rw * rxScale + pad, rh * ryScale + pad, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    drawEllipses(outlineCol, 0, 0, 1, 1, 2.5);
    drawEllipses(shadeCol, 0, 2, 1, 1, 0);
    drawEllipses(bodyCol, 0, -1.5, 0.96, 0.88, 0);
    ctx.fillStyle = hiCol;
    ctx.beginPath();
    ctx.ellipse(cx - 18, cy - 10, 25, 10, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 16, cy - 8, 20, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    const tex = Texture.from(canvas);
    this.cloudTextureCache.set(age, tex);
    return tex;
  }

  /** Khởi tạo 10 Sprite mây cel-shaded trên Lớp 4 (không vẽ lại vector mỗi frame) */
  private initAnimatedClouds(): void {
    this.cloudsData = [];
    this.cloudSprites = [];
    this.cloudsContainer.removeChildren();
    const ys = [132, 168, 210, 145, 188, 235, 155, 198, 138, 222];
    const scales = [0.72, 0.95, 0.60, 0.85, 0.55, 0.78, 0.90, 0.65, 0.80, 0.58];
    const tex = this.getCloudTexture(this.activeAgeId);
    this.cloudsCachedAge = this.activeAgeId;

    for (let i = 0; i < 10; i++) {
      const c = {
        x: -320 + i * 235 + ((i * 67) % 55),
        y: ys[i]!,
        scale: scales[i]!,
        speed: 8 + ((i * 11) % 10),
        alpha: 0.85,
        phase: i * 1.3,
      };
      this.cloudsData.push(c);

      const sp = new Sprite(tex || Texture.EMPTY);
      sp.anchor.set(0.5);
      sp.scale.set(c.scale);
      sp.position.set(c.x, c.y);
      this.cloudSprites.push(sp);
      this.cloudsContainer.addChild(sp);
    }
  }

  /** Cập nhật vị trí Sprite mây (0 lần cấp phát & 0 lần tessellation mỗi frame) */
  private updateAndDrawClouds(dt: number, worldCamX: number): void {
    if (this.isTransparent || this.cloudsData.length === 0) {
      this.cloudsContainer.visible = false;
      return;
    }
    this.cloudsContainer.visible = true;
    this.cloudsContainer.position.set(-worldCamX * CONFIG.contrastAndBg.parallaxCloudFactor, 0);
    this.cloudsContainer.alpha = this.activeAgeId >= 5 ? 0.35 : 0.86;

    const age = this.activeAgeId;
    if (this.cloudsCachedAge !== age) {
      this.cloudsCachedAge = age;
      const tex = this.getCloudTexture(age);
      if (tex) {
        for (const sp of this.cloudSprites) {
          sp.texture = tex;
        }
      }
    }

    const wrapMin = -420;
    const wrapMax = this.V_WIDTH + 1100;
    for (let i = 0; i < this.cloudsData.length; i++) {
      const c = this.cloudsData[i]!;
      const sp = this.cloudSprites[i];
      c.x -= c.speed * dt;
      if (c.x < wrapMin) c.x = wrapMax;
      if (sp) {
        sp.x = c.x;
        sp.y = c.y + Math.sin(this.smokePhase * 0.6 + c.phase) * 2.5;
      }
    }
  }

  /** Tạo 3 biến thể texture vệt chém Slash VFX (chỉ tạo 1 lần trong init) */
  private initSlashTextures(): void {
    if (typeof document === 'undefined' || this.slashTextures.length > 0) return;

    for (let v = 0; v < CONFIG.slashVfx.variants; v++) {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      ctx.translate(64, 64);
      if (v === 0) {
        // Biến thể 0: Vệt chém vòng cung sắc bản rộng
        ctx.beginPath();
        ctx.arc(-8, 0, 46, -1.05, 1.05, false);
        ctx.arc(-20, 0, 42, 1.05, -1.05, true);
        ctx.closePath();
        const grad = ctx.createLinearGradient(-10, -48, 36, 48);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
        grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.96)');
        grad.addColorStop(1, 'rgba(254, 240, 138, 0.2)');
        ctx.fillStyle = grad;
        ctx.fill();
      } else if (v === 1) {
        // Biến thể 1: Chém chéo chữ X đôi tốc độ cao
        for (const ang of [-0.45, 0.45]) {
          ctx.save();
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.ellipse(6, 0, 44, 7, 0, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(8, 0, 32, 3, 0, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.restore();
        }
      } else {
        // Biến thể 2: Vệt đập xung kích dẹt rộng kèm tia mảnh
        ctx.beginPath();
        ctx.arc(-14, 0, 52, -0.8, 0.8, false);
        ctx.arc(-24, 0, 44, 0.8, -0.8, true);
        ctx.closePath();
        ctx.fillStyle = 'rgba(254, 249, 195, 0.95)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 2.5;
        for (const a of [-0.6, 0, 0.6]) {
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * 18, Math.sin(a) * 18);
          ctx.lineTo(Math.cos(a) * 52, Math.sin(a) * 52);
          ctx.stroke();
        }
      }

      this.slashTextures.push(Texture.from(canvas));
    }
  }

  /** Vẽ pool Slash VFX tại điểm chạm vũ khí (80-120ms, additive) */
  private drawSlashVfx(): void {
    const active = particleSystem.activeSlashes;
    let idx = 0;
    if (this.slashTextures.length > 0) {
      for (let i = 0; i < active.length; i++) {
        const s = active[i]!;
        const tex = this.slashTextures[s.variant % this.slashTextures.length];
        if (!tex) continue;
        const sp = this.acquirePooled(this.slashSpritePool, idx++, this.slashContainer, 'add');
        sp.texture = tex;
        sp.anchor.set(0.5);
        sp.position.set(s.x, s.y);
        sp.rotation = s.rotation;
        const lifeGrow = 0.85 + 0.3 * (s.life / Math.max(0.02, s.maxLife));
        sp.scale.set(s.scale * lifeGrow * s.dir, s.scale * lifeGrow);
        sp.tint = s.color;
        sp.alpha = s.alpha;
      }
    }
    for (let i = idx; i < this.slashSpritePool.length; i++) {
      this.slashSpritePool[i]!.visible = false;
    }
  }

  /** Offscreen white-flash texture cache: tô trắng silhouette của frame đúng 1 lần, không tạo canvas mỗi frame */
  private getWhiteFlashTexture(srcTex: Texture): Texture | null {
    const cached = this.whiteFlashTexCache.get(srcTex);
    if (cached) return cached;
    if (typeof document === 'undefined') return null;

    const resource = (srcTex.source as any)?.resource;
    if (!resource) return null;

    const fw = Math.max(1, Math.round(srcTex.frame?.width || srcTex.width || 256));
    const fh = Math.max(1, Math.round(srcTex.frame?.height || srcTex.height || 256));
    const fx = Math.round(srcTex.frame?.x || 0);
    const fy = Math.round(srcTex.frame?.y || 0);

    const canvas = document.createElement('canvas');
    canvas.width = fw;
    canvas.height = fh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    try {
      ctx.drawImage(resource, fx, fy, fw, fh, 0, 0, fw, fh);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, fw, fh);
      const tex = Texture.from(canvas);
      if (tex.source) {
        tex.source.scaleMode = this.isPixelMode ? 'nearest' : 'linear';
      }
      this.whiteFlashTexCache.set(srcTex, tex);
      return tex;
    } catch {
      return null;
    }
  }

  /** Vẽ xu vàng & orb XP xanh bay theo đường cong Bezier về HUD (trong không gian màn hình 1280x720) */
  private drawRewardOrbs(): void {
    const g = this.rewardOrbGraphics;
    g.clear();
    const list = particleSystem.activeRewardOrbs;
    if (list.length === 0) return;

    for (let i = 0; i < list.length; i++) {
      const orb = list[i]!;
      if (!orb.active) continue;
      if (orb.kind === 'GOLD') {
        const coinW = Math.max(2.2, Math.abs(Math.cos(orb.spin)) * 6.5 * orb.scale);
        const coinH = 6.5 * orb.scale;
        if (orb.mergedCount > 1) {
          g.circle(orb.screenX, orb.screenY, coinH * 1.55).stroke({ width: 1.6, color: 0xfef08a, alpha: 0.72 });
        }
        g.ellipse(orb.screenX, orb.screenY, coinW + 1.5, coinH + 1.5).fill({ color: 0x78350f, alpha: 0.9 });
        g.ellipse(orb.screenX, orb.screenY, coinW, coinH).fill(0xfacc15);
        g.ellipse(orb.screenX - coinW * 0.2, orb.screenY - coinH * 0.2, Math.max(1, coinW * 0.45), coinH * 0.45).fill(0xfef9c3);
      } else {
        const r = 4.6 * orb.scale;
        g.circle(orb.screenX, orb.screenY, r * 2.1).fill({ color: 0x38bdf8, alpha: 0.25 });
        g.circle(orb.screenX, orb.screenY, r).fill(0x60a5fa);
        g.circle(orb.screenX - 1, orb.screenY - 1, r * 0.45).fill(0xe0f2fe);
      }
    }
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
   * Cập nhật chuyển động camera bám tiền tuyến bằng Exponential Moving Average & Deadzone khử rung
   */
  private updateCamera(dt: number): void {
    if (this.manualControlTimer > 0) {
      this.manualControlTimer -= dt;
    } else {
      const frontlineX = this.world.frontlineX;
      if (this.smoothedFrontlineX === 0) {
        this.smoothedFrontlineX = frontlineX;
      } else {
        // Lọc rung mượt mà tiền tuyến (EMA damping)
        this.smoothedFrontlineX += (frontlineX - this.smoothedFrontlineX) * (1 - Math.exp(-dt * 3.5));
      }

      this.targetCameraX = Math.max(
        0,
        Math.min(LANE_WIDTH - this.V_WIDTH, this.smoothedFrontlineX - this.V_WIDTH / 2)
      );

      // Deadzone 0.5px để triệt tiêu rung giật vi mô
      const camDiff = this.targetCameraX - this.cameraX;
      if (Math.abs(camDiff) > 0.4) {
        this.cameraX += camDiff * (1 - Math.exp(-dt * 4.5));
      }
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
    const panoramaTex = this.textureMap.get(`bg_panorama_age${ageId}`);
    const hasPano = !!(panoramaTex && ageId >= 1 && ageId <= 3);

    // Bảng màu đồng bộ tuyệt đối giữa Bầu trời (Lớp 4) - Panorama Cây cối (Lớp 3) - Mặt đất
    const panoPalettes: Record<number, { top: number; mid: number; horizon: number; glow: number; bot: number; panoH: number; panoTopY: number }> = {
      1: { top: 0x3b0d11, mid: 0x881c1a, horizon: 0xd9531e, glow: 0xf59e0b, bot: 0x1e0e07, panoH: 420, panoTopY: 300 },
      2: { top: 0x1e3a8a, mid: 0x2b77e6, horizon: 0x3ca1fb, glow: 0x93c5fd, bot: 0x262b14, panoH: 340, panoTopY: 260 },
      3: { top: 0x78350f, mid: 0xc26d27, horizon: 0xf8b258, glow: 0xfde68a, bot: 0x3f4f1a, panoH: 350, panoTopY: 250 },
    };
    const panoPal = hasPano ? panoPalettes[ageId]! : null;

    // --- LỚP 4: BẦU TRỜI & MÂY ĐẰNG SAU ---
    const skyLeft = -1800;
    const skyWidth = this.V_WIDTH + 4200;
    const skyTop = -1200;
    const cachedSkyTex = sky === this.skyGraphics ? this.getSkyTexture(ageId, hasPano) : null;
    if (cachedSkyTex) {
      this.skySprite.texture = cachedSkyTex;
      this.skySprite.visible = true;
      this.skySprite.position.set(-160, this.isPortrait ? -400 : 0);
      this.skySprite.width = 1640;
      this.skySprite.height = this.isPortrait ? 860 : 460;
      if (this.app && !this.isTransparent && this.app.renderer?.background) {
        this.app.renderer.background.color = panoPal ? panoPal.top : p.skyGradient[0];
      }
    } else {
      if (sky === this.skyGraphics) {
        this.skySprite.visible = false;
      }
      if (panoPal) {
        sky.rect(skyLeft, skyTop, skyWidth, 0 - skyTop + 2).fill(panoPal.top);
        const lerpColor = (c1: number, c2: number, t: number): number => {
          const r1 = (c1 >> 16) & 255, g1 = (c1 >> 8) & 255, b1 = c1 & 255;
          const r2 = (c2 >> 16) & 255, g2 = (c2 >> 8) & 255, b2 = c2 & 255;
          const r = Math.round(r1 + (r2 - r1) * t);
          const g = Math.round(g1 + (g2 - g1) * t);
          const b = Math.round(b1 + (b2 - b1) * t);
          return (r << 16) | (g << 8) | b;
        };
        const steps = 16;
        const gradStartY = 0;
        const gradEndY = 480;
        const stepH = (gradEndY - gradStartY) / steps;
        for (let s = 0; s < steps; s++) {
          const t = s / (steps - 1);
          const col =
            t < 0.45
              ? lerpColor(panoPal.top, panoPal.mid, t / 0.45)
              : t < 0.8
                ? lerpColor(panoPal.mid, panoPal.horizon, (t - 0.45) / 0.35)
                : lerpColor(panoPal.horizon, panoPal.glow, (t - 0.8) / 0.2);
          const y0 = gradStartY + s * stepH;
          // Mỗi dải chỉ vẽ chiều cao 1x không chồng đè 32 tầng lên nhau
          sky.rect(skyLeft, y0, skyWidth, Math.ceil(stepH) + 2).fill(col);
        }
      } else {
        sky.rect(skyLeft, skyTop, skyWidth, this.GROUND_Y - skyTop).fill(p.skyGradient[0]);
        sky.rect(skyLeft, 180, skyWidth, this.GROUND_Y - 180).fill({ color: p.skyGradient[1], alpha: 0.65 });
      }

      if (p.sunMoonColor) {
        const sunX = this.V_WIDTH * 0.62;
        const sunY = panoPal ? 292 : 130;
        sky.circle(sunX, sunY, 68).fill({ color: 0xf59e0b, alpha: 0.16 });
        sky.circle(sunX, sunY, 42).fill({ color: 0xfbbf24, alpha: 0.88 });
        sky.circle(sunX, sunY, 34).fill({ color: 0xfef08a, alpha: 0.92 });
      }
    }

    // --- DÃY NÚI / SKYLINE XA (chỉ hiện khi không dùng panorama ảnh) ---
    if (!hasPano) {
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
    }

    // --- LỚP 3: CÂY CỐI & PANORAMA KỶ NGUYÊN 1-3 ---
    if (hasPano && panoPal && panoramaTex) {
      if (sky === this.skyGraphics) {
        this.hasPanoramaActive = true;
      }
      if (this.isPixelMode && panoramaTex.source) {
        panoramaTex.source.scaleMode = 'nearest';
      }
      this.panoramaContainer.visible = true;
      const panoH = panoPal.panoH;
      const panoW = 1420;
      const panoTopY = panoPal.panoTopY;
      const tw = panoramaTex.width;
      const th = panoramaTex.height;
      const cropMargin = ageId === 1 ? 2 : 10;
      const croppedTex = tw > 40
        ? new Texture({ source: panoramaTex.source, frame: new Rectangle(cropMargin, 0, tw - cropMargin * 2, th) })
        : panoramaTex;
      if (this.isPixelMode && croppedTex.source) {
        croppedTex.source.scaleMode = 'nearest';
      }
      const startOffsets = [-320, -320 + panoW, -320 + panoW * 2];
      for (let i = 0; i < this.panoramaBgSprites.length; i++) {
        const sp = this.panoramaBgSprites[i]!;
        sp.visible = true;
        sp.texture = croppedTex;
        sp.tint = CONFIG.contrastAndBg.enableBgDim ? 0xd2d6e0 : 0xffffff;
        sp.anchor.set(0, 0);
        sp.scale.x = Math.abs(sp.scale.x);
        sp.x = startOffsets[i]!;
        sp.y = panoTopY;
        sp.width = panoW + 2; // Chồng mí 2px tránh khe hở
        sp.height = panoH;
        // Đảo chiều tấm giữa để nối liền mạch không thấy vết cắt
        if (i === 1) {
          sp.anchor.set(1, 0);
          sp.scale.x = -Math.abs(sp.scale.x);
        }
      }
    } else {
      if (sky === this.skyGraphics) {
        this.hasPanoramaActive = false;
      }
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

    // Nền địa tầng sâu mở rộng hết đáy màn hình (khi có panorama, panorama đã bao phủ tới y=720 nên groundGraphics chỉ lấp phần mở rộng màn dọc > 720)
    const gndBase = panoPal ? panoPal.bot : p.groundBaseColor;
    const gndTopY = panoPal ? panoPal.panoTopY + panoPal.panoH - 4 : this.GROUND_Y;
    if (panoPal) {
      // Panorama đã vẽ sẵn nền mặt đất tới y=720, groundGraphics chỉ lấp phần mở rộng bên dưới khi màn dọc > 720
      ground.rect(gndLeft, gndTopY, gndWidth, gndBottomHeight).fill(gndBase);
    } else {
      ground.rect(gndLeft, this.GROUND_Y, gndWidth, gndBottomHeight).fill(gndBase);
      ground.rect(gndLeft, this.GROUND_Y + 72, gndWidth, 95).fill({ color: 0x090d16, alpha: 0.28 });
      ground.rect(gndLeft, this.GROUND_Y + 167, gndWidth, gndBottomHeight).fill({ color: 0x020617, alpha: 0.52 });
      ground.rect(gndLeft, this.GROUND_Y, gndWidth, 16).fill(p.groundSurfaceColor);
      ground.rect(gndLeft, this.GROUND_Y, gndWidth, 3).fill({ color: 0xffffff, alpha: 0.18 });
      ground.rect(gndLeft, this.GROUND_Y + 70, gndWidth, 3).fill({ color: 0x000000, alpha: 0.35 });
    }

    // Chi tiết địa tầng bằng vector chỉ vẽ khi KHÔNG có panorama (tránh chấm tròn đè lên đất vẽ tay của Kỷ nguyên 1)
    if (ageId === 1 && !hasPano) {
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

    if (sky === this.skyGraphics) {
      this.drawBgDimOverlay(hasPano);
    }
  }

  /** Hạng mục 8: Phủ tối nhẹ vùng nền phía sau làn chiến đấu để nhân vật nổi bật rõ nét */
  private drawBgDimOverlay(hasPano: boolean = false): void {
    const dimG = this.bgDimOverlay;
    dimG.clear();
    // Với Kỷ nguyên 1-3 có Panorama: làm dịu bằng sky canvas & hardware sprite tint (0 overdraw)
    if (hasPano || this.isTransparent || !CONFIG.contrastAndBg.enableBgDim) return;
    dimG
      .rect(0, 0, this.V_WIDTH, this.GROUND_Y)
      .fill({ color: 0x090d16, alpha: CONFIG.contrastAndBg.bgDimAlpha });
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
    const pAge = this.world.playerAge.currentAge;
    const bAge = this.world.botAge.currentAge;
    const pSlotsKey = this.world.playerTurrets.slots.map((s) => s?.config.id || '_').join(',');
    const bSlotsKey = this.world.botTurrets.slots.map((s) => s?.config.id || '_').join(',');
    const baseKey = `${pAge}_${bAge}_${Math.round(this.world.playerBaseHp)}_${Math.round(this.world.botBaseHp)}_${pSlotsKey}_${bSlotsKey}`;
    const needsRedraw = baseKey !== this.lastBaseRenderKey || pAge >= 4 || bAge >= 4;

    if (needsRedraw) {
      this.lastBaseRenderKey = baseKey;
      const g = this.baseGraphics;
      g.clear();

      // Căn cứ Trái (Người chơi - Cờ Xanh)
      const leftTex = this.textureMap.get(`base_age${pAge}_left`);
      if (leftTex && pAge >= 1 && pAge <= 3) {
        this.baseLeftSprite.visible = true;
        this.baseLeftSprite.texture = leftTex;
        this.baseLeftSprite.anchor.set(0.5, 1.0);
        this.baseLeftSprite.position.set(this.BASE_LEFT_X, this.GROUND_Y);
        this.baseLeftSprite.width = pAge === 3 ? 256 : 240;
        this.baseLeftSprite.height = 260;
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
        this.renderTurretSlotOutlines(g, this.BASE_RIGHT_X, this.GROUND_Y - 260, -1, this.world.botTurrets.slots.length);
      } else {
        this.baseRightSprite.visible = false;
        this.drawEpicBase(g, this.BASE_RIGHT_X, this.GROUND_Y, bAge, 'RIGHT', this.world.botBaseHp);
      }

      this.drawWorldBaseHealthBar(g, this.BASE_LEFT_X, this.GROUND_Y - 306, this.world.playerBaseHp, BASE_MAX_HP, true);
      this.drawWorldBaseHealthBar(g, this.BASE_RIGHT_X, this.GROUND_Y - 306, this.world.botBaseHp, BASE_MAX_HP, false);
    }

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

  private drawChibiUnitsBatch(interpolation: number = 1.0): void {
    const g = this.unitGraphics;
    g.clear();
    const arrowG = this.playerArrowGraphics;
    arrowG.clear();

    const interp = Math.max(0, Math.min(1.0, interpolation));

    // 0. Separation steering & ranh giới tiền tuyến rõ ràng (không cấp phát mảng mới mỗi frame)
    let frontLeftX = -Infinity;
    let leadLeftUnit: Unit | null = null;
    for (let i = 0; i < this.world.playerUnits.length; i++) {
      const u = this.world.playerUnits[i]!;
      if (!u.isAlive || u.config.flying || u.spriteConfig?.flying) continue;
      if (u.x > frontLeftX) {
        frontLeftX = u.x;
        leadLeftUnit = u;
      }
    }

    let frontRightX = Infinity;
    let leadRightUnit: Unit | null = null;
    for (let i = 0; i < this.world.botUnits.length; i++) {
      const u = this.world.botUnits[i]!;
      if (!u.isAlive || u.config.flying || u.spriteConfig?.flying) continue;
      if (u.x < frontRightX) {
        frontRightX = u.x;
        leadRightUnit = u;
      }
    }

    const MIN_VISUAL_GAP = CONFIG.crowd.separationVisualGapPx;
    const smoothRate = CONFIG.crowd.separationSmoothRate;
    const enemyGapHalf = CONFIG.attack.standoffGapPx + 42;
    const computeTeamVisualSep = (teamUnits: readonly Unit[], dir: number, enemyFrontX: number) => {
      const buf = this.sepUnitsBuf;
      buf.length = 0;
      for (let i = 0; i < teamUnits.length; i++) {
        const u = teamUnits[i]!;
        if (u.isAlive && !u.config.flying && !u.spriteConfig?.flying) {
          buf.push(u);
        }
      }
      buf.sort((a, b) => (b.x - a.x) * dir);

      let prevRenderX: number | null = null;
      for (let i = 0; i < buf.length; i++) {
        const u = buf[i]!;
        const fx = this.getUnitFx(u);
        const rawX = u.prevX !== undefined ? u.prevX + (u.x - u.prevX) * interp : u.x;
        let targetSep = 0;
        if (i > 0 && prevRenderX !== null) {
          const desiredMaxAlongDir = prevRenderX - dir * MIN_VISUAL_GAP;
          const gapShortfall = (rawX - desiredMaxAlongDir) * dir;
          if (gapShortfall > 0) {
            targetSep = -dir * gapShortfall;
          }
        }
        // Không cho phép đơn vị phe mình lấn sang phía bên kia của tiền tuyến địch
        if (Number.isFinite(enemyFrontX)) {
          const maxRenderAlongDir = dir === 1 ? enemyFrontX - enemyGapHalf : -(enemyFrontX + enemyGapHalf);
          const candidateAlongDir = (rawX + targetSep) * dir;
          if (candidateAlongDir > maxRenderAlongDir) {
            targetSep -= dir * (candidateAlongDir - maxRenderAlongDir);
          }
        }
        fx.visualSepOffset += (targetSep - fx.visualSepOffset) * smoothRate;
        prevRenderX = rawX + fx.visualSepOffset;
      }
    };
    computeTeamVisualSep(this.world.playerUnits, 1, frontRightX);
    computeTeamVisualSep(this.world.botUnits, -1, frontLeftX);

    // Y-sort theo tọa độ chân thực tế (footY = GROUND_Y + (y - 520) * 0.4 + laneOffsetY)
    const allUnits = this.sortedUnitsBuf;
    allUnits.length = 0;
    for (let i = 0; i < this.world.playerUnits.length; i++) {
      allUnits.push(this.world.playerUnits[i]!);
    }
    for (let i = 0; i < this.world.botUnits.length; i++) {
      allUnits.push(this.world.botUnits[i]!);
    }
    allUnits.sort((a, b) => {
      const aFootY = this.GROUND_Y + (a.y - 520) * 0.4 + (a.laneOffsetY || 0);
      const bFootY = this.GROUND_Y + (b.y - 520) * 0.4 + (b.laneOffsetY || 0);
      if (Math.abs(aFootY - bFootY) > 0.01) return aFootY - bFootY;
      return a.id < b.id ? -1 : 1;
    });

    let spriteIdx = 0;
    let weaponSpriteIdx = 0;
    this.flashIdx = 0;
    this.ghostIdx = 0;

    const arrowPulsePhase = particleSystem.time * CONFIG.teamAndHealth.playerArrowPulseHz * Math.PI * 2;
    const arrowPulse = 0.88 + Math.sin(arrowPulsePhase) * 0.14;

    for (const unit of allUnits) {
      const isLeft = unit.team === 'LEFT';
      const isAllyControlled = unit.team === this.playerControlledTeam;
      const dir = unit.direction;

      const isTank = unit.config.type === 'TANK';
      const isSpecial = unit.config.type === 'SPECIAL';
      const isFlying = !!unit.config.flying || !!unit.spriteConfig?.flying;
      const unitH = isTank ? 115 : isSpecial ? 105 : 95;
      const unitW = isTank ? 65 : 50;

      // Giữ xác 300ms sau khi hoàn tất clip DIE rồi mới fade out 400ms
      let fadeAlpha = 1.0;
      if (!unit.isAlive) {
        const holdEnd = unit.deathAnimDuration + unit.corpseHoldDuration;
        if (unit.deathFadeTimer > holdEnd) {
          fadeAlpha = Math.max(0, 1.0 - (unit.deathFadeTimer - holdEnd) / Math.max(0.05, unit.corpseFadeDuration));
        }
      }

      const fx = this.getUnitFx(unit);
      const rawUnitX = (unit.prevX !== undefined ? unit.prevX + (unit.x - unit.prevX) * interp : unit.x) + fx.visualSepOffset;
      const unitX = this.isPixelMode ? Math.round(rawUnitX) : rawUnitX;
      const unitY = this.GROUND_Y + (unit.y - 520) * 0.4 + (unit.laneOffsetY || 0);

      // Lấy texture theo đúng màu phe (băng đô xanh P1 vs băng đô đỏ P2)
      const spriteTex = spriteLoader.getFrameTexture(unit.config.id, unit.currentClip, unit.currentFrameIndex, unit.team);
      const hasAtlasSprite = Boolean(spriteTex);

      const isMeleeStrike =
        unit.config.type === 'MELEE' ||
        unit.config.type === 'TANK' ||
        unit.lastAttackWasMeleeFallback;
      const targetLunge =
        unit.state === 'ATTACK'
          ? dir * Math.sin(unit.attackAnimProgress * Math.PI) * (isMeleeStrike ? (hasAtlasSprite ? 5 : 14) : -2)
          : 0;
      fx.smoothLunge += (targetLunge - fx.smoothLunge) * 0.32;

      // Knockback 6px đã easing ease-out rồi trả về bên trong Unit.ts
      const targetRecoilX = -dir * (unit.recoilOffset || 0);
      fx.smoothRecoil += (targetRecoilX - fx.smoothRecoil) * 0.55;

      // Chu kỳ 1 bước chân (4 frame = 1 bước): dùng chung cho bóng co giãn, bob 1-2px & bụi gót chân
      const stepPeriodFrames = Math.max(1, CONFIG.crowd.footDustIntervalFrames);
      const stepWave = Math.abs(Math.sin((unit.walkAnimPhase / stepPeriodFrames) * Math.PI));
      const isWalkingGround = unit.isAlive && !isFlying && unit.state === 'WALK' && unit.currentClip === 'walk';

      // 1. Bóng ellipse dưới chân (alpha CONFIG.crowd.shadowAlpha = 0.35, co giãn theo nhịp bước)
      const gfx = graphicsSettings.get();
      if (gfx.shadows) {
        const lift = isFlying ? Math.abs(unit.flyingOffset) : 0;
        const flyingScale = isFlying ? Math.max(0.35, 1.0 - lift / 120) : 1.0;
        const stepShadowPulse = isWalkingGround ? 1.0 - stepWave * 0.1 : 1.0;
        const strikeSquash = unit.state === 'ATTACK' ? 1 + Math.sin(unit.attackAnimProgress * Math.PI) * 0.06 : 1;
        const shadowW = unitW * 0.52 * flyingScale * stepShadowPulse * strikeSquash;
        const shadowH = 6.5 * flyingScale * stepShadowPulse;
        const footX = unitX + fx.smoothLunge + fx.smoothRecoil;
        this.shadowGraphics
          .ellipse(footX, unitY + 3, shadowW, shadowH)
          .fill({ color: 0x000000, alpha: CONFIG.crowd.shadowAlpha * fadeAlpha * flyingScale });
      }

      // 1.5 Mũi tên xanh dưới chân CHỈ hiện cho đơn vị phe người chơi điều khiển, có pulse nhẹ
      if (unit.isAlive && isAllyControlled) {
        const aw = CONFIG.teamAndHealth.playerArrowSizePx * arrowPulse;
        const ah = aw * 0.65;
        const ay = unitY + 11;
        const ax = unitX + fx.smoothLunge + fx.smoothRecoil;
        arrowG
          .poly([ax, ay - ah * 0.45, ax - aw, ay + ah, ax + aw, ay + ah])
          .fill({
            color: 0x4ade80,
            alpha: 0.85 + (arrowPulse - 0.88) * 1.0,
          })
          .stroke({ width: 1.5, color: 0x052e16, alpha: 0.9 });
      }

      // Hào quang hiệu ứng Stun / Immune Physical
      if (unit.status.isStunned()) {
        g.circle(unitX, unitY - unitH * 0.5, unitH * 0.55).stroke({ width: 4, color: 0x38bdf8, alpha: fadeAlpha });
      }
      if (unit.status.isImmunePhysical()) {
        g.circle(unitX, unitY - unitH * 0.5, unitH * 0.6).stroke({ width: 4, color: 0xa7f3d0, alpha: fadeAlpha });
      }

      // 2. Nhún 1.5px nhẹ đồng bộ đúng nhịp bước chân (chỉ khi đang đi bộ)
      const stepBob = isWalkingGround ? stepWave * CONFIG.crowd.stepBobPx : 0;
      const actualY = unitY + unit.flyingOffset - stepBob;
      const finalX = unitX + fx.smoothLunge + fx.smoothRecoil;

      // Bụi nhỏ ở đúng frame chạm gót
      if (unit.isAlive && isWalkingGround) {
        const stepIndex = Math.floor(unit.walkAnimPhase / stepPeriodFrames);
        if (stepIndex !== fx.lastStep) {
          fx.lastStep = stepIndex;
          const era = unit.spriteConfig?.age || this.activeAgeId;
          const dustColor = era >= 5 ? 0x64748b : era === 4 ? 0x78716c : 0xa8906c;
          particleSystem.spawnFootDust(finalX, unitY, dir, dustColor);
        }
      }

      // Muzzle flash tại đỉnh đánh tầm xa khi fallback / thiếu event World
      if (unit.isAlive && !isMeleeStrike) {
        const prog = unit.state === 'ATTACK' ? unit.attackAnimProgress : 0;
        if (fx.lastAttackProgress < 0.45 && prog >= 0.45) {
          particleSystem.spawnMuzzleFlash(finalX + dir * 30, unitY - unitH * 0.5, dir, unit.config.accentColor);
        }
        fx.lastAttackProgress = prog;
      } else {
        fx.lastAttackProgress = unit.state === 'ATTACK' ? unit.attackAnimProgress : 0;
      }

      // Fallback texture
      const unitEra = unit.spriteConfig?.age || (isLeft ? this.world.playerAge.currentAge : this.world.botAge.currentAge);
      const typeKey = unit.config.type.toLowerCase();
      const texKey = `unit_age${unitEra}_${typeKey}`;
      const legacyTex = this.textureMap.get(texKey);

      // Hạng mục D: Đơn vị phía sau (không giao tranh) giảm độ sáng ~8% để nổi bật tiền tuyến
      const isFrontlineOrEngaged =
        !unit.isAlive ||
        unit.state === 'ATTACK' ||
        unit.anim.state === 'ATTACK' ||
        unit.inCombatTimer > 0 ||
        unit === leadLeftUnit ||
        unit === leadRightUnit;
      const unitBodyTint = isFrontlineOrEngaged ? 0xffffff : CONFIG.crowd.rearUnitTintHex;

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

        const targetH = unit.spriteConfig?.targetHeight || unitH;
        const texH = spriteTex.height || 256;
        const scale = targetH / texH;
        sprite.scale.set(scale * dir, scale);
        sprite.alpha = fadeAlpha;
        sprite.rotation = 0;
        sprite.position.set(finalX, actualY);

        sprite.tint = unitBodyTint;
        this.applyUnitSpriteFx(sprite, unit, fadeAlpha, true);
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

        sprite.tint = unitBodyTint;
        this.applyUnitSpriteFx(sprite, unit, fadeAlpha, false);
      } else {
        this.drawCrispChibiUnit(g, unit);
      }

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

      // Thanh máu hiện cho TẤT CẢ đơn vị đang ở trạng thái attack hoặc đã bị đánh / vừa giao tranh + Ghost Bar 0.4s
      const showHpBar =
        unit.isAlive &&
        (unit.state === 'ATTACK' ||
          unit.anim.state === 'ATTACK' ||
          unit.hasTakenDamage ||
          unit.hp < unit.maxHp ||
          unit.inCombatTimer > 0);
      if (showHpBar) {
        const hpPct = Math.max(0, Math.min(1, unit.hp / unit.maxHp));
        const ghostPct = Math.max(hpPct, Math.min(1, unit.ghostHp / unit.maxHp));
        const barW = Math.max(CONFIG.teamAndHealth.barWidthPx, unitW);
        const barH = CONFIG.teamAndHealth.barHeightPx;
        const barX = finalX - barW / 2;
        const barY = unitY - unitH - 12;
        const hpColor = isAllyControlled ? CONFIG.teamAndHealth.allyHpColor : CONFIG.teamAndHealth.enemyHpColor;

        g.roundRect(barX - 1, barY - 1, barW + 2, barH + 2, 3).fill({ color: 0x0f172a, alpha: 0.88 * fadeAlpha });
        if (ghostPct > hpPct) {
          g.roundRect(barX, barY, barW * ghostPct, barH, 2).fill({ color: 0xffffff, alpha: 0.88 * fadeAlpha });
        }
        if (hpPct > 0) {
          g.roundRect(barX, barY, barW * hpPct, barH, 2).fill({ color: hpColor, alpha: fadeAlpha });
        }
      }

      // ==========================================
      // GẮN VŨ KHÍ TÙY BIẾN CHO NGƯỜI VƯỢN (HAND SOCKET ATTACHMENT)
      // ==========================================
      if (unit.config.id === 'stone_melee' && unit.isAlive) {
        const customDataUrl =
          unit.customWeaponDataUrl ||
          (unit.team === 'LEFT' ? gameSettings.getCustomWeapon() : null);

        if (customDataUrl) {
          let tex = this.customWeaponTextures.get(customDataUrl);
          if (!tex) {
            try {
              tex = Texture.from(customDataUrl);
              if (tex.source) tex.source.scaleMode = 'nearest';
              this.customWeaponTextures.set(customDataUrl, tex);
            } catch (e) {
              // ignore
            }
          }

          if (tex) {
            let weaponSprite = this.customWeaponSpritePool[weaponSpriteIdx];
            if (!weaponSprite) {
              weaponSprite = new Sprite();
              this.customWeaponSpritePool.push(weaponSprite);
              this.customWeaponSpriteContainer.addChild(weaponSprite);
            }
            weaponSpriteIdx++;

            weaponSprite.visible = true;
            weaponSprite.texture = tex;
            weaponSprite.anchor.set(0.2, 0.85); // Gốc chuôi gậy

            // Tính vị trí bàn tay theo cử động animation
            let handOffsetX = 18 * dir;
            let handOffsetY = -unitH * 0.44;
            let handRot = (-0.2 + Math.sin(unit.walkAnimPhase * Math.PI) * 0.15) * dir;

            if (unit.state === 'ATTACK') {
              const swingProg = unit.attackAnimProgress;
              handOffsetX = (16 + fx.smoothLunge * 0.6) * dir;
              handOffsetY = -unitH * (0.42 - Math.sin(swingProg * Math.PI) * 0.14);
              handRot = (-0.95 + swingProg * 2.3) * dir;
            }

            const handX = finalX + handOffsetX;
            const handY = actualY + handOffsetY;

            weaponSprite.position.set(
              this.isPixelMode ? Math.round(handX) : handX,
              this.isPixelMode ? Math.round(handY) : handY
            );
            weaponSprite.rotation = handRot;
            const weaponScale = 36 / 32;
            weaponSprite.scale.set(weaponScale * dir, weaponScale);
            weaponSprite.alpha = fadeAlpha;
          }
        }
      }
    }

    // Ẩn các sprite không dùng trong pool
    for (let i = spriteIdx; i < this.unitSpritePool.length; i++) {
      this.unitSpritePool[i]!.visible = false;
    }
    for (let i = weaponSpriteIdx; i < this.customWeaponSpritePool.length; i++) {
      this.customWeaponSpritePool[i]!.visible = false;
    }
    for (let i = this.flashIdx; i < this.unitFlashPool.length; i++) {
      this.unitFlashPool[i]!.visible = false;
    }
    for (let i = this.ghostIdx; i < this.ghostPool.length; i++) {
      this.ghostPool[i]!.visible = false;
    }
  }

  private flashIdx: number = 0;
  private ghostIdx: number = 0;

  private getUnitFx(unit: Unit): UnitFxState {
    let s = this.unitFx.get(unit);
    if (!s) {
      s = {
        lastStep: Math.floor(unit.walkAnimPhase * 0.25),
        lastAttackProgress: 0,
        visualSepOffset: 0,
        smoothLunge: 0,
        smoothRecoil: 0,
      };
      this.unitFx.set(unit, s);
    }
    return s;
  }

  private acquirePooled(pool: Sprite[], idx: number, container: Container, blend: 'add' | 'normal'): Sprite {
    let s = pool[idx];
    if (!s) {
      s = new Sprite();
      pool.push(s);
      container.addChild(s);
    }
    s.visible = true;
    s.blendMode = blend;
    return s;
  }

  /** Độ lao tới khi chém tại một thời điểm tiến trình đòn đánh */
  private lungeAt(unit: Unit, progress: number): number {
    const p = Math.max(0, Math.min(1, progress));
    const melee = unit.config.type === 'MELEE' || unit.config.type === 'TANK' || unit.lastAttackWasMeleeFallback;
    return unit.direction * Math.sin(p * Math.PI) * (melee ? 8 : -2);
  }

  /**
   * Hiệu ứng trên sprite nhân vật:
   * - Squash & Stretch 1.0 -> 1.08/0.92 -> 1.0 trong 100ms khi trúng đòn
   * - White flash 80ms dùng offscreen tint cache (không tạo canvas mỗi frame)
   */
  private applyUnitSpriteFx(sprite: Sprite, unit: Unit, fadeAlpha: number, hasAtlasSprite: boolean = false): void {
    const gfx = graphicsSettings.get();
    const flashSec = Math.max(0.01, CONFIG.hitFeedback.whiteFlashMs / 1000);
    const hurtK = unit.hurtFlashTimer > 0 ? Math.min(1, unit.hurtFlashTimer / flashSec) : 0;

    // Squash & Stretch trong CONFIG.hitFeedback.squashDurationMs (100ms)
    let sx = 1;
    let sy = 1;
    if (unit.squashTimer > 0 && unit.isAlive) {
      const sqDur = Math.max(0.01, CONFIG.hitFeedback.squashDurationMs / 1000);
      const sqT = 1 - unit.squashTimer / sqDur;
      const sqWave = Math.sin(sqT * Math.PI);
      sx += (CONFIG.hitFeedback.squashScaleX - 1.0) * sqWave;
      sy += (CONFIG.hitFeedback.squashScaleY - 1.0) * sqWave;
    }
    if (!hasAtlasSprite && unit.state === 'ATTACK') {
      const s = Math.sin(unit.attackAnimProgress * Math.PI);
      sx += 0.06 * s;
      sy -= 0.04 * s;
    }
    if (sx !== 1 || sy !== 1) {
      sprite.scale.set(sprite.scale.x * sx, sprite.scale.y * sy);
    }

    // Vệt dư ảnh chỉ bật cho kỷ nguyên công nghệ cao (5-6) hoặc đơn vị SPECIAL
    const unitEra = unit.spriteConfig?.age || 1;
    const allowTrails = unitEra >= 5 || unit.config.type === 'SPECIAL';
    const melee = unit.config.type === 'MELEE' || unit.config.type === 'TANK' || unit.lastAttackWasMeleeFallback;
    if (gfx.motionTrails && allowTrails && unit.isAlive && unit.state === 'ATTACK' && melee) {
      const p = unit.attackAnimProgress;
      if (p > 0.08 && p < 0.75) {
        const now = this.lungeAt(unit, p);
        const ghostBlend = gfx.glow ? 'add' : 'normal';
        const color = TEAM_GHOST_COLOR[unit.team];
        for (let k = 1; k <= 2; k++) {
          const past = this.lungeAt(unit, p - k * 0.075);
          const dx = now - past;
          if (Math.abs(dx) < 1.5) continue;
          const gh = this.acquirePooled(this.ghostPool, this.ghostIdx++, this.ghostContainer, ghostBlend);
          gh.texture = sprite.texture;
          gh.anchor.copyFrom(sprite.anchor);
          gh.scale.copyFrom(sprite.scale);
          gh.rotation = sprite.rotation;
          gh.position.set(sprite.position.x - dx, sprite.position.y);
          gh.tint = color;
          gh.alpha = (0.28 - k * 0.1) * fadeAlpha;
        }
      }
    }

    // White Flash 80ms dùng offscreen silhouette cache (không nhòe sáng làm mù vùng giao tranh)
    if (gfx.hitFlash && hurtK > 0) {
      const cachedWhite = this.getWhiteFlashTexture(sprite.texture);
      const fl = this.acquirePooled(
        this.unitFlashPool,
        this.flashIdx++,
        this.unitFlashContainer,
        cachedWhite ? 'normal' : 'add'
      );
      fl.texture = cachedWhite || sprite.texture;
      fl.anchor.copyFrom(sprite.anchor);
      fl.scale.copyFrom(sprite.scale);
      fl.rotation = sprite.rotation;
      fl.position.copyFrom(sprite.position);
      fl.tint = 0xffffff;
      fl.alpha = (cachedWhite ? 0.85 * hurtK : Math.min(0.32, hurtK * 0.35)) * fadeAlpha;
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

    // (Bóng đổ mềm đã được vẽ chung trong drawChibiUnitsBatch → lớp shadowGraphics)

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

  private drawProjectiles(interpolation: number = 1.0): void {
    const g = this.projGraphics;
    g.clear();
    const glow = this.projGlowGraphics;
    glow.clear();
    const mG = this.meteorGraphics;
    mG.clear();
    const mGlow = this.meteorGlowGraphics;
    mGlow.clear();
    const glowOn = graphicsSettings.get().glow;

    const interp = Math.max(0, Math.min(1.0, interpolation));

    for (const proj of this.world.projectilePool.getActive()) {
      // Nội suy vị trí đạn lướt siêu êm 10/10
      const rawPx = proj.prevX !== undefined ? proj.prevX + (proj.x - proj.prevX) * interp : proj.x;
      const rawPy = proj.prevY !== undefined ? proj.prevY + (proj.y - proj.prevY) * interp : proj.y;
      const px = this.isPixelMode ? Math.round(rawPx) : rawPx;
      const py = this.isPixelMode ? Math.round(rawPy) : rawPy;

      // Mưa thiên thạch vẽ lên Lớp 1 trên cùng (meteorGraphics / meteorGlowGraphics)
      const targetG = proj.isUltimateBarrage ? mG : g;
      const targetGlow = proj.isUltimateBarrage ? mGlow : glow;

      // Quầng sáng phát quang quanh đầu đạn (lớp Additive)
      if (glowOn) {
        const isRock = !proj.isUltimateBarrage && proj.radius >= 8;
        if (!isRock) {
          const r = proj.radius * (proj.isUltimateBarrage ? 1.6 : 1.0);
          targetGlow.circle(px, py, r * 3.4).fill({ color: proj.color, alpha: 0.16 });
          targetGlow.circle(px, py, r * 2.1).fill({ color: proj.color, alpha: 0.32 });
          targetGlow.circle(px, py, r * 1.1).fill({ color: 0xffffff, alpha: 0.45 });
        }
      }

      if (proj.isUltimateBarrage) {
        // Đạn Đại Pháo Hoàng Gia / Mưa Thiên Thạch rơi chéo rực lửa từ bầu trời (Lớp 1)
        const speed = Math.hypot(proj.vx, proj.vy) || 1;
        const ux = -proj.vx / speed;
        const uy = -proj.vy / speed;
        const tailLen = proj.radius * 4.2;

        targetG.poly([
          px - uy * proj.radius * 0.9, py + ux * proj.radius * 0.9,
          px + uy * proj.radius * 0.9, py - ux * proj.radius * 0.9,
          px + ux * tailLen, py + uy * tailLen,
        ]).fill({ color: proj.color, alpha: 0.55 });

        targetG.poly([
          px - uy * proj.radius * 0.5, py + ux * proj.radius * 0.5,
          px + uy * proj.radius * 0.5, py - ux * proj.radius * 0.5,
          px + ux * (tailLen * 0.65), py + uy * (tailLen * 0.65),
        ]).fill({ color: 0xfef08a, alpha: 0.85 });

        targetG.circle(px, py, proj.radius * 1.25).fill({ color: proj.color, alpha: 0.45 });
        targetG.circle(px, py, proj.radius).fill(0x292524);
        targetG.circle(px, py, proj.radius).stroke({ width: 2.5, color: proj.color });
        targetG.circle(px - 2, py - 2, proj.radius * 0.45).fill(0xfef08a);
        particleSystem.spawnTrail(px, py, proj.color);
      } else if (proj.radius >= 8) {
        // Đá tảng Máy Bắn Đá: Khối đá cuội to tròn có bóng đổ & vệt bụi
        g.circle(px, py, proj.radius).fill(0x44403c);
        g.circle(px, py, proj.radius).stroke({ width: 2, color: 0x1c1917 });
        g.circle(px - 2, py - 2, proj.radius * 0.45).fill(0x78716c);
        particleSystem.spawnDust(px, py);
      } else {
        // Đầu đạn thông thường
        g.circle(px, py, proj.radius * 1.3).fill(proj.color);
        g.circle(px, py, proj.radius * 0.7).fill(0xffffff);
        particleSystem.spawnTrail(px, py, proj.color);
      }
    }
  }

  // ==========================================
  // 6. HỆ THỐNG HẠT PARTICLE SYSTEM
  // ==========================================

  private drawParticles(): void {
    const normal = this.particleGraphics;
    const glowG = this.particleGlowGraphics;
    normal.clear();
    glowG.clear();

    for (const p of particleSystem.activeParticles) {
      if (p.alpha <= 0.01) continue;
      const g = p.additive ? glowG : normal;
      if (p.shape === 'CIRCLE' || p.shape === 'SMOKE') {
        g.circle(p.x, p.y, p.size).fill({ color: p.color, alpha: p.alpha });
      } else if (p.shape === 'GLOW') {
        // Quầng sáng 3 lớp: ngoài nhạt → lõi sáng
        g.circle(p.x, p.y, p.size).fill({ color: p.color, alpha: p.alpha * 0.22 });
        g.circle(p.x, p.y, p.size * 0.6).fill({ color: p.color, alpha: p.alpha * 0.42 });
        g.circle(p.x, p.y, p.size * 0.28).fill({ color: 0xffffff, alpha: p.alpha * 0.85 });
      } else if (p.shape === 'STREAK') {
        // Vệt tia lửa kéo dài theo hướng bay
        const len = Math.min(26, Math.hypot(p.vx, p.vy) * 0.035 + p.size * 0.6);
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const ux = p.vx / sp;
        const uy = p.vy / sp;
        g.moveTo(p.x - ux * len, p.y - uy * len)
          .lineTo(p.x, p.y)
          .stroke({ width: Math.max(1.2, p.size * 0.32), color: p.color, alpha: p.alpha, cap: 'round' });
      } else if (p.shape === 'DEBRIS') {
        const c = Math.cos(p.rotation) * p.size;
        const s = Math.sin(p.rotation) * p.size;
        g.poly([p.x - c + s * 0.5, p.y - s - c * 0.5, p.x + c + s * 0.5, p.y + s - c * 0.5, p.x + c - s * 0.5, p.y + s + c * 0.5, p.x - c - s * 0.5, p.y - s + c * 0.5])
          .fill({ color: p.color, alpha: p.alpha });
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

    // Số sát thương bay (cache metadata tránh rasterize lại Canvas2D mỗi frame)
    for (let i = 0; i < fts.length && poolIdx < this.textPool.length; i++) {
      const ft = fts[i]!;
      const idx = poolIdx++;
      const t = this.textPool[idx]!;
      const meta = this.textPoolMeta[idx];
      const fontSize = ft.isCrit ? CONFIG.damageNumber.critFontSizePx : CONFIG.damageNumber.baseFontSizePx;
      const strokeW = ft.strokeWidth || 4;

      if (!meta || meta.text !== ft.text) {
        t.text = ft.text;
        if (meta) meta.text = ft.text;
      }
      if (!meta || meta.fill !== ft.color || meta.fontSize !== fontSize || meta.strokeW !== strokeW) {
        t.style.fill = ft.color;
        t.style.fontSize = fontSize;
        t.style.stroke = { color: 0x000000, width: strokeW };
        if (meta) {
          meta.fill = ft.color;
          meta.fontSize = fontSize;
          meta.strokeW = strokeW;
        }
      }

      t.x = ft.x;
      t.y = ft.y;
      t.scale.set(ft.scale || 1.0);
      const lifeRatio = ft.duration / Math.max(0.05, ft.maxDuration);
      t.alpha = lifeRatio < 0.45 ? 1.0 : Math.max(0, 1.0 - (lifeRatio - 0.45) / 0.55);
      t.visible = true;
    }

    // Tên viewer gọi lính trên đầu
    for (const unit of this.world.playerUnits) {
      if (poolIdx >= this.textPool.length) break;
      const label = this.summonerLabels.get(unit.id);
      if (label && label.timer > 0) {
        const idx = poolIdx++;
        const t = this.textPool[idx]!;
        const meta = this.textPoolMeta[idx];
        const txt = `👑 ${label.name}`;
        if (!meta || meta.text !== txt) {
          t.text = txt;
          if (meta) meta.text = txt;
        }
        if (!meta || meta.fill !== 0xfacc15 || meta.fontSize !== 15) {
          t.style.fill = 0xfacc15;
          t.style.fontSize = 15;
          if (meta) {
            meta.fill = 0xfacc15;
            meta.fontSize = 15;
          }
        }
        t.x = unit.x;
        t.y = this.GROUND_Y - 120;
        t.scale.set(1.0);
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
    const fxG = this.ultimateFxGraphics;
    fxG.clear();
    if (!intro.active) {
      if (this.ultimateIntroText) this.ultimateIntroText.visible = false;
      return;
    }

    const elapsed = intro.duration - intro.timer;
    const strong = graphicsSettings.get().ultimateFlash;

    // Màn đen mờ phủ chiến trường
    g.rect(0, 0, this.V_WIDTH, this.V_HEIGHT).fill({ color: 0x000000, alpha: 0.65 });

    if (strong) {
      const cx = this.V_WIDTH / 2;
      const cy = this.V_HEIGHT / 2 - 30;
      // Dải điện ảnh trượt vào từ trên/dưới
      const barH = 70 * Math.min(1, elapsed / 0.12);
      g.rect(-400, -400, this.V_WIDTH + 800, 400 + barH).fill({ color: 0x000000, alpha: 0.9 });
      g.rect(-400, this.V_HEIGHT - barH, this.V_WIDTH + 800, 400 + barH).fill({ color: 0x000000, alpha: 0.9 });
      g.rect(-400, barH - 3, this.V_WIDTH + 800, 3).fill({ color: intro.themeColor, alpha: 0.9 });
      g.rect(-400, this.V_HEIGHT - barH, this.V_WIDTH + 800, 3).fill({ color: intro.themeColor, alpha: 0.9 });

      // Vệt tốc độ toả ra từ tâm (Additive) — xoay theo thời gian
      const rays = 36;
      const t = particleSystem.time;
      for (let i = 0; i < rays; i++) {
        const seed = Math.sin(i * 12.9898) * 43758.5453;
        const rnd = seed - Math.floor(seed);
        const a = (i / rays) * Math.PI * 2 + t * 0.6 + rnd * 0.15;
        const inner = 150 + rnd * 120 + ((t * 900 + rnd * 400) % 220);
        const outer = inner + 220 + rnd * 260;
        const w = 0.012 + rnd * 0.02;
        fxG.poly([
          cx + Math.cos(a) * inner, cy + Math.sin(a) * inner,
          cx + Math.cos(a - w) * outer, cy + Math.sin(a - w) * outer,
          cx + Math.cos(a + w) * outer, cy + Math.sin(a + w) * outer,
        ]).fill({ color: i % 3 === 0 ? 0xffffff : intro.themeColor, alpha: 0.32 + rnd * 0.3 });
      }
      // Quầng sáng sau chữ
      fxG.ellipse(cx, cy, 380, 70).fill({ color: intro.themeColor, alpha: 0.22 });
      fxG.ellipse(cx, cy, 240, 42).fill({ color: 0xffffff, alpha: 0.16 });
    }

    // Chữ tên tuyệt chiêu: "đấm" vào (phóng to → thu về) rồi rung nhịp
    if (this.ultimateIntroText) {
      this.ultimateIntroText.text = `⚡ ${intro.name.toUpperCase()} ⚡`;
      this.ultimateIntroText.style.fill = intro.themeColor;
      this.ultimateIntroText.visible = true;
      const punch = strong && elapsed < 0.14 ? 1.0 + (1 - elapsed / 0.14) * 0.9 : 1.0;
      this.ultimateIntroText.scale.set(punch * (1.0 + Math.sin(intro.timer * 8) * 0.08));
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
    this.unsubscribeSettings?.();
    this.unsubscribeSettings = null;
    for (const tex of this.customWeaponTextures.values()) {
      try {
        tex.destroy(true);
      } catch {
        // ignore
      }
    }
    this.customWeaponTextures.clear();

    for (const tex of this.cloudTextureCache.values()) {
      try {
        tex.destroy(true);
      } catch {
        // ignore
      }
    }
    this.cloudTextureCache.clear();

    for (const tex of this.skyTextureCache.values()) {
      try {
        tex.destroy(true);
      } catch {
        // ignore
      }
    }
    this.skyTextureCache.clear();

    for (const tex of this.whiteFlashTexCache.values()) {
      try {
        tex.destroy(true);
      } catch {
        // ignore
      }
    }
    this.whiteFlashTexCache.clear();

    for (const tex of this.slashTextures) {
      try {
        tex.destroy(true);
      } catch {
        // ignore
      }
    }
    this.slashTextures.length = 0;

    this.app?.destroy(true, { children: true });
    this.app = null;
  }
}
