import { MigrationInterface, QueryRunner } from 'typeorm';
import { PLATFORM_CATEGORIES } from '../../categories/categories.constants';

/** Categorias fixas da plataforma (TD-04.1): tabela + seed idempotente. */
export class CreateCategories1782000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "categories" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(60) NOT NULL,
        "slug" character varying(60) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_categories" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_categories_name" UNIQUE ("name"),
        CONSTRAINT "UQ_categories_slug" UNIQUE ("slug")
      )`,
    );
    for (const { slug, name } of PLATFORM_CATEGORIES) {
      await queryRunner.query(
        `INSERT INTO "categories" ("name", "slug") VALUES ($1, $2) ON CONFLICT ("slug") DO NOTHING`,
        [name, slug],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "categories"`);
  }
}
