# Executor Local Controlado — Fase 3B.1

Executa localmente apenas comandos de governança previamente cadastrados.

Fluxo:

```text
Cartão de Missão -> Planner Fase 3A -> Plano validado -> Executor controlado -> Catálogo fixo -> Relatório
```

## Escopo

- Sem LLM, subagente real, rede, shell arbitrário, commit, push, PR, merge, deploy ou banco.
- Execução real exige `--execute` e `AGENT_ORCHESTRATION_EXECUTE=1`.
- Sem a dupla confirmação, o executor opera em dry-run determinístico.

## Catálogo Inicial

IDs permitidos:

- `validate-skills-governance`
- `test-skills-governance`
- `validate-agent-orchestration`
- `test-agent-orchestration`
- `git-diff-check`

O cartão e o plano precisam solicitar exatamente o mesmo conjunto de IDs (normalizado: uniq + sort). A execução usa somente `plan.comandos`. Planos `planejado` / `planejado-com-restricoes` exigem `comandos` não vazio antes de qualquer execução.

## Exit codes

| status         | exit |
| -------------- | ---- |
| dry-run        | 0    |
| success        | 0    |
| failure        | 1    |
| denied         | 2    |
| timeout        | 3    |
| internal-error | 4    |

## Segurança operacional

- Subprocessos via `Open3.popen3` em process group próprio; timeout envia `TERM` → `KILL` e sempre faz `wait`.
- Ambiente sanitizado com `unsetenv_others: true`.
- `safe_path` rejeita symlinks de arquivo/parent fora de repo/tmp.
- Truncamento de stdout/stderr a 1 MB com `scrub` UTF-8.
- Hooks Cursor da PR: apenas `beforeShellExecution` com matcher `git commit` (sem `preToolUse` genérico).
