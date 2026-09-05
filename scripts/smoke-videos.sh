#!/usr/bin/env bash
# Smoke test funcional da Fase 03 (vídeos) contra a stack local rodando via Docker Compose.
#
# Pré-condições (no host): docker, curl, jq. A stack de nestjs-project deve estar de pé com a
# API em modo dev (docker compose up -d && exec nestjs-api npm run migration:run && start:dev).
# Uso: bash scripts/smoke-videos.sh [--skip-multipart]
#
# O script cria seus próprios usuários (e-mail único por execução), confirma o e-mail pela API
# do Mailpit, faz o fluxo completo registrar → PUT → confirmar → worker → stream/download e
# valida cada passo. Sai com código 1 se qualquer asserção falhar.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="${API_URL:-http://localhost:3000}"
MAILPIT="${MAILPIT_URL:-http://localhost:8025}"
COMPOSE=(docker compose -f "$ROOT/nestjs-project/compose.yaml")
TMP="$ROOT/tmp/smoke"
PASSWORD='Smoke@12345'
READY_TIMEOUT="${READY_TIMEOUT:-180}"
SKIP_MULTIPART=0
[[ "${1:-}" == "--skip-multipart" ]] && SKIP_MULTIPART=1

PASS=0; FAIL=0
ok()   { printf '  \033[32m✔\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
fail() { printf '  \033[31m✘\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }
assert_eq() { # label actual expected
  if [[ "$2" == "$3" ]]; then ok "$1 = $3"; else fail "$1: esperado '$3', obtido '$2'"; fi
}
assert_match() { # label actual regex
  if [[ "$2" =~ $3 ]]; then ok "$1 ~ /$3/"; else fail "$1: '$2' não casa com /$3/"; fi
}
section() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "requer '$1' no host"; exit 2; }; }
need curl; need jq; need docker
mkdir -p "$TMP"

# ---------- helpers HTTP ----------
# api METHOD PATH [TOKEN] [JSON_BODY] → imprime "STATUS\nBODY"
api() {
  local method=$1 path=$2 token=${3:-} data=${4:-}
  local -a args=(-s -o "$TMP/body" -w '%{http_code}' -X "$method" "$API$path")
  [[ -n "$token" ]] && args+=(-H "Authorization: Bearer $token")
  [[ -n "$data" ]] && args+=(-H 'Content-Type: application/json' --data "$data")
  local status; status=$(curl "${args[@]}")
  printf '%s\n' "$status"; cat "$TMP/body"; echo
}
status_of() { head -n1 <<<"$1"; }
body_of()   { tail -n +2 <<<"$1"; }

# Cria usuário, confirma pelo Mailpit e loga → access token
login_new_user() {
  local email=$1 out token id
  out=$(api POST /auth/register '' "{\"email\":\"$email\",\"password\":\"$PASSWORD\"}")
  [[ "$(status_of "$out")" == "201" ]] || { echo "registro falhou: $out" >&2; return 1; }
  for _ in $(seq 1 20); do
    id=$(curl -s "$MAILPIT/api/v1/search?query=to:$email" | jq -r '.messages[0].ID // empty')
    [[ -n "$id" ]] && break
    sleep 0.5
  done
  [[ -n "$id" ]] || { echo "e-mail de confirmação não chegou no Mailpit" >&2; return 1; }
  token=$(curl -s "$MAILPIT/api/v1/message/$id" | jq -r '.Text + " " + .HTML' | grep -oE 'token=[A-Za-z0-9._~-]+' | head -n1 | cut -d= -f2)
  [[ -n "$token" ]] || { echo "token não encontrado no e-mail" >&2; return 1; }
  out=$(api GET "/auth/confirm-email?token=$token")
  [[ "$(status_of "$out")" == "204" ]] || { echo "confirmação falhou: $out" >&2; return 1; }
  out=$(api POST /auth/login '' "{\"email\":\"$email\",\"password\":\"$PASSWORD\"}")
  [[ "$(status_of "$out")" == "200" ]] || { echo "login falhou: $out" >&2; return 1; }
  body_of "$out" | jq -r '.access_token'
}

wait_status() { # id token → imprime status final (ready|failed) ou "timeout"
  local id=$1 token=$2 status
  for _ in $(seq 1 "$READY_TIMEOUT"); do
    status=$(body_of "$(api GET "/videos/$id" "$token")" | jq -r '.status')
    case "$status" in ready|failed) echo "$status"; return 0;; esac
    sleep 1
  done
  echo timeout
}

