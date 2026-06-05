# Findings — hero preso pós-waterfall (validação de hipóteses)

**Data:** 2026-06-04
**Fases executadas:** Fase 1 (código) + Fase 2 (Supabase)
**Release em prod:** `eab12e20` (#331)
**Sessão ouro:** `6414b13f-28f3-4710-8a62-7241cf5293e0`

---

## 1. Resumo executivo

O overlay `LoadingSmart` trava em ~93% após o waterfall completar porque forma-se uma **cadeia de falhas sem autodefesa**: React state atualiza (`isLoading=false`) mas o re-render não remove o overlay a tempo, o mutex de flush descarta `PostCompletion`, o health-check captura o DOM inconsistente, e o watchdog é cego para overlay preso. **5 de 9 hipóteses confirmadas** com evidência objetiva.

---

## 2. Cadeia causal confirmada

```
waterfall completa (2min) → finally executa
  → setIsLoading(false) [linha 650 — OK]
  → React BATCHA o state update (não re-renderiza imediatamente)
  → flushDiagnosticsNow() sem force:true [H-C2: mutex pode bloquear]
  → health-check em 0ms captura DOM antes do re-render [H-U3]
    → isLoading=false no ref, overlay AINDA VISÍVEL no DOM [H-U2]
    → domBodyLen=816 (dossiê nunca renderizou no DOM)
    → PostCompletion=0 (mutex descartou ou flush não registrou)
  → LoadingSmart SEM timeout interno [H-O1]
  → Watchdog return false se overlay visível [H-U4]
  → RESULTADO: overlay travado permanentemente em ~93%
```

---

## 3. Scorecard de hipóteses

| ID   | Afirmação                                      | Status           | Confiança | Evidência                                                                          |
| ---- | ---------------------------------------------- | ---------------- | --------- | ---------------------------------------------------------------------------------- |
| H-C1 | recordDiagnostics compete com generateContent  | **REFUTADA**     | 95%       | `api/gemini.ts:525-526` — early return antes de qualquer validação Gemini          |
| H-C2 | diagFlushing bloqueia PostCompletion sem force | **CONFIRMADA**   | 90%       | `diagnosticLog.ts:151` — `if (diagFlushing && !force) return;`                     |
| H-C3 | Flush pending >3s ou sem abort                 | **INCONCLUSIVA** | —         | Sem evento de flush no Supabase; precisa Vercel logs                               |
| H-C4 | insertDiagnosticsBatch lento                   | **INCONCLUSIVA** | —         | Sem coluna de timing; precisa Vercel logs                                          |
| H-U1 | setIsLoading(false) não commitou               | **REFUTADA**     | 95%       | `message-orchestrator.ts:650` — vem ANTES do flush (linha 660)                     |
| H-U2 | Desync store vs DOM                            | **CONFIRMADA**   | 98%       | Supabase: isLoading=false + overlay=true + domBodyLen=816                          |
| H-U3 | health-check antes do finally                  | **CONFIRMADA**   | 85%       | `message-orchestrator.ts:177` — setTimeout 0ms captura DOM antes do re-render      |
| H-U4 | Watchdog cego (exige overlay ausente)          | **CONFIRMADA**   | 95%       | `postWaterfallHandoff.ts:34` — `if (loadingOverlayVisible) return false;`          |
| H-U5 | Static ≥4k não ativou                          | **REFUTADA**     | 90%       | `postWaterfallHandoff.ts:32` — critério é ≥4k da maior mensagem (30k > 4k = ativa) |
| H-O1 | Overlay sem timeout                            | **CONFIRMADA**   | 95%       | `LoadingSmart.tsx:476-490` — depende 100% de `isLoading` externo                   |

---

## 4. Evidência Supabase (Fase 2)

### Comparação de sessões

| session_id        | PostCompletion | domBodyLen | overlay=true | Resultado |
| ----------------- | -------------- | ---------- | ------------ | --------- |
| `6414b13f` (ouro) | **0**          | **816**    | 1            | Travada   |
| `6d40891c`        | **0**          | **816**    | 1            | Travada   |
| `5b3e0eeb`        | **0**          | **818**    | 1            | Travada   |
| `448a3802`        | **6**          | **40.405** | 1            | Recuperou |

### Health-check-final sessão ouro

| campo                | valor   |
| -------------------- | ------- |
| domHasLoadingOverlay | `true`  |
| isLoading            | `false` |
| domBodyLen           | `816`   |
| overlay_visible      | `null`  |
| botTextMaxLen        | `null`  |

### Timeline sessão ouro

| evento                            | timestamp       |
| --------------------------------- | --------------- |
| processMessage:start              | 20:56:56.680642 |
| processMessage:waterfall:start    | 20:56:56.680642 |
| processMessage:waterfall:returned | 20:58:59.871895 |
| processMessage:finally            | 20:58:59.871895 |

**Nota:** Nenhum evento de flush registrado no Supabase.

---

## 5. Evidência de código (Fase 1)

### Arquivos analisados

| Arquivo                                 | Linhas-chave       | Achado                                                     |
| --------------------------------------- | ------------------ | ---------------------------------------------------------- |
| `utils/diagnosticLog.ts`                | 151, 222-227       | Mutex `diagFlushing` bloqueia sem force                    |
| `api/gemini.ts`                         | 525-526            | Early return para recordDiagnostics                        |
| `features/chat/message-orchestrator.ts` | 177, 650, 660, 667 | Ordem finally: setIsLoading → flush → PostCompletion       |
| `utils/postWaterfallHandoff.ts`         | 32, 34             | Static ≥4k ativa; watchdog return false se overlay visível |
| `components/LoadingSmart.tsx`           | 476-490            | Overlay sem timeout, depende de isLoading                  |
| `components/ChatInterface.tsx`          | watchdog           | isPostWaterfallStuckHandoff                                |

---

## 6. Gate §6 — Status

| Critério                         | Status                                                                                | Nota                                         |
| -------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------- |
| Causa do pendente (H-C1 ou H-C3) | **H-C1 REFUTADA** — não é competição de rota. H-C3 INCONCLUSIVA — sem dados de timing | Falta Vercel logs                            |
| H-C2 confirmada ou refutada      | **CONFIRMADA** — mutex bloqueia PostCompletion                                        | Evidência código + PostCompletion=0          |
| H-U2/U3 esclarecidos             | **CONFIRMADOS** — desync store/DOM + health-check timing                              | Evidência Supabase + código                  |
| H-U4 aceito + telemetria         | **CONFIRMADA** — watchdog cego                                                        | Precisa definir telemetria overlay-persisted |
| Repro documentado                | **SIM** — sessão ouro + 2 travadas + 1 recuperada                                     | sessionId + queries neste doc                |
| Critério de sucesso              | **NÃO ATINGIDO** — PostCompletion=0, overlay=true, domBodyLen=816                     | Precisa de fix                               |

**Gate §6: 4/6 critérios atendidos.** Os 2 pendentes dependem de logs Vercel (H-C3) ou da implementação do fix (critério de sucesso).

---

## 7. Classificação de risco para PR P0

| Risco                       | Probabilidade | Impacto | Mitigação                                 |
| --------------------------- | ------------- | ------- | ----------------------------------------- |
| Overlay preso após fix      | Baixa         | Alto    | Timeout de autolimpeza no LoadingSmart    |
| PostCompletion descartado   | Média         | Médio   | force:true no flush do finally            |
| Watchdog não detecta        | Alta          | Médio   | Telemetria overlay-persisted              |
| Regressão em overlay normal | Baixa         | Alto    | Teste E2E existente + novo teste de stuck |

---

## 8. Não fazer

- Fix sem completar gate §6 (critério de sucesso)
- Misturar WIP local com fix prod
- P0 em ContinuityQuestion JSON (já refutada)
- Concluir regressão #331 sem separar overlay sumiu vs hero preso

---

## 9. Hipóteses inconclusivas (precisam Fase 3)

- **H-C3:** Flush pending >3s — precisa de Vercel logs ou Network tab do browser
- **H-C4:** insertDiagnosticsBatch lento — precisa de timing no serverless

Ambas são **menores** na cadeia causal. A causa raiz principal está na cadeia H-C2 → H-U2 → H-O1 → H-U4.

---

## 10. Artefatos relacionados

- `docs/investigation/2026-06-04-hero-stuck-hypothesis-validation.md` — hipóteses originais
- `docs/handoffs/2026-06-03-prod-hero-stuck-recordDiagnostics.md` — handoff forense
- `docs/ai-context/refactor/loading-panel-contract.md` — contrato loading
- `HANDOFF_AI.md` — handoff canônico
