import { MigrationInterface, QueryRunner } from 'typeorm';

/** Fase 06: reações (vídeo/comentário), comentários com 1 nível de resposta e inscrições. */
export class CreateSocialTables1784000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "reaction_type_enum" AS ENUM ('like', 'dislike');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "video_reactions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "video_id" uuid NOT NULL REFERENCES "videos"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "type" "reaction_type_enum" NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_video_reactions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_video_reactions_video_user" UNIQUE ("video_id", "user_id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_video_reactions_video_id" ON "video_reactions" ("video_id")`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "comments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "video_id" uuid NOT NULL REFERENCES "videos"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "parent_id" uuid REFERENCES "comments"("id") ON DELETE CASCADE,
        "body" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_comments" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_comments_video_created" ON "comments" ("video_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_comments_parent_id" ON "comments" ("parent_id")`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "comment_reactions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "comment_id" uuid NOT NULL REFERENCES "comments"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "type" "reaction_type_enum" NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_comment_reactions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_comment_reactions_comment_user" UNIQUE ("comment_id", "user_id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_comment_reactions_comment_id" ON "comment_reactions" ("comment_id")`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "subscriptions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "channel_id" uuid NOT NULL REFERENCES "channels"("id") ON DELETE CASCADE,
        "subscriber_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_subscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_subscriptions_channel_subscriber" UNIQUE ("channel_id", "subscriber_id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_subscriptions_channel_id" ON "subscriptions" ("channel_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_subscriptions_subscriber_id" ON "subscriptions" ("subscriber_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "subscriptions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "comment_reactions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "comments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "video_reactions"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "reaction_type_enum"`);
  }
}
