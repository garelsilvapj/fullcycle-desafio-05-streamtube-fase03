const KiB = 1024;
const MiB = 1024 * KiB;
const GiB = 1024 * MiB;

/** Limite do brief: upload de até 10GB. */
export const VIDEO_MAX_SIZE_BYTES = 10 * GiB;
export const VIDEO_TITLE_MAX_LENGTH = 200;
export const VIDEO_DESCRIPTION_MAX_LENGTH = 5000;

/** URL curta única (estilo YouTube): 11 chars de um alfabeto URL-safe = 64^11 combinações. */
export const VIDEO_SLUG_LENGTH = 11;
export const VIDEO_SLUG_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export const VIDEO_SLUG_MAX_RETRIES = 5;
export const VIDEO_SLUG_COLUMN = 'slug';

/** Tamanho servido quando o cliente pede um Range aberto (`bytes=N-`). */
export const STREAM_DEFAULT_CHUNK_BYTES = 1 * MiB;

/** Limite do S3 para partes de um upload multipart. */
export const S3_MAX_PARTS = 10_000;

export const VIDEO_STORAGE_KEYS = {
  ORIGINAL: 'original',
  PROCESSED: 'processed.mp4',
  THUMBNAIL: 'thumb.jpg',
} as const;

/** Prefixo comum de todos os objetos de um vídeo no storage. */
export function buildVideoKeyPrefix(
  channelId: string,
  videoId: string,
): string {
  return `videos/${channelId}/${videoId}`;
}
