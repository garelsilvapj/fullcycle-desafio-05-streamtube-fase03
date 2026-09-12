# Phase 03 — Library References

Bibliotecas novas fixadas nesta fase (storage, fila, processamento de vídeo). Versões conferidas
contra os manifestos instalados: `nestjs-project/package.json` (API) e `worker/package.json`
(worker). A documentação oficial de cada uma foi consultada via **context7** antes da implementação.

## API — `nestjs-project/`

| Lib | Versão instalada | Papel | Notas de uso |
|---|---|---|---|
| `@aws-sdk/client-s3` | `^3.700.0` | cliente S3/MinIO | `forcePathStyle: true` para MinIO |
| `@aws-sdk/s3-request-presigner` | `^3.700.0` | URLs pré-assinadas | `getSignedUrl(client, PutObjectCommand, { expiresIn })` |
| `bullmq` | `^5.34.0` | fila de jobs sobre Redis | `Queue`; `jobId` para idempotência |
| `@nestjs/bullmq` | `^11.0.1` | integração BullMQ + Nest | `BullModule.registerQueue({ name: 'video-processing' })` |
| `ioredis` | `^5.4.1` | conexão Redis | usado por baixo pelo BullMQ |

## Worker — `worker/`

| Lib | Versão instalada | Papel | Notas de uso |
|---|---|---|---|
| `bullmq` | `^5.34.0` | consumidor da fila | `new Worker(queue, processor, { connection, concurrency, lockDuration })` |
| `ioredis` | `^5.4.1` | conexão Redis | instância própria do worker, encerrada no shutdown |
| `fluent-ffmpeg` | `^2.1.3` | wrapper de FFmpeg | thumbnail (`screenshots`) + transcode H.264/AAC |
| `@types/fluent-ffmpeg` | `^2.1.27` | tipagem | a lib não traz tipos próprios |
| `@aws-sdk/client-s3` | `^3.700.0` | download do original | `GetObjectCommand` |
| `@aws-sdk/lib-storage` | `^3.1127.0` | upload dos artefatos | `Upload` faz multipart automático nos arquivos processados |
| `pg` | `^8.13.0` | acesso ao Postgres | SQL direto (`Pool`); o worker não carrega TypeORM |

Dependência de sistema: **FFmpeg + ffprobe**, instalados na imagem do worker (`worker/Dockerfile`,
estágios `test` e `runtime`) — não são pacotes npm.

## Notas fixadas (evitam alucinação de API)

- **Presigned PUT (MinIO):** gerar com `PutObjectCommand` + `getSignedUrl`; o cliente faz `PUT`
  direto na URL. O PUT único tem teto de **5GB**, então acima do limiar é obrigatório usar multipart
  (`CreateMultipartUpload` → `UploadPart` assinada por parte → `CompleteMultipartUpload`, com
  `AbortMultipartUpload` no cancelamento).
- **Assinatura vs. acesso interno:** assinar com o endpoint público (`S3_PUBLIC_ENDPOINT`) e operar
  com o interno (`S3_ENDPOINT`) exige **dois clientes** — a URL assinada carrega o host no cálculo
  da assinatura, então não dá para trocar o host depois de assinar.
- **Range read:** `GetObjectCommand({ Range: 'bytes=start-end' })` retorna `Body` como stream;
  repassar com `206` + `Content-Range`.
- **BullMQ:** producer
  `queue.add('process', { videoId }, { jobId: videoId, attempts: 5, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: true, removeOnFail: false })`;
  consumer `new Worker('video-processing', processor, { connection })`. `jobId` repetido é
  descartado pela fila — é o que dá idempotência à confirmação de upload.
- **FFmpeg thumbnail:** `ffmpeg(input).screenshots({ count: 1, timemarks: [...], folder, filename })`.
- **FFmpeg transcode:** `-c:v libx264 -preset <preset> -crf <crf> -pix_fmt yuv420p -c:a aac
  -movflags +faststart`. O `+faststart` move o índice (`moov`) para o começo do arquivo — sem ele o
  player precisa baixar o arquivo inteiro antes de iniciar, o que anularia o streaming de TD-03.5.
- **ffprobe:** `ffmpeg.ffprobe(input, cb)` → `data.format.duration` (segundos) e `data.streams` para
  resolução e codec.
