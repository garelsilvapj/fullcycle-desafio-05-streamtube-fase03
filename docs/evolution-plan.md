# StreamTube — Análise do projeto e plano de evolução

> Documento vivo. Gerado em 2026-09-04 a partir de uma auditoria do código, dos testes, da CI e dos
> documentos de planejamento. Parte A descreve o estado real; Parte B é o contrato de evolução.
> Atualize o status das etapas em `docs/phases/*/progress.md` e a tabela de fases do `README.md`.

## Contexto

Este documento responde a duas perguntas: (1) qual é o objetivo do projeto, seu plano de
desenvolvimento, suas funcionalidades e seu status real; (2) como evoluir tudo que ainda não foi
implementado, com testes em todos os níveis, validação funcional com a aplicação rodando localmente
e o processo de engenharia de software a seguir.

Decisões de escopo deste plano:
- Fase 03 planejada em nível de tarefas executáveis; Fases 04–07 como roadmap.
- O frontend de vídeos (upload, lista, player básico) entra como fatia `phase-03-videos-frontend`, no modelo da Fase 02 (backend + frontend).
- Branch única `master` com commits pequenos por tarefa (sem Git Flow por ora).
- O plano vive em `docs/evolution-plan.md`; os documentos com status desatualizado foram corrigidos na Etapa 0.

---

## Parte A — Análise do projeto

### A.1 Objetivo

StreamTube é uma plataforma de compartilhamento de vídeos (YouTube-like) do MBA Full Cycle "Engenharia de Software com IA". Usuários cadastrados fazem upload (até 10GB), gerenciam e publicam vídeos; anônimos assistem; likes, comentários e inscrições exigem login. Além do produto, o repositório é um laboratório de **desenvolvimento assistido por IA**: possui uma "fundação de IA" própria (`.claude/skills`, `.claude/rules`, `.claude/agents`) com um pipeline de planejamento formal (`/research → /plan-context → /plan-validate → /plan-resolve → /plan-build → /plan-test-specs → /implement`) que produz artefatos em `docs/decisions`, `docs/phases`, `docs/tasks`, `docs/inventories`.

Fonte: `docs/project-plan.md`, `README.md`, `.claude/skills/plan-pipeline/SKILL.md`.

### A.2 Plano de desenvolvimento (7 fases)

| Fase | Escopo | Depende de |
|---|---|---|
| 01 | Configuração base (monorepo, Docker, NestJS, PostgreSQL, fundação de IA) | — |
| 02 | Cadastro, confirmação por e-mail, login/refresh/logout, recuperação de senha, canal automático | 01 |
| 03 | Storage, fila, upload até 10GB, pré-cadastro como rascunho, processamento (duração/metadados), thumbnail automática, URL única, streaming, download | 01, 02 |
| 04 | Categorias, edição de vídeo (título/descrição/categoria/thumbnail custom), visibilidade público/unlisted, rascunho → publicação, painel do canal, edição do canal, página pública do canal | 02, 03 |
| 05 | Página de visualização: player, layout, descrição expansível, contagem de views, sugestões por categoria, acesso anônimo, download, unlisted só por link | 03, 04 |
| 06 | Likes/dislikes (vídeos e comentários), comentários com respostas, inscrições, canais seguidos, contagem de inscritos | 02, 05 |
| 07 | Home com grid, filtro por categoria, busca (título/canal), header/navbar, paginação/scroll infinito, responsividade, testes dos fluxos principais, produção/deploy | todas |

### A.3 Funcionalidades implementadas

**Fase 01 — concluída.** Monorepo, `nestjs-project/compose.yaml` (db, mailpit, redis, minio, createbuckets, worker, nestjs-api), migrations TypeORM, config `registerAs` + Joi, Swagger opcional, exportação de `openapi.json`, fundação de IA (skills/rules/agents), design system documentado (`docs/design-system-*.md`, `.fig`).

**Fase 02 — concluída (backend + frontend).**
- Backend: `POST /auth/register|login|refresh|logout|resend-confirmation|forgot-password|reset-password`, `GET /auth/confirm-email`, `GET /auth/me`. Argon2, JWT + refresh token rotation com família e grace period, `JwtAuthGuard` global com `@Public()`, `ThrottlerGuard`, `DomainException` + filtros globais, Mailer com Handlebars. Testes: 78 unitários, 80 integração, 52 e2e.
- Frontend: `/signup`, `/login`, `/forgot-password` (RHF + Zod, shadcn, tokens em `globals.css`), BFF `app/api/auth/{signup,login,logout,forgot-password}`, sessão iron-session, refresh single-flight (`lib/auth/refresh.ts`, ainda sem chamadores), MSW + Vitest (17 arquivos) + Playwright (3 specs, 9 cenários).

