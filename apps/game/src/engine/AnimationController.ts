/**
 * The Singularity Odyssey — Animation Controller
 * Quản lý vòng đời và trạng thái animation thời gian thực cho từng quân:
 * - Trạng thái: IDLE | WALK | ATTACK | HURT | DIE
 * - ATTACK không bị ngắt giữa chừng, phải chạy hết clip (trừ DIE). Cooldown tấn công luôn >= thời lượng clip attack.
 * - Sát thương và đạn chỉ kích hoạt đúng khung "hit" (cận chiến) hoặc "release" (tầm xa), kèm hit-stop 2-3 tick (0.04-0.05s).
 * - HURT chỉ chen vào khi bị choáng hoặc đẩy lùi mạnh; đòn thường chỉ nháy trắng + giật lùi bằng code, không ngắt ATTACK.
 * - DIE không bao giờ bị ngắt, quân chết không nhận sát thương.
 * - Chuyển trạng thái đưa vào hàng đợi, mỗi clip có thời gian hiển thị tối thiểu (minDisplayTime).
 * - Tính khung theo thời gian thực (elapsed * fps), tự động drop frame khi tụt FPS chứ không kéo dài clip.
 */

import { type AnimationClipConfig, type SpriteConfig } from '../data/sprites';

export type AnimState = 'IDLE' | 'WALK' | 'ATTACK' | 'HURT' | 'DIE';

export interface AnimationTickResult {
  currentClip: 'idle' | 'walk' | 'attack' | 'hurt' | 'die';
  frameIndex: number;
  triggerHitEvent: boolean;
  attackFinished: boolean;
}

export class AnimationController {
  public state: AnimState = 'WALK';
  public queuedState: AnimState | null = null;
  public elapsedTime: number = 0;
  public currentFrameIndex: number = 0;
  public hitStopTimer: number = 0;
  public minDisplayTimer: number = 0;
  public hasTriggeredHitThisSwing: boolean = false;

  private spriteConfig: SpriteConfig | null = null;

  constructor(spriteConfig: SpriteConfig | null, initialState: AnimState = 'WALK') {
    this.spriteConfig = spriteConfig;
    this.state = initialState;
    this.elapsedTime = 0;
    this.currentFrameIndex = 0;
  }

  public setSpriteConfig(spriteConfig: SpriteConfig | null): void {
    this.spriteConfig = spriteConfig;
  }

  public get currentClip(): 'idle' | 'walk' | 'attack' | 'hurt' | 'die' {
    switch (this.state) {
      case 'IDLE':
        return 'idle';
      case 'WALK':
        return 'walk';
      case 'ATTACK':
        return 'attack';
      case 'HURT':
        return 'hurt';
      case 'DIE':
        return 'die';
      default:
        return 'walk';
    }
  }

  public get currentClipConfig(): AnimationClipConfig | undefined {
    return this.spriteConfig?.clips[this.currentClip];
  }

  /**
   * Thời lượng (giây) của clip attack: frameCount / fps
   */
  public get attackClipDuration(): number {
    const atk = this.spriteConfig?.clips.attack;
    if (!atk || atk.frameCount <= 0 || atk.fps <= 0) return 0.3;
    return atk.frameCount / atk.fps;
  }

  /**
   * Khung trúng đòn hoặc thả đạn trong clip attack
   */
  public get attackHitFrame(): number {
    const atk = this.spriteConfig?.clips.attack;
    if (!atk) return 1;
    if (typeof atk.hitFrame === 'number') return atk.hitFrame;
    if (typeof atk.releaseFrame === 'number') return atk.releaseFrame;
    return Math.floor(atk.frameCount / 2);
  }

