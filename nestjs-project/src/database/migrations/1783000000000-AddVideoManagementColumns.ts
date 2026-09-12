import { MigrationInterface, QueryRunner } from 'typeorm';

/** Fase 04: categoria, visibilidade, publicação, thumbnail customizada e contador de views. */
export class AddVideoManagementColumns1783000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "videos_visibility_enum" AS ENUM ('public', 'unlisted');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos"
        ADD COLUMN IF NOT EXISTS "category_id" uuid,
        ADD COLUMN IF NOT EXISTS "visibility" "videos_visibility_enum" NOT NULL DEFAULT 'public',
        ADD COLUMN IF NOT EXISTS "published_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "custom_thumbnail_key" character varying,
        ADD COLUMN IF NOT EXISTS "views_count" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
        ALTER TABLE "videos" ADD CONSTRAINT "FK_videos_category" FOREIGN KEY ("category_id")
          REFERENCES "categories"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_videos_category_id" ON "videos" ("category_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_videos_published_at" ON "videos" ("published_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_videos_published_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_videos_category_id"`);
    await queryRunner.query(
      `ALTER TABLE "videos" DROP CONSTRAINT IF EXISTS "FK_videos_category"`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos"
        DROP COLUMN IF EXISTS "views_count",
        DROP COLUMN IF EXISTS "custom_thumbnail_key",
        DROP COLUMN IF EXISTS "published_at",
        DROP COLUMN IF EXISTS "visibility",
        DROP COLUMN IF EXISTS "category_id"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "videos_visibility_enum"`);
  }
}
