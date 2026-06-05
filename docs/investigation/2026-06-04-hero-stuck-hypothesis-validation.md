# Investigação — hero preso pós-waterfall (rastreabilidade de hipóteses)

**Fase:** hipóteses e validação — **sem implementação de fix**
**Criado:** 2026-06-04
**Release em prod:** `eab12e20` (#331)
**Sessão ouro:** `6414b13f-28f3-4710-8a62-7241cf5293e0`
**Supabase:** projeto `vmqfcaoirjcfucvlnpig`, tabela `scout_diagnostics`

---

## 1. Resumo executivo

O dossiê **termina no servidor** (`waterfall:end`, `processMessage:finally`, bot ~30k chars), mas a UI pode ficar no hero (~93%, "Finalizando cards…") com **`recordDiagnostics` pendente** em `/api/gemini` (initiator `diagnosticLog.ts:162`, stack `message-orchestrator.ts:660`). Sessões travadas têm **PostCompletion ausente** e `health-check-final` com **`domHasLoadingOverlay: true`** mesmo com `isLoading: false` no payload. Antes de qualquer PR P0, cada hipótese abaixo precisa status **CONFIRMADA** ou **REFUTADA**.

---

## 2. Mapa de dores (linha do tempo)

| Marco                     | Sintoma                                         | PR / commit   |
| ------------------------- | ----------------------------------------------- | ------------- |
| Diagnóstico persistente   | Console some; scout_diagnostics                 | #306          |
| Tela branca pós-waterfall | Painel vazio com sessão OK                      | #328, #330    |
| Freeze hero Compliance    | Main thread / Virtuoso                          | #329          |
| Handoff estático ≥4k      | Blank panel pós-overlay                         | #330, #331    |
| Atual                     | Overlay hero preso + recordDiagnostics pendente | #331 eab12e20 |

Fluxo causal (texto): waterfall:end → health-check-final → processMessage:finally → flushDiagnosticsNow → POST recordDiagnostics (pendente) → PostCompletion não persiste → overlay permanece visível.

---

## 3. Registro mestre de hipóteses

| ID   | Frente  | Afirmação                                                                | Status       | Evidência já coletada                     |
| ---- | ------- | ------------------------------------------------------------------------ | ------------ | ----------------------------------------- |
| H-C1 | Infra   | recordDiagnostics na mesma /api/gemini compete com generateContent longo | INCONCLUSIVA | Request pendente; vários gemini 200 antes |
| H-C2 | Infra   | diagFlushing bloqueia PostCompletion sem force:true                      | INCONCLUSIVA | PostCompletion=0 sessão ouro              |
| H-C3 | Infra   | Flush finally pendente >3s ou sem abort                                  | INCONCLUSIVA | Network pendente (screenshot)             |
| H-C4 | Infra   | insertDiagnosticsBatch lento no server                                   | INCONCLUSIVA | Sem runtime logs na janela                |
| H-U1 | UI      | setIsLoading(false) não commitou antes do overlay visível                | INCONCLUSIVA | finally no console; UI 93%                |
| H-U2 | UI      | Desync store vs DOM (isLoading false, overlay true)                      | PARCIAL      | health-check payload sessão ouro          |
| H-U3 | UI      | health-check antes do finally; batch com mesmo timestamp                 | INCONCLUSIVA | created_at igual no Supabase              |
| H-U4 | UI      | Watchdog #331 cego (exige overlay ausente)                               | CONFIRMADA   | isPostWaterfallStuckHandoff no código     |
| H-U5 | UI      | Static ≥4k não ativou com ~30k chars                                     | INCONCLUSIVA | overlay cobre timeline                    |
| H-P1 | Produto | JSON ContinuityQuestion causa travamento                                 | REFUTADA     | waterfall OK com mesmo warn               |
| H-O1 | Obs     | Sentry vazio = sem incidente                                             | REFUTADA     | scout_diagnostics tem finally             |

### Critérios pass/fail (resumo)

- **H-C1 pass:** Vercel mostra diag esperando atrás de gen longa. **Fail:** diag 200 em <2s com gen idle.
- **H-C2 pass:** PostCompletion no batch pendente ou fallback LS. **Fail:** PostCompletion já no Supabase.
- **H-U4:** Gap aceito — adicionar telemetria overlay-persisted (não coberto pelo watchdog atual).

---

## 4. Matriz de sessões

| session_id      | PostCompletion | health domBodyLen | Nota      |
| --------------- | -------------- | ----------------- | --------- |
| 6414b13f (ouro) | 0              | 816               | Travada   |
| 6d40891c        | 0              | 816               | Travada   |
| 448a3802        | 6              | 40405             | Recuperou |
| 6d061257        | 6              | 62948             | OK        |

---

## 5. Protocolos de validação

### Supabase

```sql
SELECT session_id,
  count(*) FILTER (WHERE area = 'PostCompletion') AS pc,
  max((payload->>'domBodyLen')::int) FILTER (WHERE event = 'health-check-final') AS dom_len
FROM scout_diagnostics
WHERE session_id = '6414b13f-28f3-4710-8a62-7241cf5293e0'
GROUP BY session_id;
```

### DevTools

Filtrar gemini; no pendente recordDiagnostics: Timing + Initiator diagnosticLog.ts:162.

### Vercel

Logs production, deploy eab12e20, janela UTC do repro.

---

## 6. Gate antes de PR P0

- [ ] Causa do pendente (H-C1 ou H-C3) identificada
- [ ] H-C2 confirmada ou refutada
- [ ] H-U2/U3 esclarecidos
- [ ] H-U4 aceito + nova telemetria definida
- [ ] Repro documentado (sessionId + HAR opcional)
- [ ] Sucesso: PostCompletion com overlay false e botTextMaxLen >4k em <10s após finally

---

## 7. Não fazer nesta fase

- Fix recordDiagnostics sem gate §6
- Misturar WIP local com fix prod
- P0 em ContinuityQuestion JSON
- Concluir regressão #331 sem separar overlay sumiu vs hero preso

---

## 8. Artefatos

- docs/handoffs/2026-06-03-prod-hero-stuck-recordDiagnostics.md
- docs/ai-context/refactor/loading-panel-contract.md
- utils/diagnosticLog.ts, features/chat/message-orchestrator.ts, utils/postWaterfallHandoff.ts
