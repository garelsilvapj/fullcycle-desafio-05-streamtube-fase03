import { STREAM_DEFAULT_CHUNK_BYTES } from './videos.constants';

export type RangeParseResult =
  /** Sem header Range: servir o objeto inteiro (200). */
  | { kind: 'none' }
  /** Header malformado ou fora dos limites: 416 Range Not Satisfiable. */
  | { kind: 'unsatisfiable' }
  /** Faixa válida (inclusiva): 206 Partial Content. */
  | { kind: 'range'; start: number; end: number };

const RANGE_PATTERN = /^bytes=(\d*)-(\d*)$/;

/**
 * Interpreta um header `Range` (RFC 7233, faixa única) contra o tamanho total do objeto.
 * - `bytes=S-E` → [S, min(E, total-1)]
 * - `bytes=S-`  → [S, min(S + chunk - 1, total-1)] (faixa aberta é limitada ao chunk)
 * - `bytes=-N`  → últimos N bytes
 * Se o tamanho total for desconhecido (<= 0) o Range é ignorado e o objeto inteiro é servido.
 */
export function parseRangeHeader(
  header: string | undefined,
  total: number,
  chunk = STREAM_DEFAULT_CHUNK_BYTES,
): RangeParseResult {
  if (!header) return { kind: 'none' };
  if (!Number.isFinite(total) || total <= 0) return { kind: 'none' };

  const match = RANGE_PATTERN.exec(header.trim());
  if (!match) return { kind: 'unsatisfiable' };
  const [, rawStart, rawEnd] = match;
  if (rawStart === '' && rawEnd === '') return { kind: 'unsatisfiable' };

  const last = total - 1;

  if (rawStart === '') {
    const suffix = parseInt(rawEnd, 10);
    if (suffix <= 0) return { kind: 'unsatisfiable' };
    return { kind: 'range', start: Math.max(0, total - suffix), end: last };
  }

  const start = parseInt(rawStart, 10);
  if (start > last) return { kind: 'unsatisfiable' };

  const end =
    rawEnd === ''
      ? Math.min(start + chunk - 1, last)
      : Math.min(parseInt(rawEnd, 10), last);
  if (end < start) return { kind: 'unsatisfiable' };

  return { kind: 'range', start, end };
}
