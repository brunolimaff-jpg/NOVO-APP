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

O cartão/plano só pode solicitar IDs existentes no catálogo. O catálogo não aceita shell, rede, instalação, Git mutante, GitHub CLI, Vercel ou Supabase.
