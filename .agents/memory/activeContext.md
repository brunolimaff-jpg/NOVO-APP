# Active Context

Last updated: 2026-05-23

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

**Migracao de persistencia IDB/localStorage para Supabase CONCLUIDA na branch `codex/standardize-mermaid-maps`. Branch estendeu com melhorias adicionais de UX, consistencia e feedback conectado ao Supabase.**

- Arquitetura offline-first: Supabase (fonte de verdade) + IndexedDB (cache offline) + sync queue bidirecional.
- 20 commits totais na branch antes do feedback Supabase (12 migracao + 8 pos-migracao).
- HEAD antes do feedback Supabase: `d22fa0c` — feat: beautiful manual sync button + sync-complete event to reload dossiers.
- 873+ testes verdes, typecheck limpo.
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
- Cadastro restrito a `@senior.com.br` (commit `5a2b35e`): nome completo (2+ palavras, 2+ caracteres cada) obrigatorio
- Email recovery (commit `c880566`): vincula dispositivo novo a `operator_id` existente quando email ja cadastrado
- Botao de sync manual (commit `d22fa0c`): pill no header com feedback (+N sent, downarrowN received), dispara evento `scout:sync-complete`

### Schema Supabase:
- URL: `https://vmqfcaoirjcfucvlnpig.supabase.co`
- 9 tabelas: `user_context`, `dossies`, `radar_alerts`, `radar_configs`, `extract_cache`, `audit_log`, `favorites`, `shared_dossiers`, `feedback_events`
- RLS habilitado em todas, politicas por `operator_id IS NOT NULL`
- `feedback_events` registra feedback por mensagem/secao/erro com `reason`, `scope`, `metadata`, `session_id`, `message_id` e `operator_id`.
- 11 indexes para performance de consulta
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

1. Mergear `codex/standardize-mermaid-maps` em `main` (20 commits, migracao + 8 melhorias pos-migracao).
2. Configurar env vars no Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
3. Testar fluxo completo: registrar com `@senior.com.br` (nome completo obrigatorio) -> criar dossie -> sync manual -> email recovery em segundo dispositivo.
4. Mergear PR `#270` (auditoria multi-fase) e PR `#266` (UX Redesign Phase 1) em `main`.
5. Quando houver demanda, planejar Fase 3 (Sprints 13-16: Modularizacao de Prompts).
