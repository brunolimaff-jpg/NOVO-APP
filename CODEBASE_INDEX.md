# CODEBASE INDEX — Senior Scout 360

> Gerado em 2026-06-24. Stack: React 19 + Vite 6 + TypeScript 5 + Tailwind 3 + LiteLLM/Bedrock/DeepSeek + Supabase + Vercel.
>
> Legenda: 🧊 = fachada pública congelada | 🔧 = utilitário interno | 🐛 = bug conhecido

---

## Raiz — App Entry Points

| Arquivo         | Linhas | Descrição                                    |
| --------------- | ------ | -------------------------------------------- |
| `index.tsx`     | 193    | Entry point React, monta App                 |
| `App.tsx`       | 791    | Componente raiz: rotas, modais, auth gate    |
| `middleware.ts` | 30     | Vercel Edge Middleware (rewrites, headers)   |
| `types.ts`      | 406 🧊 | Tipos compartilhados (Message, Module, etc.) |
| `constants.ts`  | 686 🧊 | Constantes globais (cores, tamanhos, enums)  |

## Config

| Arquivo                | Linhas | Descrição                |
| ---------------------- | ------ | ------------------------ |
| `vite.config.ts`       | 121    | Build, proxy, plugins    |
| `vitest.config.ts`     | 67     | Test runner config       |
| `playwright.config.ts` | 90     | E2E tests config         |
| `eslint.config.js`     | 110    | Linter flat config       |
| `tailwind.config.js`   | 44     | Tailwind design tokens   |
| `postcss.config.js`    | 6      | CSS pipeline             |
| `tsconfig.json`        | —      | TypeScript config        |
| `vercel.json`          | —      | Vercel deployment config |
| `.env.example`         | —      | Template de env vars     |

---

## API — Serverless Functions (Vercel)

### Públicas (12)

| Arquivo                          | Linhas | Descrição                                            |
| -------------------------------- | ------ | ---------------------------------------------------- |
| `api/gemini.ts`                  | 800    | 🧊 Proxy principal LiteLLM + fallback Gemini         |
| `api/llm-experiment.ts`          | 371    | 🔬 Experiment runner: A/B test de modelos            |
| `api/socio-search.ts`            | 173    | 🔧 Busca societária                                  |
| `api/gerar-dossie.ts`            | 130    | 🔧 Geração de dossiê completo                        |
| `api/rag.ts`                     | 170    | 🔧 RAG com vetores                                   |
| `api/radar-scan.ts`              | 531    | 🔧 Radar de mercado                                  |
| `api/cnpj.ts`                    | 64     | 🔧 Validação de CNPJ                                 |
| `api/extract-content.ts`         | 55     | 🔧 Extração de conteúdo de URLs                      |
| `api/link-status.ts`             | 111    | 🔧 Verificação de links                              |
| `api/open-web-search.ts`         | 479    | 🔧 Brave Search API (substituto do Google Grounding) |
| `api/ping-litellm.ts`            | 72     | 🔧 Health check do proxy LiteLLM                     |
| `api/cron-email-confirmation.ts` | 86     | 🔧 Cron job de confirmação de email                  |

### Privadas/Utils (6)

| Arquivo                    | Linhas | Descrição                                          |
| -------------------------- | ------ | -------------------------------------------------- |
| `api/_llm-client.ts`       | 347    | Cliente HTTP LiteLLM com timeouts, retry, fallback |
| `api/_experiment-auth.ts`  | 153    | 🔬 Allowlist de operadores para experimentos       |
| `api/_cors-headers.ts`     | 9      | Headers CORS                                       |
| `api/_cache-headers.ts`    | 9      | Headers de cache                                   |
| `api/_allowed-origins.ts`  | 23     | Origens permitidas                                 |
| `api/_gemini-key-utils.ts` | 13     | Utilitários de chave Gemini                        |

---

## Components — UI

### Chat & Mensagens

