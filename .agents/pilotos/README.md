# Pilotos supervisionados

Preparação do **primeiro piloto real** do runtime Codex single-agent (Fase 3B.3C).

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

Escopo permitido: exatamente
`.agents/pilotos/sandbox/resultado-primeiro-piloto.md`

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

**O state registra que uma tentativa foi consumida, não que foi bem-sucedida.**  
Uma execução pode registrar `DELIVERY_FAILED` no ledger mesmo com Codex exit 0 —
o arquivo sandbox obrigatório é verificado pelo comparador como
`OBSERVED_EXPECTED_FILE_UNCHANGED` e o status final vira `failure`.

Novas execuções com o mesmo `missao_id` continuam bloqueadas (state one-shot).

## 0. Pilot Readiness (antes de qualquer piloto)

```bash
ruby scripts/check-pilot-readiness.rb --stdout
```

Exige: Codex 0.144.0, DCG v0.6.6 com checksum do **binário** (não do tar.xz),
probe blocked, hook PreToolUse Bash com entrada DCG direta (guardian pode coexistir),
atestação humana (`ruby scripts/attest-dcg-hook.rb --ack TRUST_DCG_HOOK ...`).

Ordem completa: ver `.agents/seguranca/INSTALACAO-DCG-MACOS.md`.
