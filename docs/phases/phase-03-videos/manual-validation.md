# Phase 03 — Validação funcional local

Roteiro para validar a Fase 03 **com a aplicação rodando** (Docker Compose), reproduzível por
qualquer pessoa. A versão automatizada é `scripts/smoke-videos.sh` (host: bash, curl, jq, docker).

## 1. Subir a stack

```bash
cd nestjs-project
cp .env.example .env                                   # primeira vez
docker compose up -d --build                           # db, mailpit, redis, minio(+bucket), worker, api (idle)
docker compose exec nestjs-api npm install             # primeira vez
docker compose exec nestjs-api npm run migration:run
docker compose exec -d nestjs-api npm run start:dev    # API em watch mode
```

Verificar prontidão (host):

```bash
docker compose ps                                  # todos "running"/"healthy"; createbuckets "exited (0)"
docker compose exec db pg_isready -U streamtube    # accepting connections
docker compose exec redis redis-cli ping           # PONG
curl -sf http://localhost:9000/minio/health/live   # 200
docker compose logs worker | tail -1               # {"level":"info","msg":"ouvindo a fila 'video-processing'",...}
curl http://localhost:3000                         # Hello World!
```

## 2. Rodar o smoke automatizado

```bash
bash scripts/smoke-videos.sh                # fluxo completo (inclui multipart de 150MB, ~3-5 min)
bash scripts/smoke-videos.sh --skip-multipart
```

O script cria usuários próprios, obtém o token de confirmação pela API do Mailpit, gera um MP4
sintético com o FFmpeg do container do worker e valida cada passo (asserções ✔/✘, saída 1 em falha).

## 3. Roteiro manual (api.http ou curl)

| # | Passo | Esperado |
|---|---|---|
| 1 | `POST /auth/register` → link no Mailpit (http://localhost:8025) → `GET /auth/confirm-email?token=` → `POST /auth/login` | 201 / 204 / 200 com `access_token` |
| 2 | `POST /videos {title, sizeBytes}` (Bearer) | 201 `{ video: {id, slug, status: uploading, ...}, upload: {type: single, url} }`; `url` começa com `http://localhost:9000` |
| 3 | `PUT <url>` com o arquivo (`Content-Type: video/mp4`) | 200 do MinIO |
| 4 | `POST /videos/:id/confirm` | 200 `status: uploaded`, `sizeBytes` = tamanho enviado; repetir → 409 `VIDEO_INVALID_STATE` |
| 5 | `docker compose logs -f worker` | `job recebido` → `original baixado` → `vídeo pronto` (JSON) |
| 6 | `GET /videos/:id` (poll) | `status: ready`, `durationSec` ≈ duração real, `sizeBytes` do MP4 processado, `thumbnailUrl`, sem `*_key` |
| 7 | `GET /videos/:id/stream` com `Range: bytes=0-1023` | 206, `Content-Range: bytes 0-1023/<total>`, `Content-Length: 1024` |
| 8 | `GET /videos/:id/stream` sem Range | 200, `Accept-Ranges: bytes`, `Content-Length` = total |
| 9 | `GET /videos/:id/stream` com `Range: bytes=<total+10>-` | 416 `VIDEO_INVALID_RANGE`, `Content-Range: bytes */<total>` |
| 10 | `GET /videos/:id/download` | 302 para URL pré-assinada; o arquivo baixado abre em um player (H.264/AAC) |
| 11 | `GET /videos/:id/thumbnail` | 302; arquivo JPEG |
| 12 | Mesmo `GET/DELETE` com o token de **outro** usuário | 403 `VIDEO_CHANNEL_FORBIDDEN` |
| 13 | `POST /videos` com `sizeBytes` > 100MB | `upload.type: multipart` com `uploadId`, `partSize`, `parts[]` |
| 14 | `PUT` de cada parte, guardando o header `ETag`; `POST /videos/:id/multipart/complete {uploadId, parts}` | 200 `status: uploaded` |
| 15 | `POST /videos/:id/multipart/abort {uploadId}` em upload aberto | 204; `GET` → 404 |
| 16 | `DELETE /videos/:id` | 204; `GET` → 404; objetos somem do MinIO (console http://localhost:9001) |

## 4. Cenários de resiliência (manual)

- **Worker morto no meio do transcode:** confirme um vídeo longo (ex.: `duration=600` no ffmpeg),
  aguarde o log `original baixado` e rode `docker compose kill worker && docker compose up -d worker`.
  Esperado: o BullMQ reentrega o job (stalled/retry), o status volta a `processing` e termina `ready`.
- **Conteúdo inválido:** suba um arquivo que não é vídeo. Esperado: após 5 tentativas com backoff, `status: failed` e `error` preenchido (`ffprobe falhou`), visível só para o dono.
- **API responsiva durante o processamento:** com um transcode em andamento, `curl -w '%{time_total}' http://localhost:3000/` deve continuar abaixo de 200ms (o processamento é em outro processo).

## 5. Validação no navegador (frontend + backend reais)

Com o backend no ar (API em `start:dev`) e o frontend em `npm run dev` **sem** `MSW_ENABLED`:

```bash
cd next-frontend && npx playwright install chromium     # uma vez
node scripts/browser-validation.mjs                      # do repo root; OUT_DIR=... para screenshots
```

O script registra e confirma um usuário pela API + Mailpit, faz login pela UI, envia
`tmp/smoke/sample.mp4` pela tela `/upload` (PUT direto no MinIO a partir do navegador), espera o
worker (`ready`), abre `/videos/[id]`, verifica que o player carregou metadados e fez seek via
`206 Partial Content` do BFF, confere a lista e exclui o vídeo pela UI.

Manual equivalente: entrar em http://localhost:3001/login, enviar um vídeo em `/upload`, acompanhar a
barra e o status, abrir "Assistir", arrastar a barra do player (deve buscar sem baixar tudo), baixar,
voltar para "Meus vídeos" e excluir.

## 6. Registro de execuções

| Data | Executor | Comando | Resultado |
|---|---|---|---|
| 2026-09-04 | Claude (sessão do plano) | `bash scripts/smoke-videos.sh` | 58/59 ✔ — fluxo completo incl. multipart (150MB → `failed` após 5 tentativas com `ffprobe falhou`); a única falha era do próprio script (`grep` ausente no container do MinIO), corrigida |
| 2026-09-04 | Claude (sessão do plano) | `bash scripts/smoke-videos.sh --skip-multipart` | 46/46 ✔ após `@SkipThrottle()` nas rotas de vídeo (o limite global de 10 req/min derrubava o polling com 429) |
| 2026-09-04 | Claude (sessão do plano) | `node scripts/browser-validation.mjs` | 12/12 ✔ — Chromium headless contra API + worker + MinIO reais: PUT direto do navegador (CORS ok), `ready` pelo worker, player com `206` e seek, exclusão |
| 2026-09-05 | Claude (sessão do plano) | `bash scripts/smoke-videos.sh --skip-multipart` | 61/61 ✔ — inclui a seção 8c da Fase 04 (editar, publicar, canal público, thumbnail pública, painel filtrado) |
