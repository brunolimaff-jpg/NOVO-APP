# decisions.md — NOVO-APP

## Decisoes Ativas

### DI-2026-06-13-07: Identidade autenticada nao fica no localStorage proprio

- **Decisao:** `scout360:operator_id`, `scout360:operator_name` e `scout360:operator_email` nao devem armazenar dados derivados de Supabase Auth. A sessao autenticada fica no storage do Supabase Auth.
- **Contexto:** CodeQL marcou clear-text storage porque o fluxo autenticado gravava email/nome/operator_id apos `signInWithPassword`.
- **Impacto:** `OperatorContext` remove as chaves proprias ao resolver auth; preview validado com essas chaves `null` apos login/reload.
- **Referencia:** commit `2fd6f3f8`, `contexts/OperatorContext.tsx`

### DI-2026-06-13-06: RLS authenticated minima para user_context e radar

- **Decisao:** `user_context` permite SELECT do proprio `operator_id` ou legado pelo proprio email, mas INSERT/UPDATE apenas quando `profiles.operator_id` corresponde. `radar_alerts` e `radar_configs` seguem o mesmo vinculo por `profiles.operator_id`.
- **Contexto:** Preview autenticado falhava com `new row violates row-level security policy for table "user_context"` e ruido de radar. Isso quebrava a persistencia esperada do usuario autenticado.
- **Impacto:** Migration `auth_storage_rls_policies` aplicada no Supabase remoto. `link_legacy_operator` agora e aguardado antes de salvar o contexto legado.
- **Referencia:** commit `c86fd0dd`, `supabase/migrations/20260613180243_auth_storage_rls_policies.sql`

### DI-2026-06-13-01: Contrato de identidade auth.uid como autoridade unica

- **Decisao:** `auth.uid()` e a autoridade unica de identidade. `profiles.operator_id` e o vinculo com dados de negocio. `resolveOperatorFromAuth()` busca profiles pelo auth.uid(), com fallback para user_context por email. localStorage vira cache, nunca autoridade.
- **Contexto:** O app autenticava via Supabase mas usava operator_id do localStorage como fonte principal, criando risco de dossies invisiveis e bypass de autorizacao.
- **Impacto:** OperatorContext refeito para usar cadeia de identidade. Relink legado passa pela RPC e so e usado apos confirmacao do banco.
- **Referencia:** commits `a953da97`, `c86fd0dd`, `contexts/OperatorContext.tsx`

### DI-2026-06-13-02: profiles.operator_id imutavel com RPC controlado

- **Decisao:** `profiles.operator_id` nao pode ser atualizado diretamente. REVOKE UPDATE on profiles + GRANT UPDATE(name) apenas em auth.users. RPC `link_legacy_operator` com SECURITY DEFINER e verificacao anti-IDOR (auth.uid() match + email ownership).
- **Contexto:** operator_id mutavel permitia que qualquer funcao alterasse o vinculo de identidade, arriscando acesso cruzado a dossies.
- **Impacto:** Migration `20260613_lock_profiles_operator_id.sql`, RPC documentado.
- **Referencia:** `supabase/migrations/20260613_lock_profiles_operator_id.sql`

### DI-2026-06-13-03: Cron Vercel Hobby limitado a 1x/dia

- **Decisao:** Schedule ajustado de `0 */6 * * *` (4x/dia) para `0 0 * * *` (1x/dia) por limite do Vercel Hobby. Handler aceita GET (nao apenas POST) e CRON_SECRET como env var.
- **Contexto:** Vercel Hobby nao suporta schedules mais frequentes que 1x/dia. O handler anterior so aceitava POST e nao tinha CRON_SECRET.
- **Impacto:** Contas nao confirmadas podem levar ate 24h para ser removidas.
- **Referencia:** `api/cron-email-confirmation.ts`

### DI-2026-06-13-04: Schema user_context com colunas de auth

- **Decisao:** Migration idempotente adiciona `supabase_auth_id UUID` e `auth_provider TEXT` com indice em user_context. ALTER TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
- **Contexto:** user_context nao tinha como rastrear qual auth.uid ou provider originou cada registro, dificultando diagnostico de fragmentacao.
- **Impacto:** migration `20260613_user_context_schema.sql` aplicada em producao.

### DI-2026-06-13-05: Radar resetavel no relink de operador

- **Decisao:** Por decisao do Bruno, radar_alerts e radar_configs podem ser resetados quando um operador legado e relinkado a uma nova conta Supabase.
- **Contexto:** Ao relinkar um operador, os dados de radar (alertas e configuracoes) do operator_id anterior podem ficar orfaos. Bruno autorizou o reset.
- **Impacto:** Radar nao bloqueia o fluxo principal. PR #372 adicionou policies authenticated por `profiles.operator_id` e reduziu falhas de persistencia de radar para aviso.