| Arquivo                    | Linhas | Descrição                            |
| -------------------------- | ------ | ------------------------------------ |
| `ChatInterface.tsx`        | 337 🧊 | Container principal do chat          |
| `MessageRow.tsx`           | 500    | Renderiza mensagem individual        |
| `MessageActionsBar.tsx`    | 341    | Ações de mensagem (copiar, exportar) |
| `InlineTypingResponse.tsx` | 79     | Indicador de digitação inline        |
| `InlineLoadingBubble.tsx`  | 350    | Bubble de loading com animação       |
| `SectionalBotMessage.tsx`  | 613    | Mensagem bot com seções              |
| `GhostMessageBlock.tsx`    | 70     | Placeholder de mensagem fantasma     |
| `FollowUpModal.tsx`        | 248    | Modal de perguntas de acompanhamento |

### Dossiê & Loading

| Arquivo                      | Linhas | Descrição                             |
| ---------------------------- | ------ | ------------------------------------- |
| `CofreOverlay.tsx`           | 436    | 🐛 Overlay glassmorphism do cofre     |
| `DossieSkeletonLoader.tsx`   | 99     | Skeleton loader do dossiê             |
| `LoadingInsightCarousel.tsx` | 114    | Carrossel de insights durante loading |
| `LoadingOverlayHeader.tsx`   | 101    | Header do overlay de loading          |
| `LoadingShared.tsx`          | 52     | Componentes de loading compartilhados |
| `LoadingSmart.tsx`           | 721    | Loading inteligente com curiosidades  |
| `LoadingStepsList.tsx`       | 161    | Lista de passos do loading            |
| `DuplicateDossierModal.tsx`  | 64     | Modal de dossiê duplicado             |

### Score & Radar

| Arquivo                  | Linhas | Descrição                     |
| ------------------------ | ------ | ----------------------------- |
| `ScorePorta.tsx`         | 279    | Framework PORTA (5 dimensões) |
| `ClienteSeniorScore.tsx` | 174    | Score do cliente              |
| `RadarPanel.tsx`         | 429    | Painel do radar               |
| `RadarCardHome.tsx`      | 138    | Card do radar na home         |
| `RadarSettings.tsx`      | 277    | Configurações do radar        |
| `RadarBell.tsx`          | 72     | Sino de notificações do radar |

### Financeiro & Export

| Arquivo                | Linhas | Descrição                 |
| ---------------------- | ------ | ------------------------- |
| `MetricsDashboard.tsx` | 342    | Dashboard de métricas     |
| `ExportDropdown.tsx`   | 330    | Dropdown de exportação    |
| `DossierShareBar.tsx`  | 92     | Barra de compartilhamento |
| `EmailModal.tsx`       | 69     | Modal de email            |

### UX Geral

| Arquivo                       | Linhas | Descrição                       |
| ----------------------------- | ------ | ------------------------------- |
| `AuthGate.tsx`                | 48     | Portão de autenticação          |
| `AuthModal.tsx`               | 295    | Modal de login                  |
| `SessionsSidebar.tsx`         | 314    | Sidebar de sessões              |
| `SettingsDrawer.tsx`          | 525    | Gaveta de configurações         |
| `EmptyStateHome.tsx`          | 644    | Estado vazio da home            |
| `WelcomeScreen.tsx`           | 213    | Tela de boas-vindas             |
| `GreetingWelcomeScreen.tsx`   | 255    | Saudação personalizada          |
| `HeaderSessionSearch.tsx`     | 74     | Header com busca de sessão      |
| `ErrorBoundary.tsx`           | 147    | Boundary de erro global         |
| `ErrorMessageCard.tsx`        | 170    | Card de erro                    |
| `ErrorToast.tsx`              | 146    | Toast de erro                   |
| `ModuleErrorCards.tsx`        | 63     | Cards de erro por módulo        |
| `FeedbackSection.tsx`         | 245    | Seção de feedback               |
| `HelpCenterFloating.tsx`      | 180    | Help center flutuante           |
| `InvestigationDashboard.tsx`  | 368    | Dashboard de investigação       |
| `InstallPrompt.tsx`           | 38     | Prompt de instalação PWA        |
| `MarkdownRenderer.tsx`        | 641    | Renderizador Markdown           |
| `MigrationBanner.tsx`         | 38     | Banner de migração              |
| `MigrationNoticeModal.tsx`    | 148    | Modal de aviso de migração      |
| `SmartOptions.tsx`            | 97     | Opções inteligentes             |
| `StatusIndicator.tsx`         | 128    | Indicador de status             |
| `SuspenseWithError.tsx`       | 37     | Suspense com tratamento de erro |
| `SyncIndicator.tsx`           | 69     | Indicador de sincronização      |
| `SystemHealthCheck.tsx`       | 458    | Health check do sistema         |
| `ToastContainer.tsx`          | 51     | Container de toasts             |
| `Tooltip.tsx`                 | 63     | Tooltip                         |
| `UpdateNotificationModal.tsx` | 194    | Modal de atualização            |
| `UserMenu.tsx`                | 121    | Menu do usuário                 |
| `WarRoom.tsx`                 | 292    | War Room                        |
| `ConfirmPopover.tsx`          | 69     | Popover de confirmação          |
| `DeepDiveTopics.tsx`          | 253    | Tópicos de deep dive            |
| `ClienteSeniorScore.tsx`      | 174    | Score Senior                    |

