# Handoff — Fase 3B.2A (plano mínimo + topologia)

> **Atualizado:** 2026-07-13
> **Branch:** `feat/fase-3b2a-plano-minimo`
> **Baseline main:** `0f9bfda7` (docs pós-#425) / squash 3B.1.5 `46765ab8`
> **Próxima etapa:** Fase 3B.2B — **não iniciada**

## Estado atual (fonte da verdade)

| Fase   | Status                       | Entrega                                                    |
| ------ | ---------------------------- | ---------------------------------------------------------- |
| 0–2.5  | em main                      | governança, papéis, adaptadores, registry de skills        |
| 3A     | mergeada (#423 → `0f9858a1`) | Cartão/Plano/planner dry-run                               |
| 3B.1   | mergeada (#424 → `9c8b3228`) | executor controlado — **54 testes**                        |
| 3B.1.5 | mergeada (#425 → `46765ab8`) | política Codex + benchmark + auditor (**37 testes**)       |
| 3B.2A  | **esta branch**              | topologia mínima + comandos no plano — **79 testes** orch  |
| 3B.2B  | **não iniciada**             | próximo slice (schema `if/then` / execução restrita — TBD) |

Skills Governance permanece com **32 testes**.

## O que a Fase 3B.2A entrega

1. Extensão de `contrato-plano.schema.json`: `comandos`, `resumo_operacional`, `topologia`, `simplicidade`, `limites` (required)
2. Planner propaga `cartao.executor.comandos` → `plano.comandos` (catálogo only, order-preserving dedupe)
3. Topologia default **single-agent** (`harness=codex-cli`, `max_paralelo=1`, ≤1 writer, depth=1, sem subdelegação)
4. `validate_operational_plan!` fail-closed (multi-agent só com justificativa)
5. Flag `--resumo` (stderr); avisos de simplicidade não bloqueantes
6. README do executor atualizado (propagação feita; `if/then` ainda deferido)

## Contratos que permanecem válidos

- Executor **não** spawna agentes reais nesta fase
- Só status `planejado` executável; `planejado-com-restricoes` ainda não
- Catálogo fixo de 5 comandos
- JSON Schema `if`/`then` **não** nesta fase (`SUPPORTED_SCHEMA_KEYS`)

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

## Próximos passos

1. Fase 3B.2B sob pedido explícito
2. Não misturar stashes WIP Scout (`wip-pre-main-checkout-after-pr424-merge` / `wip-remaining-after-pr424`)

## Não fazer agora

- Merge sem confirmação explícita **MERGE**
- Ponytail / Multi-Agent V2 / probes `codex exec`
- Alterar Scout funcional (`api/`, `components/`, `services/`)
