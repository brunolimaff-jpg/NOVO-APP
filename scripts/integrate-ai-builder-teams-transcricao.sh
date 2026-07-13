#!/usr/bin/env bash
# Integra prompt AI Builder "Resumo de transcrição Teams" no fluxo Teams-Transcricao-para-Reunioes.
# Pré-requisito: az login (conta com acesso ao ambiente Power Platform)
set -euo pipefail

FLOW_ID="${FLOW_ID:-707bf491-534f-43da-b544-f6c73ae41dd7}"
ENV_ID="${ENV_ID:-Default-62c7b02d-a95c-498b-9a7f-6e00acab728d}"
PROMPT_NAME="${PROMPT_NAME:-Resumo de transcrição Teams}"
API_BASE="${API_BASE:-https://unitedstates.api.flow.microsoft.com}"
API_VERSION="${API_VERSION:-2016-11-01}"
SCOPE_NAME="${SCOPE_NAME:-Scope_ProcessarNovo}"
IDEMPOTENCY_SUFFIX_TEST="${IDEMPOTENCY_SUFFIX_TEST:-_aip_}"
BACKUP_DIR="${BACKUP_DIR:-/tmp/flow-backups}"
POLL_INTERVAL="${POLL_INTERVAL:-15}"
POLL_MAX="${POLL_MAX:-40}"
DRY_RUN="${DRY_RUN:-0}"
REVERT_SUFFIX="${REVERT_SUFFIX:-1}"

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die() { log "ERRO: $*"; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Comando obrigatório ausente: $1"
}

get_flow_token() {
  az account get-access-token --resource https://service.flow.microsoft.com --query accessToken -o tsv 2>/dev/null \
    || die "Falha ao obter token. Execute: az login"
}

get_dataverse_token() {
  # Ambientes Default costumam usar org *.crm.dynamics.com
  az account get-access-token --resource "${DATAVERSE_RESOURCE:-https://org.crm.dynamics.com}" --query accessToken -o tsv 2>/dev/null \
    || az account get-access-token --resource https://api.powerplatform.com --query accessToken -o tsv 2>/dev/null \
    || true
}

flow_url() {
  echo "${API_BASE}/providers/Microsoft.ProcessSimple/environments/${ENV_ID}/flows/${FLOW_ID}?api-version=${API_VERSION}"
}

discover_dataverse_url() {
  local token="$1"
  local env_url resp org_url
  env_url="${API_BASE}/providers/Microsoft.PowerApps/environments/${ENV_ID}?api-version=${API_VERSION}"
  resp="$(curl -sS -H "Authorization: Bearer ${token}" -H "Accept: application/json" "$env_url" || true)"
  org_url="$(echo "$resp" | jq -r '.properties.linkedEnvironmentMetadata.instanceUrl // .properties.instanceUrl // empty' 2>/dev/null || true)"
  if [[ -z "$org_url" || "$org_url" == "null" ]]; then
    # fallback: listar ambientes
    local list_url="${API_BASE}/providers/Microsoft.PowerApps/environments?api-version=${API_VERSION}"
    resp="$(curl -sS -H "Authorization: Bearer ${token}" -H "Accept: application/json" "$list_url")"
    org_url="$(echo "$resp" | jq -r --arg e "$ENV_ID" '.value[] | select(.name == $e) | .properties.linkedEnvironmentMetadata.instanceUrl // empty' | head -1)"
  fi
  [[ -n "$org_url" && "$org_url" != "null" ]] || die "Não foi possível resolver URL Dataverse do ambiente ${ENV_ID}"
  echo "${org_url%/}"
}

