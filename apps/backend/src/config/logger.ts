/**
 * Logger tập trung có bộ lọc redactSecrets() (architecture.md §3 — Lớp 2).
 * Mọi đầu ra log đều đi qua redact trước khi tới sink (console hoặc sink kiểm thử).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogRecord {
  level: LogLevel;
  time: string;
  scope: string;
  message: string;
  data?: unknown;
}

export type LogSink = (record: LogRecord) => void;

const REDACTED = '[REDACTED]';

const SENSITIVE_KEY_PATTERN =
  /^(authorization|cookie|set-cookie|token|managertoken|overlaytoken|claimsecret|bls_overlay_session|password|secret|apikey|api_key)$/i;

/** Chuỗi bí mật đã đăng ký (managerToken, overlayToken vừa cấp...) sẽ bị che dù xuất hiện ở đâu. */
const registeredSecrets = new Set<string>();

export function registerSecretForRedaction(secret: string): void {
  if (secret.length >= 8) {
    registeredSecrets.add(secret);
  }
}

export function unregisterSecretForRedaction(secret: string): void {
  registeredSecrets.delete(secret);
}

function redactString(value: string): string {
  let output = value;
  for (const secret of registeredSecrets) {
    if (output.includes(secret)) {
      output = output.split(secret).join(REDACTED);
    }
  }
  return output
    .replace(/(bls_overlay_session=)[^;,\s]+/gi, `$1${REDACTED}`)
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${REDACTED}`)
    .replace(/([?&](?:token|overlayToken|managerToken|apiKey|api_key|key|secret)=)[^&\s]+/gi, `$1${REDACTED}`);
}

export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 6) {
    return '[MAX_DEPTH]';
  }
  if (typeof value === 'string') {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, depth + 1));
  }
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message) };
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? REDACTED
        : redactSecrets(inner, depth + 1);
    }
    return result;
  }
  return value;
}

export const consoleSink: LogSink = (record) => {
  const line = `[${record.time}] ${record.level.toUpperCase()} ${record.scope}: ${record.message}`;
  const payload = record.data === undefined ? '' : ` ${JSON.stringify(record.data)}`;
  if (record.level === 'error' || record.level === 'warn') {
    console.error(line + payload);
  } else {
    console.log(line + payload);
  }
};

export interface Logger {
  debug: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
  child: (scope: string) => Logger;
}

export function createLogger(scope: string, sink: LogSink = consoleSink): Logger {
  const emit = (level: LogLevel, message: string, data?: unknown): void => {
    sink({
      level,
      time: new Date().toISOString(),
      scope,
      message: redactString(message),
      data: data === undefined ? undefined : redactSecrets(data),
    });
  };
  return {
    debug: (message, data) => emit('debug', message, data),
    info: (message, data) => emit('info', message, data),
    warn: (message, data) => emit('warn', message, data),
    error: (message, data) => emit('error', message, data),
    child: (childScope) => createLogger(`${scope}:${childScope}`, sink),
  };
}
