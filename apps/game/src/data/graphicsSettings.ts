/**
 * The Singularity Odyssey — Cài Đặt Đồ Họa (Graphics / VFX Settings)
 *
 * - Đọc localStorage MỘT LẦN lúc khởi tạo, sau đó chỉ truy cập RAM (an toàn cho vòng lặp 60 FPS).
 * - Bọc try/catch toàn bộ để chạy được trong OBS Browser Source / Electron / môi trường test (không có window).
 * - Đồng bộ giữa các tab/cửa sổ qua sự kiện 'storage'.
 */

export const GRAPHICS_STORAGE_KEY = 'singularity_graphics_v1';

export interface GraphicsOptions {
  /** Bóng elip mềm dưới chân lính, thành trì, đạn bay */
  shadows: boolean;
  /** Rung màn hình khi va chạm mạnh / nổ / chiêu cuối */
  screenShake: boolean;
  /** Hạt hiệu ứng: tia lửa, khói, bụi chân, tàn lửa môi trường */
  particles: boolean;
  /** Ánh sáng phát quang (Additive blending) cho tia lửa, đạn, vụ nổ */
  glow: boolean;
  /** Chớp trắng + co giãn (squash) khi lính trúng đòn */
  hitFlash: boolean;
  /** Vệt dư ảnh (afterimage) khi lính lao tới chém */
  motionTrails: boolean;
  /** Lóe sáng toàn màn hình + vệt tốc độ khi tung chiêu cuối */
  ultimateFlash: boolean;
  /** Độ mạnh rung màn hình (0.5 = nhẹ, 1 = chuẩn, 1.5 = rất mạnh) */
  shakeIntensity: number;
}

export const DEFAULT_GRAPHICS: Readonly<GraphicsOptions> = Object.freeze({
  shadows: true,
  screenShake: true,
  particles: true,
  glow: true,
  hitFlash: true,
  motionTrails: true,
  ultimateFlash: true,
  shakeIntensity: 1.5,
});

export type GraphicsQualityPreset = 'LOW' | 'MEDIUM' | 'HIGH';
export type GraphicsQuality = GraphicsQualityPreset | 'CUSTOM';

export const GRAPHICS_PRESETS: Record<GraphicsQualityPreset, Readonly<GraphicsOptions>> = {
  LOW: Object.freeze({
    shadows: true,
    screenShake: true,
    particles: false,
    glow: false,
    hitFlash: false,
    motionTrails: false,
    ultimateFlash: false,
    shakeIntensity: 0.5,
  }),
  MEDIUM: Object.freeze({
    shadows: true,
    screenShake: true,
    particles: true,
    glow: true,
    hitFlash: true,
    motionTrails: false,
    ultimateFlash: false,
    shakeIntensity: 1.0,
  }),
  HIGH: DEFAULT_GRAPHICS,
};

export const GRAPHICS_QUALITY_LABELS: ReadonlyArray<{ value: GraphicsQualityPreset; label: string }> = [
  { value: 'LOW', label: 'Thấp' },
  { value: 'MEDIUM', label: 'Trung bình' },
  { value: 'HIGH', label: 'Cao' },
];

export const GRAPHICS_TOGGLE_LABELS: ReadonlyArray<{ key: Exclude<keyof GraphicsOptions, 'shakeIntensity'>; label: string }> = [
  { key: 'shadows', label: 'Bóng đổ dưới chân' },
  { key: 'particles', label: 'Hạt hiệu ứng (lửa, khói, bụi)' },
  { key: 'glow', label: 'Ánh sáng phát quang' },
  { key: 'hitFlash', label: 'Chớp trắng khi trúng đòn' },
  { key: 'motionTrails', label: 'Vệt dư ảnh khi chém' },
  { key: 'screenShake', label: 'Rung màn hình' },
  { key: 'ultimateFlash', label: 'Lóe sáng chiêu cuối' },
];

export const SHAKE_INTENSITY_LEVELS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0.5, label: 'Nhẹ' },
  { value: 1.0, label: 'Vừa' },
  { value: 1.5, label: 'Mạnh' },
];

export type GraphicsListener = (opts: Readonly<GraphicsOptions>) => void;

/** Kiểm tra & làm sạch dữ liệu đọc từ storage (bỏ qua khóa lạ, sai kiểu) */
export function sanitizeGraphicsOptions(raw: unknown): GraphicsOptions {
  const out: GraphicsOptions = { ...DEFAULT_GRAPHICS };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const obj = raw as Record<string, unknown>;
  for (const { key } of GRAPHICS_TOGGLE_LABELS) {
    if (typeof obj[key] === 'boolean') out[key] = obj[key] as boolean;
  }
  const si = obj.shakeIntensity;
  if (typeof si === 'number' && Number.isFinite(si)) {
    out.shakeIntensity = Math.max(0.25, Math.min(2, si));
  }
  return out;
}

export class GraphicsSettings {
  private opts: GraphicsOptions = { ...DEFAULT_GRAPHICS };
  private listeners = new Set<GraphicsListener>();

  constructor() {
    this.opts = this.load();
    if (typeof window !== 'undefined') {
      try {
        window.addEventListener('storage', (e: StorageEvent) => {
          if (e.key === GRAPHICS_STORAGE_KEY || e.key === null) {
            this.opts = this.load();
            this.notify();
          }
        });
      } catch {
        // ignore
      }
    }
  }

  private load(): GraphicsOptions {
    if (typeof window === 'undefined') return { ...DEFAULT_GRAPHICS };
    try {
      const raw = window.localStorage.getItem(GRAPHICS_STORAGE_KEY);
      if (!raw) return { ...DEFAULT_GRAPHICS };
      return sanitizeGraphicsOptions(JSON.parse(raw));
    } catch {
      return { ...DEFAULT_GRAPHICS };
    }
  }

  private save(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(GRAPHICS_STORAGE_KEY, JSON.stringify(this.opts));
    } catch {
      // Hết hạn mức / storage bị chặn: vẫn giữ cấu hình trong RAM
    }
  }

  private notify(): void {
    for (const l of this.listeners) {
      try {
        l(this.opts);
      } catch (e) {
        console.error('[GraphicsSettings] Lỗi listener:', e);
      }
    }
  }

  /** Truy cập trực tiếp từ RAM (dùng trong vòng lặp render) */
  public get(): Readonly<GraphicsOptions> {
    return this.opts;
  }

  public set<K extends keyof GraphicsOptions>(key: K, value: GraphicsOptions[K]): void {
    const next = sanitizeGraphicsOptions({ ...this.opts, [key]: value });
    if (next[key] === this.opts[key]) return;
    this.opts = next;
    this.save();
    this.notify();
  }

  /** Xác định mức đồ họa hiện tại (Thấp / Trung bình / Cao / Tùy chỉnh) */
  public getQuality(): GraphicsQuality {
    for (const preset of ['LOW', 'MEDIUM', 'HIGH'] as const) {
      const target = GRAPHICS_PRESETS[preset];
      const match =
        (Object.keys(target) as Array<keyof GraphicsOptions>).every((k) => this.opts[k] === target[k]);
      if (match) return preset;
    }
    return 'CUSTOM';
  }

  /** Áp dụng nhanh cấu hình Đồ họa Thấp / Trung bình / Cao */
  public setQuality(preset: GraphicsQualityPreset): void {
    this.opts = { ...GRAPHICS_PRESETS[preset] };
    this.save();
    this.notify();
  }

  public reset(): void {
    this.opts = { ...DEFAULT_GRAPHICS };
    this.save();
    this.notify();
  }

  public subscribe(listener: GraphicsListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const graphicsSettings = new GraphicsSettings();
