import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { type BgEnvironmentMode } from './congregation';
import { SacredBuddhaStage } from './sacred-stage';

export type { BgEnvironmentMode };

export interface PlayActionOptions {
  modelUrl: string;
  clipName: string;
  scale: number;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  durationMs: number;
  senderName?: string;
  giftName?: string;
  giftCount?: number;
  onStarted: () => void;
  onCompleted: () => void;
  onError: (code: 'MODEL_LOAD_FAILED' | 'CLIP_NOT_FOUND' | 'WEBGL_LOST', message: string) => void;
}

export class ThreeStage {
  private sacredStage: SacredBuddhaStage | null = null;
  private gltfLoader = new GLTFLoader();
  private customModel: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private isDestroyed = false;

  constructor(private readonly container: HTMLElement) {
    try {
      this.sacredStage = new SacredBuddhaStage(container);
    } catch (err) {
      console.warn('Failed to initialize SacredBuddhaStage:', err);
    }
  }

  public isWebGLSupported(): boolean {
    return this.sacredStage !== null;
  }

  public setVisualMode(hasBackground: boolean): void {
    this.sacredStage?.setVisualMode(hasBackground);
  }

  public setBackgroundMode(mode: BgEnvironmentMode): void {
    this.sacredStage?.setEnvironmentMode(mode);
  }

  /**
   * Kích hoạt chuyển động và hiệu ứng khi có sự kiện tặng quà
   */
  public playAction(opts: PlayActionOptions): void {
    if (!this.sacredStage) {
      return opts.onError('WEBGL_LOST', 'WebGL renderer is unavailable');
    }

    // 1. Nếu là mô hình mặc định (sample-character.glb), kích hoạt Đại Lễ Phật Giáo 3D
    const isDefaultModel =
      !opts.modelUrl ||
      opts.modelUrl.includes('sample-character.glb') ||
      opts.modelUrl.includes('default');

    if (isDefaultModel) {
      // Kích hoạt hoa sen nở rộ, hào quang kim quang xoay bừng sáng và kịch bản nhân vật
      this.sacredStage.triggerGiftCelebration(opts.giftCount || 1, opts.senderName, opts.giftName);
      opts.onStarted();

      const duration = Math.max(opts.durationMs || 3500, 2000);
      setTimeout(() => {
        if (!this.isDestroyed) {
          opts.onCompleted();
        }
      }, duration);
      return;
    }

    // 2. Nếu streamer cấu hình file GLB nhân vật riêng (Custom 3D Model từ CharacterTab)
    this.clearModel();
    this.gltfLoader.load(
      opts.modelUrl,
      (gltf) => {
        if (this.isDestroyed) return;

        const model = gltf.scene;
        this.customModel = model;

        model.scale.setScalar(opts.scale);
        model.position.set(opts.position.x, opts.position.y, opts.position.z);
        model.rotation.set(opts.rotation.x, opts.rotation.y, opts.rotation.z);

        // Kích hoạt cả hiệu ứng sen và nạp model tùy biến
        this.sacredStage?.triggerGiftCelebration();

        let clip = gltf.animations.find((a) => a.name.toLowerCase() === opts.clipName.toLowerCase());
        if (!clip && gltf.animations.length > 0) {
          clip = gltf.animations[0];
        }

        if (clip) {
          this.mixer = new THREE.AnimationMixer(model);
          const action = this.mixer.clipAction(clip);
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
          action.play();
        }

        opts.onStarted();

        setTimeout(() => {
          if (!this.isDestroyed) {
            this.clearModel();
            opts.onCompleted();
          }
        }, opts.durationMs || 3500);
      },
      undefined,
      (error) => {
        // Báo lỗi để Overlay kích hoạt chế độ Fallback 2D theo kiến trúc S2/S4
        console.warn('Custom GLTF load failed, triggering Fallback 2D:', error);
        opts.onError('MODEL_LOAD_FAILED', (error as Error)?.message || 'Failed to load custom 3D model');
      }
    );
  }

  /**
   * Kích hoạt chuyển động chào mừng khi có Phật tử vào live (Join / Follow) — Kịch Bản 1
   */
  public triggerWelcomeArrival(username?: string): void {
    this.sacredStage?.triggerWelcomeArrival(username);
  }

  /**
   * Kịch Bản 2: Dâng Nén Tâm Hương
   */
  public triggerOfferIncense(username?: string): void {
    this.sacredStage?.triggerGiftCelebration(1, username, 'Hương Trầm');
  }

  /**
   * Kịch Bản 3: Đại Lễ Dâng Sen & Ngũ Thể Đầu Địa
   */
  public triggerOfferLotus(username?: string): void {
    this.sacredStage?.triggerGiftCelebration(5, username, 'Đại Hoa Sen Vàng');
  }

  /**
   * Kịch Bản 4: Thả Đèn Hoa Đăng Cầu Nguyện
   */
  public triggerReleaseLantern(username?: string): void {
    this.sacredStage?.triggerReleaseLantern(username);
  }

  /**
   * Kịch Bản 5: Trợ Niệm Đồng Tu (Khi Comment "A Di Đà Phật")
   */
  public triggerChanting(username?: string): void {
    this.sacredStage?.triggerChanting(username);
  }

  /**
   * Kịch Bản 6: Đại Lễ Nhiễu Phật (Kinh Hành Tập Thể)
   */
  public triggerCircumambulation(): void {
    this.sacredStage?.triggerCircumambulation();
  }

  public clearModel(): void {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
    this.customModel = null;
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.clearModel();
    this.sacredStage?.destroy();
    this.sacredStage = null;
  }
}
