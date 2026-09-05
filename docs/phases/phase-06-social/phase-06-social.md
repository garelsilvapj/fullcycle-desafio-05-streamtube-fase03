---
kind: phase
phase: 06
depends_on: [phase-05-watch]
decisions: docs/decisions/technical-decisions-phase-06-social.md
---

# Phase 06 — Interações Sociais (Likes, Comentários, Inscrições)

## Objective
Usuários autenticados reagem (like/dislike) a vídeos e comentários, comentam e respondem, e se
inscrevem em canais; anônimos veem contagens e comentários. A página do canal mostra inscritos e o
usuário tem uma área com os canais seguidos.

## Step Implementations (backend)
| SI | Descrição |
|---|---|
| SI-06.1 | Migration `CreateSocialTables` (video_reactions, comments, comment_reactions, subscriptions) + entidades |
| SI-06.2 | `ReactionsModule`: `PUT/DELETE /videos/:id/reaction`, `PUT/DELETE /comments/:id/reaction`; contagens |
| SI-06.3 | `CommentsModule`: `GET/POST /videos/:id/comments`, `POST /comments/:id/replies`, `DELETE /comments/:id` |
| SI-06.4 | `SubscriptionsModule`: `PUT/DELETE /channels/:id/subscription`, `GET /me/subscriptions`; `subscribersCount` no canal |
| SI-06.5 | Contagens nos DTOs de vídeo (`likes`, `dislikes`, `commentsCount`, `myReaction`) e no painel |
| SI-06.6 | Testes unit/integração/e2e; OpenAPI |

## Step Implementations (frontend)
| SI | Descrição |
|---|---|
| SI-06F.1 | BFF de reações, comentários e inscrições |
| SI-06F.2 | `ReactionBar`, `CommentsSection`, `SubscribeButton` em `/watch/[slug]` e `/c/[nickname]` |
| SI-06F.3 | `/subscriptions` (canais seguidos + últimos vídeos) |
| SI-06F.4 | Painel do Studio mostra likes/comentários reais |
| SI-06F.5 | Testes Vitest + Playwright |

## Data Model
| Tabela | Colunas | Restrições |
|---|---|---|
| video_reactions | id, video_id fk, user_id fk, type enum(like,dislike), created_at | UNIQUE(video_id,user_id) |
| comments | id, video_id fk, user_id fk, parent_id fk null, body text(≤2000), created_at, updated_at, deleted_at | index(video_id, created_at); parent só raiz |
| comment_reactions | id, comment_id fk, user_id fk, type, created_at | UNIQUE(comment_id,user_id) |
| subscriptions | id, channel_id fk, subscriber_id fk, created_at | UNIQUE(channel_id,subscriber_id) |

## Authorization Matrix
| Ação | Regra |
|---|---|
| ler contagens/comentários | público (vídeo publicado) |
| reagir, comentar, responder, inscrever-se | autenticado; vídeo visível |
| excluir comentário | autor |
| inscrever-se no próprio canal | proibido (409) |

## Error Catalog
| Código | HTTP | Quando |
|---|---|---|
| `COMMENT_NOT_FOUND` | 404 | id inexistente/excluído |
| `COMMENT_FORBIDDEN` | 403 | excluir comentário de outro |
| `COMMENT_REPLY_DEPTH` | 400 | responder a uma resposta |
| `SUBSCRIPTION_SELF` | 409 | inscrever-se no próprio canal |

## Deliverables
- [x] Backend SI-06.1–06.6
- [x] Frontend SI-06F.1–06F.5
- [ ] Alinhamento visual com o Figma (pendente: MCP indisponível)