  /**
   * Yêu cầu chuyển trạng thái animation với các quy tắc ưu tiên
   * @param next Trạng thái muốn chuyển tới
   * @param isHeavyHurt Có phải trúng đòn nặng (STUN / đẩy lùi mạnh) hay không
   */
  public requestState(next: AnimState, isHeavyHurt: boolean = false): boolean {
    if (this.state === 'DIE') {
      // DIE là trạng thái cuối cùng, không bao giờ bị ngắt
      return false;
    }

    if (next === 'DIE') {
      // DIE có quyền ưu tiên cao nhất, ngắt ngay lập tức mọi trạng thái
      this.state = 'DIE';
      this.queuedState = null;
      this.elapsedTime = 0;
      this.currentFrameIndex = 0;
      this.hitStopTimer = 0;
      this.minDisplayTimer = 0;
      return true;
    }

    if (this.state === 'ATTACK') {
      // ATTACK không bị ngắt giữa chừng, phải chạy hết clip
      if (next === 'HURT') {
        if (isHeavyHurt) {
          // Chỉ ngắt khi bị choáng hoặc đẩy lùi hạng nặng
          this.state = 'HURT';
          this.elapsedTime = 0;
          this.currentFrameIndex = 0;
          this.minDisplayTimer = 0.12;
          this.queuedState = 'IDLE';
          return true;
        }
        // Đòn đánh thường không được ngắt ATTACK
        return false;
      }

      // Đưa trạng thái mới (WALK, IDLE) vào hàng đợi để chuyển ngay sau khi ATTACK kết thúc
      if (next !== 'ATTACK') {
        this.queuedState = next;
      }
      return false;
    }

    if (this.state === 'HURT') {
      if (this.minDisplayTimer > 0) {
        this.queuedState = next;
        return false;
      }
    }

    if (this.state === next) {
      return true;
    }

    // Chuyển sang trạng thái mới
    this.state = next;
    this.elapsedTime = 0;
    this.currentFrameIndex = 0;
    this.hasTriggeredHitThisSwing = false;

    // Thiết lập thời gian hiển thị tối thiểu để chống nhấp nháy
    const clip = this.currentClipConfig;
    this.minDisplayTimer = clip?.minDisplayTime ?? (next === 'HURT' ? 0.12 : 0.08);

    return true;
  }

  /**
   * Cập nhật animation theo thời gian thực (Delta Time)
   */
  public update(dt: number): AnimationTickResult {
    let triggerHitEvent = false;
    let attackFinished = false;

    // 1. Hit-stop: làm đơ 2-3 tick khi đòn đánh vừa trúng đích để tạo độ đầm/lực
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dt;
      return {
        currentClip: this.currentClip,
        frameIndex: this.currentFrameIndex,
        triggerHitEvent: false,
        attackFinished: false,
      };
    }

    if (this.minDisplayTimer > 0) {
      this.minDisplayTimer -= dt;
    }

    this.elapsedTime += dt;

    const clip = this.currentClipConfig;
    const fps = clip?.fps || 10;
    const frameCount = clip?.frameCount || 4;
    const isLoop = clip?.loop ?? (this.state === 'IDLE' || this.state === 'WALK');

    if (isLoop) {
      // Hoạt ảnh lặp: tính khung bằng thời gian trôi qua, tự bỏ khung khi lag
      this.currentFrameIndex = Math.floor(this.elapsedTime * fps) % frameCount;
    } else {
      // Hoạt ảnh không lặp (ATTACK, HURT, DIE)
      const rawFrame = Math.floor(this.elapsedTime * fps);
      this.currentFrameIndex = Math.min(frameCount - 1, rawFrame);

      if (this.state === 'ATTACK') {
        const hitFrame = this.attackHitFrame;
        // Kích hoạt sát thương/đạn đúng khung hitFrame
        if (this.currentFrameIndex >= hitFrame && !this.hasTriggeredHitThisSwing) {
          this.hasTriggeredHitThisSwing = true;
          triggerHitEvent = true;
          // Áp dụng hit-stop 0.045s (~3 tick 60Hz)
          this.hitStopTimer = 0.045;
        }

        const totalDuration = frameCount / fps;
        if (this.elapsedTime >= totalDuration) {
          attackFinished = true;
          this.hasTriggeredHitThisSwing = false;
          const next = this.queuedState || 'IDLE';
          this.queuedState = null;
          this.state = next;
          this.elapsedTime = 0;
          this.currentFrameIndex = 0;
          this.minDisplayTimer = 0.08;
        }
      } else if (this.state === 'HURT') {
        const totalDuration = frameCount / fps;
        if (this.elapsedTime >= totalDuration && this.minDisplayTimer <= 0) {
          const next = this.queuedState || 'IDLE';
          this.queuedState = null;
          this.state = next;
          this.elapsedTime = 0;
          this.currentFrameIndex = 0;
        }
      } else if (this.state === 'DIE') {
        // DIE dừng lại ở khung cuối cùng
        this.currentFrameIndex = frameCount - 1;
      }
    }

    return {
      currentClip: this.currentClip,
      frameIndex: this.currentFrameIndex,
      triggerHitEvent,
      attackFinished,
    };
  }

  /**
   * Kích hoạt hit-stop từ bên ngoài (ví dụ vũ khí nặng, đạn nổ)
   */
  public applyHitStop(durationSec: number = 0.045): void {
    this.hitStopTimer = Math.max(this.hitStopTimer, durationSec);
  }
}
