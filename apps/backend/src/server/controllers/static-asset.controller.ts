import fs from 'node:fs';
import path from 'node:path';
import type { ServerResponse } from 'node:http';

export interface StaticAssetControllerOptions {
  overlayStaticDir: string;
  assetsDir: string;
}

/**
 * Controller phục vụ tài nguyên tĩnh Overlay và Assets an toàn (chống Path Traversal).
 */
export class StaticAssetController {
  constructor(private readonly options: StaticAssetControllerOptions) {}

  public serveOverlayStatic(pathname: string, res: ServerResponse): void {
    const subPath = pathname.replace(/^\/overlay\/?/, '').replace(/^\/backgrounds\/?/, 'backgrounds/');
    const cleanSub = subPath ? path.normalize(subPath).replace(/^(\.\.(\/|\\|$))+/, '') : 'index.html';
    let target = path.join(this.options.overlayStaticDir, cleanSub);

    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      target = path.join(this.options.overlayStaticDir, 'index.html');
    }

    if (!fs.existsSync(target)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head><title>BuddhaLive Live Overlay</title></head>
          <body style="background:transparent;color:#fff;font-family:sans-serif;padding:20px;">
            <div id="root">Overlay building in progress...</div>
          </body>
        </html>
      `);
      return;
    }

    const ext = path.extname(target).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType, 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(target).pipe(res);
  }

  public serveAssetFile(pathname: string, res: ServerResponse): void {
    const fileName = path.basename(pathname);
    let target = path.resolve(this.options.assetsDir, fileName);

    // Chống Path Traversal (architecture.md §3 — Lớp 4)
    if (!target.startsWith(path.resolve(this.options.assetsDir))) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: { code: 'FORBIDDEN_PATH' } }));
      return;
    }

    if (!fs.existsSync(target)) {
      // Fallback kiểm tra trong thư mục assets của bundle overlay
      const overlayAsset = path.resolve(this.options.overlayStaticDir, 'assets', fileName);
      if (
        fs.existsSync(overlayAsset) &&
        overlayAsset.startsWith(path.resolve(this.options.overlayStaticDir, 'assets'))
      ) {
        target = overlayAsset;
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: { code: 'ASSET_NOT_FOUND' } }));
        return;
      }
    }

    const ext = path.extname(target).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.glb': 'model/gltf-binary',
      '.gltf': 'model/gltf+json',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(target).pipe(res);
  }
}
