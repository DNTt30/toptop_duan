/**
 * GLB Binary Parser & AnimationClip Extractor
 * Phân tích cấu trúc nhị phân của tệp GLB (glTF 2.0 Binary) để đọc danh sách
 * AnimationClip thực tế từ chunk JSON mà không cần tải Three.js.
 */

export const GLB_MAGIC = 0x46546c67; // "glTF" trong ASCII Little-Endian
export const GLB_JSON_CHUNK_TYPE = 0x4e4f534a; // "JSON" trong ASCII Little-Endian
export const DEFAULT_MAX_GLB_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export interface GlbHeader {
  magic: number;
  version: number;
  totalLength: number;
}

export interface GlbParseResult {
  ok: boolean;
  header?: GlbHeader;
  clipNames: string[];
  error?: string;
}

/**
 * Trích xuất danh sách clip hoạt ảnh thực tế từ tệp GLB nhị phân.
 * Tuyệt đối không giả định bất kỳ tên clip cố định nào.
 */
export function extractGlbAnimationClips(buffer: Buffer): string[] {
  if (!buffer || buffer.length < 20) {
    throw new Error('INVALID_GLB_HEADER: File too small to be a valid GLB container');
  }

  const magic = buffer.readUInt32LE(0);
  if (magic !== GLB_MAGIC) {
    throw new Error(
      `INVALID_MAGIC_BYTES: Expected glTF magic 0x46546c67, received 0x${magic.toString(16)}`
    );
  }

  const version = buffer.readUInt32LE(4);
  if (version !== 2) {
    throw new Error(`UNSUPPORTED_GLTF_VERSION: Expected glTF 2.0, received version ${version}`);
  }

  const totalLength = buffer.readUInt32LE(8);
  if (totalLength > buffer.length) {
    throw new Error('TRUNCATED_GLB_FILE: Header declared length exceeds actual buffer size');
  }

  // Chunk 0 bắt đầu từ byte 12: [4 bytes length][4 bytes type][chunk data]
  const chunkLength = buffer.readUInt32LE(12);
  const chunkType = buffer.readUInt32LE(16);

  if (chunkType !== GLB_JSON_CHUNK_TYPE) {
    throw new Error(
      `INVALID_CHUNK_TYPE: Expected chunk 0 to be JSON (0x4e4f534a), received 0x${chunkType.toString(16)}`
    );
  }

  if (20 + chunkLength > buffer.length) {
    throw new Error('TRUNCATED_JSON_CHUNK: Declared JSON chunk exceeds buffer bounds');
  }

  const jsonBytes = buffer.subarray(20, 20 + chunkLength);
  const jsonString = jsonBytes.toString('utf8');

  let gltf: { animations?: Array<{ name?: string }> };
  try {
    gltf = JSON.parse(jsonString);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`CORRUPTED_JSON_CHUNK: Failed to parse glTF JSON chunk: ${msg}`);
  }

  if (!Array.isArray(gltf.animations) || gltf.animations.length === 0) {
    return [];
  }

  const clips: string[] = [];
  const seen = new Set<string>();

  gltf.animations.forEach((anim, idx) => {
    const rawName = typeof anim.name === 'string' && anim.name.trim().length > 0
      ? anim.name.trim()
      : `Animation_${idx}`;

    if (!seen.has(rawName)) {
      seen.add(rawName);
      clips.push(rawName);
    }
  });

  return clips;
}

/**
 * Kiểm tra toàn diện tệp GLB: Magic Bytes, dung lượng và trích xuất danh sách clip.
 */
export function validateGlbFile(
  buffer: Buffer,
  maxSizeBytes = DEFAULT_MAX_GLB_SIZE_BYTES
): GlbParseResult {
  if (buffer.length > maxSizeBytes) {
    return {
      ok: false,
      clipNames: [],
      error: `FILE_TOO_LARGE: Model file size (${(buffer.length / 1024 / 1024).toFixed(1)}MB) exceeds limit of ${maxSizeBytes / 1024 / 1024}MB`,
    };
  }

  try {
    const magic = buffer.readUInt32LE(0);
    const version = buffer.readUInt32LE(4);
    const totalLength = buffer.readUInt32LE(8);
    const clips = extractGlbAnimationClips(buffer);

    return {
      ok: true,
      header: { magic, version, totalLength },
      clipNames: clips,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      clipNames: [],
      error: message,
    };
  }
}
