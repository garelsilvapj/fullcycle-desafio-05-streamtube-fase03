/** Configuração do worker lida do ambiente (defaults = nomes dos serviços do compose). */
export interface WorkerConfig {
  queueName: string;
  concurrency: number;
  /** Tempo (ms) que o job fica travado para este worker; renovado automaticamente. */
  lockDurationMs: number;
  redis: { host: string; port: number };
  db: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
  s3: {
    endpoint: string;
    region: string;
    accessKey: string;
    secretKey: string;
    bucket: string;
  };
  ffmpeg: {
    /** Instante (s) do frame usado como thumbnail. */
    thumbnailAtSec: number;
    /** Preset x264: troca CPU por tamanho/qualidade. */
    preset: string;
    crf: number;
  };
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw === undefined ? NaN : parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return {
    queueName: env.VIDEO_QUEUE || 'video-processing',
    concurrency: int('WORKER_CONCURRENCY', 1),
    lockDurationMs: int('WORKER_LOCK_DURATION_MS', 5 * 60 * 1000),
    redis: {
      host: env.REDIS_HOST || 'redis',
      port: int('REDIS_PORT', 6379),
    },
    db: {
      host: env.DB_HOST || 'db',
      port: int('DB_PORT', 5432),
      user: env.DB_USERNAME || 'streamtube',
      password: env.DB_PASSWORD || 'streamtube',
      database: env.DB_NAME || 'streamtube',
    },
    s3: {
      endpoint: env.S3_ENDPOINT || 'http://minio:9000',
      region: env.S3_REGION || 'us-east-1',
      accessKey: env.S3_ACCESS_KEY || 'minioadmin',
      secretKey: env.S3_SECRET_KEY || 'minioadmin',
      bucket: env.S3_BUCKET || 'streamtube-videos',
    },
    ffmpeg: {
      thumbnailAtSec: int('FFMPEG_THUMBNAIL_AT_SEC', 1),
      preset: env.FFMPEG_PRESET || 'veryfast',
      crf: int('FFMPEG_CRF', 23),
    },
  };
}
