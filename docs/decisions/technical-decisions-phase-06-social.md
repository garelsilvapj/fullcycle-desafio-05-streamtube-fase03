# Technical Decisions — Phase 06 (Interações Sociais)

Escopo (project-plan §Fase 06): like/dislike em vídeos e comentários, comentários com respostas
(aninhados), inscrição em canais, área de canais seguidos, contagem de inscritos — tudo para
usuários autenticados (anônimos só leem).

> Processo: sem `/screen-inventory` (MCP do Figma indisponível); telas com o design system existente.

## TD-06.1 — Reações como linha única por (usuário, alvo)
**Decisão:** tabelas `video_reactions(user_id, video_id, type)` e `comment_reactions(user_id,
comment_id, type)` com `UNIQUE (user_id, alvo)` e `type ∈ {like, dislike}`. `PUT` idempotente cria ou
troca a reação; `DELETE` remove. Contadores são agregados por consulta (`COUNT ... GROUP BY type`),
sem desnormalizar — volumes desta fase não justificam colunas de cache. **Abuso:** a unicidade por
usuário autenticado resolve "múltiplos likes" (project-plan §4); não há like anônimo.

## TD-06.2 — Comentários com um nível de resposta
**Decisão:** `comments(id, video_id, user_id, parent_id null, body ≤ 2000, created_at, deleted_at)`;
`parent_id` só pode apontar para comentário raiz (profundidade máxima **2**: comentário → resposta),
como sugere o ponto de atenção do plano. Exclusão é lógica (`deleted_at`) para preservar respostas;
o corpo de um comentário excluído não é servido. Só o autor exclui. Listagem paginada de raízes
(mais recentes primeiro) com respostas embutidas em ordem cronológica.

## TD-06.3 — Inscrições
**Decisão:** `subscriptions(subscriber_id, channel_id, created_at)` com `UNIQUE (subscriber_id,
channel_id)`; não é possível inscrever-se no próprio canal (`SUBSCRIPTION_SELF` 409). Contagem de
inscritos por consulta; `GET /me/subscriptions` lista canais seguidos com os últimos vídeos públicos.

## TD-06.4 — Somente vídeos publicados recebem interações
**Decisão:** reações e comentários exigem que o vídeo seja visível para o usuário
(`getViewable`), i.e. publicado; rascunhos de terceiros continuam invisíveis (404).

## TD-06.5 — Autor exposto de forma mínima
**Decisão:** respostas de comentários e reações expõem apenas `{ id, nickname, name }` do canal do
autor (nunca e-mail). Contagens (`likes`, `dislikes`, `comments`, `subscribers`) entram nos DTOs
públicos de vídeo e canal e no painel do Studio.

## TD-06.6 — Frontend: interações em Client Components pequenos sobre o BFF
**Decisão:** `ReactionBar` (like/dislike com estado otimista e rollback), `CommentsSection`
(lista + formulário + respostas + excluir), `SubscribeButton` (com contagem), página
`/subscriptions`. Anônimo vê contagens e comentários, e recebe CTA de login ao tentar interagir.

## Decisions Summary
| TD | Tema | Decisão |
|---|---|---|
| 06.1 | Reações | linha única por usuário/alvo; PUT idempotente; contagem por consulta |
| 06.2 | Comentários | 1 nível de resposta; exclusão lógica pelo autor; paginação de raízes |
| 06.3 | Inscrições | unique por par; sem auto-inscrição; feed dos canais seguidos |
| 06.4 | Visibilidade | interações só em vídeos publicados |
| 06.5 | Autor | `{ id, nickname, name }` do canal; contagens nos DTOs |
| 06.6 | Frontend | componentes otimistas sobre o BFF; anônimo lê e recebe CTA |
