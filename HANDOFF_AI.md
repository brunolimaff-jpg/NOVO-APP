# Handoff — PR #386 Golden Review + OpenCode Config

**Atualizado:** 2026-06-22 13:30

## PR #386 — Estado

**Branch:** `feat/litellm-experiment` | **HEAD:** `ef3d437` (docs-rag restaurado)
**PR:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/386
**Vault:** `/Users/brunolima/Documents/Bruno Vault/20-SESSOES/2026-06/2026-06-22T13-30-00-pr386-golden-review-4-riscos.md`

### Merge: BLOQUEADO

## 4 Riscos Golden Review — Corrigidos

| Risco               | Fix                                                                 | Arquivo                              |
| ------------------- | ------------------------------------------------------------------- | ------------------------------------ |
| SSRF link-status    | nip.io, IPv6, redirect manual 3 hops, GET fallback usa effectiveUrl | documentExtractor.ts, link-status.ts |
| Scheffer Chapecó/SC | locality Sapezal/MT no case.json, localityFound na rubrica          | case.json, dossierGolden.ts          |
| Brave 1/5 chamadas  | waitForNetworkIdle antes assertions + no finally                    | golden-dossier-live.spec.ts          |
| Sem prova IDs       | testInfo.attach JSON proof                                          | golden-dossier-live.spec.ts          |

## Deploy

| Commit    | Preview                                                           | Status                                      |
| --------- | ----------------------------------------------------------------- | ------------------------------------------- |
| 975d3f14  | https://scoutagro-fwsradft6-brunolimaff-3629s-projects.vercel.app | ✅ Ready (4 fixes, sem finalizeRun)         |
| 18f3a621+ | —                                                                 | ❌ Error — deleção docs-rag.ts quebra build |

**Build local (npm run build) OK. Typecheck OK.**

## Pendência Crítica

Rodar golden-dossier-live no preview com credenciais reais:

```bash
E2E_REAL_AUTH=1 \
E2E_DEPLOYMENT_SHA=<sha-do-deploy> \
E2E_OPERATOR_EMAIL=bruno.ferreira@senior.com.br \
E2E_AUTH_PASSWORD=<GOLDEN_E2E_AUTH_PASSWORD — GitHub Secrets> \
npx playwright test tests-e2e/golden-dossier-live.spec.ts --project=chromium
```

Exige 2 execuções consecutivas aprovadas no mesmo SHA.

## OpenCode — Configurado

- 10 MCPs ativos (sem apify, mermaid, context7, netlify)
- Permissions: bash/write/edit → ask
- Compaction: auto, prune=false, reserved=20000
- Formatter + LSP ativos
- Instructions consolidado: 1 arquivo (86 linhas vs 450 antes)
- 9 comandos custom (/audit, /ctx, /licoes, /review-branch, /sessions, /sync, /end-session, /quality-gate, /comandos)
- 11 subagentes (implementer + planner novos)
- Variants: Opus/Sonnet com thinking budget (ctrl+t)
- TUI: attention.notifications + sound ativos

## Próximo Passo

1. Corrigir deploy Vercel (sem deletar docs-rag.ts)
2. Rodar golden-dossier-live 2x
3. Se OK, gates finais + handoff

## Regras Críticas

- NAO mergear PR #386
- NAO commitar credenciais
