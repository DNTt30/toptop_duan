/**
 * The Singularity Odyssey — Bộ Nạp Sprite Chuyên Nghiệp (SpriteLoader)
 * Hỗ trợ các gói xuất từ agent-sprite-forge:
 * - animation.json 3.0 + Atlas PNG
 * - Aseprite JSON Array + Atlas PNG
 * - Grid Atlas thông thường
 * 
 * Tính năng:
 * 1. Tự động cắt lát frame texture chính xác theo metadata
 * 2. Cache và gộp texture theo từng Kỷ nguyên, nạp trước (preload) và giải phóng (unload) sạch sẽ
 * 3. Fallback mượt mà sang PIXI.Graphics khi thiếu atlas
 * 4. Đo đạc dung lượng Texture VRAM chính xác
 */

import { Assets, Rectangle, Texture } from 'pixi.js';
import { type AnimationClipConfig, type SpriteConfig, getSpriteConfig } from '../data/sprites';

export interface LoadedSpriteData {
  config: SpriteConfig;
  atlasTexture: Texture;
  frames: Texture[];
  clipFrames: Record<string, Texture[]>;
  vramBytes: number;
}

function resolveAssetPath(p: string | undefined): string {
  if (!p) return '';
  if (p.startsWith('/')) {
    return '.' + p;
  }
  return p;
}

export class SpriteLoader {
  private static instance: SpriteLoader | null = null;

  // Cache lưu trữ sprite đã nạp theo unitId
  private sprites: Map<string, LoadedSpriteData> = new Map();
  // Theo dõi texture đã nạp theo kỷ nguyên để giải phóng theo đợt
  private ageLoadedUnits: Map<number, Set<string>> = new Map();

  public static getInstance(): SpriteLoader {
    if (!SpriteLoader.instance) {
      SpriteLoader.instance = new SpriteLoader();
    }
    return SpriteLoader.instance;
  }

  /**
   * Tính toán dung lượng VRAM ước tính (chiều rộng * chiều cao * 4 bytes RGBA)
   */
  public estimateTextureVram(width: number, height: number): number {
    return width * height * 4;
  }

  /**
   * Tổng dung lượng VRAM đang được nạp trong bộ nhớ
   */
  public getTotalVramUsageMb(): number {
    let totalBytes = 0;
    for (const data of this.sprites.values()) {
      totalBytes += data.vramBytes;
    }
    return Number((totalBytes / (1024 * 1024)).toFixed(2));
  }