# ---------- 0. pré-condições ----------
section "0. Pré-condições"
assert_eq "API responde" "$(curl -s -o /dev/null -w '%{http_code}' "$API/")" "200"
assert_eq "Mailpit responde" "$(curl -s -o /dev/null -w '%{http_code}' "$MAILPIT/api/v1/messages")" "200"
assert_eq "MinIO saudável" "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:9000/minio/health/live)" "200"
assert_eq "worker rodando" "$("${COMPOSE[@]}" ps --status running --services | grep -c '^worker$')" "1"

# ---------- 1. usuários ----------
section "1. Usuário confirmado via Mailpit + login"
STAMP=$(date +%s%N)
OWNER=$(login_new_user "smoke-owner-$STAMP@example.com") && ok "owner logado" || fail "owner não logou"
OTHER=$(login_new_user "smoke-other-$STAMP@example.com") && ok "outro usuário logado" || fail "outro usuário não logou"
assert_eq "sem token → 401" "$(status_of "$(api GET /videos)")" "401"

# ---------- 2. vídeo de teste ----------
section "2. Vídeo sintético (ffmpeg no container do worker)"
"${COMPOSE[@]}" exec -T worker ffmpeg -y -loglevel error \
  -f lavfi -i testsrc=duration=8:size=640x360:rate=30 \
  -f lavfi -i sine=frequency=440:duration=8 \
  -c:v libx264 -preset ultrafast -c:a aac -shortest /tmp/sample.mp4
"${COMPOSE[@]}" cp worker:/tmp/sample.mp4 "$TMP/sample.mp4" >/dev/null
SIZE=$(stat -c %s "$TMP/sample.mp4")
[[ "$SIZE" -gt 0 ]] && ok "sample.mp4 gerado ($SIZE bytes)" || fail "sample.mp4 vazio"

# ---------- 3. registrar + PUT + confirmar ----------
section "3. Registrar → PUT na URL pré-assinada → confirmar"
OUT=$(api POST /videos "$OWNER" "{\"title\":\"Smoke $STAMP\",\"description\":\"gerado pelo smoke-videos.sh\",\"sizeBytes\":$SIZE}")
assert_eq "POST /videos" "$(status_of "$OUT")" "201"
REG=$(body_of "$OUT")
VIDEO_ID=$(jq -r '.video.id' <<<"$REG")
SLUG=$(jq -r '.video.slug' <<<"$REG")
UPLOAD_URL=$(jq -r '.upload.url' <<<"$REG")
assert_eq "upload.type" "$(jq -r '.upload.type' <<<"$REG")" "single"
assert_match "slug com 11 chars URL-safe" "$SLUG" '^[A-Za-z0-9_-]{11}$'
assert_match "URL pré-assinada usa o endpoint público" "$UPLOAD_URL" '^http://localhost:9000/'
assert_eq "resposta não expõe chaves do storage" "$(jq -r '.video | has("original_key")' <<<"$REG")" "false"

assert_eq "PUT do arquivo no storage" "$(curl -s -o /dev/null -w '%{http_code}' -X PUT -H 'Content-Type: video/mp4' --data-binary "@$TMP/sample.mp4" "$UPLOAD_URL")" "200"

OUT=$(api POST "/videos/$VIDEO_ID/confirm" "$OWNER")
assert_eq "POST confirm" "$(status_of "$OUT")" "200"
assert_eq "status após confirmar" "$(body_of "$OUT" | jq -r '.status')" "uploaded"
assert_eq "sizeBytes = tamanho enviado" "$(body_of "$OUT" | jq -r '.sizeBytes')" "$SIZE"
OUT=$(api POST "/videos/$VIDEO_ID/confirm" "$OWNER")
assert_eq "reconfirmar → 409" "$(status_of "$OUT")" "409"
assert_eq "código do erro" "$(body_of "$OUT" | jq -r '.error')" "VIDEO_INVALID_STATE"

