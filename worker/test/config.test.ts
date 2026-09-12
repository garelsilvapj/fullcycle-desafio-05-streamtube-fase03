import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

describe('loadConfig', () => {
  it('usa os nomes dos serviços do compose como default', () => {
    const cfg = loadConfig({});
    expect(cfg.queueName).toBe('video-processing');
    expect(cfg.redis).toEqual({ host: 'redis', port: 6379 });
    expect(cfg.db.host).toBe('db');
    expect(cfg.s3.endpoint).toBe('http://minio:9000');
    expect(cfg.concurrency).toBe(1);
  });

  it('lê overrides do ambiente e ignora números inválidos', () => {
    const cfg = loadConfig({ VIDEO_QUEUE: 'q', REDIS_HOST: 'r', WORKER_CONCURRENCY: 'abc' });
    expect(cfg.queueName).toBe('q');
    expect(cfg.redis.host).toBe('r');
    expect(cfg.concurrency).toBe(1);
  });
});
