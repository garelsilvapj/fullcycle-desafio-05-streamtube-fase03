import { Test } from '@nestjs/testing';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import type { Queue } from 'bullmq';
import queueConfig from '../config/queue.config';
import { VideoQueueService, VIDEO_QUEUE } from './video-queue.service';

/**
 * Integração real com o Redis do compose. Usa um `prefix` próprio para não interferir na
 * fila que o worker de desenvolvimento está consumindo (`bull:` é o prefixo padrão).
 */
describe('VideoQueueService (integration, Redis)', () => {
  const cfg = queueConfig();
  let service: VideoQueueService;
  let queue: Queue;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [queueConfig] }),
        BullModule.forRoot({
          connection: { host: cfg.redisHost, port: cfg.redisPort },
          prefix: 'test-bull',
        }),
        BullModule.registerQueue({ name: VIDEO_QUEUE }),
      ],
      providers: [VideoQueueService],
    }).compile();
    service = moduleRef.get(VideoQueueService);
    queue = moduleRef.get<Queue>(getQueueToken(VIDEO_QUEUE));
    await queue.waitUntilReady();
    close = () => moduleRef.close();
  });

  beforeEach(async () => {
    await queue.obliterate({ force: true });
  });

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await close();
  });

  it('enqueue() creates one waiting job per video with the retry policy', async () => {
    await service.enqueue('video-1');

    const job = await queue.getJob('video-1');
    expect(job).toBeDefined();
    expect(job?.name).toBe('process');
    expect(job?.data).toEqual({ videoId: 'video-1' });
    expect(job?.opts).toMatchObject({
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
    expect((await queue.getJobCounts('waiting')).waiting).toBe(1);
  });

  it('enqueue() is idempotent per videoId (jobId = videoId)', async () => {
    await service.enqueue('video-2');
    await service.enqueue('video-2');
    await service.enqueue('video-3');
    expect((await queue.getJobCounts('waiting')).waiting).toBe(2);
  });
});
