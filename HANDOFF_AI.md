# Handoff — Fase 3B.1.5 mergeada (PR #425)

> **Atualizado:** 2026-07-13  
> **PR #425:** MERGED (squash)  
> **Squash em main:** `46765ab88d3c78460dd94dc1259561724ba0cedf`  
> **Head pré-merge:** `4561055c7290580e52b602b0ddb403090bd6e73e`  
> **Baseline anterior:** `f889f57a` (docs pós-#424) / `9c8b3228` (#424)  
> **Próxima etapa:** Fase 3B.2 (propagação planner→plano + schema condicional) — **não iniciada**

## Estado atual (fonte da verdade)

| Fase   | Status                           | Entrega                                                          |
| ------ | -------------------------------- | ---------------------------------------------------------------- |
| 0–2.5  | em main                          | governança, papéis, adaptadores, registry de skills              |
| 3A     | mergeada (#423 → `0f9858a1`)     | Cartão/Plano/planner dry-run — **57 testes**                     |
| 3B.1   | mergeada (#424 → `9c8b3228`)     | executor controlado — **54 testes**                              |
| 3B.1.5 | **mergeada (#425 → `46765ab8`)** | política Codex + benchmark + auditor fail-closed (**37 testes**) |
| 3B.2   | **não iniciada**                 | propagação planner→comandos + schema `if/then`                   |

Skills Governance permanece com **32 testes**.

## O que a Fase 3B.1.5 entrega

1. `AGENTS.md` limpo (sem `<claude-mem-context>`) + política de orçamento de subagentes + bullets mínimos Scout
2. `.codex/config.toml` conservador: `max_threads = 3`, `max_depth = 1` (sem flags experimentais)
3. Documentação: **Multi-Agent V2 não é tratado como roteador confiável até prova de runtime**
4. Protocolo: `docs/benchmarks/codex-harness-5.6.md` (Probe A = `BLOCKED_BY_HARNESS`; Probe B = `NOT_EXECUTED`)
5. Auditor: `scripts/validate-codex-harness-policy.rb` + **37 testes**
6. Integração no job CI **Agent Orchestration**

### Hardening fail-closed do parser TOML mínimo

- Chaves / segmentos de tabela quoted rejeitados
- Valores compostos (inline tables / arrays) rejeitados
- Dotted assignment keys rejeitadas
- Cabeçalhos normalizados (strip de segmentos; vazios rejeitados)
- Valores quoted contendo `{`/`[` continuam permitidos
- Escopo canônico do projeto não depende de strings com aspas escapadas

## Contratos que permanecem válidos (3B.1)

- Dry-run por padrão; real só com `--execute` + `AGENT_ORCHESTRATION_EXECUTE=1`
- Só status `planejado` executável
- Catálogo fixo de 5 comandos
- Cartão de Missão + executor = fronteira de autorização
- Detalhe operacional: `.agents/orquestracao/executor/README.md`
- `.codex/agents/*.toml` = adaptadores declarativos

## Limitações do Multi-Agent V2

- Runtime tool-backed pode ignorar agente customizado, modelo, reasoning e sandbox do filho
- Preferir `codex exec`/CLI nativo; Desktop experimental
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

Gates Scout globais (Typecheck/Tests/Dossier/E2E) fora de escopo desta trilha.

## Próximos passos

1. Fase 3B.2 sob pedido explícito
2. Não expandir catálogo / gramática TOML do auditor sem decisão
3. Não misturar stashes WIP Scout (`wip-pre-main-checkout-after-pr424-merge` / `wip-remaining-after-pr424`)

## Não fazer agora

- Iniciar Fase 3B.2 sem pedido
- Ativar Multi-Agent V2 / Ultra / Fast
- Alterar `~/.codex/config.toml`
- Tratar Desktop como baseline de benchmark
