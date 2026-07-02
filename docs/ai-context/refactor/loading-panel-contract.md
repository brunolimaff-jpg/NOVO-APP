# Contrato — painel central (loading / timeline / blank)

**Atualizado:** 2026-07-02 — BUG-8 PR #409

## Cadeia causal confirmada (código + logs Scheffer)

Ordem observada na sessão `f7f8c634-ad51-430d-82f3-117f822c26eb`:

1. `WaterfallLifecycle/health-check-final` — waterfall `completed`, bot com texto em memória
2. `MessageOrchestrator/processMessage:finally` — `setIsLoading(false)`, `completeLoadingProgress()`
3. `Virtuoso/viewport-ready` — branch Virtuoso, `forceStatic=false` no **primeiro frame**
4. `ChatInterface/panel:snapshot` — `panelState: content`
5. `ChatInterface/proactive-static-fallback-large-dossier` — `useEffect` **após paint**

**Raiz histórica:** fallback estático ≥4k chars era ligado só em `useEffect` (PR #330), obrigando um frame Virtuoso + `messages-viewport-placeholder` antes do static. Regressão PR #303: `safeMessages.length` nas deps do viewport effect (commit `724d5f425`, 2026-06-03).

**Contrato atual BUG-8:** dossiê abaixo de `60_000` chars não deve cair em static fallback completo. Blank panel reativo abaixo desse limite faz remount controlado da timeline virtualizada (`timelineRecoveryNonce`). Static fallback fica como último recurso para dossiê `>= 60_000` chars.

## Regras únicas (fonte de verdade)

| ID  | Regra                                                                                    | Implementação                                                       |
| --- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| R1  | Overlay hero enquanto `isLoading && loadingVariant !== 'inline'`                         | `shouldShowHeroLoadingOverlay`                                      |
| R2  | Timeline **não** suspensa se bot renderizável (preview ≥200 chars ou final) durante hero | `shouldSuspendHeroMessageTimeline(..., hasRenderableBotMessage)`    |
| R3  | Dossiê <60k pós-loading permanece na timeline virtualizada; blank panel faz remount leve | `decideTimelineRecoveryMode` + `timelineRecoveryNonce`              |
| R4  | Readiness do Virtuoso **não** depende de `safeMessages.length`                           | deps do effect em `MessageTimeline`                                 |
| R5  | Pós-loading com bot esperado: placeholder/suspend **não** são estado visual válido       | `blankPanelTelemetry` `validVisualState`                            |
| R6  | PostCompletion usa `isLoading`/`loadingVariant` reais do store                           | `message-orchestrator` `schedulePostCompletionChecks`               |
| R7  | `forceStaticTimelineFallback` só é usado como último recurso para dossiê >=60k           | `decideTimelineRecoveryMode(...)=static-fallback`                   |

## Investigação performance (Inv 4)

Manual: Chrome Performance entre `processMessage:finally` e primeiro `bot-message-content` com `data-text-length` alto. Follow-up: SocietaryMap/CNAE em PR separada se long tasks dominarem.

## P0 BUG-8 PR #409 (2026-07-02)

- `preferStaticForLargeDossier=false`; static proativo desligado para não inflar DOM.
- `decideTimelineRecoveryMode`: `<60_000` chars → `remount-virtualized`; `>=60_000` chars → `static-fallback`.
- Watchdog 2s só considera static fallback para dossiê `>=60_000` com placeholder/suspended e overlay ausente.
- Telemetria: `stuck-viewport-placeholder` / `stuck-viewport-suspended`.
