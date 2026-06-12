# Handoff — Supabase Auth Migration (PR #372)

- **PR #372** (branch `feature/supabase-auth`): Migracao de auth local (localStorage) para Supabase Auth
- **Status:** PR aberta, nao mergeada — code review P0/P1 corrigido (commit `07aa30de`)
- **CI:** Typecheck OK, Build OK, Tests 1447/1448 (1 falha pre-existente `CnpjGraphResponds`)
- **Preview:** https://scoutagro-o8hbhgepk-brunolimaff-3629s-projects.vercel.app
- **Deadline:** 18/06/2026 — usuarios existentes precisam cadastrar senha

---

## Entrada rapida para proximo agente

1. Este arquivo (resumo executivo)
2. `.agents/memory/activeContext.md` — estado atual do projeto
3. `.agents/memory/decisions.md` — decisoes arquiteturais ativas
4. `Bruno Vault/30-DECISOES/DECISAO-AUTH-HIBRIDO-SUPABASE-2026-06-12.md` — decisao principal de auth
5. `Bruno Vault/30-DECISOES/DECISAO-CANONICAL-OPERATORID-FINDUSERBYEMAIL-2026-06-11.md` — canonical operatorId
6. `Bruno Vault/20-SESSOES/2026-06/2026-06-12T18-00-00-auth-migration-sprint4-pr372.md` — sessao completa de encerramento

---

## O que foi feito — 4 Sprints

### Sprint 0: Diagnostico + Prototipo
- Auditoria: **430 operator_ids** unicos, **117 emails** unicos, **292 IDs fragmentados** para Bruno
- Prototipo funcional validado pelo Bruno em worktree `prototipo-auth`

### Sprint 1: Infraestrutura Supabase Auth
- Tabela `profiles`, trigger `on_auth_user_created`, RLS
- `AuthContext` (signUp, signIn, signOut, resetPassword)
- `AuthModal`, `AuthGate`, `MigrationBanner`, `useAuthGate`
- `OperatorProvider` adaptado para `AuthContext`
- PR #367 (base: `main`) — 894 linhas adicionadas, 179 removidas

### Sprint 2: Validacao Email + Cron
- Regex de email, cron de confirmacao 48h (`api/cron-email-confirmation.ts`)
- `vercel.json` com schedule a cada 6h + 30s maxDuration
- PR #368 (base: `worktree-sprint1-auth-infra`) — 205 linhas +, 72 -

### Sprint 3: Migracao de Usuarios
- Script reescrito **3x** (`execute_sql` stateless — temp table nao sobrevive)
- Tabela REAL `_migration_canonical` + safety net (passo 5)
- **user_context: 430 -> 125** (-71%), **Bruno: 292 IDs -> 1 canonical**
- PR #369 (base: `main`) — `supabase/migrations/20260612_consolidate_operators.sql`

### Sprint 4: Testes + Graceful Fallback
- **8 -> 1 falha** de teste (`AuthGate` com `expect.assertions` corrigido)
- AuthGate com graceful fallback sem `AuthContext`
- `operatorContext.ok || userContext` no OperatorProvider

### PR #372 Unificado
- Merge de Sprints 1+2+3+4 em PR unica
- **14 arquivos**, 1261 linhas +, 248 -
- Code review Gemini + CodeRabbit: P0/P1 corrigidos

---

## Decisoes do Bruno

| Decisao | Opcao Escolhida | Alternativa |
|---------|----------------|-------------|
| Confirmacao de email | Hibrida: auto-confirm ativo, cron remove em 48h | Estrita (bloqueia) ou auto-confirm total (sem validacao) |
| Obrigatoriedade | Obrigatorio para novos, opcional para existentes ate 18/06 | Obrigatorio para todos (quebra) ou opcional indefinido |
| Deadline | **18/06/2026** | Sem prazo |
| Senha Bruno | `Scout360@2026!` | — |
| Estrategia de PR | PR unificada (Sprints 1+2+3+4) | PRs separadas por sprint |

---

## Bugs corrigidos na code review

1. **P0:** `getSession` sem catch no `AuthContext` — adicionado try/catch
2. **P0:** `App.tsx` inline `finally` sem `currentUser` — adicionado `userRef.current`
3. **P1:** `error.code` vs `error.message` para "User already registered" — usar `error.code`
4. **P1:** Codigo morto — tratativas de erro `err` sem uso removidas
5. **Minor:** `useEffect` sem `currentUser` na dependencia — adicionado

---

## Arquivos alterados (PR #372)

| Arquivo | Mudanca | Status |
|---------|---------|--------|
| `contexts/AuthContext.tsx` | AuthProvider completo | CRIADO |
| `components/AuthModal.tsx` | Modal login/cadastro/recuperacao | CRIADO |
| `components/AuthGate.tsx` | Gate de autenticacao | CRIADO |
| `components/MigrationBanner.tsx` | Banner prazo 18/06 | CRIADO |
| `hooks/useAuthGate.ts` | Logica de gating | CRIADO |
| `api/cron-email-confirmation.ts` | Cron remocao 48h | CRIADO |
| `supabase/migrations/20260612_auth_profiles.sql` | Profiles + trigger + RLS | CRIADO |
| `supabase/migrations/20260612_consolidate_operators.sql` | Consolidacao 430->125 | CRIADO |
| `supabase/migrations/20260612_cron_cleanup_function.sql` | Funcao cleanup | CRIADO |
| `contexts/OperatorContext.tsx` | Adaptado + graceful fallback | MODIFICADO |
| `App.tsx` | Integracao AuthGate/AuthModal | MODIFICADO |
| `index.tsx` | Provider wrapping | MODIFICADO |
| `services/dossierAccessService.ts` | Auth uid no acesso | MODIFICADO |
| `vercel.json` | Cron schedule + maxDuration | MODIFICADO |

---

## Riscos residuais

| Risco | Severidade | Proximo Passo |
|-------|-----------|---------------|
| Deadline 18/06 sem comunicacao usuarios existentes | Media | Sprint 5: comunicar, UX pos-login |
| 1 teste falhando (CnpjGraphResponds) | Baixa | Pre-existente, nao relacionado a auth |
| RLS ainda nao restritiva | Media | Apos 18/06, tornar RLS obrigatoria |
| Operadores antigos perdem acesso apos 18/06 | Media | Migration campaign |
| **Dossiês não vinculam ao novo operator_id ao recriar conta** | **Alta** | Se usuario deleta conta Supabase e recria, ganha novo `auth.uid` → novo `operator_id`. Dossiês antigos ficam órfãos. Sprint 5 precisa de: (a) enrolar email→operator_id no user_context ao recriar conta; (b) script de re-link de dossiês por email |

---

## Prompt de retomada

```text
▎ Retome a sessao no NOVO-APP a partir de feature/supabase-auth.
▎ PR #372 aberta: migracao de auth local para Supabase Auth completa.
▎ 4 Sprints entregues: infra, UI+cron, migracao 430->125, testes.
▎ Code review P0/P1 corrigido (commit 07aa30de).
▎ CI: Typecheck/Build OK, Tests 1447/1448.
▎ Deadline 18/06/2026.
▎ Decisao: modelo hibrido auto-confirm + cron 48h.
▎ Proximo passo: Sprint 5 — feedback de dossie salvo e UX pos-login.
▎ Ver Bruno Vault/30-DECISOES/DECISAO-AUTH-HIBRIDO-SUPABASE-2026-06-12.md
```
