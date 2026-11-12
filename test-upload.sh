#!/usr/bin/env bash
# Cadastra/loga um usuário no Cognito (via API), envia um vídeo e acompanha o status.
# Uso: ./test-upload.sh [arquivo] [url-da-api]   (padrão: assets/fsOllie.mov)
#      EMAIL=eu@teste.com PASSWORD='Passw0rd!x' ./test-upload.sh assets/fsOllie.mov http://localhost:3000
set -euo pipefail

cd "$(dirname "$0")"

FILE="${1:-assets/fsOllie.mov}"
API="${2:-http://localhost:3000}"
EMAIL="${EMAIL:-skater@example.com}"
PASSWORD="${PASSWORD:-Passw0rd!x}"

[[ -f "$FILE" ]] || { echo "Arquivo não encontrado: $FILE" >&2; exit 1; }

case "${FILE##*.}" in
  mov|MOV) MIME="video/quicktime" ;;
  *)       MIME="video/mp4" ;;
esac

pretty() { if command -v jq >/dev/null; then jq .; else cat; fi; }
field()  { sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p"; }

echo ">> Health check"
curl -sf "$API/health" || { echo "API fora do ar em $API" >&2; exit 1; }
echo

echo ">> Cadastro ($EMAIL)"
CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$API/auth/signup" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
case "$CODE" in
  201) echo "criado" ;;
  409) echo "usuário já existe, seguindo para o login" ;;
  *)   echo "signup falhou (HTTP $CODE)" >&2; exit 1 ;;
esac

echo ">> Login"
LOGIN=$(curl -sS -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
TOKEN=$(echo "$LOGIN" | field accessToken)
[[ -n "$TOKEN" ]] || { echo "Login falhou: $LOGIN" >&2; exit 1; }
AUTH="Authorization: Bearer $TOKEN"
echo "token obtido (${#TOKEN} chars)"

echo ">> Sem token deve dar 401"
curl -sS -o /dev/null -w 'HTTP %{http_code}\n' "$API/videos"

echo ">> 1/4 Registrando o vídeo (recebe a URL pré-assinada)"
SIZE=$(wc -c < "$FILE" | tr -d ' ')
RESPONSE=$(curl -sS -w '\n%{http_code}' -X POST "$API/videos" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"fileName\":\"$(basename "$FILE")\",\"contentType\":\"$MIME\",\"sizeBytes\":$SIZE}")
BODY=$(sed '$d' <<<"$RESPONSE")
CODE=$(tail -n1 <<<"$RESPONSE")
echo "HTTP $CODE"
echo "$BODY" | pretty
[[ "$CODE" == "201" ]] || exit 1

ID=$(echo "$BODY" | field id)
UPLOAD_URL=$(echo "$BODY" | sed -n 's/.*"upload":{[^}]*"url":"\([^"]*\)".*/\1/p')
[[ -n "$ID" && -n "$UPLOAD_URL" ]] || { echo "Não consegui ler id/url da resposta" >&2; exit 1; }
# em dev a URL é relativa (proxy /_s3 da API); em produção é a URL absoluta do S3
case "$UPLOAD_URL" in /*) UPLOAD_URL="$API$UPLOAD_URL" ;; esac

echo ">> 2/4 Enviando $FILE ($MIME, $SIZE bytes) direto pela URL pré-assinada"
CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X PUT "$UPLOAD_URL" -H "Content-Type: $MIME" --data-binary @"$FILE")
echo "HTTP $CODE"
[[ "$CODE" == "200" ]] || { echo "O envio ao S3 falhou" >&2; exit 1; }

echo ">> 3/4 Confirmando o envio"
CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$API/videos/$ID/complete" -H "$AUTH")
echo "HTTP $CODE"
[[ "$CODE" == "200" ]] || exit 1

echo ">> 4/4 Pedindo o processamento"
CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$API/videos/$ID/process" -H "$AUTH")
echo "HTTP $CODE"
[[ "$CODE" == "202" ]] || exit 1

echo
echo ">> Acompanhando status de $ID (o worker precisa estar rodando: npm run worker)"
for _ in $(seq 90); do
  VIDEO=$(curl -sS -H "$AUTH" "$API/videos/$ID")
  STATUS=$(echo "$VIDEO" | field status)
  echo "status: $STATUS"
  case "$STATUS" in processed|failed) break ;; esac
  sleep 2
done

echo
echo "$VIDEO" | pretty
echo
echo ">> URLs de download"
curl -sS -H "$AUTH" "$API/videos/$ID/urls" | pretty
