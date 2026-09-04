# Phase 03 — Upload e Processamento de Vídeos

## Objective

Entregar o ciclo completo de vídeo do StreamTube: registrar um vídeo em um canal, subir o arquivo
(até 10GB) direto para o object storage via URL pré-assinada, processá-lo de forma assíncrona
(thumbnail + normalização H.264/AAC) em um worker com FFmpeg, e disponibilizá-lo para streaming
(HTTP Range) e download por uma URL única — reaproveitando os padrões de config, erros e auth das
Fases 01–02.

---

## Step Implementations

### SI-03.1 — Dependências, configuração e infra (MinIO + Redis)

**Description:** Instalar dependências da fase, criar os config namespaces `storage` e `queue`
(padrão `registerAs`), estender o Joi schema e adicionar MinIO + Redis + serviço `worker` ao
Docker Compose.

**Technical actions:**
- Instalar em `nestjs-project`: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`,
  `bullmq`, `ioredis`, `@nestjs/bullmq`.
- Criar `src/config/storage.config.ts` — `registerAs('storage', ...)`: `S3_ENDPOINT`,
  `S3_REGION` (default `us-east-1`), `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`
  (default `streamtube-videos`), `S3_FORCE_PATH_STYLE` (default `true`).
- Criar `src/config/queue.config.ts` — `registerAs('queue', ...)`: `REDIS_HOST` (default `redis`),
  `REDIS_PORT` (default `6379`).
- Atualizar `src/config/env.validation.ts` e `.env.example` com as novas variáveis.
- Atualizar `compose.yaml`: serviços `minio` (+ `createbuckets` para criar o bucket), `redis`,
  e `worker` (build de `worker/`), com a API dependendo de `minio`/`redis`.

**Dependencies:** None.
**Acceptance criteria:** app sobe com as novas envs; MinIO responde em `:9000` (console `:9001`);
Redis aceita conexão; sem `S3_ACCESS_KEY` o bootstrap falha na validação Joi.

### SI-03.2 — Entidade Video, migration e estados

**Description:** Modelar a entidade `Video`, sua migration e a máquina de estados.

**Technical actions:**
- `src/videos/entities/video.entity.ts` — colunas em Data Model (abaixo); FK `channelId`.
- Migration TypeORM `CreateVideosTable` (índices em `channelId` e `status`).
- Enum de status `uploading → uploaded → processing → ready | failed`.

**Dependencies:** SI-03.1.
**Acceptance criteria:** `migration:run` cria a tabela; relação Video↔Channel válida.

### SI-03.3 — StorageService (MinIO/S3)

**Description:** Serviço de acesso ao object storage.

**Technical actions:**
- `src/storage/storage.service.ts` — `createPresignedUpload(key)`, `createPresignedDownload(key)`,
  `getObjectRange(key, start, end)`, `putObject(key, body)`, `headObject(key)`.
- `src/storage/storage.module.ts` (provider global do client S3).

**Dependencies:** SI-03.1.
**Acceptance criteria:** presigned URL válida gerada; range read retorna o buffer correto.

### SI-03.4 — Módulo de vídeos (registro, confirmação, consulta)

**Description:** Endpoints de ciclo de vida do vídeo (exceto binário).

**Technical actions:**
- `videos.service.ts` — `register(channelId, dto)` (cria Video `uploading` + presigned PUT),
  `confirmUpload(id)` (→ `uploaded`, enfileira job), `get(id)`, `listByChannel(channelId)`.
- `videos.controller.ts` — rotas em API Contracts (abaixo), protegidas por JWT + ownership do canal.
- DTOs `create-video.dto.ts` (title, description) validados por class-validator.

**Dependencies:** SI-03.2, SI-03.3, SI-03.6.
**Acceptance criteria:** registrar retorna `uploadUrl`; confirmar enfileira job e move para `uploaded`.

### SI-03.5 — Streaming (Range) e download

**Description:** Servir o binário.

**Technical actions:**
- `GET /videos/:id/stream` honra `Range` → `206 Partial Content` (ou `200` sem range), lendo faixas
  do MinIO. `GET /videos/:id/download` retorna presigned download (302) ou stream `attachment`.
- Só vídeos `ready` são streamáveis; caso contrário `WEBHOOK`—não, `VIDEO_NOT_READY`.

**Dependencies:** SI-03.3, SI-03.4.
**Acceptance criteria:** requisição com `Range: bytes=0-1023` retorna `206` + `Content-Range`.

### SI-03.6 — Fila (producer) e contrato do job

**Description:** Integração da API com BullMQ.

**Technical actions:**
- `src/queue/queue.module.ts` registra a fila `video-processing`.
- `src/queue/video-queue.service.ts` — `enqueue(videoId)` (job com `{ videoId }`, `jobId=videoId`
  para idempotência, retry com backoff).

**Dependencies:** SI-03.1.
**Acceptance criteria:** confirmar upload cria exatamente 1 job por vídeo (idempotente).

### SI-03.7 — Worker de processamento (FFmpeg)

**Description:** Consumir a fila e processar o vídeo.

**Technical actions:**
- `worker/` (projeto Node próprio): consumer BullMQ da fila `video-processing`.
- Para cada `videoId`: baixa o original do MinIO, roda FFmpeg (thumbnail JPG + transcode MP4
  H.264/AAC), sobe os artefatos, e atualiza o Video (`processing → ready`, grava chaves/duração).
  Em erro, `failed` + retry pela fila.
- `worker/Dockerfile` com FFmpeg instalado.

**Dependencies:** SI-03.6, SI-03.2, SI-03.3.
**Acceptance criteria:** job processa um MP4 de teste e o Video vira `ready` com thumbnail e duração.

### SI-03.8 — CLAUDE.md e wiring final

**Description:** Registrar o módulo no `AppModule`, atualizar `CLAUDE.md` com a seção de vídeos.

**Dependencies:** SI-03.1–03.7.
**Acceptance criteria:** `nest build` compila; `docker compose up` sobe API+DB+Redis+MinIO+worker.

---

## Technical Specifications

### Data Model — `videos`

| Coluna | Tipo | Notas |
|---|---|---|
| id | uuid (pk) | |
| slug | varchar(11) unique | URL curta (alfabeto URL-safe, CSPRNG), migration `AddVideoSlug` |
| channelId | uuid (fk → channels.id) | índice |
| title | varchar | |
| description | text | nullable |
| status | enum | uploading/uploaded/processing/ready/failed (índice) |
| originalKey | varchar | chave do arquivo original no storage |
| processedKey | varchar | nullable — MP4 normalizado |
| thumbnailKey | varchar | nullable |
| durationSec | int | nullable |
| sizeBytes | bigint | nullable |
| error | text | nullable — último erro do worker |
| createdAt / updatedAt | timestamptz | |

### API Contracts (estado após a Etapa 1 do plano de evolução)

Todas as rotas exigem JWT (guard global) e, nesta fase, **o usuário ser dono do canal do vídeo**.
Leitura pública/anônima fica para a Fase 05. IDs são validados como UUID (400 se inválido).
Respostas usam `VideoResponseDto` (nunca expõem chaves do storage; `error` só para o dono).

| Método | Rota | Sucesso | Descrição |
|---|---|---|---|
| POST | `/videos` | 201 `{ video, upload }` | registra rascunho + plano de upload `single` (URL) ou `multipart` (`uploadId`, `partSize`, `parts[]`) conforme `sizeBytes` (máx. 10GB) |
| POST | `/videos/:id/confirm` | 200 `video` | `uploading → uploaded`, valida objeto no storage, enfileira |
| POST | `/videos/:id/multipart/complete` | 200 `video` | monta o objeto (ETags), `uploading → uploaded`, enfileira |
| POST | `/videos/:id/multipart/abort` | 204 | cancela o multipart e remove o registro |
| DELETE | `/videos/:id` | 204 | remove objetos do storage e o registro (não permitido em `processing`) |
| GET | `/videos` | 200 `video[]` | meus vídeos, mais recentes primeiro |
| GET | `/videos/:id` | 200 `video` | metadados/status/`slug`/`thumbnailUrl` |
| GET | `/videos/:id/thumbnail` | 302 | redirect para URL pré-assinada da thumbnail |
| GET | `/videos/:id/stream` | 200 / 206 | MP4 processado; `Range` → 206 + `Content-Range`; inválido → 416 |
| GET | `/videos/:id/download` | 302 | redirect para URL pré-assinada do MP4 |

URLs pré-assinadas são geradas com `S3_PUBLIC_ENDPOINT` (host/navegador), enquanto a API fala
com o storage por `S3_ENDPOINT` (rede Docker).

### Authorization Matrix

| Ação | Regra |
|---|---|
| registrar / confirmar / completar / cancelar / excluir | usuário == dono do canal do vídeo |
| consultar / listar / thumbnail / stream / download | usuário == dono do canal (fase atual); visibilidade pública/unlisted fica para a Fase 05 |

### Error Catalog (`VIDEO_*`)

| Código | HTTP | Quando |
|---|---|---|
| `VIDEO_NOT_FOUND` | 404 | id inexistente |
| `VIDEO_CHANNEL_NOT_FOUND` | 404 | usuário autenticado sem canal |
| `VIDEO_CHANNEL_FORBIDDEN` | 403 | usuário não é dono do canal |
| `VIDEO_INVALID_STATE` | 409 | operação incompatível com o status (reconfirmar, cancelar após confirmar, excluir em `processing`) |
| `VIDEO_NOT_READY` | 409 | stream/download/thumbnail antes de `ready` |
| `VIDEO_UPLOAD_NOT_CONFIRMED` | 409 | confirmar sem objeto no storage |
| `VIDEO_INVALID_RANGE` | 416 | Range malformado ou fora dos limites (`Content-Range: bytes */total`) |
| `VALIDATION_ERROR` | 400 | DTO inválido ou id fora do formato UUID |

### Events / Messages (fila `video-processing`)

- **Producer:** API, no `confirmUpload`. Payload `{ videoId }`, `jobId = videoId` (idempotente),
  `attempts: 5`, backoff exponencial.
- **Consumer:** worker. Ao pegar o job: `uploaded → processing`; ao concluir: `→ ready`; ao
  falhar após retries: `→ failed`.

---

## Dependency Map

```
SI-03.1 (infra/config)
  ├─► SI-03.2 (entity/migration) ─┐
  ├─► SI-03.3 (storage) ──────────┼─► SI-03.4 (módulo) ─► SI-03.5 (streaming)
  └─► SI-03.6 (fila producer) ────┘        │
                                           └─► SI-03.7 (worker FFmpeg) ─► SI-03.8 (wiring/CLAUDE.md)
