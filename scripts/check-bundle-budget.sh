#!/usr/bin/env bash
# check-bundle-budget.sh — CI gate: verifica se o bundle JS+CSS respeita o orçamento
# Exclui source maps (Sentry) e PNGs grandes (assets estaticos do War Room)
set -euo pipefail

DIST_DIR="dist"

if [ ! -d "$DIST_DIR" ]; then
  echo "❌ dist/ nao encontrado. Rode 'npm run build' primeiro."
  exit 1
fi

# Apenas JS e CSS (exclui .map e assets estaticos como PNGs)
TOTAL_JS_KB=$(find "$DIST_DIR" -name '*.js' ! -name '*.map' -exec stat -f%z {} \; 2>/dev/null | awk '{sum+=$1} END {printf "%.0f", sum/1024}')
TOTAL_CSS_KB=$(find "$DIST_DIR" -name '*.css' ! -name '*.map' -exec stat -f%z {} \; 2>/dev/null | awk '{sum+=$1} END {printf "%.0f", sum/1024}')

# Budgets com 7-15% de folga sobre o valor atual (Jun 2026)
MAX_JS_KB=5500
MAX_CSS_KB=150

echo "📦 Bundle Budget Check"
echo "  JS:   ${TOTAL_JS_KB} KB (max ${MAX_JS_KB} KB)"
echo "  CSS:  ${TOTAL_CSS_KB} KB (max ${MAX_CSS_KB} KB)"

PASS=true

if [ "$TOTAL_JS_KB" -gt "$MAX_JS_KB" ]; then
  echo "❌ JS bundle excede orçamento: ${TOTAL_JS_KB}/${MAX_JS_KB} KB"
  PASS=false
fi

if [ "$TOTAL_CSS_KB" -gt "$MAX_CSS_KB" ]; then
  echo "❌ CSS bundle excede orçamento: ${TOTAL_CSS_KB}/${MAX_CSS_KB} KB"
  PASS=false
fi

if [ "$PASS" = true ]; then
  echo "✅ Bundle dentro do orçamento"
  exit 0
else
  exit 1
fi
