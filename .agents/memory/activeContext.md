# Active Context

Last updated: 2026-06-14 — sessao finalizada, PR #372 + #373 merged e deployed

## Estado Atual

- **Branch local:** `feature/supabase-auth` (pode ser deletada)
- **Remote main:** merged com PR #372 (Supabase Auth) + PR #373 (comex/cache/tests)
- **Vercel production:** `READY` — 12 lambdas (slot comex liberado)
- **Supabase project:** `vmqfcaoirjcfucvlnpig`
- **Deadline:** 18/06/2026 — usuarios existentes precisam cadastrar senha

## O que foi entregue

- Supabase Auth integrado ao app, com cadeia `auth.uid() -> profiles.operator_id`.
- Identidade autenticada nao fica mais no localStorage proprio.
- Code Review com 5 agentes, 3 bugs corrigidos no PR #372, preview validado.
- PR #373: comex removida (libera slot Vercel), cache CNPJ com TTL 30s, codigo orfao limpo, CI verde com restoreMocks globais.
- 5 ciclos de review (Gemini + CodeRabbit) encontraram 4 bugs no cache (promises rejeitadas, AbortSignal, timer stale, mock leakage).

## Decisoes ativas

- **CNPJ cache:** `Map<string, Promise>`, TTL 30s, sem signal do caller, identity check no delete. Promises rejeitadas removidas imediatamente.
- **vitest.config.ts:** `restoreMocks: true` + `clearMocks: true` globais para prevenir mock leakage.
- Worktree so para features novas; correcoes em PR aberto na branch atual.
- Demais decisoes ativas no `decisions.md` (DI-2026-06-13-01 a DI-2026-06-12-05).

## Arquivos criados nesta sessao

- `api/cnpj-cache.ts` — cache CNPJ compartilhado

## Arquivos removidos nesta sessao

- `api/comex.ts` — fake morta

## Arquivos alterados nesta sessao

| Arquivo                                      | Mudanca                           |
| -------------------------------------------- | --------------------------------- |
| `contexts/AuthContext.tsx`                   | signOut try/catch/finally         |
| `contexts/OperatorContext.tsx`               | AbortController na IIFE async     |
| `features/dossier/waterfall-orchestrator.ts` | fetchPromise.catch()              |
| `services/brasilApiService.ts`               | cache CNPJ refatorado             |
| `localDevApiProxy.ts`                        | comex endpoint removido           |
| `vitest.config.ts`                           | restoreMocks + clearMocks globais |

## Atencao local

- Local `main` esta atrasado em relacao ao remote. Rodar `git checkout main && git pull`.
- Branch `feature/supabase-auth` pode ser deletada.
- `components/MetricsDashboard.tsx` e `.claude/worktrees/` sao locais e fora de escopo.

## Proximo passo

Sincronizar repositorio local com remote (`git checkout main && git pull origin main`).