```

## Addendum — Upload multipart (até 10GB)

Um único `PutObject` pré-assinado é limitado a **5GB** no S3/MinIO; o brief pede **até 10GB**.
Por isso o `POST /videos` decide o modo de upload pelo tamanho declarado (`sizeBytes`) vs o
threshold (`S3_MULTIPART_THRESHOLD`, default 100MB):

- **single** (arquivo pequeno): resposta `{ video, upload: { type: 'single', url } }`; o cliente faz
  `PUT` na `url` e chama `POST /videos/:id/confirm`.
- **multipart** (arquivo grande): resposta `{ video, upload: { type: 'multipart', uploadId, partSize,
  parts: [{ partNumber, url }] } }`; o cliente sobe cada parte (`PUT` na url), coleta os `ETag` e
  chama `POST /videos/:id/multipart/complete { uploadId, parts }`. Para cancelar:
  `POST /videos/:id/multipart/abort { uploadId }`.

`StorageService` ganhou `createMultipartUpload`, `completeMultipartUpload`, `abortMultipartUpload`
e `needsMultipart`. Testado em `videos.service.spec.ts` (single vs multipart, complete, abort).

## Deliverables

- Módulo `src/videos/` (entity, dto, service, controller, module) + migration.
- `src/storage/` (StorageService S3/MinIO) e `src/queue/` (producer BullMQ).
- `worker/` (consumer FFmpeg) com Dockerfile.
- `compose.yaml` estendido (MinIO, Redis, worker).
- `CLAUDE.md` com a seção de vídeos.
- Artefatos desta fase: `context.md`, `validation.md` (clean), este plano, `progress.md`,
  `library-refs.md`.