  /**
   * Nạp một Sprite theo cấu hình SpriteConfig
   */
  public async loadSprite(config: SpriteConfig): Promise<LoadedSpriteData | null> {
    if (this.sprites.has(config.unitId)) {
      return this.sprites.get(config.unitId)!;
    }

    try {
      // 1. Nạp ảnh Atlas qua PixiJS Assets
      let atlasTexture: Texture;
      const atlasUrl = resolveAssetPath(config.atlasPath);
      try {
        atlasTexture = await Assets.load(atlasUrl);
      } catch (err) {
        console.warn(`[SpriteLoader] Không tìm thấy atlas tại ${atlasUrl}, chuyển sang fallback PIXI.Graphics.`);
        return null;
      }

      const atlasWidth = atlasTexture.width;
      const atlasHeight = atlasTexture.height;
      const vramBytes = this.estimateTextureVram(atlasWidth, atlasHeight);

      const frames: Texture[] = [];
      const clipFrames: Record<string, Texture[]> = {};
      let manifestClips: Record<string, AnimationClipConfig> | null = null;

      // 2. Phân giải cấu trúc theo từng định dạng
      if (config.format === 'FORGE_3_0' && config.manifestPath) {
        // Nạp manifest animation.json 3.0
        try {
          const manifestUrl = resolveAssetPath(config.manifestPath);
          const res = await fetch(manifestUrl);
          if (res.ok) {
            const manifest = await res.json();
            if (manifest.clips) {
              manifestClips = manifest.clips;
            }
            const cellSize = manifest.fallback?.cellSize || [config.frameSize.width, config.frameSize.height];
            const cellW = cellSize[0];
            const cellH = cellSize[1];
            const cols = Math.max(1, Math.floor(atlasWidth / cellW));
            const frameCount = manifest.frameCount || 24;

            for (let i = 0; i < frameCount; i++) {
              const col = i % cols;
              const row = Math.floor(i / cols);
              const rect = new Rectangle(col * cellW, row * cellH, cellW, cellH);
              frames.push(new Texture({ source: atlasTexture.source, frame: rect }));
            }
          }
        } catch (e) {
          console.warn(`[SpriteLoader] Không tải được animation.json 3.0, cắt lưới mặc định.`, e);
        }
      } else if (config.format === 'ASEPRITE_ARRAY' && config.manifestPath) {
        // Nạp Aseprite JSON Array
        try {
          const manifestUrl = resolveAssetPath(config.manifestPath);
          const res = await fetch(manifestUrl);
          if (res.ok) {
            const aseData = await res.json();
            if (Array.isArray(aseData.frames)) {
              for (const f of aseData.frames) {
                const rect = new Rectangle(f.frame.x, f.frame.y, f.frame.w, f.frame.h);
                frames.push(new Texture({ source: atlasTexture.source, frame: rect }));
              }
            }
          }
        } catch (e) {
          console.warn(`[SpriteLoader] Không tải được Aseprite JSON, cắt lưới mặc định.`, e);
        }
      }

      // 3. Fallback: Nếu chưa có frames, cắt theo lưới đều (GRID 6x4)
      if (frames.length === 0) {
        const cellW = config.frameSize.width;
        const cellH = config.frameSize.height;
        const cols = Math.max(1, Math.floor(atlasWidth / cellW));
        const rows = Math.max(1, Math.floor(atlasHeight / cellH));
        const total = cols * rows;

        for (let i = 0; i < total; i++) {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const rect = new Rectangle(col * cellW, row * cellH, cellW, cellH);
          frames.push(new Texture({ source: atlasTexture.source, frame: rect }));
        }
      }

      // 4. Ánh xạ các clip hành động (idle, walk, attack, hurt, die)
      const effectiveClips = { ...config.clips, ...(manifestClips || {}) };
      for (const [clipName, clipCfg] of Object.entries(effectiveClips)) {
        if (!clipCfg) continue;
        const subFrames: Texture[] = [];
        for (let i = 0; i < clipCfg.frameCount; i++) {
          const frameIdx = clipCfg.startFrame + i;
          if (frames[frameIdx]) {
            subFrames.push(frames[frameIdx]!);
          } else if (frames[0]) {
            subFrames.push(frames[0]);
          }
        }
        clipFrames[clipName] = subFrames;
      }

      const loadedData: LoadedSpriteData = {
        config,
        atlasTexture,
        frames,
        clipFrames,
        vramBytes,
      };

      this.sprites.set(config.unitId, loadedData);

      // Ghi nhận theo kỷ nguyên
      if (!this.ageLoadedUnits.has(config.age)) {
        this.ageLoadedUnits.set(config.age, new Set());
      }
      this.ageLoadedUnits.get(config.age)!.add(config.unitId);

      return loadedData;
    } catch (err) {
      console.error(`[SpriteLoader] Lỗi ngoại lệ khi nạp sprite ${config.unitId}:`, err);
      return null;
    }
  }

  /**
   * Lấy dữ liệu sprite đã nạp trong bộ nhớ đệm
   */
  public getLoadedSprite(unitId: string): LoadedSpriteData | null {
    return this.sprites.get(unitId) || null;
  }

  /**
   * Lấy Texture của một clip tại frame cụ thể
   */
  public getFrameTexture(unitId: string, clipName: string, frameIndex: number): Texture | null {
    const data = this.sprites.get(unitId);
    if (!data) return null;
    const clip = data.clipFrames[clipName];
    if (!clip || clip.length === 0) {
      return data.frames[0] || null;
    }
    const idx = frameIndex % clip.length;
    return clip[idx] || null;
  }

  /**
   * Nạp trước (Preload) toàn bộ Sprite của một Kỷ nguyên
   */
  public async preloadAgeSprites(age: number, configs: SpriteConfig[]): Promise<void> {
    const promises = configs.filter((c) => c.age === age).map((c) => this.loadSprite(c));
    await Promise.all(promises);
  }

  /**
   * Giải phóng (Unload) toàn bộ Sprite của một Kỷ nguyên khi không sử dụng để giải phóng VRAM
   */
  /**
   * Tải lại (reload) một Sprite khi có cấu hình tinh chỉnh mới từ Studio
   */
  public async reloadSprite(unitId: string, customConfig?: SpriteConfig): Promise<LoadedSpriteData | null> {
    const existing = this.sprites.get(unitId);
    if (existing) {
      try {
        await Assets.unload(resolveAssetPath(existing.config.atlasPath));
      } catch {
        // Bỏ qua nếu lỗi
      }
      this.sprites.delete(unitId);
    }

    const cfg = customConfig || getSpriteConfig(unitId);
    if (cfg) {
      return this.loadSprite(cfg);
    }
    return null;
  }

  public async unloadAgeSprites(age: number): Promise<void> {
    const units = this.ageLoadedUnits.get(age);
    if (!units) return;

    for (const unitId of units) {
      const data = this.sprites.get(unitId);
      if (data) {
        try {
          await Assets.unload(data.config.atlasPath);
        } catch {
          // Bỏ qua nếu đã giải phóng
        }
        this.sprites.delete(unitId);
      }
    }

    this.ageLoadedUnits.delete(age);
  }
}

export const spriteLoader = SpriteLoader.getInstance();
