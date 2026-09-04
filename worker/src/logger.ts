/** Logs em JSON (uma linha por evento) para facilitar leitura por `docker compose logs` e agregadores. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
  child(ctx: Record<string, unknown>): Logger;
}

function write(level: LogLevel, msg: string, ctx: Record<string, unknown>): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    service: 'video-worker',
    msg,
    ...ctx,
  });
  if (level === 'error' || level === 'warn') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

export function createLogger(base: Record<string, unknown> = {}): Logger {
  return {
    debug: (msg, ctx = {}) => write('debug', msg, { ...base, ...ctx }),
    info: (msg, ctx = {}) => write('info', msg, { ...base, ...ctx }),
    warn: (msg, ctx = {}) => write('warn', msg, { ...base, ...ctx }),
    error: (msg, ctx = {}) => write('error', msg, { ...base, ...ctx }),
    child: (ctx) => createLogger({ ...base, ...ctx }),
  };
}

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger,
};
