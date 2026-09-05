import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const COMMENT_BODY_MAX_LENGTH = 2000;

@Entity('comments')
@Index('IDX_comments_video_created', ['video_id', 'created_at'])
export class Comment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  video_id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  /** null = comentário raiz; só raízes aceitam respostas (profundidade máxima 2, TD-06.2). */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  parent_id: string | null;

  @Column({ type: 'text' })
  body: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  /** Exclusão lógica: preserva respostas; o corpo não é servido. */
  @Column({ type: 'timestamptz', nullable: true })
  deleted_at: Date | null;
}
