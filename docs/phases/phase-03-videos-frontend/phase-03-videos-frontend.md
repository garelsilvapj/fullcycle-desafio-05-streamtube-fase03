---
kind: phase
phase: 03
slice: videos-frontend
depends_on: [phase-03-videos, phase-02-auth-frontend]
decisions: docs/decisions/technical-decisions-phase-03-videos-frontend.md
---

# Phase 03 — Fatia frontend: upload, meus vídeos e player

## Objective

Entregar no Next.js o ciclo do vídeo sobre a API da Fase 03: enviar um arquivo (até 10GB, single
ou multipart) direto ao storage com progresso, acompanhar o processamento, listar os vídeos do
canal e assistir com streaming (Range) — tudo pelo BFF, com sessão iron-session e refresh
transparente, MSW nos testes e sem expor a API ao navegador.

## Step Implementations

| SI | Descrição | Entregável |
|---|---|---|
| SI-03F.1 | Contrato: `openapi.json` sincronizado e `types.gen.ts` regenerado; aliases em `lib/api/contracts.ts` | `RegisterVideoDto`, `Video`, `VideoList`, `RegisterVideoResponse`, `UploadPlan`, `CompletedPart`… |
| SI-03F.2 | Helper `withAuth` (`lib/api/authorized.ts`): Bearer da sessão + 1 refresh em 401; `requireSession()` | 401 sem sessão; retry com token novo |
| SI-03F.3 | BFF `app/api/videos/**`: list/register, get/delete, confirm, multipart complete/abort, stream (Range), download/thumbnail (302) | 8 Route Handlers |
| SI-03F.4 | MSW: `mocks/handlers/videos.ts` + `mocks/factories/videos.ts` (ids/títulos reservados) | fixtures tipadas por `paths` |
| SI-03F.5 | Cliente de upload (`lib/videos/upload-client.ts`) e hook `useVideoUpload` | XHR com progresso, multipart paralelo, cancelamento, polling |
| SI-03F.6 | UI: `AppHeader` + `LogoutButton`, `UploadForm`, `VideoList`, `VideoPlayer`, `VideoStatusBadge`, `VideoStatusPoller`, `DeleteVideoButton` | componentes em `components/videos` e `components/layout` |
| SI-03F.7 | Páginas `(app)`: `/` (mínima), `/upload`, `/videos`, `/videos/[id]` | RSC com `requireSession()` e leitura server-side |
| SI-03F.8 | Testes: Vitest (unit + integração dos handlers com MSW) e Playwright (upload, lista, player) | 115 Vitest, 19 E2E |
| SI-03F.9 | CI: frescor de `types.gen.ts`; docs | job `frontend` estendido |

## UI Contracts

| Rota | Auth | Conteúdo |
|---|---|---|
| `/` | — | CTA para entrar/criar conta ou enviar/listar (home real é Fase 07) |
| `/upload` | sessão | formulário título/descrição/arquivo; barra de progresso; fases `registering → uploading → confirming → processing → ready|failed`; cancelar; link "Assistir" |
| `/videos` | sessão | grid de cards (thumbnail via `/api/videos/:id/thumbnail`, título, badge de status, duração/tamanho); auto-refresh enquanto houver processamento; estado vazio com CTA |
| `/videos/[id]` | sessão | player `<video src="/api/videos/:id/stream">` quando `ready`; painel de status (processando/falhou + erro) caso contrário; download; excluir; 404 se não existir/não for do canal |

## BFF Contracts (`app/api/videos`)

| Método | Rota BFF | Upstream | Resposta |
|---|---|---|---|
| GET | `/api/videos` | `GET /videos` | `VideoList` |
| POST | `/api/videos` | `POST /videos` | 201 `RegisterVideoResponse` |
| GET/DELETE | `/api/videos/[id]` | `GET/DELETE /videos/{id}` | `Video` / 204 |
| POST | `/api/videos/[id]/confirm` | `POST /videos/{id}/confirm` | `Video` |
| POST | `/api/videos/[id]/multipart/complete` | idem | `Video` |
| POST | `/api/videos/[id]/multipart/abort` | idem | 204 |
| GET | `/api/videos/[id]/stream` | `GET /videos/{id}/stream` (Range) | stream 200/206/416 com headers preservados |
| GET | `/api/videos/[id]/download`, `/thumbnail` | idem | 302 para a URL pré-assinada |

Erros: envelope `ApiErrorEnvelope` repassado com o status do upstream; 401 próprio quando não há
sessão ou o refresh falha.

## Tests

- Unit: `lib/videos/__tests__/{upload-client,format}.test.ts`, `components/videos/__tests__/*`,
  `components/auth/__tests__/logout-button.test.tsx`.
- Integração (handlers como função + MSW): `app/api/videos/**/__tests__/*.integration.test.ts`
  (sessão selada via cookie mock; refresh em 401; Range → 206; 302 do download).
- Hook: `hooks/__tests__/use-video-upload.test.tsx` (fluxo completo, falha, erro, cancelamento).
- E2E: `tests/videos-{upload,list,player}.e2e-spec.ts` (dev server com `MSW_ENABLED=true`;
  storage substituído por `page.route` — TD-03F.6).

## Deliverables

- [x] Contrato sincronizado (`openapi.json`, `types.gen.ts`) e aliases
- [x] BFF de vídeos com sessão/refresh
- [x] Uploader single/multipart com progresso e cancelamento
- [x] Telas upload / meus vídeos / vídeo + header com logout
- [x] Vitest + Playwright verdes; CI com frescor dos tipos
- [ ] Alinhamento visual com o Figma (pendente: MCP do Figma indisponível na sessão)
