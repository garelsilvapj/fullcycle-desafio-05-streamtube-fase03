import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Channel } from '../channels/entities/channel.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { Video } from '../videos/entities/video.entity';
import { CreateUsersAndChannels1775687773260 } from './migrations/1775687773260-CreateUsersAndChannels';
import { CreateAuthTokens1777579850478 } from './migrations/1777579850478-CreateAuthTokens';
import { CreateVideosTable1780000000000 } from './migrations/1780000000000-CreateVideosTable';
import { AddVideoSlug1781000000000 } from './migrations/1781000000000-AddVideoSlug';
import { CreateCategories1782000000000 } from './migrations/1782000000000-CreateCategories';
import { AddVideoManagementColumns1783000000000 } from './migrations/1783000000000-AddVideoManagementColumns';
import { Category } from '../categories/entities/category.entity';
import { createTestDataSource } from '../test/create-test-data-source';

const ALL_MIGRATIONS = [
  CreateUsersAndChannels1775687773260,
  CreateAuthTokens1777579850478,
  CreateVideosTable1780000000000,
  AddVideoSlug1781000000000,
  CreateCategories1782000000000,
  AddVideoManagementColumns1783000000000,
];

const MANAGED_TABLES = [
  'users',
  'channels',
  'refresh_tokens',
  'verification_tokens',
  'videos',
  'categories',
];

// Tipos criados por CREATE TYPE nas migrations; DROP TABLE não os remove.
const MANAGED_TYPES = [
  'verification_tokens_type_enum',
  'videos_status_enum',
  'videos_visibility_enum',
];

async function listTables(dataSource: DataSource): Promise<string[]> {
  const rows = await dataSource.query<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])
     ORDER BY table_name`,
    [MANAGED_TABLES],
  );
  return rows.map((r) => r.table_name);
}

async function hasColumn(
  dataSource: DataSource,
  table: string,
  column: string,
): Promise<boolean> {
  const rows = await dataSource.query<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return rows.length > 0;
}

describe('Database migrations (integration)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = createTestDataSource(
      [User, Channel, RefreshToken, VerificationToken, Video, Category],
      { synchronize: false, migrations: ALL_MIGRATIONS },
    );
    await dataSource.initialize();

    // Esquema limpo: tabelas (em ordem de dependência via CASCADE), tipos e histórico.
    for (const table of [...MANAGED_TABLES].reverse()) {
      await dataSource.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
    }
    for (const type of MANAGED_TYPES) {
      await dataSource.query(`DROP TYPE IF EXISTS "${type}" CASCADE`);
    }
    await dataSource.query(`DROP TABLE IF EXISTS "migrations" CASCADE`);
  });

  afterAll(async () => {
    // Os testes de revert deixam o esquema incompleto; reaplica tudo para as outras suítes.
    await dataSource.runMigrations();
    await dataSource.destroy();
  });

  it('should apply all migrations and create every managed table', async () => {
    const ranMigrations = await dataSource.runMigrations();
    expect(ranMigrations.map((m) => m.name)).toEqual(
      ALL_MIGRATIONS.map((m) => m.name),
    );
    expect(await listTables(dataSource)).toEqual([
      'categories',
      'channels',
      'refresh_tokens',
      'users',
      'verification_tokens',
      'videos',
    ]);
    expect(await hasColumn(dataSource, 'videos', 'slug')).toBe(true);
    expect(await hasColumn(dataSource, 'videos', 'published_at')).toBe(true);
    const categories = await dataSource.query<{ count: string }[]>(
      'SELECT count(*)::text AS count FROM "categories"',
    );
    expect(Number(categories[0].count)).toBe(8);
  });

  it('should be idempotent: running again applies nothing', async () => {
    const ranMigrations = await dataSource.runMigrations();
    expect(ranMigrations).toHaveLength(0);
  });

  it('should revert the management, categories, slug and videos migrations in order', async () => {
    await dataSource.undoLastMigration();
    expect(await hasColumn(dataSource, 'videos', 'published_at')).toBe(false);

    await dataSource.undoLastMigration();
    expect(await listTables(dataSource)).not.toContain('categories');

    await dataSource.undoLastMigration();
    expect(await hasColumn(dataSource, 'videos', 'slug')).toBe(false);

    await dataSource.undoLastMigration();
    expect(await listTables(dataSource)).not.toContain('videos');
  });

  it('should revert the auth tokens migration and remove token tables', async () => {
    await dataSource.undoLastMigration();
    const tables = await listTables(dataSource);
    expect(tables).not.toContain('refresh_tokens');
    expect(tables).not.toContain('verification_tokens');
  });
});
