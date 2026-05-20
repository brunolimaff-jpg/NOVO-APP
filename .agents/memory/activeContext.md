# Active Context

Last updated: 2026-05-20

## Current operating context

This repo uses repo-local memory plus canonical handoff docs so sessions can resume on any machine.

Read order:

1. `AGENTS.md`
2. `HANDOFF_AI.md`
3. `.agents/memory/activeContext.md`
4. `.agents/memory/progress.md`
5. `.agents/memory/decisions.md`
6. `docs/ai-context/refactor/02-BOARD.md`
7. `docs/obsidian/00-MASTER.md` for visual navigation only

## Current refactor phase

Fase 2 (manutenibilidade) está em andamento.

- Fase 1 (Sprints 1-8) concluída em `main`.
- Sprint 9 concluída e mergeada via PR `#254`.
- Sprint 10 mergeada via PR `#257` em `2026-05-16`.
- Sprint 11 Onda 0 de testes foi mergeada via PR `#258`.
- Sprint atual: Sprint 12 — hardening final da Fase 2.

## Current task context

Branch/workspace atual: `codex/sprint-12-hardening-oi-004` em `/Users/brunolima/Documents/NOVO-APP`.

Estado pós-PR `#259`:

- Corrigir divergência local/Vercel no runtime Vite adicionando proxies serverless faltantes, especialmente `/api/open-web-search`.
- Remover Mini CRM local do código: `CRMProvider`, `useCRM`, `CRMView`, `CRMDetail`, `CRMPipeline`, props/botões de CRM, tipos locais e testes dedicados.
- Remover Revenue Intelligence local acoplada ao Mini CRM.
- Preservar referências ao **CRM interno Senior** em prompts, evidências, fixtures e dossiês.
- Atualizar docs/memória para impedir reintrodução de `CRMDetail` como hotspot de refatoração.

Onda 1A documental:

- Reconciliar `02-BOARD.md`, `03-OPEN-ITEMS.md`, `06-HANDOFF.md`, `sprints/00-INDEX.md`, `SPRINT-11-EXECUTION.md`, `HANDOFF_AI.md`, memória local e roadmap Obsidian.
- Marcar planos antigos/stale como históricos ou superseded quando ainda tratam Sprint 8/10/CRMDetail como trabalho ativo.
- Preparar a sequência limpa: Onda 1B `LoadingSmart`, Onda 1C `WarRoom`, Sprint 12 hardening.

Onda 1B concluída:

- `utils/loadingSmartViewModel.ts` criado para isolar timeline/progresso de `components/LoadingSmart.tsx`.
- `tests/utils/loadingSmartViewModel.test.ts` criado para cobrir regras que antes ficavam dentro do JSX.
- `components/LoadingSmart.tsx` permanece como fachada/default export; `App.tsx` não mudou.
- PR `#260` mergeada; Bruno validou e liberou seguir para a próxima onda.

Onda 1C concluída:

- `components/WarRoom.tsx` foi reduzido para `283` linhas.
- Blocos visuais foram extraídos para `components/war-room/*`, mantendo props públicas e `services/warRoomService.ts` estável.
- PR `#261` mergeada em `main` com merge commit `9fe0821`.
- Review comments resolvidos e checks remotos verdes, incluindo Smoke Preview.

Lição aprendida:

- No smoke de preview Vercel, não adicionar header opcional sem necessidade. O erro da PR `#261` foi causado por enviar `x-vercel-set-bypass-cookie` junto com `x-vercel-protection-bypass` em requisições `fetch` do GitHub Actions. Para smoke automatizado que manda o bypass em toda requisição, usar somente `x-vercel-protection-bypass`.

## Workspace note

`CODE.md` é instrução local para Codex e está ignorado via `.git/info/exclude`.

Sprint 12 iniciada:

- OI-004 resolvido em `tests/components/SessionsSidebar.test.tsx`: mock de `ConfirmPopover` agora segue contrato render-prop e cobre `onDeleteSession`.
- OI-003 resolvido em `utils/sessionExport.ts`: removido dynamic import de `utils/idbStorage.ts`; export/import agora usam storage v2 como JSON com teste dedicado.
- OI-057 resolvido em `docs/ai-context/refactor/05-VALIDATION.md`: protocolo PWA/chunking documentado.
- OI-062 resolvido em `tests/prompts/megaPrompts.test.ts`: golden baseline determinístico de inputs do LLM antes da migração para `.md`.
- OI-005 resolvido em `codex/sprint-12-oi-005-lint-warnings`: `npm run lint` agora passa com `0` warnings.
- `npm run build` não emite mais o warning específico de dynamic import de `utils/idbStorage.ts`; permanece apenas o warning geral de chunks grandes.

LoadingSmart hotfix:

- Branch atual: `codex/fix-loading-smart-progress-bar`.
- Corrige barra de progresso travada em "Preparando análise..." quando `processing.completedStages` já marca etapas reais como concluídas, mas a fila visual ainda não revelou `displayedCompleted`.
- `utils/loadingSmartViewModel.ts` agora calcula progresso pelo maior valor entre etapas visualmente reveladas e etapas reais concluídas no roadmap.

## Immediate next step

1. Abrir PR curta do hotfix `LoadingSmart`.
2. Acompanhar checks remotos e mergear se ficarem verdes.
3. Depois do merge, fechar Fase 2 ou repriorizar itens deferred.
