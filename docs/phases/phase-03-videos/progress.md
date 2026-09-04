# Phase 03 — Progress

Acompanhamento da implementação (skill `implement`). Atualizado a cada Step Implementation.

| SI | Descrição | Status |
|---|---|---|
| SI-03.1 | Deps, config (storage/queue), infra MinIO+Redis+worker no compose | ✅ feito |
| SI-03.2 | Entidade `Video` + migration + estados | ✅ feito |
| SI-03.3 | `StorageService` (presigned, range) | ✅ feito |
| SI-03.4 | Módulo de vídeos (registro/confirmação/consulta) | ✅ feito |
| SI-03.5 | Streaming (Range) e download | ✅ feito |
| SI-03.6 | Fila producer (BullMQ) | ✅ feito |
| SI-03.7 | Worker FFmpeg (thumbnail + transcode) | ✅ feito |
| SI-03.8 | Wiring no AppModule + CLAUDE.md | ✅ feito |

## Notas

- Código escrito seguindo as convenções das Fases 01–02 (config `registerAs`, `DomainException`,
  JWT). O build completo requer `npm install` no `nestjs-project/` e no `worker/`.
- Processamento real de vídeo exige FFmpeg instalado (já previsto na imagem do worker).

## Fechamento da fase (pendente)

Os 8 SIs do plano original estão implementados, mas a fase **não está fechada**. A auditoria de
2026-09-04 (`docs/evolution-plan.md`, Parte A.4) encontrou lacunas de autorização, máquina de
estados, streaming, resiliência do worker, testes (só 14 unitários; zero integração/e2e; zero no
worker), CI e ausência da fatia frontend. O fechamento segue as etapas do plano de evolução:

| Etapa | Escopo | Status |
|---|---|---|
| 0 | Verdade do repositório e higiene (docs, `worker/worker/`, `.gitignore`, `.env.example`) | ✅ feito (2026-09-04) |
| 1 | Hardening do backend (endpoint público de assinatura, response DTO, autorização, estados, `DELETE`, slug, OpenAPI) | ✅ feito (2026-09-04) — 71 testes unitários em videos/storage/queue; `openapi.json` regenerado |
| 2 | Worker resiliente (módulos, política de falha, shutdown, Dockerfile, testes) | ✅ feito (2026-09-04) — 17 testes (Vitest; FFmpeg real na imagem `--target test`) |
| 3 | Testes de integração e e2e (vídeos, storage, fila, migrations) | ✅ feito (2026-09-04) — 252 unit+integração e 69 e2e verdes (`--runInBand`) |
| 4 | Validação funcional local (`scripts/smoke-videos.sh` + `manual-validation.md`) | ⏳ |
| 5 | CI completa (unit, integração/e2e com serviços, worker, frontend, openapi-freshness) | ⏳ |
| 6 | Fatia `phase-03-videos-frontend` (upload, meus vídeos, player) | ⏳ |
| 7 | Fechamento (docs, suíte completa verde, tag) | ⏳ |

Para rodar de ponta a ponta hoje: `cd nestjs-project && cp .env.example .env && docker compose up -d --build`,
`docker compose exec nestjs-api npm install && docker compose exec nestjs-api npm run migration:run`,
`docker compose exec -d nestjs-api npm run start:dev`; fluxo registrar → `PUT` na URL pré-assinada →
confirmar → worker processa → `GET /stream`. Observação: a URL pré-assinada usa o host `minio`, então
o `PUT` a partir do host exige `S3_PUBLIC_ENDPOINT` (Etapa 1.1) ou uma entrada `minio` no `/etc/hosts`.
