/**
 * The Singularity Odyssey — Animation Controller
 * Quản lý vòng đời và trạng thái animation thời gian thực cho từng quân:
 * - Trạng thái: IDLE | WALK | ATTACK | HURT | DIE
 * - Bảng ưu tiên State Priority: DIE (100) > HURT (80) > ATTACK (60) > WALK (40) > IDLE (10)
 * - ATTACK không bị ngắt giữa chừng, phải chạy hết clip (trừ DIE hoặc Choáng nặng).
 * - Sát thương và đạn kích hoạt qua Animation Event System ('HIT_FRAME', 'SOUND', 'VFX').
 * - Tự động quét event kể cả khi tụt FPS (drop-frame an toàn).
 * - Hỗ trợ hit-stop 0.045s (~3 tick 60Hz) tạo độ đầm va chạm.
 */

import { type AnimationClipConfig, type AnimationEvent, type SpriteConfig } from '../data/sprites';

export type AnimState = 'IDLE' | 'WALK' | 'ATTACK' | 'HURT' | 'DIE';

export const STATE_PRIORITY: Record<AnimState, number> = {
  DIE: 100,
  HURT: 80,
  ATTACK: 60,
  WALK: 40,
  IDLE: 10,
};

export interface AnimationTickResult {
  currentClip: 'idle' | 'walk' | 'attack' | 'hurt' | 'die';
  frameIndex: number;
  triggerHitEvent: boolean;
  attackFinished: boolean;
  events: AnimationEvent[];
}

export class AnimationController {
  public state: AnimState = 'WALK';
  public queuedState: AnimState | null = null;
  public elapsedTime: number = 0;
  public currentFrameIndex: number = 0;
  public lastDispatchedFrame: number = -1;
  public hitStopTimer: number = 0;
  public minDisplayTimer: number = 0;
  public hasTriggeredHitThisSwing: boolean = false;

  private spriteConfig: SpriteConfig | null = null;

  constructor(spriteConfig: SpriteConfig | null, initialState: AnimState = 'WALK') {
    this.spriteConfig = spriteConfig;
    this.state = initialState;
    this.elapsedTime = 0;
    this.currentFrameIndex = 0;
    this.lastDispatchedFrame = -1;
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
   * Khung trúng đòn hoặc thả đạn trong clip attack (0-based)
   */
  public get attackHitFrame(): number {
    const atk = this.spriteConfig?.clips.attack;
    if (!atk) return 1;
    if (typeof atk.hitFrame === 'number') return atk.hitFrame;
    if (typeof atk.releaseFrame === 'number') return atk.releaseFrame;
    return Math.floor(atk.frameCount / 2);
  }

  /**
   * Yêu cầu chuyển trạng thái animation dựa trên bảng ưu tiên STATE_PRIORITY
   * @param next Trạng thái muốn chuyển tới
   * @param isHeavyHurt Có phải trúng đòn nặng (STUN / đẩy lùi mạnh) hay không
   */
  public requestState(next: AnimState, isHeavyHurt: boolean = false): boolean {
    if (this.state === 'DIE') {
      // DIE là trạng thái cuối cùng, không thể bị ngắt
      return false;
    }

    if (next === 'DIE') {
      // DIE có quyền ưu tiên cao nhất (100), ngắt ngay lập tức mọi trạng thái
      this.state = 'DIE';
      this.queuedState = null;
      this.elapsedTime = 0;
      this.currentFrameIndex = 0;
      this.lastDispatchedFrame = -1;
      this.hitStopTimer = 0;
      this.minDisplayTimer = 0;
      return true;
    }

    const currentPriority = STATE_PRIORITY[this.state];
    const nextPriority = STATE_PRIORITY[next];

    if (this.state === 'ATTACK') {
      // ATTACK (60) không bị ngắt bởi trạng thái thấp hơn (WALK: 40, IDLE: 10)
      if (next === 'HURT') {
        if (isHeavyHurt) {
          // Chỉ bị ngắt bởi choáng nặng / đẩy lùi mạnh
          this.state = 'HURT';
          this.elapsedTime = 0;
          this.currentFrameIndex = 0;
          this.lastDispatchedFrame = -1;
          this.minDisplayTimer = 0.12;
          this.queuedState = 'IDLE';
          return true;
        }
        // Đòn đánh thường không được ngắt ATTACK
        return false;
      }

      // Đưa trạng thái mới vào hàng đợi để chuyển ngay sau khi ATTACK kết thúc
      if (next !== 'ATTACK') {
        this.queuedState = next;
      }
      return false;
    }

    if (this.state === 'HURT') {
      // HURT đang phát phải tôn trọng thời gian hiển thị tối thiểu
      if (this.minDisplayTimer > 0 && nextPriority < currentPriority) {
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
    this.lastDispatchedFrame = -1;
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
    const dispatchedEvents: AnimationEvent[] = [];

    // 1. Hit-stop: làm đơ 2-3 tick khi đòn đánh vừa trúng đích để tạo độ đầm/lực
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dt;
      return {
        currentClip: this.currentClip,
        frameIndex: this.currentFrameIndex,
        triggerHitEvent: false,
        attackFinished: false,
        events: [],
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

    const prevFrame = this.currentFrameIndex;

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
          dispatchedEvents.push({
            name: 'hit',
            frame: hitFrame,
            type: 'HIT_FRAME',
          });
        }

        const totalDuration = frameCount / fps;
        if (this.elapsedTime >= totalDuration) {
          attackFinished = true;
          this.hasTriggeredHitThisSwing = false;
          dispatchedEvents.push({
            name: 'attack_end',
            frame: frameCount - 1,
            type: 'ANIMATION_END',
          });
          const next = this.queuedState || 'IDLE';
          this.queuedState = null;
          this.state = next;
          this.elapsedTime = 0;
          this.currentFrameIndex = 0;
          this.lastDispatchedFrame = -1;
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
          this.lastDispatchedFrame = -1;
        }
      } else if (this.state === 'DIE') {
        // DIE dừng lại ở khung cuối cùng
        this.currentFrameIndex = frameCount - 1;
      }
    }

    // 2. Quét các sự kiện Animation Events được định nghĩa trong clip config (SOUND, VFX, v.v.)
    if (clip?.events && clip.events.length > 0) {
      for (const ev of clip.events) {
        // Nếu frame rơi vào khoảng giữa lần dispatch trước và frame hiện tại
        if (this.currentFrameIndex >= ev.frame && this.lastDispatchedFrame < ev.frame) {
          if (!dispatchedEvents.some(d => d.frame === ev.frame && d.name === ev.name)) {
            dispatchedEvents.push(ev);
          }
        }
      }
    }
    this.lastDispatchedFrame = this.currentFrameIndex;

    return {
      currentClip: this.currentClip,
      frameIndex: this.currentFrameIndex,
      triggerHitEvent,
      attackFinished,
      events: dispatchedEvents,
    };
  }

  /**
   * Kích hoạt hit-stop từ bên ngoài (ví dụ vũ khí nặng, đạn nổ)
   */
  public applyHitStop(durationSec: number = 0.045): void {
    this.hitStopTimer = Math.max(this.hitStopTimer, durationSec);
  }
}
