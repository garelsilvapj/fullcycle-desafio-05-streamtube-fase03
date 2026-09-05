# Technical Decisions — Phase 04 (Gerenciamento de Vídeos e Canal)

Escopo (project-plan §Fase 04): categorias, edição de vídeo (título/descrição/categoria/thumbnail
customizada), visibilidade público/unlisted, rascunho → publicação, painel do canal, edição do
canal e página pública do canal. Herdam-se as decisões das Fases 02–03 (JWT global, DomainException,
presigned upload direto ao storage, BFF estrito no frontend).

> Processo: planejado e implementado sem `/screen-inventory` (MCP do Figma indisponível); telas
> usam o design system existente. Pendência visual registrada em `docs/phases/phase-04-management/progress.md`.

## TD-04.1 — Categorias como tabela fixa, semeada por migration
**Capability:** "Categorias de vídeo disponíveis na plataforma". **Decisão:** entidade `Category`
(`id`, `name`, `slug` únicos) com lista fixa inserida na própria migration (`ON CONFLICT DO NOTHING`);
`GET /categories` público. **Alternativa descartada:** enum no vídeo (não permite evoluir sem migration
de tipo) ou CRUD administrativo (não há papel admin na plataforma). **Trade-off:** mudar categorias exige
nova migration de dados.

## TD-04.2 — Publicação ortogonal ao pipeline de processamento
**Capability:** "Fluxo de rascunho → publicação". **Decisão:** `videos.published_at` (null = rascunho).
`POST /videos/:id/publish` exige `status = ready` (`VIDEO_NOT_PUBLISHABLE` 409); `unpublish` volta a
rascunho. O `status` continua descrevendo só o processamento. **Alternativa descartada:** novos valores
no enum `status` (misturaria dois eixos e quebraria o worker). Todo vídeo nasce como rascunho.

## TD-04.3 — Visibilidade `public | unlisted` no vídeo
**Decisão:** coluna `visibility` (enum, default `public`). Listagens públicas (canal, home futura)
mostram só `public` + publicado + `ready`; `unlisted` só por link direto (Fase 05). Editável via
`PATCH /videos/:id`.

## TD-04.4 — Thumbnail customizada pelo mesmo mecanismo de presigned upload
**Decisão:** `POST /videos/:id/thumbnail` devolve URL pré-assinada (JPEG/PNG/WebP) para
`videos/{channel}/{video}/thumb-custom.{ext}`; `POST /videos/:id/thumbnail/confirm` valida existência
e tamanho (≤ 5MB, senão `VIDEO_THUMBNAIL_INVALID` 400 e o objeto é removido) e grava
`custom_thumbnail_key`; `DELETE /videos/:id/thumbnail` volta à gerada pelo worker. A thumbnail servida
é sempre `custom ?? gerada`. **Alternativa descartada:** upload via multipart/form-data pela API.

## TD-04.5 — Autenticação opcional em rotas públicas
**Capability:** página pública do canal (thumbnails) e, na Fase 05, visualização anônima. **Decisão:**
o `JwtAuthGuard` continua liberando rotas `@Public()`, mas passa a **tentar** ler o Bearer quando
presente (sem falhar se inválido), preenchendo `request.user`. Assim `GET /videos/:id/thumbnail` é
público para vídeos publicados e continua funcionando para o dono de um rascunho.

## TD-04.6 — Painel: listagem paginada do próprio canal
**Decisão:** `GET /videos?page&limit&status&published` passa a devolver `{ items, page, limit, total }`
(limite 50) com categoria carregada. **Trade-off:** muda a forma da resposta da Fase 03 — o frontend
(BFF + tela) é atualizado na mesma fase. Views/likes/comentários aparecem no painel com os contadores
disponíveis (`viewsCount` = coluna criada agora, incrementada na Fase 05; likes/comentários = 0 até a Fase 06).

## TD-04.7 — Edição do canal com unicidade de nickname
**Decisão:** `GET/PATCH /channels/me` (nome 1–50, nickname `^[a-z0-9_]{3,50}$`, descrição ≤ 1000);
colisão → `CHANNEL_NICKNAME_TAKEN` 409 (violação de unicidade capturada com
`isPgUniqueViolationOnColumn`). Página pública: `GET /channels/:nickname` e
`GET /channels/:nickname/videos` (públicos, só vídeos públicos publicados). A listagem pública vive
num controller próprio dentro do `VideosModule` (`channels/:nickname/videos`) para evitar ciclo
`ChannelsModule ↔ VideosModule`.

## Decisions Summary
| TD | Tema | Decisão |
|---|---|---|
| 04.1 | Categorias | tabela fixa semeada por migration; `GET /categories` público |
| 04.2 | Publicação | `published_at`; publish exige `ready` |
| 04.3 | Visibilidade | enum `public|unlisted` no vídeo |
| 04.4 | Thumbnail custom | presigned PUT + confirm (≤5MB) + delete |
| 04.5 | Auth opcional | guard lê Bearer em rotas `@Public()` sem exigir |
| 04.6 | Painel | `GET /videos` paginado com filtros |
| 04.7 | Canal | `GET/PATCH /channels/me`; página pública por nickname |
