---
grok_wiki: true
page_id: "page-configurar-supabase"
title: "Configurar Supabase"
description: "Variáveis, degradação quando indisponível, tabelas críticas, migração IDB para Supabase, tracking de operador e persistência de dossiês."
repository: "local/NOVO-APP"
branch: "default"
generated_at: "2026-06-08T23:39:43.629Z"
source_files:
  - "lib/supabaseClient.ts"
  - "services/storage/index.ts"
  - "services/storage/dossiers.ts"
  - "services/storage/userContext.ts"
  - "services/operatorTracking.ts"
  - "lib/migration/idbToSupabase.ts"
  - "docs/superpowers/schema-supabase.sql"
  - "tests/contracts/supabaseMigrations.contract.test.ts"
---

No NOVO-APP, Supabase é a camada remota de persistência e telemetria: o frontend cria um cliente opcional com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`, enquanto rotas serverless usam `SUPABASE_SERVICE_ROLE_KEY` para diagnósticos persistentes e cache server-side.

## Variáveis de ambiente

| Variável | Escopo | Uso real | Quando ausente |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | Frontend e fallback server-side | URL do projeto Supabase para `@supabase/supabase-js` e alguns utilitários server-side | `supabase` vira `null`; storage remoto fica desativado |
| `VITE_SUPABASE_ANON_KEY` | Frontend público | Chave `anon` usada pelo cliente Vite | Leituras retornam vazio/null; escritas viram no-op |
| `SUPABASE_URL` | Serverless | URL preferencial em diagnósticos e cache persistente server-side | Cai para `VITE_SUPABASE_URL` quando disponível |
| `SUPABASE_SERVICE_ROLE_KEY` | Serverless privado | Escrita em `scout_diagnostics` e cache persistente de `/api/socio-search` | Diagnósticos retornam `degraded: true`; cache persistente fica indisponível |
| `VITE_SCOUT_DIAGNOSTICS_ENABLED` | Frontend público | Ativa flush de `scoutDiag` para `/api/gemini` com `action: recordDiagnostics` | Diagnóstico persistente só ativa via `localStorage.SCOUT_DIAG_ENABLED = '1'` |

<Warning>
`VITE_*` entra no bundle do navegador. Nunca coloque `SUPABASE_SERVICE_ROLE_KEY` com prefixo `VITE_`; ela deve existir só em ambiente serverless ou local server-side.
</Warning>

## Configuração mínima

<Steps>
<Step title="Criar o projeto e aplicar o schema">
Execute o DDL base em `docs/superpowers/schema-supabase.sql` no SQL Editor do Supabase. Depois aplique as migrations em `supabase/migrations/`, especialmente `20260528_operator_tracking.sql` e `20260603_blank_panel_observability.sql`.
</Step>

<Step title="Preencher variáveis locais">
Use `.env.example` como referência para as variáveis públicas:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Para testar diagnósticos e cache server-side localmente, também exponha `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no ambiente do processo serverless.
</Step>

<Step title="Validar contratos">
Rode os contratos antes de considerar a configuração pronta:

```bash
npm run test:contracts
npm test -- tests/services/storage.test.ts tests/lib/migration/idbToSupabase.test.ts tests/services/operatorTracking.test.ts tests/utils/serverDiagnostics.test.ts
```
</Step>
</Steps>

## Tabelas críticas

| Tabela | Responsável no app | Conteúdo |
| --- | --- | --- |
| `user_context` | `storage.saveUserContext`, `findUserByEmail`, `OperatorProvider` | `operator_id`, nome, email, `email_normalized`, `last_seen` |
| `dossies` | `storage.getDossiers`, `saveDossier`, `saveAllDossiers`, `deleteDossier` | Sessões `ChatSession` completas em `content`, metadados de empresa, score e soft delete |
| `extract_cache` | `storage.saveExtractCache`, `/api/socio-search` cache persistente | Resultado de extrações/cache com `expires_at` |
| `radar_alerts` | `storage.getRadarAlerts`, `saveRadarAlerts` | Último pacote de alertas por operador |
| `radar_configs` | `storage.getRadarConfig`, `saveRadarConfig` | Configuração do Radar por operador |
| `audit_log` | `storage.logAudit` | Ações auditáveis como favoritos |
| `favorites` | `storage.getFavorites`, `addFavorite`, `removeFavorite` | Empresas favoritas por `operator_id` e `cnpj` |
| `shared_dossiers` | `shareDossier`, `getSharedDossier` | Links temporários com `access_token` e expiração de 7 dias |
| `feedback_events` | `sendFeedbackRemote` | Feedback de mensagem, seção ou erro |
| `operator_sessions` | `startOperatorSession`, `touchOperatorSession`, `endOperatorSession` | Sessão de uso do operador com ambiente, versão e duração |
| `operator_events` | `trackOperatorEvent` | Eventos de funil e uso do dossiê |
| `scout_diagnostics` | `/api/gemini` com `recordDiagnostics` | Diagnósticos persistentes de UI, loading e painel branco |

