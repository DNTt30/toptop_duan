/**
 * BuddhaLive Studio — Temple Audio Synthesizer (Web Audio API)
 * Zero external dependencies. Generates authentic Tibetan singing bowls,
 * temple bells (Đại Hồng Chung), wooden fish (Mõ), bronze gongs (Khánh đồng),
 * wind chimes (Phong linh), and water wave ambient soundscapes in real-time.
 */

export type BgAudioTheme = 'GOLDEN_TEMPLE' | 'COMMUNAL_HALL' | 'TEMPLE' | 'TRANSPARENT';

export class TempleAudioSynthesizer {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private currentTheme: BgAudioTheme = 'GOLDEN_TEMPLE';

  // Ambient playback nodes
  private ambientGain: GainNode | null = null;
  private ambientOscs: (OscillatorNode | AudioNode)[] = [];
  private ambientTimer: any = null;
  private ambientSubTimer: any = null;

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

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (muted) {
      this.stopAmbient();
    } else {
      this.startAmbientForTheme(this.currentTheme);
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public getCurrentTheme(): BgAudioTheme {
    return this.currentTheme;
  }

  /**
   * Chuyển đổi nhạc nền theo từng bối cảnh linh thiêng
   */
  public switchTheme(theme: BgAudioTheme): void {
    this.currentTheme = theme;
    if (this.isMuted) return;
    this.stopAmbient();
    setTimeout(() => {
      if (!this.isMuted && this.currentTheme === theme) {
        this.startAmbientForTheme(theme);
      }
    }, 400);
  }

  public startZenAmbient(volume: number = 0.18): void {
    this.startAmbientForTheme(this.currentTheme, volume);
  }

  public stopZenAmbient(): void {
    this.stopAmbient();
  }

  private startAmbientForTheme(theme: BgAudioTheme, volume: number = 0.18): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;
    if (this.ambientGain) return;

    switch (theme) {
      case 'COMMUNAL_HALL':
        this.startCommunalAmbient(ctx, volume * 1.1);
        break;
      case 'TEMPLE':
        this.startTempleLotusAmbient(ctx, volume * 1.05);
        break;
      case 'TRANSPARENT':
        this.startTransparentZenAmbient(ctx, volume * 0.85);
        break;
      case 'GOLDEN_TEMPLE':
      default:
        this.startGoldenTempleAmbient(ctx, volume);
        break;
    }
  }

  /**
   * 1. Bối cảnh Điện Phật Vàng: Zen 432Hz Healing Frequency + Chuông Đại Hồng Chung
   */
  private startGoldenTempleAmbient(ctx: AudioContext, volume: number): void {
    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.linearRampToValueAtTime(volume, now + 2.5);
    masterGain.connect(ctx.destination);
    this.ambientGain = masterGain;

    const freqs = [108, 216, 324, 432];
    this.ambientOscs = freqs.map((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.setValueAtTime(0.07 + i * 0.02, ctx.currentTime);
      lfoGain.gain.setValueAtTime(0.06, ctx.currentTime);
      lfo.connect(lfoGain.gain);

      gain.gain.setValueAtTime(0.035 / (i + 1), ctx.currentTime);
      osc.connect(gain);
      gain.connect(masterGain);

      osc.start();
      lfo.start();
      return osc;
    });

    this.ambientTimer = setInterval(() => {
      if (!this.isMuted && this.ambientGain && this.currentTheme === 'GOLDEN_TEMPLE') {
        this.playTempleBell(0.18);
      }
    }, 11000);
  }

  /**
   * 2. Bối cảnh Sảnh Đình Làng: Hợp âm ngũ cung Bắc Bộ (D3, A3, D4, F#4) + Tiếng Khánh đồng & Mõ gỗ
   */
  private startCommunalAmbient(ctx: AudioContext, volume: number): void {
    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.linearRampToValueAtTime(volume, now + 2.5);
    masterGain.connect(ctx.destination);
    this.ambientGain = masterGain;

    // Thang âm ngũ cung Bắc Bộ (D major pentatonic: D - E - F# - A - B)
    const communalNotes = [146.83, 220.0, 293.66, 369.99, 440.0];
    this.ambientOscs = communalNotes.map((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      const tremolo = ctx.createOscillator();
      const tremoloGain = ctx.createGain();
      tremolo.frequency.setValueAtTime(0.12 + idx * 0.03, ctx.currentTime);
      tremoloGain.gain.setValueAtTime(0.04, ctx.currentTime);
      tremolo.connect(tremoloGain.gain);

      gain.gain.setValueAtTime(0.03 / (idx + 1), ctx.currentTime);
      osc.connect(gain);
      gain.connect(masterGain);

      osc.start();
      tremolo.start();
      return osc;
    });

    // Khánh đồng định kỳ mỗi 9 giây
    this.ambientTimer = setInterval(() => {
      if (!this.isMuted && this.ambientGain && this.currentTheme === 'COMMUNAL_HALL') {
        this.playBronzeGong(0.22);
      }
    }, 9000);

    // Tiếng mõ gỗ nhịp đôi xen kẽ
    this.ambientSubTimer = setInterval(() => {
      if (!this.isMuted && this.ambientGain && this.currentTheme === 'COMMUNAL_HALL') {
        this.playWoodfish(0.15);
      }
    }, 4500);
  }