---

## Hooks

| Arquivo                        | Linhas | Descrição                        |
| ------------------------------ | ------ | -------------------------------- |
| `useChatActions.ts`            | 21     | Ações do chat simplificadas      |
| `useChatTheme.ts`              | 22     | Tema do chat                     |
| `useCofreTransition.ts`        | 218    | 🐛 Transição do cofre (dissolve) |
| `useInvestigation.ts`          | 225    | Hook de investigação             |
| `useStaticTimelineFallback.ts` | 359    | Fallback de timeline estática    |
| `useUpdateNotification.ts`     | 230    | Notificação de atualização       |
| `useSessionStorage.ts`         | 197    | Armazenamento de sessão          |
| `useAppInitialization.ts`      | 63     | Inicialização do app             |
| `useAuthGate.ts`               | 69     | Portão de auth                   |
| `useEmailModal.ts`             | 108    | Modal de email                   |
| `useFollowUpModal.ts`          | 79     | Modal de follow-up               |
| `usePanelState.ts`             | 103    | Estado de painel                 |
| `usePWA.ts`                    | 127    | PWA install                      |
| `useOffline.ts`                | 34     | Status offline                   |
| `useIsMobile.ts`               | 19     | Detecção mobile                  |
| `useToast.ts`                  | 47     | Toast notifications              |
| `useTheme.ts`                  | 18     | Tema dark/light                  |
| `useDebounce.ts`               | 16     | Debounce                         |
| `useClickBypass.ts`            | 18     | Bypass de clique                 |
| `useMigrationNotice.ts`        | 25     | Aviso de migração                |
| `useRadar.ts`                  | 5      | Re-export do hook radar          |
| `useSessionManager.ts`         | 2      | Re-export                        |

---

## Contexts

| Arquivo               | Linhas | Descrição                              |
| --------------------- | ------ | -------------------------------------- |
| `OperatorContext.tsx` | 580    | Auth local do operador (login, sessão) |
| `ModeContext.tsx`     | 57     | Modo da aplicação (operador/admin)     |
| `AuthContext.tsx`     | 192    | Contexto de autenticação               |

---

## Services

| Arquivo                    | Linhas | Descrição                          |
| -------------------------- | ------ | ---------------------------------- |
| `geminiService.ts`         | 14 🧊  | Fachada do Gemini API              |
| `geminiProxy.ts`           | 421    | Proxy de comunicação com LiteLLM   |
| `warRoomService.ts`        | 5 🧊   | Fachada do War Room                |
| `clientLookupService.ts`   | 741    | Consulta de clientes               |
| `competitors.ts`           | 459    | Competidores                       |
| `competitorService.ts`     | 497    | Serviço de competidores            |
| `operatorTracking.ts`      | 372    | 🐛 Rastreamento de operador        |
| `sessionRemoteStore.ts`    | 364    | Store remota de sessões (Supabase) |
| `portaStateService.ts`     | 231    | Estado do framework PORTA          |
| `brasilApiService.ts`      | 239    | API Brasil (CNPJ, etc.)            |
| `exportService.ts`         | 192    | Exportação de relatórios           |
| `extractContentService.ts` | 100    | Extração de conteúdo               |
| `ragService.ts`            | 94     | Serviço RAG                        |
| `apiConfig.ts`             | 58     | Config de APIs                     |
| `dossierAccessService.ts`  | 65     | Acesso a dossiês                   |
| `feedbackRemoteStore.ts`   | 61     | Store remota de feedback           |
| `feedbackService.ts`       | 35     | Serviço de feedback                |
| `investigationStore.ts`    | 45     | Store de investigação              |
| `radarService.ts`          | 11     | Serviço do radar                   |

