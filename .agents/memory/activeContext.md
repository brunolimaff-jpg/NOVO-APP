# Active Context

Last updated: 2026-06-06 -- Investigacao freeze intermitente pos-waterfall. PR #344 mergeda. PR #345 ABERTA.

## Estado

- **PR #344 MERGEADA** em `8526982f`: truncamento frontend de dossie (3 secoes + Ver relatorio completo)
- **Foundation Cache habilitado em producao** como mitigacao de latencia Gemini
- **PR #345 ABERTA** (`fix/static-fallback-layout-collapse`): fix CSS static fallback (`absolute inset-0` -> `flex-1 min-h-0 w-full`). Validada (2/2 manual).
- **Branch `fix/diagnostic-render-freeze`**: instrumentacao diagnostica para capturar freeze intermitente
- **Bug freeze intermitente**: NAO RESOLVIDO. Hipótese: react-markdown processa ~8k chars por secao sincronamente, bloqueando main thread durante React re-render pos setIsLoading(false).

## Features ativas (instrumentacao temporaria)

- `utils/freezeDiag.ts`: `[FreezeDiag]` marks em finalizeWaterfallUI, message-orchestrator, MessageTimeline, SectionalBotMessage, MarkdownRenderer
- Longtask observer: captura bloqueios >50ms na main thread
- Watchdog heartbeat: alerta se main thread ficar sem execucao por >2s
- Render storm detector: alerta se componente renderizar >20 vezes

## Decisoes arquiteturais ativas

(Decisoes anteriores do bug P0 overlay continuam validas)

- Foundation Cache habilitado como mitigacao de latencia (reduz timeout/abort)
- freezeDiag.ts e temporario — remover ou condicionar antes de PR

## Pendencias

| Item                               | Status        | Proximo passo                     |
| ---------------------------------- | ------------- | --------------------------------- |
| Freeze intermitente                | INVESTIGANDO  | Reproduzir com [FreezeDiag] ativo |
| PR #345 merge                      | VALIDADA      | Decidir merge                     |
| Requisicao orfa continuityQuestion | NAO CORRIGIDO | Adicionar AbortController         |
| Instrumentacao freezeDiag          | TEMPORARIA    | Remover/condicionar antes de PR   |
| foundationCacheName null           | INVESTIGAR    | Bug separado                      |

## Links

- PR #344: https://github.com/brunolimaff-jpg/NOVO-APP/pull/344
- PR #345: https://github.com/brunolimaff-jpg/NOVO-APP/pull/345 (ABERTA)
- Branch diag: `fix/diagnostic-render-freeze`
- Vault sessao: `Bruno Vault/20-SESSOES/2026-06/2026-06-06T10-00-00-NOVO-APP-freeze-investigacao-diag.md`
