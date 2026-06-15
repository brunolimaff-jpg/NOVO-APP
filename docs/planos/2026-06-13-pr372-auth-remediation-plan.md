# Plano de Recuperacao da PR #372 — Supabase Auth

Data: 2026-06-13  
Branch: `feature/supabase-auth`  
PR: `#372`  
Status recomendado: **nao mergear ainda**

## Objetivo

Fechar a PR #372 com uma migracao de autenticacao que realmente proteja e preserve os dados do Scout 360. O plano abaixo cobre bugs, contratos, banco, fluxos de usuario, testes, rastreamento e validacao em preview/producao.

## Resumo Executivo

A PR entrega a base de Supabase Auth, mas ainda nao fecha o contrato de identidade. Hoje o usuario autentica com Supabase, porem o app continua lendo e escrevendo dados pelo `operator_id` salvo no browser. Isso cria risco de dossies invisiveis, identidade fragmentada, bypass por `localStorage` e autorizacao baseada em dado controlado pelo cliente.

Bloqueadores antes de merge:

1. Resolver `auth.uid() -> profiles.operator_id -> user_context -> dossies` como uma cadeia unica.
2. Impedir update direto de `profiles.operator_id` pelo usuario.
3. Corrigir cron da Vercel para aceitar `GET` com `Authorization: Bearer $CRON_SECRET`.
4. Garantir permissao `EXECUTE` da RPC para `service_role`.
5. Corrigir/justificar a migration `_migration_canonical` no contrato de RLS.
6. Remapear ou validar `radar_alerts` e `radar_configs` na consolidacao.
7. Cobrir `AuthGate/AuthModal/AuthContext` com testes.
8. Validar fluxo real em preview com Supabase.

## Evidencia Coletada

- Diff liquido: 22 arquivos, `+1330/-329`.
- Branch/HEAD: `feature/supabase-auth` em `f94ee02e`.
- Working tree local estava sujo antes da auditoria:
  - `.agents/memory/activeContext.md`
  - `.agents/memory/decisions.md`
  - `.agents/memory/progress.md`
  - `CALIBER_LEARNINGS.md`
  - `HANDOFF_AI.md`
  - `.claude/worktrees/`
  - `components/MetricsDashboard.tsx`
- `git diff --check origin/main...HEAD`: sem erro de whitespace.
- Testes locais tentados:
  - `npm run test:contracts`: inconclusivo/travado sem output util.
  - `npx vitest run tests/contracts/supabaseMigrations.contract.test.ts tests/contexts/OperatorContext.test.tsx --reporter=verbose`: inconclusivo/travado ate timeout.
- Fontes externas verificadas:
  - Vercel Cron Jobs: https://vercel.com/docs/cron-jobs
  - Managing Vercel Cron Jobs: https://vercel.com/docs/cron-jobs/manage-cron-jobs

## Achados Bloqueantes

### P0 — Auth nao e autoridade de dados

Arquivos:

- `contexts/OperatorContext.tsx`
- `services/storage/_shared.ts`
- `services/storage/dossiers.ts`
- `supabase/migrations/20260612_auth_profiles.sql`

Problema:

O app autentica via Supabase, mas continua usando `operator_id` de `localStorage` para carregar e salvar dossies. Em novo device, storage limpo ou conta recriada, o `OperatorProvider` gera um novo `operator_id` e salva `user_context` com esse ID, sem buscar `profiles` por `auth.uid()` nem reconciliar por email antes de `getDossiers()`.

Impacto:

- Usuario autenticado pode nao ver dossies antigos.
- Dados ficam fragmentados por novo `operator_id`.
- Autorizacao continua dependente de dado manipulavel no browser.

Correcao esperada:

- No login, resolver `operator_id` pelo servidor:
  - `auth.uid()` busca `profiles`.
  - `profiles.operator_id` vira o unico operador efetivo.
  - `localStorage` passa a ser cache, nunca autoridade.
