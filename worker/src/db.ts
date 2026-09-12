/**
 * Acesso ao banco com SQL direto (pg.Pool). Colunas snake_case iguais às da migration
 * `CreateVideosTable` da API. As transições de status são guardadas por `WHERE status IN (...)`
 * para que dois workers (ou um reprocessamento) nunca sobrescrevam um estado mais avançado.
 */
import { Pool } from 'pg';
import type { WorkerConfig } from './config';

export type VideoStatus = 'uploading' | 'uploaded' | 'processing' | 'ready' | 'failed';

export interface VideoRow {
  id: string;
  channel_id: string;
  status: VideoStatus;
  original_key: string;
}

export interface ReadyFields {
  processed_key: string;
  thumbnail_key: string;
  duration_sec: number;
  size_bytes: number;
}

export interface VideoRepository {
  getVideo(id: string): Promise<VideoRow | undefined>;
  /** `from` → processing. Retorna false se o vídeo não estava em nenhum dos estados `from`. */
  markProcessing(id: string, from: readonly VideoStatus[]): Promise<boolean>;
  /** processing → ready com os artefatos. */
  markReady(id: string, fields: ReadyFields): Promise<boolean>;
  /** processing → failed (última tentativa) guardando o erro. */
  markFailed(id: string, error: string): Promise<boolean>;
  /** processing → uploaded (tentativa intermediária: volta para a fila reprocessar). */
  markRetry(id: string, error: string): Promise<boolean>;
  close(): Promise<void>;
}

export const RETRYABLE_FROM: readonly VideoStatus[] = ['uploaded', 'failed'];

export function createVideoRepository(cfg: WorkerConfig['db']): VideoRepository {
  const pool = new Pool({ ...cfg, max: 4 });

  async function transition(
    id: string,
    from: readonly VideoStatus[],
    to: VideoStatus,
    fields: Record<string, unknown> = {},
  ): Promise<boolean> {
    const keys = Object.keys(fields);
    const assignments = ['"status" = $2', '"updated_at" = now()']
      .concat(keys.map((k, i) => `"${k}" = $${i + 4}`))
      .join(', ');
    const res = await pool.query(
      `UPDATE videos SET ${assignments} WHERE id = $1 AND status = ANY($3::videos_status_enum[])`,
      [id, to, from, ...keys.map((k) => fields[k])],
    );
    return (res.rowCount ?? 0) > 0;
  }

  return {
    async getVideo(id) {
      const res = await pool.query<VideoRow>(
        'SELECT id, channel_id, status, original_key FROM videos WHERE id = $1',
        [id],
      );
      return res.rows[0];
    },
    markProcessing: (id, from) => transition(id, from, 'processing', { error: null }),
    markReady: (id, fields) => transition(id, ['processing'], 'ready', { ...fields, error: null }),
    markFailed: (id, error) => transition(id, ['processing'], 'failed', { error }),
    markRetry: (id, error) => transition(id, ['processing'], 'uploaded', { error }),
    close: () => pool.end(),
  };
}
