# CLAUDE.md

## Project Overview

StreamTube — a video sharing platform (YouTube-like). Users can upload, manage, and publish videos. Anonymous users can watch freely; social features (comments, subscriptions, likes) require authentication.

More info in the project overview: [docs/project-plan.md](docs/project-plan.md)

## Repository Structure

This is a monorepo with two main areas:

- `nestjs-project/` — Backend API (NestJS 11, TypeScript, Express). Contains modules for users, channels, videos, comments, etc.
- `docs/` — Project documentation, architecture diagrams, and planning.
- `next-frontend/` (Next.js) — not yet initialized

## Architecture (C4 Container Diagram)

See `docs/diagrams/software-arch.mermaid` for the full diagram. Key containers:

- **Frontend** (Next.js) → calls API via REST, streams from Object Storage
- **API** (Nest.js) → business rules, auth, reads/writes DB, uploads to storage, publishes jobs to queue, sends emails
- **Video Worker** (FFmpeg) → consumes jobs from queue, processes videos, updates DB and storage
- **Database** (PostgreSQL) → users, channels, videos, comments, likes
- **Object Storage** (S3/MinIO) → video files and thumbnails
- **Message Queue** (Redis/BullMQ) → video processing job queue
- **Email Service** (SMTP) → account confirmation and password recovery

## Módulo de Vídeos (Fase 03)

Ciclo completo de upload e processamento de vídeos. Ver
`docs/phases/phase-03-videos/phase-03-videos.md` e
`docs/decisions/technical-decisions-phase-03-videos.md`.

- **Storage**: MinIO/S3 via `src/storage/StorageService` (presigned upload/download, range reads).
  Upload direto ao storage por URL pré-assinada (não passa 10GB pela API).
- **Fila**: BullMQ/Redis — `src/queue/VideoQueueService.enqueue(videoId)` (idempotente, `jobId=videoId`).
- **Worker**: `worker/` (processo separado com FFmpeg) consome `video-processing`, gera thumbnail +
  MP4 H.264/AAC, atualiza o vídeo (`processing → ready|failed`).
- **Estados**: `uploading → uploaded → processing → ready | failed` (`src/videos/entities/video.entity.ts`).
- **Endpoints** (`src/videos/videos.controller.ts`, protegidos pelo JwtAuthGuard global; todas
  as rotas exigem ser dono do canal nesta fase): `POST /videos` (plano `single`/`multipart`),
  `POST /videos/:id/confirm`, `POST /videos/:id/multipart/{complete,abort}`, `DELETE /videos/:id`,
  `GET /videos`, `GET /videos/:id`, `GET /videos/:id/thumbnail`, `GET /videos/:id/stream`
  (Range→206/416), `GET /videos/:id/download`. Respostas via `VideoResponseDto` (sem chaves do
  storage). URL curta única em `video.slug` (`slug.util.ts`).
- **Presign**: `S3_PUBLIC_ENDPOINT` assina as URLs entregues ao cliente; `S3_ENDPOINT` é o
  endpoint interno usado pela API.
- **Erros**: catálogo `VIDEO_*` (`src/videos/video.exceptions.ts`) via `DomainException` + filtro global.
- **Infra**: `nestjs-project/compose.yaml` sobe db, mailpit, `redis`, `minio` (+ `createbuckets`) e `worker`.

Fluxo: registrar → `PUT` no `uploadUrl` → confirmar → worker processa → `GET /stream`.

## Gerenciamento de Vídeos e Canal (Fase 04)

Ver `docs/decisions/technical-decisions-phase-04-management.md` e `docs/phases/phase-04-management/`.

- **Categorias**: `src/categories/` (tabela fixa semeada pela migration `CreateCategories`; `GET /categories` público).
- **Vídeo**: `category_id`, `visibility` (`public|unlisted`), `published_at` (null = rascunho; publicar exige
  `ready`), `custom_thumbnail_key` (prevalece sobre a gerada), `views_count`. Endpoints: `PATCH /videos/:id`,
  `POST /videos/:id/{publish,unpublish}`, `POST /videos/:id/thumbnail` (+ `/confirm`, `DELETE`),
  `GET /videos?page&limit&status&published` (painel paginado).
- **Canal**: `src/channels/channels.controller.ts` — `GET/PATCH /channels/me` (nickname único, `me` reservado),
  `GET /channels/:nickname` público; listagem pública em `src/videos/channel-videos.controller.ts`
  (`GET /channels/:nickname/videos`, só público + publicado + ready).
- **Auth opcional**: em rotas `@Public()` o `JwtAuthGuard` tenta ler o Bearer sem exigir (`request.user` fica
  `undefined` para anônimos). `GET /videos/:id/thumbnail` usa isso (público para publicados, dono vê rascunhos).
- **Frontend**: `/studio` (painel), `/studio/videos/[id]`, `/studio/channel`, `/c/[nickname]` (público);
  BFF em `app/api/{categories,channels,videos}/**` com `withAuth`/`withOptionalAuth` (`lib/api/authorized.ts`).

## Página de Visualização (Fase 05)

Ver `docs/decisions/technical-decisions-phase-05-watch.md` e `docs/phases/phase-05-watch/`.

- **Visibilidade**: `VideosService.getViewable(userId|null, id)` = dono **ou** publicado (`published_at` + `ready`);
  não visível → 404 (não revela). `readyKey`, `thumbnailKey`, `getViewableBySlug` usam essa regra.
