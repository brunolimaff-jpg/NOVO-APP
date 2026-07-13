# Active Context

Last updated: 2026-07-13 — Fase 3B.1 fechamento operacional (PR #424)

## Estado atual

- **Branch:** `feat/fase-3b-execucao-controlada`
- **PR aberta:** #424 — execução local controlada de missões
- **Base:** `origin/main` @ `0f9858a1` (squash merge da Fase 3A / PR #423)
- **Escopo:** executor local controlado (catálogo fixo, timeout com kill de process group, exit codes, schemas, hooks Cursor commit-only)
- **Fora de escopo:** código funcional do Scout, gates Typecheck/Tests/Dossier/E2E, Fase 3B.2, merge

## Próximos passos

1. Confirmar gates próprios da PR #424 verdes no SHA final.
2. Zerar threads de review com evidência.
3. Só então considerar merge (exige palavra MERGE do Bruno).

## Atenção

- Não alterar `api/`, `components/`, `services/`, `hooks/`, `contexts/`, `prompts/`, `supabase/`, `migrations/`, `package.json`.
- Não expandir o catálogo oficial de comandos.
- Hooks Cursor versionados: somente `beforeShellExecution` + matcher `git commit`.

---

## Histórico (não é estado atual)

### 2026-07-13 — Fase 3A (PR #423) — concluída

- PR #423 mergeada por squash em `0f9858a1`.
- Entregou Cartão de Missão, Plano de Execução, A0–A6, roteamento, skills, adaptadores, planner dry-run.
- Não iniciar Fase 3B era a regra **antes** do merge da 3A; hoje a Fase 3B.1 está em andamento na PR #424.
