# Onda 0+1 — Cleanup Base + Primeira Correção Técnica

## Summary

Entrega curta entre Sprint 9 e Sprint 10 para alinhar a fonte de verdade pós-PR
`#254` e aplicar duas correções pequenas antes de retomar o roadmap canônico.

- Base: `origin/main@922a403`
- Branch: `refactor/wave-0-1-cleanup`
- PR anterior: Sprint 9 `#254`, head `19485dc`, merge `922a403`
- Próximo trabalho após merge: Sprint 10, Radar boundary completion

## Inventário e decisão

| Item | Estado | Decisão |
|---|---|---|
| Docs/memória ainda tratavam PR `#254` como aberta | Stale | Atualizar canônicos nesta onda |
| `refactor/code-quality` com mudanças locais | Escopo paralelo | Não misturar; usar como insumo/backlog |
| `phase2-code-quality.md` externo | Plano útil, números stale | Reescopar em PRs menores |
| Auditoria `09-CODEBASE-EXPLORATION` | Snapshot útil, não canônico bruto | Curar achados reais no backlog |
| PORTA parcial sem score | Bug funcional provável | Corrigir agora |
| Logs cliente com payload sensível | Risco real em serviços cliente | Migrar agora com truncamento |
| Radar runtime fora do boundary | Dívida arquitetural real | Sprint 10 |
| `CRMDetail`, `LoadingSmart`, `WarRoom` grandes | Dívida real | Sprint 11 com testes primeiro |
| PWA/chunking/lint warnings | Hardening | Sprint 12 |
| Performance/bundle hypotheses | Sem medição suficiente | Só com profiling/bundle analyze |

## Escopo implementável

### Onda 0 — Base

- Atualizar `HANDOFF_AI.md`, `.agents/memory/*`, `02-BOARD.md`, `06-HANDOFF.md` e `07-SPRINT-LOG.md`.
- Registrar Sprint 9 como `done/merged`.
- Registrar a Onda 0+1 como ponte ativa, não como nova sprint longa.
- Criar este arquivo como plano detalhado de continuação.
- Registrar `claude-mem` em `~/.claude/projects/-Users-brunolima-Documents-NOVO-APP/memory/wave-0-1-cleanup.md`.

### Onda 1 — Técnica pequena

- Corrigir `portaIntegrityHold` para usar a regra de integridade já expressa por `shouldHoldWaterfallScoreForIntegrity`.
- Garantir que falha parcial de PORTA não silencie a ausência de `scorePorta`.
- Migrar logs de cliente em `clientLookupService`, `extractContentService`, `feedbackService` e `App.tsx` para `scoutDiag`.
- Truncar/sanitizar detalhes de URL, query, cache key, feedback e resposta.

## Fora de escopo

- Mover Radar para `features/radar/*`.
- Refatorar `CRMDetail`, `LoadingSmart` ou `WarRoom`.
- Fazer sweep global de `console.*`, `any` ou `catch {}`.
- Resolver PWA/chunking.
- Deletar branches antigas.
- Otimizar performance sem medição.

## Test Plan

Focados:

```bash
npm exec vitest run tests/features/dossier/porta-reconciliation.test.ts tests/features/dossier/waterfall-orchestrator.test.ts
npm exec vitest run tests/services/clientLookupService.test.ts tests/extraction.test.ts
```

Status: green em 2026-05-16.

Gates:

```bash
npm run typecheck
npm run test
npm run build
npm run lint
npm run analyze:circular
```

Status: green em 2026-05-16. `npm run lint` permanece com warnings conhecidos (`150`) e `0` erros.

## Continuação

Quando esta Onda 0+1 estiver mergeada:

1. Sincronizar `main`.
2. Criar branch limpa para Sprint 10.
3. Mover runtime do Radar para `features/radar/*`.
4. Manter reexports temporários para compatibilidade.
5. Só depois iniciar Sprint 11 com testes de caracterização para componentes grandes.