**Fase 03 — backend/worker implementados, não fechada.**
- `src/videos`: `POST /videos` (single ou multipart por `sizeBytes` vs threshold 100MB), `POST /videos/:id/confirm`, `POST /videos/:id/multipart/complete|abort`, `GET /videos` (meus), `GET /videos/:id`, `GET /videos/:id/stream` (Range → 206), `GET /videos/:id/download` (302 presigned). Entidade `Video` com estados `uploading → uploaded → processing → ready|failed`, migration `1780000000000-CreateVideosTable`, catálogo `VIDEO_*`.
- `src/storage/StorageService` (presigned PUT/GET, HEAD, range, multipart create/complete/abort), `src/queue/VideoQueueService.enqueue` (`jobId=videoId`, 5 tentativas, backoff exponencial).
- `worker/src/index.ts`: consumer BullMQ, `pg` cru, download do original, ffprobe (duração), thumbnail (`screenshots`), transcode H.264/AAC `+faststart`, upload dos artefatos, `ready|failed`.
- Testes: 14 unitários (`videos.service.spec.ts` 10, `videos.controller.spec.ts` 4). CI mínima (`.github/workflows/ci.yml`: tsc/build/lint/`jest src/videos`; worker só tsc).

**Fases 04–07 — não iniciadas.** Nenhum código de categorias, visibilidade, views, likes, comentários, inscrições, busca ou home. `next-frontend/app/page.tsx` ainda é o template do create-next-app.

### A.4 Status real e lacunas encontradas (verificado no código)

**Documentação desatualizada**
- `README.md:198` marca Fase 03 como "Planejada" e `README.md:48-50` marca worker/storage/fila como "planejado".
- `FASE-03-ENTREGA.md:11` diz "7/7 testes" (são 14) e `:64` descreve resposta `{ video, uploadUrl }` (o código retorna `{ video, upload: {...} }`).
- `nestjs-project/CLAUDE.md:34-36` lista apenas `nestjs-api` e `db`; `:87-94` afirma que `test:e2e` já roda com `--runInBand` (não roda).
- `docs/diagrams/software-arch.mermaid:13` fila ainda "TBD"; diagrama mostra frontend → storage direto e anônimos assistindo, o que diverge da implementação atual.
- `docs/decisions/technical-decisions-phase-03-videos.md:27` typo mojibake ("retمy").
- `nestjs-project/openapi.json` não contém `/videos` (0 ocorrências) → `next-frontend/lib/api/types.gen.ts` não conhece vídeos.
- `.github/workflows/openapi-freshness.yml` é citado em `next-frontend/CLAUDE.md:127` e `.claude/rules/next-frontend-bff-api.md`, mas não existe.
- `docs/phases/phase-02-auth-frontend/phase-02-auth-frontend.md` Deliverables todos `[ ]` apesar de `progress.md` 24/24; `docs/tasks/task-next-frontend-config-base/progress.md` header `in_progress` com 2/2.

**Higiene do repositório**
- `worker/worker/` é cópia antiga e quebrada (colunas camelCase inexistentes, sem `try/finally`), não referenciada por nada, mas copiada para a imagem pelo `COPY . .` (não há `.dockerignore`).
- `.gitignore` raiz não ignora `.next/`, `playwright-report/`, `test-results/` (`next-frontend/playwright-report/index.html` e `test-results/.last-run.json` estão commitados). `.mcp.json` real commitado ao lado do `.example`.
- `nestjs-project/README.md` e `next-frontend/README.md` são boilerplate.

**Backend — Fase 03 (`src/videos`, `src/storage`, `src/queue`)**
- `GET /videos/:id`, `/stream`, `/download` sem checagem de dono e sem `@Public()`: qualquer autenticado acessa qualquer vídeo, inclusive `original_key`, `processed_key`, `error` (entidade crua serializada; não há response DTO). `videos.controller.ts:68-121`.
- `POST /videos` grava a linha antes de pré-assinar; se o presign falhar fica órfão `uploading` (`videos.service.ts:53-63`).
- `confirm`/`complete` sem guarda de estado: vídeo `ready` pode ser reconfirmado e reenfileirado (`videos.service.ts:98-106`; `removeOnComplete: true` remove a proteção do `jobId`).
- `abortMultipart` deixa a linha em `uploading` para sempre (`videos.service.ts:89-96`). Não existe `DELETE /videos/:id` (a Authorization Matrix do plano prevê "excluir").
- `size_bytes` é o tamanho do original; o worker nunca grava o tamanho do MP4 processado → `Content-Range`/`Content-Length` do stream ficam errados; resposta 200 sem Range não envia `Content-Length`/`Accept-Ranges` (`videos.controller.ts:88-98`).
- Limite de 10GB não é imposto (`CreateVideoDto.sizeBytes` sem `@Max`); `CompleteMultipartDto.parts` sem validação aninhada; `abort` usa `@Body('uploadId')` sem DTO.
- `StorageService.head` engole qualquer erro em `catch {}` (`storage.service.ts:71-79`), confundindo falha de rede/credencial com "objeto ausente".
- `S3_MULTIPART_THRESHOLD`/`S3_MULTIPART_PART_SIZE` lidos pela config mas ausentes do Joi e do `.env.example`; `APP_URL`, `SWAGGER_ENABLED` também ausentes do `.env.example`.
- Presigned URLs são assinadas com `S3_ENDPOINT=http://minio:9000`, inacessível de fora da rede Docker → **o fluxo de ponta a ponta não funciona do host/navegador** sem um endpoint público de assinatura.
- Controller sem `@ApiOperation`/`@ApiResponse`; `@ApiBearerAuth()` sem o nome `access-token` (viola `.claude/rules/nestjs-controllers.md`).
- `queue.config.ts.videoQueue` duplica a constante `VIDEO_QUEUE` e nunca é lido.
- Não há `slug`/URL curta: a "URL única" é o UUID.
- `test:e2e` sem `--runInBand`; `cleanAllTables` não limpa `videos` (FK quebra qualquer e2e futuro); `create-test-data-source.ts:19` lê `DB_DATABASE` (o app usa `DB_NAME`); `migrations.integration-spec.ts` só cobre 2 migrations.
- Zero testes para storage, queue, entidade/migration de vídeos; zero integração e zero e2e de vídeos; `listMine`, `get`, `download`, `stream` (toda a lógica de Range) sem teste.
- Seeds vazios (`seed.ts`); `api.http` sem requisições de vídeo.

