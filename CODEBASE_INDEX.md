# Codebase Index
> 2026-04-23 snapshot after Sprint 8 targeted documentation refresh
>
> How to use: leia este indice primeiro, depois abra apenas os arquivos necessarios.

## Root

- `App.tsx`
- `index.tsx`
- `types.ts`
- `constants.ts`
- `ARQUITETURA.md`
- `HANDOFF_AI.md`

## Components

### Public chat surface

- `components/ChatInterface.tsx`
- `components/WarRoom.tsx`
- `components/RadarPanel.tsx`
- `components/RadarSettings.tsx`
- `components/RadarBell.tsx`

### Modular chat shell

- `components/chat/ChatShell.tsx`
- `components/chat/MessageTimeline.tsx`
- `components/chat/Composer.tsx`
- `components/chat/ChatPanels.tsx`
- `components/chat/contracts.ts`

### Dossier and CRM

- `components/InvestigationDashboard.tsx`
- `components/ScorePorta.tsx`
- `components/CRMDetail.tsx`
- `components/CRMPipeline.tsx`

## Features

### Chat

- `features/chat/loading-progress.ts`
- `features/chat/session-controller.ts`
- `features/chat/feedback-actions.ts`
- `features/chat/message-orchestrator.ts`
- `features/chat/message-helpers.ts`
- `features/chat/ChatErrorBoundary.tsx`

### Dossier

- `features/dossier/waterfall-orchestrator.ts`
- `features/dossier/benchmark-stage.ts`
- `features/dossier/porta-reconciliation.ts`
- `features/dossier/DossierErrorBoundary.tsx`

### Radar

- `features/radar/README.md`
- `features/radar/types.ts`
- `features/radar/index.ts`

## Hooks

- `hooks/useAppInitialization.ts`
- `hooks/useSessionManager.ts`
- `hooks/useSessionStorage.ts`
- `hooks/useRadar.ts`
- `hooks/useOffline.ts`
- `hooks/useTheme.ts`
- `hooks/useToast.ts`
- `hooks/useUpdateNotification.ts`

Removed:

- `hooks/useChat.ts` foi removido; o guardrail fica em `tests/architecture/useChatImportGuard.test.ts`

## Stores and Contexts

- `stores/chatStore.tsx`
- `stores/dossierStore.tsx`
- `contexts/OperatorContext.tsx`
- `contexts/CRMContext.tsx`
- `contexts/ModeContext.tsx`

## Services

### Public facades

- `services/geminiService.ts`
- `services/warRoomService.ts`

### Internal Gemini modules

- `services/gemini/contracts.ts`
- `services/gemini/config.ts`
- `services/gemini/investigation-orchestration.ts`
- `services/gemini/porta.ts`
- `services/gemini/runtime.ts`
- `services/gemini/recovery.ts`
- `services/gemini/sources.ts`
- `services/gemini/sanitization.ts`
- `services/gemini/status.ts`
- `services/gemini/auxiliary.ts`

### Internal War Room modules

- `services/war-room/contracts.ts`
- `services/war-room/config.ts`
- `services/war-room/history.ts`
- `services/war-room/intent.ts`
- `services/war-room/retrieval.ts`
- `services/war-room/prompting.ts`
- `services/war-room/sources.ts`
- `services/war-room/query.ts`

### Other domain services

- `services/ragService.ts`
- `services/radarService.ts`
- `services/apiConfig.ts`
- `services/sessionRemoteStore.ts`
- `services/feedbackRemoteStore.ts`
- `services/clientLookupService.ts`
- `services/competitorService.ts`
- `services/revenueService.ts`

## Prompts and constants

- `prompts/megaPrompts.ts` - facade publica para `prompts/mega/*`
- `prompts/mega/contracts.ts`
- `prompts/mega/foundation.ts`
- `prompts/mega/specialist-prompts.ts`
- `prompts/mega/builders.ts`
- `prompts/systemPrompts.ts`
- `constants/market-intelligence.ts`
- `constants/loadingStages.ts`

## Serverless API

- `api/gemini.ts`
- `api/rag.ts`
- `api/docs-rag.ts`
- `api/link-status.ts`
- `api/open-web-search.ts`
- `api/radar-scan.ts`
- `api/extract-content.ts`

## Tests

### Architecture and facades

- `tests/architecture/useChatImportGuard.test.ts`
- `tests/prompts/megaPrompts.test.ts`
- `tests/utils/constants.test.ts`

### War Room and Radar

- `tests/services/warRoomService.test.ts`
- `tests/services/warRoomCanary.test.ts`
- `tests/components/warRoomTargetExtract.test.ts`
- `tests/components/chat/ChatPanels.test.tsx`
- `tests/hooks/useRadar.test.ts`
- `tests/services/radarService.test.ts`

### Dossier and chat flow

- `tests/features/dossier/porta-reconciliation.test.ts`
- `tests/features/dossier/benchmark-stage.test.ts`
- `tests/features/chat/message-orchestrator.test.ts`
- `tests/components/ChatInterface.test.tsx`

## Canonical docs

- `AGENTS.md`
- `HANDOFF_AI.md`
- `.agents/memory/activeContext.md`
- `.agents/memory/progress.md`
- `docs/ai-context/refactor/02-BOARD.md`
- `docs/ai-context/refactor/03-OPEN-ITEMS.md`
- `docs/ai-context/refactor/06-HANDOFF.md`
- `docs/ai-context/refactor/07-SPRINT-LOG.md`

## Out of current refactor scope

- `mcp-server/`
