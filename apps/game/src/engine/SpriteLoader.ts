/**
 * The Singularity Odyssey — Bộ Nạp Sprite Chuyên Nghiệp (SpriteLoader)
 * Hỗ trợ các gói xuất từ agent-sprite-forge:
 * - animation.json 3.0 + Atlas PNG (hỗ trợ biến thể băng đô/màu phe Xanh & Đỏ)
 * - Aseprite JSON Array + Atlas PNG
 * - Grid Atlas thông thường
 */

import { Assets, Rectangle, Texture } from 'pixi.js';
import { type AnimationClipConfig, type SpriteConfig, getSpriteConfig } from '../data/sprites';

export interface LoadedSpriteData {
  config: SpriteConfig;
  atlasTexture: Texture;
  redAtlasTexture?: Texture;
  frames: Texture[];
  framesRed?: Texture[];
  clipFrames: Record<string, Texture[]>;
  clipFramesRed?: Record<string, Texture[]>;
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
   * Chuyển đổi bộ lọc Texture sang Nearest-Neighbor chuẩn Pixel Art retro
   */
  public setPixelScaleMode(isPixel: boolean): void {
    const mode = isPixel ? 'nearest' : 'linear';
    for (const data of this.sprites.values()) {
      if (data.atlasTexture?.source) {
        data.atlasTexture.source.scaleMode = mode;
      }
      if (data.redAtlasTexture?.source) {
        data.redAtlasTexture.source.scaleMode = mode;
      }
      for (const f of data.frames) {
        if (f.source) f.source.scaleMode = mode;
      }
      if (data.framesRed) {
        for (const f of data.framesRed) {
          if (f.source) f.source.scaleMode = mode;
        }
      }
    }
  }

