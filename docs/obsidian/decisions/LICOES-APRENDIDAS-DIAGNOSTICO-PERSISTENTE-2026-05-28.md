---
type: licoes-aprendidas
area: debug-diagnostico
data: 2026-05-28
sessao: diagnostico-persistente-pr306
tags:
  - licao
  - diagnostico
  - diagnostico-persistente
  - supabase
  - vercel
  - gemini
  - loading
  - overlay
  - performance
  - timeout
  - abort
  - localStorage
---

# Licoes Aprendidas — Diagnostico Persistente (PR #306)

Voltar para [[DECISIONS-Index]].

## Contexto

Tres fases de instrumentacao para diagnosticar bugs de tela branca e overlay orfao no fluxo de dossier (Scheffer, CNPJ 04.733.767/0001-80). Criacao de tabela `scout_diagnostics` no Supabase, buffer global, visibility tracking, heartbeat, deadlines, watermarks e instrumentacao Virtuoso. Branch `fix/full-dossier-lifecycle-trace`, PR #306.

---

## Tabela de Licoes

| #   | Licao                                                                                                                                                                                                                                | Anti-padrao / o que evitar                                                                          | Onde aplicar                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1   | **Diagnostico persistente e essencial para bugs de longa duracao** — quando o console morre junto com a pagina, um buffer em memoria + flush para Supabase + fallback localStorage e a diferenca entre diagnosticar em horas vs dias | Confiar apenas em console.log que desaparece quando a pagina descarta                               | `utils/diagnosticLog.ts`, `utils/serverDiagnostics.ts` |
| 2   | **Vercel Hobby limita a 12 serverless functions** — incorporar endpoints relacionados como actions em uma unica function existente (ex: `api/gemini.ts` com early return) em vez de criar novas                                      | Criar uma nova funcao serverless para cada novo endpoint                                            | `api/gemini.ts`                                        |
| 3   | **`keepalive: true` cancela `AbortSignal`** — o fetch com keepalive ignora o signal do AbortController. Para timeout de 3s funcionar, keepalive precisa ser false                                                                    | Usar `keepalive: true` junto com `AbortController`                                                  | `utils/diagnosticLog.ts`                               |
| 4   | **Env var deve ter precedencia sobre localStorage** — `VITE_SCOUT_DIAGNOSTICS_ENABLED=false` deve desativar mesmo se localStorage diz o contrario                                                                                    | localStorage sobrescrever configuracao de ambiente                                                  | Leitura de config no startup                           |
| 5   | **localStorage sem pruning explode** — cada flush falho criava nova key. Limite de 5 keys + pruning automatico resolve                                                                                                               | Acumular chaves no localStorage sem limite                                                          | `utils/diagnosticLog.ts`                               |
| 6   | **Timers de diagnostico acumulam sem cleanup** — `schedulePostCompletionChecks` cria 6 setTimeout por chamada. Se nao cancelar os anteriores, acumula infinitamente                                                                  | Criar setTimeout sem armazenar referencia para cleanup                                              | `message-orchestrator.ts`, `waterfall-orchestrator.ts` |
| 7   | **`innerText` forca reflow — usar `textContent`** — `document.body.innerText` dispara layout recalculation. Para checagem de presenca de texto no DOM, `textContent` e suficiente e nao causa reflow                                 | Usar `innerText` para leitura de texto do DOM                                                       | Qualquer script de diagnostico ou extracao de texto    |
| 8   | **Safari mobile dispara pagehide sem visibilitychange:hidden** — `ensureHiddenAt()` como fallback quando `visibilityHiddenAt` e null e `document.visibilityState === 'hidden'`                                                       | Assumir que visibilitychange:hidden sempre precede pagehide                                         | `utils/setupVisibilityTracking.ts`                     |
| 9   | **Gate de flush bloqueia eventos criticos** — pagehide/freeze precisam de `force=true` para bypassar `diagFlushing` — se um flush anterior esta em andamento, os eventos de descarte de tab nunca seriam enviados                    | Bloquear flush de diagnostico durante outro flush em andamento sem excecao para eventos de descarte | `utils/diagnosticLog.ts`                               |
| 10  | **6-7 minutos de operacao client-side e fragil** — o problema raiz da tela branca nao era o LoadingSmart, era o fato do dossier levar tempo demais. Chrome faz throttling de setTimeout para 1/minuto apos 5min em background        | Culpar componente React pelo travamento quando a causa raiz e tempo de processamento                | Arquitetura geral do fluxo de dossier                  |
| 11  | **Modulo mais lento era 146s (Riscos & Compliance)** — identificar e isolar o modulo problematico e o primeiro passo antes de otimizar                                                                                               | Otimizar sem medir — voce nao sabe o que esta lento                                                 | `waterfall-orchestrator.ts` (per-module deadline)      |
| 12  | **Sem estado global (Zustand), listeners fora do React precisam de refs/module-level variables** — `updateVisibilityState()` + `useEffect` no hook de loading resolve o sync entre React state e event listeners nativos             | Tentar acessar React state diretamente de listeners nativos (stale closure)                         | `setupVisibilityTracking.ts`                           |
| 13  | **Instrumentacao nao deve alterar logica de negocio** — todas as adicoes de diagnostico sao fire-and-forget, sem await, sem alterar fluxo. Isso evita que o diagnostico cause novos bugs                                             | Await em chamadas de diagnostico que podem falhar                                                   | Toda instrumentacao no projeto                         |
| 14  | **Promise.race com timeout salva de deadlocks** — `deleteWaterfallFoundationCache` travava em chamada Gemini de 210s. `Promise.race(deleteCache, timeout15s)` resolveu o Bug 1 (overlay orfao)                                       | Chamadas de API no finally sem timeout — se travar, o finally nunca executa                         | `waterfall-orchestrator.ts`                            |

