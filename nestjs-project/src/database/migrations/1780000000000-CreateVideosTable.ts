import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateVideosTable1780000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "videos_status_enum" AS ENUM ('uploading','uploaded','processing','ready','failed');`,
    );

    await queryRunner.createTable(
      new Table({
        name: 'videos',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          { name: 'channel_id', type: 'uuid' },
          { name: 'title', type: 'varchar', length: '200' },
          { name: 'description', type: 'text', isNullable: true },
          {
            name: 'status',
            type: 'videos_status_enum',
            default: `'uploading'`,
          },
          { name: 'original_key', type: 'varchar' },
          { name: 'processed_key', type: 'varchar', isNullable: true },
          { name: 'thumbnail_key', type: 'varchar', isNullable: true },
          { name: 'duration_sec', type: 'int', isNullable: true },
          { name: 'size_bytes', type: 'bigint', isNullable: true },
          { name: 'error', type: 'text', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'videos',
      new TableIndex({
        name: 'IDX_videos_channel_id',
        columnNames: ['channel_id'],
      }),
    );
    await queryRunner.createIndex(
      'videos',
      new TableIndex({ name: 'IDX_videos_status', columnNames: ['status'] }),
    );
    await queryRunner.createForeignKey(
      'videos',
      new TableForeignKey({
        columnNames: ['channel_id'],
        referencedTableName: 'channels',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('videos', true);
    await queryRunner.query(`DROP TYPE IF EXISTS "videos_status_enum";`);
  }
}
