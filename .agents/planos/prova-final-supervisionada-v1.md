# Especificação congelada — prova final supervisionada v1

## 1. Identificação

```text
schema_documental: prova-final-supervisionada-v1
baseline: 95c415da2311cfceaf1e00c616e9eefe7638714f
etapa: 4
status: CONGELADA_NAO_AUTORIZADA
execucoes_permitidas: 1
retry_automatico: false
```

Esta especificação é documental e não autoriza execução por si só.

## 2. Objetivo da prova

Demonstrar, em uma única execução real supervisionada, que o runtime inicia de
forma controlada, reserva a missão antes do spawn, usa exatamente um writer,
cria o arquivo obrigatório, valida a entrega por bytes e hash, produz
comparação `conforme`, mantém evidência forense `complete`, preserva coerência
entre manifesto, state, ledger, Run Report e handoff, não persiste segredo ou
path indevido e não trata `exit_code=0` isolado como sucesso.

## 3. Identidade congelada da missão

```text
mission_id: quarto-piloto-supervisionado-20260717t-final
delivery_file: .agents/pilotos/sandbox/quarto-piloto-supervisionado-20260717t-final.txt
evidence_root: ${XDG_STATE_HOME:-$HOME/.local/state}/novo-app/agent-evidence
```

A `mission_id` não pode ser reutilizada. State existente bloqueia a execução.
Qualquer falha após a reserva consome a tentativa e não existe retry automático.
Nova tentativa exigiria outra especificação, outra `mission_id` e nova
autorização humana.

Os templates versionados obrigatórios da prova são:

```text
PATH_CARD: .agents/pilotos/templates/quarto-piloto-supervisionado-20260717t-final.card.json
PATH_PLAN: .agents/pilotos/templates/quarto-piloto-supervisionado-20260717t-final.plan.json
```

Esses dois arquivos ainda não existem e não devem ser criados nesta tarefa. A
prova fica bloqueada antes da reserva enquanto não forem criados, revisados e
mergeados na baseline autorizada. Antes da execução, seus SHA-256 devem ser
congelados no recibo de autorização e conferidos; ausência ou divergência
produz `PROVA_FINAL_BLOCKED_BEFORE_RESERVATION`.

## 4. Worktree futura

A execução deverá usar uma worktree nova e limpa, derivada diretamente da
baseline congelada:

```text
/Users/brunolima/Documents/NOVO-APP-final-supervised-proof-run
```

Essa worktree não é criada nesta tarefa e não pode conter alterações locais
antes da execução.

## 5. Falhas conhecidas fora do escopo

As falhas gerais conhecidas são:

- Typecheck;
- Tests;
- Dossier Golden;
- E2E Critical Browser;
- Skills Governance.

Elas pertencem ao app/repositório geral, não foram introduzidas pela PR #442 e
não devem ser corrigidas durante a prova. Não bloqueiam automaticamente a
prova do runtime. Só serão bloqueantes se evidência objetiva demonstrar impacto
direto no runner, na entrega, no preflight ou nos artefatos forenses.

## 6. Gates obrigatórios

Antes da execução, devem estar conformes:

- Agent Execution Control;
- Agent Runtime Observation;
- Agent Orchestration;
- Runtime Safety Preflight;
- Build;
- readiness estático;
- preflight live com resultado `ready`;
- Codex CLI `0.144.0`;
- DCG `v0.6.6`;
- checksum do binário DCG conforme;
- hook DCG direto confirmado;
- nenhuma variável ou flag de bypass;
- worktree limpa;
- baseline exata;
- contratos e schemas válidos;
- raiz externa de evidência válida;
- ausência de state anterior para a `mission_id`;
- autorização humana A3+;
- autorização explícita para uma única execução.

Preflight live é evidência de prontidão, não substitui as chaves nem a
autorização humana.

## 7. Autorizações e raiz de evidência

As seis chaves são:

```text
--agent-runtime
--runtime-ack RUN_SINGLE_AGENT
AGENT_RUNTIME_EXECUTE=1
--supervised-pilot
--pilot-ack RUN_SUPERVISED_PILOT
AGENT_RUNTIME_PILOT=1
```

