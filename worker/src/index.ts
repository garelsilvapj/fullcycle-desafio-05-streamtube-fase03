/**
 * Worker de processamento de vídeo — Fase 03.
 *
 * Consome a fila BullMQ `video-processing`. Para cada { videoId }:
 *   1. marca o vídeo como `processing`;
 *   2. baixa o original do object storage;
 *   3. gera thumbnail (JPG) e transcode normalizado (MP4 H.264/AAC) com FFmpeg;
 *   4. sobe os artefatos e marca o vídeo como `ready` (ou `failed` em erro).
 *
 * Roda em processo separado da API (TD-03.4). Idempotente por videoId.
 * Usa SQL direto (pg) com nomes de coluna snake_case, iguais aos da migration.
 */
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { Client } from 'pg';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import ffmpeg from 'fluent-ffmpeg';
import { createWriteStream, createReadStream, promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import type { Readable } from 'stream';

const QUEUE = process.env.VIDEO_QUEUE || 'video-processing';
const BUCKET = process.env.S3_BUCKET || 'streamtube-videos';

const connection = new IORedis({
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null,
});

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT || 'http://minio:9000',
  region: process.env.S3_REGION || 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
  },
});

function pg(): Client {
  return new Client({
    host: process.env.DB_HOST || 'db',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'streamtube',
    password: process.env.DB_PASSWORD || 'streamtube',
    database: process.env.DB_NAME || 'streamtube',
  });
}

async function setStatus(id: string, fields: Record<string, unknown>): Promise<void> {
  const db = pg();
  await db.connect();
  const keys = Object.keys(fields);
  const set = keys.map((k, i) => `"${k}" = $${i + 2}`).join(', ');
  await db.query(`UPDATE videos SET ${set}, "updated_at" = now() WHERE id = $1`, [
    id,
    ...keys.map((k) => fields[k]),
  ]);
  await db.end();
}

interface VideoRow {
  id: string;
  channel_id: string;
  original_key: string;
}

async function getVideo(id: string): Promise<VideoRow | undefined> {
  const db = pg();
  await db.connect();
  const res = await db.query('SELECT * FROM videos WHERE id = $1', [id]);
  await db.end();
  return res.rows[0] as VideoRow | undefined;
}

async function downloadTo(key: string, dest: string): Promise<void> {
  const out = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  await pipeline(out.Body as Readable, createWriteStream(dest));
}

async function upload(key: string, path: string, contentType: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: createReadStream(path),
      ContentType: contentType,
    }),
  );
}

function probeDuration(path: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(path, (err, data) => {
      resolve(err ? 0 : Math.round(data?.format?.duration ?? 0));
    });
  });
}

function makeThumbnail(input: string, folder: string, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .on('end', () => resolve())
      .on('error', reject)
      .screenshots({ count: 1, timemarks: ['1'], folder, filename });
  });
}

function transcode(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .outputOptions(['-c:v libx264', '-c:a aac', '-movflags +faststart'])
      .on('end', () => resolve())
      .on('error', reject)
      .save(output);
  });
}

async function processVideo(videoId: string): Promise<void> {
  const video = await getVideo(videoId);
  if (!video) throw new Error(`vídeo ${videoId} não encontrado`);
  await setStatus(videoId, { status: 'processing' });

  const work = await fs.mkdtemp(join(tmpdir(), `vid-${videoId}-`));
  const original = join(work, 'original');
  const processed = join(work, 'processed.mp4');
  const thumb = 'thumb.jpg';

  await downloadTo(video.original_key, original);
  const duration = await probeDuration(original);
  await makeThumbnail(original, work, thumb);
  await transcode(original, processed);

  const base = `videos/${video.channel_id}/${videoId}`;
  const processed_key = `${base}/processed.mp4`;
  const thumbnail_key = `${base}/thumb.jpg`;
  await upload(processed_key, processed, 'video/mp4');
  await upload(thumbnail_key, join(work, thumb), 'image/jpeg');

  await setStatus(videoId, {
    status: 'ready',
    processed_key,
    thumbnail_key,
    duration_sec: duration,
  });
  await fs.rm(work, { recursive: true, force: true });
}

const worker = new Worker(
  QUEUE,
  async (job) => {
    const { videoId } = job.data as { videoId: string };
    console.log(`[worker] processando ${videoId} ...`);
    try {
      await processVideo(videoId);
      console.log(`[worker] ${videoId} pronto`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[worker] falha em ${videoId}:`, message);
      await setStatus(videoId, { status: 'failed', error: message.slice(0, 500) });
      throw err; // deixa o BullMQ reprocessar conforme os attempts
    }
  },
  { connection },
);

worker.on('ready', () => console.log(`[worker] ouvindo a fila '${QUEUE}'`));
