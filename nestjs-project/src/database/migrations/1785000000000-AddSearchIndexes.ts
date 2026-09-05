import { MigrationInterface, QueryRunner } from 'typeorm';

/** Fase 07: índices trigram para a busca por título e canal (TD-07.2). */
export class AddSearchIndexes1785000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_videos_title_trgm" ON "videos" USING gin ("title" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_channels_name_trgm" ON "channels" USING gin ("name" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_channels_nickname_trgm" ON "channels" USING gin ("nickname" gin_trgm_ops)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_channels_nickname_trgm"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_channels_name_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_videos_title_trgm"`);
  }
}