---

## Features — Módulos de Domínio

### `features/chat/`

| Arquivo                       | Linhas | Descrição                 |
| ----------------------------- | ------ | ------------------------- |
| `message-orchestrator.ts`     | 1001   | Orquestrador de mensagens |
| `session-controller.ts`       | 328    | Controle de sessão        |
| `loading-progress.ts`         | 172    | Progresso de loading      |
| `loading-progress-reducer.ts` | 79     | Redutor de progresso      |
| `loading-watchdog.ts`         | 166    | Watchdog de loading       |
| `feedback-actions.ts`         | 174    | Ações de feedback         |
| `ChatErrorBoundary.tsx`       | 98     | Error boundary do chat    |
| `message-helpers.ts`          | 7      | Helpers de mensagem       |
| `session-reuse.ts`            | 21     | Reuso de sessão           |

### `features/dossier/`

| Arquivo                     | Linhas | Descrição                        |
| --------------------------- | ------ | -------------------------------- |
| `waterfall-orchestrator.ts` | 2126   | Orquestrador do waterfall (core) |
| `SocietaryMap.tsx`          | 644    | Mapa societário                  |
| `societaryGraph.ts`         | 653    | Grafo societário                 |
| `SocietaryMatrix.tsx`       | 430    | Matriz societária                |
| `buildSocietaryMermaid.ts`  | 320    | Builder de gráfico Mermaid       |
| `teiaTextParser.ts`         | 353    | Parser de texto da teia          |
| `waterfall-socio-search.ts` | 333    | Busca societária no waterfall    |
| `porta-reconciliation.ts`   | 275    | Reconciliação PORTA              |
| `waterfall-guard.ts`        | 172    | Guard do waterfall               |
| `societaryGraph.types.ts`   | 103    | Tipos do grafo societário        |
| `societaryCategories.ts`    | 58     | Categorias societárias           |
| `benchmark-stage.ts`        | 54     | Benchmark de estágio             |
| `DossierErrorBoundary.tsx`  | 123    | Error boundary do dossiê         |
| `SocietaryMap/utils.ts`     | 93     | Utilitários do mapa              |

### `features/radar/`

| Arquivo       | Linhas | Descrição        |
| ------------- | ------ | ---------------- |
| `service.ts`  | 250    | Serviço do radar |
| `useRadar.ts` | 300    | Hook do radar    |
| `index.ts`    | 8      | Re-export        |
| `types.ts`    | 9      | Tipos            |

---

## Utilitários — `utils/`

### LLM (Pipeline de IA)

| Arquivo                         | Linhas | Descrição                                |
| ------------------------------- | ------ | ---------------------------------------- |
| `utils/llm/modelRouter.ts`      | 167    | Roteamento de modelos (HYBRID_MODEL_MAP) |
| `utils/llm/modelCatalog.ts`     | 139    | Catálogo de modelos                      |
| `utils/llm/types.ts`            | 157    | Tipos do pipeline LLM                    |
| `utils/llm/experiment.ts`       | 156    | Engine de experimentos (A/B)             |
| `utils/llm/experimentGate.ts`   | 65     | Gate de experimentos                     |
| `utils/llm/cost.ts`             | 102    | Cálculo de custo                         |
| `utils/llm/webSearchService.ts` | 182    | Brave Search API                         |
| `utils/llm/groundingHybrid.ts`  | 100    | Grounding híbrido                        |
| `utils/llm/reportQuality.ts`    | 131    | Qualidade do relatório                   |

### Diagnóstico

| Arquivo                  | Linhas | Descrição                   |
| ------------------------ | ------ | --------------------------- |
| `diagnosticLog.ts`       | 640    | Log de diagnóstico          |
| `serverDiagnostics.ts`   | 193    | Diagnóstico server-side     |
| `blankPanelTelemetry.ts` | 277    | Telemetria de painel branco |

### Dossiê & Conteúdo

