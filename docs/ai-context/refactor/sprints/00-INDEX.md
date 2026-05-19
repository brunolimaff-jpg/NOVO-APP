# Sprints Execution Specs — Fase 2

Este diretório contém a especificação **executável** das Sprints 9–12, no nível de PR/onda/arquivo. Para a visão estratégica de fase, ver `../08-PHASE2-MAINTAINABILITY-PLAN.md`. Para a especificação completa com auditoria e correções, ver `../PLANO_COMPLETO_SPRINTS.md`.

## Catálogo

| Sprint | Branch | Duração | PRs estimadas | Spec | Status |
|---|---|---|---|---|---|
| 9 | `refactor/sprint-9` | 2 sem | 4 | [`SPRINT-9-EXECUTION.md`](./SPRINT-9-EXECUTION.md) | done |
| 10 | `codex/sprint-10-radar-boundary` | 2 sem | 1 | [`SPRINT-10-EXECUTION.md`](./SPRINT-10-EXECUTION.md) | done |
| 11 | `codex/sprint-11-*` | 3 sem | 4 | [`SPRINT-11-EXECUTION.md`](./SPRINT-11-EXECUTION.md) | active |
| 12 | `refactor/sprint-12` | 2 sem | — | (a destrinchar após Sprint 11) | planned |

> Status vivo é mantido em `../02-BOARD.md`. Esta tabela reflete apenas o desenho de saída — quando uma sprint começa, o board manda.

## Convenções comuns

### Tags de rollback
Antes da primeira PR de cada sprint, criar a tag `pre-sprint-N` apontando para o commit de `main` mais recente:

```bash
git checkout main && git pull origin main
git tag pre-sprint-9 && git push origin pre-sprint-9
```

Em caso de gate vermelho > 24h sem resolução, reverter para a tag.

### Branches
- Cada sprint usa branch `refactor/sprint-N` ou `codex/sprint-N-*` derivada de `main`.
- PRs internos da sprint usam sufixos: `codex/sprint-11-onda-1a-docs-cleanup`, `codex/sprint-11-onda-1b-loading-smart`, etc.
- Merges de PRs internos vão para `refactor/sprint-N`. Só a PR final da sprint vai para `main`.

### Política de freeze de arquivos por sprint
Arquivos sob refatoração têm freeze para PRs paralelas:

| Sprint | Arquivos congelados |
|---|---|
| 9 | `App.tsx`, `index.tsx`, `.env.example`, `features/chat/message-helpers.ts` |
| 10 | `hooks/useRadar.ts`, `services/radarService.ts`, `components/Radar*.tsx` |
| 11 | `config/localDevApiProxy.ts`, `components/LoadingSmart.tsx`, `components/WarRoom.tsx`, canônicos de plano/refactor |

PRs paralelos que tocam esses arquivos devem rebasear da branch da sprint antes de mergear, ou aguardar fim da sprint.

### Gates técnicos por PR (não negociáveis)

```bash
npm test         # zero falhas
npm run typecheck
npm run build
npm run lint     # zero erros (warnings em redução)
```

### Governance de handoff

Ao fechar cada sprint:
- Atualizar `../03-OPEN-ITEMS.md` (mover OIs resolvidos para "histórico").
- Atualizar `../07-SPRINT-LOG.md` com entrada da sprint.
- Atualizar `../../HANDOFF_AI.md` com novos números de hotspots.
- Atualizar `../02-BOARD.md` com status `done`.