### DI-2026-06-12-05: Dossies devem ser buscados por email alem de operator_id

- **Decisao:** O servico de acesso a dossies (`dossierAccessService.ts`) deve buscar registros por **email** como fallback quando o operator_id atual nao retorna resultados. O trigger `on_auth_user_created` na tabela profiles gera um NOVO UUID `operator_id` mesmo quando o email do usuario e o mesmo de uma conta anterior deletada.
- **Contexto:** Bruno deletou sua conta Supabase Auth e recriou com o mesmo email. Dossies antigos (ex: Scheffer) ficaram vinculados ao operator_id ANTIGO. O historico aparece vazio na nova conta.
- **Motivo:** Impedir perda de historico quando usuarios recriam contas Supabase. O script de consolidacao (430 -> 125 IDs) ja reduziu a fragmentacao historica, mas nao previne nova fragmentacao apos delecao de conta.
- **Impacto:** Alteracao em `dossierAccessService.ts` para incluir `user_email` na query ou fazer fallback por email quando `operator_id` nao encontrar resultados.
- **Referencia:** HANDOFF_AI.md — secao "ACHADO IMPORTANTE: operator_id fragmentado apos delecao de conta Supabase"

### DI-2026-06-12-01: Modelo hibrido de auth Supabase

- **Decisao:** Auto-confirm ativo para cadastro, cron remove contas nao confirmadas apos 48h. Novos usuarios obrigatorio, existentes opcional ate 18/06/2026.
- **Motivo:** Equilibrio entre experiencia do usuario e seguranca. Confirmacao estrita bloquearia usuarios de teste; auto-confirm total nao validaria emails.
- **Impacto:** Deadline 18/06 para usuarios existentes cadastrarem senha. Perda de operadores antigos que nao cadastrarem — mitigado por banner + prazo.
- **Referencia:** Bruno Vault/30-DECISOES/DECISAO-AUTH-HIBRIDO-SUPABASE-2026-06-12.md

### DI-2026-06-12-02: PR unificada (Sprints 1+2+3+4)

- **Decisao:** Sprints consolidadas em PR #372 unificada, nao PRs separadas por sprint.
- **Motivo:** Code review revelou que PRs separadas criavam dependencia (base = outro PR) e revisao duplicada. PR unificada permitiu revisao completa em unico ciclo.
- **Impacto:** 14 arquivos, 1 revisao, 1 ciclo de CI.

### DI-2026-06-12-03: error.code para identificar erros Supabase Auth

- **Decisao:** Usar `error.code` (ex: `user_already_exists`) em vez de `error.message` para identificar erros de autenticacao.
- **Motivo:** error.message pode mudar entre versoes do Supabase. error.code e estavel e documentado.
- **Impacto:** Tratamento de erros mais robusto.

### DI-2026-06-12-04: AuthGate com graceful fallback sem provider

- **Decisao:** AuthGate nao trava se AuthContext nao estiver disponivel. OperatorProvider usa `operatorContext.ok || userContext` como fallback.
- **Motivo:** Evitar tela branca se AuthContext falhar. Manter compatibilidade com fluxos que ainda nao tem auth.
- **Impacto:** AuthGate renderiza children se `AuthContext` estiver ausente.

### DI-2026-06-10-01: Dupla fonte de verdade eliminada

- **Decisao:** `hasLargeBotMessage` removido de `MessageTimeline.tsx`. `useStaticTimelineFallback` e a unica fonte de verdade para decisao de fallback.

### DI-2026-06-10-02: Limite de props ajustado (14 complexos, 8 enxutos)

### DI-2026-06-10-03: Watchdogs consolidados em hook unico

### DI-2026-06-10-04: Copiloto referencia wiki e ai-context ao iniciar sessao

### DI-2026-06-08-01: Nao alterar fluxo visual sem reincidencia

### DI-2026-06-08-02: Manter recovery enquanto causa raiz nao for comprovada

### DI-2026-06-08-03: Wiki e indice arquitetural, nao fonte superior ao codigo

### DI-2026-06-08-04: Auditorias devem conter autorrefutacao obrigatoria

### DI-2026-06-08-05: Documentacao e runtime em PRs distintas

## Decisoes Historicas

### 2026-06-08 — Handoff final precisa apontar repo + Bruno Vault (APLICADO na PR #346)

### 2026-06-11 — Tracking de Operador: canonical operatorId, findUserByEmail, PII-safe logging
