import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VideosModule } from '../videos/videos.module';
import { VideoReaction } from './entities/video-reaction.entity';
import { CommentReaction } from './entities/comment-reaction.entity';
import { ReactionsService } from './reactions.service';
import { VideoReactionsController } from './reactions.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([VideoReaction, CommentReaction]),
    VideosModule,
  ],
  controllers: [VideoReactionsController],
  providers: [ReactionsService],
  exports: [ReactionsService],
})
export class ReactionsModule {}