- Disparar `operator-relinked` quando o `operator_id` efetivo mudar.
- Recarregar dossies apos resolver o operador canonico.
- Nao criar `user_context` com ID local temporario para usuario autenticado.

### P0 — `profiles.operator_id` pode ser alterado pelo proprio usuario

Arquivo:

- `supabase/migrations/20260612_auth_profiles.sql`

Problema:

`GRANT UPDATE ON public.profiles TO authenticated` libera update de todas as colunas, e a policy so verifica `id = auth.uid()`. Isso permite trocar `operator_id`.

Impacto:

Se RLS futura usar `profiles.operator_id`, o usuario pode se auto-vincular a outro operador. Mesmo antes disso, corrompe a fonte canonica.

Correcao esperada:

- Revogar update amplo.
- Permitir update apenas de campos nao sensiveis, como `name`, por RPC ou policy restrita.
- Tornar `operator_id` imutavel para usuarios comuns.

### P0 — Cron da Vercel provavelmente retorna 405

Arquivos:

- `api/cron-email-confirmation.ts`
- `vercel.json`

Problema:

O handler aceita apenas `POST`. A Vercel Cron invoca endpoints por `GET` e envia `Authorization: Bearer $CRON_SECRET` conforme documentacao oficial.

Impacto:

O cron pode estar configurado e mesmo assim nunca limpar contas expiradas.

Correcao esperada:

- Aceitar `GET` no handler do cron.
- Manter validacao de `Authorization`.
- Adicionar teste para:
  - `GET` com bearer valido: `200`.
  - `GET` sem bearer: `401`.
  - metodo invalido se desejado: `405`.

### P0 — RPC do cron pode nao ter `EXECUTE` para `service_role`

Arquivo:

- `supabase/migrations/20260612_cron_cleanup_function.sql`

Problema:

A migration revoga `EXECUTE` de `PUBLIC`, `authenticated` e `anon`, mas nao concede explicitamente `EXECUTE` para `service_role`.

Impacto:

Mesmo corrigindo o metodo HTTP, o cron pode retornar `500` por `permission denied` ao chamar `rpc('get_expired_unconfirmed_users')`.

Correcao esperada:

- Adicionar:
  - `GRANT EXECUTE ON FUNCTION public.get_expired_unconfirmed_users(TIMESTAMPTZ, INT) TO service_role;`
- Validar com:
  - `select has_function_privilege('service_role', 'public.get_expired_unconfirmed_users(timestamptz, integer)', 'execute');`

### P0 — Consolidacao referencia colunas sem migration de schema

Arquivo:

- `supabase/migrations/20260612_consolidate_operators.sql`

Problema:

O script usa `user_context.supabase_auth_id` e `user_context.auth_provider`, mas a busca nas migrations nao encontrou `ALTER TABLE user_context ADD COLUMN` para esses campos.

Impacto:

Em ambiente novo ou replay de migrations, a migration falha. Em producao, pode ter funcionado por alteracao manual, mas a PR nao carrega o contrato completo.

Correcao esperada:

- Criar migration anterior/idempotente adicionando:
  - `supabase_auth_id UUID`
  - `auth_provider TEXT`
- Incluir indexes/constraints se forem parte do contrato.
- Adicionar teste de contrato procurando essas colunas antes de qualquer uso.

### P0 — `_migration_canonical` falha contrato de RLS

Arquivos:

- `supabase/migrations/20260612_consolidate_operators.sql`
- `tests/contracts/supabaseMigrations.contract.test.ts`

Problema:

A migration cria `_migration_canonical` sem RLS e sem `-- RLS exception`. O contrato atual marca isso como falha. Essa falha nao e preexistente; o arquivo e novo.

Impacto:

CI fica `1448/1449`, e o time se acostuma a ignorar falha de contrato exatamente na migration mais sensivel.

Correcao esperada:

