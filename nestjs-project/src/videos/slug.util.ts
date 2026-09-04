import { randomInt } from 'crypto';
import { VIDEO_SLUG_ALPHABET, VIDEO_SLUG_LENGTH } from './videos.constants';

export const VIDEO_SLUG_PATTERN = new RegExp(
  `^[A-Za-z0-9_-]{${VIDEO_SLUG_LENGTH}}$`,
);

/** Gera um slug aleatório URL-safe (CSPRNG) para a URL única do vídeo. */
export function generateVideoSlug(length = VIDEO_SLUG_LENGTH): string {
  let slug = '';
  for (let i = 0; i < length; i++) {
    slug += VIDEO_SLUG_ALPHABET[randomInt(VIDEO_SLUG_ALPHABET.length)];
  }
  return slug;
}
