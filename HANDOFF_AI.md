# Handoff — BUG-8 PR #409

> **Estado:** fix local implementado no worktree da PR #409. Não fazer merge sem `MERGE` explícito do Bruno.
> **Worktree:** `/Users/brunolima/Documents/NOVO-APP/.claude/worktrees/sweet-bhabha-d544e3`
> **Branch:** `feat/pipeline-v2-pr409-prompts-v2-output-mode`
> **SHA base investigado:** `44ad4056`

## Resumo

- Causa P0 confirmada: `preferStaticForLargeDossier=false` desligava só o fallback proativo; o caminho reativo de `BlankPanel` ainda chamava `setForceStaticTimelineFallback(true)` e podia renderizar `messages-static-fallback` para dossiês ~42k.
- DOM do histórico inflava porque `SessionsSidebar` renderizava o texto completo do último bot em elemento com `line-clamp-1`; o CSS cortava visualmente, mas `document.body.textContent` ainda continha o dossiê inteiro.
- Fix aplicado: dossiês abaixo de `60_000` chars fazem remount controlado da timeline virtualizada via `timelineRecoveryNonce`; static fallback fica como último recurso para `>=60_000`.
- Preview do histórico agora é snippet limpo/capado em 160 chars.

## Arquivos principais

- `utils/postWaterfallHandoff.ts` — helper `decideTimelineRecoveryMode(...)`.
- `hooks/useStaticTimelineFallback.ts` — recovery leve com limite de 2 tentativas e telemetria `BlankPanel/virtualized-timeline-recovery`.
- `components/chat/MessageTimeline.tsx` — prop interna `timelineRecoveryNonce` e remount seguro do viewport.
- `components/ChatInterface.tsx` — passa `timelineRecoveryNonce`.
- `components/SessionsSidebar.tsx` — `getSessionMessagePreview(...)` capado.
- Docs vivas atualizadas: `docs/ai-context/refactor/loading-panel-contract.md`, `docs/wiki/pages/06-sessoes-e-mensagens.md`, `10-loading-e-estados-visuais.md`, `16-depurar-painel-branco.md`, `23-contratos-de-ui.md`.

## Validação local

- `npm exec vitest run tests/hooks/useStaticTimelineFallback.test.ts tests/components/ChatInterface.test.tsx tests/components/SessionsSidebar.test.tsx tests/components/chat/MessageTimeline.test.tsx tests/utils/postWaterfallHandoff.test.ts tests/utils/blankPanelTelemetry.test.ts` — 96/96 passando.
- `npm run build` — passou; Sentry CLI logou falha de DNS/rede para `sentry.io`, mas Vite terminou com exit 0.
- `npm run typecheck` — ainda falha por débitos pré-existentes fora deste patch:
  - `components/ModuleErrorCards.tsx` importando `DossierModuleError` inexistente.
  - `features/chat/loading-progress-reducer.ts` importando `utils/cofreLifecycle` inexistente.
  - `features/dossier/waterfall-socio-search.ts` importando constantes inexistentes.
  - Erros antigos em `services/llm/query-planner.ts` e testes `api/llm-client`, `timeout-edge-cases`, `dossierGolden`, `socio-search-cache-key`.

## Próximo gate obrigatório

1. Commit/push do fix na branch da PR #409.
2. Confirmar preview Vercel no novo SHA.
3. Rodar Scheffer do ZERO no preview, não pelo histórico.
4. Critérios: sem diálogo Chrome "Página sem resposta"; `domBodyLen/bodyLen <100k`; presentes `dossier_completed`, `post-render-fired`, `PostCompletion:10000ms`; ausentes `static-fallback-rendered`, `BlankPanel/static-timeline-fallback-activated`, `chunked-parse:escape-hatch`; F5 recupera; dossiê clicável/scrollável/expansível.
