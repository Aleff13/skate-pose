#!/usr/bin/env bash
# Builda (se necessário) e roda o AWS Emulator em um container Docker.
# Uso: ./run-emulator.sh [porta]   (padrão: 9297)
#      REBUILD=1 ./run-emulator.sh  para forçar rebuild da imagem
set -euo pipefail

cd "$(dirname "$0")"

PORT="${1:-9297}"
IMAGE="aws-emulator"

if ! docker info >/dev/null 2>&1; then
  echo "Erro: Docker não está rodando." >&2
  exit 1
fi

if [[ "${REBUILD:-0}" == "1" ]] || ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo ">> Buildando imagem $IMAGE..."
  docker build -f dockerfile -t "$IMAGE" .
fi

mkdir -p "$HOME/.aws/emulator"

echo ">> Iniciando emulador em http://127.0.0.1:$PORT (Ctrl+C para parar)"
exec docker run --rm --memory=2g --memory-swap=2g \
  -p "127.0.0.1:$PORT:$PORT" \
  -e HOME="$HOME" \
  -v "$HOME/.aws/emulator:$HOME/.aws/emulator" \
  "$IMAGE" -p "$PORT"