# ---------- 4. worker ----------
section "4. Processamento pelo worker (até ${READY_TIMEOUT}s)"
FINAL=$(wait_status "$VIDEO_ID" "$OWNER")
assert_eq "status final" "$FINAL" "ready"
META=$(body_of "$(api GET "/videos/$VIDEO_ID" "$OWNER")")
DURATION=$(jq -r '.durationSec' <<<"$META")
[[ "$DURATION" -ge 7 && "$DURATION" -le 9 ]] && ok "durationSec ≈ 8 ($DURATION)" || fail "durationSec inesperado: $DURATION"
PROCESSED_SIZE=$(jq -r '.sizeBytes' <<<"$META")
[[ "$PROCESSED_SIZE" -gt 0 ]] && ok "sizeBytes do processado > 0 ($PROCESSED_SIZE)" || fail "sizeBytes inválido: $PROCESSED_SIZE"
assert_eq "thumbnailUrl" "$(jq -r '.thumbnailUrl' <<<"$META")" "/videos/$VIDEO_ID/thumbnail"
assert_eq "error nulo" "$(jq -r '.error' <<<"$META")" "null"

# ---------- 5. streaming ----------
section "5. Streaming com HTTP Range"
HDR=$(curl -s -D - -o "$TMP/part.bin" -H "Authorization: Bearer $OWNER" -H 'Range: bytes=0-1023' "$API/videos/$VIDEO_ID/stream")
assert_match "Range 0-1023 → 206" "$(head -n1 <<<"$HDR")" ' 206 '
assert_match "Content-Range" "$(grep -i '^content-range' <<<"$HDR" | tr -d '\r')" "bytes 0-1023/$PROCESSED_SIZE"
assert_eq "bytes recebidos" "$(stat -c %s "$TMP/part.bin")" "1024"
HDR=$(curl -s -D - -o "$TMP/full.mp4" -H "Authorization: Bearer $OWNER" "$API/videos/$VIDEO_ID/stream")
assert_match "sem Range → 200" "$(head -n1 <<<"$HDR")" ' 200 '
assert_match "Accept-Ranges" "$(grep -i '^accept-ranges' <<<"$HDR" | tr -d '\r')" 'bytes'
assert_eq "arquivo inteiro" "$(stat -c %s "$TMP/full.mp4")" "$PROCESSED_SIZE"
HDR=$(curl -s -D - -o /dev/null -H "Authorization: Bearer $OWNER" -H "Range: bytes=$((PROCESSED_SIZE + 10))-" "$API/videos/$VIDEO_ID/stream")
assert_match "Range além do fim → 416" "$(head -n1 <<<"$HDR")" ' 416 '
assert_match "Content-Range */total" "$(grep -i '^content-range' <<<"$HDR" | tr -d '\r')" "bytes \*/$PROCESSED_SIZE"

# ---------- 6. download e thumbnail ----------
section "6. Download e thumbnail (302 → URL pré-assinada)"
LOC=$(curl -s -o /dev/null -w '%{redirect_url}' -H "Authorization: Bearer $OWNER" "$API/videos/$VIDEO_ID/download")
assert_match "download → Location no MinIO" "$LOC" '^http://localhost:9000/'
curl -s -o "$TMP/download.mp4" "$LOC"
assert_eq "download completo" "$(stat -c %s "$TMP/download.mp4")" "$PROCESSED_SIZE"
"${COMPOSE[@]}" cp "$TMP/download.mp4" worker:/tmp/download.mp4 >/dev/null
CODEC=$("${COMPOSE[@]}" exec -T worker ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 /tmp/download.mp4 | tr -d '\r')
assert_eq "codec do MP4 processado" "$CODEC" "h264"
LOC=$(curl -s -o /dev/null -w '%{redirect_url}' -H "Authorization: Bearer $OWNER" "$API/videos/$VIDEO_ID/thumbnail")
curl -s -o "$TMP/thumb.jpg" "$LOC"
assert_eq "thumbnail é JPEG" "$(head -c 2 "$TMP/thumb.jpg" | od -An -tx1 | tr -d ' \n')" "ffd8"