A raiz deve ser fornecida por:

```text
AGENT_RUNTIME_EVIDENCE_ROOT
--evidence-root PATH
```

A presença técnica dessas chaves não substitui autorização humana explícita.

## 8. Comandos futuros — proibidos nesta tarefa

Os comandos abaixo definem a execução futura. Nenhum comando operacional de
readiness, preflight live, state, runtime, Codex ou piloto foi executado nesta
tarefa; a confirmação inicial da baseline foi a única exceção documental
exigida antes da criação desta worktree.

### 8.1 Baseline

```bash
git fetch origin
test "$(git rev-parse origin/main)" = "95c415da2311cfceaf1e00c616e9eefe7638714f"
PATH_WORKTREE="/Users/brunolima/Documents/NOVO-APP-final-supervised-proof-run"
EXPECTED_BASELINE="95c415da2311cfceaf1e00c616e9eefe7638714f"
test "$(git -C "$PATH_WORKTREE" rev-parse HEAD)" = "$EXPECTED_BASELINE"
test -z "$(git -C "$PATH_WORKTREE" status --porcelain)"
```

### 8.2 Worktree limpa

```bash
PATH_WORKTREE="/Users/brunolima/Documents/NOVO-APP-final-supervised-proof-run"
EXPECTED_BASELINE="95c415da2311cfceaf1e00c616e9eefe7638714f"
test "$(git -C "$PATH_WORKTREE" rev-parse HEAD)" = "$EXPECTED_BASELINE"
test -z "$(git -C "$PATH_WORKTREE" status --porcelain)"
```

### 8.3 Readiness

```bash
ruby scripts/check-pilot-readiness.rb --stdout
```

### 8.4 Preflight live

```bash
ruby scripts/runtime-safety-preflight.rb --mode live --worktree PATH_WORKTREE --stdout
```

O resultado exigido é `ready`.

### 8.5 Ausência de state

```bash
PATH_WORKTREE="/Users/brunolima/Documents/NOVO-APP-final-supervised-proof-run"
PATH_STATE_DIR="$PATH_WORKTREE/.agents/pilotos/state"
PATH_STATE_FILE="$PATH_STATE_DIR/quarto-piloto-supervisionado-20260717t-final.json"
test ! -e "$PATH_STATE_FILE"
```

O valor corresponde ao default atual de `AgentSupervisedPilot::DEFAULT_STATE_REL`.
Somente uma autorização futura explícita com `--pilot-state-dir` poderá alterá-lo.
Esta verificação não cria state.

### 8.5.1 Templates e hashes congelados

```bash
PATH_WORKTREE="/Users/brunolima/Documents/NOVO-APP-final-supervised-proof-run"
PATH_CARD="$PATH_WORKTREE/.agents/pilotos/templates/quarto-piloto-supervisionado-20260717t-final.card.json"
PATH_PLAN="$PATH_WORKTREE/.agents/pilotos/templates/quarto-piloto-supervisionado-20260717t-final.plan.json"
test -f "$PATH_CARD" || { echo "PROVA_FINAL_BLOCKED_BEFORE_RESERVATION" >&2; exit 1; }
test -f "$PATH_PLAN" || { echo "PROVA_FINAL_BLOCKED_BEFORE_RESERVATION" >&2; exit 1; }
test "$(shasum -a 256 "$PATH_CARD" | awk '{print $1}')" = "$CARD_SHA256_EXPECTED" || { echo "PROVA_FINAL_BLOCKED_BEFORE_RESERVATION" >&2; exit 1; }
test "$(shasum -a 256 "$PATH_PLAN" | awk '{print $1}')" = "$PLAN_SHA256_EXPECTED" || { echo "PROVA_FINAL_BLOCKED_BEFORE_RESERVATION" >&2; exit 1; }
```

`CARD_SHA256_EXPECTED` e `PLAN_SHA256_EXPECTED` só podem receber valores
congelados em autorização humana posterior. A ausência dos templates ou dos
hashes não autoriza criação, reparo ou reserva.

### 8.5.2 Raiz externa de evidência