**Worker (`worker/src/index.ts`)**
- Abre/fecha uma conexão `pg` por operação (3+ por job); sem `Pool`.
- Marca `failed` em **toda** tentativa (não só na última) e não valida a transição `uploaded → processing`.
- `probeDuration` engole erros (retorna 0). Sem `concurrency`/`lockDuration` (transcode longo > 30s pode ser reentregue como stalled). Sem handlers `failed/error/stalled`, sem shutdown gracioso (SIGTERM), sem logs estruturados.
- Upload dos artefatos por `PutObject` único (limite 5GB), não grava `size_bytes` do processado.
- Dockerfile roda `ts-node` em produção, `npm install` sem lockfile, sem `.dockerignore`, sem `tini`, sem `USER`.
- Sem nenhum teste; `compose.yaml` sem `restart:` para o worker.

**CI**
- Roda apenas 14 dos 210 testes do backend; nada de integração/e2e (sem serviços); testes não passam pelo lint; frontend sem job; worker só typecheck.

**Frontend**
- Nada de vídeos: sem BFF `/api/videos*`, sem handlers MSW de vídeos, sem factories, sem telas. `/` é boilerplate; sem header/navegação/logout na UI (`app/api/auth/logout` sem chamadores). `console.log` esquecido em `app/api/auth/login/route.ts:13`; `userId`/`channelSlug` hardcoded como `""` (`:26-28`). CTA de 403 aponta para `/resend-confirmation` inexistente. Não existe `next-frontend/.env.example` no disco (gitignored por `.env*`), embora `lib/env.ts` exija `API_URL` e `SESSION_PASSWORD`.

---

## Parte B — Plano de evolução

### B.0 Processo de engenharia (aplicado a toda tarefa)

Ciclo por tarefa/SI, alinhado ao pipeline do projeto e ao Definition of Done do `CLAUDE.md`:

1. **Decidir**: se a tarefa introduz escolha técnica nova → `/research` ou `/decide` registra TD em `docs/decisions/`. Consultar docs oficiais via context7 para qualquer lib envolvida.
2. **Planejar**: para fatias novas (frontend F03, fases 04–07) usar `/screen-inventory` (telas do Figma) → `/plan-context` → `/plan-validate` (até `clean`) → `/plan-build` → `/plan-test-specs`. Para tarefas de hardening desta lista, o próprio `docs/evolution-plan.md` é o contrato.
3. **Implementar** SI a SI com `/implement`, testes escritos junto do código, na camada certa (unit `*.spec.ts` sem I/O; integração `*.integration-spec.ts` com DB real; e2e `*.e2e-spec.ts` em `test/` via supertest; frontend `*.test.tsx` / `*.integration.test.ts` com MSW / `*.e2e-spec.ts` Playwright). Referência: skills `testing-guide-nestjs-project` e `testing-guide-next-frontend`.
4. **DoD técnico** antes de encerrar: `npx tsc --noEmit` = 0, `npm run lint` = 0, suíte afetada e suíte completa verdes (`npm test -- --runInBand`, `npm run test:e2e`), tudo dentro do container.
5. **Validação funcional local** com a aplicação rodando (roteiro B.5) sempre que a tarefa altera comportamento de runtime.
6. **Revisão**: `/code-review` no diff; `/security-review` em tarefas de auth, upload, streaming e acesso público.
7. **Documentar**: `progress.md` da fase, `openapi.json` regenerado e sincronizado (`scripts/sync-openapi.sh` + `npm run openapi:types`) no mesmo commit, README/CLAUDE.md quando o comportamento observável muda.
8. **Commit** pequeno e focado em `master`, mensagem no "porquê", um escopo por commit; CI verde é o portão.

