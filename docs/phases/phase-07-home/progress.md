# phase-07-home — Progress

**Status:** completed (com pendência visual)
**Data:** 2026-09-05

| SI | Status | Testes | Observações |
|---|---|---|---|
| SI-07.1 `DiscoveryModule` | ✅ | e2e | `GET /feed?category&page&limit` e `GET /search?q&page&limit`, públicos, só público + publicado + ready |
| SI-07.2 Índices de busca | ✅ | migrations spec | `pg_trgm` + GIN em `videos.title`, `channels.name`, `channels.nickname` |
| SI-07.3 Testes/OpenAPI | ✅ | backend | `escapeLike` unit; e2e de feed (filtro, paginação, exclusões) e busca (título/canal, validação) |
| SI-07F.1 BFF + `VideoCard` | ✅ | integração | `/api/videos/feed`, `/api/search` |
| SI-07F.2 Home | ✅ | wiring + E2E | chips de categoria (`?category=`), grid, "carregar mais" + IntersectionObserver |
| SI-07F.3 Busca + header | ✅ | wiring + E2E | `/search?q=` paginado; busca no header (GET nativo antes da hidratação); links colapsam por breakpoint |
| SI-07F.4 Testes | ✅ | 169 Vitest / 38 Playwright | inclui viewport mobile sem scroll horizontal |
| SI-07P.1 Produção | ✅ | build local + CI | `nestjs-project/Dockerfile`, `next-frontend/Dockerfile` (standalone), `compose.prod.yaml`, `.env.production.example`, `helmet` + shutdown hooks |
| SI-07P.2 Runbook + CI | ✅ | — | `docs/deploy.md`; job `prod-images` constrói as imagens e valida o compose |
| SI-07P.3 Jornada completa | ✅ | `scripts/browser-validation.mjs` | cadastro → upload → publicar → home/busca/watch anônimo → like/comentário/inscrição → exclusão |

## Pendências

- **Figma:** home, busca e header sem inventário/drift audit (MCP indisponível).
- Produção: TLS/reverse proxy, CDN, observabilidade e autoscaling ficam fora do compose (documentado em `docs/deploy.md`).
- Busca sem ranking por relevância (ordena por data de publicação).
