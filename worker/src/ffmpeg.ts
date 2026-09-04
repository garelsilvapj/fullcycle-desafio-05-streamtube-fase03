/** Operações FFmpeg (binário do PATH) usadas pelo pipeline de processamento. */
import ffmpeg from 'fluent-ffmpeg';
import { basename, dirname } from 'path';
import type { WorkerConfig } from './config';

export interface VideoProbe {
  durationSec: number;
  width?: number;
  height?: number;
  codec?: string;
}

export interface MediaProcessor {
  probe(input: string): Promise<VideoProbe>;
  thumbnail(input: string, output: string): Promise<void>;
  transcode(input: string, output: string): Promise<void>;
}

export function createMediaProcessor(cfg: WorkerConfig['ffmpeg']): MediaProcessor {
  return {
    probe(input) {
      return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(input, (err, data) => {
          if (err) return reject(new Error(`ffprobe falhou: ${err.message}`));
          const video = data.streams.find((s) => s.codec_type === 'video');
          if (!video) return reject(new Error('arquivo não contém stream de vídeo'));
          resolve({
            durationSec: Math.round(data.format.duration ?? 0),
            width: video.width,
            height: video.height,
            codec: video.codec_name,
          });
        });
      });
    },
    thumbnail(input, output) {
      return new Promise((resolve, reject) => {
        ffmpeg(input)
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(new Error(`thumbnail falhou: ${err.message}`)))
          .screenshots({
            count: 1,
            timemarks: [String(cfg.thumbnailAtSec)],
            folder: dirname(output),
            filename: basename(output),
          });
      });
    },
    transcode(input, output) {
      return new Promise((resolve, reject) => {
        ffmpeg(input)
          .outputOptions([
            '-c:v libx264',
            `-preset ${cfg.preset}`,
            `-crf ${cfg.crf}`,
            '-pix_fmt yuv420p',
            '-c:a aac',
            '-movflags +faststart',
          ])
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(new Error(`transcode falhou: ${err.message}`)))
          .save(output);
      });
    },
  };
}
