#!/usr/bin/env bash
# Aplica as variáveis para apontar CLI/SDKs para o AWS Emulator local.
# Precisa ser carregado com "source" (não executado):
#   source ./env-emulator.sh [porta]     (padrão: 9297)

EMU_PORT="${1:-9297}"
EMU_DIR="$HOME/.aws/emulator/$EMU_PORT"

export AWS_ENDPOINT_URL="https://127.0.0.1:$EMU_PORT"
export AWS_SHARED_CREDENTIALS_FILE="$EMU_DIR/emulator_credentials"
export AWS_CONFIG_FILE="$EMU_DIR/config"
export AWS_CA_BUNDLE="$EMU_DIR/ca.pem"
export NODE_EXTRA_CA_CERTS="$EMU_DIR/ca.pem"   # SDK JS (Node) não lê AWS_CA_BUNDLE
export AWS_EC2_METADATA_DISABLED=true
export AWS_DISABLE_HOST_PREFIX_INJECTION=true
export AWS_REGION=us-east-1
export AWS_DEFAULT_REGION=us-east-1

# credenciais reais têm precedência sobre o arquivo e o emulador as rejeita
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_PROFILE

if [[ ! -f "$EMU_DIR/ca.pem" ]]; then
  echo "AVISO: $EMU_DIR/ca.pem não existe. O emulador está rodando (./run-emulator.sh)?" >&2
else
  echo "Emulador configurado em $AWS_ENDPOINT_URL"
fi
