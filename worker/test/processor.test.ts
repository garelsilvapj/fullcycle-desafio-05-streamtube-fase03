import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoRepository, VideoRow } from '../src/db';
import type { MediaProcessor } from '../src/ffmpeg';
import type { ObjectStorage } from '../src/storage';
import { silentLogger } from '../src/logger';
import { buildArtifactKeys, isLastAttempt, processVideo } from '../src/processor';

function fakeRepo(row: Partial<VideoRow> | undefined) {
  const video: VideoRow | undefined = row
    ? {
        id: 'v-1',
        channel_id: 'ch-1',
        status: 'uploaded',
        original_key: 'videos/ch-1/v-1/original',
        ...row,
      }
    : undefined;
  const repo: VideoRepository & { calls: string[] } = {
    calls: [],
    getVideo: vi.fn(async () => video),
    markProcessing: vi.fn(async (_id, from) => {
      repo.calls.push('processing');
      return !!video && from.includes(video.status);
    }),
    markReady: vi.fn(async () => {
      repo.calls.push('ready');
      return true;
    }),
    markFailed: vi.fn(async () => {
      repo.calls.push('failed');
      return true;
    }),
    markRetry: vi.fn(async () => {
      repo.calls.push('retry');
      return true;
    }),
    close: vi.fn(async () => undefined),
  };
  return repo;
}

function fakeStorage(originalBytes = 10): ObjectStorage & { uploads: string[] } {
  const storage: ObjectStorage & { uploads: string[] } = {
    uploads: [],
    download: vi.fn(async (_key, dest) => {
      await fs.writeFile(dest, Buffer.alloc(originalBytes, 1));
    }),
    upload: vi.fn(async (key) => {
      storage.uploads.push(key);
    }),
    destroy: vi.fn(),
  };
  return storage;
}

function fakeMedia(): MediaProcessor {
  return {
    probe: vi.fn(async () => ({ durationSec: 8, width: 640, height: 360, codec: 'h264' })),
    thumbnail: vi.fn(async (_input, output) => {
      await fs.writeFile(output, Buffer.alloc(3, 2));
    }),
    transcode: vi.fn(async (_input, output) => {
      await fs.writeFile(output, Buffer.alloc(42, 3));
    }),
  };
}

