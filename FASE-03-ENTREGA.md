# StreamTube — Fase 03: Upload e Processamento de Vídeos

Fork da base **`mba-ia-greenfield-project`** (NestJS 11 + TypeORM + PostgreSQL, com as Fases 01–02
completas: auth JWT, users, channels, mail) com a **Fase 03** implementada por cima.

## Estado da entrega (verificado)

- ✅ **`npx tsc --noEmit`** passa limpo (o módulo de vídeos + storage + fila compilam com a base real).
- ✅ **`npm run build`** (nest build) passa.
- ✅ **Lint** (eslint/prettier) limpo nos arquivos da fase.
- ✅ **Testes** do módulo de vídeos: `npx jest src/videos` → 7/7 passam.
- ✅ **Worker** (`worker/`) compila (`tsc --noEmit`).
- Execução real de ponta a ponta requer apenas `docker compose up` (db + redis + minio + worker) —
  o processamento de vídeo usa FFmpeg (já provisionado na imagem do worker).

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
│   └── videos.service.spec.ts       # 7 testes unitários
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

1. **Registrar** — `POST /videos` `{ "title": "Meu vídeo" }` (Bearer JWT) → `{ video, uploadUrl }`.
2. **Enviar** — `PUT` do arquivo direto no `uploadUrl` (MinIO).
3. **Confirmar** — `POST /videos/:id/confirm` → status `uploaded`, enfileira o job.
4. **Processar** — o `worker` gera thumbnail + MP4 H.264/AAC → status `ready`.
5. **Assistir** — `GET /videos/:id/stream` (header `Range` → `206 Partial Content`).
6. **Baixar** — `GET /videos/:id/download`.
