---
kind: phase
name: phase-03-videos
sources_mtime:
  docs/project-plan.md: "2026-09-04T14:17:17-03:00"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-09-11T23:06:26-03:00"
  docs/decisions/technical-decisions-phase-02-auth.md: "2026-09-04T14:17:17-03:00"
  docs/phases/phase-02-auth/phase-02-auth.md: "2026-09-04T14:17:17-03:00"
---

# phase-03-videos — Context

## Scope

Implementar **Upload e Processamento de Vídeos** no StreamTube: enviar arquivos de até 10GB sem
trafegá-los pela API, processá-los de forma assíncrona (duração, metadados e thumbnail), e
disponibilizá-los por uma URL única para **streaming** e **download**. Os vídeos pertencem a um
**canal** (1 canal por usuário, criado no cadastro — Fase 02).

_Subprojects in scope:_

- `nestjs-project/` — módulo `videos/`, `storage/` e `queue/`; migration da tabela `videos`; infra
  nova no `compose.yaml`.
- `worker/` — projeto novo: consumidor da fila com FFmpeg.
- `next-frontend/` — fora do escopo desta fase (a fatia de UI é tratada em
  `docs/phases/phase-03-videos-frontend/`).

### O que já existe (Fases 01–02)

- Backend **NestJS 11 + TypeORM + PostgreSQL 17** em `nestjs-project/`.
- Módulos `auth/`, `users/`, `channels/`, `mail/`, `common/`, `config/`, `database/`, `swagger/`.
- Guard JWT global, `DomainException` + filtro de exceções, `ValidationPipe` global, rate limiting,
  migrations versionadas e seeds.
- Infra atual (`compose.yaml`): API, PostgreSQL e Mailpit.

### O que esta fase adiciona

- Entidade/tabela **Video** ligada ao canal, e o módulo `videos/`.
- **Object storage** (MinIO) e `StorageService` (presigned URLs, leitura por range).
- **Fila** (BullMQ/Redis) e **worker** de processamento (FFmpeg).
- Endpoints de registro/confirmação de upload, streaming por Range e download.
- Infra nova no `compose.yaml`: `minio`, `createbuckets`, `redis` e `worker`.

## Decisions Index

| Ref | Source | Scope | Topic | Status | Decision | Libraries |
|-----|--------|-------|-------|--------|----------|-----------|
| phase-03-videos/TD-03.1 | technical-decisions-phase-03-videos.md | Backend + Infra | Implementação do Object Storage | decided | A (MinIO + AWS SDK v3) | @aws-sdk/client-s3@^3.700.0, @aws-sdk/s3-request-presigner@^3.700.0 |
| phase-03-videos/TD-03.2 | technical-decisions-phase-03-videos.md | Backend | Estratégia de upload de até 10GB | decided | A (presigned PUT / multipart) | @aws-sdk/s3-request-presigner@^3.700.0 |
| phase-03-videos/TD-03.3 | technical-decisions-phase-03-videos.md | Backend + Infra | Tecnologia de fila de processamento | decided | A (BullMQ + Redis) | bullmq@^5.34.0, @nestjs/bullmq@^11.0.1, ioredis@^5.4.1 |
| phase-03-videos/TD-03.4 | technical-decisions-phase-03-videos.md | Worker + Infra | Execução do worker e extração de metadados/thumbnail | decided | A (container separado + fluent-ffmpeg) | fluent-ffmpeg@^2.1.3, @aws-sdk/lib-storage@^3.1127.0, pg@^8.13.0 |
| phase-03-videos/TD-03.5 | technical-decisions-phase-03-videos.md | Backend | Streaming e download | decided | A (stream) + B (download/thumbnail) | — |
| phase-03-videos/TD-03.6 | technical-decisions-phase-03-videos.md | Backend | Modelo de estados do vídeo | decided | A (enum de 5 estados) | — |
| phase-03-videos/TD-03.7 | technical-decisions-phase-03-videos.md | Backend | URL única por vídeo | decided | A (slug varchar(11) + índice único) | — |

## Capability Coverage

| Capability | Covered by |
|------------|------------|
| Serviço de armazenamento de arquivos (vídeos e thumbnails) | phase-03-videos/TD-03.1 |
| Serviço de processamento em segundo plano (filas) | phase-03-videos/TD-03.3 |
| Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance | phase-03-videos/TD-03.2, phase-03-videos/TD-03.1 |
| Pré-cadastro automático do vídeo como rascunho ao iniciar o upload | phase-03-videos/TD-03.2, phase-03-videos/TD-03.6 |
| Processamento automático do vídeo após upload (extração de duração e metadados) | phase-03-videos/TD-03.4, phase-03-videos/TD-03.3 |
| Geração automática de thumbnail a partir de um frame do vídeo | phase-03-videos/TD-03.4 |
| URL única por vídeo, sem conflito com outros vídeos | phase-03-videos/TD-03.7 |
| Reprodução via streaming (sem necessidade de download completo) | phase-03-videos/TD-03.5 |
| Download do vídeo pelo usuário | phase-03-videos/TD-03.5, phase-03-videos/TD-03.1 |

## Decisions Detail

### phase-03-videos/TD-03.1