---

## Anti-padroes identificados

1. **Console.log como unico instrumento de diagnostico** — desaparece quando a pagina e descartada. Diagnostico persistente e necessario para bugs de longa duracao.
2. **Criar serverless function para toda necessidade nova** — o limite de 12 do Vercel Hobby e real. Incorporar como actions em functions existentes quando possivel.
3. **`keepalive: true` + `AbortSignal`** — o browser ignora o abort quando keepalive esta ativo. Sao mutuamente exclusivos.
4. **Timers sem cleanup tracking** — criar setTimeout sem armazenar a referencia para cleanup causa acumulo de timers orfaos e comportamento imprevisivel.
5. **`innerText` para leitura de DOM** — forca reflow completo. `textContent` e suficiente se nao precisa de layout computed.

## Padroes confirmados

1. **Fire-and-forget para diagnostico** — nunca usar await em chamadas de diagnostico; o diagnostico nunca deve causar o bug que esta tentando encontrar.
2. **Buffer + batch flush** — coletar eventos em memoria e flushar em batch reduz chamadas de rede sem perder dados.
3. **Redundancia de persistencia** — localStorage como fallback quando Supabase esta indisponivel garante que dados nao sejam perdidos.
4. **Timeout em toda operacao no finally** — qualquer chamada no finally do waterfall PRECISA de timeout (Promise.race) para garantir que o fluxo principal nao seja bloqueado.

## Registro

Esta licao foi registrada em:

- `.agents/memory/decisions.md` — entradas `2026-05-28`
- `docs/obsidian/decisions/LICOES-APRENDIDAS-DIAGNOSTICO-PERSISTENTE-2026-05-28.md` (este documento)
- Bruno Vault `30-LICOES/LICOES-DIAGNOSTICO-PERSISTENTE-2026-05-28.md`
- `CALIBER_LEARNINGS.md`

## Referencias

- PR #306: `fix/full-dossier-lifecycle-trace`
- `utils/diagnosticLog.ts`
- `utils/serverDiagnostics.ts`
- `utils/setupVisibilityTracking.ts`
- `utils/setupHeartbeat.ts`
- `api/gemini.ts`
- `docs/obsidian/decisions/LICOES-APRENDIDAS.md`
