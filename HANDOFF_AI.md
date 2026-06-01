# Handoff — [NOVO-APP] — 31/05/2026 — Vercel Features Exploradas

## Objetivo da Proxima Sessao

- **Sincronizar `main` local com origin** (PR #317 squash-merged em `7773173`, local ainda em `0b38ebe`)
- **Limpar branches residuais**: `refactor/remove-idb-storage` (local), `fix/remove-web-search-fallback` (mergeada)
- **Verificar P0 withTimeout** (`api/gemini.ts:416, :491`) — AbortSignal nao propaga para `chat.sendMessage()`
- **Decidir sobre CRM migration stashed** (`feat/crm-supabase-migration`) — retomar ou descartar
- **Verificar `waterfallLogger.ts`** — ainda existe no repo, confirmar se deletar agora

## Estado Atual

- **Branch atual:** `main` (local: `424faab5`, origin: `7773173` — main local desatualizado)
- **Origin/main:** `7773173` (refactor: simplifica storage — remove IDB offline)
- **PRs abertas:** Nenhuma
- **Working tree:** arquivos modificados (handoff, memory) + untracked (.superpowers, docs/superpowers/plans)
- **Testes:** 1249 passando, 0 falhas, 144 arquivos

## O que foi feito nesta sessao

### Audit Vercel Features — Exploracao Completa

| Feature       | Relevancia | Hobby?          | Status                   |
| ------------- | ---------- | --------------- | ------------------------ |
| AI Gateway    | 9/10       | Nao (Pro)       | Plano escrito, arquivado |
| Cron Jobs     | 8/10       | 2 crons, diario | Plano escrito, arquivado |
| Queues        | 7/10       | Nao (Pro)       | Plano escrito, arquivado |
| Firewall/WAF  | 7/10       | Parcial         | Nao priorizado           |
| Edge Config   | 6/10       | Nao (Pro)       | Nao priorizado           |
| Fluid Compute | 5/10       | Ja usa          | Nada a fazer             |
| Blob          | 4/10       | Sim             | Nao priorizado           |
| Sandbox       | 2/10       | Nao             | Nao priorizado           |

### Decisao: Plano Cancelado

- **Plano:** `docs/superpowers/plans/2026-05-31-vercel-ai-gateway-cron-queues.md` (commit `424faab5`)
- **Motivo:** Hobby plan limita funcoes (12), AI Gateway (Pro-only), Queues (Pro-only)
- **Analise:** 16 funcoes excederia limite Hobby de 12. Upgrade para Pro (US$ 20/mes) necessario para AI Gateway + Queues + mais funcoes.
- **Conclusao:** Esforco de refatoracao (6 arquivos) nao justifica ganhos parciais no Hobby.

## Riscos Tecnicos Residuais

1. **P0 withTimeout (api/gemini.ts:416, :491):** AbortController cria signal mas nao propaga para `chat.sendMessage()`. Documentado, nao corrigido.
2. **Branch `refactor/remove-idb-storage` local ainda existe**: pode ser deletada apos sync de main.
3. **Branch `fix/remove-web-search-fallback` residual**: mergeada, branch local ainda existe.
4. **CRM migration stashed**: precisa decidir (retomar ou descartar).
5. **`waterfallLogger.ts` nao removido**: existe no repo, confirmar se deletar.
6. **Supabase extract_cache TTL**: implementado no client sem cleanup automatico no banco.

## Links

- **Plano Vercel:** `docs/superpowers/plans/2026-05-31-vercel-ai-gateway-cron-queues.md`
- **Commit:** `424faab5`
- **PR #317 merge:** `7773173`
