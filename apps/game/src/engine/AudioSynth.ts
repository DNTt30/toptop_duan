/**
 * The Singularity Odyssey — Audio Synthesizer (Web Audio API)
 * Tổng hợp toàn bộ hiệu ứng âm thanh thời gian thực (beep, noise, glitch, chùm tia, nổ)
 * Hoàn toàn không phụ thuộc tệp âm thanh bên ngoài, dung lượng 0KB.
 */

export class AudioSynth {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private bgm: HTMLAudioElement | null = null;
  private bgmStarted: boolean = false;
  private bgmVolume: number = 0.35;

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  /**
   * Khởi tạo nhạc nền (BGM)
   */
  public initBGM(src: string = './audio/theme.mp4'): void {
    if (typeof window === 'undefined' || this.bgm) return;
    try {
      const resolvedSrc =
        typeof window !== 'undefined' && window.location.protocol === 'file:' && src.startsWith('/')
          ? '.' + src
          : src;
      this.bgm = new Audio(resolvedSrc);
      this.bgm.loop = true;
      this.bgm.volume = this.bgmVolume;
      this.bgm.preload = 'auto';

      // Lắng nghe tương tác đầu tiên của người dùng để mở khóa autoplay
      const unlockAudio = () => {
        if (!this.isMuted && this.bgm) {
          void this.bgm.play().then(() => {
            this.bgmStarted = true;
          }).catch(() => {});
        }
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
      };

      window.addEventListener('click', unlockAudio, { once: true });
      window.addEventListener('keydown', unlockAudio, { once: true });
      window.addEventListener('touchstart', unlockAudio, { once: true });
    } catch (e) {
      console.warn('Failed to initialize BGM audio element:', e);
    }
  }

  /**
   * Phát nhạc nền
   */
  public playBGM(): void {
    if (this.isMuted) return;
    if (!this.bgm) {
      this.initBGM();
    }
    if (this.bgm) {
      void this.bgm.play().then(() => {
        this.bgmStarted = true;
      }).catch(() => {
        // Trình duyệt chặn autoplay khi chưa có tương tác người dùng, unlock listener sẽ tự bật
      });
    }
  }

  /**
   * Tạm dừng nhạc nền
   */
  public pauseBGM(): void {
    if (this.bgm) {
      this.bgm.pause();
    }
  }

  /**
   * Điều chỉnh âm lượng nhạc nền (0.0 -> 1.0)
   */
  public setBGMVolume(volume: number): void {
    this.bgmVolume = Math.max(0, Math.min(1, volume));
    if (this.bgm) {
      this.bgm.volume = this.bgmVolume;
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.bgm) {
      if (muted) {
        this.bgm.pause();
      } else {
        void this.bgm.play().catch(() => {});
      }
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  /**
   * Âm thanh sản xuất quân (Spawn click pop)
   */
  public playSpawn(): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.08);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  /**
   * Âm thanh chém cận chiến (Melee strike thud)
   */
  public playMeleeHit(): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.1);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.11);
  }

  /**
   * Âm thanh bắn tầm xa (Pew / Whoosh / Laser)
   */
  public playRangedShoot(isLaser: boolean = false): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (isLaser) {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(980, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.12);
    } else {
      osc.type = 'square';
      osc.frequency.setValueAtTime(480, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.08);
    }

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.13);
  }

  /**
   * Âm thanh nổ bom / thiên thạch / pháo (Explosion boom)
   */
  public playExplosion(): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Tạo tiếng ồn nổ trầm (low-frequency noise/pulse)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(25, now + 0.35);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.36);
  }

  /**
   * Âm thanh Tháp Canh khai hỏa
   */
  public playTurretShoot(): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(550, now);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.1);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.11);
  }

  /**
   * Âm thanh Tiến hóa Kỷ Nguyên (Age Up Fanfare)
   */
  public playAgeUp(): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [261.63, 329.63, 392.0, 523.25]; // C - E - G - C5

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const delay = idx * 0.1;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + delay);

      gain.gain.setValueAtTime(0.001, now + delay);
      gain.gain.linearRampToValueAtTime(0.22, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + delay);
      osc.stop(now + delay + 0.65);
    });
  }

  /**
   * Âm thanh Nâng Cấp Quân / Tháp (Upgrade Chime)
   */
  public playUpgrade(): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [440, 554.37, 659.25]; // A4 - C#5 - E5
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const delay = idx * 0.06;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + delay);

      gain.gain.setValueAtTime(0.001, now + delay);
      gain.gain.linearRampToValueAtTime(0.2, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + delay);
      osc.stop(now + delay + 0.38);
    });
  }

  /**
   * Âm thanh Tuyệt Chiêu Kỷ Nguyên AI: System Reboot Glitch Noise
   */
  public playGlitchReboot(): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    for (let i = 0; i < 5; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const delay = i * 0.07;
      const freq = 120 + Math.random() * 1200;

      osc.type = i % 2 === 0 ? 'sawtooth' : 'square';
      osc.frequency.setValueAtTime(freq, now + delay);

      gain.gain.setValueAtTime(0.2, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.06);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + delay);
      osc.stop(now + delay + 0.07);
    }
  }

  /**
   * Âm thanh Thắng trận
   */
  public playVictory(): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const chords = [523.25, 659.25, 783.99, 1046.5];
    chords.forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 1.9);
    });
  }

  /**
   * Âm thanh Bại trận
   */
  public playDefeat(): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const chords = [392.0, 369.99, 329.63, 293.66];
    chords.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const delay = idx * 0.2;

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + delay);

      gain.gain.setValueAtTime(0.18, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + delay);
      osc.stop(now + delay + 0.65);
    });
  }
}

export const audioSynth = new AudioSynth();
if (typeof window !== 'undefined') {
  (window as any).audioSynth = audioSynth;
}
