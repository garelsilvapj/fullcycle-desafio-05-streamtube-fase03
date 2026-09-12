# phase-04-management — Progress

**Status:** completed (com pendência visual)
**Data:** 2026-09-04

| SI | Status | Testes | Observações |
|---|---|---|---|
| SI-04.1 Categorias | ✅ | unit + integração + e2e | tabela fixa semeada pela migration `CreateCategories`; `GET /categories` público |
| SI-04.2 Colunas de gerenciamento | ✅ | migrations spec | `category_id`, `visibility`, `published_at`, `custom_thumbnail_key`, `views_count` |
| SI-04.3 Auth opcional | ✅ | guard spec | `JwtAuthGuard` lê o Bearer em rotas `@Public()` sem exigir |
| SI-04.4 Edição/publicação/painel | ✅ | unit + e2e | `PATCH /videos/:id`, `publish/unpublish`, `GET /videos` paginado com filtros |
| SI-04.5 Thumbnail custom | ✅ | unit + e2e | presigned PUT + confirm (≤5MB) + delete; `GET /videos/:id/thumbnail` público p/ publicados |
| SI-04.6 Canal | ✅ | integração + e2e | `GET/PATCH /channels/me`, `GET /channels/:nickname[/videos]` públicos |
| SI-04.7 Testes/OpenAPI | ✅ | backend 272 unit+integração, 90 e2e | `openapi.json` regenerado (categories/channels/videos) |
| SI-04F.1 Contrato + BFF | ✅ | integração (categorias, publish, thumbnail, canal) | `withOptionalAuth` para a thumbnail pública |
| SI-04F.2 `/studio` | ✅ | E2E | tabela paginada com filtros, auto-refresh, links para edição/canal |
| SI-04F.3 `/studio/videos/[id]` | ✅ | wiring + E2E | edição, publicar/despublicar, thumbnail própria, exclusão |
| SI-04F.4 `/studio/channel` e `/c/[nickname]` | ✅ | wiring + E2E | edição do canal (409 no nickname) e página pública sem login |
| SI-04F.5 Testes | ✅ | 145 Vitest / 26 Playwright | — |

## Pendências

- **Figma:** telas do Studio, edição e página do canal sem inventário/drift audit (MCP indisponível).
- Likes e comentários no painel exibem 0 até a Fase 06; `viewsCount` só será incrementado na Fase 05.
- A página pública ainda não linka para a visualização (`/watch/[slug]` chega na Fase 05).
- Handle aberto intermitente no Jest do backend após a suíte completa (BullMQ/ioredis): a CI e o
  desenvolvimento usam `--forceExit`; investigar o leak é tarefa separada.
