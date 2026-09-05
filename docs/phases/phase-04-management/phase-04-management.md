---
kind: phase
phase: 04
depends_on: [phase-03-videos, phase-03-videos-frontend]
decisions: docs/decisions/technical-decisions-phase-04-management.md
---

# Phase 04 — Gerenciamento de Vídeos e Canal

## Objective
Permitir ao dono do canal editar e publicar seus vídeos (título, descrição, categoria, thumbnail
customizada, visibilidade), gerenciá-los num painel paginado, editar o canal (nome, nickname,
descrição) e expor a página pública do canal com os vídeos publicados.

## Step Implementations (backend)
| SI | Descrição |
|---|---|
| SI-04.1 | `CategoriesModule` (entidade, migration com seed, `GET /categories` público) |
| SI-04.2 | Migration `AddVideoManagementColumns`: `category_id`, `visibility`, `published_at`, `custom_thumbnail_key`, `views_count` |
| SI-04.3 | `JwtAuthGuard` com autenticação opcional em rotas públicas |
| SI-04.4 | `PATCH /videos/:id`, `POST /videos/:id/{publish,unpublish}`, `GET /videos` paginado/filtrado |
| SI-04.5 | Thumbnail custom: `POST /videos/:id/thumbnail`, `POST …/thumbnail/confirm`, `DELETE …/thumbnail`; `GET …/thumbnail` público para publicados |
| SI-04.6 | Canal: `GET/PATCH /channels/me`, `GET /channels/:nickname` e `GET /channels/:nickname/videos` públicos |
| SI-04.7 | Testes unit/integração/e2e; OpenAPI regenerado |

## Step Implementations (frontend)
| SI | Descrição |
|---|---|
| SI-04F.1 | Tipos/contratos regenerados; BFF: categorias, PATCH/publish/unpublish, thumbnail, canal, página pública |
| SI-04F.2 | `/studio` (painel paginado: thumb, título, status, publicação, views/likes/comentários) |
| SI-04F.3 | `/studio/videos/[id]` (editar título/descrição/categoria/visibilidade, thumbnail custom, publicar) |
| SI-04F.4 | `/studio/channel` (editar canal) e `/c/[nickname]` (página pública) |
| SI-04F.5 | Testes Vitest + Playwright |

## Data Model (deltas)
| Tabela | Coluna | Tipo | Notas |
|---|---|---|---|
| categories | id, name, slug, created_at | uuid, varchar(60) unique ×2, timestamptz | seed fixo |
| videos | category_id | uuid null fk | ON DELETE SET NULL |
| videos | visibility | enum(public, unlisted) default public | |
| videos | published_at | timestamptz null | null = rascunho |
| videos | custom_thumbnail_key | varchar null | thumb servida = custom ?? gerada |
| videos | views_count | int default 0 | incrementada na Fase 05 |

## Authorization Matrix
| Ação | Regra |
|---|---|
| editar / publicar / thumbnail / listar painel | dono do canal |
| `GET /categories`, `GET /channels/:nickname`, `GET /channels/:nickname/videos` | público |
| `GET /videos/:id/thumbnail` | dono, ou qualquer um se publicado |
| stream / download | dono (público na Fase 05) |

## Error Catalog (novos)
| Código | HTTP | Quando |
|---|---|---|
| `CATEGORY_NOT_FOUND` | 404 | `categoryId` inexistente |
| `VIDEO_NOT_PUBLISHABLE` | 409 | publish sem `ready` |
| `VIDEO_THUMBNAIL_INVALID` | 400 | tipo não suportado, objeto ausente ou > 5MB |
| `CHANNEL_NOT_FOUND` | 404 | nickname inexistente / usuário sem canal |
| `CHANNEL_NICKNAME_TAKEN` | 409 | nickname já usado |

## Deliverables
- [x] Backend SI-04.1–04.7 com testes
- [x] Frontend SI-04F.1–04F.5 com testes
- [x] OpenAPI + tipos sincronizados; CI verde
- [ ] Alinhamento visual com o Figma (pendente: MCP indisponível)
