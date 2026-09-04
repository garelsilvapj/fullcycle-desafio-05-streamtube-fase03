/**
 * Worker de processamento de vídeo — Fase 03.
 *
 * Consome a fila BullMQ `video-processing` (producer: API NestJS, `jobId = videoId`).
 * Pipeline em `processor.ts`; acesso a banco/storage/FFmpeg em módulos próprios.
 * Roda em processo separado da API (TD-03.4).
 */
import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { loadConfig } from './config';
import { createLogger } from './logger';
import { createVideoRepository } from './db';
import { createObjectStorage } from './storage';
import { createMediaProcessor } from './ffmpeg';
import { processVideo } from './processor';

interface VideoJobData {
  videoId: string;
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const logger = createLogger({ queue: cfg.queueName });

  const connection = new IORedis({
    host: cfg.redis.host,
    port: cfg.redis.port,
    maxRetriesPerRequest: null,
  });
  const repo = createVideoRepository(cfg.db);
  const storage = createObjectStorage(cfg.s3);
  const media = createMediaProcessor(cfg.ffmpeg);

  const worker = new Worker<VideoJobData>(
    cfg.queueName,
    async (job: Job<VideoJobData>) => {
      const { videoId } = job.data;
      logger.info('job recebido', { jobId: job.id, videoId, attempt: job.attemptsMade + 1 });
      await processVideo(
        { repo, storage, media, logger },
        {
          videoId,
          attempt: job.attemptsMade + 1,
          maxAttempts: job.opts.attempts ?? 1,
        },
      );
    },
    {
      connection,
      concurrency: cfg.concurrency,
      // Transcodes longos: lock generoso e renovado a cada 1/3 do tempo (padrão do BullMQ).
      lockDuration: cfg.lockDurationMs,
    },
  );

  worker.on('ready', () => logger.info(`ouvindo a fila '${cfg.queueName}'`, { concurrency: cfg.concurrency }));
  worker.on('completed', (job) => logger.info('job concluído', { jobId: job.id }));
  worker.on('failed', (job, err) =>
    logger.error('job falhou', {
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      maxAttempts: job?.opts.attempts,
      error: err.message,
    }),
  );
  worker.on('stalled', (jobId) => logger.warn('job travado (stalled); será reentregue', { jobId }));
  worker.on('error', (err) => logger.error('erro no worker', { error: err.message }));

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('encerrando', { signal });
    try {
      // close() espera o job em andamento terminar (ou o lock expirar) antes de sair.
      await worker.close();
      await connection.quit();
      await repo.close();
      storage.destroy();
      logger.info('encerrado');
      process.exit(0);
    } catch (err) {
      logger.error('erro ao encerrar', { error: err instanceof Error ? err.message : String(err) });
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  process.stderr.write(`worker falhou ao iniciar: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