Escolher um caminho:

- Adicionar justificativa clara `-- RLS exception` para tabela operacional criada e dropada no mesmo script.
- Ou ajustar o contrato para ignorar tabelas temporarias/operacionais com prefixo `_migration_`, desde que sejam dropadas no mesmo arquivo.

### P1 — Consolidacao conta orfaos que nao remapeia

Arquivo:

- `supabase/migrations/20260612_consolidate_operators.sql`

Problema:

O script remapeia `dossies`, `operator_sessions`, `operator_events`, `extract_cache`, `audit_log`, `feedback_events`, `dossier_accesses` e `shared_dossiers`, mas apenas conta orfaos de `radar_alerts` e `radar_configs` no final. Ele nao remapeia essas tabelas e nao aborta se encontrar orfaos.

Impacto:

Alertas/configuracoes de radar podem ficar presos em `operator_id` deletado.

Correcao esperada:

- Remapear `radar_alerts` e `radar_configs`.
- Transformar verificacao final em gate operacional: se houver orfaos, reportar e falhar a migration/runbook.

### P1 — Banner de migracao nao abre modal

Arquivos:

- `components/MigrationBanner.tsx`
- `components/AuthGate.tsx`
- `hooks/useAuthGate.ts`

Problema:

`MigrationBanner` chama `useAuthGate()` de novo, criando estado isolado do hook usado por `AuthGate`. O botao "Criar minha conta" altera o estado local do banner, nao o estado que controla o modal.

Impacto:

Usuario legado que dispensou o modal pode clicar no banner e nada acontecer.

Correcao esperada:

- Centralizar estado no `AuthGate`.
- Passar `openAuthModal` como prop para `MigrationBanner`.
- Testar que clicar no banner abre `AuthModal`.

### P1 — Deadline pode ser bypassado por `auth_skip_until`

Arquivo:

- `hooks/useAuthGate.ts`

Problema:

O estado `dismissed` confia em `auth_skip_until` do `localStorage` antes de aplicar o deadline. Apos 18/06/2026, um usuario pode manter ou forjar skip futuro.

Impacto:

Obrigatoriedade pos-deadline nao e real no frontend. Com RLS ainda permissiva, o usuario continua acessando via `operator_id` local.

Correcao esperada:

- Se `pastDeadline`, ignorar/remover `auth_skip_until`.
- Apos deadline, nao renderizar `children` sem sessao autenticada.
- Reforcar em RLS, nao apenas UI.

### P1 — Auth novo nao inicializa tracking como o fluxo legado

Arquivos:

- `contexts/OperatorContext.tsx`
- `services/operatorTracking.ts`

Problema:

O fluxo legado chama `registerOperator`/`linkToExistingOperator`, que salva contexto, inicia tracking e dispara eventos. O fluxo de login Supabase apenas sincroniza email/nome e salva `user_context` com `currentOperatorId`.

Impacto:

Sessoes e eventos de `app_opened` podem ficar ausentes ou associados ao operador errado.

Correcao esperada:

- Ao resolver operador canonico por auth, chamar inicializacao de tracking uma vez.
- Evitar evento duplicado em reauth/refresh.
- Testar `app_opened` e `operator_registered`/evento equivalente no fluxo Supabase.

## O Que Nao Fazer

- Nao mergear tratando a falha `1448/1449` como preexistente.
- Nao resolver apenas escondendo modal ou mudando texto de UX.
- Nao usar `operator_id` vindo do browser como autorizacao.
- Nao tornar RLS restritiva antes de resolver relink de dossies por email.
- Nao rodar script destrutivo de consolidacao sem snapshot, contagem pre/post e rollback.
- Nao misturar `components/MetricsDashboard.tsx` ou `.claude/worktrees/` nesta PR.

## Plano de Execucao

### Fase 0 — Congelar escopo e proteger working tree

Arquivos/acoes:

