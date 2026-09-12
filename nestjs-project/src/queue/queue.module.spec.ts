import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import queueConfig from '../config/queue.config';
import { QueueModule } from './queue.module';
import { VideoQueueService, VIDEO_QUEUE } from './video-queue.service';

describe('QueueModule', () => {
  it('compila com BullModule e expõe o VideoQueueService', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [queueConfig] }),
        QueueModule,
      ],
    }).compile();

    expect(module.get(VideoQueueService)).toBeInstanceOf(VideoQueueService);
    // Garante que a conexão Redis está estabelecida antes de fechar (evita
    // "Connection is closed" assíncrono do ioredis derrubando o worker do Jest).
    await module.get<Queue>(getQueueToken(VIDEO_QUEUE)).waitUntilReady();
    await module.close();
  }, 30000);
});
