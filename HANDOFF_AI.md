# Handoff Tecnico — NOVO-APP — 28/05/2026 23:00 UTC-3

## Status

**PR #307 fechada** como "too polluted". Investigacao de tela branca CONCLUIDA com causa raiz confirmada.

Branch: `fix/consolidated-grounding-loading-fixes` (branch mantida apenas como referencia historica, sera arquivada)
PR: https://github.com/brunolimaff-jpg/NOVO-APP/pull/307 (CLOSED)
Commits: 4 (582db81, b6c5340, 3bb4a17, 93573c6) — 2 uteis + 2 debug que poluiram o historico
Estado: CLOSED — nao mergeada

### PR #306 mergeada (`fix/full-dossier-lifecycle-trace` -> main)
- Merge commit: `45a7d81` em 2026-05-28 19:50 UTC-3
- feat: instrumentacao completa do ciclo de vida do dossier com persistencia Supabase
- 4 commits originais, squash ou merge no main
- CI todo verde: typecheck, build, tests (1182), dossier golden, smoke preview

## O que foi entregue

### PR #307 — Patches consolidados de #304 e #305 + debug timing (4 commits, 6+ arquivos)

- `utils/documentExtractor.ts` — cascata DDG HTML -> Lite -> Gemini summary, searchPrompt customizavel, decode uddg redirect
- `api/gemini.ts` — scoutDiag de grounding chunks (warn se vazio, info se ok)
- `services/geminiProxy.ts` — `AbortSignal.timeout(25s)` no open-web-search
- `components/LoadingSmart.tsx` — fadeoutTimerRef + guard `else if(isVisible)` + scoutDiag portal mount/unmount
- `features/dossier/waterfall-orchestrator.ts` — fire-and-forget cache delete com timeout 15s (Promise.race)
- `components/chat/MessageTimeline.tsx` — viewport readiness scoutDiag com dimensoes
- Commits extras de debug: timingSteps/timingMs na resposta JSON, instrumentacao de timing na cascata

Typecheck limpo, lint 0 erros, 138/138 test files + 1182/1182 testes passando.

### O que NAO veio de #304/#305
- Remocao do Grafo/Mermaid no SocietaryMap (regressao)
- 10 testes com `it.skip` no SocietaryMap
- `console.log/time/timeEnd` em hot paths

## Investigacao de tela branca — CONCLUIDA

### Sintoma
Tela branca intermitente no preview da PR #307 durante geracao de dossier Scheffer, ao alternar abas.

### Causa raiz CONFIRMADA
O endpoint `https://html.duckduckgo.com/html/` introduzido no `performDuckDuckGoSearch` (utils/documentExtractor.ts) e **intermitentemente bloqueado** para IPs de datacenter da Vercel. Quando bloqueado:
1. TCP connect fica pendurado
2. `AbortSignal.timeout(8000)` pode nao abortar efetivamente na runtime Vercel
3. A funcao acumula timeouts da cascata (Gemini 30s + HTML hang + Lite 8s + summary 20s)
4. Estoura o `maxDuration: 60` da Vercel Hobby -> **504 Gateway Timeout** da runtime
5. O handler `api/open-web-search.ts` SEMPRE retorna 200 (try/catch cobre tudo) — o 504 vem da runtime Vercel matando a funcao, nao do codigo

### Evidencia
- Vercel runtime logs: 4 ocorrencias de 504 em `/api/open-web-search`
- Vercel runtime logs: 2 ocorrencias de 200 na mesma rota (bug intermitente)
- Console browser: `grounding habilitado sem fontes retornadas` para multiplos modulos
- Console browser: `module:deadline` aos 60s
- curl local: DDG HTML e Lite respondem em <0.5s (HTTP 202) — bloqueio e especifico de IPs Vercel
- Handler tem try/catch que sempre retorna 200 — o 504 so pode vir de timeout da runtime
- 5 hipoteses descartadas com evidencia de refutacao (LoadingSmart, MessageTimeline, waterfall, geminiProxy)

### Hipotese descartadas
5 hipoteses testadas e descartadas: loadingVariant nos deps, else if (isVisible), emergencyTimer MessageTimeline, fadeoutTimerRef, executeOpenWebSearchTool signal opcional. Todas com evidencia de refutacao.

### Correcao recomendada (NAO aplicada)
Remover `https://html.duckduckgo.com/html/` da cascata em `performDuckDuckGoSearch`, mantendo apenas DDG Lite (8s) -> Gemini summary (20s). O Lite ja funcionava em main.

### Por que PR #307 foi fechada
A PR acumulou 2 commits extras de debug (`3bb4a17`, `93573c6`) com instrumentacao de timing nao essencial, poluindo o historico. Decisao de fechar e reaplicar patches uteis em PRs limpas.

## Pendencias

- [ ] **P0: Aplicar patch corretivo para tela branca** — remover DDG HTML da cascata, manter apenas Lite + Gemini summary. Criar nova PR limpa com os patches uteis de #307
- [ ] **P0: Nova PR limpa** — reaplicar os 6 patches uteis (cascata sem DDG HTML, fadeoutTimerRef, fire-and-forget cache delete, scoutDiag grounding) sem os commits de debug
- [ ] Task #9 (P2): Painel de debug visual (/debug) para consultar scout_diagnostics
- [ ] P1: Restaurar botao "Grafo" no SocietaryMap
- [ ] P1: Remover `it.skip` dos 10 testes do SocietaryMap
- [ ] P2: Corrigir `Titulo:` sem acento nos fallbacks DDG/Gemini
- [ ] P3: Reduzir tempo total do dossier (mover processamento para server-side)

## Proximo passo recomendado

Criar nova branch a partir de main com apenas os patches uteis de #307, excluindo o endpoint DDG HTML. Testar preview sem o HTML endpoint. Se estavel, abrir nova PR limpa.

## Arquivos do PR #307 (para referencia ao reaplicar)

| Arquivo | Proposito | Reaplicar? |
|---------|-----------|------------|
| `utils/documentExtractor.ts` | Cascata DDG HTML -> Lite -> Gemini summary | SIM, mas remover DDG HTML |
| `api/gemini.ts` | scoutDiag grounding chunks | SIM |
| `services/geminiProxy.ts` | AbortSignal.timeout(25s) open-web-search | SIM |
| `components/LoadingSmart.tsx` | fadeoutTimerRef + else if guard + scoutDiag | SIM |
| `features/dossier/waterfall-orchestrator.ts` | fire-and-forget cache delete timeout 15s | SIM |
| `components/chat/MessageTimeline.tsx` | viewport readiness scoutDiag | SIM |

## Links

- PR #307: https://github.com/brunolimaff-jpg/NOVO-APP/pull/307 (CLOSED)
- Investigacao completa: `docs/obsidian/decisions/INVESTIGACAO-TELA-BRANCA-PR307-2026-05-28.md`
- Bruno Vault: `30-LICOES/LICOES-TELA-BRANCA-PR307-2026-05-28.md`
