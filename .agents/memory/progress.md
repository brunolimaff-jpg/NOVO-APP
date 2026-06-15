# Progress

Last updated: 2026-06-15 — sessao de 3 bugs de historico: localStorage, race condition, RLS

## Timeline

### 2026-06-15 (Sessao de encerramento — 3 bugs de historico apos login)

- **Bug 1 — operator_id nao restaurado no localStorage:** `storageRemove()` limpava `scout360:operator_id` no inicio do fluxo. `resolveOperatorFromAuth()` encontrava o operator_id correto mas nunca escrevia de volta. `getOperatorId()` so lia do localStorage. Sidebar vazia.
  - Commit: `4ca4339a` — fix: restaura operator_id no localStorage apos resolucao de auth
  - Commit: `c32db0d9` — fix: atualiza teste OperatorContext para refletir restauracao
- **Bug 2 — Race condition operator-relinked:** `window.dispatchEvent(new CustomEvent('operator-relinked'))` no useEffect pai. React executa effects de pais antes de filhos. Evento sincrono perdido.
  - Commit: `9ba0a2cc` — fix: race condition com setTimeout(0)
- **Bug 3 — RLS bloqueando authenticated:** Policy `operator_own_dossies` com `TO anon`. Supabase usa role `authenticated` para usuarios logados. Query retornava `[]` com `content-length: 2`.
  - Commit: `fe6c6f9b` — fix: RLS dossies adiciona role authenticated
  - Migration: `supabase/migrations/20260615_fix_dossies_rls_authenticated.sql`
- **Diagnostico comprovado:** Ananda (18 dossies, 80 eventos) e Wuender (47 dossies, 34 empresas) — dados intactos no banco, RLS filtrava.
- **5 novas licoes** no CALIBER_LEARNINGS: RLS authenticated, content-length debug, setTimeout(0) dispatch, getOperatorId localStorage, cadeia de 3 bugs mascarados.
- **3 novas decisoes registradas:**
  - DI-2026-06-15-05: operator-relinked com setTimeout(0)
  - DI-2026-06-15-06: RLS dossies com anon + authenticated
  - DI-2026-06-15-07: debug sidebar vazia pela network layer