### B.1 Etapa 0 — Verdade do repositório e higiene (S)

Objetivo: fazer os documentos e o repositório refletirem o estado real antes de evoluir.

- Gravar este plano em `docs/evolution-plan.md` (Parte A resumida + Parte B).
- `README.md`: Fase 03 → "🔧 Em andamento (backend/worker prontos; fechamento em curso)"; remover "(planejado)" de worker/storage/fila; documentar redis/minio/worker na seção de serviços e os comandos de vídeo.
- `FASE-03-ENTREGA.md`: 14 testes; resposta `{ video, upload }`; apontar para `docs/evolution-plan.md`.
- `nestjs-project/CLAUDE.md`: serviços redis/minio/mailpit/worker e verificação de prontidão (`redis-cli ping`, `mc ready`); corrigir a afirmação sobre `runInBand` (após B.3 passar a ser verdadeira).
- `docs/diagrams/software-arch.mermaid`: fila = "Redis / BullMQ"; nota de que streaming passa pela API (Range) nesta fase.
- `docs/decisions/technical-decisions-phase-03-videos.md:27` typo; `docs/phases/phase-03-videos/progress.md` seção "Pendências" → "Fechamento" apontando para as etapas B.2–B.7.
- Corrigir status inconsistentes: Deliverables de `phase-02-auth-frontend.md`, header de `task-next-frontend-config-base/progress.md`.
- Remover `worker/worker/` (`git rm -r`). Criar `worker/.dockerignore` (`node_modules`, `dist`, `worker`).
- `.gitignore` raiz: `.next/`, `playwright-report/`, `test-results/`; `git rm --cached` dos artefatos de Playwright commitados. Avaliar `.mcp.json` (manter só o `.example` se contiver credenciais locais).
- Criar `next-frontend/.env.example` (com `API_URL` variantes Docker/host e `SESSION_PASSWORD`) e ajustar `next-frontend/.gitignore` para não ignorá-lo.

### B.2 Etapa 1 — Hardening do backend da Fase 03 (M)

Arquivos: `src/videos/*`, `src/storage/storage.service.ts`, `src/config/{storage.config,env.validation}.ts`, `.env.example`, nova migration.

| # | Tarefa | Detalhe |
|---|---|---|
| 1.1 | Endpoint público de assinatura | `S3_PUBLIC_ENDPOINT` (default `http://localhost:9000`) em `storage.config.ts` + Joi + `.env.example`; `StorageService` usa um segundo `S3Client` (endpoint público) apenas para `getSignedUrl`. Sem isso o upload do host/navegador não funciona. |
| 1.2 | Response DTO | `VideoResponseDto` (`id, title, description, status, durationSec, sizeBytes, thumbnailUrl?, error?, createdAt, updatedAt`) + `toResponse()` no service; nunca expor `*_key`. `error` só para o dono. |
| 1.3 | Autorização | `GET /videos/:id`, `/stream`, `/download` exigem dono (via `getOwned`) nesta fase; acesso público fica para Fase 05 (documentar na Authorization Matrix). |
| 1.4 | Máquina de estados no service | `confirm`/`complete` só de `uploading`; `abort` só de `uploading` e remove a linha (204); novo `DELETE /videos/:id` (dono; remove objetos do storage best-effort + linha; 204). Novos erros `VIDEO_INVALID_STATE` (409). |
| 1.5 | Registro atômico | Gerar plano de upload antes de `save`; em falha de presign, não persistir. |
| 1.6 | Validação | `sizeBytes` `@Max(10 * 1024^3)`; `CompletedPartDto` com `@ValidateNested`/`@Type`; `AbortMultipartDto`; constante `VIDEO_MAX_SIZE_BYTES` em `videos.constants.ts`. |
| 1.7 | Streaming correto | 200 sem Range envia `Content-Length` + `Accept-Ranges`; `total` vem de `size_bytes` gravado pelo worker (tamanho do processado, ver 2.3); `Range` além do fim → 416 com `Content-Range: bytes */total`. |
| 1.8 | Storage robusto | `head` só engole `NotFound`/404 e relança o resto; remover `queue.config.videoQueue` duplicado (usar `VIDEO_QUEUE`); validar `S3_MULTIPART_*` no Joi. |
| 1.9 | URL curta única | Migration `AddVideoSlug`: coluna `slug varchar(11) unique` gerada com `nanoid` (alfabeto URL-safe) em `register`, com retry em colisão (padrão SAVEPOINT de `typeorm-queries.md`). Exposta no DTO; usada nas rotas públicas da Fase 05. |
| 1.10 | OpenAPI | `@ApiOperation`/`@ApiResponse`/`@ApiBearerAuth('access-token')` em todos os handlers (espelhar `auth.controller.ts`); `npm run openapi:export` e commit do `openapi.json`; `openapi-export.integration-spec.ts` passa a exigir os paths `/videos*`. |
| 1.11 | `api.http` e seeds | Requisições de vídeo (registrar, confirmar, multipart, listar, stream com Range, download, delete). Seed opcional de usuário confirmado para dev. |

