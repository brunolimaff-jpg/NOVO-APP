# Handoff — Governança de Agentes (Fases 0–3A)

> **Estado:** Fase 3A em branch `feat/fase-3a-orquestracao-missoes`, pronta para commit/push/PR.
> **Baseline:** `22c36b4d` (origin/main, Fase 2.5 squash merge).
> **Worktree:** `/Users/brunolima/Documents/NOVO-APP/.claude/worktrees/fase-3a-orquestracao`

---

## Roadmap de Governança

| Fase | Escopo | Status | PR |
|------|--------|--------|----|
| 0 | Skills registry + compatibilidade | ✅ Mergeada | #419 |
| 1 | Papéis canônicos (7) | ✅ Mergeada | #420 |
| 2 | Adaptadores + mapa | ✅ Mergeada | #421 |
| 2.5 | Correção pós-review (YAML aliases, papéis extras) | ✅ Mergeada | #422 |
| **3A** | **Orquestração determinística dry-run** | **🔧 Em branch** | — |
| 3B | Execução real com agentes | Planejada | — |

---

## Fase 3A — O que foi feito

### Arquivos criados

| Arquivo | Descrição |
|---------|-----------|
| `.agents/orquestracao/README.md` | Documentação canônica (CLI, papéis, A0–A6) |
| `.agents/orquestracao/cartao-missao.schema.json` | JSON Schema de entrada |
| `.agents/orquestracao/contrato-plano.schema.json` | JSON Schema de saída |
| `.agents/orquestracao/roteamento.yaml` | Roteamento intenção→papel + autorização |
| `.agents/orquestracao/politica-despacho.md` | Política de despacho (12 filtros) |
| `.agents/orquestracao/contrato-evidencias.yaml` | Dimensões de evidência |
| `.agents/orquestracao/exemplos/*.json` | 5 cartões de exemplo |
| `scripts/plan-agent-mission.rb` | Planner determinístico dry-run |
| `scripts/validate-agent-orchestration.rb` | Validador (estrutura + segurança) |
| `scripts/test-agent-orchestration.rb` | 35 testes (8 positivos, 22 negativos, 5 regressão) |

### Arquivos modificados

| Arquivo | Mudança |
|---------|---------|
| `.github/workflows/ci.yml` | +job `Agent Orchestration` |
| `AGENTS.md` | +pointer para `.agents/orquestracao/` |
| `docs/SKILLS-GOVERNANCE.md` | +seção Orquestração de agentes |
| `.agents/papeis/README.md` | +princípio 11 (orquestração obrigatória) |
| `HANDOFF_AI.md` | Rewrite completo |

### Validação local

- `ruby scripts/validate-agent-orchestration.rb` → OK
- `ruby scripts/test-agent-orchestration.rb` → 35/35 PASS
- Planner testado contra 5 exemplos → saídas corretas
- Determinismo verificado (2 runs idênticos)

### Compatibilidade

- Scripts usam apenas Ruby stdlib (json, yaml, digest, optparse, fileutils, open3, tempfile)
- Compatível com Ruby 2.6 (local) e 3.3 (CI)
- Sem YAML aliases nos arquivos canônicos
- Sem gems externas

---

## Próximos passos

1. **Commit + push + PR** — branch pronta
2. **Fase 3B** — execução real com agentes consumindo o plano
3. **CI failures pre-existentes** (5): Typecheck, Tests, Dossier Golden, E2E, Golden Dossier Live — reproduzidas identicamente no baseline, não relacionadas

---

## CI failures pre-existentes (desde main)

- Dossier Golden: MIGRATION_DEADLINE expirado
- Tests: AuthGate.test.tsx migration banner
- Typecheck: 5 erros em testes
- E2E Critical Browser: onboarding.ts login CI
- Golden Dossier Live: mesmo problema do Dossier Golden
