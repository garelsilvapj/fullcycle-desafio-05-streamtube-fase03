import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adiciona a URL curta única (`slug`) aos vídeos. Linhas existentes recebem um valor
 * aleatório (hex) só para satisfazer NOT NULL; novos vídeos usam o alfabeto URL-safe da API.
 */
export class AddVideoSlug1781000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "slug" character varying(11)`,
    );
    await queryRunner.query(
      `UPDATE "videos" SET "slug" = substr(md5(random()::text || id::text), 1, 11) WHERE "slug" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" ALTER COLUMN "slug" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_videos_slug" ON "videos" ("slug")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_videos_slug"`);
    await queryRunner.query(
      `ALTER TABLE "videos" DROP COLUMN IF EXISTS "slug"`,
    );
  }
}