discover_prompt_id() {
  local dv_token="$1" dv_url="$2"
  local q name_enc
  name_enc="$(python3 -c "import urllib.parse; print(urllib.parse.quote(\"${PROMPT_NAME}\"))")"
  q="${dv_url}/api/data/v9.2/msdyn_aimodels?\$select=msdyn_aimodelid,msdyn_name&\$filter=msdyn_name eq '${PROMPT_NAME}'"
  local resp
  resp="$(curl -sS -G -H "Authorization: Bearer ${dv_token}" -H "Accept: application/json" -H "OData-MaxVersion: 4.0" -H "OData-Version: 4.0" \
    --data-urlencode "\$select=msdyn_aimodelid,msdyn_name" \
    --data-urlencode "\$filter=msdyn_name eq '${PROMPT_NAME}'" \
    "${dv_url}/api/data/v9.2/msdyn_aimodels")"
  local pid
  pid="$(echo "$resp" | jq -r '.value[0].msdyn_aimodelid // empty')"
  [[ -n "$pid" ]] || die "Prompt '${PROMPT_NAME}' não encontrado em msdyn_aimodels. Resposta: $(echo "$resp" | jq -c '.error // .value | length')"
  echo "$pid"
}

backup_flow() {
  local token="$1" outfile="$2"
  mkdir -p "$BACKUP_DIR"
  curl -sS -H "Authorization: Bearer ${token}" -H "Accept: application/json" "$(flow_url)" | tee "$outfile" >/dev/null
  log "Backup salvo em ${outfile}"
}

patch_flow_definition() {
  local token="$1" backup_file="$2" prompt_id="$3"
  export BACKUP_FILE="$backup_file" PROMPT_ID="$prompt_id" SCOPE_NAME="$SCOPE_NAME" IDEMPOTENCY_SUFFIX_TEST="$IDEMPOTENCY_SUFFIX_TEST"
  python3 <<'PY'
import json, os, re, sys, uuid

backup = os.environ["BACKUP_FILE"]
prompt_id = os.environ["PROMPT_ID"]
scope_name = os.environ["SCOPE_NAME"]
suffix = os.environ["IDEMPOTENCY_SUFFIX_TEST"]

with open(backup) as f:
    flow = json.load(f)

props = flow.get("properties", flow)
definition = props.get("definition") or props.get("properties", {}).get("definition")
connrefs = props.get("connectionReferences") or props.get("properties", {}).get("connectionReferences")
if not definition:
    sys.exit("Definição do fluxo não encontrada no backup")

actions = definition.setdefault("actions", {})

# localizar scope
if scope_name not in actions:
    # busca recursiva por nome
    def find_scope(obj, path=""):
        if isinstance(obj, dict):
            for k, v in obj.items():
                if k == scope_name and isinstance(v, dict) and v.get("type") == "Scope":
                    return v, path + "/" + k
                r = find_scope(v, path + "/" + k)
                if r: return r
        return None
    found = find_scope(actions)
    if not found:
        sys.exit(f"Scope {scope_name} não encontrado")
    scope = found[0]
else:
    scope = actions[scope_name]

scope_actions = scope.setdefault("actions", {})

# achar ação de conteúdo da transcrição (heurística)
transcript_action = None
candidates = []
for name, act in scope_actions.items():
    blob = json.dumps(act, ensure_ascii=False).lower()
    if any(x in blob for x in ("transcript", "transcri", "get file content", "getfilecontent", "vtt", "content")):
        candidates.append(name)
if len(candidates) == 1:
    transcript_action = candidates[0]
elif candidates:
    # preferir nomes explícitos
    for pref in ("Get_transcript", "GetTranscript", "Obter_transcricao", "Get_file_content", "Transcript"):
        for c in candidates:
            if pref.lower() in c.lower():
                transcript_action = c
                break
        if transcript_action:
            break
    transcript_action = transcript_action or candidates[0]
else:
    sys.exit("Não foi possível identificar ação de conteúdo da transcrição no scope")

# achar compose fallback existente
compose_fallback = None
for name, act in scope_actions.items():
    if act.get("type") == "Compose" and "fallback" in name.lower():
        compose_fallback = name
if not compose_fallback:
    for name, act in scope_actions.items():
        if act.get("type") == "Compose" and ("resumo" in name.lower() or "summary" in name.lower()):
            compose_fallback = name
            break

# connection AI Builder
ai_conn = None
refs = connrefs or {}
for k, v in refs.items():
    api = (v.get("api") or {}).get("name", "")
    if "aibuilder" in api.lower() or "aibuilder" in k.lower():
        ai_conn = k
        break
ai_conn = ai_conn or "shared_aibuilder"

run_prompt_name = "Run_a_prompt_Resumo"
if run_prompt_name in scope_actions:
    run_prompt_name = f"Run_a_prompt_Resumo_{uuid.uuid4().hex[:6]}"

# input do prompt — mapear saída da transcrição
transcript_ref = f"@outputs('{transcript_action}')?['body']"
# alguns conectores usam body/$content
transcript_expr = f"@coalesce(outputs('{transcript_action}')?['body'], outputs('{transcript_action}')?['body/$content'], outputs('{transcript_action}')?['body/content'], string(outputs('{transcript_action}')))"

scope_actions[run_prompt_name] = {
    "type": "OpenApiConnection",
    "runAfter": {transcript_action: ["Succeeded"]},
    "metadata": {"operationMetadataId": str(uuid.uuid4())},
    "inputs": {
        "host": {
            "apiId": "/providers/Microsoft.PowerApps/apis/shared_aibuilder",
            "connectionName": ai_conn,
            "operationId": "RunPrompt",
        },
        "parameters": {
            "promptId": prompt_id,
            "promptName": os.environ.get("PROMPT_NAME", "Resumo de transcrição Teams"),
            "inputs": {
                "Transcript": transcript_expr,
                "Text": transcript_expr,
                "transcript": transcript_expr,
                "text": transcript_expr,
            },
        },
        "authentication": "@parameters('$authentication')",
    },
}

# expressão de resumo: AI com fallback para Compose
if compose_fallback:
    summary_expr = (
        f"@if(equals(outputs('{run_prompt_name}')?['statusCode'], 200), "
        f"coalesce(outputs('{run_prompt_name}')?['body/text'], outputs('{run_prompt_name}')?['body/Text'], outputs('{run_prompt_name}')?['body/response'], outputs('{run_prompt_name}')?['body']), "
        f"outputs('{compose_fallback}'))"
    )
else:
    summary_expr = (
        f"@coalesce(outputs('{run_prompt_name}')?['body/text'], outputs('{run_prompt_name}')?['body/Text'], "
        f"outputs('{run_prompt_name}')?['body/response'], outputs('{run_prompt_name}')?['body'])"
    )

# atualizar CreateFile _resumo.md e Teams — heurística por nome/conteúdo
for name, act in list(scope_actions.items()):
    if name == run_prompt_name:
        continue
    blob = json.dumps(act, ensure_ascii=False)
    low = name.lower()
    if act.get("type") == "OpenApiConnection":
        op = act.get("inputs", {}).get("host", {}).get("operationId", "")
        params = act.get("inputs", {}).get("parameters", {})
        p_blob = json.dumps(params, ensure_ascii=False)
        # CreateFile SharePoint/OneDrive
        if any(x in op for x in ("CreateFile", "Create_item", "CreateItem")) or "_resumo" in p_blob.lower():
            if "name" in params or "path" in params or "itemPath" in params:
                for key in ("name", "path", "itemPath", "folderPath"):
                    if key in params and isinstance(params[key], str) and "_resumo" in params[key].lower():
                        if suffix not in params[key]:
                            params[key] = params[key].replace("_resumo.md", f"{suffix}_resumo.md")
                for key in ("body", "content", "fileContent"):
                    if key in params:
                        params[key] = summary_expr
                # runAfter: após prompt (Succeeded) ou compose (Failed do prompt)
                act["runAfter"] = {run_prompt_name: ["Succeeded", "Failed", "Skipped", "TimedOut"]}
        # Teams post
        if "teams" in blob.lower() or "PostMessage" in op or "postmessage" in op.lower():
            if "messageBody" in params:
                params["messageBody"] = summary_expr
            elif "body" in params and isinstance(params["body"], dict) and "messageBody" in params["body"]:
                params["body"]["messageBody"] = summary_expr
            act.setdefault("runAfter", {})
            act["runAfter"][run_prompt_name] = ["Succeeded", "Failed", "Skipped", "TimedOut"]

# garantir connection reference AI Builder stub se ausente
if connrefs is not None and ai_conn not in connrefs:
    connrefs[ai_conn] = {
        "api": {"name": "shared_aibuilder"},
        "connection": {},
        "runtimeSource": "embedded",
    }

patch = {
    "properties": {
        "definition": definition,
        "connectionReferences": connrefs or {},
    }
}
print(json.dumps(patch, ensure_ascii=False))
PY
}

apply_patch() {
  local token="$1" patch_body="$2"
  if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY_RUN=1 — patch não enviado"
    echo "$patch_body" | jq '.' > "${BACKUP_DIR}/patch-preview.json"
    return 0
  fi
  curl -sS -X PATCH "$(flow_url)" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d "$patch_body" | jq -c '.' || true
  log "PATCH do fluxo enviado"
}

trigger_recurrence() {
  local token="$1"
  local url="${API_BASE}/providers/Microsoft.ProcessSimple/environments/${ENV_ID}/flows/${FLOW_ID}/triggers/Recurrence/run?api-version=${API_VERSION}"
  curl -sS -X POST "$url" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d '{}' | jq -r '.name // .id // .'
}

poll_run() {
  local token="$1" run_id="$2"
  local url actions_url status ai_status ai_out compose_out
  url="${API_BASE}/providers/Microsoft.ProcessSimple/environments/${ENV_ID}/flows/${FLOW_ID}/runs/${run_id}?api-version=${API_VERSION}"
  actions_url="${API_BASE}/providers/Microsoft.ProcessSimple/environments/${ENV_ID}/flows/${FLOW_ID}/runs/${run_id}/actions?api-version=${API_VERSION}"

  for i in $(seq 1 "$POLL_MAX"); do
    status="$(curl -sS -H "Authorization: Bearer ${token}" "$url" | jq -r '.properties.status // .status // "Unknown"')"
    log "Poll ${i}/${POLL_MAX}: run=${run_id} status=${status}"
    [[ "$status" == "Running" || "$status" == "NotSpecified" ]] || break
    sleep "$POLL_INTERVAL"
  done

  local actions
  actions="$(curl -sS -H "Authorization: Bearer ${token}" "$actions_url")"
  echo "$actions" | jq '[.value[]? | {name: .name, status: (.properties.status // .status), error: (.properties.error // .error)}]' > "${BACKUP_DIR}/run-${run_id}-actions.json"

  ai_status="$(echo "$actions" | jq -r '.value[]? | select(.name | test("Run_a_prompt"; "i")) | .properties.status // .status' | head -1)"
  ai_out="$(echo "$actions" | jq -r '.value[]? | select(.name | test("Run_a_prompt"; "i")) | .properties.outputs // .outputs' | head -c 1200)"
  compose_out="$(echo "$actions" | jq -r '.value[]? | select(.name | test("Compose"; "i")) | .properties.outputs // .outputs' | head -c 800)"

  cat <<EOF

========== RELATÓRIO DE EXECUÇÃO ==========
Run ID: ${run_id}
Status final do run: ${status}
Status Run_a_prompt: ${ai_status:-N/A}
Amostra saída AI (truncada):
${ai_out:-N/A}
Amostra Compose (truncada):
${compose_out:-N/A}
Detalhes: ${BACKUP_DIR}/run-${run_id}-actions.json
===========================================
EOF
}

revert_suffix() {
  local token="$1" backup_file="$2"
  [[ "$REVERT_SUFFIX" == "1" ]] || { log "REVERT_SUFFIX=0 — sufixo _aip_ mantido"; return 0; }
  export BACKUP_FILE="$backup_file" IDEMPOTENCY_SUFFIX_TEST="$IDEMPOTENCY_SUFFIX_TEST"
  local revert_body
  revert_body="$(python3 <<'PY'
import json, os
suffix = os.environ["IDEMPOTENCY_SUFFIX_TEST"]
with open(os.environ["BACKUP_FILE"]) as f:
    flow = json.load(f)
props = flow.get("properties", flow)
definition = props.get("definition") or props.get("properties", {}).get("definition")
connrefs = props.get("connectionReferences") or props.get("properties", {}).get("connectionReferences")
blob = json.dumps(definition)
blob = blob.replace(f"{suffix}_resumo.md", "_resumo.md")
definition = json.loads(blob)
print(json.dumps({"properties": {"definition": definition, "connectionReferences": connrefs or {}}}, ensure_ascii=False))
PY
)"
  apply_patch "$token" "$revert_body"
  log "Sufixo de idempotência revertido para _resumo.md estável"
}

