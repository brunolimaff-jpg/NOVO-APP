# Spec: Simplificação Supabase — De Offline-First para Acesso Direto

**Data:** 2026-05-29 | **Revisão:** 2026-05-29 (auditoria reviewer + ideator)
**Projeto:** Senior Scout 360 (NOVO-APP)
**Status:** Aprovado pelo Bruno, auditado por 2 agentes

**Motivação:** A arquitetura offline-first (IDB + sync queue + retry) foi construída para "vendedor em campo sem sinal" — cenário que nunca se materializou. Custo real: 1709 linhas de código + 1211 de testes + 89 commits desde abril. Features simples como share link levaram 16 commits para estabilizar.

---

## 1. Problema

A spec original de 2026-05-22 (`docs/superpowers/specs/2026-05-22-supabase-migration-design.md`) decidiu por offline-first. Complexidade acumulada:

| Sintoma                 | Evidência                                                   |
| ----------------------- | ----------------------------------------------------------- |
| `storage.ts` God Object | 872 linhas (cache + sync + fila + retry + merge + debounce) |
| Bugs de timing          | 409 conflict, race condition, ref stale em hooks            |
| Custo por feature       | 5-10 commits de ajuste na camada de sync                    |
| Debug lento             | Caçar IDB vs Supabase vs estado do sync                     |
| Trabalho abandonado     | 3 stashes em `feat/crm-supabase-migration`                  |

---

## 2. Decisão

**Remover a camada offline-first e acessar Supabase diretamente.**

| O que muda               | Como era                                   | Como fica                                                             |
| ------------------------ | ------------------------------------------ | --------------------------------------------------------------------- |
| Leitura                  | IDB → Supabase em background               | `supabase.from('dossies').select()` direto                            |
| Escrita                  | IDB instantâneo + sync queue → Supabase    | `supabase.from('dossies').upsert()` direto com debounce de 1s no hook |
| Multi-device             | Offline-first com merge de conflito        | Supabase é a fonte única da verdade                                   |
| Auth                     | `operator_id` local (UUID em localStorage) | Supabase Auth (Google OAuth) — Fase 2                                 |
| Share link               | `shared_dossiers` + `api/dossie.ts`        | **Mantido igual — risco zero confirmado**                             |
| Extract cache            | IDB (sync queue)                           | Supabase `extract_cache` como cache primário com TTL de 7 dias        |
| lastScanAt / metaInsight | IDB-only (sem sync)                        | localStorage (valores pequenos, não precisam de Supabase)             |

**O que NÃO muda:**

- Schema Supabase (9 tabelas) permanece igual
- RLS policies permanecem (serão melhoradas na Fase 2 com `auth.uid()`)
- Página pública `/dossie/<token>` (`api/dossie.ts`) — cria próprio client Supabase com service_role, zero dependência do frontend
- `feedbackRemoteStore.ts` e `operatorTracking.ts` — já são diretos no Supabase
- `audit_log` — já é direto, sem IDB

---

## 3. Arquitetura Alvo

### Fase 1 — Simplificar (agora)

```
BROWSER                              SUPABASE
┌──────────────────────────┐         ┌─────────────────────┐
│ hooks/useSessionStorage  │────────▶│ dossies             │
│   + isLoading shimmer    │         │                     │
│   + debounce 1s no save  │         │                     │
│ hooks/useRadar           │────────▶│ radar_alerts        │
│ services/storage.ts      │────────▶│ radar_configs       │
│   ~200 linhas            │         │ extract_cache       │
│   CRUD direto            │         │ audit_log           │
│   sem cache IDB          │         │ feedback_events     │
│   sem sync queue         │         │ favorites           │
│                           │         │ shared_dossiers     │
│ localStorage:             │         │ user_context        │
│   lastScanAt, metaInsight │         └─────────────────────┘
│                           │
│ IDB (mantido só para):    │
│   extract cache TTL 7d    │
└──────────────────────────┘
```

**storage.ts reduzido a:**

- `getDossiers()` → `supabase.from('dossies').select().eq('operator_id')` + loading state
- `saveDossier()` → `supabase.from('dossies').upsert()`
- `deleteDossier()` → soft delete (set `deleted_at`)
- `shareDossier()` / `getSharedDossier()` → mantidos (já são diretos)
- `getFavorites()` / `addFavorite()` / `removeFavorite()` → mantidos (já são diretos)
- `saveUserContext()` / `touchUserContext()` → mantidos (já são diretos)
- `logAudit()` → mantido (já é direto)
- `getExtractCache()` / `saveExtractCache()` → **mantém IDB só para extract** (cache de extração web, TTL 7 dias, consultado em toda interação com documentos)

**Removido completamente:**

