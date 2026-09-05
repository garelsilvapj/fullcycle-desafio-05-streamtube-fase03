# phase-06-social — Progress

**Status:** completed (com pendência visual)
**Data:** 2026-09-05

| SI | Status | Testes | Observações |
|---|---|---|---|
| SI-06.1 Migration + entidades | ✅ | migrations spec | `video_reactions`, `comments`, `comment_reactions`, `subscriptions`; enum `reaction_type_enum` |
| SI-06.2 Reações | ✅ | e2e | `INSERT … ON CONFLICT DO UPDATE` (idempotente); contagens por consulta agrupada |
| SI-06.3 Comentários | ✅ | unit + e2e | 1 nível de resposta (`COMMENT_REPLY_DEPTH`); exclusão lógica pelo autor |
| SI-06.4 Inscrições | ✅ | unit + e2e | `ON CONFLICT DO NOTHING`; `SUBSCRIPTION_SELF`; `GET /me/subscriptions` com últimos vídeos |
| SI-06.5 Agregados | ✅ | e2e | `GET /social/videos/:id` (público) e `GET /social/videos?ids=` (painel) num `SocialModule` para evitar ciclos |
| SI-06.6 Testes/OpenAPI | ✅ | backend 282 unit+integração / 99 e2e | — |
| SI-06F.1 BFF | ✅ | integração | reações, comentários, respostas, inscrições (`/api/channels/by-id/:id/subscription`), `/api/social/videos/:id`, `/api/me/subscriptions` |
| SI-06F.2 Componentes | ✅ | wiring + E2E | `ReactionBar` (otimista + rollback), `CommentsSection`, `SubscribeButton`; anônimo vê contagens e CTAs |
| SI-06F.3 `/subscriptions` | ✅ | E2E | canais seguidos + últimos vídeos |
| SI-06F.4 Studio | ✅ | E2E | likes/comentários reais via `GET /social/videos?ids=` |
| SI-06F.5 Testes | ✅ | 164 Vitest / 34 Playwright | — |

## Pendências

- **Figma:** componentes sociais sem inventário/drift audit (MCP indisponível).
- Contagens de reações/comentários são agregadas por consulta (TD-06.1); desnormalizar se o volume exigir.
- Sem paginação de comentários na UI (a API pagina; a seção carrega a primeira página de 20).
- Sem notificações/moderação (fora do escopo do plano).
