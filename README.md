# StreamTube — Plataforma de Compartilhamento de Vídeos

Projeto da disciplina **Desenvolvimento de Aplicações de IA** do MBA de Engenharia de Software com IA da [Full Cycle](https://fullcycle.com.br).

Este é um projeto greenfield desenvolvido para demonstrar como construir uma aplicação do zero utilizando IA de forma adequada no processo de desenvolvimento. Usuários cadastrados enviam vídeos de até 10GB, gerenciam e publicam seus canais; qualquer pessoa assiste; likes, comentários e inscrições exigem login.

## Professor

<a href="https://github.com/argentinaluiz">
    <img src="https://avatars.githubusercontent.com/u/4926329?v=4?s=100" width="100px;" alt=""/>
    <br />
    <sub>
        <b>Luiz Carlos</b>
    </sub>
</a>

---

## Quadro Branco

- [Quadro Branco](./whiteboard.png)

---

## 🎨 Design System (Figma)

- [FC Tube.fig](./FC%20Tube.fig) — arquivo-fonte do **design system** do projeto no Figma.
- [FC Tube sem padrão.fig](./FC%20Tube%20sem%20padrao.fig) — arquivo-fonte puro, sem tokens, cores, tipografia e espaçamento.

Contém os fundamentos visuais do StreamTube — tokens (cores, tipografia, espaçamento, raios), componentes e as telas da plataforma. É a referência de design para a implementação do frontend: os componentes em `next-frontend/components/ui` (shadcn) e os tokens em `next-frontend/app/globals.css` derivam deste arquivo. Abra-o no Figma (`Arquivo → Importar`) para consultar especificações e estados visuais.

---

## 📚 Status do Projeto

Todas as fases do [plano do projeto](docs/project-plan.md) estão implementadas, testadas e validadas com a aplicação rodando.

| Fase | Descrição | Status |
|------|-----------|--------|
| **01** | Configuração Base do Projeto | ✅ Concluída |
| **02** | Cadastro, Login e Gerenciamento de Conta | ✅ Concluída |
| **03** | Upload e Processamento de Vídeos | ✅ Concluída |
| **04** | Gerenciamento de Vídeos e Canal | ✅ Concluída |
| **05** | Página de Visualização do Vídeo | ✅ Concluída |
| **06** | Interações Sociais (Likes, Comentários, Inscrições) | ✅ Concluída |
| **07** | Página Inicial, Busca e Finalização (produção) | ✅ Concluída |

**Pendência transversal:** as telas das Fases 04 a 07 foram construídas com o design system existente, mas ainda não passaram pelo inventário e drift audit contra o Figma (o MCP do Figma não estava disponível durante a implementação). O detalhe está no `progress.md` de cada fase em `docs/phases/`.

Histórico completo do fechamento da Fase 03 e da evolução até a Fase 07, com o processo de engenharia adotado (decisões → plano → implementação → testes → validação local → CI → commit), em [`docs/evolution-plan.md`](docs/evolution-plan.md).

---

## 📋 Pré-requisitos

- Docker e Docker Compose
- Node.js 20+ e npm no host (apenas para o Playwright e os scripts de validação; todo o resto roda em containers)

## 🏗️ Arquitetura

O projeto é um monorepo baseado em containers Docker. Em desenvolvimento, cada subprojeto sobe sua própria stack via `docker compose`; em produção, `compose.prod.yaml` sobe tudo junto.

- **Frontend** (Next.js 16, App Router + React Server Components) — interface da plataforma. Segue o **modelo BFF**: o navegador nunca chama a API NestJS diretamente; todo tráfego passa por Route Handlers same-origin em `app/api/**`, que fazem proxy server-side para a API com a sessão (iron-session) e refresh transparente. A única exceção documentada é o **upload**, que vai do navegador direto para o object storage por URL pré-assinada.
- **API** (NestJS 11) — regras de negócio, autenticação (JWT + refresh token rotation), vídeos, canais, categorias, interações sociais, descoberta (feed/busca), envio de e-mails e acesso ao banco. Contrato publicado em OpenAPI (`nestjs-project/openapi.json`) e consumido pelo frontend com tipos gerados.
- **Video Worker** (`worker/`, Node + FFmpeg) — consome a fila `video-processing`, gera thumbnail e MP4 H.264/AAC, grava duração e tamanho e atualiza o status do vídeo (`uploading → uploaded → processing → ready | failed`).
- **Database** (PostgreSQL 17) — usuários, canais, tokens de autenticação, categorias, vídeos, reações, comentários e inscrições (schema versionado por migrations TypeORM).
- **Object Storage** (MinIO em dev, S3-compatível) — arquivos originais, processados e thumbnails. Upload single ou multipart (até 10GB) direto do cliente por URLs pré-assinadas; streaming via API com HTTP Range.
- **Message Queue** (Redis + BullMQ) — fila de processamento de vídeos (`jobId = videoId`, 5 tentativas com backoff exponencial).
- **Email Service** (Mailpit em dev, SMTP em produção) — confirmação de conta e recuperação de senha.

O diagrama de arquitetura completo (C4) está em `docs/diagrams/software-arch.mermaid`.

## 🚀 Como rodar (desenvolvimento)

Os dois subprojetos têm stacks Docker **separadas**. Suba primeiro o backend, rode as migrations e depois o frontend.

### 1. Backend (NestJS + PostgreSQL + Mailpit + Redis + MinIO + Worker)

```bash
cd nestjs-project
cp .env.example .env            # apenas na primeira vez

# Sobe API (container idle), banco, Mailpit, Redis, MinIO (+ bucket) e o worker de vídeo
docker compose up -d --build

# Instala dependências (apenas na primeira vez)
docker compose exec nestjs-api npm install

# Cria o schema do banco (obrigatório — synchronize está desabilitado)
docker compose exec nestjs-api npm run migration:run

# (Opcional) usuário de desenvolvimento já confirmado: dev@streamtube.local / Dev@123456
docker compose exec nestjs-api npm run seed

# Sobe o servidor de desenvolvimento em watch mode
docker compose exec -d nestjs-api npm run start:dev
```

Serviços disponíveis:

| Serviço | URL / Porta |
|---------|-------------|
| API NestJS | http://localhost:3000 |
| PostgreSQL | `localhost:5432` (db/user/senha: `streamtube`) |
| Mailpit (UI de e-mails) | http://localhost:8025 |
| Redis (fila BullMQ) | `localhost:6379` |
| MinIO (API S3) | http://localhost:9000 — bucket `streamtube-videos` |
| MinIO Console | http://localhost:9001 (`minioadmin` / `minioadmin`) |
| Video Worker | sem porta — acompanhe com `docker compose logs -f worker` |
| Swagger (opcional) | http://localhost:3000/api/docs — habilite com `SWAGGER_ENABLED=true` |

> `S3_PUBLIC_ENDPOINT` (default `http://localhost:9000`) é o endereço do storage que o navegador alcança; a API usa `S3_ENDPOINT` (`http://minio:9000`) internamente.

### 2. Frontend (Next.js)

```bash
cd next-frontend
cp .env.example .env.local      # API_URL aponta para o backend; SESSION_PASSWORD protege a sessão

docker compose up -d
docker compose exec next-frontend npm install        # apenas na primeira vez
docker compose exec -d next-frontend npm run dev
```

A aplicação ficará disponível em **http://localhost:3001**.

> As stacks são separadas, então o frontend acessa o backend via `host.docker.internal:3000` (configurado em `next-frontend/.env.local` e no `extra_hosts` do compose).

### Sincronizar o contrato OpenAPI

Sempre que a API mudar, regenere o contrato e os tipos do frontend (a CI bloqueia drift):

```bash
cd nestjs-project && docker compose exec nestjs-api npm run openapi:export
cd .. && bash scripts/sync-openapi.sh
cd next-frontend && docker compose exec next-frontend npm run openapi:types
```

## 🧪 Testes

| Suíte | Onde roda | Comando |
|-------|-----------|---------|
| Backend unit + integração (Jest, Postgres/MinIO/Redis reais) | container | `docker compose exec nestjs-api npm test -- --runInBand` |
| Backend e2e (supertest) | container | `docker compose exec nestjs-api npm run test:e2e` |
| Worker (Vitest; FFmpeg real na imagem) | host / Docker | `npm test` em `worker/` · `docker build --target test -t streamtube-worker-test worker && docker run --rm streamtube-worker-test` |
| Frontend unit + integração (Vitest + MSW) | container | `docker compose exec next-frontend npm test` |
| Frontend e2e (Playwright) | host | `npx playwright test` em `next-frontend/` com o dev server em `MSW_ENABLED=true` |

Sufixos do backend: `*.spec.ts` (unitário), `*.integration-spec.ts` (integração com serviços reais), `*.e2e-spec.ts` (HTTP completo). Sufixos do frontend: `*.test.ts(x)` (unitário), `*.integration.test.ts(x)` (Route Handlers como função com MSW), `*.e2e-spec.ts` (Playwright). Nos testes do frontend o MSW substitui a API NestJS — eles nunca batem no backend real.

Para os E2E do frontend, suba o dev server com MSW (`docker compose exec -d next-frontend sh -c "MSW_ENABLED=true npm run dev"`); o MSW carrega os handlers só no boot, então reinicie o dev server após alterar `next-frontend/mocks/`.

### Validação funcional com a aplicação rodando

Com a stack do backend no ar e a API em `start:dev`:

```bash
# API real: usuário via Mailpit → upload → worker → stream/download → publicação → canal público →
# visualização anônima, views e sugestões → reações, comentários, inscrições → feed e busca → exclusão
bash scripts/smoke-videos.sh                # ~5 min (inclui multipart de 150MB); --skip-multipart para ~1 min

# Navegador real (Chromium) contra API + worker + MinIO reais, com o frontend em `npm run dev` SEM MSW:
cd next-frontend && npx playwright install chromium && cd ..
node scripts/browser-validation.mjs         # jornada completa: cadastro → upload → publicar → assistir anônimo → interagir
```

Roteiro manual, cenários de resiliência e o registro das execuções em `docs/phases/phase-03-videos/manual-validation.md`.

### CI

`.github/workflows/ci.yml` roda em push/PR: API (typecheck, build, lint, unit + integração + e2e com Postgres/Redis/MinIO/Mailpit, frescor do `openapi.json`), worker (typecheck, build, testes na imagem com FFmpeg), frontend (typecheck, lint, Vitest, frescor dos tipos gerados) e build das imagens de produção com validação do `compose.prod.yaml`.

## 📦 Produção

```bash
cp .env.production.example .env.production   # preencha os segredos (openssl rand -hex 32)
docker compose -f compose.prod.yaml --env-file .env.production up -d --build
```

Sobe Postgres, Redis e MinIO com volumes, a API (imagem multi-stage, aplica migrations no start), o worker e o frontend (Next standalone); o navegador só alcança o frontend (3001) e o storage (9000), atrás de um reverse proxy TLS externo. Runbook completo (topologia, proxy, backups, atualização, escala do worker) em [`docs/deploy.md`](docs/deploy.md).

## ✅ Funcionalidades

### Autenticação (Fase 02)

Fluxo completo de **cadastro → confirmação por e-mail → login → recuperação de senha**, com canal criado automaticamente para cada usuário (a partir do prefixo do e-mail).

| Método & Rota | Descrição |
|---------------|-----------|
| `POST /auth/register` | Cadastro de usuário (cria usuário + canal) |
| `GET /auth/confirm-email?token=` | Confirmação de conta via link do e-mail |
| `POST /auth/resend-confirmation` | Reenvio do e-mail de confirmação |
| `POST /auth/login` | Login (retorna access + refresh token) |
| `POST /auth/refresh` | Rotação de refresh token (com family + grace period) |
| `POST /auth/logout` | Revoga os refresh tokens da sessão |
| `POST /auth/forgot-password` | Solicita e-mail de recuperação de senha |
| `POST /auth/reset-password` | Redefine a senha via token |
| `GET /auth/me` | Dados do usuário autenticado (protegido por JWT) |

Telas: `/signup`, `/login`, `/forgot-password` (React Hook Form + Zod) sobre o BFF `app/api/auth/**`. Segurança: senhas com **Argon2**, **JWT** com `JwtAuthGuard` global (opt-out via `@Public()`, com Bearer opcional em rotas públicas), **rotação de refresh token** com detecção de reuso, **rate limiting** nos endpoints de auth, sessão no navegador via **iron-session** (cookie HTTP-only) e `helmet` na API.

### Upload e processamento de vídeos (Fase 03)

Estados do vídeo: `uploading → uploaded → processing → ready | failed`. Cada vídeo recebe uma URL curta única (`slug` de 11 caracteres).

| Método & Rota | Descrição |
|---------------|-----------|
| `POST /videos` | Registra o vídeo como rascunho e devolve o plano de upload (`single`: URL pré-assinada; `multipart`: `uploadId` + URLs por parte, até 10GB) |
| `POST /videos/:id/confirm` · `POST /videos/:id/multipart/complete` · `/abort` | Confirma (ou cancela) o upload → `uploaded` e enfileira o processamento |
| `GET /videos/:id` · `DELETE /videos/:id` | Metadados/status do vídeo do próprio canal; exclusão com limpeza do storage |
| `GET /videos/:id/stream` | Streaming com `Range` → `206 Partial Content` (e `416` fora dos limites) |
| `GET /videos/:id/download` · `/thumbnail` | Redirecionam (302) para URLs pré-assinadas |

Fluxo: registrar → `PUT` do arquivo na URL pré-assinada (direto no storage) → confirmar → worker gera thumbnail + MP4 H.264/AAC e grava duração/tamanho → `ready`. Telas: `/upload` (progresso, cancelamento, acompanhamento até `ready`), `/videos` e `/videos/[id]` (player HTML5 via BFF com Range).

### Gerenciamento de vídeos e canal (Fase 04)

| Método & Rota | Descrição |
|---------------|-----------|
| `GET /categories` | Categorias fixas da plataforma (público) |
| `PATCH /videos/:id` | Título, descrição, categoria e visibilidade (`public` / `unlisted`) |
| `POST /videos/:id/publish` · `/unpublish` | Rascunho → publicado (exige `ready`) e volta |
| `POST /videos/:id/thumbnail` · `/thumbnail/confirm` · `DELETE /videos/:id/thumbnail` | Thumbnail própria (JPEG/PNG/WebP ≤ 5MB) via URL pré-assinada |
| `GET /videos?page&limit&status&published` | Painel paginado do canal |
| `GET /channels/me` · `PATCH /channels/me` | Meu canal (nome, nickname único, descrição) |
| `GET /channels/:nickname` · `GET /channels/:nickname/videos` | Página pública do canal (público) |

Telas: `/studio` (painel com filtros, views, likes e comentários), `/studio/videos/[id]` (editar, publicar, thumbnail), `/studio/channel` e `/c/[nickname]` (página pública, sem login).

### Visualização pública (Fase 05)

| Método & Rota | Descrição |
|---------------|-----------|
| `GET /videos/slug/:slug` | Vídeo publicado pela URL única (público; o dono vê rascunhos com Bearer) |
| `GET /videos/:id/stream` · `/download` · `/thumbnail` | Públicos para vídeos publicados (`public` ou `unlisted`) |
| `POST /videos/:id/views` | Registra uma visualização (o player chama no primeiro `play`) |
| `GET /videos/:id/related?limit` | Sugestões da mesma categoria (fallback: recentes) |

Tela: `/watch/[slug]` (anônimo) com player, informações, descrição expansível, download, link do canal e sidebar de sugestões. Vídeos `unlisted` abrem pelo link e não aparecem em listagens.

### Interações sociais (Fase 06)

| Método & Rota | Descrição |
|---------------|-----------|
| `GET /videos/:id/reactions` · `PUT/DELETE /videos/:id/reaction` | Likes/dislikes do vídeo (1 por usuário; PUT troca) |
| `GET/POST /videos/:id/comments` · `POST /comments/:id/replies` · `DELETE /comments/:id` | Comentários com 1 nível de resposta; exclusão lógica pelo autor |
| `PUT/DELETE /comments/:id/reaction` | Likes/dislikes em comentários |
| `GET/PUT/DELETE /channels/:id/subscription` · `GET /me/subscriptions` | Inscrições (sem auto-inscrição) e canais seguidos com últimos vídeos |
| `GET /social/videos/:id` · `GET /social/videos?ids=` | Agregados (reações, comentários, inscrição) para a página e o painel |

Telas: reações, comentários e inscrição em `/watch/[slug]`, inscrição em `/c/[nickname]`, `/subscriptions`. Anônimos veem contagens e comentários e recebem CTAs de login.

### Home, busca e navegação (Fase 07)

| Método & Rota | Descrição |
|---------------|-----------|
| `GET /feed?category&page&limit` | Feed da home (públicos publicados; filtro por slug de categoria) |
| `GET /search?q&page&limit` | Busca por título do vídeo e nome/nickname do canal (índices `pg_trgm`) |

Telas: `/` (chips de categoria, grid, "carregar mais" progressivo), `/search?q=` paginada, busca e navegação responsiva no header.

As decisões técnicas de cada fase estão em `docs/decisions/technical-decisions-phase-0N-*.md`.

## 🛠️ Estrutura do Projeto

```
desafio-05-streamtube-fase03/
├── docs/
│   ├── project-plan.md                  # Planejamento geral (7 fases)
│   ├── evolution-plan.md                # Auditoria, plano de evolução e histórico de execução
│   ├── deploy.md                        # Runbook de produção
│   ├── decisions/                       # Decisões técnicas (TDs) por fase/tarefa
│   ├── phases/                          # Plano, progresso e validação por fase (01 → 07)
│   ├── inventories/                     # Inventário de telas (Figma) da Fase 02
│   └── diagrams/                        # Arquitetura (C4) e fluxos das skills
├── nestjs-project/                      # Backend API (NestJS 11)
│   ├── src/
│   │   ├── auth/ users/ channels/ mail/ # Fase 02: cadastro, JWT/refresh, canal 1:1, e-mails
│   │   ├── videos/ storage/ queue/      # Fase 03–05: vídeos, MinIO/S3, producer BullMQ
│   │   ├── categories/                  # Fase 04: categorias fixas
│   │   ├── reactions/ comments/         # Fase 06: likes/dislikes e comentários
│   │   ├── subscriptions/ social/       # Fase 06: inscrições e agregados sociais
│   │   ├── discovery/                   # Fase 07: feed e busca
│   │   ├── common/ config/ database/    # Filtros/exceptions, configs Joi, migrations e seeds
│   │   └── test/                        # Helpers de teste (data source, Mailpit)
│   ├── test/                            # Testes e2e (supertest)
│   ├── compose.yaml                     # Stack de desenvolvimento
│   ├── Dockerfile.dev · Dockerfile      # Dev (container idle) · produção (multi-stage)
│   ├── openapi.json                     # Contrato exportado (fonte dos tipos do frontend)
│   └── api.http                         # Requisições de exemplo (REST Client)
├── worker/                              # Video Worker (BullMQ consumer + FFmpeg), Vitest, Dockerfile multi-stage
├── next-frontend/                       # Frontend (Next.js 16, App Router)
│   ├── app/(auth)/ app/(app)/           # Telas de auth · telas da plataforma (home, watch, studio, canal…)
│   ├── app/api/                         # Route Handlers BFF (auth, videos, channels, comments, social, search…)
│   ├── components/                      # auth, ui (shadcn), icons, layout, videos, discovery, social, channels
│   ├── hooks/ lib/                      # sessão, upload, contratos/tipos OpenAPI, helpers server-side
│   ├── mocks/                           # MSW (handlers e factories por domínio)
│   ├── tests/                           # E2E (Playwright)
│   ├── compose.yaml                     # Dev server
│   └── Dockerfile.dev · Dockerfile      # Dev · produção (standalone)
├── scripts/
│   ├── sync-openapi.sh                  # Copia o contrato da API para o frontend
│   ├── smoke-videos.sh                  # Validação funcional da API real (Fases 03–07)
│   └── browser-validation.mjs           # Jornada completa no navegador contra a stack real
├── compose.prod.yaml                    # Produção single-host (+ .env.production.example)
├── .github/workflows/ci.yml             # CI: API, worker, frontend e imagens de produção
├── CLAUDE.md                            # Instruções para IA (+ .claude/ com skills, rules e agents)
├── FC Tube.fig                          # Design system do projeto (Figma)
├── whiteboard.png                       # Quadro branco do projeto
└── README.md
```

## 📖 Stack Tecnológica

| Camada | Tecnologia |
|--------|------------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, React Hook Form + Zod, iron-session, openapi-fetch + openapi-typescript |
| Backend | NestJS 11, TypeScript, TypeORM, JWT, Argon2, Mailer (Handlebars), AWS SDK S3, BullMQ, helmet |
| Video Worker | Node 22, BullMQ, FFmpeg (fluent-ffmpeg), pg, AWS SDK (lib-storage) |
| Banco de Dados | PostgreSQL 17 (pg_trgm para busca) |
| Storage / Fila | MinIO ou S3 / Redis 7 |
| E-mail | Mailpit (dev) / SMTP (produção) |
| Containerização | Docker, Docker Compose (dev e produção) |
| Testes | Jest + Supertest (backend); Vitest (worker); Vitest + MSW + Playwright (frontend) |
| Qualidade | ESLint, Prettier, GitHub Actions |
