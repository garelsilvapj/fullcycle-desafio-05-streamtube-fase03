import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('subscriptions')
@Unique('UQ_subscriptions_channel_subscriber', ['channel_id', 'subscriber_id'])
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  channel_id: string;

  @Index()
  @Column({ type: 'uuid' })
  subscriber_id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
