import { config } from '../config/index.js';

/**
 * Minimal dependency-free structured (JSON) logger.
 * Chosen over pino to keep the dev loop frictionless on Windows while still
 * providing machine-readable, leveled logs (plan §11 backend item 6, §26).
 * Never logs secret-bearing fields; callers must not pass secrets.
 */

type Level = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

const ORDER: Record<Level, number> = {
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
};

const threshold = ORDER[config.logLevel as Level] ?? ORDER.info;

function emit(level: Level, msg: string, fields?: Record<string, unknown>): void {
  if (ORDER[level] < threshold) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...(fields ?? {}),
  });
  const writer = level === 'fatal' || level === 'error' ? process.stderr : process.stdout;
  writer.write(line + '\n');
}

export interface Logger {
  fatal(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  debug(msg: string, fields?: Record<string, unknown>): void;
  trace(msg: string, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

function makeLogger(bindings: Record<string, unknown>): Logger {
  const log = (level: Level) => (msg: string, fields?: Record<string, unknown>) =>
    emit(level, msg, { ...bindings, ...fields });
  return {
    fatal: log('fatal'),
    error: log('error'),
    warn: log('warn'),
    info: log('info'),
    debug: log('debug'),
    trace: log('trace'),
    child: (extra) => makeLogger({ ...bindings, ...extra }),
  };
}

export const logger: Logger = makeLogger({ service: 'isl-api', env: config.env });
