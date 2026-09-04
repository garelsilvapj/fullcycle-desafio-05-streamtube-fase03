/**
 * Integração real com o FFmpeg do ambiente: gera um MP4 sintético, extrai duração, thumbnail
 * e faz o transcode. Pula automaticamente quando `ffmpeg` não está no PATH (host sem FFmpeg);
 * roda na imagem Docker do worker e na CI.
 */
import { execFileSync } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMediaProcessor } from '../src/ffmpeg';

function hasFfmpeg(): boolean {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!hasFfmpeg())('MediaProcessor (ffmpeg real)', () => {
  let dir: string;
  let sample: string;
  const media = createMediaProcessor({ thumbnailAtSec: 1, preset: 'ultrafast', crf: 30 });

  beforeAll(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'ffmpeg-it-'));
    sample = join(dir, 'sample.mp4');
    execFileSync(
      'ffmpeg',
      [
        '-y', '-loglevel', 'error',
        '-f', 'lavfi', '-i', 'testsrc=duration=3:size=320x240:rate=15',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest',
        sample,
      ],
      { stdio: 'ignore' },
    );
  }, 60_000);

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('probe devolve a duração e o stream de vídeo', async () => {
    const info = await media.probe(sample);
    expect(info.durationSec).toBe(3);
    expect(info.width).toBe(320);
    expect(info.codec).toBe('h264');
  });

  it('thumbnail gera um JPEG não vazio', async () => {
    const out = join(dir, 'thumb.jpg');
    await media.thumbnail(sample, out);
    const stat = await fs.stat(out);
    expect(stat.size).toBeGreaterThan(0);
    const head = await fs.readFile(out);
    expect(head.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8])); // magic JPEG
  }, 30_000);

  it('transcode gera MP4 H.264/AAC reproduzível com a mesma duração', async () => {
    const out = join(dir, 'processed.mp4');
    await media.transcode(sample, out);
    const info = await media.probe(out);
    expect(info.durationSec).toBe(3);
    expect(info.codec).toBe('h264');
  }, 60_000);

  it('probe rejeita arquivo que não é vídeo', async () => {
    const bogus = join(dir, 'bogus.bin');
    await fs.writeFile(bogus, Buffer.alloc(1024, 7));
    await expect(media.probe(bogus)).rejects.toThrow('ffprobe falhou');
  });
});