**Recommendation:** MinIO com AWS SDK v3 — é a única opção que entrega presigned URLs, que são a
base da estratégia de upload da fase. O custo é um container; o retorno é paridade com produção.

**Libraries:** `@aws-sdk/client-s3@^3.700.0`, `@aws-sdk/s3-request-presigner@^3.700.0`

### phase-03-videos/TD-03.2

**Recommendation:** Presigned URL com multipart acima do limiar — é a única opção que mantém a API
fora do caminho dos bytes e a única que suporta 10GB de fato (o PUT único do S3 tem teto de 5GB).

**Note:** Obriga a separar `S3_ENDPOINT` (interno) de `S3_PUBLIC_ENDPOINT` (usado só para assinar o
que vai ao navegador) — a única exceção legítima à regra "nunca `localhost`" do CLAUDE.md.

**Libraries:** `@aws-sdk/s3-request-presigner@^3.700.0`

### phase-03-videos/TD-03.3

**Recommendation:** BullMQ sobre Redis — a deduplicação por `jobId` e o backoff exponencial nativos
resolvem, sem código extra, os dois riscos reais do fluxo (enfileiramento duplicado na confirmação e
falha transitória do FFmpeg). RabbitMQ é infra demais para um único tipo de job; pg-boss economiza
um container ao custo de acoplar processamento pesado ao banco transacional.

**Libraries:** `bullmq@^5.34.0`, `@nestjs/bullmq@^11.0.1`, `ioredis@^5.4.1`

### phase-03-videos/TD-03.4

**Recommendation:** Container separado com `fluent-ffmpeg` — isolar CPU é a razão de existir da
fila; consumi-la dentro do processo da API desfaria metade do ganho.

**Libraries:** `fluent-ffmpeg@^2.1.3`, `@aws-sdk/lib-storage@^3.1127.0`, `pg@^8.13.0`

### phase-03-videos/TD-03.5

**Recommendation:** Range/206 na API para streaming, redirect presigned para download — o streaming
precisa reavaliar autorização a cada requisição, então vale pagar o proxy; o download é um evento
único de um arquivo inteiro, onde o redirect evita ocupar a API por minutos.

**Libraries:** —

### phase-03-videos/TD-03.6

**Recommendation:** Cinco estados (`uploading → uploaded → processing → ready | failed`) — a
separação `uploading`/`uploaded` é o que torna o enfileiramento confiável, e a transição condicional
em SQL é o que impede processamento duplicado.

**Libraries:** —

### phase-03-videos/TD-03.7

**Recommendation:** Slug aleatório com índice único — resolve o requisito literal ("sem conflito com
outros vídeos") no nível do banco, e não no nível da esperança.

**Libraries:** —

## Inherited Conventions

Herdadas das Fases 01–02 e aplicadas sem alteração nesta fase:

- **Config:** `registerAs` em `src/config/*.config.ts`, validada com Joi em `env.validation.ts`.
- **Erros:** `DomainException` + `DomainExceptionFilter` global (`src/common/`); o catálogo `VIDEO_*`
  segue o mesmo contrato de resposta das Fases 01–02.
- **Auth:** `JwtAuthGuard` global; rotas públicas marcadas com `@Public()`. O canal é resolvido do
  usuário autenticado pela relação 1:1 da Fase 02.
- **Persistência:** migrations TypeORM versionadas; repositório injetado via
  `TypeOrmModule.forFeature`.
- **Docker:** todo serviço é alcançado pelo nome do serviço do Compose, nunca `localhost`
  (exceção documentada em TD-03.2).
- **Testes:** `*.spec.ts` (unit), `*.integration-spec.ts` (banco/serviços reais), `*.e2e-spec.ts`
  (supertest).

## Non-UI / Deferred Capabilities

- **Telas de upload, lista de vídeos e player:** diferidas para a fatia de frontend da fase,
  documentada em `docs/phases/phase-03-videos-frontend/`.
- **Metadados além de duração e tamanho:** `ffprobe` extrai resolução e codec, mas a fase persiste
  apenas `duration_sec` e `size_bytes`; não há coluna `metadata` genérica.
- **Qualidade adaptativa (HLS/DASH):** descartada em TD-03.5, fora do escopo do plano do projeto.

## Testing Requirements

- **Unit:** parsing de `Range`, geração/colisão de slug, plano de upload (single vs. multipart),
  transições de estado, montagem das opções do job.
- **Integração (infra real do Compose, sem mock):** `StorageService` contra o MinIO, producer contra
  o Redis (incluindo idempotência por `jobId`), repositório e migrations contra o Postgres.
- **E2E (supertest):** fluxo registrar → confirmar → enfileirar; `200` sem `Range` e `206` com
  `Range` byte a byte; `416` em faixa inválida; `302` em download/thumbnail; matriz de autorização
  (dono vs. terceiro) e multipart complete/abort.
- **Worker (Vitest):** pipeline de processamento com dublês de storage/repo, e integração com FFmpeg
  real na imagem `--target test`.

## Referências

- Decisões: `docs/decisions/technical-decisions-phase-03-videos.md`.
- Arquitetura-alvo: `docs/diagrams/software-arch.mermaid` (storage + fila + worker previstos).
- Formato de fase: `docs/phases/phase-02-auth/phase-02-auth.md`.
