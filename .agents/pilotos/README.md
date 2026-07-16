# Pilotos supervisionados

Registro e preparação de pilotos supervisionados do runtime Codex single-agent (Fase 3B.3C+).

> Nesta documentação o comando real aparece marcado.
> **NÃO EXECUTAR SEM AUTORIZAÇÃO HUMANA EXPLÍCITA.**

## 1. Pré-requisitos

- PR da Fase 3B.3C mergeada em `main`
- `main` atualizada localmente
- Worktree **nova e limpa** (não usar a worktree principal; branch ≠ `main`)
- Codex CLI na versão pinada (`.agents/seguranca/CODEX-RUNTIME.md`)
- DCG disponível, checksum/hook verificáveis (preflight live `ready`)
- Sem variáveis de bypass (`DCG_BYPASS`, `DCG_DISABLE`, …)
- Template: `.agents/pilotos/primeiro-piloto.json`
- Autorização **A3+** no Cartão
- Seis chaves ativas (abaixo)

Caso DCG não esteja pronto: `BLOCKED_DCG_NOT_READY`  
Caso Codex fora da versão pinada: `BLOCKED_CODEX_VERSION_MISMATCH`

## 2. Dry-run legado (sem spawn)

```bash
ruby scripts/run-agent-mission.rb \
  --card PATH_CARTAO \
  --plan PATH_PLANO \
  --stdout
```

Não cria estado em `.agents/pilotos/state/`.

## 3. Preflight live (evidência, não autorização)

```bash
ruby scripts/runtime-safety-preflight.rb --mode live --worktree PATH_WORKTREE --stdout
```

O relatório externo **não** autoriza o spawn.

## 4. Comando do piloto real

**NÃO EXECUTAR SEM AUTORIZAÇÃO HUMANA EXPLÍCITA**

Exige simultaneamente:

1. `--agent-runtime`
2. `--runtime-ack RUN_SINGLE_AGENT`
3. `AGENT_RUNTIME_EXECUTE=1`
4. `--supervised-pilot`
5. `--pilot-ack RUN_SUPERVISED_PILOT`
6. `AGENT_RUNTIME_PILOT=1`

```bash
# NÃO EXECUTAR SEM AUTORIZAÇÃO HUMANA EXPLÍCITA
AGENT_RUNTIME_EXECUTE=1 AGENT_RUNTIME_PILOT=1 \
ruby scripts/run-agent-mission.rb \
  --card PATH_CARTAO \
  --plan PATH_PLANO \
  --worktree PATH_WORKTREE_DESCARTAVEL \
  --agent-runtime \
  --runtime-ack RUN_SINGLE_AGENT \
  --supervised-pilot \
  --pilot-ack RUN_SUPERVISED_PILOT \
  --output PATH_RUN_REPORT.json
```

Escopo permitido: exatamente um arquivo sandbox não funcional autorizado pelo
template versionado da missão.

## 5. Revisar o relatório

Conferir no Run Report:

- `planned_snapshot` / `observed_snapshot` + hashes
- `comparacao.status` ∈ `conforme|desvio|violacao|indisponivel`
- `task_ledger` com exatamente 1 tarefa
- `handoff.requer_aprovacao_humana == true`
- `comandos[].executado == false` + aviso `CODEX_SUBSTITUI_EXECUCAO_DOS_COMANDOS`

## 6. Revisar o diff

```bash
git -C PATH_WORKTREE status --porcelain
git -C PATH_WORKTREE diff -- PATH_REL
```

Somente o arquivo sandbox deve aparecer.

## 7. Descartar a worktree

```bash
git worktree remove PATH_WORKTREE --force
```

Não fazer commit/push/PR/merge automáticos.

## 8. Em caso de violação

1. Parar
2. Preservar a worktree para inspeção (sem `reset`/`clean` automático)
3. Seguir `handoff.proxima_acao_recomendada` (geralmente `investigar_violacao`)
4. Não reexecutar o mesmo `missao_id` (estado em `.agents/pilotos/state/`)

## Estado local