<Note>
O DDL base documenta 9 tabelas e as migrations adicionam tracking e índices de observabilidade. A persistência atual de dossiês envia também `operator_email`; confirme que o schema do projeto possui essa coluna ou adicione uma migration antes de validar escrita real em `dossies`.
</Note>

## Degradação quando Supabase está indisponível

O cliente Supabase é criado somente quando `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` existem. Caso contrário, `isSupabaseAvailable()` retorna `false`.

| Superfície | Comportamento degradado |
| --- | --- |
| `getDossiers()` | Retorna `[]` |
| `getDossier(id)` | Retorna `null` |
| `saveDossier()` / `saveAllDossiers()` | Não faz escrita remota quando não há cliente ou `operator_id` |
| `deleteDossier(id)` | Não faz soft delete remoto quando não há cliente ou `operator_id` |
| `saveUserContext()` / `touchUserContext()` | Retorna sem bloquear a UX |
| `getExtractCache()` | Continua lendo do IndexedDB local |
| `saveExtractCache()` | Sempre salva no IndexedDB; tenta Supabase em paralelo quando disponível |
| `recordDiagnostics` | Retorna HTTP 200 com `inserted: 0`, `degraded: true` quando falta configuração server-side |
| `/api/socio-search` | Ignora `anon` para cache server-side; usa busca viva e cache volátil em memória |

## Persistência de dossiês

`storage` é um barrel compatível que agrega módulos em `services/storage/*`. O contrato público continua sendo importar de `services/storage`.

A tabela `dossies` recebe um upsert com os campos principais do `ChatSession`:

```ts
{
  id,
  operator_id,
  operator_email,
  title,
  empresa_alvo,
  cnpj,
  modo_principal,
  score_oportunidade,
  resumo_dossie,
  content,
  updated_at
}
```

Antes de salvar ou retornar sessões, o storage remove estado transitório de UI:

| Campo transitório | Tratamento |
| --- | --- |
| `loadingVariant` | Removido do payload persistido |
| `isSourcesOpen` | Removido do payload persistido |
| `isThinking` | Forçado para `false` |

Leituras sempre filtram por `operator_id` e `deleted_at IS NULL`. A listagem ordena por `updated_at` decrescente. A deleção é soft delete, atualizando `deleted_at` e `updated_at`.

## Migração de IndexedDB para Supabase

A migração roda dentro de `useSessionStorage()` antes da leitura remota de sessões.

| Item | Valor |
| --- | --- |
| Função | `runIdbToSupabaseMigration` |
| Flag local | `scout360:migration_v2_complete` |
| Chave IDB legada | `scout360_sessions_v2` |
| Upsert usado | `storage.saveDossier(session)` |
| Fallback localStorage | `scout360_sessions_v1` |

Regras de execução:

1. Se a flag já é `true`, retorna `0`.
2. Se Supabase não está disponível, retorna `0` sem setar flag.
3. Se não há `operator_id`, retorna `0`.
4. Se a leitura do IDB falha, retorna `0` sem setar flag.
5. Se não há sessões no IDB, seta a flag e retorna `0`.
6. Se alguma sessão falha no upsert, lança erro e não seta a flag.
7. Se todas migram, seta a flag e retorna a quantidade migrada.

## Operador e tracking

O operador é local-first. `OperatorProvider` mantém estes valores em `localStorage` com prefixo `scout360:`:

| Chave | Conteúdo |
| --- | --- |
| `scout360:operator_id` | ID local no formato `op_...` |
| `scout360:operator_name` | Nome informado no onboarding |
| `scout360:operator_email` | Email informado no onboarding |

Ao registrar ou vincular operador existente, o app chama `storage.saveUserContext()` e inicia tracking com `initSessionTracking()`. O tracking usa `sessionStorage` para `scout:current_session_id` e `scout:session_started_at`, faz upsert em `operator_sessions` e grava eventos em `operator_events`.

Eventos aceitos no tipo atual:

