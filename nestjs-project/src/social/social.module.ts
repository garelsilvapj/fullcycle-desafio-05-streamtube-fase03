import { Module } from '@nestjs/common';
import { CommentsModule } from '../comments/comments.module';
import { ReactionsModule } from '../reactions/reactions.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { VideosModule } from '../videos/videos.module';
import { SocialStatsController } from './social-stats.controller';

@Module({
  imports: [VideosModule, ReactionsModule, CommentsModule, SubscriptionsModule],
  controllers: [SocialStatsController],
})
export class SocialModule {}