`.agents/pilotos/state/` é **gitignored**. Guarda só `missao_id`, timestamp e hash do relatório (criação atômica). Não é scheduler.

`.agents/pilotos/templates/` é **versionado**. Cada missão autorizada possui um
template JSON próprio (`<missao_id>.json`). State ausente não é autorização —
missão sem template é negada mesmo sem state.

**O state registra que uma tentativa foi consumida, não que foi bem-sucedida.**  
Uma execução pode registrar `DELIVERY_FAILED` no ledger mesmo com Codex exit 0 —
o arquivo sandbox obrigatório é verificado pelo comparador como
`OBSERVED_EXPECTED_FILE_UNCHANGED` e o status final vira `failure`.

Novas execuções com o mesmo `missao_id` continuam bloqueadas (state one-shot).

## Diagnóstico JSONL

O Run Report inclui `runtime.diagnostico_jsonl` — análise agregada e sanitizada
da saída JSONL do Codex (`codex exec --json`).

**Regras:**
- diagnóstico é **audit-only** — não concede autorização não altera status;
- saída bruta **não é persistida** (apenas SHA-256);
- conteúdo de mensagens, comandos, ferramentas e arquivos é descartado;
- tipos desconhecidos são contados mas nunca classificados;
- truncamento gera diagnóstico `partial` (código `CODEX_JSONL_TRUNCATED`);
- diagnóstico não autoriza retry nem novo piloto;
- segundo piloto depende de aprovação humana separada.

O diagnóstico agregado não equivale ao JSONL bruto. Sem persistência forense
sanitizada, mensagens completas, comandos internos, `cwd` e exit codes
individuais não é possível atribuir causalmente uma falha de entrega.

## Resultado do terceiro piloto supervisionado

| Campo | Resultado |
|---|---|
| `mission_id` | `terceiro-piloto-supervisionado-20260715t200207z` |
| Baseline | `e1c803f0f2bc3413b537864e5cd9f419c7604235` |
| Tentativa consumida | 1 |
| Runtime iniciado | sim |
| Codex exit code | 0 |
| Entrega | falhou |
| Código | `DELIVERY_FILE_MISSING` |
| Worktree alterada | não |
| Retry permitido | não |
| Causa raiz | `INSUFFICIENT_EVIDENCE` |
| Próxima ação | endurecer observabilidade antes de um novo piloto |

Regras derivadas do encerramento:

- o relatório de encerramento não deve ser escrito no caminho do arquivo de entrega ausente;
- `exit_code=0` do Codex não equivale a missão concluída;
- ausência da entrega obrigatória mantém o status `failure`;
- recomendações automáticas de “corrigir manualmente” não substituem o contrato da missão.

O terceiro piloto foi concluído como execução operacional, mas falhou como
missão funcional. `exit_code=0` significa apenas que o processo Codex terminou;
não significa que a entrega foi concluída.

### Baseline e próximo piloto

A baseline `e1c803f0f2bc3413b537864e5cd9f419c7604235` é metadado documental
externo do recibo do piloto. `baseline` não faz parte do schema do Card nem do
schema do Plan e não deve ser inserido nesses artefatos. Preparadores futuros
devem emitir recibo separado para a baseline autorizada e seus hashes.

O terceiro piloto terminou com `THIRD_PILOT_FAILED_NO_RETRY`; sua
`mission_id` não pode ser repetida. Um quarto piloto exige nova `mission_id` e
permanece `NO-GO` até que a observabilidade forense sanitizada seja
implementada e testada.

## 0. Pilot Readiness (antes de qualquer piloto)

```bash
ruby scripts/check-pilot-readiness.rb --stdout
```

Exige: Codex 0.144.0, DCG v0.6.6 com checksum do **binário** (não do tar.xz),
probe blocked, hook PreToolUse Bash com entrada DCG direta (guardian pode coexistir),
atestação humana (`ruby scripts/attest-dcg-hook.rb --ack TRUST_DCG_HOOK ...`).

Ordem completa: ver `.agents/seguranca/INSTALACAO-DCG-MACOS.md`.