  /**
   * 3. Bối cảnh Chùa Hồ Sen Hoàng Hôn: Crystal bowl 528Hz + Tiếng nước róc rách & Phong linh
   */
  private startTempleLotusAmbient(ctx: AudioContext, volume: number): void {
    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.linearRampToValueAtTime(volume, now + 2.5);
    masterGain.connect(ctx.destination);
    this.ambientGain = masterGain;

    // Crystal singing bowl 528Hz (Love / DNA repair frequency) + quãng 5 (792Hz)
    const bowlFreqs = [264, 528, 792];
    const oscs = bowlFreqs.map((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.setValueAtTime(0.05 + i * 0.02, ctx.currentTime);
      lfoGain.gain.setValueAtTime(0.04, ctx.currentTime);
      lfo.connect(lfoGain.gain);

      gain.gain.setValueAtTime(0.04 / (i + 1), ctx.currentTime);
      osc.connect(gain);
      gain.connect(masterGain);

      osc.start();
      lfo.start();
      return osc;
    });

    // Tạo âm thanh sóng nước hồ sen róc rách bằng Pink Noise Buffer qua Filter
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      output[i] = (b0 + b1 + b2) * 0.05;
    }

    const waterNoise = ctx.createBufferSource();
    waterNoise.buffer = noiseBuffer;
    waterNoise.loop = true;

    const waterFilter = ctx.createBiquadFilter();
    waterFilter.type = 'bandpass';
    waterFilter.frequency.setValueAtTime(450, now);
    waterFilter.Q.setValueAtTime(1.8, now);

    // LFO dao động sóng nước dập dềnh
    const waterLfo = ctx.createOscillator();
    const waterLfoGain = ctx.createGain();
    waterLfo.frequency.setValueAtTime(0.18, now);
    waterLfoGain.gain.setValueAtTime(220, now);
    waterLfo.connect(waterLfoGain);
    waterLfoGain.connect(waterFilter.frequency);

    const waterGain = ctx.createGain();
    waterGain.gain.setValueAtTime(0.035, now);

    waterNoise.connect(waterFilter);
    waterFilter.connect(waterGain);
    waterGain.connect(masterGain);

    waterNoise.start();
    waterLfo.start();

    this.ambientOscs = [...oscs, waterNoise, waterLfo];

