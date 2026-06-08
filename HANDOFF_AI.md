# Handoff - PR #346 P0 producao travada vs preview OK

**Branch:** `fix/validate-inline-sources-timeout`
**Head:** `992ece9f`
**PR:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/346
**Status:** PR verde, preview real validado 3x, sem merge.
**Regra:** merge somente com autorizacao explicita do Bruno contendo `MERGE`.

## Entrada rapida para proximo agente

Leia nesta ordem:

1. Este arquivo.
2. `.agents/memory/activeContext.md`
3. `.agents/memory/progress.md`
4. `.agents/memory/decisions.md`
5. `docs/handoffs/2026-06-08-pr346-p0-prod-preview-final.md`
6. `CALIBER_LEARNINGS.md`

Espelho no Bruno Vault:

- `/Users/brunolima/Documents/Bruno Vault/40-HANDOFFS/NOVO-APP-handoff.md`
- `/Users/brunolima/Documents/Bruno Vault/20-SESSOES/2026-06/2026-06-08T08-44-09-NOVO-APP-pr346-fechamento-p0.md`
- `/Users/brunolima/Documents/Bruno Vault/30-LICOES/LICOES-P0-PRODUCAO-TRAVADA-PREVIEW-OK-2026-06-08.md`

Em conflito, a fonte canonica de implementacao e o repo. O Vault e espelho navegavel para memoria humana.

## O que foi resolvido

A regressao vinha de uma cadeia, nao de um unico bug:

- `/api/link-status`: `AbortSignal.timeout()` cobria conexao/headers, mas nao `response.json()`.
- `/api/gemini`: ainda havia leitura de body sem timeout no cliente `services/geminiProxy.ts`.
- `generateContinuityQuestion`: `Promise.race` encerrava a espera do waterfall, mas podia deixar request Gemini viva.
- `recordDiagnostics`/flush: eventos finais isolados podiam ficar no buffer e nao chegar ao Supabase.
- UI loading: etapa visual e etapa real podiam divergir por labels sem identidade canonica.
- Timeline: bot gigante podia existir no DOM, mas continuar invisivel se a viewport virtualizada estivesse suspensa.
- E2E: falha controlada de `/api/gemini` precisava manter o contrato de produto: `error-message-card`, overlay removido e input liberado.

## Commits relevantes

- `d79488af` - `/api/gemini` body read + error recovery
- `76921bd7` - abort de body read pendente
- `b998fcf5` - diagnostico mede input ativo correto
- `b3a1d27b` - continuity timeout fail-open
- `65190101` - recovery de dossie oculto pos-waterfall
- `6c213183` - flush de eventos finais
- `992ece9f` - retry de continuidade com timeout local + static timeline para bot gigante

## Validacao no head `992ece9f`

Local:

- `npm run typecheck` - PASS
- `npm test` - PASS, 156 arquivos / 1360 testes
- `npm run build` - PASS
- `npm run test:e2e:errors` - PASS, 3/3
- `npx playwright test tests-e2e/scheffer-cnpj-blank-panel.spec.ts` - PASS, 1/1

CI/PR:

- Typecheck, Tests, Build, Dossier Golden, Smoke preview, CodeQL, Vercel e `E2E Critical Browser` - PASS.
- `E2E Critical Browser` - PASS em 3m53s.

Preview real:

- Alias: `https://scoutagro-git-fix-validate-in-45ab1a-brunolimaff-3629s-projects.vercel.app`
- `version.json`: `2026-06-07T20:13:53.885Z`
- Artefatos locais: `test-results/preview-scheffer-992ece9f/`

| Ciclo | Session app | Session diag | Bot chars | Supabase |
| --- | --- | --- | ---: | --- |
| 1 | `635305ec-0067-4bc6-b4c0-3c2eef4fa410` | `4186a7b8-24f0-4929-9195-d740c0971212` | 36.654 | `FreezeDiag=13`, `pos-register-end=1`, `ui-finalized=1`, `PostCompletion=6`, `check:10000ms=1`, `stuck_or_blank=0` |
| 2 | `a10f6da3-2a04-4064-a0e8-b91c91924de0` | `c191a5a8-cea5-425c-80cd-35d08821aff4` | 32.074 | `FreezeDiag=13`, `pos-register-end=1`, `ui-finalized=1`, `PostCompletion=6`, `check:10000ms=1`, `stuck_or_blank=0` |
| 3 | `5f5af197-7f76-4259-88d5-57e252545ea5` | `5a82bfa9-ef2d-4da9-aacd-beb9c28c0f62` | 33.172 | `FreezeDiag=13`, `pos-register-end=1`, `ui-finalized=1`, `PostCompletion=6`, `check:10000ms=1`, `stuck_or_blank=0` |

Comparacao de producao antiga:

- `b0ad688e-9fcf-4296-bc1e-db1bb0ee76e5`: `FreezeDiag=0`, terminal waterfall `0`, `ui-finalized=0`, `PostCompletion=0`.
- `6ad684da-0323-4a4a-8b5c-43b03511f69b`: `pos-register-end=1`, mas `ui-finalized=0`, `PostCompletion=0`.

Observacao: o campo `environment` no Supabase aparece como `production` tambem para preview Vercel porque o build roda em modo production. Use horario, hostname/payload e URL do ciclo para diferenciar preview de producao real.

## Licoes que nao podem se perder

Resumo curto. A versao completa esta em `CALIBER_LEARNINGS.md` e no Vault.

- Timeout de `fetch()` nao termina no header; body read e parse precisam estar dentro do contrato de timeout.
- `Promise.race` sem abort real so esconde o problema; a request continua consumindo recurso e pode manter UI/telemetria pendente.
- Mesmo abortando, uma promise pode nao resolver a tempo; etapas opcionais precisam de race local e fallback.
- Telemetria de IA, controle/cache e diagnostics precisa ser separada por `action`, `requestClass` e fase.
- `recordDiagnostics` nunca pode ser dependencia para liberar UI.
- `PostCompletion check:10000ms` e evidencia obrigatoria para este tipo de bug.
- `Virtuoso itemsRendered` nao prova conteudo visivel; validar `bot-message-content` visivel ou `messages-static-fallback`.
- Supabase, Sentry e checks verdes nao provam UX; validar overlay, input, DOM e comportamento final.
- Preview OK nao prova producao se Service Worker/cache/deploy real divergem.
- E2E de erro controlado e contrato de produto; nao ajustar o teste para esconder overlay preso.
- Labels de loading precisam de identidade canonica; texto visual nao e chave de estado.
- Modulo opcional com fetch externo deve falhar aberto e nao abortar o waterfall.

## Decisoes abertas

- Manter `FreezeDiag` como diagnostico permanente ou remover/reduzir antes do merge.
- Se producao voltar a divergir do preview, investigar primeiro Service Worker/cache/deploy e `scout_diagnostics`; Sentry pode ficar vazio nesse tipo de freeze.
- Nao modularizar prompt de Compliance nesta PR. So reabrir se `LoadingStageTimer` mostrar lentidao real persistente, nao percepcao de label.

## Skills recomendadas para continuar

- `debugger` / `systematic-debugging`: nova regressao ou nova evidencia de producao.
- `validator` / `playwright-testing`: preview/producao e fluxos visuais.
- `supabase`: cruzar `scout_diagnostics`.
- `doc-handoff`: qualquer fechamento novo deve atualizar repo + Bruno Vault.
