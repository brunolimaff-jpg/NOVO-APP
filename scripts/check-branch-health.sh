#!/bin/bash
# check-branch-health.sh — Trava de acúmulo de commits sem PR
# Níveis:
#   <= 5 commits → silencioso (OK)
#   6-7 commits → warning (amarelo)
#   >= 8 commits → bloqueia commit (vermelho)

set -euo pipefail

MAIN_BRANCH="${1:-main}"
THRESHOLD_WARN=5
THRESHOLD_BLOCK=8
CONTEXT="${2:-commit}"  # "commit" | "session"

# Conta commits locais ahead de main
count=$(git rev-list --count "${MAIN_BRANCH}..HEAD" 2>/dev/null || echo "0")

if [ "$count" -ge "$THRESHOLD_BLOCK" ]; then
  echo ""
  echo "🚨🚨🚨 BLOQUEIO: $count commits NÃO pushados! 🚨🚨🚨"
  echo ""
  echo "   Você está acumulando commits demais sem abrir PR."
  echo "   Risco: PR gigante, difícil revisar, conflitos com main."
  echo ""
  echo "   Ações antes de commitar de novo:"
  echo "   1. Revise o que tem: git log main..HEAD --oneline"
  echo "   2. Abra um PR com o que já existe"
  echo "   3. Ou faça push dos commits: git push origin HEAD"
  echo ""
  echo "   Para forçar o commit mesmo assim:"
  echo "   BRANCH_HEALTH_SKIP=1 git commit ..."
  echo ""
  if [ "${BRANCH_HEALTH_SKIP:-0}" = "1" ]; then
    echo "   ⚠️ Skip forçado via BRANCH_HEALTH_SKIP=1"
    exit 0
  fi
  exit 1
elif [ "$count" -gt "$THRESHOLD_WARN" ]; then
  echo ""
  echo "⚠️  ATENÇÃO: $count commits locais sem push (limite: $THRESHOLD_WARN)"
  echo "   Considere abrir um PR em breve. Máximo antes de bloquear: $THRESHOLD_BLOCK."
  echo ""
  exit 0
fi

exit 0
