# Runbook — prova final supervisionada

Este runbook prepara a única execução autorizável da missão congelada. Nenhum
bloco abaixo autoriza execução por si só. A mesma `mission_id` nunca pode ser
repetida.

## 1. Worktree do runner

Use uma worktree nova, limpa e externa à worktree alvo, criada a partir do
commit mergeado do pacote operacional. Congele o SHA antes de continuar:

```bash
RUNNER_SHA="<SHA_MERGEADO_DO_PACOTE>"
RUNNER_ROOT="/Users/brunolima/Documents/NOVO-APP-final-supervised-proof-runner"
git fetch origin
git worktree add --detach "$RUNNER_ROOT" "$RUNNER_SHA"
test "$(git -C "$RUNNER_ROOT" rev-parse HEAD)" = "$RUNNER_SHA"
test -z "$(git -C "$RUNNER_ROOT" status --porcelain)"
```

O `RUNNER_ROOT` deve conter a especificação mergeada, os três modelos JSON,
`final-supervised-proof-control.rb` e seus testes.

## 2. Worktree alvo

```bash
TARGET_BASELINE="95c415da2311cfceaf1e00c616e9eefe7638714f"
TARGET_WORKTREE="/Users/brunolima/Documents/NOVO-APP-final-supervised-proof-run"
git worktree add --detach "$TARGET_WORKTREE" "$TARGET_BASELINE"
test "$(git -C "$TARGET_WORKTREE" rev-parse HEAD)" = "$TARGET_BASELINE"
test -z "$(git -C "$TARGET_WORKTREE" status --porcelain)"
```

## 3. Raízes externas

Defina os caminhos explicitamente em cada sessão. As raízes não podem ser a
worktree do runner, a worktree alvo, `Dir.tmpdir` ou uma cadeia com symlink.

```bash
EVIDENCE_ROOT="${XDG_STATE_HOME:-$HOME/.local/state}/novo-app/agent-evidence"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/novo-app/agent-state"
REPORT_ROOT="${XDG_STATE_HOME:-$HOME/.local/state}/novo-app/agent-reports"
PATH_OUTPUT="$(ruby -rtmpdir -e 'print File.realpath(Dir.tmpdir)')/quarto-piloto-supervisionado-20260717t-final.run-report.json"
```

Não crie essas raízes manualmente para contornar um bloqueio; o controlador
deve validar os ancestors e os destinos antes da reserva.

## 4. Preparação

Congele também o SHA do runner e forneça o caminho de saída temporário. Este
comando não executa o runner nem cria state, evidência ou entrega:

```bash
RUNNER_ROOT="/Users/brunolima/Documents/NOVO-APP-final-supervised-proof-runner"
TARGET_WORKTREE="/Users/brunolima/Documents/NOVO-APP-final-supervised-proof-run"
RUNNER_HEAD_EXPECTED="<SHA_MERGEADO_DO_PACOTE>"
EVIDENCE_ROOT="${XDG_STATE_HOME:-$HOME/.local/state}/novo-app/agent-evidence"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/novo-app/agent-state"
REPORT_ROOT="${XDG_STATE_HOME:-$HOME/.local/state}/novo-app/agent-reports"
PATH_OUTPUT="$(ruby -rtmpdir -e 'print File.realpath(Dir.tmpdir)')/quarto-piloto-supervisionado-20260717t-final.run-report.json"
ruby "$RUNNER_ROOT/scripts/final-supervised-proof-control.rb" prepare \
  --runner-root "$RUNNER_ROOT" \
  --target-worktree "$TARGET_WORKTREE" \
  --runner-head "$RUNNER_HEAD_EXPECTED" \
  --target-baseline "95c415da2311cfceaf1e00c616e9eefe7638714f" \
  --output "$PATH_OUTPUT" \
  --report-root "$REPORT_ROOT" \
  --evidence-root "$EVIDENCE_ROOT" \
  --state-dir "$STATE_DIR" \
  --live-preflight --stdout
```