    // Tiếng chuông gió phong linh thanh khiết mỗi 7.5 giây
    this.ambientTimer = setInterval(() => {
      if (!this.isMuted && this.ambientGain && this.currentTheme === 'TEMPLE') {
        this.playWindChimes(0.24);
      }
    }, 7500);
  }

  /**
   * 4. Bối cảnh Trong Suốt OBS: Thiền định tĩnh mịch sâu lắng 432Hz
   */
  private startTransparentZenAmbient(ctx: AudioContext, volume: number): void {
    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.linearRampToValueAtTime(volume, now + 2.0);
    masterGain.connect(ctx.destination);
    this.ambientGain = masterGain;

    const freqs = [108, 216, 432];
    this.ambientOscs = freqs.map((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.03 / (i + 1), ctx.currentTime);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start();
      return osc;
    });

    this.ambientTimer = setInterval(() => {
      if (!this.isMuted && this.ambientGain && this.currentTheme === 'TRANSPARENT') {
        this.playTempleBell(0.12);
      }
    }, 14000);
  }

  public stopAmbient(): void {
    if (this.ambientTimer) {
      clearInterval(this.ambientTimer);
      this.ambientTimer = null;
    }
    if (this.ambientSubTimer) {
      clearInterval(this.ambientSubTimer);
      this.ambientSubTimer = null;
    }
    if (this.ambientGain && this.ctx) {
      try {
        const now = this.ctx.currentTime;
        this.ambientGain.gain.linearRampToValueAtTime(0.0001, now + 0.8);
        const oscsToStop = [...this.ambientOscs];
        const gainToDisconnect = this.ambientGain;
        this.ambientOscs = [];
        this.ambientGain = null;

        setTimeout(() => {
          oscsToStop.forEach((o) => {
            try {
              if ('stop' in o && typeof (o as any).stop === 'function') {
                (o as any).stop();
              }
              o.disconnect();
            } catch {}
          });
          gainToDisconnect?.disconnect();
        }, 900);
      } catch {
        this.ambientGain = null;
        this.ambientOscs = [];
      }
    }
  }

  /**
   * Tiếng Đại Hồng Chung / Chuông Đồng Ngân Vang (432Hz - Tần số thanh tịnh)
   */
  public playTempleBell(gainLevel: number = 0.6): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const baseFreq = 432;

    const partials = [
      { ratio: 1.0, gain: 0.5, decay: 4.0 },
      { ratio: 1.52, gain: 0.35, decay: 3.2 },
      { ratio: 2.01, gain: 0.25, decay: 2.5 },
      { ratio: 2.76, gain: 0.18, decay: 1.8 },
      { ratio: 3.98, gain: 0.12, decay: 1.2 },
    ];

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(gainLevel, now);
    masterGain.connect(ctx.destination);

    partials.forEach(({ ratio, gain, decay }) => {
      const osc = ctx.createOscillator();
      const partGain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq * ratio, now);

      partGain.gain.setValueAtTime(0.001, now);
      partGain.gain.linearRampToValueAtTime(gain, now + 0.008);
      partGain.gain.exponentialRampToValueAtTime(0.0001, now + decay);

      osc.connect(partGain);
      partGain.connect(masterGain);

      osc.start(now);
      osc.stop(now + decay);
    });
  }

  /**
   * Tiếng Khánh Đồng Đình Làng (Bronze Gong Chime)
   * Âm hưởng ấm, hơi đanh ban đầu và ngân vang trầm bổng.
   */
  public playBronzeGong(gainLevel: number = 0.4): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const gongPartials = [
      { freq: 520, gain: 0.55, decay: 3.2 },
      { freq: 785, gain: 0.40, decay: 2.6 },
      { freq: 1120, gain: 0.28, decay: 1.9 },
      { freq: 1680, gain: 0.15, decay: 1.1 },
    ];

    const master = ctx.createGain();
    master.gain.setValueAtTime(gainLevel, now);
    master.connect(ctx.destination);

    gongPartials.forEach(({ freq, gain, decay }) => {
      const osc = ctx.createOscillator();
      const pGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      pGain.gain.setValueAtTime(0.001, now);
      pGain.gain.linearRampToValueAtTime(gain, now + 0.005);
      pGain.gain.exponentialRampToValueAtTime(0.0001, now + decay);

      osc.connect(pGain);
      pGain.connect(master);
      osc.start(now);
      osc.stop(now + decay);
    });
  }

  /**
   * Tiếng Chuông Gió Phong Linh Hồ Sen (Wind Chimes)
   * Trong trẻo như ngọc, vang rải rác từng giọt âm thanh.
   */
  public playWindChimes(gainLevel: number = 0.35): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const chimeNotes = [1046.5, 1174.66, 1318.51, 1567.98, 1760.0, 2093.0];

    // Ngẫu nhiên rung 3-4 thanh chuông
    const pickCount = 4;
    for (let i = 0; i < pickCount; i++) {
      const freq = chimeNotes[Math.floor(Math.random() * chimeNotes.length)] || 1318.51;
      const delay = i * (0.07 + Math.random() * 0.08);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + delay);

      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.linearRampToValueAtTime(gainLevel * 0.35, now + delay + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 1.8);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + delay);
      osc.stop(now + delay + 1.9);
    }
  }

  /**
   * Tiếng Mõ Gỗ Thanh Tịnh (Woodblock / Wooden Fish)
   */
  public playWoodfish(gainLevel: number = 0.5): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.12);

    gainNode.gain.setValueAtTime(gainLevel, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.16);
  }

  /**
   * Chuỗi 3 Tiếng Mõ Trợ Niệm Tụng Kinh
   */
  public playChantingWoodfish(gainLevel: number = 0.5): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    [0, 0.35, 0.70].forEach((delay) => {
      setTimeout(() => {
        if (!this.isMuted) {
          this.playWoodfish(gainLevel);
        }
      }, delay * 1000);
    });
  }

  /**
   * Tiếng Chuông Gió / Khánh Ngân Chào Mừng (Welcome Chime)
   */
  public playWelcomeChime(gainLevel: number = 0.4): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [880, 1108.73, 1318.51, 1760];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const delay = idx * 0.09;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + delay);

      gain.gain.setValueAtTime(0.001, now + delay);
      gain.gain.linearRampToValueAtTime(gainLevel * 0.4, now + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 1.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + delay);
      osc.stop(now + delay + 1.3);
    });
  }
}

export const templeAudio = new TempleAudioSynthesizer();
