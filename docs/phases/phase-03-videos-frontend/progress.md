# phase-03-videos-frontend — Progress

**Status:** completed (com pendência visual)
**SIs:** 9/9 completed
**Data:** 2026-09-04

| SI | Status | Testes | Observações |
|---|---|---|---|
| SI-03F.1 Contrato | ✅ | tsc | `openapi.json` + `types.gen.ts` regenerados com as 8 rotas de vídeo |
| SI-03F.2 withAuth/requireSession | ✅ | integração (401, refresh, refresh falho) | `refreshOnce` passou a ser exportado de `lib/auth/refresh.ts` |
| SI-03F.3 BFF | ✅ | 23 testes de integração | download/thumbnail usam `redirect: "manual"`; stream usa `parseAs: "stream"` |
| SI-03F.4 MSW | ✅ | — | ids reservados: `…404`, `…403`, `…409`; título `badrequest`; marca `[processing]` |
| SI-03F.5 Uploader/hook | ✅ | 7 + 4 | XHR falso em `lib/videos/__tests__/fake-xhr.ts` |
| SI-03F.6 Componentes | ✅ | 9 | tokens usados: `text-h1/h2/h3`, `text-label-*`, `text-body-*`, `text-caption`, `--radius-*` |
| SI-03F.7 Páginas | ✅ | E2E | `app/page.tsx` (boilerplate) substituído por `app/(app)/page.tsx` |
| SI-03F.8 Testes | ✅ | 115 Vitest / 19 Playwright | Playwright roda no host com o dev server `MSW_ENABLED=true` no container |
| SI-03F.9 CI/docs | ✅ | — | job `frontend` ganhou a checagem de frescor de `types.gen.ts` |

## Pendências

- **Figma:** as telas não passaram por `/screen-inventory`/drift audit (MCP indisponível). Quando
  o Figma estiver acessível: inventariar Upload / Meus vídeos / Vídeo, comparar com os componentes
  e ajustar (tokens já são os do design system).
- **Retomada de upload** após recarregar a página (persistir `uploadId`/partes) — futura.
- `userId`/`channelSlug` na sessão continuam vazios (o login não consulta `/auth/me`); necessário
  quando a Fase 04 precisar do canal no cliente.