- `syncQueue.ts` (149 linhas)
- `mergeChatSessions.ts`
- `waterfallLogger.ts` (80 linhas)
- Debounce/timers de sync (`scheduleDossierSync`, `dossierAutoSyncTimer`, `scheduleBackgroundSync`, `syncAll`, `processSyncQueue`)
- `dossierGenerationActive` / `setDossierGenerationActive` / `canPullDossiersFromRemote`
- Evento `scout:sync-complete`
- `getSyncQueueSize()` / `getSyncQueueItems()` / `resetSyncQueue()`

**Arquivos que precisam de ajuste (além de storage.ts):**

| Arquivo                        | Mudança                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hooks/useSessionStorage.ts`   | Adicionar `isLoading` + shimmer. Remover listener `scout:sync-complete`. Debounce de 1s no efeito `persistSessions`. Remover uso de `mergeChatSessions` |
| `hooks/useRadar.ts`            | `lastScanAt`/`metaInsight` → localStorage                                                                                                               |
| `contexts/OperatorContext.tsx` | Remover 2 chamadas a `scheduleDossierSync`. Substituir por load direto com loading state                                                                |
| `chatStore.tsx`                | Remover `storage.setDossierGenerationActive(loading.isLoading)`                                                                                         |
| `components/SyncIndicator.tsx` | Redesenhar como "status de conexão Supabase" simples (~50 linhas). Sem sync queue, sem eventos                                                          |
| `waterfall-orchestrator.ts`    | Remover import de `waterfallLogger`                                                                                                                     |

### Fase 2 — Auth (depois)

```
BROWSER                              SUPABASE
┌──────────────────────────┐         ┌─────────────────────┐
│ Supabase Auth            │────────▶│ auth.users          │
│   signInWithOAuth(Google)│         │ user_context        │
│                           │         │   (vinculado por    │
│ storage.ts                │         │    supabase_auth_id)│
│   RLS automático via      │────────▶│ dossies             │
│   auth.uid()              │         │   (RLS via uid)     │
└──────────────────────────┘         └─────────────────────┘
```

- Adicionar `@supabase/supabase-js` Auth helpers
- Tela de login com Google OAuth
- Vincular `user_context.supabase_auth_id` ao `auth.uid()`
- Trocar RLS de `operator_id IS NOT NULL` para `auth.uid() = operator_id`
- Remover `operator_id` local (UUID em localStorage)

---

## 4. Migração de Dados IDB → Supabase

**Problema:** usuários têm dados no IDB que podem estar parcialmente syncados com Supabase. Se `getDossiers()` passar a ler só do Supabase sem antes migrar, dados locais não-syncados são perdidos.

**Script de migração (executa 1x na primeira carga pós-deploy):**

```
1. Ler todas as sessions do IDB
2. Para cada session, fazer upsert no Supabase (onConflict: id)
3. Salvar flag 'scout360:migration_v2_complete' no localStorage
4. Só então ativar leitura do Supabase como fonte primária
5. Manter IDB como backup readonly por 1 sprint (flag 'scout360:migration_v2_backup')
```

**Rollback:** se migração falhar, flag não é setada e app continua lendo do IDB (comportamento atual).

---

## 5. Riscos (atualizado após auditoria)

| #   | Risco                                                         | Prob. | Impacto | Mitigação                                                                                                                        |
| --- | ------------------------------------------------------------- | ----- | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Perda de dados se migração IDB → Supabase falhar              | Média | Alto    | Script de migração com flag. IDB mantido como backup readonly por 1 sprint                                                       |
| 2   | Cada `setSessions` vira upsert remoto (dezenas por waterfall) | Alta  | Alto    | Debounce de 1s no efeito `persistSessions` do hook. Salvar apenas a session modificada, não todas                                |
| 3   | Primeiro load mostra tela vazia (50-200ms sem IDB)            | Alta  | Médio   | Adicionar `isLoading` + shimmer no `useSessionStorage`                                                                           |
| 4   | Extract cache sem IDB perde eficiência                        | Média | Médio   | **Manter IDB só para extract cache** (TTL 7 dias, consultado em toda interação com docs). Supabase `extract_cache` como fallback |
| 5   | `lastScanAt`/`metaInsight` sem destino                        | Alta  | Baixo   | Migrar para localStorage (valores pequenos, não precisam de Supabase)                                                            |
| 6   | `SyncIndicator` vira componente morto                         | Alta  | Médio   | Redesenhar como "status de conexão" simples (~2h)                                                                                |
| 7   | UX pós-registro/vinculação sem pull explícito                 | Média | Médio   | Após `registerOperator`, load direto do Supabase com loading state. Se falhar, mostrar erro com retry                            |
| 8   | Sem internet = app não funciona                               | Baixa | Baixo   | Cenário não existe hoje. PWA resolve depois se necessário                                                                        |
| 9   | Latência perceptível sem cache IDB                            | Baixa | Baixo   | Supabase já era consultado em paralelo no modelo atual. Leitura direta é mais rápida que stale-while-revalidate                  |
| 10  | Quebra de funcionalidade existente                            | Média | Médio   | Migrar hook por hook, testando cada um. Share link não muda nada                                                                 |

---

## 6. O que NÃO está no escopo

- PWA / Service Worker
- Offline mode
- Sincronização entre dispositivos com merge de conflito
- Multi-tenant / organizações
- Supabase Storage (anexos)
- Realtime subscriptions
- Cache IDB para dados de negócio (mantido APENAS para extract cache)

---

## 7. Estimativa (revisada após auditoria)

| Fase             | Tarefa                                                       | Esforço     |
| ---------------- | ------------------------------------------------------------ | ----------- |
| 1                | Script de migração IDB → Supabase                            | 1.5h        |
| 1                | Simplificar storage.ts (872 → ~200 linhas)                   | 3h          |
| 1                | Remover syncQueue.ts e waterfallLogger.ts                    | 0.5h        |
| 1                | Atualizar useSessionStorage (+ isLoading shimmer + debounce) | 2h          |
| 1                | Atualizar useRadar (lastScanAt/metaInsight → localStorage)   | 1h          |
| 1                | Atualizar OperatorContext (remover scheduleDossierSync)      | 0.5h        |
| 1                | Atualizar chatStore (remover setDossierGenerationActive)     | 0.25h       |
| 1                | Redesenhar SyncIndicator → status conexão simples            | 2h          |
| 1                | Atualizar testes (reescrever ~783 linhas)                    | 3h          |
| 1                | Teste manual + preview + validação migração                  | 1h          |
| **Fase 1 total** |                                                              | **~14.75h** |
| 2                | Configurar Supabase Auth no projeto                          | 0.5h        |
| 2                | Tela de login Google                                         | 1.5h        |
| 2                | Vincular user_context ao auth.uid()                          | 1h          |
| 2                | Atualizar RLS policies                                       | 0.5h        |
| 2                | Testes + preview                                             | 1h          |
| **Fase 2 total** |                                                              | **~4.5h**   |
| **Total**        |                                                              | **~19.25h** |

Comparação: a spec original de maio estimou 11h só para o offline-first e nunca foi concluída (3 stashes abandonados). Aqui são ~19h para **duas fases completas** que entregam mais valor (Auth real, zero bugs de sync) com 1/4 da complexidade de manutenção.

---

## 8. Sucesso

- `storage.ts` < 250 linhas
- `syncQueue.ts` removido
- `waterfallLogger.ts` removido
- `mergeChatSessions.ts` removido
- `SyncIndicator` redesenhado como status de conexão simples
- Nenhum bug de sync (409, race condition, timing)
- Share link continua funcionando sem alterações
- Dados IDB migrados com sucesso (flag `migration_v2_complete`)
- Fase 2: login Google funcional, RLS por `auth.uid()`

---

## 9. Decisões Pendentes da Auditoria

| #   | Decisão                                   | Recomendação dos agentes                                                                          | Status      |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------- |
| 1   | Manter IDB só para extract cache?         | Sim — cache de extração web é consultado frequentemente e TTL de 7 dias justifica cache local     | ✅ Decidido |
| 2   | Debounce vs salvar só session modificada? | Ambos — debounce 1s + upsert só da session que mudou                                              | ✅ Decidido |
| 3   | `waterfallLogger` remover ou manter?      | Remover — diagnóstico não-crítico. Substituir por scoutDiag direto se necessário                  | ✅ Decidido |
| 4   | Auth na Fase 2 ou incorporar na Fase 1?   | Fase 2 separada — reduz risco, permite validar Fase 1 primeiro                                    | ✅ Decidido |
| 5   | O que fazer se migração IDB falhar?       | App continua lendo IDB (comportamento atual). Flag não é setada. Tentar novamente no próximo load | ✅ Decidido |

---

## Apêndice A — Auditoria

Esta spec foi auditada por 2 agentes independentes em 2026-05-29:

- **reviewer**: confirmou que share link não é afetado, encontrou 5 riscos não mapeados, identificou 10 funções com dependências escondidas, ajustou estimativa Fase 1 para 10-12h (depois refinada para 14.75h com os itens adicionais)
- **ideator**: aprovou decisão arquitetural com 90% de confiança, validou que Supabase direto prepara melhor para multi-device futuro que offline-first atual, confirmou que ordem das fases está correta, recomendou manter IDB para extract cache

Riscos e estimativas foram atualizados com base nos feedbacks.
