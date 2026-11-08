import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SocketErrorCode } from '@buddhalive/shared';

/**
 * Trả về JSON Response chuẩn cho HTTP client.
 */
export function sendJson(
  res: ServerResponse,
  statusCode: number,
  data: unknown,
  extraHeaders?: Record<string, string>
): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    ...extraHeaders,
  });
  res.end(JSON.stringify(data));
}

/**
 * Trả về JSON lỗi chuẩn cho HTTP client.
 */
export function sendJsonError(
  res: ServerResponse,
  statusCode: number,
  code: SocketErrorCode | string,
  message: string,
  extraHeaders?: Record<string, string>
): void {
  sendJson(res, statusCode, { ok: false, error: { code, message } }, extraHeaders);
}

/**
 * Đọc và parse JSON Body an toàn từ IncomingMessage (giới hạn 64KB).
 */
export function readJsonBody(req: IncomingMessage, maxBytes = 64 * 1024): Promise<any> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > maxBytes) {
        req.destroy();
        resolve(null);
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

/**
 * Interface cho Zod schema có phương thức safeParse.
 */
export interface SafeParsable<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false; error: { message: string } };
}

/**
 * Parse và validate Socket Payload qua Zod schema, tự động trả ack VALIDATION_ERROR nếu sai schema.
 */
export function parseSocketPayload<T>(
  schema: SafeParsable<T>,
  raw: unknown,
  ack?: (res: any) => void
): T | null {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    if (ack) {
      ack({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
      });
    }
    return null;
  }
  return parsed.data;
}
