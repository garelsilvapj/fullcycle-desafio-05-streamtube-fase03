# Deploy (produção single-host) — Fase 07

## Topologia
`compose.prod.yaml` sobe: Postgres 17 (volume), Redis 7 (AOF, volume), MinIO (volume; porta 9000 para as
URLs pré-assinadas), `createbuckets`, **API** (imagem `nestjs-project/Dockerfile`, roda `migration:run`
no start), **worker** (`worker/Dockerfile` target `runtime`) e **frontend** (`next-frontend/Dockerfile`,
standalone). O frontend fala com a API por `http://api:3000` (BFF); o navegador só alcança o frontend
(3001) e o storage (9000). Um reverse proxy externo (nginx/traefik/caddy) termina TLS e roteia:
`https://app` → `frontend:3001`, `https://storage` → `minio:9000`.

## Primeira subida
```bash
cp .env.production.example .env.production      # preencha segredos (openssl rand -hex 32)
docker compose -f compose.prod.yaml --env-file .env.production up -d --build
docker compose -f compose.prod.yaml ps           # api/worker/frontend "healthy"/"running"
curl -sf http://localhost:3001/ >/dev/null && echo frontend ok
```

## Atualização
```bash
git pull
docker compose -f compose.prod.yaml --env-file .env.production up -d --build api worker frontend
```
As migrations são idempotentes e rodam no start da API (`typeorm migration:run`).

## Verificações pós-deploy
- `docker compose -f compose.prod.yaml logs -f worker` mostra `ouvindo a fila 'video-processing'`.
- Cadastro → e-mail de confirmação chega pelo SMTP configurado (`MAIL_*`).
- Upload de um vídeo pequeno termina `ready` e toca em `/watch/<slug>` (Range/206 pelo BFF).
- `S3_PUBLIC_ENDPOINT` precisa ser a URL pública do storage (com TLS), senão o `PUT` do navegador falha.

## Backups e operação
- Postgres: `docker compose -f compose.prod.yaml exec db pg_dump -U $DB_USERNAME $DB_NAME > backup.sql`.
- MinIO: espelhar o bucket (`mc mirror`) ou usar S3 real (troque `S3_ENDPOINT`/credenciais; `S3_FORCE_PATH_STYLE=false`).
- Escala do processamento: aumente `WORKER_CONCURRENCY` ou `--scale worker=N` (jobs são idempotentes por vídeo).
- Segurança: a API usa `helmet`, não expõe CORS (BFF) e aplica rate limit no auth; mantenha `SWAGGER_ENABLED=false`.

## Fora do escopo desta fase
CDN para o stream, TLS no próprio compose, observabilidade (métricas/tracing), autoscaling.