```bash
EVIDENCE_ROOT="${XDG_STATE_HOME:-$HOME/.local/state}/novo-app/agent-evidence"
test "${EVIDENCE_ROOT#/}" != "$EVIDENCE_ROOT"
PATH_WORKTREE="/Users/brunolima/Documents/NOVO-APP-final-supervised-proof-run"
test -d "$PATH_WORKTREE"
WORKTREE_REAL="$(realpath "$PATH_WORKTREE")"

check_no_symlink_chain() {
  local candidate="$1"
  while [ "$candidate" != "/" ]; do
    test ! -L "$candidate" || return 1
    candidate="$(dirname "$candidate")"
  done
}

EVIDENCE_PARENT="$EVIDENCE_ROOT"
while [ ! -e "$EVIDENCE_PARENT" ]; do
  NEXT="$(dirname "$EVIDENCE_PARENT")"
  test "$NEXT" != "$EVIDENCE_PARENT"
  EVIDENCE_PARENT="$NEXT"
done
check_no_symlink_chain "$EVIDENCE_PARENT"
EVIDENCE_PARENT_REAL="$(realpath "$EVIDENCE_PARENT")"
EVIDENCE_SUFFIX="${EVIDENCE_ROOT#"$EVIDENCE_PARENT"}"
EVIDENCE_ROOT_REAL="$EVIDENCE_PARENT_REAL$EVIDENCE_SUFFIX"
check_no_symlink_chain "$EVIDENCE_ROOT"
case "$EVIDENCE_ROOT_REAL/" in
  "$WORKTREE_REAL/"*)
    echo "FORENSIC_EVIDENCE_ROOT_INSIDE_WORKTREE" >&2
    exit 1
    ;;
esac
test "$EVIDENCE_ROOT_REAL" != "$WORKTREE_REAL"
```

O bloco não cria a raiz. Ele exige worktree existente, caminho absoluto, ancestor
existente resolvido por `realpath`, cadeia sem symlink, e rejeita raiz igual ou
descendente da worktree.

### 8.6 Única chamada ao runner

```bash
# NAO_EXECUTAR_SEM_AUTORIZACAO_HUMANA_EXPLICITA
PATH_WORKTREE="/Users/brunolima/Documents/NOVO-APP-final-supervised-proof-run"
PATH_CARD="$PATH_WORKTREE/.agents/pilotos/templates/quarto-piloto-supervisionado-20260717t-final.card.json"
PATH_PLAN="$PATH_WORKTREE/.agents/pilotos/templates/quarto-piloto-supervisionado-20260717t-final.plan.json"
PATH_STATE_DIR="$PATH_WORKTREE/.agents/pilotos/state"
PATH_STATE_FILE="$PATH_STATE_DIR/quarto-piloto-supervisionado-20260717t-final.json"
EXPECTED_BASELINE="95c415da2311cfceaf1e00c616e9eefe7638714f"
test "$(git -C "$PATH_WORKTREE" rev-parse HEAD)" = "$EXPECTED_BASELINE"
test -z "$(git -C "$PATH_WORKTREE" status --porcelain)"
test ! -e "$PATH_STATE_FILE"
test -f "$PATH_CARD" && test -f "$PATH_PLAN"
test "$(shasum -a 256 "$PATH_CARD" | awk '{print $1}')" = "$CARD_SHA256_EXPECTED"
test "$(shasum -a 256 "$PATH_PLAN" | awk '{print $1}')" = "$PLAN_SHA256_EXPECTED"
EVIDENCE_ROOT="${XDG_STATE_HOME:-$HOME/.local/state}/novo-app/agent-evidence"
test "${EVIDENCE_ROOT#/}" != "$EVIDENCE_ROOT"
AGENT_RUNTIME_EXECUTE=1 \
AGENT_RUNTIME_PILOT=1 \
AGENT_RUNTIME_EVIDENCE_ROOT="$EVIDENCE_ROOT" \
ruby scripts/run-agent-mission.rb \
  --card "$PATH_CARD" \
  --plan "$PATH_PLAN" \
  --worktree "$PATH_WORKTREE" \
  --agent-runtime \
  --runtime-ack RUN_SINGLE_AGENT \
  --supervised-pilot \
  --pilot-ack RUN_SUPERVISED_PILOT \
  --evidence-root "$EVIDENCE_ROOT" \
  --pilot-state-dir "$PATH_STATE_DIR" \
  --output PATH_OUTPUT
```