- Confirmar diff liquido da PR contra `origin/main`.
- Separar WIP local:
  - `components/MetricsDashboard.tsx`
  - `.claude/worktrees/`
  - alteracoes de memoria/handoff se nao forem parte do fix.

Comandos:

```bash
git status --short --branch
git diff --stat origin/main...HEAD
git diff --name-status origin/main...HEAD
```

Saida esperada:

- PR focada em auth/migration.
- Nenhum WIP de metricas entra no patch de recuperacao.

### Fase 1 — Corrigir contrato de identidade

Arquivos provaveis:

- `contexts/OperatorContext.tsx`
- `contexts/AuthContext.tsx`
- `services/storage/userContext.ts`
- `services/storage/_shared.ts`
- `hooks/useSessionStorage.ts`
- `supabase/migrations/20260612_auth_profiles.sql`

Implementacao:

1. Criar helper para resolver operador autenticado:
   - Entrada: `auth.uid()`, `auth.email`, `metadata.name`.
   - Saida: `operatorId`, `name`, `email`.
2. Buscar `profiles` pelo user autenticado.
3. Se `profiles.operator_id` existir, usar esse ID como fonte canonica.
4. Se houver email antigo em `user_context` com outro `operator_id`, relinkar por fluxo controlado:
   - preferencialmente server-side/RPC;
   - registrar auditoria;
   - atualizar `profiles.operator_id` apenas por service-role/RPC.
5. Atualizar localStorage depois da resolucao, nao antes.
6. Disparar `operator-relinked` quando o ID efetivo mudar.
7. Recarregar dossies apos relink.

Critérios de aceite:

- Login em storage limpo com email existente carrega dossies antigos.
- Login nao cria novo `user_context` duplicado para mesmo email.
- O app nao consulta dossies antes de resolver operador autenticado.

### Fase 2 — Travar RLS e mutabilidade de `profiles`

Arquivos provaveis:

- `supabase/migrations/20260612_auth_profiles.sql`
- nova migration se necessario.

Implementacao:

1. Revogar `UPDATE` amplo em `profiles`.
2. Permitir update apenas de `name` ou campos seguros.
3. Bloquear update direto de `operator_id`.
4. Planejar policy futura das tabelas sensiveis:
   - `operator_id = (select operator_id from profiles where id = auth.uid())`
5. Enquanto RLS completa nao entra, documentar explicitamente o periodo hibrido e riscos.

Critérios de aceite:

- Usuario autenticado nao consegue alterar `profiles.operator_id`.
- Usuario A nao consegue acessar dados de B manipulando localStorage/payload.

### Fase 3 — Corrigir cron e RPC

Arquivos provaveis:

- `api/cron-email-confirmation.ts`
- `supabase/migrations/20260612_cron_cleanup_function.sql`
- testes de API/contrato.

Implementacao:

1. Aceitar `GET` no handler.
2. Manter bearer `CRON_SECRET`.
3. Adicionar `GRANT EXECUTE` para `service_role`.
4. Revisar criterio de expiracao:
   - hoje mede `last_sign_in_at IS NULL`, nao confirmacao de email.
   - decidir se o comportamento desejado e "nunca logou em 48h" ou "nao confirmou email".
5. Retornar JSON com contagem e erros sem expor PII desnecessaria.

Critérios de aceite:

- `GET` com bearer valido retorna `200`.
- `GET` sem bearer retorna `401`.
- RPC executa com service role.
- Logs de cron mostram execucao real no preview/producao.

### Fase 4 — Corrigir migration de consolidacao

Arquivos provaveis:

- `supabase/migrations/20260612_consolidate_operators.sql`
- nova migration de schema para `user_context`.
- `tests/contracts/supabaseMigrations.contract.test.ts`

Implementacao:

