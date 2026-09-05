---
kind: phase
phase: 05
depends_on: [phase-04-management]
decisions: docs/decisions/technical-decisions-phase-05-watch.md
---

# Phase 05 — Página de Visualização do Vídeo

## Objective
Qualquer pessoa (logada ou não) assiste a um vídeo publicado pela sua URL única, com player,
informações, descrição expansível, contagem de views, download e sugestões da mesma categoria;
vídeos unlisted só por link.

## Step Implementations
| SI | Descrição |
|---|---|
| SI-05.1 | `GET /videos/slug/:slug` público (auth opcional) com regra de visibilidade |
| SI-05.2 | `stream`/`download` públicos para vídeos publicados (dono continua vendo rascunhos) |
| SI-05.3 | `POST /videos/:id/views` (incremento atômico) e `GET /videos/:id/related` |
| SI-05.4 | Testes unit/e2e; OpenAPI regenerado |
| SI-05F.1 | BFF: slug, related, views; stream/download/thumbnail com auth opcional |
| SI-05F.2 | `/watch/[slug]`: player, informações, descrição expansível, download, canal, sugestões, view tracker |
| SI-05F.3 | Cards públicos (canal/sugestões) linkam para `/watch/[slug]`; Studio linka "ver como público" |
| SI-05F.4 | Testes Vitest + Playwright (anônimo, unlisted por link, 404) |

## Authorization Matrix
| Ação | Regra |
|---|---|
| `GET /videos/slug/:slug`, `stream`, `download`, `thumbnail` | dono, ou qualquer um se publicado (`public` ou `unlisted`) |
| `POST /videos/:id/views`, `GET /videos/:id/related` | público (só vídeos publicados) |

## Error Catalog
Reutiliza `VIDEO_NOT_FOUND` (404) para vídeos inexistentes ou não visíveis e `VIDEO_NOT_READY` (409).

## Deliverables
- [x] Backend SI-05.1–05.4
- [x] Frontend SI-05F.1–05F.4
- [ ] Alinhamento visual com o Figma (pendente: MCP indisponível)
