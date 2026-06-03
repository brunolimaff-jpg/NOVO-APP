# Contrato — painel central (loading / timeline / blank)

**Atualizado:** 2026-06-03 — pós-incidente spinner handoff (main pós-#330)

## Cadeia causal confirmada (código + logs Scheffer)

Ordem observada na sessão `f7f8c634-ad51-430d-82f3-117f822c26eb`:

1. `WaterfallLifecycle/health-check-final` — waterfall `completed`, bot com texto em memória
2. `MessageOrchestrator/processMessage:finally` — `setIsLoading(false)`, `completeLoadingProgress()`
3. `Virtuoso/viewport-ready` — branch Virtuoso, `forceStatic=false` no **primeiro frame**
4. `ChatInterface/panel:snapshot` — `panelState: content`
5. `ChatInterface/proactive-static-fallback-large-dossier` — `useEffect` **após paint**

**Raiz:** fallback estático ≥4k chars era ligado só em `useEffect` (PR #330), obrigando um frame Virtuoso + `messages-viewport-placeholder` antes do static. Regressão PR #303: `safeMessages.length` nas deps do viewport effect (commit `724d5f425`, 2026-06-03).

## Regras únicas (fonte de verdade)

| ID | Regra | Implementação |
|----|--------|----------------|
| R1 | Overlay hero enquanto `isLoading && loadingVariant !== 'inline'` | `shouldShowHeroLoadingOverlay` |
| R2 | Timeline **não** suspensa se bot renderizável (preview ≥200 chars ou final) durante hero | `shouldSuspendHeroMessageTimeline(..., hasRenderableBotMessage)` |
| R3 | Dossiê grande (≥4000 chars) pós-loading usa timeline **estática no mesmo render** | `preferStaticForLargeDossier` derivado no render de `ChatInterface` |
| R4 | Readiness do Virtuoso **não** depende de `safeMessages.length` | deps do effect em `MessageTimeline` |
| R5 | Pós-loading com bot esperado: placeholder/suspend **não** são estado visual válido | `blankPanelTelemetry` `validVisualState` |
| R6 | PostCompletion usa `isLoading`/`loadingVariant` reais do store | `message-orchestrator` `schedulePostCompletionChecks` |
| R7 | `forceStaticTimelineFallback` (reativo) só limpa em troca de sessão ou novo loading | efeito `isLoading` false→true em `ChatInterface` |

## Investigação performance (Inv 4)

Manual: Chrome Performance entre `processMessage:finally` e primeiro `bot-message-content` com `data-text-length` alto. Follow-up: SocietaryMap/CNAE em PR separada se long tasks dominarem.
## P0 pós-#331 (2026-06-03)

- `forceStatic` proativo com `expectedBotCharsMax >= 4000` (não só `preferStatic` pós-`isLoading`).
- `shouldSuspendVirtualizedListForTimeline = suspend && !effectiveStatic` — static vence suspended.
- Watchdog 2s: `SpinnerStuck/post-waterfall-watchdog` se placeholder/suspended com overlay ausente.
- Telemetria: `stuck-viewport-placeholder` / `stuck-viewport-suspended`.
