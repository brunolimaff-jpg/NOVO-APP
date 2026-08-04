#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${PINECONE_API_KEY:-}" && -z "${PINECONE_DOCS_KEY:-}" ]]; then
  echo "Missing required Pinecone key." >&2
  echo "Export one of: PINECONE_API_KEY or PINECONE_DOCS_KEY" >&2
  exit 1
fi

if [[ -z "${PINECONE_DOCS_INDEX:-}" ]]; then
  echo "Missing required environment variable: PINECONE_DOCS_INDEX" >&2
  echo "Set it before running, e.g.: export PINECONE_DOCS_INDEX=..." >&2
  exit 1
fi

if [[ -z "${LITELLM_API_KEY:-}" ]]; then
  echo "WARN: LITELLM_API_KEY is not exported. Continuing (not required for local validation pipeline)."
fi

if [[ -z "${BRAVE_SEARCH_API_KEY:-}" ]]; then
  echo "WARN: BRAVE_SEARCH_API_KEY is not exported. Continuing (not required for local validation pipeline)."
fi

export PINECONE_API_KEY="${PINECONE_API_KEY:-$PINECONE_DOCS_KEY}"
export PINECONE_DOCS_KEY="${PINECONE_DOCS_KEY:-$PINECONE_API_KEY}"
export PINECONE_DOCS_INDEX
export VITE_PINECONE_API_KEY="${VITE_PINECONE_API_KEY:-$PINECONE_API_KEY}"

echo "Running full validation (typecheck, test, build)..."
npm run typecheck
npm run test
npm run build
echo "Validation completed successfully."
