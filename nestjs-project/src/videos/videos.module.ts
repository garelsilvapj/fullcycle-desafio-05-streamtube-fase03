import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Video } from './entities/video.entity';
import { Channel } from '../channels/entities/channel.entity';
import { VideosService } from './videos.service';
import { VideosController } from './videos.controller';
import { ChannelVideosController } from './channel-videos.controller';
import { StorageModule } from '../storage/storage.module';
import { QueueModule } from '../queue/queue.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Video, Channel]),
    StorageModule,
    QueueModule,
    CategoriesModule,
  ],
  controllers: [VideosController, ChannelVideosController],
  providers: [VideosService],
  exports: [VideosService],
})
export class VideosModule {}
