#!/usr/bin/env bash
# Teste local do fluxo de contadores de scripts/validate-preview.sh.

set -euo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
VALIDATOR="$ROOT/scripts/validate-preview.sh"
TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/validate-preview-test.XXXXXX")
trap 'rm -rf "$TMP_DIR"' EXIT

STUB_DIR="$TMP_DIR/bin"
mkdir "$STUB_DIR"

cat > "$STUB_DIR/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

url=
for arg in "$@"; do
  url="$arg"
done

printf '%s\n' "$url" >> "$CURL_CALL_LOG"
if [[ "$url" == */api/cnpj?* ]]; then
  printf '%s' "$CURL_CNPJ_RESPONSE"
else
  printf '%s' "$CURL_HEALTH_CODE"
fi
EOF
chmod +x "$STUB_DIR/curl"

assert_contains() {
  local output=$1
  local expected=$2
  [[ "$output" == *"$expected"* ]] || {
    printf 'FAIL: saída não contém: %s\n%s\n' "$expected" "$output" >&2
    return 1
  }
}

count_lines() {
  local count=0
  while IFS= read -r _; do
    count=$((count + 1))
  done < "$1"
  printf '%s' "$count"
}

run_case() {
  local label=$1
  local health_code=$2
  local expected_status=$3
  local expected_summary=$4
  local output_file="$TMP_DIR/${label}.out"
  local calls_file="$TMP_DIR/${label}.calls"
  local status output calls

  : > "$calls_file"
  if PATH="$STUB_DIR:$PATH" \
    CURL_HEALTH_CODE="$health_code" \
    CURL_CNPJ_RESPONSE='{"companyName":"Scheffer","city":"Uberlândia","state":"MG","cnaeDescricao":"Agricultura"}' \
    CURL_CALL_LOG="$calls_file" \
    REAL_PROVIDER_CALLS=0 REAL_SEARCH_CALLS=0 \
    bash "$VALIDATOR" "https://preview.invalid" "04.733.767/0001-80" > "$output_file" 2>&1; then
    status=0
  else
    status=$?
  fi

  output=$(<"$output_file")
  [[ "$status" -eq "$expected_status" ]] || {
    printf 'FAIL [%s]: exit=%s, esperado=%s\n%s\n' "$label" "$status" "$expected_status" "$output" >&2
    return 1
  }
  assert_contains "$output" "2. CNPJ Lookup (GET /api/cnpj)" || return 1
  assert_contains "$output" "── Resumo ──" || return 1
  assert_contains "$output" "$expected_summary" || return 1

  calls=$(count_lines "$calls_file")
  [[ "$calls" -eq 2 ]] || {
    printf 'FAIL [%s]: curl calls=%s, esperado=2\n' "$label" "$calls" >&2
    return 1
  }
  printf 'PASS %s\n' "$label"
}

[[ -f "$VALIDATOR" ]] || { printf 'FAIL: validator ausente: %s\n' "$VALIDATOR" >&2; exit 1; }

failures=0
run_case "primeiro-pass" 200 0 "2/2 checks passaram" || failures=$((failures + 1))
run_case "primeiro-fail" 503 1 "1/2 checks falharam" || failures=$((failures + 1))
if [[ "$failures" -ne 0 ]]; then
  printf 'FAIL: %s cenário(s)\n' "$failures" >&2
  exit 1
fi

printf 'OK: 2 cenários locais, sem rede\n'
