import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ReactionType } from './reaction-type';

@Entity('comment_reactions')
@Unique('UQ_comment_reactions_comment_user', ['comment_id', 'user_id'])
export class CommentReaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  comment_id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'enum', enum: ReactionType, enumName: 'reaction_type_enum' })
  type: ReactionType;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
