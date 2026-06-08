# Handoff final - PR #346 P0 producao travada vs preview OK

## Goal da proxima sessao

Decidir se a PR #346 pode ser mergeada ou continuar investigacao se aparecer nova evidencia em producao. A proxima sessao nao deve rediagnosticar do zero; deve usar este doc, `HANDOFF_AI.md`, `.agents/memory/*`, `CALIBER_LEARNINGS.md` e o espelho no Bruno Vault.

## State of play

| Item | Estado |
| --- | --- |
| Branch | `fix/validate-inline-sources-timeout` |
| Codigo validado | `992ece9f` |
| Commits posteriores | documentacao/handoff somente |
| PR | https://github.com/brunolimaff-jpg/NOVO-APP/pull/346 |
| Merge | Nao feito. Exige mensagem do Bruno com `MERGE`. |
| CI | Verde no codigo validado `992ece9f`; commits posteriores apenas documentam o fechamento |
| Preview real | Scheffer 3x PASS no alias da branch |
| Producao antiga | Confirmada a diferenca: sem `PostCompletion` nas sessoes ruins |

## Cadeia causal resolvida

Este incidente durou quase duas semanas porque varias falhas parecidas apareciam como "loading travado", mas em camadas diferentes:

1. Service Worker/cache e deploy podiam fazer producao rodar bundle diferente do preview.
2. Overlay/loading podia ficar fora de sincronia com o estado React.
3. `recordDiagnostics` podia competir com finalizacao e mascarar `PostCompletion`.
4. `Virtuoso` podia montar sem materializar conteudo visivel.
5. `validate-inline-sources` podia ficar preso em `response.json()`.
6. `/api/gemini` ainda podia ficar preso em body read.
7. `generateContinuityQuestion` podia continuar pendente mesmo apos o waterfall desistir.
8. O timer visual de etapa podia nao representar a etapa backend por falta de chave canonica.

## O que mudou na PR #346

Referenciar commits e diffs para detalhes. Nao duplicar codigo aqui.

- `features/dossier/waterfall-orchestrator.ts`: timeouts/fallbacks em modulo opcional, FreezeDiag e continuidade.
- `services/geminiProxy.ts`: timeout ate `response.text()` + `JSON.parse()`; abort de body read; telemetria por `action`, `requestClass` e `phase`.
- `services/gemini/auxiliary.ts`: `generateContinuityQuestion` recebe `AbortSignal`; tentativas com timeout local.
- `features/chat/message-orchestrator.ts`: erro controlado volta a renderizar `ErrorMessageCard`.
- `components/LoadingSmart.tsx` e `utils/loadingStatus.ts`: labels canonicas e `LoadingStageTimer`.
- `utils/diagnosticLog.ts`: flush diferido para eventos finais isolados.
- `utils/postWaterfallHandoff.ts`, `components/ChatInterface.tsx` e `components/chat/MessageTimeline.tsx`: recovery de painel oculto e fallback estatico para bot grande.
- Testes: unitarios de timeout/fallback, controlled-error e Scheffer blank panel.

## Validacao que fecha o incidente

Local no commit de codigo `992ece9f`:

- `npm run typecheck`
- `npm test` - 156 arquivos / 1360 testes
- `npm run build`
- `npm run test:e2e:errors`
- `npx playwright test tests-e2e/scheffer-cnpj-blank-panel.spec.ts`

CI/PR:

- Typecheck, Tests, Build, Dossier Golden, Smoke preview, CodeQL, Vercel, Vercel Preview Comments, CodeRabbit e `E2E Critical Browser` passaram.

Preview real:

- Alias: `https://scoutagro-git-fix-validate-in-45ab1a-brunolimaff-3629s-projects.vercel.app`
- `version.json`: `2026-06-07T20:13:53.885Z`
- Artefatos: `test-results/preview-scheffer-992ece9f/`

