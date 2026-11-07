import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it, afterEach } from 'vitest';
import { AssetService } from './asset-service';

describe('AssetService', () => {
  const testDir = path.join(os.tmpdir(), `bls-asset-test-${Date.now()}`);
  const fixturesDir = path.resolve(__dirname, '..', '..', '..', '..', 'tests', 'fixtures', 'assets');
  const validGlb = fs.readFileSync(path.join(fixturesDir, 'sample-character.glb'));
  const corruptGlb = fs.readFileSync(path.join(fixturesDir, 'corrupt-character.glb'));

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('validates and saves a valid GLB file with UUID stem', () => {
    const service = new AssetService(testDir);
    const res = service.saveGlbAsset(validGlb, 'buddha.glb');

    expect(res.ok).toBe(true);
    expect(res.fileName).toBeDefined();
    expect(res.fileName).toMatch(/^buddha-[a-f0-9]{8}\.glb$/);
    expect(res.relativeUrl).toBe(`/assets/${res.fileName}`);
    expect(res.clipNames).toEqual(['Pray']);
    expect(fs.existsSync(res.filePath!)).toBe(true);

    // Inspect
    const inspectRes = service.inspectGlbAsset(res.fileName!);
    expect(inspectRes.ok).toBe(true);
    expect(inspectRes.clipNames).toEqual(['Pray']);

    // Delete
    const deleted = service.deleteAssetFile(res.fileName!);
    expect(deleted).toBe(true);
    expect(fs.existsSync(res.filePath!)).toBe(false);
  });

  it('rejects corrupt GLB and does not save file', () => {
    const service = new AssetService(testDir);
    const res = service.saveGlbAsset(corruptGlb, 'bad.glb');

    expect(res.ok).toBe(false);
    expect(res.error).toContain('INVALID_MAGIC_BYTES');
    expect(fs.readdirSync(testDir).length).toBe(0);
  });
});
