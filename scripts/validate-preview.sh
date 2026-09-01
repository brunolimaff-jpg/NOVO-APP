#!/usr/bin/env bash
# validate-preview.sh — Valida fluxo CNPJ + Investigação sem browser
#
# Uso:
#   ./scripts/validate-preview.sh [URL] [CNPJ]
#   ./scripts/validate-preview.sh https://meu-preview.vercel.app 04.733.767/0001-80
#   ./scripts/validate-preview.sh  # usa localhost:3000 e Scheffer como padrão
#
# Valida:
#   1. GET /api/cnpj?cnpj=... → lookup cadastral
#   2. Health check (app responde)

set -euo pipefail

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

BASE_URL="${1:-http://localhost:3000}"
CNPJ="${2:-04.733.767/0001-80}"
CNPJ_DIGITS=$(echo "$CNPJ" | tr -d './-')

PASS=0
FAIL=0

log_pass() { echo -e "${GREEN}✅ PASS${NC} — $1"; ((++PASS)); }
log_fail() { echo -e "${RED}❌ FAIL${NC} — $1"; ((++FAIL)); }
log_info() { echo -e "${CYAN}ℹ${NC}  $1"; }
log_section() { echo -e "\n${YELLOW}── $1 ──${NC}"; }

# ============================================================
log_section "Validação Preview: ${BASE_URL}"
log_info "CNPJ: ${CNPJ} (${CNPJ_DIGITS})"
echo ""

# ============================================================
# 1. Health check — app responde
# ============================================================
log_section "1. Health Check"

HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${BASE_URL}/")
if [ "$HTTP_CODE" -eq 200 ]; then
  log_pass "App responde 200"
else
  log_fail "App retornou HTTP ${HTTP_CODE} (esperava 200)"
fi

# ============================================================
# 2. CNPJ Lookup — GET /api/cnpj
# ============================================================
log_section "2. CNPJ Lookup (GET /api/cnpj)"

START_MS=$(python3 -c 'import time; print(int(time.time()*1000))')

CNPJ_RESPONSE=$(curl -s --max-time 30 \
  "${BASE_URL}/api/cnpj?cnpj=${CNPJ_DIGITS}" || echo '{"error":"curl_failed"}')

END_MS=$(python3 -c 'import time; print(int(time.time()*1000))')
LATENCY=$(( END_MS - START_MS ))

# Validar que retornou JSON válido
if echo "$CNPJ_RESPONSE" | python3 -c 'import json,sys; json.load(sys.stdin)' 2>/dev/null; then
  # Extrair campos
  COMPANY=$(echo "$CNPJ_RESPONSE" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("companyName",""))' 2>/dev/null || echo "")
  CITY=$(echo "$CNPJ_RESPONSE" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("city",""))' 2>/dev/null || echo "")
  STATE=$(echo "$CNPJ_RESPONSE" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("state",""))' 2>/dev/null || echo "")
  CNAE=$(echo "$CNPJ_RESPONSE" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("cnaeDescricao",""))' 2>/dev/null || echo "")

  if [ -n "$COMPANY" ] && [ "$COMPANY" != "None" ]; then
    log_pass "CNPJ lookup OK (${LATENCY}ms)"
    log_info "Empresa: ${COMPANY}"
    log_info "Cidade: ${CITY}/${STATE}"
    log_info "CNAE: ${CNAE}"
  else
    log_fail "CNPJ lookup retornou JSON mas sem companyName"
    log_info "Response: ${CNPJ_RESPONSE}"
  fi
else
  log_fail "CNPJ lookup não retornou JSON válido"
  log_info "Response: ${CNPJ_RESPONSE}"
fi

# ============================================================
# Resumo
# ============================================================
log_section "Resumo"

TOTAL=$((PASS + FAIL))
echo ""
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}✅ ${PASS}/${TOTAL} checks passaram${NC}"
  exit 0
else
  echo -e "${RED}❌ ${FAIL}/${TOTAL} checks falharam${NC}"
  exit 1
fi
