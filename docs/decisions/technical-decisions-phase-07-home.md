# Technical Decisions — Phase 07 (Página Inicial, Busca e Finalização)

Escopo (project-plan §Fase 07): home com grid de vídeos (thumbnail, título, canal, views, tempo de
publicação), filtro por categoria, barra de busca (título e canal), header/navbar, paginação ou
scroll infinito, responsividade, testes dos fluxos principais e ambiente de produção/deploy.

> Processo: sem `/screen-inventory` (MCP do Figma indisponível); telas com o design system existente.

## TD-07.1 — Descoberta em módulo próprio (`DiscoveryModule`)
**Decisão:** `GET /feed?category=<slug>&page&limit` e `GET /search?q=&page&limit`, públicos, em
`src/discovery/`, consultando `videos` com `channel`/`category` carregados e a regra "público +
publicado + ready". Evita inflar o `VideosModule` (SRP) e reutiliza o `toVideoResponse`.

## TD-07.2 — Busca por `ILIKE` com índices trigram
**Decisão:** busca por título do vídeo e nome/nickname do canal com `ILIKE '%q%'`, ordenada por
data de publicação; migration `AddSearchIndexes` cria a extensão `pg_trgm` e índices GIN
(`videos.title`, `channels.name`, `channels.nickname`) para manter a busca barata. **Alternativas
descartadas:** `tsvector` (ranking, mas exige dicionário/idioma e mais setup) e serviço externo
(fora do escopo). Termo mínimo de 2 caracteres.

## TD-07.3 — Home com "carregar mais" (scroll infinito progressivo)
**Decisão:** a home renderiza a primeira página no servidor (RSC) e um Client Component carrega as
próximas via BFF (`/api/videos/feed`) ao clicar em "Carregar mais" ou quando o sentinela entra na
viewport (IntersectionObserver). Chips de categoria filtram por `?category=slug` (RSC), mantendo a
URL compartilhável. A busca usa paginação clássica (`?q&page`).

## TD-07.4 — Header responsivo com busca
**Decisão:** o header ganha um formulário de busca (`GET /search?q=`), links que colapsam em
telas pequenas (`sm:`), e mantém e-mail/logout. Layouts usam grid/flex com breakpoints Tailwind.

## TD-07.5 — Produção: imagens multi-stage e compose de produção
**Decisão:** `nestjs-project/Dockerfile` (multi-stage, `node dist/main`, `USER node`),
`next-frontend/Dockerfile` (`output: "standalone"`), `worker/Dockerfile` (já existente) e
`compose.prod.yaml` na raiz subindo Postgres/Redis (volumes), MinIO (volume), API (com
`migration:run` no start), worker e frontend numa mesma rede — o frontend fala com a API por
`http://api:3000` (BFF). Segredos via `.env.production` (não versionado; `.env.production.example`
versionado). API com `helmet`, sem CORS (BFF) e `enableShutdownHooks`. Deploy = `docker compose -f
compose.prod.yaml up -d --build`; runbook em `docs/deploy.md`. **Fora do escopo:** CDN, TLS
terminator (documentado como reverse proxy externo), autoscaling.

## TD-07.6 — Testes dos fluxos principais
**Decisão:** além das suítes por fase, `scripts/browser-validation.mjs` executa a jornada completa
contra a stack real (cadastro → upload → publicar → assistir anônimo → comentar → inscrever) e a CI
constrói as imagens de produção.

## Decisions Summary
| TD | Tema | Decisão |
|---|---|---|
| 07.1 | Descoberta | `DiscoveryModule` com `/feed` e `/search` públicos |
| 07.2 | Busca | `ILIKE` + índices `pg_trgm` GIN; termo ≥ 2 chars |
| 07.3 | Home | RSC + "carregar mais" com IntersectionObserver; chips por categoria |
| 07.4 | Header | busca no header; colapso responsivo |
| 07.5 | Produção | Dockerfiles multi-stage, `compose.prod.yaml`, helmet, runbook |
| 07.6 | Testes | jornada completa em `browser-validation.mjs`; CI constrói imagens |