1. Adicionar schema idempotente para `supabase_auth_id` e `auth_provider`.
2. Documentar excecao RLS para `_migration_canonical` ou ajustar contrato.
3. Remapear `radar_alerts` e `radar_configs`.
4. Adicionar verificacao que falha se sobrarem orfaos.
5. Criar runbook de migration com:
   - snapshot antes;
   - contagens pre/post;
   - query de orfaos;
   - rollback/restore esperado.

Critérios de aceite:

- Replay de migrations em ambiente limpo nao falha por coluna ausente.
- `npm run test:contracts` passa.
- Query de orfaos retorna zero para tabelas cobertas.

### Fase 5 — Corrigir AuthGate, banner e deadline

Arquivos provaveis:

- `hooks/useAuthGate.ts`
- `components/AuthGate.tsx`
- `components/MigrationBanner.tsx`
- `components/AuthModal.tsx`

Implementacao:

1. Passar `openAuthModal` do `AuthGate` para `MigrationBanner`.
2. Se `pastDeadline`, ignorar `auth_skip_until`.
3. Apos deadline, nao renderizar `children` para usuario guest.
4. Definir fallback claro quando Supabase estiver indisponivel:
   - ambiente local/dev: mensagem de configuracao;
   - producao: erro controlado, nao loop silencioso.
5. Revisar copy de signup existente para reduzir enumeracao de conta se necessario.

Critérios de aceite:

- Botao do banner abre modal.
- `auth_skip_until` futuro nao bypassa deadline.
- App nao fica bloqueado sem feedback se Supabase estiver indisponivel.

### Fase 6 — Testes e contratos novos

Adicionar testes:

1. `AuthGate`
   - guest novo sem email: modal obrigatorio.
   - usuario legado antes do deadline: pode pular.
   - usuario legado apos deadline: nao pode pular.
   - skip futuro apos deadline e ignorado.
   - banner abre modal.
2. `AuthModal`
   - signup sucesso com sessao fecha via auth state.
   - signup que exige confirmacao mostra mensagem correta.
   - signin erro nao fecha modal.
3. `OperatorContext + Auth`
   - authUser em storage limpo resolve operador canonico.
   - authUser com email existente nao cria operador duplicado.
   - relink dispara `operator-relinked`.
   - tracking inicia uma vez.
4. Contratos SQL
   - `profiles.operator_id` imutavel para `authenticated`.
   - `get_expired_unconfirmed_users` executavel por `service_role`.
   - migrations criam colunas usadas.
   - consolidacao nao deixa orfaos.
5. API cron
   - `GET` com bearer valido.
   - `GET` sem bearer.
   - erro RPC controlado.

Comandos locais:

```bash
npm run typecheck
npm run test:contracts
npm run test -- tests/contexts/OperatorContext.test.tsx
npm run test
npm run build
```

Comandos E2E locais:

```bash
npm run test:e2e:blank
npm run test:e2e:loading
```

Comandos preview:

