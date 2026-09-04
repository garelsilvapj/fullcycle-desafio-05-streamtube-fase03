import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Channel } from '../../channels/entities/channel.entity';
import { VIDEO_SLUG_LENGTH, VIDEO_TITLE_MAX_LENGTH } from '../videos.constants';

export enum VideoStatus {
  UPLOADING = 'uploading',
  UPLOADED = 'uploaded',
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
}

@Entity('videos')
export class Video {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  channel_id: string;

  /** URL curta única do vídeo (11 chars URL-safe). Ver videos.constants.ts. */
  @Index('UQ_videos_slug', { unique: true })
  @Column({ type: 'varchar', length: VIDEO_SLUG_LENGTH })
  slug: string;

  @Column({ type: 'varchar', length: VIDEO_TITLE_MAX_LENGTH })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Index()
  @Column({ type: 'enum', enum: VideoStatus, default: VideoStatus.UPLOADING })
  status: VideoStatus;

  @Column({ type: 'varchar' })
  original_key: string;

  @Column({ type: 'varchar', nullable: true })
  processed_key: string | null;

  @Column({ type: 'varchar', nullable: true })
  thumbnail_key: string | null;

  @Column({ type: 'int', nullable: true })
  duration_sec: number | null;

  @Column({ type: 'bigint', nullable: true })
  size_bytes: string | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Channel)
  @JoinColumn({ name: 'channel_id' })
  channel?: Channel;
}
