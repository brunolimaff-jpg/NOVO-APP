# Dívida de storage — IndexedDB vs Supabase

**Data:** 2026-07-02  
**PR em foco:** [#409](https://github.com/brunolimaff-jpg/NOVO-APP/pull/409)  
**Audiência:** gestão + engenharia  
**Relacionado:** [BUG-7 cadeia causal](./bug-7-freeze-render-cadeia-causal.md)

---

## Resumo para gestão

A persistência do app **não é homogênea**: dossiês e sessões já vivem no **Supabase**, mas o cache de extração de documentos (`extractCache`) ainda usa **IndexedDB como primário** com espelho opcional no Supabase. Isso é **dívida técnica consciente** — não é a causa do freeze do dossiê (BUG-7) e **não deve ser mexido na PR #409**.

---

## Estado real por superfície

| Dado | Primário | Secundário / espelho | Observação |
| ---- | -------- | -------------------- | ---------- |
| **Dossiês / sessões** | Supabase (`dossies`) | — | `getDossiers` / `saveDossier` só escrevem no Supabase |
| **Sessões em memória** | React state (`useSessionStorage`) | Debounce → `saveAllDossiers` | Carrega do Supabase na inicialização |
| **Extract cache** | IndexedDB (`idb-keyval`) | Supabase (`extract_cache`) em paralelo | IDB é fonte de leitura; Supabase é best-effort |
| **Radar / favoritos / user context** | Supabase (módulos dedicados) | Variável por módulo | Ver `services/storage/*` |
| **Flags operador** | `localStorage` (`scout360:*`) | — | `operator_id`, `operator_email` |

### Fluxo simplificado

```
Dossiê final  →  saveDossier()  →  Supabase dossies
Sessão React  →  useSessionStorage debounce  →  saveAllDossiers()  →  Supabase
Extract PDF   →  saveExtractCache()  →  IDB (sempre) + Supabase extract_cache (se online)
```

---

## Por que não migrou totalmente

A migração IndexedDB → Supabase (spec `docs/superpowers/specs/2026-05-22-supabase-migration-design.md`) concluiu **dossiês e sessões** para Supabase como source of truth. O `extractCache` ficou em IDB por decisão pragmática:

1. **Bug histórico de cache local** — em produção, houve perda/confusão quando o cache de extração dependia só de sync remoto; manter IDB como leitura instantânea evita reprocessar PDFs grandes no collector.
2. **Collector, não render** — o cache serve o pipeline de coleta (extração de documentos durante o waterfall), não o paint final do dossiê.
3. **Espelho Supabase já existe** — `saveExtractCache` faz upsert em `extract_cache` quando online; IDB continua como fallback offline.
4. **Escopo da PR #409** — foco em Pipeline V2 e freeze UX; misturar migração de storage aumenta risco sem benefício para o gate Scheffer.

*(Contexto de memória Bruno: incidente anterior com cache local inconsistente entre abas/dispositivos.)*

---

## NÃO causa BUG-7

| Pergunta | Resposta |
| -------- | -------- |
| O freeze vem do IndexedDB? | **Não** — BUG-7 é render síncrono pós-waterfall (`updateSessionById` + `useMemo` parse + `setIsLoading(false)`) |
| `extractCache` roda no render final? | **Não** — roda no **collector** durante módulos do waterfall, antes do `post-finalize-markdown` |
| Migrar IDB resolveria o freeze? | **Não** — caminho crítico do BUG-7 é React parse + persistência **depois** do estado com 40k chars |
| Debounce `useSessionStorage` contribui? | **Sim, indiretamente** — segunda via de save com 1s de atraso; mas a causa raiz é ordem save vs render (ver doc BUG-7) |

---

## Decisão: não mexer na PR #409

| Ação | Status |
| ---- | ------ |
| Fix BUG-7 (ordem save/render, parsing adiado) | ✅ Escopo da PR #409 |
| Migrar `extractCache` para Supabase-only | ❌ **Fora de escopo** |
| Unificar debounce `useSessionStorage` com `saveDossier` | ⚠️ Parte do fix v2 modificado (ponto único de save) — sem mudar IDB |
| Limpar legado `scout360_sessions_v1` localStorage | ✅ Já feito em `useSessionStorage` (one-time cleanup) |

---

## Ação futura — Fase 8 / Fase 9

| Fase | Escopo sugerido | Prioridade |
| ---- | --------------- | ---------- |
| **Fase 8** | Timeouts de módulo (Teia 86s, Operação 74s), qualidade de fontes (BUG-4, BUG-5) | Média |
| **Fase 9** | Consolidar storage: `extractCache` Supabase-first com IDB só offline; auditar radar/favoritos; remover duplicidade de persistência | Baixa |
| **Fase 9+** | Lock IndexedDB entre abas (waterfall em aberta) — ver `AGENTS.md` | Baixa |

Critério para retomar migração IDB: sprint dedicada com testes de collector + validação offline, **após** BUG-7 fechado e PR #409 mergeada.

---

## Tabela de arquivos

| Arquivo | Responsabilidade | Storage usado |
| ------- | ---------------- | ------------- |
| `services/storage/extractCache.ts` | Cache de resultados de extração de documentos (PDF, etc.) | **IDB primário** + mirror `extract_cache` Supabase |
| `services/storage/dossiers.ts` | CRUD de dossiês/sessões completas | **Supabase** `dossies` apenas |
| `utils/localStorage.ts` | Wrapper seguro para flags simples (`operator_email`, etc.) | **localStorage** `scout360:*` |
| `hooks/useSessionStorage.ts` | Estado React das sessões; load inicial; debounce persist | Load/save via **Supabase**; cleanup legado localStorage |

### Barrel e módulos adjacentes

- `services/storage/index.ts` — agrega `dossiers`, `extractCache`, `radar`, `favorites`, `userContext`, etc.
- `docs/wiki/pages/15-configurar-supabase.md` — tabela de degradação por superfície
- `docs/superpowers/specs/2026-05-22-supabase-migration-design.md` — spec original da migração

---

## Referências

- [BUG-7 — cadeia causal](./bug-7-freeze-render-cadeia-causal.md)
- [Relatório rastreio Scheffer PR #409](./relatorio-rastreio-scheffer-pr409-2026-07-02.md)
- [Índice de bugs](./README.md)

---

*Documento gerado em 2026-07-02 — modo documentação, sem alteração de código.*
