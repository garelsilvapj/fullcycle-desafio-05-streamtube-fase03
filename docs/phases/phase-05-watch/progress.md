# phase-05-watch — Progress

**Status:** completed (com pendência visual)
**Data:** 2026-09-05

| SI | Status | Testes | Observações |
|---|---|---|---|
| SI-05.1 `GET /videos/slug/:slug` | ✅ | unit + e2e | público com auth opcional; 404 para não publicados de terceiros |
| SI-05.2 stream/download públicos | ✅ | e2e (`watch`, `videos`) | `readyKey(userId|null)` usa `getViewable`; rascunho de terceiro → 404 |
| SI-05.3 views + related | ✅ | unit + e2e | `repo.increment` atômico; sugestões por categoria com fallback |
| SI-05.4 Testes/OpenAPI | ✅ | backend | `openapi.json` regenerado |
| SI-05F.1 BFF | ✅ | integração | slug/related/views; stream/download com `withOptionalAuth` |
| SI-05F.2 `/watch/[slug]` | ✅ | E2E | player nativo, meta (views/data/categoria), download, canal, descrição expansível, `ViewTracker` |
| SI-05F.3 Links públicos | ✅ | E2E | cards do canal e sugestões → `/watch/[slug]`; Studio "ver como público" |
| SI-05F.4 Testes | ✅ | 151 Vitest / 30 Playwright | — |

## Pendências

- **Figma:** página de visualização sem inventário/drift audit (MCP indisponível).
- Views sem dedupe por sessão/IP (TD-05.3) — evoluir se houver abuso.
- Stream passa pela API/BFF (TD-05.2); 302 para o storage é otimização futura.
- `PublishToggle` mostra a data em UTC (formatação determinística para evitar erro de hidratação).