Só `status=READY_FOR_FINAL_PROOF` permite solicitar a autorização humana A3.
JSON inválido, readiness diferente de `ready` ou qualquer divergência bloqueia
antes da reserva.

## 5. Autorização e única chamada

Depois de revisar o receipt e obter autorização humana explícita para esta
única missão, use os mesmos caminhos redeclarados na sessão atual. O comando
abaixo é preparado, não executado por este documento:

```bash
RUNNER_ROOT="/Users/brunolima/Documents/NOVO-APP-final-supervised-proof-runner"
TARGET_WORKTREE="/Users/brunolima/Documents/NOVO-APP-final-supervised-proof-run"
EVIDENCE_ROOT="${XDG_STATE_HOME:-$HOME/.local/state}/novo-app/agent-evidence"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/novo-app/agent-state"
PATH_CARD="$RUNNER_ROOT/.agents/pilotos/templates/quarto-piloto-supervisionado-20260717t-final.card.json"
PATH_PLAN="$RUNNER_ROOT/.agents/pilotos/templates/quarto-piloto-supervisionado-20260717t-final.plan.json"
PATH_OUTPUT="$(ruby -rtmpdir -e 'print File.realpath(Dir.tmpdir)')/quarto-piloto-supervisionado-20260717t-final.run-report.json"
AGENT_RUNTIME_EXECUTE=1 AGENT_RUNTIME_PILOT=1 AGENT_RUNTIME_EVIDENCE_ROOT="$EVIDENCE_ROOT" \
ruby "$RUNNER_ROOT/scripts/run-agent-mission.rb" \
  --card "$PATH_CARD" --plan "$PATH_PLAN" --worktree "$TARGET_WORKTREE" \
  --agent-runtime --runtime-ack RUN_SINGLE_AGENT --supervised-pilot \
  --pilot-ack RUN_SUPERVISED_PILOT --evidence-root "$EVIDENCE_ROOT" \
  --pilot-state-dir "$STATE_DIR" --output "$PATH_OUTPUT"
```

Não repetir em nenhum código de saída. Falha após a reserva consome a tentativa.

## 6. Inspeção pós-execução

```bash
RUNNER_ROOT="/Users/brunolima/Documents/NOVO-APP-final-supervised-proof-runner"
TARGET_WORKTREE="/Users/brunolima/Documents/NOVO-APP-final-supervised-proof-run"
EVIDENCE_ROOT="${XDG_STATE_HOME:-$HOME/.local/state}/novo-app/agent-evidence"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/novo-app/agent-state"
REPORT_ROOT="${XDG_STATE_HOME:-$HOME/.local/state}/novo-app/agent-reports"
PATH_OUTPUT="$(ruby -rtmpdir -e 'print File.realpath(Dir.tmpdir)')/quarto-piloto-supervisionado-20260717t-final.run-report.json"
ruby "$RUNNER_ROOT/scripts/final-supervised-proof-control.rb" inspect \
  --runner-root "$RUNNER_ROOT" --target-worktree "$TARGET_WORKTREE" \
  --output "$PATH_OUTPUT" \
  --persistent-report "$REPORT_ROOT/quarto-piloto-supervisionado-20260717t-final.run-report.json" \
  --report-root "$REPORT_ROOT" \
  --evidence-root "$EVIDENCE_ROOT" --state-dir "$STATE_DIR" --stdout
```

O controlador preserva o temporário, publica uma cópia atômica e valida
Run Report, state, manifesto, ledger, handoff e diff.

## 7. Classificação final

- `PROVA_FINAL_SUCCESS`: todos os gates, entrega e evidência estão conformes.
- `PROVA_FINAL_FAILURE_NO_RETRY`: houve reserva/execução, mas algum gate falhou.
- `PROVA_FINAL_BLOCKED_BEFORE_RESERVATION`: bloqueio anterior à reserva.

Preserve os artefatos e o receipt. Não repare a entrega, não apague state e não
execute a mesma `mission_id` novamente.