Esta chamada é permitida uma única vez. A validação da baseline, limpeza,
templates, hashes, state e raiz externa é repetida imediatamente antes dela.
`PATH_OUTPUT` só será definido no momento autorizado.

### 8.7 Inspeção do Run Report

```bash
ruby -I. -rjson -rdigest -rpathname -e '
require_relative "scripts/plan-agent-mission"
report = JSON.parse(File.read(ARGV.fetch(0)))
schema = JSON.parse(File.read(".agents/orquestracao/executor/contrato-relatorio.schema.json"))
MissionPlanner.send(:validate_against_schema!, report, schema)
mission = "quarto-piloto-supervisionado-20260717t-final"
abort "REPORT_CONTRACT_FAILED" unless report.fetch("missao_id") == mission
abort "REPORT_CONTRACT_FAILED" unless report.fetch("status") == "success"
runtime = report.fetch("runtime")
abort "REPORT_CONTRACT_FAILED" unless runtime.fetch("processo_codex_iniciado") == true
abort "REPORT_CONTRACT_FAILED" unless runtime.fetch("exit_code") == 0
abort "REPORT_CONTRACT_FAILED" unless runtime.fetch("timeout") == false
abort "REPORT_CONTRACT_FAILED" unless runtime.fetch("sinal").nil?
abort "REPORT_CONTRACT_FAILED" unless report.dig("comparacao", "status") == "conforme"
delivery = report.fetch("delivery_verification")
abort "REPORT_CONTRACT_FAILED" unless delivery.fetch("status") == "succeeded"
abort "REPORT_CONTRACT_FAILED" unless delivery.fetch("expected_sha256") == delivery.fetch("observed_sha256")
abort "REPORT_CONTRACT_FAILED" unless delivery.fetch("expected_bytes") == delivery.fetch("observed_bytes")
abort "REPORT_CONTRACT_FAILED" unless report.dig("forensic_evidence", "evidence_status") == "complete"
manifest_rel = report.dig("forensic_evidence", "manifest_relpath")
abort "REPORT_CONTRACT_FAILED" unless manifest_rel && !Pathname.new(manifest_rel).absolute? && !manifest_rel.split(File::SEPARATOR).include?("..")
manifest_path = File.expand_path(ARGV.fetch(1))
abort "REPORT_CONTRACT_FAILED" unless File.basename(manifest_path) == "evidence-manifest.json"
abort "REPORT_CONTRACT_FAILED" unless Digest::SHA256.file(manifest_path).hexdigest == report.dig("forensic_evidence", "manifest_sha256")
abort "REPORT_CONTRACT_FAILED" unless report.fetch("task_ledger").length == 1
abort "REPORT_CONTRACT_FAILED" unless report.dig("handoff", "requer_aprovacao_humana") == true
puts JSON.pretty_generate(report)
' PATH_OUTPUT PATH_MANIFEST
```

### 8.8 Manifesto e hashes

