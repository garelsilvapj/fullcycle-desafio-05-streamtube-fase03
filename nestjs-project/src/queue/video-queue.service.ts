import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export const VIDEO_QUEUE = 'video-processing';

@Injectable()
export class VideoQueueService {
  constructor(@InjectQueue(VIDEO_QUEUE) private readonly queue: Queue) {}

  /**
   * Enfileira o processamento de um vídeo. `jobId = videoId` garante idempotência
   * (confirmar duas vezes não cria dois jobs). Ver Events/Messages no plano da fase.
   */
  async enqueue(videoId: string): Promise<void> {
    await this.queue.add(
      'process',
      { videoId },
      {
        jobId: videoId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }
}
