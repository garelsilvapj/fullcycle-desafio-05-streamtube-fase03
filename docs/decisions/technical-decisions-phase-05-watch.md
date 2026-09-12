# Technical Decisions — Phase 05 (Página de Visualização do Vídeo)

Escopo (project-plan §Fase 05): player com controles, layout vídeo + informações + sidebar,
descrição expansível, contagem de visualizações, sugestões da mesma categoria, acesso anônimo,
download e vídeos unlisted só por link.

> Processo: sem `/screen-inventory` (MCP do Figma indisponível); telas com o design system existente.

## TD-05.1 — Recurso público por slug
**Decisão:** `GET /videos/slug/:slug` (público, auth opcional) devolve o vídeo publicado (`public` ou
`unlisted`); rascunhos e vídeos não processados respondem 404 para quem não é o dono (não revelam
existência). O `slug` de 11 chars é a URL única do brief; o `id` continua interno ao painel.

## TD-05.2 — Stream e download públicos pela mesma regra de visibilidade
**Decisão:** `GET /videos/:id/stream` e `/download` passam a `@Public()` com auth opcional e usam
`getViewable` (dono **ou** publicado). O stream continua via API com Range/206 (sem redirect ao
storage) para manter a URL estável e a regra de acesso no servidor; o download já redireciona para a
URL pré-assinada. **Trade-off:** bytes do stream passam pela API/BFF — aceitável nesta fase; um 302
para o storage é otimização futura.

## TD-05.3 — Contagem de visualizações simples, disparada pelo player
**Decisão:** `POST /videos/:id/views` (público) incrementa `views_count` atomicamente
(`repo.increment`) só para vídeos publicados; o frontend chama uma vez por carregamento, no primeiro
evento `play`. **Alternativas descartadas:** dedupe por IP/sessão (tabela `video_views`) — sem
autenticação obrigatória o ganho é pequeno e adiciona tabela; fica como evolução se houver abuso.

## TD-05.4 — Sugestões por categoria
**Decisão:** `GET /videos/:id/related?limit=` (público) lista vídeos públicos publicados e prontos da
mesma categoria (excluindo o próprio), mais recentes primeiro; sem categoria, cai para os mais
recentes da plataforma. **Trade-off:** sem ranking por relevância (Fase 07 pode evoluir com busca).

## TD-05.5 — Página `/watch/[slug]` como RSC pública
**Decisão:** página pública (sem `requireSession`) que lê vídeo + relacionados no servidor; player
HTML5 nativo (`controls`: play/pause, volume, progresso) apontando para o proxy BFF; descrição
expansível e disparo de view em Client Components pequenos. Vídeos `unlisted` abrem pela URL, mas
não aparecem em listagens nem nas sugestões.

## Decisions Summary
| TD | Tema | Decisão |
|---|---|---|
| 05.1 | Slug | `GET /videos/slug/:slug` público; 404 para não publicados de terceiros |
| 05.2 | Stream/download | públicos para publicados (auth opcional); stream via API com Range |
| 05.3 | Views | `POST /videos/:id/views`, incremento atômico, 1× por `play` |
| 05.4 | Sugestões | mesma categoria, públicos publicados; fallback recentes |
| 05.5 | Página | `/watch/[slug]` RSC pública, player nativo, unlisted só por link |
