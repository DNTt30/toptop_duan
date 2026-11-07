import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { validateGlbFile, DEFAULT_MAX_GLB_SIZE_BYTES } from './glb-parser';

export interface SaveGlbAssetResult {
  ok: boolean;
  fileName?: string;
  relativeUrl?: string;
  filePath?: string;
  clipNames: string[];
  fileSizeBytes?: number;
  error?: string;
}

export class AssetService {
  constructor(private readonly assetsDir: string) {
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }
  }

  /**
   * Lưu tệp GLB mới vào thư mục assets sau khi xác thực cấu trúc nhị phân và dung lượng.
   */
  public saveGlbAsset(
    fileBuffer: Buffer,
    originalName?: string,
    maxSizeBytes = DEFAULT_MAX_GLB_SIZE_BYTES
  ): SaveGlbAssetResult {
    const validation = validateGlbFile(fileBuffer, maxSizeBytes);
    if (!validation.ok) {
      return {
        ok: false,
        clipNames: [],
        error: validation.error,
      };
    }

    const safeStem = originalName
      ? path.basename(originalName, path.extname(originalName)).replace(/[^a-zA-Z0-9_-]/g, '_')
      : 'model';
    const uuid = crypto.randomUUID().slice(0, 8);
    const fileName = `${safeStem}-${uuid}.glb`;
    const targetPath = path.resolve(this.assetsDir, fileName);

    // Chống Path Traversal (architecture.md §3)
    if (!targetPath.startsWith(path.resolve(this.assetsDir))) {
      return {
        ok: false,
        clipNames: [],
        error: 'FORBIDDEN_PATH_TRAVERSAL',
      };
    }

    fs.writeFileSync(targetPath, fileBuffer);

    return {
      ok: true,
      fileName,
      relativeUrl: `/assets/${fileName}`,
      filePath: targetPath,
      clipNames: validation.clipNames,
      fileSizeBytes: fileBuffer.length,
    };
  }

  /**
   * Đọc danh sách AnimationClip từ một tệp GLB đã lưu trong thư mục assets.
   */
  public inspectGlbAsset(fileName: string): { ok: boolean; clipNames: string[]; error?: string } {
    const safeName = path.basename(fileName);
    const targetPath = path.resolve(this.assetsDir, safeName);

    if (!targetPath.startsWith(path.resolve(this.assetsDir)) || !fs.existsSync(targetPath)) {
      return { ok: false, clipNames: [], error: 'ASSET_NOT_FOUND' };
    }

    try {
      const buffer = fs.readFileSync(targetPath);
      const validation = validateGlbFile(buffer);
      if (!validation.ok) {
        return { ok: false, clipNames: [], error: validation.error };
      }
      return { ok: true, clipNames: validation.clipNames };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, clipNames: [], error: msg };
    }
  }

  /**
   * Xóa tệp khỏi assetsDir nếu tồn tại.
   */
  public deleteAssetFile(fileName: string): boolean {
    const safeName = path.basename(fileName);
    const targetPath = path.resolve(this.assetsDir, safeName);
    if (!targetPath.startsWith(path.resolve(this.assetsDir))) {
      return false;
    }
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
      return true;
    }
    return false;
  }
}
