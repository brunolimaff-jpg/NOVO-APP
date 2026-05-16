# Mapa Arquitetural - Senior Scout 360

> Repositorio: [brunolimaff-jpg/NOVO-APP](https://github.com/brunolimaff-jpg/NOVO-APP)
> Ultima revisao: 2026-05-16
> Este mapa e auxiliar. Para status vivo da trilha, use `docs/ai-context/refactor/02-BOARD.md`.
> Plano da fase atual de manutenibilidade: `docs/ai-context/refactor/08-PHASE2-MAINTAINABILITY-PLAN.md`.

## Arquivos raiz

| Arquivo | Funcao | Status |
|---|---|---|
| `index.tsx` | bootstrap React com providers globais | estavel |
| `App.tsx` | hotspot principal de orquestracao e wiring global | em reducao controlada |
| `types.ts` | contratos centrais do produto, incluindo Radar | estavel |
| `constants.ts` | fachada publica de constantes/prompts principais | estavel |
| `vite.config.ts` | configuracao de build e aliases | estavel |
| `vercel.json` | runtime SPA + funcoes serverless | estavel |
| `eslint.config.js` | baseline de lint | estavel |
| `mobile-responsive.css` | regras mobile legadas fora de `index.css` | debito aberto |

## Componentes e features de UI

### Chat

- `components/ChatInterface.tsx`
  - fachada publica estavel da experiencia de chat
- `components/chat/`
  - `ChatShell.tsx`
  - `MessageTimeline.tsx`
  - `Composer.tsx`
  - `ChatPanels.tsx`

### Dossie

- `features/dossier/`
  - `waterfall-orchestrator.ts`
  - `benchmark-stage.ts`
  - `porta-reconciliation.ts`
- `components/InvestigationDashboard.tsx`
- `components/ScorePorta.tsx`

### War Room

- `components/WarRoom.tsx`
  - UI do modo tatico
  - desde a Sprint 8 usa parser compartilhado de `services/war-room/intent.ts`
- `services/warRoomService.ts`
  - fachada publica estavel
- `services/war-room/`
  - `contracts.ts`
  - `config.ts`
  - `history.ts`
  - `intent.ts`
  - `retrieval.ts`
  - `prompting.ts`
  - `sources.ts`
  - `query.ts`

### Radar

- `components/RadarPanel.tsx`
- `components/RadarSettings.tsx`
- `components/RadarBell.tsx`
- `features/radar/`
  - boundary arquitetural oficial do Radar
  - `README.md`, `types.ts`, `useRadar.ts`, `service.ts`, `index.ts`
- `hooks/useRadar.ts`
  - facade de compatibilidade para `features/radar`
- `services/radarService.ts`
  - facade de compatibilidade para `features/radar/service`

## Hooks

| Hook | Funcao | Status |
|---|---|---|
| `useAppInitialization.ts` | bootstrap local da aplicacao | ativo |
| `useSessionManager.ts` | CRUD de sessoes | ativo |
| `useSessionStorage.ts` | persistencia local de sessoes | ativo |
| `useRadar.ts` | facade de compatibilidade; runtime em `features/radar/useRadar.ts` | ativo |
| `useOffline.ts` | conectividade | ativo |
| `useToast.ts` | notificacoes | ativo |
| `useTheme.ts` | preferencia visual | ativo |

Observacao:

- `hooks/useChat.ts` foi removido na Sprint 7
- o guardrail de reintroducao vive em `tests/architecture/useChatImportGuard.test.ts`

## Camada de services

| Modulo | Papel |
|---|---|
| `services/geminiService.ts` | fachada publica da camada Gemini |
| `services/gemini/` | implementacao interna de investigacao, PORTA, fontes, recovery e runtime |
| `services/warRoomService.ts` | fachada publica do War Room |
| `services/war-room/` | implementacao interna modular do War Room |
| `services/ragService.ts` | RAG interno e documental |
| `services/radarService.ts` | facade de compatibilidade para `features/radar/service.ts` |
| `services/sessionRemoteStore.ts` | sync remoto de sessoes |
| `services/feedbackRemoteStore.ts` | sync remoto de feedback |
| `services/apiConfig.ts` | env/config tipado e links Senior reexportados |

## Estado e boundaries

- `stores/chatStore.tsx`
  - mensagens, loading, `lastQuery`, refs e sessao corrente
- `stores/dossierStore.tsx`
  - exportacao, save remoto e payload de dossie
- `features/chat/ChatErrorBoundary.tsx`
- `features/dossier/DossierErrorBoundary.tsx`
- `utils/errorBoundaryAudit.ts`

## APIs serverless

- `api/gemini.ts`
- `api/rag.ts`
- `api/docs-rag.ts`
- `api/link-status.ts`
- `api/open-web-search.ts`
- `api/radar-scan.ts`

Todas rodam em Vercel; validacao manual final deve acontecer em preview/producao, nao em `npm run dev`.

## Debitos e hotspots

- `App.tsx` ainda concentra parte do wiring global
- `mobile-responsive.css` segue fora da consolidacao principal de estilos
- `CRMDetail.tsx`, `WarRoom.tsx` e `LoadingSmart.tsx` continuam candidatos a decomposicao
- lint segue com backlog de warnings
- componentes visuais do Radar ainda estao em `components/`; runtime ja esta em `features/radar/`

## Regras vigentes

- novas responsabilidades Gemini entram em `services/gemini/`
- novas responsabilidades War Room entram em `services/war-room/`
- novas responsabilidades Radar entram em `features/radar/`
- nao quebrar fachadas publicas em sprint estrutural
- `types.ts` continua centralizado ate ROI claro para divisao
- `mcp-server/` segue fora da trilha de refactor atual
