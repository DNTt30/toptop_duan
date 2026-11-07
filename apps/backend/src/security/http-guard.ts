import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from '../config/logger';

export interface GuardOptions {
  allowedPort: number;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (!rawKey) continue;
    const key = rawKey.trim();
    const val = rest.join('=').trim();
    if (key) {
      result[key] = decodeURIComponent(val);
    }
  }
  return result;
}

export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+([A-Za-z0-9._~+/=-]+)$/i);
  return match?.[1] ?? null;
}

const FORBIDDEN_QUERY_TOKEN_PATTERN = /[?&](?:token|overlayToken|managerToken)=/i;

/**
 * Kiểm tra các lớp bảo mật HTTP cơ bản (Lớp 1, 2, 3):
 * 1. Chặn query token trên URL -> 400 TOKEN_IN_QUERY_FORBIDDEN.
 * 2. Kiểm tra Host header (chống DNS Rebinding).
 * 3. Kiểm tra Origin header (chống CSRF từ web ngoài).
 */
export function checkHttpSafety(
  req: IncomingMessage,
  res: ServerResponse,
  options: GuardOptions,
  logger: Logger
): boolean {
  const url = req.url ?? '/';

  // Lớp 2: Cấm query token
  if (FORBIDDEN_QUERY_TOKEN_PATTERN.test(url)) {
    logger.warn('Blocked request containing token in query string', {
      method: req.method,
      cleanPath: url.split('?')[0],
    });
    res.writeHead(400, {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(
      JSON.stringify({
        ok: false,
        error: {
          code: 'TOKEN_IN_QUERY_FORBIDDEN',
          message:
            'Passing tokens via query string is strictly forbidden for security reasons',
        },
      })
    );
    return false;
  }

  // Lớp 3: Kiểm tra Host header
  const host = req.headers.host;
  if (!host) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: { code: 'MISSING_HOST', message: 'Host header is required' } }));
    return false;
  }
  const cleanHost = host.split(':')[0]!.toLowerCase();
  if (cleanHost !== '127.0.0.1' && cleanHost !== 'localhost') {
    logger.warn('Blocked foreign host header', { host });
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: { code: 'INVALID_HOST', message: 'Host must be loopback' } }));
    return false;
  }

  // Lớp 3: Kiểm tra Origin header nếu có
  const origin = req.headers.origin;
  if (origin) {
    try {
      const parsed = new URL(origin);
      const originHost = parsed.hostname.toLowerCase();
      if (
        originHost !== '127.0.0.1' &&
        originHost !== 'localhost' &&
        parsed.protocol !== 'file:' &&
        parsed.protocol !== 'vscode-webview:'
      ) {
        logger.warn('Blocked foreign origin', { origin });
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: false,
            error: { code: 'FORBIDDEN_ORIGIN', message: 'Foreign origins are forbidden' },
          })
        );
        return false;
      }
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: { code: 'MALFORMED_ORIGIN', message: 'Invalid origin header' } }));
      return false;
    }
  }

  return true;
}