- **Endpoints públicos** (`@Public()` + auth opcional): `GET /videos/slug/:slug`, `GET /videos/:id/{stream,download,thumbnail}`,
  `POST /videos/:id/views` (incremento atômico), `GET /videos/:id/related?limit` (mesma categoria, fallback recentes).
- **Frontend**: `/watch/[slug]` (RSC pública) com `VideoPlayer` (proxy BFF com Range), `ViewTracker` (1 POST no
  primeiro `play`), `WatchDescription` (expandir/recolher), `RelatedVideosList`; BFF `app/api/videos/slug/[slug]`,
  `app/api/videos/[id]/{related,views}`; stream/download/thumbnail do BFF usam `withOptionalAuth`.
- **MSW**: o dev server carrega os handlers só no boot (`instrumentation.ts`) — reinicie-o após mudar `mocks/`.

## Interações Sociais (Fase 06)

Ver `docs/decisions/technical-decisions-phase-06-social.md` e `docs/phases/phase-06-social/`.

- Módulos `src/reactions` (vídeo/comentário, upsert idempotente), `src/comments` (1 nível de resposta,
  exclusão lógica, autor = canal `{id, nickname, name}`), `src/subscriptions` (sem auto-inscrição) e
  `src/social` (agregados `GET /social/videos/:id` e `GET /social/videos?ids=`; evita ciclo com `VideosModule`).
- Interações exigem vídeo visível (`getViewable`); leituras são públicas com auth opcional.
- Frontend: `components/social/{reaction-bar,comments-section,subscribe-button}.tsx`, página `/subscriptions`,
  BFF `app/api/{videos/[id]/{reaction,comments},comments/[id]/**,channels/by-id/[id]/subscription,me/subscriptions,social/videos/[id]}`.

## Docker Networking

This project runs entirely in Docker containers. When configuring connections between services (database, cache, queue, etc.), **always use the Docker Compose service name** as the host — never `localhost` or `127.0.0.1`.

Inside a container, `localhost` refers to the container itself, not the host machine or other containers. Services communicate through the Docker Compose network using their service names (e.g., `db`, `nestjs-api`).

- **Correct:** `DB_HOST=db` (the Compose service name)
- **Wrong:** `DB_HOST=localhost`

This applies to all environment variables, configuration files, and code that references service hosts.

## Working Principles

- **Single Responsibility:** each module, service, and function should have a clear, focused responsibility. Re-evaluate adherence at every step — when a module starts owning logic or entities that are not its own (e.g., a service creating an entity from another domain), extract it immediately into the proper module instead of deferring to a later corrective task.
- **Type Safety:** Strict TypeScript usage across all layers.
- **Testing:** Strong emphasis on pyramid testing at all levels to ensure reliability and maintainability.
- **Code Quality:** Use ESLint and Prettier for consistent code style. Code reviews should focus on readability, maintainability, and adherence to best practices.
- **Documentation:** Comprehensive docs for architecture, setup, and troubleshooting in `docs/`.

## Definition of Done (Technical)

A change is only considered complete when **all** of the following pass:

1. The relevant test suite passes (unit + integration + e2e affected by the change).
2. The full test suite passes before finishing the task.
3. TypeScript compiles cleanly: `npx tsc --noEmit` exits with code 0. Compilation errors must never be left as debt for future tasks.
4. Lint passes: `npm run lint`.

If any of these fails, the task is not done — fix the underlying issue before declaring completion.


## Git Conventions

- **Main branch:** `main` — never commit directly to it
- Branches: `feature/*`, `bugfix/*`, `hotfix/*`, `docs/*`
- **Commits:** short, descriptive messages focused on the "why" of the change
- **Workflow:** Git Flow conventions. Two long-lived branches:
  - `main` — stable, production-ready code 
  - `dev` — integration branch; all feature/bugfix/hotfix branches start from `dev` and merge back into `dev`
  - When `dev` is stable, it is merged into `main`

## Testing Policy

Every change must be tested. During development, run only the tests related to the modified code. Before finishing, always run the full test suite to ensure nothing is broken.

## Scope Limits

- Work on **one feature, fix, or refactoring at a time** — do not mix scopes
- Do not include cosmetic changes (formatting, renaming) alongside functional changes
- If something out of scope comes up during work, note it as a separate task instead of acting on it
- Focus on the defined scope for each task to ensure clarity and maintainability of the codebase.
- If you identify a necessary change that is out of scope, create a new issue or task for it instead of including it in the current work.

## Agent Skill Usage

When working on any task (planning, implementing, debugging, refactoring, 
reviewing, etc.), decompose the request into its underlying subtasks and 
concerns, then identify which available skills match any of them and activate 
those skills.

## Library Documentation Lookup

Before implementing any feature, you MUST use the **context7** MCP tool to look up the relevant library APIs and official documentation.

Always:

- Check the installed library version in the project manifest
- Retrieve the corresponding documentation using context7
- Cross-reference APIs to avoid deprecated or incompatible patterns
- Follow the official documentation over training data

Skip documentation lookup only for trivial operations such as:

- Variable declarations
- Basic control flow
- Simple CRUD using established project patterns

If a library is involved and there is uncertainty, documentation lookup is mandatory.
If the documentation returned does not match the installed version, flag the discrepancy before proceeding.