  /**
   * Nạp một Sprite theo cấu hình SpriteConfig
   */
  public async loadSprite(config: SpriteConfig): Promise<LoadedSpriteData | null> {
    if (this.sprites.has(config.unitId)) {
      return this.sprites.get(config.unitId)!;
    }

    try {
      // 1. Nạp ảnh Atlas mặc định / phe Xanh qua PixiJS Assets
      let atlasTexture: Texture;
      const atlasUrl = resolveAssetPath(config.atlasPath);
      try {
        atlasTexture = await Assets.load(atlasUrl);
      } catch (err) {
        console.warn(`[SpriteLoader] Không tìm thấy atlas tại ${atlasUrl}, chuyển sang fallback PIXI.Graphics.`);
        return null;
      }

      // Nạp thêm Atlas biến thể phe Đỏ nếu được cấu hình
      let redAtlasTexture: Texture | undefined;
      if (config.redAtlasPath) {
        try {
          redAtlasTexture = await Assets.load(resolveAssetPath(config.redAtlasPath));
        } catch {
          redAtlasTexture = undefined;
        }
      }

      const atlasWidth = atlasTexture.width;
      const atlasHeight = atlasTexture.height;
      let vramBytes = this.estimateTextureVram(atlasWidth, atlasHeight);
      if (redAtlasTexture) {
        vramBytes += this.estimateTextureVram(redAtlasTexture.width, redAtlasTexture.height);
      }

      const frameRects: Rectangle[] = [];
      let manifestClips: Record<string, AnimationClipConfig> | null = null;

      // 2. Phân giải cấu trúc theo từng định dạng
      if (config.format === 'FORGE_3_0' && config.manifestPath) {
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
              frameRects.push(new Rectangle(col * cellW, row * cellH, cellW, cellH));
            }
          }
        } catch (e) {
          console.warn(`[SpriteLoader] Không tải được animation.json 3.0, cắt lưới mặc định.`, e);
        }
      } else if (config.format === 'ASEPRITE_ARRAY' && config.manifestPath) {
        try {
          const manifestUrl = resolveAssetPath(config.manifestPath);
          const res = await fetch(manifestUrl);
          if (res.ok) {
            const aseData = await res.json();
            if (Array.isArray(aseData.frames)) {
              for (const f of aseData.frames) {
                frameRects.push(new Rectangle(f.frame.x, f.frame.y, f.frame.w, f.frame.h));
              }
            }
          }
        } catch (e) {
          console.warn(`[SpriteLoader] Không tải được Aseprite JSON, cắt lưới mặc định.`, e);
        }
      }

      // 3. Fallback: Nếu chưa có frames, cắt theo lưới đều
      if (frameRects.length === 0) {
        const cellW = config.frameSize.width;
        const cellH = config.frameSize.height;
        const cols = Math.max(1, Math.floor(atlasWidth / cellW));
        const rows = Math.max(1, Math.floor(atlasHeight / cellH));
        const total = cols * rows;

        for (let i = 0; i < total; i++) {
          const col = i % cols;
          const row = Math.floor(i / cols);
          frameRects.push(new Rectangle(col * cellW, row * cellH, cellW, cellH));
        }
      }

      const frames: Texture[] = frameRects.map(
        (rect) => new Texture({ source: atlasTexture.source, frame: rect })
      );
      const framesRed: Texture[] | undefined = redAtlasTexture
        ? frameRects.map((rect) => new Texture({ source: redAtlasTexture.source, frame: rect }))
        : undefined;

      // 4. Ánh xạ các clip hành động (idle, walk, attack, hurt, die)
      const effectiveClips = { ...config.clips, ...(manifestClips || {}) };
      const clipFrames: Record<string, Texture[]> = {};
      const clipFramesRed: Record<string, Texture[]> | undefined = framesRed ? {} : undefined;

      for (const [clipName, clipCfg] of Object.entries(effectiveClips)) {
        if (!clipCfg) continue;
        const subFrames: Texture[] = [];
        const subFramesRed: Texture[] = [];
        for (let i = 0; i < clipCfg.frameCount; i++) {
          const frameIdx = clipCfg.startFrame + i;
          if (frames[frameIdx]) {
            subFrames.push(frames[frameIdx]!);
          } else if (frames[0]) {
            subFrames.push(frames[0]);
          }
          if (framesRed) {
            if (framesRed[frameIdx]) {
              subFramesRed.push(framesRed[frameIdx]!);
            } else if (framesRed[0]) {
              subFramesRed.push(framesRed[0]);
            }
          }
        }
        clipFrames[clipName] = subFrames;
        if (clipFramesRed) {
          clipFramesRed[clipName] = subFramesRed;
        }
      }

      const loadedData: LoadedSpriteData = {
        config,
        atlasTexture,
        redAtlasTexture,
        frames,
        framesRed,
        clipFrames,
        clipFramesRed,
        vramBytes,
      };

      this.sprites.set(config.unitId, loadedData);

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

  public getLoadedSprite(unitId: string): LoadedSpriteData | null {
    return this.sprites.get(unitId) || null;
  }

  /**
   * Lấy Texture của một clip tại frame cụ thể (hỗ trợ biến thể băng đô phe Xanh / Đỏ)
   */
  public getFrameTexture(
    unitId: string,
    clipName: string,
    frameIndex: number,
    team: 'LEFT' | 'RIGHT' = 'LEFT'
  ): Texture | null {
    const data = this.sprites.get(unitId);
    if (!data) return null;

    if (team === 'RIGHT' && data.clipFramesRed) {
      const redClip = data.clipFramesRed[clipName];
      if (redClip && redClip.length > 0) {
        return redClip[frameIndex % redClip.length] || null;
      }
      if (data.framesRed && data.framesRed[0]) {
        return data.framesRed[0];
      }
    }

    const clip = data.clipFrames[clipName];
    if (!clip || clip.length === 0) {
      return data.frames[0] || null;
    }
    const idx = frameIndex % clip.length;
    return clip[idx] || null;
  }

  public async preloadAgeSprites(age: number, configs: SpriteConfig[]): Promise<void> {
    const promises = configs.filter((c) => c.age === age).map((c) => this.loadSprite(c));
    await Promise.all(promises);
  }

  public async reloadSprite(unitId: string, customConfig?: SpriteConfig): Promise<LoadedSpriteData | null> {
    const existing = this.sprites.get(unitId);
    if (existing) {
      try {
        await Assets.unload(resolveAssetPath(existing.config.atlasPath));
        if (existing.config.redAtlasPath) {
          await Assets.unload(resolveAssetPath(existing.config.redAtlasPath));
        }
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
          if (data.config.redAtlasPath) {
            await Assets.unload(data.config.redAtlasPath);
          }
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