# ---------- 7. autorização ----------
section "7. Autorização (dono do canal)"
assert_eq "outro usuário GET → 403" "$(status_of "$(api GET "/videos/$VIDEO_ID" "$OTHER")")" "403"
assert_eq "outro usuário stream (rascunho) → 404" "$(status_of "$(api GET "/videos/$VIDEO_ID/stream" "$OTHER")")" "404"
assert_eq "outro usuário DELETE → 403" "$(status_of "$(api DELETE "/videos/$VIDEO_ID" "$OTHER")")" "403"
assert_eq "id inexistente → 404" "$(status_of "$(api GET "/videos/00000000-0000-0000-0000-000000000000" "$OWNER")")" "404"
assert_eq "id inválido → 400" "$(status_of "$(api GET "/videos/nao-e-uuid" "$OWNER")")" "400"
assert_eq "GET /videos lista 1 vídeo do dono" "$(body_of "$(api GET /videos "$OWNER")" | jq -r '.total')" "1"
assert_eq "GET /videos do outro usuário é vazio" "$(body_of "$(api GET /videos "$OTHER")" | jq -r '.total')" "0"

# ---------- 8. multipart ----------
if [[ $SKIP_MULTIPART -eq 0 ]]; then
  section "8. Upload multipart (150MB, conteúdo inválido → failed com erro)"
  BIG="$TMP/big.bin"
  head -c $((150 * 1024 * 1024)) /dev/urandom > "$BIG"
  BIG_SIZE=$(stat -c %s "$BIG")
  OUT=$(api POST /videos "$OWNER" "{\"title\":\"Smoke multipart $STAMP\",\"sizeBytes\":$BIG_SIZE}")
  assert_eq "POST /videos (grande)" "$(status_of "$OUT")" "201"
  MP=$(body_of "$OUT")
  MP_ID=$(jq -r '.video.id' <<<"$MP")
  assert_eq "upload.type" "$(jq -r '.upload.type' <<<"$MP")" "multipart"
  UPLOAD_ID=$(jq -r '.upload.uploadId' <<<"$MP")
  PART_SIZE=$(jq -r '.upload.partSize' <<<"$MP")
  N_PARTS=$(jq -r '.upload.parts | length' <<<"$MP")
  assert_eq "número de partes" "$N_PARTS" "$(( (BIG_SIZE + PART_SIZE - 1) / PART_SIZE ))"
  rm -f "$TMP"/part_*
  split -b "$PART_SIZE" -d -a 3 "$BIG" "$TMP/part_"
  PARTS_JSON="["
  for i in $(seq 1 "$N_PARTS"); do
    URL=$(jq -r ".upload.parts[$((i-1))].url" <<<"$MP")
    FILE=$(printf '%s/part_%03d' "$TMP" $((i-1)))
    ETAG=$(curl -s -D - -o /dev/null -X PUT --data-binary "@$FILE" "$URL" | grep -i '^etag' | tr -d '\r' | cut -d' ' -f2-)
    [[ -n "$ETAG" ]] && ok "parte $i enviada (ETag $ETAG)" || fail "parte $i sem ETag"
    PARTS_JSON+="$( [[ $i -gt 1 ]] && echo , ){\"partNumber\":$i,\"etag\":$(jq -Rn --arg e "$ETAG" '$e')}"
  done
  PARTS_JSON+="]"
  OUT=$(api POST "/videos/$MP_ID/multipart/complete" "$OWNER" "{\"uploadId\":\"$UPLOAD_ID\",\"parts\":$PARTS_JSON}")
  assert_eq "multipart/complete" "$(status_of "$OUT")" "200"
  assert_eq "status" "$(body_of "$OUT" | jq -r '.status')" "uploaded"
  assert_eq "sizeBytes montado" "$(body_of "$OUT" | jq -r '.sizeBytes')" "$BIG_SIZE"
  echo "  (aguardando o worker esgotar as 5 tentativas com backoff — pode levar ~2-3 min)"
  READY_TIMEOUT=400 FINAL=$(wait_status "$MP_ID" "$OWNER")
  assert_eq "conteúdo inválido → failed" "$FINAL" "failed"
  ERR=$(body_of "$(api GET "/videos/$MP_ID" "$OWNER")" | jq -r '.error')
  [[ -n "$ERR" && "$ERR" != "null" ]] && ok "error preenchido: ${ERR:0:60}" || fail "error vazio após failed"
  assert_eq "DELETE do vídeo failed" "$(status_of "$(api DELETE "/videos/$MP_ID" "$OWNER")")" "204"

  section "8b. Abort de multipart"
  OUT=$(api POST /videos "$OWNER" "{\"title\":\"Smoke abort $STAMP\",\"sizeBytes\":$BIG_SIZE}")
  AB_ID=$(body_of "$OUT" | jq -r '.video.id'); AB_UP=$(body_of "$OUT" | jq -r '.upload.uploadId')
  assert_eq "abort → 204" "$(status_of "$(api POST "/videos/$AB_ID/multipart/abort" "$OWNER" "{\"uploadId\":\"$AB_UP\"}")")" "204"
  assert_eq "vídeo cancelado some (404)" "$(status_of "$(api GET "/videos/$AB_ID" "$OWNER")")" "404"
