# StreamTube — Fase 03: Upload e Processamento de Vídeos

Fork da base **`mba-ia-greenfield-project`** (NestJS 11 + TypeORM + PostgreSQL, com as Fases 01–02
completas: auth JWT, users, channels, mail) com a **Fase 03** implementada por cima.

> **Status:** Fase 03 **fechada** — backend endurecido, worker resiliente, frontend
> (upload/lista/player), testes em todas as camadas, CI completa e validação funcional local
> automatizada (`scripts/smoke-videos.sh`, `scripts/browser-validation.mjs`). Histórico e roadmap
> das Fases 04–07 em [`docs/evolution-plan.md`](docs/evolution-plan.md).
>
> Os números abaixo são a medição da suíte **no estado atual do repositório**, que já inclui as
> Fases 04–07 construídas sobre esta.

## Estado da entrega (verificado)

- ✅ **`npx tsc --noEmit`** sai com código 0 (API e worker).
- ✅ **`npm run build`** (nest build) passa.
- ✅ **Lint** (eslint + prettier `--check`) limpo.
- ✅ **Testes da API:** 283 unit+integração em 42 suítes (`npm test`) e 101 e2e em 9 suítes
  (`npm run test:e2e`), todos verdes. Os testes de integração e e2e rodam contra a infra real do
  Compose (Postgres, Redis, MinIO) — storage, fila e worker não são mockados.
- ✅ **Testes do worker:** 17 (Vitest) — 13 rodam em qualquer ambiente e 4 são de integração com
  FFmpeg real, executados na imagem `--target test` (pulados quando não há FFmpeg no host).
- ✅ **Frontend:** 169 testes Vitest em 49 suítes, mais os specs Playwright (a fatia de UI da fase
  está documentada em `docs/phases/phase-03-videos-frontend/`).
- ✅ **Presign alcançável pelo cliente:** `S3_PUBLIC_ENDPOINT` assina as URLs entregues ao
  navegador, enquanto `S3_ENDPOINT` (`http://minio:9000`) é o endpoint interno usado pela API.
- ✅ **Validação funcional local** automatizada: `scripts/smoke-videos.sh` e
  `scripts/browser-validation.mjs` (registrar → PUT presigned → confirmar → worker → stream 206).
- Execução de ponta a ponta requer `docker compose up -d --build` (db, mailpit, redis, minio,
  createbuckets, worker e api) — o FFmpeg já vem provisionado na imagem do worker.

## Artefatos de planejamento (contrato da fase)

- `docs/decisions/technical-decisions-phase-03-videos.md`
- `docs/phases/phase-03-videos/{context.md, validation.md (clean), phase-03-videos.md, progress.md, library-refs.md}`

## Código adicionado

```
nestjs-project/src/
├── config/{storage,queue}.config.ts
├── videos/                          # módulo de vídeos (integrado à base real)
│   ├── entities/video.entity.ts     # entidade + enum + FK → channels
│   ├── dto/create-video.dto.ts
│   ├── video.exceptions.ts          # VIDEO_* (estende DomainException da base)
│   ├── videos.service.ts / .controller.ts / .module.ts
│   ├── videos.service.spec.ts       # 10 testes unitários
│   └── videos.controller.spec.ts    # 4 testes unitários
├── storage/                        # StorageService (MinIO/S3) + módulo
├── queue/                          # producer BullMQ
└── database/migrations/1780000000000-CreateVideosTable.ts
worker/                             # consumer FFmpeg (processo separado)
nestjs-project/compose.yaml         # + redis, minio, createbuckets, worker
CLAUDE.md                           # + seção "Módulo de Vídeos (Fase 03)"
```

Integração com a base (padrões reais reutilizados):
- **Auth**: `JwtAuthGuard` global + `@CurrentUser()` → o canal é resolvido do usuário (relação 1:1
  user↔channel de `src/channels`).
- **Erros**: `DomainException` de `src/common/exceptions` + `DomainExceptionFilter` global.
- **Config**: padrão `registerAs` + Joi (`env.validation.ts`); migrations TypeORM versionadas.

## Como rodar

```bash
# 1. dependências (já instaladas neste fork; para reinstalar:)
cd nestjs-project && npm install
cd ../worker && npm install && cd ..

# 2. subir infra + API + worker
cd nestjs-project
cp .env.example .env
docker compose up -d --build

# 3. migrations
npm run migration:run
```

## Fluxo de ponta a ponta

1. **Registrar** — `POST /videos` `{ "title": "Meu vídeo", "sizeBytes": 123456 }` (Bearer JWT) →
   `{ video, upload }`, onde `upload` é `{ type: 'single', url }` (até 100MB) ou
   `{ type: 'multipart', uploadId, partSize, parts: [{ partNumber, url }] }`.
2. **Enviar** — `PUT` do arquivo direto na `url` (single) ou de cada parte nas `parts[].url`
   (multipart), guardando os `ETag`.
3. **Confirmar** — `POST /videos/:id/confirm` (single) ou
   `POST /videos/:id/multipart/complete { uploadId, parts: [{ partNumber, etag }] }` (multipart)
   → status `uploaded`, enfileira o job. Cancelar multipart: `POST /videos/:id/multipart/abort`.
4. **Processar** — o `worker` gera thumbnail + MP4 H.264/AAC → status `ready`.
5. **Assistir** — `GET /videos/:id/stream` (header `Range` → `206 Partial Content`).
6. **Baixar** — `GET /videos/:id/download`.
