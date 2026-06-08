# Active Context

Last updated: 2026-06-08 -- PR #346: P0 producao travada vs preview OK

## Atualizacao 2026-06-08 -- PR #346 verde + handoff final

- **Branch mantida:** `fix/validate-inline-sources-timeout` / PR #346.
- **Nao mergear:** ainda exige autorizacao explicita `MERGE`.
- **Codigo validado:** `992ece9f` (`fix(dossier): timeout continuity retries and prefer static timeline`).
- **Commits posteriores:** documentacao/handoff somente, sem mudanca de codigo.
- **Implementado e publicado:** timeout total de `/api/gemini` agora cobre `response.text()` + `JSON.parse()` em `services/geminiProxy.ts`; telemetria separa `action` e classe `ai/control`.
- **Continuity abort:** `generateContinuityQuestion` aceita `signal`; o timeout de 20s do waterfall aborta a request real, e cada tentativa tem race local de 15s para cair em fallback se o promise nao resolver apos abort.
- **Erro controlado:** se `finalizeWaterfallUI` limpa `activeGenerationRef` antes do erro voltar ao `processMessage`, o catch ainda renderiza `ErrorMessageCard`.
- **Timeline pos-waterfall:** bot gigante prefere `messages-static-fallback` mesmo se a viewport virtualizada ainda estiver suspensa.
- **Loading timer:** labels modulares agora tem identidade canonica; `Verificando pressoes e compliance...` normaliza para `compliance`; `LoadingStageTimer` loga `stage-start`/`stage-complete`.
- **Validacao local:** `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e:errors`, `npx playwright test tests-e2e/scheffer-cnpj-blank-panel.spec.ts`.
- **Validacao preview real:** alias `https://scoutagro-git-fix-validate-in-45ab1a-brunolimaff-3629s-projects.vercel.app`; 3 execucoes Scheffer fecharam com tela final, overlay removido, input habilitado e Supabase `pos-register-end=1`, `ui-finalized=1`, `PostCompletion=6`, `check:10000ms=1`, `stuck_or_blank=0`.
- **CI:** PR #346 verde no codigo validado; `E2E Critical Browser` PASS no commit `992ece9f`.
- **Doc handoff fechado:** `HANDOFF_AI.md`, `docs/handoffs/2026-06-08-pr346-p0-prod-preview-final.md`, `CALIBER_LEARNINGS.md` e Bruno Vault (`40-HANDOFFS`, `20-SESSOES`, `30-LICOES`) apontam para o fechamento do P0.

## Estado

- **Branch:** `fix/validate-inline-sources-timeout` (PR #346)
- **Bug diagnosticado**: `fetch('/api/link-status')` com `AbortSignal.timeout(25_000)` cobria apenas conexao; `response.json()` sem timeout bloqueava waterfall
- **Correcao**: AbortController explicito (30s) + body read timeout (15s) via `response.text()` + `JSON.parse()`
- **FreezeDiag**: 18 marcos de telemetria adicionados
- **13 novos testes** para timeout/conexao/fallback/FreezeDiag
- **Mock fix**: `fetch` mock nos testes existentes (adicionado `response.text()` + `headers` + `bodyUsed`)
- **Preview Exec #1**: PASS (CNPJ Scheffer)
- **CI**: verde no codigo validado `992ece9f`
- **CodeRabbit review**: concluido sem bloquear

## Decisoes arquiteturais ativas

- `validate-inline-sources` e modulo opcional — timeout nao quebra waterfall
- FreezeDiag: telemetria temporaria para investigacao
- Body read com timeout separado via `response.text()` + `JSON.parse()` (nao `response.json()`)

## Pendencias

| Item               | Status   | Acao                                         |
| ------------------ | -------- | -------------------------------------------- |
| PR #346            | ABERTA   | Aguardar autorizacao explicita para MERGE    |
| Preview Exec #2    | PASS     | Supabase `PostCompletion=6`                  |
| Preview Exec #3    | PASS     | Supabase `PostCompletion=6`                  |
| FreezeDiag markers | DECIDIR  | Remover ou manter antes do merge             |
| CodeRabbit review  | OK       | Sem bloqueio no rollup                       |

## Links

- PR #346: https://github.com/brunolimaff-jpg/NOVO-APP/pull/346
- Preview: https://scoutagro-git-fix-validate-in-45ab1a-brunolimaff-3629s-projects.vercel.app
- Handoff final: `docs/handoffs/2026-06-08-pr346-p0-prod-preview-final.md`
- Bruno Vault handoff: `/Users/brunolima/Documents/Bruno Vault/40-HANDOFFS/NOVO-APP-handoff.md`
- Bruno Vault licoes: `/Users/brunolima/Documents/Bruno Vault/30-LICOES/LICOES-P0-PRODUCAO-TRAVADA-PREVIEW-OK-2026-06-08.md`
