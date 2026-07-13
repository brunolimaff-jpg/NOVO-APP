# Handoff — Fase 3B.1 mergeada (PR #424)

> **Atualizado:** 2026-07-13  
> **PR #424:** MERGED (squash)  
> **Squash em main:** `9c8b3228cc601965ff687ec82c6d0eadc547a73d`  
> **Head pré-merge:** `ebdf1f5ff8966e18a1eda4ce679b80b5b37b14f5`  
> **Base da PR:** `0f9858a1` (squash Fase 3A / PR #423)  
> **Ruby baseline:** 3.3.7  
> **Próxima etapa:** Fase 3B.2 (propagação planner→plano + schema condicional)

## Estado atual (fonte da verdade)

A camada de governança/orquestração de agentes está em `main` até a **Fase 3B.1**:

| Fase  | Status                           | Entrega                                                                           |
| ----- | -------------------------------- | --------------------------------------------------------------------------------- |
| 0–2.5 | em main                          | governança, papéis, adaptadores, registry de skills                               |
| 3A    | mergeada (#423 → `0f9858a1`)     | Cartão de Missão, Plano, A0–A6, planner dry-run                                   |
| 3B.1  | **mergeada (#424 → `9c8b3228`)** | executor local controlado + relatório + CI                                        |
| 3B.2  | **não iniciada**                 | propagação automática `executor.comandos` → `plano.comandos`; `if/then` no schema |

## O que a Fase 3B.1 entrega

Fluxo:

```text
Cartão de Missão → Planner 3A → Plano `planejado` → Executor controlado
  → catálogo fixo → Relatório (schema)
```

### Artefatos principais

- `scripts/run-agent-mission.rb` — executor
- `scripts/validate-agent-execution.rb` / `scripts/test-agent-execution.rb` — gates (54 testes)
- `.agents/orquestracao/executor/` — catálogo, contrato de relatório, README
- Job CI `Agent Execution Control` (Ruby 3.3.7, actions pinadas, `persist-credentials: false`)
- Hooks Cursor: `.cursor/hooks.json` + `.cursor/hooks/branch-health-json.sh`

### Contrato fail-closed de status

| status do plano            | executável na 3B.1?              |
| -------------------------- | -------------------------------- |
| `planejado`                | sim (exige `comandos` não vazio) |
| `planejado-com-restricoes` | não → `PLAN_STATUS_INVALID`      |
| `negado` / `incompleto`    | não                              |

### Segurança operacional do executor

- Dry-run por padrão; real só com `--execute` **e** `AGENT_ORCHESTRATION_EXECUTE=1`
- Sem shell arbitrário / rede / install / git mutante / banco
- `Open3.popen3` + process group: `TERM` → `KILL` + `wait` (timeout 120s)
- Exit codes: dry-run/success=0, failure=1, denied=2, timeout=3, internal-error=4
- Ambiente sanitizado (`unsetenv_others: true`)
- `safe_path` anti-symlink; truncamento 1 MB com UTF-8 `scrub`
- Cartão e plano: mesmo conjunto de IDs (uniq+sort); mismatch → `COMMAND_PLAN_MISMATCH`
- Plano `planejado` sem comandos → `PLANEJADO_REQUIRES_COMMANDS`

### Catálogo permitido (não expandir sem decisão)

- `validate-skills-governance`
- `test-skills-governance`
- `validate-agent-orchestration`
- `test-agent-orchestration`
- `git-diff-check`

### Hooks Cursor (higiene, não fronteira de segurança)

- Só `beforeShellExecution` com matcher `git commit`
- `failClosed: false` intencional (não trava o ambiente se o hook falhar)
- `check-branch-health.sh` roda com `cd` explícito na raiz do repo
- Autorizações do executor **não** dependem desse hook

## Limitações conhecidas (ficar para 3B.2)

1. Planner 3A **não** propaga `executor.comandos` → `plano.comandos` (manual na 3B.1).
2. Exigência condicional de `comandos` no JSON Schema (`if/then`) deferida — runtime cobre com `PLANEJADO_REQUIRES_COMMANDS`.
3. `planejado-com-restricoes` não é interpretado semanticamente.

## Validação canônica (gates próprios)

```bash
ruby scripts/validate-skills-governance.rb
ruby scripts/test-validate-skills-governance.rb   # 32
ruby scripts/validate-agent-orchestration.rb
ruby scripts/test-agent-orchestration.rb          # 57
ruby scripts/validate-agent-execution.rb
ruby scripts/test-agent-execution.rb              # 54
git diff --check
```

Gates Scout globais (Typecheck/Tests/Dossier/E2E) ficaram vermelhos na PR e **foram tratados como fora de escopo** desta entrega de governança.

## Próximos passos

1. Fase 3B.2: planner emite `comandos`; schema condicional; (opcional) interpretar restrições.
2. Não expandir catálogo sem decisão explícita.
3. WIP local stashed na worktree `fase-3b-execucao-controlada` (não faz parte do merge).

## Não fazer agora

- Reabrir escopo Scout funcional nesta trilha
- Expandir catálogo com shell/rede
- Tratar hook Cursor como controle de segurança do executor
- Merge/deploy automático sem pedido explícito