describe('processVideo', () => {
  let tmpRoot: string;
  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(join(tmpdir(), 'worker-test-'));
  });
  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  const job = { videoId: 'v-1', attempt: 1, maxAttempts: 5 };

  it('caminho feliz: uploaded → processing → ready com artefatos, duração e tamanho do processado', async () => {
    const repo = fakeRepo({});
    const storage = fakeStorage();
    const media = fakeMedia();

    const out = await processVideo({ repo, storage, media, logger: silentLogger, tmpRoot }, job);

    expect(out).toEqual({ kind: 'ready', durationSec: 8, sizeBytes: 42 });
    expect(repo.calls).toEqual(['processing', 'ready']);
    expect(repo.markProcessing).toHaveBeenCalledWith('v-1', ['uploaded', 'failed']);
    expect(repo.markReady).toHaveBeenCalledWith('v-1', {
      processed_key: 'videos/ch-1/v-1/processed.mp4',
      thumbnail_key: 'videos/ch-1/v-1/thumb.jpg',
      duration_sec: 8,
      size_bytes: 42,
    });
    expect(storage.uploads).toEqual(['videos/ch-1/v-1/processed.mp4', 'videos/ch-1/v-1/thumb.jpg']);
    // diretório temporário limpo
    expect(await fs.readdir(tmpRoot)).toEqual([]);
  });

  it('vídeo já ready é ignorado sem tocar no storage (idempotência)', async () => {
    const repo = fakeRepo({ status: 'ready' });
    const storage = fakeStorage();
    const out = await processVideo({ repo, storage, media: fakeMedia(), logger: silentLogger, tmpRoot }, job);
    expect(out).toEqual({ kind: 'skipped', reason: 'already-ready' });
    expect(repo.markProcessing).not.toHaveBeenCalled();
    expect(storage.download).not.toHaveBeenCalled();
  });

  it('vídeo em uploading (não confirmado) ou processing por outro worker é ignorado', async () => {
    for (const status of ['uploading', 'processing'] as const) {
      const repo = fakeRepo({ status });
      const storage = fakeStorage();
      const out = await processVideo({ repo, storage, media: fakeMedia(), logger: silentLogger, tmpRoot }, job);
      expect(out).toEqual({ kind: 'skipped', reason: `status-${status}` });
      expect(storage.download).not.toHaveBeenCalled();
    }
  });

  it('vídeo failed pode ser reprocessado', async () => {
    const repo = fakeRepo({ status: 'failed' });
    const out = await processVideo(
      { repo, storage: fakeStorage(), media: fakeMedia(), logger: silentLogger, tmpRoot },
      job,
    );
    expect(out.kind).toBe('ready');
  });

  it('vídeo inexistente lança erro', async () => {
    const repo = fakeRepo(undefined);
    await expect(
      processVideo({ repo, storage: fakeStorage(), media: fakeMedia(), logger: silentLogger, tmpRoot }, job),
    ).rejects.toThrow('não encontrado');
  });

  it('original vazio → erro; tentativa intermediária volta para uploaded e relança', async () => {
    const repo = fakeRepo({});
    const storage = fakeStorage(0);
    await expect(
      processVideo({ repo, storage, media: fakeMedia(), logger: silentLogger, tmpRoot }, job),
    ).rejects.toThrow('vazio');
    expect(repo.calls).toEqual(['processing', 'retry']);
    expect(repo.markRetry).toHaveBeenCalledWith('v-1', expect.stringContaining('vazio'));
    expect(repo.markFailed).not.toHaveBeenCalled();
    expect(await fs.readdir(tmpRoot)).toEqual([]);
  });

  it('falha na última tentativa marca failed com a mensagem do erro (truncada a 500 chars)', async () => {
    const repo = fakeRepo({});
    const media = fakeMedia();
    (media.transcode as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('x'.repeat(900)));
    await expect(
      processVideo(
        { repo, storage: fakeStorage(), media, logger: silentLogger, tmpRoot },
        { ...job, attempt: 5, maxAttempts: 5 },
      ),
    ).rejects.toThrow();
    expect(repo.calls).toEqual(['processing', 'failed']);
    const [, message] = (repo.markFailed as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    expect(message).toHaveLength(500);
  });

  it('erro do ffprobe (arquivo inválido) não é engolido', async () => {
    const repo = fakeRepo({});
    const media = fakeMedia();
    (media.probe as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('ffprobe falhou: Invalid data'));
    await expect(
      processVideo({ repo, storage: fakeStorage(), media, logger: silentLogger, tmpRoot }, job),
    ).rejects.toThrow('ffprobe falhou');
    expect(media.transcode).not.toHaveBeenCalled();
    expect(repo.calls).toEqual(['processing', 'retry']);
  });

  it('se o vídeo sair de processing durante o trabalho, não marca ready e relança', async () => {
    const repo = fakeRepo({});
    (repo.markReady as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    await expect(
      processVideo({ repo, storage: fakeStorage(), media: fakeMedia(), logger: silentLogger, tmpRoot }, job),
    ).rejects.toThrow('saiu do estado processing');
  });
});

describe('helpers', () => {
  it('buildArtifactKeys usa o prefixo videos/<channel>/<video>', () => {
    expect(buildArtifactKeys('c', 'v')).toEqual({
      processed: 'videos/c/v/processed.mp4',
      thumbnail: 'videos/c/v/thumb.jpg',
    });
  });

  it('isLastAttempt compara tentativa atual com o máximo', () => {
    expect(isLastAttempt({ attempt: 1, maxAttempts: 5 })).toBe(false);
    expect(isLastAttempt({ attempt: 5, maxAttempts: 5 })).toBe(true);
    expect(isLastAttempt({ attempt: 1, maxAttempts: 1 })).toBe(true);
  });
});
