import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { VideoQueueService, VIDEO_QUEUE } from './video-queue.service';

describe('VideoQueueService', () => {
  let service: VideoQueueService;
  const queue = { add: jest.fn(() => Promise.resolve()) };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        VideoQueueService,
        { provide: getQueueToken(VIDEO_QUEUE), useValue: queue },
      ],
    }).compile();
    service = mod.get(VideoQueueService);
  });

  it('usa o nome de fila compartilhado com o worker', () => {
    expect(VIDEO_QUEUE).toBe('video-processing');
  });

  it('enfileira 1 job idempotente por vídeo com retry exponencial', async () => {
    await service.enqueue('v-1');
    expect(queue.add).toHaveBeenCalledTimes(1);
    const [name, data, opts] = queue.add.mock.calls[0] as unknown as [
      string,
      { videoId: string },
      Record<string, unknown>,
    ];
    expect(name).toBe('process');
    expect(data).toEqual({ videoId: 'v-1' });
    expect(opts).toMatchObject({
      jobId: 'v-1',
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnFail: false,
    });
  });
});