main() {
  require_cmd az
  require_cmd jq
  require_cmd curl
  require_cmd python3

  az account show >/dev/null 2>&1 || die "Azure CLI sem sessão. Execute: az login"

  local token backup_file prompt_id dv_token dv_url patch_body run_id
  token="$(get_flow_token)"
  backup_file="${BACKUP_DIR}/flow-${FLOW_ID}-$(date -u +%Y%m%dT%H%M%SZ).json"
  backup_flow "$token" "$backup_file"

  dv_token="$(get_dataverse_token)"
  if [[ -n "$dv_token" ]]; then
    dv_url="$(discover_dataverse_url "$token")"
    log "Dataverse: ${dv_url}"
    prompt_id="$(discover_prompt_id "$dv_token" "$dv_url")"
    log "Prompt GUID: ${prompt_id}"
  else
    die "Token Dataverse indisponível — defina DATAVERSE_RESOURCE ou faça az login com licença Power Platform"
  fi

  patch_body="$(patch_flow_definition "$token" "$backup_file" "$prompt_id")"
  echo "$patch_body" > "${BACKUP_DIR}/patch-body.json"
  apply_patch "$token" "$patch_body"

  if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY_RUN concluído. Revise ${BACKUP_DIR}/patch-body.json"
    exit 0
  fi

  run_id="$(trigger_recurrence "$token")"
  [[ -n "$run_id" && "$run_id" != "null" ]] || die "Falha ao disparar Recurrence/run"
  log "Run disparado: ${run_id}"

  poll_run "$token" "$run_id"

  # reverter sufixo se AI step teve sucesso
  local ai_ok
  ai_ok="$(jq -r '.[]? | select(.name | test("Run_a_prompt"; "i")) | .status' "${BACKUP_DIR}/run-${run_id}-actions.json" 2>/dev/null | head -1)"
  if [[ "$ai_ok" == "Succeeded" ]]; then
    revert_suffix "$token" "$backup_file"
  else
    log "AI step não Succeeded (${ai_ok:-desconhecido}) — sufixo _aip_ mantido para nova tentativa"
  fi
}

main "$@"