Testes desta etapa (unit): estender `videos.service.spec.ts` (estados, delete, slug, DTO), `videos.controller.spec.ts` (`get`, `listMine`, `download`, `stream` 200/206/416), novos `storage.service.spec.ts` (mock do `S3Client` com `aws-sdk-client-mock`), `video-queue.service.spec.ts` (mock `Queue`), `storage.module.spec.ts`, `queue.module.spec.ts`, `videos.module.spec.ts`.

### B.3 Etapa 2 — Worker resiliente (M)

Arquivos: `worker/src/*`, `worker/Dockerfile`, `worker/package.json`, `nestjs-project/compose.yaml`.

| # | Tarefa |
|---|---|
| 2.1 | Refatorar em módulos testáveis: `config.ts`, `db.ts` (`pg.Pool`, `getVideo`, `setStatus` com transição guardada `WHERE status IN (...)`), `storage.ts`, `ffmpeg.ts` (`probe`, `thumbnail`, `transcode`), `processor.ts` (pipeline), `index.ts` (bootstrap). |
| 2.2 | Semântica de falha: `failed` só quando `job.attemptsMade + 1 >= job.opts.attempts`; tentativas intermediárias voltam a `uploaded` e registram `error`. Guarda `uploaded|failed → processing`; job de vídeo já `ready` é ignorado (idempotência). |
| 2.3 | Gravar `size_bytes` do MP4 processado; `probe` relança erros; artefatos > 5GB via `@aws-sdk/lib-storage` `Upload` (multipart automático). |
| 2.4 | Robustez BullMQ: `concurrency` (env, default 1), `lockDuration` alto + `lockRenewTime`, handlers `failed/error/stalled`, shutdown gracioso (`SIGTERM/SIGINT` → `worker.close()` + `pool.end()`), logs JSON com `jobId`, `attempt`, durações. |
| 2.5 | Dockerfile multi-stage: `npm ci` → `tsc` → runtime `node dist/index.js` sob `tini`, `USER node`, `.dockerignore`; `compose.yaml` worker `restart: unless-stopped`, `depends_on: createbuckets` (completed), healthcheck no `redis`. |
| 2.6 | Testes: Vitest ou Jest no worker (`npm test`): unit para `processor.ts` (ffmpeg/storage/db mockados, verifica transições e política de falha) e integração local `ffmpeg.integration.test.ts` que gera um MP4 sintético (`ffmpeg -f lavfi -i testsrc … -f lavfi -i sine`) e valida thumbnail + duração + transcode. |

### B.4 Etapa 3 — Testes de integração e e2e do backend (M)

- Infra de teste: `cleanAllTables` passa a limpar `videos` primeiro; `create-test-data-source.ts` lê `DB_NAME`; `package.json` `test:e2e` com `--runInBand`; `migrations.integration-spec.ts` inclui `CreateVideosTable` e `AddVideoSlug`.
- `src/videos/entities/video.entity.integration-spec.ts`: colunas, defaults, índices, FK cascade, unique de `slug`.
- `src/videos/videos.service.integration-spec.ts`: DB real, `StorageService`/`VideoQueueService` substituídos por fakes; cobre registro, transições válidas/inválidas, delete, listagem por canal, isolamento entre canais.
- `src/storage/storage.service.integration-spec.ts`: contra MinIO real (compose), presign PUT + upload real via `fetch`, `head`, `getRange` (`Content-Range` correto), multipart create/complete/abort. Roda com `--runInBand`.
- `src/queue/video-queue.service.integration-spec.ts`: contra Redis real, verifica 1 job por `videoId`, opções de retry.
- `test/videos.e2e-spec.ts` (supertest, DB real, storage/fila fakes por `overrideProvider`): 401 sem token; registrar single e multipart; 400 de validação (título, `sizeBytes` > 10GB); confirmar sem objeto → 409; confirmar → `uploaded` + enqueue; reconfirmar → 409; outro usuário → 403; `stream` antes de `ready` → 409; após simular `ready` (update direto): 200, 206 com `Range`, 416; `download` → 302; `DELETE` → 204 e 404 depois; respostas nunca contêm `*_key`.

### B.5 Etapa 4 — Validação funcional local com a aplicação rodando (S/M)

Roteiro reproduzível e um script que o automatiza. Cria `scripts/smoke-videos.sh` (host, bash + curl + jq) e `docs/phases/phase-03-videos/manual-validation.md`.

Pré-condições: `cd nestjs-project && cp .env.example .env && docker compose up -d --build && docker compose exec nestjs-api npm install && docker compose exec nestjs-api npm run migration:run && docker compose exec -d nestjs-api npm run start:dev`. Verificar `docker compose ps` (todos `running`), `pg_isready`, `redis-cli ping`, `curl localhost:9000/minio/health/live`, `curl localhost:3000`.

