import { Inject, Injectable, type LoggerService } from '@nestjs/common';
import pino, { type Logger } from 'pino';
import { RequestContext } from '../context/request-context';

type LogLevel = 'debug' | 'error' | 'fatal' | 'info' | 'trace' | 'warn';

const SENSITIVE_KEYS = new Set([
  'accesstoken',
  'apitoken',
  'authorization',
  'body',
  'content',
  'cookie',
  'credentials',
  'displayname',
  'email',
  'filename',
  'password',
  'personalaccesstoken',
  'refreshtoken',
  'secret',
  'set-cookie',
  'token',
]);

@Injectable()
export class PinoLoggerService implements LoggerService {
  private readonly logger: Logger;

  constructor(@Inject(RequestContext) private readonly context: RequestContext) {
    this.logger = pino({
      level: configuredLogLevel(),
      base: { service: 'caselog-api' },
      timestamp: pino.stdTimeFunctions.isoTime,
    });
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('trace', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('fatal', message, optionalParams);
  }

  private write(level: LogLevel, message: unknown, optionalParams: unknown[]): void {
    const context = this.context.requestId ? { requestId: this.context.requestId } : {};
    if (typeof message === 'object' && message !== null) {
      this.logger[level]({
        ...context,
        ...sanitizeRecord(message),
        params: sanitizeLogValue(optionalParams),
      });
      return;
    }
    this.logger[level]({ ...context, params: sanitizeLogValue(optionalParams) }, String(message));
  }
}

function configuredLogLevel(): string {
  if (process.env.NODE_ENV === 'test') return 'silent';
  const value = process.env.LOG_LEVEL ?? 'info';
  if (!['debug', 'error', 'fatal', 'info', 'silent', 'trace', 'warn'].includes(value)) {
    throw new Error(`Unsupported LOG_LEVEL: ${value}`);
  }
  return value;
}

function sanitizeRecord(value: object): Record<string, unknown> {
  const sanitized = sanitizeLogValue(value);
  return isRecord(sanitized) ? sanitized : { value: sanitized };
}

export function sanitizeLogValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeLogValue(item, seen));
  if (!isRecord(value)) return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : sanitizeLogValue(item, seen),
    ]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
