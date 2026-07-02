# Bugs — índice de relatórios

Relatórios de rastreio, regressões e achados de validação manual destinados a gestão e engenharia.

## Convenção de nomes

```
relatorio-<contexto>-<referencia>-<AAAA-MM-DD>.md
bug-<id>-<tema>-<descricao-curta>.md
```

| Segmento    | Exemplo                          | Significado                          |
| ----------- | -------------------------------- | ------------------------------------ |
| `contexto`  | `rastreio-scheffer`, `freeze-ux` | Tema ou fluxo validado               |
| `referencia`| `pr409`, `pipeline-v2`           | PR, sprint ou feature                |
| `data`      | `2026-07-02`                     | Data do run principal documentado    |

## Relatórios

| Data       | Arquivo | PR / branch | Veredito |
| ---------- | ------- | ----------- | -------- |
| 2026-07-02 | [relatorio-rastreio-scheffer-pr409-2026-07-02.md](./relatorio-rastreio-scheffer-pr409-2026-07-02.md) | [#409](https://github.com/brunolimaff-jpg/NOVO-APP/pull/409) · `feat/pipeline-v2-pr409-prompts-v2-output-mode` | **Não mergear** — freeze UX bloqueante |
| 2026-07-02 | [relatorio-validacao-scheffer-pr409-2026-07-02.md](../relatorio-validacao-scheffer-pr409-2026-07-02.md) | #409 | Validação manual sessão `90e3fe7a` (complementar) |

## Documentação técnica (bugs)

| Data       | Arquivo | Tema |
| ---------- | ------- | ---- |
| 2026-07-02 | [bug-7-freeze-render-cadeia-causal.md](./bug-7-freeze-render-cadeia-causal.md) | BUG-7 — cadeia causal, fix v1 insuficiente, fix v2 modificado |
| 2026-07-02 | [storage-debt-indexeddb-supabase.md](./storage-debt-indexeddb-supabase.md) | Dívida IDB/Supabase — fora de escopo PR #409 |

## Relação com outros docs

- Validação report-only (sem foco em bug catalog): `docs/relatorio-validacao-*.md`
- Contrato loading/overlay: `docs/ai-context/refactor/loading-panel-contract.md`
- Handoff canônico de implementação: `HANDOFF_AI.md`

## Status dos bugs catalogados (PR #409)

| ID     | Título resumido                         | Severidade | Bloqueia merge? | Doc |
| ------ | --------------------------------------- | ---------- | --------------- | --- |
| BUG-7  | Freeze no render do dossiê final        | 🔴 Crítico | **Sim**         | [cadeia causal](./bug-7-freeze-render-cadeia-causal.md) |
| BUG-4  | Gemini Search timeout → fallback DDG    | 🔴 Alto    | Não (qualidade) | relatório rastreio |
| BUG-5  | BrasilAPI 403 + CNPJ.ws 429 na teia     | 🔴 Alto    | Não (qualidade) | relatório rastreio |
| BUG-1  | Timer `0s` durante step                 | 🟡 Baixo   | Não             | relatório rastreio |
| BUG-2  | Steps 4–7 sem tempo na checklist UI     | 🟡 Baixo   | Não             | relatório rastreio |
| BUG-3  | Step "Refinando sinais" duplicado       | 🟡 Baixo   | Não             | relatório rastreio |
| BUG-6  | `url.parse()` deprecation (CVE risk)    | 🟡 Médio   | Não             | relatório rastreio |

### BUG-7 — nota de fix

O commit `b9c0e04e` (`await saveDossier` + `startTransition` em `SectionalBotMessage`) foi **insuficiente** para o caso Scheffer (~40k chars, teia 14 CNPJs). A cadeia causal completa, por que o fix v1 falhou e o **fix v2 modificado** recomendado estão em [bug-7-freeze-render-cadeia-causal.md](./bug-7-freeze-render-cadeia-causal.md).

## Dívida técnica relacionada

| Tema | Severidade | Bloqueia PR #409? | Doc |
| ---- | ---------- | ----------------- | --- |
| Storage híbrido IDB + Supabase (`extractCache`) | 🟡 Média | **Não** — não causa BUG-7 | [storage-debt-indexeddb-supabase.md](./storage-debt-indexeddb-supabase.md) |

Detalhes completos no relatório de rastreio de 2026-07-02.