| Arquivo                    | Linhas | Descrição                 |
| -------------------------- | ------ | ------------------------- |
| `reportUtils.ts`           | 564    | Utilitários de relatório  |
| `documentExtractor.ts`     | 558    | Extrator de documentos    |
| `porta.ts`                 | 421    | Framework PORTA           |
| `mermaid.ts`               | 288    | Renderização Mermaid      |
| `continuitySuggestions.ts` | 268    | Sugestões de continuidade |
| `linkFixer.ts`             | 251    | Corretor de links         |
| `seniorEvidence.ts`        | 219    | Evidências Senior         |
| `seniorLinks.ts`           | 205    | Links Senior              |
| `dossierSourcePool.ts`     | 117    | Pool de fontes            |
| `dossierLinkIntegrity.ts`  | 156    | Integridade de links      |
| `dossierSourcesFooter.ts`  | 43     | Footer de fontes          |
| `dossierFinalize.ts`       | 26     | Finalização               |
| `finalizeWaterfallUI.ts`   | 203    | Finalização UI            |

### UX

| Arquivo                    | Linhas | Descrição                  |
| -------------------------- | ------ | -------------------------- |
| `loadingStatus.ts`         | 396    | Status de loading          |
| `loadingSmartViewModel.ts` | 192    | ViewModel do loading smart |
| `loadingHelpers.ts`        | 153    | Helpers de loading         |
| `loadingCuriosities.ts`    | 156    | Curiosidades               |
| `loadingBackoff.ts`        | 12     | Backoff                    |
| `loadingVariant.ts`        | 56     | Variante                   |
| `cofreLifecycle.ts`        | 59     | Ciclo de vida do cofre     |

### Segurança & Privacidade

| Arquivo               | Linhas | Descrição                           |
| --------------------- | ------ | ----------------------------------- |
| `promptLeakShield.ts` | 150    | Proteção contra vazamento de prompt |
| `privacy.ts`          | 28     | Privacidade                         |
| `featureAccess.ts`    | 63     | Acesso a features                   |

### Export

| Arquivo              | Linhas | Descrição                 |
| -------------------- | ------ | ------------------------- |
| `printExport.ts`     | 308    | Exportação para impressão |
| `printExport.css.ts` | 391    | Estilos de impressão      |
| `sessionExport.ts`   | 110    | Exportação de sessão      |

### Helpers

| Arquivo                    | Linhas | Descrição               |
| -------------------------- | ------ | ----------------------- |
| `textCleaners.ts`          | 630    | Limpeza de texto        |
| `errorHelpers.ts`          | 166    | Helpers de erro         |
| `friendlyErrorMessage.ts`  | 105    | Mensagens amigáveis     |
| `conversationHistory.ts`   | 78     | Histórico de conversa   |
| `markdownToHtml.ts`        | 125    | Markdown → HTML         |
| `markdownLinks.ts`         | 43     | Links markdown          |
| `messageHelpers.ts`        | 64     | Helpers de mensagem     |
| `companyNameExtractor.ts`  | 64     | Extrator de nome        |
| `socioRuralResearch.ts`    | 133    | Pesquisa rural          |
| `cnpj.ts`                  | 32     | Validação CNPJ          |
| `webVerification.ts`       | 144    | Verificação web         |
| `sectionParser.ts`         | 133    | Parser de seções        |
| `downloadHelpers.ts`       | 45     | Helpers de download     |
| `abortHelpers.ts`          | 4      | Helpers de abort        |
| `chunkRetry.ts`            | 36     | Retry com chunk         |
| `retry.ts`                 | 73     | Retry genérico          |
| `localStorage.ts`          | 33     | LocalStorage wrapper    |
| `timeGreeting.ts`          | 14     | Saudação por horário    |
| `teiaLegend.ts`            | 17     | Legenda da teia         |
| `promptResolvers.ts`       | 51     | Resolutores de prompt   |
| `featureFlags.ts`          | 56     | Feature flags           |
| `errorBoundaryAudit.ts`    | 37     | Auditoria               |
| `helpCenterGuardrails.ts`  | 92     | Guardrails              |
| `renderStateClassifier.ts` | 19     | Classificador de render |
| `expectedBotContent.ts`    | 16     | Conteúdo esperado       |
| `react-dom-shim.d.ts`      | 22     | Shim de tipos           |

---

## Prompts