Passos do script (cada um com asserção e saída clara):
1. Registrar usuário (`POST /auth/register`), obter o token de confirmação pela API do Mailpit (`localhost:8025/api/v1/messages`, padrão de `src/test/mailpit.ts`), confirmar, logar → `accessToken`.
2. Gerar vídeo de teste: `docker compose exec worker ffmpeg -f lavfi -i testsrc=duration=8:size=640x360:rate=30 -f lavfi -i sine=frequency=440:duration=8 -c:v libx264 -c:a aac /tmp/sample.mp4` e `docker compose cp worker:/tmp/sample.mp4 ./tmp/`.
3. `POST /videos` com `sizeBytes` do arquivo → esperar `upload.type = single` e URL com host público; `PUT` do arquivo na URL (esperar 200).
4. `POST /videos/:id/confirm` → `status = uploaded`; `docker compose logs -f worker` mostra o job; poll `GET /videos/:id` até `ready` (timeout 180s) e validar `durationSec ≈ 8`, `sizeBytes > 0`, `slug` com 11 chars, ausência de `original_key`.
5. `GET /videos/:id/stream` com `Range: bytes=0-1023` → 206, `Content-Range: bytes 0-1023/<total>`, `Content-Length: 1024`; sem Range → 200 + `Accept-Ranges`; `Range: bytes=<total+10>-` → 416.
6. `GET /videos/:id/download` → 302 com `Location` no MinIO; `curl -L` baixa o arquivo e `ffprobe` valida.
7. Multipart: gerar arquivo de 150MB (`head -c 150M /dev/urandom`, ou concatenar o sample), `POST /videos` → `type = multipart`; `split` em `partSize`, `PUT` de cada parte capturando `ETag`, `POST /multipart/complete`; verificar `uploaded` e, como o conteúdo não é vídeo válido, esperar `failed` com `error` preenchido após as tentativas (valida o caminho de erro). Segundo cenário multipart com vídeo real grande (opcional, `ffmpeg` com `duration=600`) → `ready`.
8. `POST /videos/:id/multipart/abort` num upload aberto → 204 e `GET` → 404.
9. `DELETE /videos/:id` → 204; objetos removidos no MinIO (`mc ls`).
10. Negativos: token de outro usuário → 403; sem token → 401; reconfirmar → 409.

Também: cenário de resiliência do worker (matar o container durante o transcode com `docker compose kill worker`, subir de novo e verificar retomada pelo stalled-job/retry) e teste de carga leve (3 uploads simultâneos, verificar que a API responde `GET /` em < 200ms durante o processamento).

### B.6 Etapa 5 — CI completa (S/M)

`.github/workflows/ci.yml` reescrito com jobs:
- `api-unit`: `npm ci`, `tsc --noEmit`, `build`, `npm run lint` (sem `--fix`, incluindo specs), `npx jest` (unit).
- `api-integration-e2e`: `services` postgres 17 e redis 7; MinIO via step `docker run -d -p 9000:9000 minio/minio server /data` + `mc mb`; `.env` gerado com hosts `localhost`; `migration:run`; `npm run test:integration`; `npm run test:e2e` (`--runInBand`).
- `worker`: `npm ci`, `tsc --noEmit`, lint, `npm test`, `docker build`.
- `frontend`: `npm ci`, `tsc --noEmit`, `npm run lint`, `npm test`; job opcional `frontend-e2e` que sobe `MSW_ENABLED=true npm run dev` em background e roda Playwright (CLAUDE.md proíbe `webServer` no config, não no CI).
- `openapi-freshness`: `openapi:export` e `openapi:types`, `git diff --exit-code` em `nestjs-project/openapi.json` e `next-frontend/lib/api/types.gen.ts` (materializa o guard que os docs já citam).
- `cache: npm` no setup-node, `concurrency` por branch, `workflow_dispatch`.

### B.7 Etapa 6 — Fatia frontend da Fase 03 (`phase-03-videos-frontend`) (L)

Executar o pipeline do projeto para gerar os artefatos formais; o plano abaixo fixa o escopo esperado.

