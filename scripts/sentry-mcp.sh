#!/bin/bash

# Carrega variaveis do arquivo .env local se ele existir
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# Tenta carregar de perfis comuns caso nao esteja no .env
if [ -z "$SENTRY_ACCESS_TOKEN" ]; then
  if [ -f ~/.zshenv ]; then
    source ~/.zshenv 2>/dev/null
  elif [ -f ~/.bash_profile ]; then
    source ~/.bash_profile 2>/dev/null
  fi
fi

# Valida se o token de acesso foi definido
if [ -z "$SENTRY_ACCESS_TOKEN" ]; then
  echo "Erro: SENTRY_ACCESS_TOKEN nao esta definida." >&2
  echo "Por favor, defina-a no seu ambiente ou no arquivo .env." >&2
  exit 1
fi

# Executa o servidor MCP usando as variaveis de ambiente com fallbacks seguros
exec npx @sentry/mcp-server \
  --access-token "$SENTRY_ACCESS_TOKEN" \
  --organization-slug "${SENTRY_ORG:-s-3j}" \
  --project-slug "${SENTRY_PROJECT:-scout-360}"
