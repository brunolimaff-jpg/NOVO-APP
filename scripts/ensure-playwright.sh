#!/usr/bin/env bash
set -euo pipefail

# Garante que o Playwright e os browsers estejam instalados antes de rodar E2E.
# Se chromium não estiver instalado, tenta instalar. Falha com mensagem clara se não conseguir.

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

check_chromium() {
  # Playwright >=1.40: --dry-run flag
  npx playwright install --dry-run chromium >/dev/null 2>&1 && return 0
  # Fallback: verifica se o binário já existe no cache padrão
  local cache_dir="${HOME}/.cache/ms-playwright"
  if [ -d "$cache_dir" ] && ls "$cache_dir"/chromium-*/chrome-linux/chrome >/dev/null 2>&1; then return 0; fi
  if [ -d "$cache_dir" ] && ls "$cache_dir"/chromium-*/chrome-mac/Chromium.app >/dev/null 2>&1; then return 0; fi
  if [ -d "$cache_dir" ] && ls "$cache_dir"/chromium-*/chrome-win/chrome.exe >/dev/null 2>&1; then return 0; fi
  return 1
}

install_chromium() {
  echo -e "${YELLOW}Chromium não encontrado. Instalando browsers do Playwright...${NC}"
  npx playwright install chromium 2>/dev/null || {
    echo -e "${RED}ERRO: Não foi possível instalar o Chromium automaticamente.${NC}"
    echo ""
    echo "Instale manualmente com um dos comandos:"
    echo "  npx playwright install chromium"
    echo "  npx playwright install --with-deps chromium   # Linux (requer sudo)"
    echo ""
    echo "Ou pule os testes E2E com:"
    echo "  npm run validate:ci   # typecheck + unit + contracts, sem E2E"
    exit 1
  }
}

if check_chromium; then
  echo -e "${GREEN}Playwright Chromium OK${NC}"
  exit 0
fi

install_chromium