1. `/screen-inventory phase-03 frontend`: telas do Figma para **Upload de vídeo** (dropzone, título/descrição, progresso, status), **Meus vídeos** (lista com status/thumbnail) e **Player básico** (`/videos/[slug]` privado nesta fase). Se o Figma não tiver alguma tela, registrar como OQ e usar componentes existentes + design system.
2. `/research phase-03 frontend` → `technical-decisions-phase-03-videos-frontend.md` com TDs: (a) upload do navegador direto para a URL pré-assinada do MinIO (exceção documentada ao BFF: o alvo é o storage, não a API; CORS do MinIO verificado), (b) uploader multipart no cliente (`XMLHttpRequest` para progresso, N partes em paralelo com limite, retry por parte, ETags → complete, abort ao cancelar), (c) streaming via BFF `app/api/videos/[id]/stream` repassando `Range` e o 206 (`Response` streaming do Route Handler) versus redirect para presigned GET, (d) polling de status versus SSE, (e) header/navegação mínima com logout (fecha lacuna da Fase 02), (f) estratégia E2E para o PUT no storage (MSW não intercepta o navegador; `page.route` só nesse host externo, nunca em `/api/**`).
3. `/plan-context` → `/plan-validate` → `/plan-build` → `/plan-test-specs`. SIs esperados: regenerar `openapi.json`/`types.gen.ts`; aliases em `lib/api/contracts.ts` (`RegisterVideoDto`, `UploadPlan`, `VideoResponse`); `mocks/handlers/videos.ts` + `mocks/factories/videos.ts` (`buildVideo`); BFF `app/api/videos/{route,[id]/route,[id]/confirm,[id]/multipart/complete,[id]/multipart/abort,[id]/stream,[id]/download}` usando `withRefresh`; hook `useVideoUpload` (single/multipart, progresso, cancel); páginas `/upload`, `/videos` (meus), `/videos/[slug]`; header com avatar/logout; corrigir `console.log` e `userId`/`channelSlug` no login (obter de `GET /auth/me`).
4. Testes: Vitest unit (hook uploader com XHR mockado, componentes de progresso/status), integração de Route Handlers com MSW, Playwright `tests/videos-upload.e2e-spec.ts`, `videos-list.e2e-spec.ts`, `videos-player.e2e-spec.ts`, mais validação manual no navegador contra o backend real (upload de arquivo real, progresso, vídeo tocando com seek, que exercita o Range).

### B.8 Etapa 7 — Fechamento da Fase 03 (S)

- `docs/phases/phase-03-videos/progress.md` e o da fatia frontend com status final; `FASE-03-ENTREGA.md` e `README.md` (Fase 03 ✅, tabela de endpoints de vídeo, comandos do smoke test).
- Suíte completa verde (backend unit+integração+e2e, worker, frontend unit+integração+E2E), CI verde, smoke local executado e registrado em `manual-validation.md` com data.
- Commit "chore(fase03): fechamento" (`git tag v0.3.0` opcional).

### B.9 Roadmap — Fases 04 a 07

Cada fase segue B.0 integralmente (inventory → research → plan → implement → testes → validação local → docs). Backend e frontend como fatias separadas, como nas Fases 02/03.

**Fase 04 — Gerenciamento de vídeos e canal**
- Dados: entidade `Category` (seed fixo), `videos.category_id`, `visibility enum(public|unlisted)`, `published_at`, `custom_thumbnail_key`; `channels.name/description`.
- Backend: `PATCH /videos/:id` (título/descrição/categoria), `POST /videos/:id/thumbnail` (presigned + confirm), `POST /videos/:id/publish|unpublish`, `GET /videos?page&limit&status` paginado, `GET /categories`, `PATCH /channels/me`, `GET /channels/:nickname` público (`@Public()`) com vídeos publicados públicos.
- Frontend: painel `/studio` (tabela: thumb, título, views, likes, comentários, publicado há, status), edição de vídeo, edição de canal, página pública `/c/[nickname]`.
- Testes: unit + integração das transições rascunho→publicado, e2e de autorização (dono vs outro vs anônimo), Playwright do painel e edição; validação local com vídeos em cada estado.

**Fase 05 — Página de visualização**
- Dados: `videos.views_count`, tabela `video_views` (dedupe por sessão/IP em janela) ou contador simples.
- Backend: `GET /videos/:slug` público (200 para public/unlisted publicados; 404 para rascunho/privado), `GET /videos/:slug/stream|download` públicos, `POST /videos/:slug/views`, `GET /videos/:slug/related` (mesma categoria). Considerar redirect 302 para presigned GET no stream público para tirar bytes da API (TD).
- Frontend: `/watch/[slug]` com player (controles, volume, progresso, seek via Range), descrição expansível, sidebar de sugestões, botão download; unlisted fora de listagens.
- Testes: e2e de visibilidade, contagem de views, Playwright do player (play/pause/seek), validação local anônima (janela anônima).

**Fase 06 — Interações sociais**
- Dados: `video_reactions(user_id, video_id, type)` unique, `comments(video_id, user_id, parent_id, body)` (profundidade máx. 2 — TD), `comment_reactions`, `subscriptions(subscriber_id, channel_id)` unique, contadores desnormalizados.
- Backend: `PUT/DELETE /videos/:slug/reaction`, `GET/POST /videos/:slug/comments`, `POST /comments/:id/replies`, `PUT/DELETE /comments/:id/reaction`, `DELETE /comments/:id`, `POST/DELETE /channels/:id/subscription`, `GET /me/subscriptions`. Rate limit em comentários; abuso de like tratado por unicidade por usuário (plan §4).
- Frontend: barra de like/dislike, lista de comentários com respostas e formulário, botão inscrever-se, página `/subscriptions`.
- Testes: integração de unicidade/contadores, e2e de auth obrigatória, Playwright dos fluxos; validação local com 2 usuários.

