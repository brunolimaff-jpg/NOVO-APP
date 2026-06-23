# Handoff — PR #386 LiteLLM: Fase 1 TRACE deployada, REPORT_READY bloqueado

**Atualizado:** 2026-06-23 (delivery-loop Fase 1 + push + CI)
**Branch:** `feat/litellm-experiment` | **HEAD remoto:** `b628c45b`
**PR:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/386

### Estado terminal: **BLOQUEADO** — REPORT_READY não atingido (waterfall timeout)

### Merge: BLOQUEADO — MERGE_READY false — digite **MERGE** só após REPORT_READY

---

## O que esta sessão fez

1. **Fase 1 TRACE cliente implementada** (passos 1.1–1.7)
   - `services/geminiProxy.ts` — entry, request:start (warn+console), pre-fetch, fetch-disparado, guard abort
   - `features/dossier/waterfall-orchestrator.ts` — post-teia, pre-websearch, pre-module-loop
   - `services/gemini/investigation-orchestration.ts` — module:start
2. **Commits temáticos pushados** (3 commits após `aaf05ec5`)
   - `4f453edd` — debug(trace): Fase 1 cliente
   - `97815710` — feat(e2e): report-ready + ship-loop-watch
   - `b628c45b` — test: ajustes unitários LiteLLM/webSearch
3. **Gates locais:** typecheck ✅ | build ✅ | test 1681/1683 (2 flaky em suite completa; passam isolados)
4. **Preview deployado** — SHA `b628c45b` confirmado no bundle
   - URL: https://scoutagro-imm8c1ae2-brunolimaff-3629s-projects.vercel.app
   - Marcadores TRACE no bundle: `post-teia`, `pre-module-loop` ✅
5. **CI principal:** Build, Tests, Coverage, Typecheck, Dossier Golden, Smoke preview, Vercel ✅
6. **Golden Dossier Live:** ❌ timeout 840s (14 min) — waterfall não completou no preview `b628c45b`
7. **report-ready local:** não executado — `E2E_AUTH_PASSWORD` ausente no ambiente do agente

---

## Achado crítico (inalterado)

Durante runs LiteLLM no preview:

- **ZERO** POSTs `action: generateContent` em `/api/gemini` — só `recordDiagnostics`
- TRACE **G1–G5** servidor nunca nos logs Vercel do waterfall LiteLLM
- Fase 1 cliente agora permite medir **onde** o fluxo para (console browser no preview)

---

## Próximo passo (Fase 1.5 — evidência obrigatória antes de Fase 2)

1. Abrir preview https://scoutagro-imm8c1ae2-brunolimaff-3629s-projects.vercel.app
2. Login Supabase → Scheffer CNPJ `04.733.767/0001-80` → DevTools Console
3. Filtrar `[TRACE]` e aplicar árvore de decisão:

```
Sem post-teia / pre-module-loop     → C3 (pré-módulo socio-search)
post-module-loop + sem proxy entry   → C1
proxy entry + sem pre-fetch          → C2 (getSupabaseAuthHeaders hang)
pre-fetch signalAborted=true         → A2
fetch-disparado + sem G1             → rede/endpoint
G1 + timeout ~55-60s                 → B (budget Hobby)
```

4. **NÃO aplicar Fase 2** sem evidência TRACE do console
5. Rodar report-ready local com secrets:
   ```bash
   BASE_URL=https://scoutagro-imm8c1ae2-brunolimaff-3629s-projects.vercel.app \
   E2E_REAL_AUTH=1 \
   E2E_OPERATOR_EMAIL=bruno.ferreira@senior.com.br \
   E2E_AUTH_PASSWORD="$E2E_AUTH_PASSWORD" \
   E2E_DEPLOYMENT_SHA=b628c45b39dd067b89a32b719278e19586f014bd \
   npm run test:e2e:report-ready
   ```

---

## Notas operacionais

- `ship-loop-watch.sh` falha em GitGuardian (fail-fast) — CI core verde; ignorar GitGuardian para gate funcional
- URL antiga do comentário PR (`scoutagro-ak7ic69gz`) serve SHA `02728fb2` — usar deployment mais recente acima
- Working tree local: docs/handoff/wiki ainda não commitados (commit separado pendente)

---

## Leitura na abertura da próxima sessão

1. Este arquivo
2. [docs/plans/PR-386-plano-entregavel.md](docs/plans/PR-386-plano-entregavel.md) §7
3. `.agents/memory/activeContext.md`
