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

## Current implementation branch

**Teia Societaria Tipo 5 implementada na branch `codex/teia-societaria-tipo5` (worktree isolado).**

- Substitui o rumo do mockup SVG por Mermaid LR dinamico dentro do dossie, preservando o markdown textual como fallback.
- QSA passa pelo pipeline CNPJ (`lib/cnpjLookup.ts` -> `api/cnpj.ts` -> `services/brasilApiService.ts`) com socios, qualificacao, documento publico mascarado, fonte e confianca.
- `features/dossier/SocietaryMap.tsx` injeta o mapa em secoes de Teia/Poder Societario e faz drill-down quando o operador troca o socio selecionado.
- `api/socio-search.ts` executa busca/scraping apenas server-side, rejeita homonimos, preserva Scheffer Colombia S.A.S. quando ha contexto do grupo e evidencia internacional, e grava cache persistente de 7 dias em `extract_cache`.
- Cache de producao exige `SUPABASE_SERVICE_ROLE_KEY`; chave anon/publica nao e aceita nesse endpoint. Sem service role/cache gravavel, a busca degrada e nao executa scraping.
- O grafo exige `rootContext` com `rootCompanyName` ou `rootCnpj` compativel com a empresa raiz; `confidence: strong` sozinho nao conecta empresa.

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

1. Finalizar/mergear `codex/teia-societaria-tipo5`.
2. Configurar no Vercel `SUPABASE_SERVICE_ROLE_KEY` para habilitar o cache persistente do `/api/socio-search`; manter `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` para o app browser.
3. Validar no preview um dossie Scheffer com CNPJ `04.733.767/0001-80`: QSA visivel, drill-down por socio, Scheffer Colombia preservada com fonte, fallback textual mantido.
4. Depois, seguir merges pendentes: `codex/standardize-mermaid-maps`, PR `#270` e PR `#266`, conforme prioridade do owner.
