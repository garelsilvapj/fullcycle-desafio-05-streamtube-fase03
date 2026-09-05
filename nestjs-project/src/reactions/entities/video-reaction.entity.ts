import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ReactionType } from './reaction-type';

@Entity('video_reactions')
@Unique('UQ_video_reactions_video_user', ['video_id', 'user_id'])
export class VideoReaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  video_id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'enum', enum: ReactionType, enumName: 'reaction_type_enum' })
  type: ReactionType;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
