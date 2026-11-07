import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractGlbAnimationClips, validateGlbFile } from './glb-parser';

describe('GLB Parser & AnimationClip Extractor', () => {
  const fixturesDir = path.resolve(__dirname, '..', '..', '..', '..', 'tests', 'fixtures', 'assets');
  const validGlbPath = path.join(fixturesDir, 'sample-character.glb');
  const corruptGlbPath = path.join(fixturesDir, 'corrupt-character.glb');

  it('correctly parses binary glTF header and extracts animation clip names without assumptions', () => {
    const buffer = fs.readFileSync(validGlbPath);
    const clips = extractGlbAnimationClips(buffer);

    expect(clips).toBeDefined();
    expect(clips).toHaveLength(1);
    expect(clips[0]).toBe('Pray');

    const result = validateGlbFile(buffer);
    expect(result.ok).toBe(true);
    expect(result.header?.version).toBe(2);
    expect(result.clipNames).toEqual(['Pray']);
    expect(result.error).toBeUndefined();
  });

  it('rejects corrupt or fake GLB file with invalid magic bytes', () => {
    const buffer = fs.readFileSync(corruptGlbPath);
    const result = validateGlbFile(buffer);

    expect(result.ok).toBe(false);
    expect(result.clipNames).toHaveLength(0);
    expect(result.error).toContain('INVALID_MAGIC_BYTES');
  });

  it('rejects files exceeding maximum size limit', () => {
    const buffer = fs.readFileSync(validGlbPath);
    // Giới hạn 500 bytes (file mẫu là ~1168 bytes)
    const result = validateGlbFile(buffer, 500);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('FILE_TOO_LARGE');
  });

  it('handles GLB with synthetic JSON chunk and multiple distinct clips', () => {
    // Tạo buffer GLB giả lập chuẩn có 3 clip khác nhau
    const jsonStr = JSON.stringify({
      asset: { version: '2.0' },
      animations: [
        { name: 'Idle_Standing' },
        { name: 'Attack_Combo' },
        { name: 'Take 001' },
      ],
    });
    const jsonBytes = Buffer.from(jsonStr, 'utf8');
    const chunkLength = jsonBytes.length;
    const totalLength = 20 + chunkLength;

    const glbBuf = Buffer.alloc(totalLength);
    glbBuf.writeUInt32LE(0x46546c67, 0); // Magic "glTF"
    glbBuf.writeUInt32LE(2, 4); // Version 2
    glbBuf.writeUInt32LE(totalLength, 8);
    glbBuf.writeUInt32LE(chunkLength, 12);
    glbBuf.writeUInt32LE(0x4e4f534a, 16); // ChunkType "JSON"
    jsonBytes.copy(glbBuf, 20);

    const result = validateGlbFile(glbBuf);
    expect(result.ok).toBe(true);
    expect(result.clipNames).toEqual(['Idle_Standing', 'Attack_Combo', 'Take 001']);
  });
});
