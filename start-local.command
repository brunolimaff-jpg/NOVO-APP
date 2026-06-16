#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

MODE="${1:-quick}"

if [[ "$MODE" != "quick" && "$MODE" != "full" ]]; then
  echo "Usage: ./start-local.command [quick|full]"
  echo "  quick (default): env check + typecheck + dev server"
  echo "  full: env check + typecheck + test + build + dev server"
  exit 1
fi

loaded_env=0

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
  loaded_env=1
fi

if [[ -f "$ROOT_DIR/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env.local"
  set +a
  loaded_env=1
fi

if [[ "$loaded_env" -eq 0 ]]; then
  echo "INFO: no .env/.env.local found. Using only variables exported in this shell."
fi

echo "==> Checking exported environment variables..."
bash "$ROOT_DIR/check-exports.command"

if [[ ! -d node_modules ]]; then
  echo "==> Installing dependencies..."
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
else
  echo "==> Dependencies already installed (node_modules found)."
fi

echo "==> Running typecheck..."
npm run typecheck

if [[ "$MODE" == "full" ]]; then
  echo "==> Running full validation..."
  npm run test
  npm run build
fi

echo "==> Starting local dev server..."
echo "Open: http://localhost:3000"
if command -v open >/dev/null 2>&1; then
  open -a "Google Chrome" "http://localhost:3000" || true
fi
npm run dev
