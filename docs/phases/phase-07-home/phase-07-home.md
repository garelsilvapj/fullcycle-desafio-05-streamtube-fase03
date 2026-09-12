---
kind: phase
phase: 07
depends_on: [phase-06-social]
decisions: docs/decisions/technical-decisions-phase-07-home.md
---

# Phase 07 — Página Inicial, Busca e Finalização

## Objective
Entregar a porta de entrada da plataforma (home com grid, categorias, busca e navegação
responsiva), os testes dos fluxos principais e o ambiente de produção.

## Step Implementations
| SI | Descrição |
|---|---|
| SI-07.1 | `DiscoveryModule`: `GET /feed` (categoria opcional) e `GET /search` (título/canal), paginados e públicos |
| SI-07.2 | Migration `AddSearchIndexes` (pg_trgm + GIN) |
| SI-07.3 | Testes unit/e2e; OpenAPI |
| SI-07F.1 | BFF `/api/videos/feed` e `/api/search`; `VideoCard` reutilizável |
| SI-07F.2 | Home `/`: chips de categoria, grid, "carregar mais" (IntersectionObserver) |
| SI-07F.3 | `/search?q=` com paginação; busca no header; header responsivo |
| SI-07F.4 | Testes Vitest + Playwright (home, categoria, busca, mobile viewport) |
| SI-07P.1 | Dockerfiles de produção (API, frontend), `compose.prod.yaml`, `.env.production.example`, helmet/shutdown hooks |
| SI-07P.2 | `docs/deploy.md` (runbook) e job de build das imagens na CI |
| SI-07P.3 | Jornada completa em `scripts/browser-validation.mjs` |

## API Contracts
| Método | Rota | Auth | Resposta |
|---|---|---|---|
| GET | `/feed?category&page&limit` | público | `PaginatedVideosResponseDto` (com `channel` e `category`) |
| GET | `/search?q&page&limit` | público | `PaginatedVideosResponseDto` |

## Deliverables
- [x] Backend SI-07.1–07.3
- [x] Frontend SI-07F.1–07F.4
- [x] Produção SI-07P.1–07P.3
- [ ] Alinhamento visual com o Figma (pendente: MCP indisponível)