```bash
ruby -I. -rjson -rdigest -e '
require "pathname"
require_relative "scripts/plan-agent-mission"
manifest_path = File.expand_path(ARGV.fetch(0))
manifest = JSON.parse(File.read(manifest_path))
schema = JSON.parse(File.read(".agents/orquestracao/executor/contrato-evidencia-forense.schema.json"))
MissionPlanner.send(:validate_against_schema!, manifest, schema)
mission = "quarto-piloto-supervisionado-20260717t-final"
abort "MANIFEST_CONTRACT_FAILED" unless manifest.fetch("mission_id") == mission
abort "MANIFEST_CONTRACT_FAILED" unless manifest.fetch("attempt") == 1
abort "MANIFEST_CONTRACT_FAILED" unless manifest.fetch("evidence_status") == "complete"
abort "MANIFEST_CONTRACT_FAILED" unless manifest.fetch("schema_version") == 1
sanitization = manifest.fetch("sanitization")
abort "MANIFEST_CONTRACT_FAILED" unless sanitization.fetch("sanitized") == true
abort "MANIFEST_CONTRACT_FAILED" unless sanitization.fetch("fail_closed") == true
abort "MANIFEST_CONTRACT_FAILED" if sanitization["sanitization_failed"] == true
expected = %w[execution-evidence.json execution-stream.sanitized.jsonl stderr.sanitized.log].sort
abort "MANIFEST_CONTRACT_FAILED" unless manifest.fetch("artifacts").map { |a| a.fetch("name") }.sort == expected
manifest_dir = File.realpath(File.dirname(manifest_path))
manifest.fetch("artifacts").each do |artifact|
  name = artifact.fetch("name")
  abort "MANIFEST_PATH_INVALID" if Pathname.new(name).absolute? || name.split(File::SEPARATOR).include?("..")
  artifact_path = File.expand_path(name, manifest_dir)
  real = File.realpath(artifact_path)
  abort "MANIFEST_PATH_INVALID" unless real == manifest_dir || real.start_with?(manifest_dir + File::SEPARATOR)
  abort "MANIFEST_ARTIFACT_FAILED" unless File.file?(real)
  abort "MANIFEST_ARTIFACT_FAILED" unless File.size(real) == artifact.fetch("bytes")
  abort "MANIFEST_ARTIFACT_FAILED" unless Digest::SHA256.file(real).hexdigest == artifact.fetch("sha256")
  abort "MANIFEST_ARTIFACT_FAILED" unless artifact.fetch("sanitized") == true
  abort "MANIFEST_ARTIFACT_FAILED" unless artifact.fetch("truncated") == false
end
puts JSON.pretty_generate(manifest)
' PATH_MANIFEST
```

### 8.9 Ledger

```bash
ruby -rjson -e 'r=JSON.parse(File.read(ARGV.fetch(0))); l=r.fetch("task_ledger"); abort unless l.length==1; puts JSON.pretty_generate(l)' PATH_OUTPUT
```

### 8.10 Diff e arquivo entregue

```bash
DELIVERY_REL=".agents/pilotos/sandbox/quarto-piloto-supervisionado-20260717t-final.txt"
DELIVERY_ABS="$PATH_WORKTREE/$DELIVERY_REL"
test -f "$DELIVERY_ABS"
STATUS_OUTPUT="$(git -C "$PATH_WORKTREE" status --porcelain=v1 --untracked-files=all -z)"
ruby -e '
expected = ARGV.fetch(0)
entries = STDIN.read.split("\0").reject(&:empty?)
abort "OUT_OF_SCOPE_DIFF" unless entries.length == 1
path = entries.first.byteslice(3..)
abort "OUT_OF_SCOPE_DIFF" unless path == expected
' "$DELIVERY_REL" <<<"$STATUS_OUTPUT"
```

Todos os comandos desta seção estão proibidos nesta tarefa.

## 9. Critério exato de sucesso

O resultado só pode ser `PROVA_FINAL_SUCCESS` se todos forem verdadeiros:

- baseline exata e worktree inicialmente limpa;
- readiness conforme e preflight live `ready`;
- reserva única concluída e spawn real registrado;
- exatamente um writer, sem timeout ou sinal, com exit code `0`;
- entrega criada com bytes e hash exatos;
- comparação `conforme`;
- evidência `complete` e sanitização sem falha;
- manifesto válido e hashes dos artefatos válidos;
- state, ledger, Run Report e handoff coerentes;
- diff final contendo somente o arquivo sandbox esperado;
- nenhuma alteração fora do escopo;
- revisão humana final aprovada.

Não existe sucesso parcial.

## 10. Critério exato de falha

Qualquer ocorrência abaixo produz falha e encerra a prova:

- baseline divergente, worktree suja ou gate não conforme;
- preflight diferente de `ready`;
- state/tentativa já existente ou falha de reserva;
- ausência de spawn, mais de um writer, timeout ou sinal;
- exit code diferente de `0`;
- entrega ausente ou divergente;
- comparação não conforme;
- evidência `partial` ou `unavailable`;
- falha de sanitização, manifesto ausente/inválido ou hash divergente;
- incoerência entre state, ledger, report, manifesto ou handoff;
- alteração fora do arquivo sandbox;
- tentativa de retry, uso de bypass ou ausência de autorização humana.

