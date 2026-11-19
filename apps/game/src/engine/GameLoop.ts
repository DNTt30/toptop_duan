/**
 * The Singularity Odyssey — Game Loop
 * Fixed Timestep Loop (60 tick/s) với Accumulator Pattern & nội suy Render.
 * Đảm bảo mô phỏng vật lý và sát thương độc lập 100% với tốc độ làm tươi màn hình.
 */

import { CONFIG } from '../data/combatFeelConfig';

export interface LoopPerfStats {
  fps: number;
  frameTimeMs: number;
  logicTimeMs: number;
  renderTimeMs: number;
  hudDomTimeMs: number;
  domTouchesPerFrame: number;
  gcPauseMs: number;
  simSteps: number;
  droppedSteps: number;
}

export class GameLoop {
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private lastTime: number = 0;
  private accumulator: number = 0;
  public readonly fixedStep: number = CONFIG.loop.fixedStepSec; // 1 / 60 giây mỗi tick
  private animationFrameId: number | null = null;
  public speedMultiplier: number = 1.0;

  // Thống kê hiệu năng mở rộng phục vụ bảng debug (phím F3 - Hạng mục A)
  private fpsSampleFrames: number = 0;
  private fpsSampleStartMs: number = 0;
  private pendingDomTouches: number = 0;
  private pendingHudDomMs: number = 0;
  private lastHeapUsedBytes: number = 0;
  private onAfterFrameCallbacks: Array<() => void> = [];

  public readonly perfStats: LoopPerfStats = {
    fps: CONFIG.loop.fixedHz,
    frameTimeMs: 1000 / CONFIG.loop.fixedHz,
    logicTimeMs: 0,
    renderTimeMs: 0,
    hudDomTimeMs: 0,
    domTouchesPerFrame: 0,
    gcPauseMs: 0,
    simSteps: 0,
    droppedSteps: 0,
  };

  constructor(
    private readonly onUpdate: (dt: number) => void,
    private readonly onRender: (interpolation: number, frameDt: number) => void,
    private readonly onBatchDomUpdate?: () => void
  ) {}

  /** Ghi nhận số lần chạm DOM và thời gian cập nhật HUD/DOM trong frame hiện tại */
  public recordDomUpdate(touches: number, elapsedMs: number): void {
    this.pendingDomTouches += touches;
    this.pendingHudDomMs += elapsedMs;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    const now = performance.now();
    this.lastTime = now;
    this.fpsSampleStartMs = now;
    this.fpsSampleFrames = 0;
    this.accumulator = 0;
    const mem = (performance as any).memory;
    this.lastHeapUsedBytes = mem ? mem.usedJSHeapSize : 0;
    this.animationFrameId = requestAnimationFrame(this.tick);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  public togglePause(): boolean {
    this.isPaused = !this.isPaused;
    return this.isPaused;
  }

  public setSpeed(multiplier: number): void {
    this.speedMultiplier = Math.max(0.5, Math.min(5.0, multiplier));
  }

  private tick = (currentTime: number): void => {
    if (!this.isRunning) return;

    const frameStartMs = performance.now();
    const rawDeltaMs = currentTime - this.lastTime;
    this.lastTime = currentTime;

    // Giới hạn delta tối đa theo CONFIG (mặc định 50ms) để tránh nhảy cóc khi chuyển tab / lag
    const clampedDeltaMs = Math.max(0, Math.min(CONFIG.loop.maxDeltaMs, rawDeltaMs));
    const frameDeltaSec = clampedDeltaMs / 1000;

    let steps = 0;
    const logicStartMs = performance.now();
    if (!this.isPaused) {
      this.accumulator += frameDeltaSec * this.speedMultiplier;

      while (
        this.accumulator >= this.fixedStep &&
        steps < CONFIG.loop.maxStepsPerFrame
      ) {
        this.onUpdate(this.fixedStep);
        this.accumulator -= this.fixedStep;
        steps++;
      }

      // Chống spiral of death (Hạng mục A.4): tối đa 2 step bù/frame, vượt thì bỏ phần thời gian dư
      if (this.accumulator >= this.fixedStep) {
        this.perfStats.droppedSteps += Math.floor(this.accumulator / this.fixedStep);
        if (CONFIG.loop.dropExcessAccumulator) {
          this.accumulator = 0;
        } else {
          this.accumulator = this.accumulator % this.fixedStep;
        }
      }
    }
    const logicElapsedMs = performance.now() - logicStartMs;

    // Render với tỷ lệ nội suy (interpolation factor) giữa 2 fixed ticks
    const renderStartMs = performance.now();
    const interpolation = Math.max(0, Math.min(1, this.accumulator / this.fixedStep));
    this.onRender(interpolation, frameDeltaSec * this.speedMultiplier);
    const renderElapsedMs = performance.now() - renderStartMs;

    // Dồn toàn bộ ghi DOM động (Minimap transform, F3 debug readout) vào ĐÚNG 1 LẦN cuối frame
    if (this.onBatchDomUpdate) {
      const domStart = performance.now();
      this.onBatchDomUpdate();
      this.pendingHudDomMs += performance.now() - domStart;
    }

    // Ước lượng GC pause nếu heap vừa sụt giảm đột ngột kèm spike frame time
    const mem = (performance as any).memory;
    let detectedGcMs = 0;
    if (mem && typeof mem.usedJSHeapSize === 'number') {
      const curHeap = mem.usedJSHeapSize;
      if (this.lastHeapUsedBytes - curHeap > 180 * 1024) {
        const workMs = logicElapsedMs + renderElapsedMs + this.pendingHudDomMs;
        detectedGcMs = Math.max(0.2, Math.min(25, Math.max(0, rawDeltaMs - 16.7 - workMs)));
      }
      this.lastHeapUsedBytes = curHeap;
    }

    const totalFrameElapsedMs = performance.now() - frameStartMs;
    this.fpsSampleFrames++;
    const sampleElapsedMs = currentTime - this.fpsSampleStartMs;
    if (sampleElapsedMs >= 250) {
      this.perfStats.fps = Math.round((this.fpsSampleFrames * 1000) / Math.max(1, sampleElapsedMs));
      this.fpsSampleFrames = 0;
      this.fpsSampleStartMs = currentTime;
    }

    const alpha = 0.18;
    this.perfStats.frameTimeMs += (Math.max(rawDeltaMs, totalFrameElapsedMs) - this.perfStats.frameTimeMs) * alpha;
    this.perfStats.logicTimeMs += (logicElapsedMs - this.perfStats.logicTimeMs) * alpha;
    this.perfStats.renderTimeMs += (renderElapsedMs - this.perfStats.renderTimeMs) * alpha;
    this.perfStats.hudDomTimeMs += (this.pendingHudDomMs - this.perfStats.hudDomTimeMs) * alpha;
    this.perfStats.domTouchesPerFrame = this.pendingDomTouches;
    this.perfStats.gcPauseMs = detectedGcMs > 0 ? detectedGcMs : this.perfStats.gcPauseMs * 0.92;
    this.perfStats.simSteps = steps;

    this.pendingDomTouches = 0;
    this.pendingHudDomMs = 0;

    this.animationFrameId = requestAnimationFrame(this.tick);
  };
}