fi

# ---------- 8c. gerenciamento (Fase 04): editar, publicar, página pública ----------
section "8c. Edição, publicação e página pública do canal (Fase 04)"
CATEGORY_ID=$(body_of "$(api GET /categories)" | jq -r '.[0].id')
CATEGORY_SLUG=$(body_of "$(api GET /categories)" | jq -r '.[0].slug')
assert_match "GET /categories público" "$CATEGORY_ID" '^[0-9a-f-]{36}$'
OUT=$(api PATCH "/videos/$VIDEO_ID" "$OWNER" "{\"title\":\"Smoke editado\",\"categoryId\":\"$CATEGORY_ID\",\"visibility\":\"public\"}")
assert_eq "PATCH /videos/:id" "$(status_of "$OUT")" "200"
assert_eq "título editado" "$(body_of "$OUT" | jq -r '.title')" "Smoke editado"
assert_eq "categoria aplicada" "$(body_of "$OUT" | jq -r '.category.slug')" "$CATEGORY_SLUG"
NICK=$(body_of "$(api GET /channels/me "$OWNER")" | jq -r '.nickname')
assert_match "GET /channels/me" "$NICK" '^[a-z0-9_]+$'
assert_eq "thumbnail de rascunho é 404 para anônimo" "$(curl -s -o /dev/null -w '%{http_code}' "$API/videos/$VIDEO_ID/thumbnail")" "404"
assert_eq "canal público lista 0 antes de publicar" "$(body_of "$(api GET "/channels/$NICK/videos")" | jq -r '.total')" "0"
OUT=$(api POST "/videos/$VIDEO_ID/publish" "$OWNER")
assert_eq "POST publish" "$(status_of "$OUT")" "200"
assert_eq "isPublished" "$(body_of "$OUT" | jq -r '.isPublished')" "true"
assert_eq "canal público lista 1 após publicar" "$(body_of "$(api GET "/channels/$NICK/videos")" | jq -r '.total')" "1"
assert_eq "videosCount do canal" "$(body_of "$(api GET "/channels/$NICK")" | jq -r '.videosCount')" "1"
assert_eq "thumbnail pública após publicar → 302" "$(curl -s -o /dev/null -w '%{http_code}' "$API/videos/$VIDEO_ID/thumbnail")" "302"
assert_eq "painel filtra publicados" "$(body_of "$(api GET "/videos?published=true" "$OWNER")" | jq -r '.total')" "1"