```text
app_opened
operator_registered
dossier_started
dossier_completed
dossier_failed
dossier_opened
dossier_shared
dossier_reopened
dossier_override
```

`trackOperatorEvent()` é fire-and-forget: falha remota não deve bloquear a UX. A sanitização de `metadata` remove chaves com `prompt`, `gemini`, `response`, `token`, `secret`, `key` ou `password`, descarta `null`/`undefined` e trunca strings longas.

## Diagnósticos e cache server-side

`scoutDiag` envia lotes para `/api/gemini` com `action: recordDiagnostics`. Esse caminho retorna antes da validação Gemini, corta o lote em `MAX_EVENTS_PER_BATCH` e grava em `scout_diagnostics` via REST do Supabase com `SUPABASE_SERVICE_ROLE_KEY`.

O sanitizador server-side preserva métricas seguras como comprimentos, contadores, dimensões, visibilidade e `data-testid`; remove texto, conteúdo, resposta, prompt, body e credenciais.

O cache persistente de `/api/socio-search` também usa REST server-side em `extract_cache`:

| Campo | Valor |
| --- | --- |
| `id` | `socio-search:${cacheKey}` |
| `operator_id` | `server:socio-search` |
| `expires_at` | TTL de 7 dias |
| `result` | Resposta estruturada sem `trace` |

Se `SUPABASE_SERVICE_ROLE_KEY` não existe, a busca societária não usa a chave `anon` pública para cache server-side. Ela segue com busca viva e cache em memória quando possível.

## RLS e limites atuais

O schema base habilita RLS nas tabelas principais e usa políticas para role `anon` baseadas em `operator_id IS NOT NULL`. A migration de tracking habilita RLS em `operator_sessions` e `operator_events`, com `INSERT`/`UPDATE` mínimos para sessões e `INSERT` para eventos.

<Warning>
O isolamento atual depende do `operator_id` local enviado pelo cliente; não é um isolamento forte por `auth.uid()`. O próprio plano de evolução do repo prevê usar `user_context.supabase_auth_id` como ponte para uma futura troca de RLS baseada em Supabase Auth.
</Warning>

## Verificação operacional

Use estes comandos conforme o tipo de mudança:

```bash
npm run typecheck
npm test
npm run test:contracts
npm run test:e2e:smoke
```

Para mudanças específicas em Supabase, priorize:

```bash
npm test -- tests/services/storage.test.ts
npm test -- tests/lib/migration/idbToSupabase.test.ts
npm test -- tests/services/operatorTracking.test.ts
npm test -- tests/utils/serverDiagnostics.test.ts
npm run test:contracts
```

Sinais esperados em runtime:

| Sinal | Interpretação |
| --- | --- |
| Console com `[Supabase] Variaveis de ambiente ausentes` | Storage remoto desativado no frontend |
| UI ainda abre com Supabase bloqueado | Degradação esperada |
| `recordDiagnostics` retorna `degraded: true` | Falta `SUPABASE_SERVICE_ROLE_KEY` ou URL server-side |
| POST em `/rest/v1/dossies` durante investigação | Persistência remota tentou salvar dossiê |
| GET em `/rest/v1/dossies` após reload | Histórico tentou carregar do Supabase |
| `scout_diag_fallback*` no localStorage | Flush de diagnóstico falhou e foi retido para evidência local |

## Related pages

<CardGroup>
<Card title="Instalação" href="/installation">Variáveis locais, boot do Vite e pré-requisitos do checkout.</Card>
<Card title="Sessões e mensagens" href="/sessoes-mensagens">Modelo de sessão, persistência, seleção e fallback local.</Card>
<Card title="Observabilidade e diagnósticos" href="/observabilidade">Sentry, `scoutDiag`, Supabase diagnostics e eventos de operador.</Card>
<Card title="Referência de configuração" href="/configuracao-reference">Mapa completo de `.env`, defaults, flags e fronteiras frontend/serverless.</Card>
<Card title="Testes e gates" href="/testes-gates">Comandos npm, contratos, E2E críticos e critérios por tipo de mudança.</Card>
</CardGroup>

## Source files

- `lib/supabaseClient.ts`
- `services/storage/index.ts`
- `services/storage/dossiers.ts`
- `services/storage/userContext.ts`
- `services/operatorTracking.ts`
- `lib/migration/idbToSupabase.ts`
- `docs/superpowers/schema-supabase.sql`
- `tests/contracts/supabaseMigrations.contract.test.ts`
