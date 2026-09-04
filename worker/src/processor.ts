/**
 * Pipeline de processamento de um vídeo (independente de BullMQ para ser testável):
 *   uploaded|failed → processing → download → probe → thumbnail → transcode → upload → ready
 * Em erro: `failed` na última tentativa, `uploaded` (reprocessar) nas intermediárias.
 * Idempotente: um vídeo já `ready` (ou sendo processado por outro worker) é ignorado.
 */
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Logger } from './logger';
import type { MediaProcessor } from './ffmpeg';
import type { ObjectStorage } from './storage';
import { RETRYABLE_FROM, type VideoRepository } from './db';

export interface JobInfo {
  videoId: string;
  /** Número desta tentativa (1-based). */
  attempt: number;
  /** Total de tentativas configurado no job. */
  maxAttempts: number;
}

export interface ProcessorDeps {
  repo: VideoRepository;
  storage: ObjectStorage;
  media: MediaProcessor;
  logger: Logger;
  /** Diretório base para arquivos temporários (default: os.tmpdir()). */
  tmpRoot?: string;
}

export type ProcessOutcome =
  | { kind: 'ready'; durationSec: number; sizeBytes: number }
  | { kind: 'skipped'; reason: string };

export const MAX_ERROR_LENGTH = 500;

export function buildArtifactKeys(channelId: string, videoId: string) {
  const base = `videos/${channelId}/${videoId}`;
  return {
    processed: `${base}/processed.mp4`,
    thumbnail: `${base}/thumb.jpg`,
  };
}

export function isLastAttempt(job: Pick<JobInfo, 'attempt' | 'maxAttempts'>): boolean {
  return job.attempt >= job.maxAttempts;
}

export class VideoProcessingError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'VideoProcessingError';
  }
}

/**
 * Processa o vídeo. Lança o erro original após registrar o status, para que o BullMQ
 * aplique a política de retry/backoff configurada pelo producer.
 */
export async function processVideo(deps: ProcessorDeps, job: JobInfo): Promise<ProcessOutcome> {
  const { repo, storage, media } = deps;
  const log = deps.logger.child({ videoId: job.videoId, attempt: job.attempt });
  const startedAt = Date.now();

  const video = await repo.getVideo(job.videoId);
  if (!video) throw new VideoProcessingError(`vídeo ${job.videoId} não encontrado`);

  if (video.status === 'ready') {
    log.info('vídeo já processado; ignorando job duplicado');
    return { kind: 'skipped', reason: 'already-ready' };
  }

  const claimed = await repo.markProcessing(video.id, RETRYABLE_FROM);
  if (!claimed) {
    log.warn('vídeo não está em estado processável; ignorando', { status: video.status });
    return { kind: 'skipped', reason: `status-${video.status}` };
  }

  const work = await fs.mkdtemp(join(deps.tmpRoot ?? tmpdir(), `vid-${video.id}-`));
  const original = join(work, 'original');
  const processed = join(work, 'processed.mp4');
  const thumb = join(work, 'thumb.jpg');

  try {
    await storage.download(video.original_key, original);
    const stat = await fs.stat(original).catch(() => null);
    if (!stat || stat.size === 0) {
      throw new VideoProcessingError('arquivo original vazio ou não baixado do storage');
    }
    log.info('original baixado', { bytes: stat.size });

    const probe = await media.probe(original);
    await media.thumbnail(original, thumb);
    await media.transcode(original, processed);
    const processedStat = await fs.stat(processed);
    if (processedStat.size === 0) throw new VideoProcessingError('transcode gerou arquivo vazio');

    const keys = buildArtifactKeys(video.channel_id, video.id);
    await storage.upload(keys.processed, processed, 'video/mp4');
    await storage.upload(keys.thumbnail, thumb, 'image/jpeg');

    const ready = await repo.markReady(video.id, {
      processed_key: keys.processed,
      thumbnail_key: keys.thumbnail,
      duration_sec: probe.durationSec,
      size_bytes: processedStat.size,
    });
    if (!ready) {
      throw new VideoProcessingError('vídeo saiu do estado processing durante o processamento');
    }

    log.info('vídeo pronto', {
      durationSec: probe.durationSec,
      sizeBytes: processedStat.size,
      elapsedMs: Date.now() - startedAt,
    });
    return { kind: 'ready', durationSec: probe.durationSec, sizeBytes: processedStat.size };
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, MAX_ERROR_LENGTH);
    if (isLastAttempt(job)) {
      log.error('falha definitiva no processamento', { error: message, elapsedMs: Date.now() - startedAt });
      await repo.markFailed(video.id, message);
    } else {
      log.warn('falha no processamento; será reprocessado', {
        error: message,
        remainingAttempts: job.maxAttempts - job.attempt,
      });
      await repo.markRetry(video.id, message);
    }
    throw err;
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}
