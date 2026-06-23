#!/usr/bin/env bash
# ship-loop-watch.sh — aguarda CI verde + preview Vercel servindo SHA esperado
#
# Uso:
#   ./scripts/ship-loop-watch.sh <PR_NUMBER> [EXPECTED_SHA] [PREVIEW_URL]
#
# Env opcionais:
#   BASE_URL                      — preview se PREVIEW_URL omitido
#   VERCEL_AUTOMATION_BYPASS_SECRET
#   SHIP_LOOP_POLL_INTERVAL_SEC   — default 30
#   SHIP_LOOP_MAX_WAIT_SEC        — default 1800 (30 min)
#
# Saída em sucesso (parseável):
#   PREVIEW_URL=...
#   E2E_DEPLOYMENT_SHA=...

set -euo pipefail

PR_NUMBER="${1:?Uso: ship-loop-watch.sh PR_NUMBER [EXPECTED_SHA] [PREVIEW_URL]}"
EXPECTED_SHA="${2:-$(git rev-parse HEAD)}"
PREVIEW_URL="${3:-${BASE_URL:-}}"

POLL_INTERVAL="${SHIP_LOOP_POLL_INTERVAL_SEC:-30}"
MAX_WAIT_SEC="${SHIP_LOOP_MAX_WAIT_SEC:-1800}"

if ! [[ "$EXPECTED_SHA" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "EXPECTED_SHA deve ser SHA Git completo (40 hex): $EXPECTED_SHA" >&2
  exit 1
fi

echo "ship-loop-watch: PR #${PR_NUMBER}, SHA esperado=${EXPECTED_SHA:0:7}..."

echo "[1/2] Aguardando CI verde (gh pr checks --watch)..."
if ! gh pr checks "$PR_NUMBER" --watch --fail-fast --interval "$POLL_INTERVAL"; then
  echo "CI falhou ou foi interrompido." >&2
  exit 1
fi
echo "CI verde."

if [[ -z "$PREVIEW_URL" ]]; then
  PREVIEW_URL="$(gh pr view "$PR_NUMBER" --json comments --jq '
    [.comments[].body
      | capture("(?<url>https://[^\\s\"]+\\.vercel\\.app)")? // empty
      | .url] | first // empty
  ' 2>/dev/null || true)"
fi

if [[ -z "$PREVIEW_URL" ]]; then
  echo "PREVIEW_URL não encontrada. Defina BASE_URL ou passe como 3º argumento." >&2
  exit 1
fi

PREVIEW_URL="${PREVIEW_URL%/}"
echo "[2/2] Aguardando preview ${PREVIEW_URL} servir SHA ${EXPECTED_SHA:0:7}..."

curl_common=(--fail --silent --show-error --max-time 30)
if [[ -n "${VERCEL_AUTOMATION_BYPASS_SECRET:-}" ]]; then
  curl_common+=(-H "x-vercel-protection-bypass: ${VERCEL_AUTOMATION_BYPASS_SECRET}")
fi

deadline=$(( $(date +%s) + MAX_WAIT_SEC ))
while [[ $(date +%s) -lt $deadline ]]; do
  html="$(curl "${curl_common[@]}" "$PREVIEW_URL/" 2>/dev/null || true)"
  if [[ -n "$html" ]]; then
    script_src="$(printf '%s' "$html" | grep -oE 'src="[^"]+\.js"' | head -1 | sed 's/src="//;s/"$//' || true)"
    if [[ -n "$script_src" ]]; then
      if [[ "$script_src" == http* ]]; then
        script_url="$script_src"
      elif [[ "$script_src" == /* ]]; then
        script_url="${PREVIEW_URL}${script_src}"
      else
        script_url="${PREVIEW_URL}/${script_src}"
      fi
      if curl "${curl_common[@]}" "$script_url" 2>/dev/null | grep -q "$EXPECTED_SHA"; then
        echo "OK: preview serve SHA ${EXPECTED_SHA:0:7}"
        echo "PREVIEW_URL=${PREVIEW_URL}"
        echo "E2E_DEPLOYMENT_SHA=${EXPECTED_SHA}"
        exit 0
      fi
    fi
  fi
  echo "  aguardando deploy... (${POLL_INTERVAL}s)"
  sleep "$POLL_INTERVAL"
done

echo "Timeout (${MAX_WAIT_SEC}s): preview não serviu SHA esperado." >&2
exit 1
