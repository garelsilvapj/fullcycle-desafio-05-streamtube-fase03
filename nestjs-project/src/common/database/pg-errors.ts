import { QueryFailedError } from 'typeorm';

export const PG_UNIQUE_VIOLATION = '23505';

/** true se o erro é uma violação de unicidade do PostgreSQL envolvendo a coluna informada. */
export function isPgUniqueViolationOnColumn(
  err: unknown,
  column: string,
): boolean {
  if (!(err instanceof QueryFailedError)) return false;
  const e = err as unknown as { code?: string; detail?: string };
  return (
    e.code === PG_UNIQUE_VIOLATION &&
    typeof e.detail === 'string' &&
    e.detail.includes(column)
  );
}
