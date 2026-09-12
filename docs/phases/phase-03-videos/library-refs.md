# Phase 03 — Library References

Bibliotecas novas fixadas nesta fase (storage, fila, processamento de vídeo).

| Lib | Versão | Papel | Notas de uso |
|---|---|---|---|
| `@aws-sdk/client-s3` | ^3.x | cliente S3/MinIO | `forcePathStyle: true` para MinIO |
| `@aws-sdk/s3-request-presigner` | ^3.x | URLs pré-assinadas | `getSignedUrl(client, PutObjectCommand, { expiresIn })` |
| `bullmq` | ^5.x | fila de jobs sobre Redis | `Queue`/`Worker`; `jobId` para idempotência |
| `@nestjs/bullmq` | ^11.x | integração BullMQ + Nest | `BullModule.registerQueue({ name: 'video-processing' })` |
| `ioredis` | ^5.x | conexão Redis | usado pelo BullMQ |
| `fluent-ffmpeg` | ^2.x | wrapper de FFmpeg (worker) | thumbnail (`screenshots`) + transcode H.264/AAC |

## Notas fixadas (evitam alucinação de API)

- **Presigned PUT (MinIO):** gerar com `PutObjectCommand` + `getSignedUrl`; o cliente faz `PUT`
  direto na URL. Para >5GB, usar multipart (CreateMultipartUpload/UploadPart/Complete).
- **Range read:** `GetObjectCommand({ Range: 'bytes=start-end' })` retorna `Body` como stream;
  repassar com `206` + `Content-Range`.
- **BullMQ:** `new Worker('video-processing', processor, { connection })`; producer
  `queue.add('process', { videoId }, { jobId: videoId, attempts: 5, backoff: { type: 'exponential', delay: 5000 } })`.
- **FFmpeg thumbnail:** `ffmpeg(input).screenshots({ count: 1, filename, folder })`.
- **FFmpeg transcode:** `-c:v libx264 -c:a aac -movflags +faststart` (streaming progressivo).
