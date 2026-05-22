# Active Context

Last updated: 2026-05-22

## Current operating context

This repo uses repo-local memory plus canonical handoff docs so sessions can resume on any machine.

Read order:

1. `AGENTS.md`
2. `HANDOFF_AI.md`
3. `.agents/memory/activeContext.md`
4. `.agents/memory/progress.md`
5. `.agents/memory/decisions.md`
6. `docs/ai-context/refactor/02-BOARD.md`
7. `docs/obsidian/00-MASTER.md` for visual navigation only

## Current operating phase

**Migracao de persistencia IDB/localStorage para Supabase CONCLUIDA na branch `codex/standardize-mermaid-maps`.**

- Arquitetura offline-first: Supabase (fonte de verdade) + IndexedDB (cache offline) + sync queue bidirecional.
- 12 commits na branch, 37 novos testes (28 unitarios storage, 5 sync queue, 4 integracao).
- 873 testes verdes, typecheck limpo.
- Lint com `0` erros.

## Current task context

**Migracao Supabase concluida (2026-05-22).**

### Camada de infraestrutura:
- `lib/supabaseClient.ts` — cliente Supabase browser com `createClient`, export default `supabase`, graceful degradation se Supabase indisponivel.
- `services/storage.ts` — interface unificada que hooks/services chamam. Implementa stale-while-revalidate para leituras (IDB primeiro, Supabase em background) e offline-first para escritas (IDB instantaneo, sync em background).

### Fila offline:
- `services/syncQueue.ts` — fila de operacoes pendentes persistida em IDB. Retry com backoff exponencial (3s, 9s, 27s). Dead-letter queue apos falhas consecutivas. Processamento automatico em background e sob demanda.

### Componentes:
- `components/SyncIndicator.tsx` — badge no header mostrando status: online/syncing/offline/error. Tooltip com contagem de operacoes pendentes.

### Migracao de hooks:
- `hooks/useSessionStorage.ts` — substituido `idb-keyval` por `storage.ts`
- `features/radar/useRadar.ts` — substituido `idb-keyval` por `storage.ts`
- `services/extractContentService.ts` — substituido `idb-keyval` por `storage.ts`

### Registro de operador:
- `contexts/OperatorContext.tsx` — adicionado campo `email`, sync com Supabase ao registrar
- `components/GreetingWelcomeScreen.tsx` — input de email com validacao
- `components/ChatInterface.tsx` — callback de email propagado
- `components/chat/MessageTimeline.tsx` — assinatura de callback atualizada
- `components/chat/ChatShell.tsx` — SyncIndicator adicionado no header

### Schema Supabase:
- URL: `https://vmqfcaoirjcfucvlnpig.supabase.co`
- 8 tabelas: `user_context`, `dossies`, `radar_alerts`, `radar_configs`, `extract_cache`, `audit_log`, `favorites`, `shared_dossiers`
- RLS habilitado em todas, politicas por `operator_id IS NOT NULL`
- 8 indexes para performance de consulta
- Grants anon para data API (leitura/escrita)

### Env vars necessarias (Vercel):
- `VITE_SUPABASE_URL=https://vmqfcaoirjcfucvlnpig.supabase.co`
- `VITE_SUPABASE_ANON_KEY=sb_publishable_OXLwGTgGUjFi-gHwRTsoOg_xHoDJHvO`

### Decisoes arquiteturais:
1. Auth postergada: UUID local temporario como `operator_id`
2. Dados migraveis: dossies, radar alerts, radar configs, extract cache, audit log, favorites, shared dossiers
3. Offline-first com sync queue em background
4. Conexao direta Supabase (abordagem A) — sem camada serverless intermediaria

## Workspace note

`CODE.md` e instrucao local para Codex e esta ignorado via `.git/info/exclude`.

## Immediate next step

1. Mergear `codex/standardize-mermaid-maps` em `main`.
2. Configurar env vars no Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
3. Testar fluxo completo: registrar operador -> criar dossie -> verificar dados no dashboard Supabase.
4. Quando houver demanda, planejar Fase 3 (Sprints 13-16: Modularizacao de Prompts).