# ---------- 8d. visualização pública (Fase 05) ----------
section "8d. Visualização pública: slug, stream anônimo, views e sugestões (Fase 05)"
OUT=$(api GET "/videos/slug/$SLUG")
assert_eq "GET /videos/slug/:slug anônimo (publicado)" "$(status_of "$OUT")" "200"
assert_eq "canal no payload público" "$(body_of "$OUT" | jq -r '.channel.nickname')" "$NICK"
assert_eq "payload público não expõe error" "$(body_of "$OUT" | jq -r 'has("error")')" "false"
HDR=$(curl -s -D - -o /dev/null -H 'Range: bytes=0-99' "$API/videos/$VIDEO_ID/stream")
assert_match "stream anônimo com Range → 206" "$(head -n1 <<<"$HDR")" ' 206 '
assert_eq "download anônimo → 302" "$(curl -s -o /dev/null -w '%{http_code}' "$API/videos/$VIDEO_ID/download")" "302"
for _ in 1 2 3; do api POST "/videos/$VIDEO_ID/views" >/dev/null; done
assert_eq "3 views registradas" "$(body_of "$(api GET "/videos/slug/$SLUG")" | jq -r '.viewsCount')" "3"
assert_eq "related responde 200 (lista)" "$(status_of "$(api GET "/videos/$VIDEO_ID/related?limit=4")")" "200"
assert_eq "related não inclui o próprio vídeo" "$(body_of "$(api GET "/videos/$VIDEO_ID/related?limit=4")" | jq -r "[.[] | select(.id==\"$VIDEO_ID\")] | length")" "0"

# ---------- 8e. interações sociais (Fase 06) ----------
section "8e. Reações, comentários e inscrições (Fase 06)"
CHANNEL_ID=$(body_of "$(api GET /channels/me "$OWNER")" | jq -r '.id')
OUT=$(api PUT "/videos/$VIDEO_ID/reaction" "$OTHER" '{"type":"like"}')
assert_eq "PUT reaction (outro usuário) → 200" "$(status_of "$OUT")" "200"
assert_eq "like contado com myReaction" "$(body_of "$OUT" | jq -r '[.likes, .myReaction] | join(",")')" "1,like"
assert_eq "anônimo lê contagem" "$(body_of "$(api GET "/videos/$VIDEO_ID/reactions")" | jq -r '.likes')" "1"
assert_eq "reagir sem token → 401" "$(status_of "$(api PUT "/videos/$VIDEO_ID/reaction" "" '{"type":"like"}')")" "401"
ROOT_ID=$(body_of "$(api POST "/videos/$VIDEO_ID/comments" "$OTHER" '{"body":"Primeiro comentário"}')" | jq -r '.id')
assert_match "comentário criado" "$ROOT_ID" '^[0-9a-f-]{36}$'
REPLY_ID=$(body_of "$(api POST "/comments/$ROOT_ID/replies" "$OWNER" '{"body":"Resposta do dono"}')" | jq -r '.id')
assert_match "resposta criada" "$REPLY_ID" '^[0-9a-f-]{36}$'
assert_eq "resposta de resposta → 400" "$(status_of "$(api POST "/comments/$REPLY_ID/replies" "$OTHER" '{"body":"x"}')")" "400"
assert_eq "lista pública: 2 comentários" "$(body_of "$(api GET "/videos/$VIDEO_ID/comments")" | jq -r '.commentsCount')" "2"
assert_eq "excluir comentário alheio → 403" "$(status_of "$(api DELETE "/comments/$ROOT_ID" "$OWNER")")" "403"
assert_eq "auto-inscrição → 409" "$(status_of "$(api PUT "/channels/$CHANNEL_ID/subscription" "$OWNER")")" "409"
assert_eq "inscrição de outro usuário" "$(body_of "$(api PUT "/channels/$CHANNEL_ID/subscription" "$OTHER")" | jq -r '[.subscribed, .subscribersCount] | join(",")')" "true,1"
assert_eq "/me/subscriptions lista o canal" "$(body_of "$(api GET /me/subscriptions "$OTHER")" | jq -r 'length')" "1"
assert_eq "agregado social público" "$(body_of "$(api GET "/social/videos/$VIDEO_ID")" | jq -r '[.reactions.likes, .commentsCount, .subscription.subscribersCount] | join(",")')" "1,2,1"

OUT=$(api POST "/videos/$VIDEO_ID/unpublish" "$OWNER")
assert_eq "POST unpublish" "$(body_of "$OUT" | jq -r '.isPublished')" "false"
assert_eq "canal público volta a 0" "$(body_of "$(api GET "/channels/$NICK/videos")" | jq -r '.total')" "0"
assert_eq "após despublicar, slug anônimo → 404" "$(status_of "$(api GET "/videos/slug/$SLUG")")" "404"
assert_eq "após despublicar, stream anônimo → 404" "$(curl -s -o /dev/null -w '%{http_code}' "$API/videos/$VIDEO_ID/stream")" "404"

# ---------- 9. exclusão ----------
section "9. Exclusão"
assert_eq "DELETE → 204" "$(status_of "$(api DELETE "/videos/$VIDEO_ID" "$OWNER")")" "204"
assert_eq "GET após DELETE → 404" "$(status_of "$(api GET "/videos/$VIDEO_ID" "$OWNER")")" "404"
REMAINING=$("${COMPOSE[@]}" exec -T minio sh -c "mc alias set local http://localhost:9000 minioadmin minioadmin >/dev/null && mc ls --recursive local/streamtube-videos/videos/" | tr -d '\r' | grep -c "$VIDEO_ID" || true)
assert_eq "objetos removidos do storage" "$REMAINING" "0"

# ---------- resumo ----------
printf '\n\033[1mResultado: %d ok, %d falhas\033[0m\n' "$PASS" "$FAIL"
[[ $FAIL -eq 0 ]]
