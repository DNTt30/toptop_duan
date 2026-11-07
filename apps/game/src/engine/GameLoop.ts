/**
 * The Singularity Odyssey — Game Loop
 * Fixed Timestep Loop (60 tick/s) với Accumulator Pattern.
 * Đảm bảo mô phỏng vật lý và tính toán sát thương độc lập 100% với tốc độ làm tươi màn hình (Refresh Rate).
 */

export class GameLoop {
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private lastTime: number = 0;
  private accumulator: number = 0;
  public readonly fixedStep: number = 1 / 60; // 0.016666 giây mỗi tick
  private animationFrameId: number | null = null;
  public speedMultiplier: number = 1.0; // 1x, 2x

  constructor(
    private readonly onUpdate: (dt: number) => void,
    private readonly onRender: (interpolation: number) => void
  ) {}

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
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

    let frameDelta = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    // Ngăn chặn "Spiral of Death" khi người dùng chuyển tab (giới hạn delta tối đa 0.25s)
    if (frameDelta > 0.25) {
      frameDelta = 0.25;
    }

    if (!this.isPaused) {
      this.accumulator += frameDelta * this.speedMultiplier;

      while (this.accumulator >= this.fixedStep) {
        this.onUpdate(this.fixedStep);
        this.accumulator -= this.fixedStep;
      }
    }

    // Render với tỷ lệ nội suy (interpolation factor) giữa 2 fixed ticks
    const interpolation = this.accumulator / this.fixedStep;
    this.onRender(interpolation);

    this.animationFrameId = requestAnimationFrame(this.tick);
  };
}
