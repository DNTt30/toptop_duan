import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'dist-electron');
const workspaceRoot = path.resolve(rootDir, '..', '..');

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// Copy compiled overlay into desktop/dist-overlay if it exists
const overlayDistSource = path.join(workspaceRoot, 'apps', 'overlay', 'dist');
const overlayDistTarget = path.join(rootDir, 'dist-overlay');
if (fs.existsSync(overlayDistSource)) {
  fs.rmSync(overlayDistTarget, { recursive: true, force: true });
  fs.cpSync(overlayDistSource, overlayDistTarget, { recursive: true });
}

// Copy fixture sample glb into desktop/bundled-assets
const fixtureGlb = path.join(workspaceRoot, 'tests', 'fixtures', 'assets', 'sample-character.glb');
const bundledAssetsTarget = path.join(rootDir, 'bundled-assets');
if (fs.existsSync(fixtureGlb)) {
  fs.mkdirSync(bundledAssetsTarget, { recursive: true });
  fs.copyFileSync(fixtureGlb, path.join(bundledAssetsTarget, 'sample-character.glb'));
}

await build({
  entryPoints: [path.join(rootDir, 'electron', 'main.ts')],
  outfile: path.join(outDir, 'main.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  external: ['electron', 'better-sqlite3'],
});

await build({
  entryPoints: [path.join(rootDir, 'electron', 'preload.ts')],
  outfile: path.join(outDir, 'preload.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  external: ['electron'],
});
