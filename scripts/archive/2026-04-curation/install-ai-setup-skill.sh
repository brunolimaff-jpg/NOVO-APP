#!/usr/bin/env bash
set -euo pipefail

INSTALLER="/opt/codex/skills/.system/skill-installer/scripts/install-skill-from-github.py"

if [[ ! -f "$INSTALLER" ]]; then
  echo "Erro: instalador de skills não encontrado em $INSTALLER" >&2
  exit 1
fi

if ! output=$(python "$INSTALLER" \
  --repo caliber-ai-org/ai-setup \
  --path . \
  --name ai-setup \
  "$@" 2>&1); then
  echo "$output" >&2
  echo >&2
  echo "Falha ao instalar a skill 'ai-setup'." >&2
  echo "Verifique conectividade com github.com e permissões de rede do ambiente." >&2
  exit 1
fi

if [[ -n "$output" ]]; then
  echo "$output"
fi

if [[ " $* " == *" --help "* ]] || [[ " $* " == *" -h "* ]]; then
  exit 0
fi

echo "Skill 'ai-setup' instalada em ~/.codex/skills/ai-setup"
echo "Reinicie o Codex para carregar a nova skill."
