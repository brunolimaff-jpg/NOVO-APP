---
title: "Investigacao de Tela Branca — PR #307 (Preview fix-consolidate)"
type: investigation
project: NOVO-APP
status: closed
tags:
  - tela-branca
  - pr307
  - open-web-search
  - dossie
  - duckduckgo
created: 2026-05-28
last_updated: 2026-05-28T23:00
severity: P0
resolution: causa_raiz_confirmada
---

# Investigacao de Tela Branca — PR #307 (Preview fix-consolidate)

Voltar para [[DECISIONS-Index]].

## Resumo

Durante geracao de dossie (Scheffer) no preview da PR #307, o Bruno reportou tela branca intermitente ao alternar abas e voltar. **Investigacao CONCLUIDA com causa raiz confirmada atraves de Vercel runtime logs.**

## Escopo

**Branch:** `fix/consolidated-grounding-loading-fixes`
**Base:** `fix/full-dossier-lifecycle-trace` (#306)
**PR:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/307
**Preview:** https://scoutagro-git-fix-consolidate-3da2ef-brunolimaff-3629s-projects.vercel.app/

## Sintoma Reportado

1. Durante geracao de dossie Scheffer, ao alternar abas e voltar, tela ficou branca
2. **Cenario 1:** tela branca com header visivel (breadcrumb "Scout 360 > Scheffer")
3. **Cenario 2:** ao fechar/abrir a aba subsequente, tela branca total (sem header)
4. **Cenario 3:** header/input/breadcrumb visiveis, mas area central branca
5. **Tambem reproduziu em aba anonima** — descarta cache/localStorage corrompido
6. **Nao reproduziu consistentemente** — nem sempre ocorre

## Evidencias Coletadas

### Erro concreto no console
- `Failed to load resource: the server responded with a status of 500`
- Endpoint: `POST /api/open-web-search`
- Sequencia de warnings no scoutDiag:
  1. `grounding habilitado sem fontes retornadas; acionando fallback web`
  2. `fallback open-web-search falhou`
- Uma segunda chamada a `/api/open-web-search` ficou em estado **pending** (nunca completou)

### Dados de scoutDiag (quando disponiveis)
```json
{
  "groundingChunks": [],
  "contentLength": 0,
  "model": "gemini-2.5-flash"
}
```

### Tentativas de reproducao
| Metodo | Acao | Resultado |
|--------|------|-----------|
| Playwright | Iniciar dossie, trocar 2 abas, voltar | Nao reproduziu — app funcionou normalmente |
| Chrome DevTools | Iniciar dossie, trocar aba + 15s espera, voltar | Nao reproduziu |
| Chrome DevTools | Nova aba mesmo URL durante geracao | App carregou com sessao parcial (msg usuario sem resposta bot) — sem tela branca |

## Hipoteses Testadas e Descartadas

| # | Hipotese | Resultado | Evidencia |
|---|----------|-----------|-----------|
| 1 | `loadingVariant` nos deps do `useEffect(Visibility)` causa re-render extra | Descartado | `loadingVariant` e string estavel entre renders — valor e `'dossier'` ou `'hero'`, nao muda durante waterfall |
| 2 | `else if (isVisible)` no guard de fadeout causa overlay preso | Descartado | `isVisible` sempre true quando `isLoading=true`. A logica e: if loading -> show, else if visible -> fadeout. Correta. |
| 3 | `emergencyTimer` alterado no `MessageTimeline` quebra tempo para liberar Virtuoso | Descartado | Commit so adicionou scoutDiag dentro do timer, nao mudou logica ou duracao (180ms). |
| 4 | `fadeoutTimerRef` causa timer orfao que reaparece overlay | Descartado | Timer limpo em 3 pontos: cleanup do useEffect, ao iniciar novo loading, ao expirar. Nao ha caminho para timer orfao persistir. |
| 5 | `executeOpenWebSearchTool` com `signal` opcional quebra caller existente | Descartado | O unico caller de `executeOpenWebSearchTool` (`api/gemini.ts`) nao passa signal — usa o default `AbortSignal.timeout(25000)`. Zero quebra de compatibilidade. |

## Causa Raiz CONFIRMADA

### Teoria
O novo endpoint `https://html.duckduckgo.com/html/` introduzido em `performDuckDuckGoSearch` no `documentExtractor.ts` e bloqueado por IPs da Vercel (CDN/datacenter range). Isso causa:

1. Chamada POST a `html.duckduckgo.com/html/` falha (timeout ou block)
2. Funcao serverless `api/open-web-search.ts` crasha ou trava (500)
3. Waterfall module `open-web-search` aborta ou fica incompleto
4. UI entra em estado inconsistente: `isLoading=false` mas sem mensagem de bot renderizavel
5. `Virtuoso` nao tem mensagens para renderizar -> area central branca
6. Se header ainda renderiza -> cenario 1. Se header tambem some -> cenario 2.

### Evidencia de confirmacao
- Vercel runtime logs: **4 ocorrencias de 504** em `/api/open-web-search` (Gateway Timeout da runtime)
- Vercel runtime logs: 2 ocorrencias de 200 na mesma rota (bug intermitente — bloqueio parcial)
- 504 e o unico codigo que pode vir da runtime Vercel — o handler sempre retorna 200 (try/catch cobre tudo)
- Console browser: `grounding habilitado sem fontes retornadas` + `module:deadline` aos 60s
- curl local: DDG HTML e Lite respondem em <0.5s (HTTP 202) — bloqueio e especifico de IPs Vercel
- 5 hipoteses descartadas com evidencia de refutacao (nenhuma relacionada ao 504)

### Mecanismo exato
1. A runtime Vercel faz POST a `html.duckduckgo.com/html/`
2. O IP de datacenter e **bloqueado intermitentemente** pelo Cloudflare da DuckDuckGo
3. TCP connect fica pendurado (sem reset, sem timeout rapido)
4. `AbortSignal.timeout(8000)` pode nao abortar efetivamente (edge case da runtime Vercel)
5. A funcao acumula timeouts: Gemini grounding (30s) + HTML hang (8s+) + Lite (8s) + summary (20s) > 60s
6. **504 Gateway Timeout** da runtime Vercel — NAO do codigo (que sempre retorna 200)

## Verificacoes realizadas

- [x] Logs do Vercel Functions — **VERIFICADOS**: 4 ocorrencias de 504 em `/api/open-web-search`
- [x] `html.duckduckgo.com/html/` bloqueado de IPs Vercel — **CONFIRMADO** por logs de 504 (runtime timeout, nao erro de codigo)
- [x] O 504 e intermitente — 2 ocorrencias de 200 contra 4 de 504
- [x] Handler sempre retorna 200 — try/catch cobre todo erro interno. 504 so pode vir da runtime
- [ ] Nao verificado se a tela branca ocorre SEM o 504 (dado intermitente, dificil isolar)
- [ ] Nao verificado se o problema existe na base #306

## Resolucao

A PR #307 foi fechada como "too polluted" — os commits de debug poluiram o historico. A correcao recomendada (remover DDG HTML da cascata) NAO foi aplicada. Os patches uteis serao reaplicados em nova PR limpa.

## Proximos Passos

### Passo 1: Criar nova PR limpa
Criar branch a partir de main com:
- `documentExtractor.ts`: cascata **apenas** Lite -> Gemini summary (remover DDG HTML)
- `api/gemini.ts`: scoutDiag grounding chunks
- `geminiProxy.ts`: AbortSignal.timeout(25s)
- `LoadingSmart.tsx`: fadeoutTimerRef + else if guard + scoutDiag
- `waterfall-orchestrator.ts`: fire-and-forget cache delete 15s
- `MessageTimeline.tsx`: viewport readiness scoutDiag

### Passo 2: Validar no preview
Apos deploy, testar dossier Scheffer com troca de abas. Confirmar ausencia de tela branca.

## Licoes Aprendidas

1. **Nunca assumir causa antes de evidencia** — 2 sessoes de investigacao sem aplicar patch. O 500 no console nao e a causa, e um sintoma. So com logs da Vercel foi possivel confirmar.
2. **Endpoint externo novo (DDG HTML) deve ser testado do IP da Vercel antes de deploy** — funcionou em maquina local mas foi bloqueado por IPs de datacenter.
3. **Vercel runtime logs sao obrigatorios para diagnosticar 504/500** — o handler sempre retorna 200. Sem logs da Vercel, o 504 e invisivel para o codigo.
4. **Endpoint auxiliar degradavel nunca deve retornar 500/504** — um endpoint de fallback deve sempre retornar 200 com `degraded: true`. 504 quebra o contrato de fallback e propaga erro para o waterfall.
5. **Nao misturar instrumentacao com patches funcionais na mesma PR** — os commits de debug poluiram a PR #307 e impediram o merge dos patches uteis.

## Referencias

- [[LICOES-APRENDIDAS-DIAGNOSTICO-PERSISTENTE-2026-05-28]]
- [[FECHAMENTO-TEIA-CNPJ-PR285-2026-05-25]] (exemplo de investigacao concluida)
- `HANDOFF_AI.md`
- `docs/handoffs/2026-05-27-white-screen-fix-pr303.md` (investigacao anterior de tela branca)
