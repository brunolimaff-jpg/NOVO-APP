#!/usr/bin/env bash
set -euo pipefail

optional_vars=(
  GEMINI_API_KEY
  BRAVE_SEARCH_API_KEY
  VITE_PINECONE_API_KEY
)

missing=0

echo "Checking required exported variables..."
if [[ -n "${PINECONE_API_KEY:-}" || -n "${PINECONE_DOCS_KEY:-}" ]]; then
  if [[ -n "${PINECONE_API_KEY:-}" ]]; then
    echo "OK  - PINECONE_API_KEY is exported"
  fi
  if [[ -n "${PINECONE_DOCS_KEY:-}" ]]; then
    echo "OK  - PINECONE_DOCS_KEY is exported"
  fi
else
  echo "MISS - neither PINECONE_API_KEY nor PINECONE_DOCS_KEY is exported"
  missing=1
fi

if [[ -n "${PINECONE_DOCS_INDEX:-}" ]]; then
  echo "OK  - PINECONE_DOCS_INDEX is exported"
else
  echo "MISS - PINECONE_DOCS_INDEX is not exported"
  missing=1
fi

echo
echo "Checking optional exported variables..."
for var_name in "${optional_vars[@]}"; do
  if [[ -n "${!var_name:-}" ]]; then
    echo "OK  - ${var_name} is exported"
  else
    echo "INFO - ${var_name} not exported"
  fi
done

if [[ "${missing}" -ne 0 ]]; then
  echo
  echo "Result: missing required exports."
  echo "Define variables in one of these ways:"
  echo "  1) .env.local in project root (recommended)"
  echo "  2) export in the same shell that runs start-local.command"
  echo
  echo "Required:"
  echo "  PINECONE_DOCS_KEY=...   # or PINECONE_API_KEY"
  echo "  PINECONE_DOCS_INDEX=..."
  exit 1
fi

echo
echo "Result: all required exports are present."