**Fase 07 — Home, busca e finalização**
- Backend: `GET /videos/feed?category&cursor` (público, publicados), `GET /search?q` (título e canal; `pg_trgm`/`tsvector` — TD), índices.
- Frontend: `/` com grid, filtro por categoria, header com busca e avatar, paginação/scroll infinito, responsivo (mobile), estados vazios/erro/loading.
- Finalização: Playwright dos fluxos principais ponta a ponta (cadastro → upload → publicar → assistir anônimo → comentar), `compose.prod.yaml` (imagens multi-stage para API/worker/frontend, Postgres/Redis persistentes, MinIO ou S3 real, variáveis de produção, `helmet`, CORS, limites de body), pipeline de deploy, runbook em `docs/`.

### B.10 Ordem de execução e marcos

1. Etapa 0 (docs/higiene) → commit.
2. Etapas 1 e 2 em paralelo lógico, mas commits separados por tarefa (1.1 primeiro: desbloqueia validação local).
3. Etapa 3 (testes) → Etapa 4 (validação local) → Etapa 5 (CI). **Marco M1: backend/worker da Fase 03 fechados e verificados.**
4. Etapa 6 (frontend F03). **Marco M2: Fase 03 completa ponta a ponta no navegador.**
5. Etapa 7 → Fase 04 → 05 → 06 → 07, cada uma com seu marco.

---

## Arquivos críticos

- Backend: `nestjs-project/src/videos/{videos.controller,videos.service}.ts`, `dto/create-video.dto.ts`, `entities/video.entity.ts`, `video.exceptions.ts`; `src/storage/storage.service.ts`; `src/queue/{queue.module,video-queue.service}.ts`; `src/config/{storage.config,queue.config,env.validation}.ts`; `src/test/create-test-data-source.ts`; `src/database/migrations/*`; `test/jest-e2e.json`; `package.json`; `.env.example`; `compose.yaml`; `openapi.json`; `api.http`.
- Worker: `worker/src/index.ts` (a ser dividido), `worker/Dockerfile`, `worker/package.json`.
- CI/infra: `.github/workflows/ci.yml`, `scripts/sync-openapi.sh`, novo `scripts/smoke-videos.sh`, `.gitignore`.
- Frontend: `next-frontend/lib/api/{contracts,types.gen}.ts`, `app/api/**`, `mocks/handlers/*`, `components/**`, `tests/*.e2e-spec.ts`.
- Docs: `README.md`, `FASE-03-ENTREGA.md`, `nestjs-project/CLAUDE.md`, `docs/phases/phase-03-videos/*`, `docs/decisions/*`, `docs/diagrams/software-arch.mermaid`, novo `docs/evolution-plan.md`.

Reutilizar: `DomainException`/filtros (`src/common`), `@CurrentUser`/`@Public`, `JwtAuthGuard` global, padrão `registerAs` + Joi, `src/test/mailpit.ts` (token de confirmação no smoke test), `auth.controller.ts` como referência de Swagger, `test/auth.e2e-spec.ts` como referência de e2e, `lib/auth/refresh.ts` (`withRefresh`) e `lib/auth/error-mapping.ts` no frontend.

## Verificação do plano

- Etapa 0: `git status` limpo após commit; `grep -n "Planejada" README.md` não cita a Fase 03; `worker/worker` inexistente; `docker build worker/` sem copiar `node_modules`.
- Etapas 1–3: dentro do container `npx tsc --noEmit`, `npm run lint`, `npm test -- --runInBand`, `npm run test:e2e` todos 0; `npx jest src/videos src/storage src/queue` cobre os cenários listados; `openapi.json` contém `/videos`.
- Etapa 4: `bash scripts/smoke-videos.sh` termina com todas as asserções OK contra `docker compose` local; `manual-validation.md` preenchido.
- Etapa 5: workflow verde no GitHub em todos os jobs.
- Etapa 6: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npx playwright test` verdes; upload real pelo navegador termina em `ready` e o player faz seek.

## Histórico

- 2026-09-04 — Plano criado; Etapa 0 (verdade do repositório e higiene) aplicada no mesmo commit.
- 2026-09-04 — Etapas 1–7 executadas e commitadas em `master` (hardening do backend, worker
  resiliente, integração/e2e, smoke local, CI, fatia frontend, fechamento). Marcos M1 e M2
  atingidos: Fase 03 completa de ponta a ponta, validada no navegador contra a stack real.
  Próximo: Fase 04 (Etapa B.9), começando por `/screen-inventory` + `/research phase-04`.
- 2026-09-04 — Fase 04 implementada (backend + frontend) sem inventário do Figma (MCP indisponível):
  decisões em `docs/decisions/technical-decisions-phase-04-management.md`, plano/progresso em
  `docs/phases/phase-04-management/`. Próximo: Fase 05 (página de visualização pública).
- 2026-09-05 — Fase 05 implementada (`/watch/[slug]`, stream/download públicos, views, sugestões):
  `docs/decisions/technical-decisions-phase-05-watch.md`, `docs/phases/phase-05-watch/`. Próximo: Fase 06.