```bash
BASE_URL=<preview> npm run test:e2e:blank
BASE_URL=<preview> npm run test:e2e:loading
curl -i "$PREVIEW/api/cron-email-confirmation" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Observacao: se preview estiver protegido, usar bypass secret conforme padrao do repo.

### Fase 7 — Validacao real em Supabase/Vercel

Validar manualmente ou via script:

1. Usuario novo
   - cria conta;
   - faz login;
   - cria dossie;
   - dossie aparece apos reload.
2. Usuario legado antes do deadline
   - pode entrar como guest;
   - banner aparece;
   - banner abre modal;
   - cria senha;
   - dossies antigos continuam visiveis.
3. Usuario legado apos deadline
   - nao acessa app sem login;
   - login carrega dossies antigos.
4. Storage limpo / novo dispositivo
   - login com email existente;
   - `getDossiers()` retorna historico antigo.
5. Conta recriada
   - mesmo email;
   - operador/dossies sao relinkados ou fluxo bloqueia com instrucao segura.
6. Cron
   - execucao Vercel retorna 200;
   - RPC executa;
   - logs nao mostram 405/500.
7. RLS
   - usuario A nao acessa dados de B manipulando `operator_id`.

## Matriz de Risco e Teste

| Risco                                  | Severidade | Teste minimo                          |
| -------------------------------------- | ---------- | ------------------------------------- |
| Dossies invisiveis em novo device      | P0         | E2E Supabase real login storage limpo |
| `operator_id` manipulado no browser    | P0         | Contrato RLS negativo                 |
| `profiles.operator_id` mutavel         | P0         | SQL/REST update deve falhar           |
| Cron 405                               | P0         | Handler GET com bearer                |
| RPC sem execute                        | P0         | `has_function_privilege`              |
| Migration usa coluna inexistente       | P0         | Replay/contrato de schema             |
| `_migration_canonical` quebra contrato | P0         | `npm run test:contracts`              |
| Banner nao abre modal                  | P1         | RTL click banner -> modal             |
| Deadline bypassavel                    | P1         | Clock pos-18/06 + skip futuro         |
| Tracking ausente no auth novo          | P1         | mock de `initSessionTracking`         |
| Radar orfao apos consolidacao          | P1         | fixture SQL com radar                 |

## Criterios Para Liberar Merge

Merge so deve ser considerado quando:

- Todos os P0 estiverem corrigidos ou formalmente removidos do escopo com decisao documentada.
- `npm run typecheck` passar.
- `npm run test:contracts` passar sem falha ignorada.
- Testes novos de AuthGate/AuthModal/OperatorContext passarem.
- `npm run build` passar.
- E2E local de blank/loading passar.
- Preview validar:
  - fluxo auth legado;
  - fluxo auth novo;
  - dossies apos login em storage limpo;
  - cron com `GET`;
  - ausencia de 405/500 no cron.
- Query de orfaos retornar zero ou ter runbook de correcao aprovado.

## Ordem Recomendada de PRs

Se a PR #372 ficar grande demais, quebrar em PRs menores nesta ordem:

1. **PR A — Fix cron + contracts**
   - Corrige metodo `GET`, grant RPC, contrato `_migration_canonical`.
2. **PR B — Auth identity contract**
   - Resolve `auth.uid -> operator_id`, bloqueia update de `profiles.operator_id`.
3. **PR C — Data migration hardening**
   - Colunas ausentes, radar remap, orfaos, runbook.
4. **PR D — UX deadline + tests**
   - Banner, deadline, AuthGate/AuthModal tests.

Se mantiver PR unica, aplicar a mesma ordem de commits.

## Pendencias de Decisao

1. `profiles.operator_id` deve reaproveitar o operador legado por email ou sempre criar um novo e relinkar dossies?
2. O cron deve apagar contas "sem confirmacao de email" ou "sem primeiro login em 48h"?
3. Apos 18/06/2026, usuarios existentes sem senha ficam bloqueados imediatamente ou existe fluxo de recuperacao assistida?
4. RLS restritiva entra nesta PR ou fica em PR posterior com feature flag/data de corte?
5. `radar_alerts` e `radar_configs` devem ser preservados historicamente ou podem ser resetados em relink?

Defaults recomendados:

- Reaproveitar operador legado por email quando houver evidencia forte de ownership.
- Trocar cron para "sem primeiro login em 48h" apenas se essa for a regra de negocio documentada; caso contrario, renomear funcao/copy.
- Nao bloquear usuario legado sem fluxo de recuperacao.
- Preparar RLS restritiva nesta PR, mas ativar enforcement apos validacao de relink.
- Preservar radar ao relinkar operador.

## Proxima Acao

Antes de implementar, responder as pendencias de decisao acima ou aceitar os defaults recomendados. Depois disso, comecar pela Fase 1 se o objetivo for seguranca de dados, ou pela Fase 3 se o objetivo for desbloquear um fix pequeno e rapido para cron/CI.
