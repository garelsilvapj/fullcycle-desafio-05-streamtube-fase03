# Technical Decisions — Phase 03 (fatia frontend: vídeos)

Decisões da fatia `phase-03-videos-frontend` (upload, meus vídeos, player). Complementam
`technical-decisions-phase-03-videos.md` (backend) e reaproveitam as da Fase 02 frontend
(BFF estrito, iron-session, OpenAPI como fonte única, MSW server-side nos E2E).

> Contexto de processo: esta fatia foi planejada e implementada sem o inventário de telas do Figma
> (`/screen-inventory`), porque o MCP do Figma não estava disponível na sessão. As telas usam os
> componentes e tokens existentes do design system (`components/ui`, `globals.css`); o alinhamento
> visual com o Figma fica como pendência registrada em `docs/phases/phase-03-videos-frontend/progress.md`.

## TD-03F.1 — Upload direto do navegador para o storage (exceção documentada ao BFF)

**Contexto:** o BFF proíbe o navegador de falar com a API NestJS. O arquivo (até 10GB) não pode
passar pelo Next. **Decisão:** o navegador faz `PUT` direto na URL pré-assinada do **storage**
(MinIO/S3) devolvida pelo BFF (`POST /api/videos`). O alvo é o storage, não a API — a regra do BFF
continua intacta (`API_URL` segue server-only). **Alternativas descartadas:** proxy do arquivo pelo
Route Handler (memória/tempo no Next); upload pela API (mesmo problema). **Trade-off:** o storage
precisa de CORS para `PUT` a partir da origem do frontend (MinIO libera `*` por padrão) e o
endpoint público (`S3_PUBLIC_ENDPOINT`) deve ser alcançável pelo navegador.

## TD-03F.2 — Uploader no cliente com XMLHttpRequest e multipart paralelo

**Decisão:** `lib/videos/upload-client.ts` usa `XMLHttpRequest` (fetch não expõe progresso de
upload), fatia o arquivo por `partSize`, envia N partes em paralelo (default 3) coletando os
`ETag`s e chama `multipart/complete`; cancelamento via `AbortSignal` (aborta o XHR, depois
`multipart/abort` ou `DELETE` do rascunho). **Trade-off:** sem retomada após recarregar a página
(a retomada exigiria persistir `uploadId`/partes concluídas — candidata a fase futura).

## TD-03F.3 — Streaming pelo BFF com repasse de `Range`

**Decisão:** `GET /api/videos/[id]/stream` chama o upstream com `parseAs: "stream"`, repassa o
header `Range` e devolve o corpo como stream preservando 200/206/416 e
`Content-Type/Length/Range`, `Accept-Ranges`. O `<video>` aponta para o BFF, então o seek funciona.
**Alternativa:** redirect 302 para uma URL pré-assinada do storage (tira bytes do Next); fica para
a página pública da Fase 05, quando o acesso anônimo e o cache importarem. **Download e thumbnail**
já usam o redirect (o BFF repassa o 302 do upstream com `redirect: "manual"`).

## TD-03F.4 — Status por polling

**Decisão:** após confirmar, o hook `useVideoUpload` consulta `GET /api/videos/[id]` a cada 2s até
`ready|failed`; a lista e a página do vídeo recarregam (`router.refresh()`) enquanto houver
processamento. **Alternativa descartada por ora:** SSE/WebSocket (exige canal novo na API).

## TD-03F.5 — Chrome autenticado mínimo (header + logout)

**Decisão:** grupo de rotas `(app)` com `AppHeader` (links, e-mail da sessão, `LogoutButton` que
chama `POST /api/auth/logout`), fechando a lacuna da Fase 02 (rota de logout sem chamador). Páginas
autenticadas usam `requireSession()` (redirect para `/login`).

## TD-03F.6 — E2E: o storage é o único host substituído no navegador

**Decisão:** nos specs Playwright, `page.route("http://localhost:9000/**")` responde ao `PUT`
com `ETag`; `/api/**` continua real (regra da Fase 02). O upstream segue fake via MSW server-side
(`instrumentation.ts`), com ids/títulos reservados em `mocks/handlers/videos.ts`.

## Decisions Summary

| TD | Tema | Decisão |
|---|---|---|
| 03F.1 | Upload | PUT direto do navegador na URL pré-assinada do storage |
| 03F.2 | Uploader | XHR com progresso; multipart paralelo (3) com ETags; abort/cleanup |
| 03F.3 | Streaming | Proxy BFF com Range/206; download e thumbnail via 302 |
| 03F.4 | Status | Polling 2s no hook; `router.refresh()` na lista/detalhe |
| 03F.5 | Chrome | Grupo `(app)` com header, e-mail e logout; `requireSession()` |
| 03F.6 | E2E | `page.route` só no host do storage; BFF real; MSW server-side |
