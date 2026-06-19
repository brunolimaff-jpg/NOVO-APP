#!/usr/bin/env bash
# check-bundle-budget.sh — CI gate: verifica se o bundle JS+CSS respeita o orçamento
# Exclui source maps (Sentry) e PNGs grandes (assets estaticos do War Room)
# Portavel: usa wc -c (POSIX) em vez de stat -f%z (macOS-only)
set -euo pipefail

DIST_DIR="dist"

if [ ! -d "$DIST_DIR" ]; then
  echo "❌ dist/ nao encontrado. Rode 'npm run build' primeiro."
  exit 1
fi

file_size_kb() {
  local file="$1"
  # wc -c funciona em Linux e macOS; stat -f%z so funciona em macOS
  local bytes
  bytes=$(wc -c < "$file" 2>/dev/null || echo 0)
  echo "$bytes"
}

TOTAL_JS_BYTES=0
while IFS= read -r -d '' f; do
  TOTAL_JS_BYTES=$((TOTAL_JS_BYTES + $(file_size_kb "$f")))
done < <(find "$DIST_DIR" -name '*.js' ! -name '*.map' -print0 2>/dev/null)
TOTAL_JS_KB=$((TOTAL_JS_BYTES / 1024))

TOTAL_CSS_BYTES=0
while IFS= read -r -d '' f; do
  TOTAL_CSS_BYTES=$((TOTAL_CSS_BYTES + $(file_size_kb "$f")))
done < <(find "$DIST_DIR" -name '*.css' ! -name '*.map' -print0 2>/dev/null)
TOTAL_CSS_KB=$((TOTAL_CSS_BYTES / 1024))

# Budgets lidos de budget.json (fonte unica de verdade)
BUDGET_FILE="budget.json"
if [ ! -f "$BUDGET_FILE" ]; then
  echo "❌ budget.json nao encontrado na raiz do projeto."
  exit 1
fi

MAX_JS_KB=$(node --input-type=commonjs -e "
  const b = require('./budget.json');
  const script = b.resourceSizes?.find(r => r.resourceType === 'script');
  process.stdout.write(String(script?.budget ?? 5500));
")
MAX_CSS_KB=$(node --input-type=commonjs -e "
  const b = require('./budget.json');
  const css = b.resourceSizes?.find(r => r.resourceType === 'stylesheet');
  process.stdout.write(String(css?.budget ?? 150));
")

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
