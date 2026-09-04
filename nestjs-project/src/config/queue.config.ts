import { registerAs } from '@nestjs/config';

// Fila de processamento de vídeo (BullMQ sobre Redis). Ver TD-03.3.
// O nome da fila vive em `src/queue/video-queue.service.ts` (VIDEO_QUEUE), compartilhado com o worker.
export default registerAs('queue', () => ({
  redisHost: process.env.REDIS_HOST || 'redis',
  redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),
}));
