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
```

### 8.2 Worktree limpa

```bash
git -C PATH_WORKTREE status --porcelain
test -z "$(git -C PATH_WORKTREE status --porcelain)"
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
test ! -e PATH_STATE_DIR/quarto-piloto-supervisionado-20260717t-final.json
```

`PATH_STATE_DIR` será definido no momento da execução; esta verificação não cria
state.

### 8.6 Única chamada ao runner

```bash
# NAO_EXECUTAR_SEM_AUTORIZACAO_HUMANA_EXPLICITA
AGENT_RUNTIME_EXECUTE=1 \
AGENT_RUNTIME_PILOT=1 \
AGENT_RUNTIME_EVIDENCE_ROOT='${XDG_STATE_HOME:-$HOME/.local/state}/novo-app/agent-evidence' \
ruby scripts/run-agent-mission.rb \
  --card PATH_CARD \
  --plan PATH_PLAN \
  --worktree PATH_WORKTREE \
  --agent-runtime \
  --runtime-ack RUN_SINGLE_AGENT \
  --supervised-pilot \
  --pilot-ack RUN_SUPERVISED_PILOT \
  --evidence-root '${XDG_STATE_HOME:-$HOME/.local/state}/novo-app/agent-evidence' \
  --output PATH_OUTPUT
```

Esta chamada é permitida uma única vez. `PATH_CARD`, `PATH_PLAN`, `PATH_WORKTREE`
e `PATH_OUTPUT` só serão definidos no momento autorizado.

### 8.7 Inspeção do Run Report

```bash
ruby -rjson -e 'r=JSON.parse(File.read(ARGV.fetch(0))); abort unless r["status"] && r["forensic_evidence"]; puts JSON.pretty_generate(r)' PATH_OUTPUT
```

### 8.8 Manifesto e hashes

```bash
ruby -rjson -rdigest -e 'm=JSON.parse(File.read(ARGV.fetch(0))); abort unless m["evidence_status"]=="complete"; m["artifacts"].each{|a| p=File.join(File.dirname(ARGV.fetch(0)),a["name"]); abort unless Digest::SHA256.file(p).hexdigest==a["sha256"]}' PATH_MANIFEST
```

### 8.9 Ledger

```bash
ruby -rjson -e 'r=JSON.parse(File.read(ARGV.fetch(0))); l=r.fetch("task_ledger"); abort unless l.length==1; puts JSON.pretty_generate(l)' PATH_OUTPUT
```

### 8.10 Diff e arquivo entregue

```bash
git -C PATH_WORKTREE status --porcelain
git -C PATH_WORKTREE diff -- .agents/pilotos/sandbox/quarto-piloto-supervisionado-20260717t-final.txt
test -f PATH_WORKTREE/.agents/pilotos/sandbox/quarto-piloto-supervisionado-20260717t-final.txt
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