State e evidências devem ser preservados. Não se corrige, repara output ou
reexecuta a mesma missão.

## 11. Artefatos esperados

| Artefato | Finalidade | Localização esperada | Validação |
|---|---|---|---|
| Arquivo sandbox | Resultado obrigatório | `PATH_WORKTREE/.agents/pilotos/sandbox/quarto-piloto-supervisionado-20260717t-final.txt` | existência, bytes e hash |
| Run Report | Resultado integrado | `PATH_OUTPUT` | schema, status e referências |
| State do piloto | Reserva one-shot | `PATH_STATE_DIR` | missão, tentativa e coerência |
| Ledger | Estado da tarefa | dentro do Run Report | exatamente uma tarefa |
| `execution-stream.sanitized.jsonl` | Stream sanitizado | `${EVIDENCE_ROOT}/<mission_id>/attempt-001/` | JSONL, limites, sanitização |
| `execution-evidence.json` | Checkpoints | `${EVIDENCE_ROOT}/<mission_id>/attempt-001/` | estado sanitizado |
| `stderr.sanitized.log` | Stderr sanitizado | `${EVIDENCE_ROOT}/<mission_id>/attempt-001/` | sem segredo/path indevido |
| `evidence-manifest.json` | Integridade | `${EVIDENCE_ROOT}/<mission_id>/attempt-001/` | schema, hashes, `complete` |
| Handoff final | Revisão humana | dentro do Run Report | `requer_aprovacao_humana: true` |
| Diff final | Controle de escopo | `PATH_WORKTREE` | somente sandbox esperado |

## 12. Ordem operacional futura

1. confirmação humana;
2. validação da baseline;
3. criação da worktree limpa;
4. readiness;
5. preflight live;
6. validação da raiz de evidência;
7. validação de inexistência de state;
8. última autorização humana;
9. única execução;
10. inspeção sem reparo;
11. classificação;
12. aprovação humana do resultado;
13. encerramento da Etapa 4;
14. somente após sucesso, avaliação da Etapa 5.

Não pode haver correção, ajuste, segunda chamada ou reparo de output entre os
passos 9 e 12.

## 13. Classificações finais possíveis

```text
PROVA_FINAL_SUCCESS
PROVA_FINAL_FAILURE_NO_RETRY
PROVA_FINAL_NOT_EXECUTED
PROVA_FINAL_BLOCKED_BEFORE_RESERVATION
```

- `PROVA_FINAL_SUCCESS`: a única execução ocorreu e satisfez integralmente o
  sucesso.
- `PROVA_FINAL_FAILURE_NO_RETRY`: houve reserva ou execução e ocorreu falha; a
  tentativa permanece consumida.
- `PROVA_FINAL_NOT_EXECUTED`: a prova ainda não foi autorizada nem iniciada.
- `PROVA_FINAL_BLOCKED_BEFORE_RESERVATION`: gate ou autorização bloqueou antes
  da reserva; nenhuma tentativa foi consumida.

## 14. Liberação controlada

A Etapa 5 só poderá começar com `PROVA_FINAL_SUCCESS`, revisão humana do Report
e manifesto concluída, nenhum segredo ou violação encontrado, diff restrito ao
arquivo sandbox, state/ledger/evidências arquivados e decisão humana explícita
autorizando a liberação controlada.

Isso não autoriza uso amplo, piloto adicional ou automação recorrente.

## 15. Pendências não bloqueadoras

Dívidas separadas que não alteram a prova única congelada:

- inicialização explícita de `pilot_dry_run = false`;
- validação direta do manifesto contra o schema no teste forense;
- separação futura entre limite de registro JSONL e limite por campo;
- correção futura dos gates gerais do app.

## 16. Proibições

Esta especificação não autoriza executar Codex real, runtime, piloto ou
preflight live; criar state, reservar tentativa, criar diretório oficial de
evidência ou arquivo sandbox; corrigir o app; alterar código, contratos ou
schemas; abrir PR; fazer merge; criar retry; ou preparar uma sequência de
pilotos.
