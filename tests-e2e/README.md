# E2E Playwright

## Modos

| Gate                    | Project / comando               | Modo             | O que prova                                                  |
| ----------------------- | ------------------------------- | ---------------- | ------------------------------------------------------------ |
| **critical-ux**         | `npm run test:e2e:critical-ux`  | Stub             | UX Cofre/overlay; painel ~30k chars fake — regressão rápida  |
| **report-ready**        | `npm run test:e2e:report-ready` | **Live**         | Dossiê **real** no preview Vercel — **Fase 6 delivery-loop** |
| **golden-dossier-live** | `npm run test:e2e:golden-live`  | Live + qualidade | Comparação golden Scheffer — gate separado, blocking CI      |
| **scheffer-research**   | spec manual                     | Live + pesquisa  | R1/R2/R3 qualidade — fora do loop automático                 |

Specs em `critical-ux` usam **stubs** (`helpers/gemini.ts`, `helpers/cnpj-stub.ts`) — não chamam Gemini nem BrasilAPI real.

## report-ready (gate funcional Fase 6)

**Não rode sem secrets.** Senha **nunca** em arquivo versionado.

```bash
BASE_URL=https://...preview.vercel.app \
E2E_REAL_AUTH=1 \
E2E_OPERATOR_EMAIL=bruno.ferreira@senior.com.br \
E2E_AUTH_PASSWORD="$E2E_AUTH_PASSWORD" \
E2E_DEPLOYMENT_SHA=<sha40-opcional-recomendado> \
VERCEL_AUTOMATION_BYPASS_SECRET="$VERCEL_AUTOMATION_BYPASS_SECRET" \
npm run test:e2e:report-ready
```

CI: mapear `GOLDEN_E2E_OPERATOR_EMAIL` → `E2E_OPERATOR_EMAIL`, `GOLDEN_E2E_AUTH_PASSWORD` → `E2E_AUTH_PASSWORD`.

Critérios: waterfall iniciou → loading off → `bot-message-content` visível (≥500 chars) → `chat-input` habilitado. CNPJ fixo Scheffer `04.733.767/0001-80`. Timeout default **390s** (`REPORT_READY_TIMEOUT_MS` = 330s waterfall + 60s buffer).

Arquivos: `report-ready.spec.ts`, `helpers/report-ready.ts`.

## Outros

- CI blocking: vitest + coverage + build budget (ver `HANDOFF_AI.md`).
- `p2-cnpj-live` / `test:e2e:cnpj:live`: manual apenas.
- Entre push e gate live: `./scripts/ship-loop-watch.sh <PR#> [SHA] [PREVIEW_URL]`.
