# Active Context

Last updated: 2026-06-15 — sessao PR #376: 4 bugs corrigidos, E2E passando, Sentry configurado

## Estado Atual

- **Branch local:** `main` (`dbfbfad5`) — sincronizado com `origin/main`
- **PR #376:** Mergeada — 4 bugs (LoadingStuckProbes, contador 8/7, bolha inline, sidebar vazia)
- **PR #374:** Unificada na #376 — texto mapa societario + ARIA
- **Vercel producao:** scoutagro.vercel.app — 1501 testes passando
- **Supabase project:** `vmqfcaoirjcfucvlnpig`
- **Deadline:** 18/06/2026 — usuarios existentes precisam cadastrar senha
- **Git status:** limpo, sincronizado com origin/main

## O que foi entregue nesta sessao

- **Bug A — Safety net desarmada:** LoadingStuckProbes nunca funcionaram porque activeGenerationRef era deletado antes dos probes capturarem o valor. Corrigido: capture generationValid ANTES de deletar o ref.
- **Bug B — Contador "8/7":** "Consolidando informacoes..." contava como etapa. Corrigido: finalizeLoadingProgress ignora esse rotulo + Math.min cap.
- **Bug C — Bolha inline travada (stale thinking):** Guard data.isLoading + stale-thinking retorna null. useEffect auto-destruicao com graceExpired reset entre ciclos.
- **Bug D — Sidebar vazia apos criar conta:** storageRemove() limpava localStorage, getOperatorId() so lia de la. Corrigido: storageSet(OPERATOR_ID_KEY) apos resolucao de auth.
- **Sentry — 4 alertas:** Loading stuck timeout, waterfall leak, session persist failed, generation ref cleared.
- **Typecheck:** MetricsDashboard.tsx com index signature.
- **E2E tests:** auth helper (setupE2EAuth + loginViaSupabase), 10 arquivos, 6/6 preview Vercel.
- **Code review:** Gemini + CodeRabbit feedback aplicado e resolvido.

## Decisoes ativas

- DI-2026-06-15-01: activeGenerationRef sobrevive aos probes
- DI-2026-06-15-02: "Consolidando..." e rotulo de UI, nao etapa de loading
- DI-2026-06-15-03: stale-thinking retorna null, nao erro alarmista
- DI-2026-06-15-04: OperatorContext restaura operator_id no localStorage
- Decisoes anteriores permanecem em `decisions.md`

## Atencao

- Branch `feature/supabase-auth` pode ser deletada (local + remote).
- Sentry 4 novos alertas — monitorar volume inicial.
- Deadline 18/06 se aproximando — verificar banner e cron ativos.
- SocietaryMap texto de progresso passou por reversao — confirmar versao final.

## Proximo passo

Monitorar Sentry para os 4 novos alertas e deletar branch feature/supabase-auth.
