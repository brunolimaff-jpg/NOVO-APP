#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Validando prompts, parsers e contrato visual da teia"

npm exec vitest run \
  tests/prompts/megaPrompts.test.ts \
  tests/prompts/constantsPromptRules.test.ts \
  tests/features/dossier/teiaTextParser.test.ts \
  tests/features/dossier/societaryGraph.test.ts

echo "==> validate-prompts OK"