| Ciclo | Session diag | Evidencia |
| --- | --- | --- |
| 1 | `4186a7b8-24f0-4929-9195-d740c0971212` | `FreezeDiag=13`, `pos-register-end=1`, `ui-finalized=1`, `PostCompletion=6`, `check:10000ms=1`, `stuck_or_blank=0`, bot 36.654 chars |
| 2 | `c191a5a8-cea5-425c-80cd-35d08821aff4` | mesmos marcadores, bot 32.074 chars |
| 3 | `5a82bfa9-ef2d-4da9-aacd-beb9c28c0f62` | mesmos marcadores, bot 33.172 chars |

Comparacao ruim:

- `b0ad688e-9fcf-4296-bc1e-db1bb0ee76e5`: `FreezeDiag=0`, terminal waterfall `0`, `ui-finalized=0`, `PostCompletion=0`.
- `6ad684da-0323-4a4a-8b5c-43b03511f69b`: `pos-register-end=1`, `ui-finalized=0`, `PostCompletion=0`.

## Licoes aprendidas

Estas licoes foram espelhadas em `CALIBER_LEARNINGS.md` e no Bruno Vault.

- Nunca tratar `response.json()` como coberto pelo timeout do `fetch`.
- Timeout de operacao deve cobrir conexao, body read, parse e cleanup.
- Modulo opcional nunca pode segurar o waterfall indefinidamente.
- `Promise.race` sem abort e sem fallback observavel e mitigacao falsa.
- Se um promise pode ignorar abort, adicionar race local por tentativa.
- Diagnostics deve ser assíncrono e nao bloquear finalizacao de UI.
- `PostCompletion` precisa ser persistido, inclusive `check:10000ms`.
- `environment=production` em preview Vercel nao separa ambiente; usar hostname/timestamp.
- `Virtuoso` pode estar tecnicamente montado e ainda assim nao exibir nada util.
- `messages-static-fallback` e safety net de produto para dossies grandes.
- Timer de etapa deve seguir chave canonica de stage, nao string visual.
- Sentry vazio nao invalida freeze de UI; `scout_diagnostics` e fonte primaria.
- Preview OK nao prova producao se service worker/cache/deploy diferem.
- Validacao final precisa ser produto: overlay fora, input habilitado, bot visivel, cards renderizados.
- Teste de erro controlado nao e detalhe tecnico; e contrato de recuperacao para vendedor.

## Open decisions

- `FreezeDiag`: manter, reduzir ou remover antes do merge.
- Service Worker/cache: se producao voltar a divergir, investigar antes de reabrir waterfall.
- Compliance: nao dividir prompt nesta PR; so abrir PR separada com evidencia de `LoadingStageTimer`.

## Skills para proxima sessao

- `debugger` / `systematic-debugging`
- `validator` / `playwright-testing`
- `supabase`
- `doc-handoff`

## Artifacts

- `HANDOFF_AI.md`
- `.agents/memory/activeContext.md`
- `.agents/memory/progress.md`
- `.agents/memory/decisions.md`
- `CALIBER_LEARNINGS.md`
- `docs/handoffs/2026-06-05-prod-scheffer-stuck-compliance-consolidando.md`
- `docs/handoffs/2026-06-05-pr332-merge-prod-validation.md`
- `docs/ai-context/refactor/loading-panel-contract.md`
- `docs/investigation/2026-06-04-hero-stuck-findings.md`
- Bruno Vault handoff: `/Users/brunolima/Documents/Bruno Vault/40-HANDOFFS/NOVO-APP-handoff.md`
- Bruno Vault sessao: `/Users/brunolima/Documents/Bruno Vault/20-SESSOES/2026-06/2026-06-08T08-44-09-NOVO-APP-pr346-fechamento-p0.md`
- Bruno Vault licoes: `/Users/brunolima/Documents/Bruno Vault/30-LICOES/LICOES-P0-PRODUCAO-TRAVADA-PREVIEW-OK-2026-06-08.md`
