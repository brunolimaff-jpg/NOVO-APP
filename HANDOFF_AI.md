# Handoff — Fase 3B.1.5 (hardening harness Codex)

> **Atualizado:** 2026-07-13
> **Baseline main:** `f889f57a` (docs pós-#424) sobre squash `9c8b3228` (#424)
> **Fase ativa:** 3B.1.5 — Hardening do Harness Codex e Benchmark Controlado
> **Próxima fase (não iniciar nesta PR):** 3B.2

## Estado atual (fonte da verdade)

| Fase   | Status                       | Entrega                                             |
| ------ | ---------------------------- | --------------------------------------------------- |
| 0–2.5  | em main                      | governança, papéis, adaptadores, registry de skills |
| 3A     | mergeada (#423 → `0f9858a1`) | Cartão/Plano/planner dry-run — **57 testes**        |
| 3B.1   | mergeada (#424 → `9c8b3228`) | executor controlado — **54 testes**                 |
| 3B.1.5 | **em andamento (esta PR)**   | política Codex conservadora + benchmark + auditor   |
| 3B.2   | **não iniciada**             | propagação planner→comandos + schema `if/then`      |

Skills Governance permanece com **32 testes**.

## O que a Fase 3B.1.5 entrega

1. `AGENTS.md` limpo (sem `<claude-mem-context>`) + política de orçamento de subagentes
2. `.codex/config.toml` conservador: `max_threads = 3`, `max_depth = 1` (sem flags experimentais)
3. Documentação explícita: **Multi-Agent V2 não é tratado como roteador confiável até prova de runtime**
4. Protocolo de benchmark em `docs/benchmarks/codex-harness-5.6.md`
5. Auditor: `scripts/validate-codex-harness-policy.rb` + testes
6. Integração no job CI **Agent Orchestration** (sem job novo)

## Contratos que permanecem válidos (3B.1)

- Dry-run por padrão; real só com `--execute` + `AGENT_ORCHESTRATION_EXECUTE=1`
- Só status `planejado` executável
- Catálogo fixo de 5 comandos
- Cartão de Missão + executor = fronteira de autorização
- `.codex/agents/*.toml` = adaptadores declarativos (não substituem o executor)

## Limitações do Multi-Agent V2

- Runtime tool-backed pode ignorar agente customizado, modelo, reasoning e sandbox do filho
- Preferir validação via `codex exec`/CLI nativo; Desktop permanece experimental
- Não ativar V2 globalmente; não fixar janela de contexto; não usar Ultra/Fast
- Esta limitação **não** invalida as Fases 0–3B.1

## Validação canônica (gates próprios)

```bash
ruby scripts/validate-codex-harness-policy.rb
ruby scripts/test-codex-harness-policy.rb
ruby scripts/validate-skills-governance.rb
ruby scripts/test-validate-skills-governance.rb
ruby scripts/validate-agent-orchestration.rb
ruby scripts/test-agent-orchestration.rb
ruby scripts/validate-agent-execution.rb
ruby scripts/test-agent-execution.rb
git diff --check
npm run build
```

Gates Scout globais (Typecheck/Tests/Dossier/E2E) fora de escopo.

## Próximos passos

1. Concluir PR da 3B.1.5 (sem merge automático nesta missão)
2. Só depois, sob pedido explícito: Fase 3B.2

## Não fazer agora

- Iniciar Fase 3B.2
- Expandir catálogo do executor
- Ativar Multi-Agent V2 / Ultra / Fast
- Alterar `~/.codex/config.toml`
- Misturar WIP Scout / stashes antigos