| Arquivo                              | Linhas | Descrição                  |
| ------------------------------------ | ------ | -------------------------- |
| `prompts/megaPrompts.ts`             | 36 🧊  | Fachada pública de prompts |
| `prompts/systemPrompts.ts`           | 17 🧊  | Prompts de sistema         |
| `prompts/mega/foundation.ts`         | 1008   | Prompts fundação (PORTA)   |
| `prompts/mega/specialist-prompts.ts` | 1953   | Prompts especialistas      |
| `prompts/mega/builders.ts`           | 331    | Builders de prompt         |
| `prompts/mega/contracts.ts`          | 17     | Contratos                  |
| `prompts/mega/teia-deep.ts`          | 231    | Teia deep prompt           |
| `prompts/mega/teia-identity.ts`      | 146    | Teia identity              |

---

## Testes

| Diretório                  | Descrição          |
| -------------------------- | ------------------ |
| `tests/api/`               | API serverless     |
| `tests/components/`        | Componentes        |
| `tests/components/chat/`   | Chat               |
| `tests/architecture/`      | Arquiteturais      |
| `tests/config/`            | Config             |
| `tests/contexts/`          | Contextos          |
| `tests/contracts/`         | Contrato           |
| `tests/features/`          | Features           |
| `tests/features/chat/`     | Chat feature       |
| `tests/features/dossier/`  | Dossiê             |
| `tests/fixtures/`          | Fixtures           |
| `tests/fixtures/dossier/`  | Fixtures de dossiê |
| `tests/helpers/`           | Helpers            |
| `tests/hooks/`             | Hooks              |
| `tests/lib/`               | Lib                |
| `tests/lib/supabase/`      | Supabase           |
| `tests/prompts/`           | Prompts            |
| `tests/scripts/`           | Scripts            |
| `tests/services/`          | Serviços           |
| `tests/services/gemini/`   | Gemini             |
| `tests/services/war-room/` | War Room           |
| `tests/stores/`            | Stores             |
| `tests/utils/`             | Utils              |
| `tests/utils/llm/`         | LLM utils          |

---

## Scripts

| Arquivo                                  | Descrição                  |
| ---------------------------------------- | -------------------------- |
| `scripts/check-branch-health.sh`         | Saúde da branch            |
| `scripts/check-bundle-budget.sh`         | Orçamento de bundle        |
| `scripts/ensure-playwright.sh`           | Garante Playwright         |
| `scripts/validate-prompts.sh`            | Valida prompts             |
| `scripts/validate-preview.sh`            | Valida preview             |
| `scripts/validate-chat-no-autoscroll.sh` | Sem autoscroll             |
| `scripts/smoke-preview.mjs`              | Smoke test                 |
| `scripts/ship-loop-watch.sh`             | Ship loop watch            |
| `scripts/resolve-pr-threads.py`          | Resolve threads de PR      |
| `scripts/sentry-mcp.sh`                  | Config Sentry MCP          |
| `scripts/hook-sensitive-file-alert.sh`   | Alerta de arquivo sensível |
| `scripts/hooks/completion-check.sh`      | Check de completude        |
| `scripts/crawlAndIngestSeniorDocs.ts`    | Crawl de docs              |
| `scripts/ingestCanonicalBanking.ts`      | Ingestão banking           |
| `scripts/ingestErpDocs.ts`               | Ingestão ERP               |
| `scripts/ingestExtraDocs.ts`             | Ingestão extra             |
| `scripts/ingestPdfDocs.ts`               | Ingestão PDF               |
| `scripts/higienizarPinecone.ts`          | Limpeza Pinecone           |
| `scripts/test-radar.ts`                  | Teste radar                |
| `scripts/obsidian/check.mjs`             | Check Obsidian             |

---

## Documentação

| Arquivo                | Descrição             |
| ---------------------- | --------------------- |
| `CLAUDE.md`            | Instruções do projeto |
| `AGENTS.md`            | Protocolo de agentes  |
| `ARQUITETURA.md`       | Arquitetura (Fase 5)  |
| `CALIBER_LEARNINGS.md` | Lições aprendidas     |
| `CODEBASE_INDEX.md`    | Este arquivo          |
| `HANDOFF_AI.md`        | Handoff entre sessões |
| `docs/wiki/`           | Wiki (33 páginas)     |
| `docs/obsidian/`       | Documentação Obsidian |
| `docs/ai-context/`     | Contexto de IA        |
| `docs/archive/`        | Documentos arquivados |
