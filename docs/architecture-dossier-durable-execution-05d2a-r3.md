# Lote 05D.2A-R3 — prova PostgreSQL local da identidade do worker

Status: `R3_RESULT=PASS` no cluster PostgreSQL local descartável. O lote foi
autorizado pelo Planner somente para prova local; não cria migration, role,
segredo, cron, endpoint ou worker em Supabase/Vercel.

## Resultado canônico

```text
LOCAL_POSTGRES_VERSION=17.10 (Homebrew)
LOCAL_POSTGRES_REPLAY=PASS (schema mínimo sintético; migrations reais não executadas)
DEDICATED_WORKER_LOGIN_CREATED_LOCAL=PASS
WORKER_ROLE_MEMBERSHIP_ENFORCED=PASS
WORKER_RPC_EXECUTE_MATRIX=PASS
PUBLIC_ANON_AUTHENTICATED_SERVICE_ROLE_DENIED=PASS
NO_DIRECT_TABLE_PRIVILEGES=PASS
SECURITY_DEFINER_CALLER_VALIDATION=PASS
CLAIM_MULTI_CONNECTION_EXCLUSION=PASS
TENANT_DERIVATION_FROM_CLAIM=PASS
CHECKPOINT_ATTEMPT_FENCING=PASS
EXPIRED_LEASE_REDELIVERY=PASS
STALE_WORKER_WRITE_DENIED=PASS
ATOMIC_WORKER_COMPLETION=PASS
ATOMIC_RETRY_IDEMPOTENCY=PASS
ATOMIC_DIVERGENT_PAYLOAD_CONFLICT=PASS
INTERNAL_CORE_NOT_EXECUTABLE=PASS
WORKER_LOGIN_ROTATION_V1_TO_V2=PASS
TRANSACTION_POOLER_COMPATIBILITY_CONTRACT=PASS
SUPAVISOR_REMOTE_CONNECTIVITY=NOT_TESTED
SUPABASE_REMOTE_MUTATION=NONE
VERCEL_PLAN_PROOF=NOT_VERIFIED
CRON_FREQUENCY_ELIGIBILITY=BLOCKED
READY_FOR_05D_2B_IMPLEMENTATION_ADJUDICATION=NO
```

`SECRET_STORAGE_AND_ROTATION_DEFINED=NOT_VERIFIED` é intencional: a rotação
por membership foi provada no banco local, mas armazenamento/rotação de
segredo no ambiente Vercel ainda exige prova externa e não foi inferido.

## O que foi provado

O runner inicializa um cluster novo com PostgreSQL 17.10, autenticação SCRAM e
role administrativa explícita `postgres`. No banco sintético cria:

- role de privilégios `dossier_worker_executor` sem login, superuser,
  bypass-RLS, criação de banco/role ou replicação;
- logins versionados `dossier_worker_v1` e `dossier_worker_v2`, além de sessões
  sem membership, `anon`, `authenticated` e `service_role`;
- tabelas mínimas de runs, checkpoints, resultados e eventos;
- núcleo `SECURITY DEFINER` privado e wrappers `dossier_proof_api` worker-only;
- grants somente de `USAGE` no schema de API e `EXECUTE` nos wrappers; nenhuma
  permissão direta de tabela para o worker.

As funções usam `search_path` qualificado, validam `session_user` pela
membership da role dedicada, derivam `tenant_id`/`owner_id` da linha reclamada
e recusam `auth.uid()`, `service_role`, `anon`, JWT de usuário e autoridade
fornecida pelo caller.

O teste de concorrência usa duas conexões PostgreSQL independentes, com lock
temporal explícito e `FOR UPDATE SKIP LOCKED`: exatamente uma sessão vence o
claim. O restante do fluxo cobre lease expirada, redelivery em novo attempt,
fencing de checkpoint e escrita stale, conclusão atômica, retry idempotente e
conflito explícito para payload divergente. A rotação revoga v1 e mantém v2
funcional.

## Compatibilidade com transaction pooler

As chamadas são autocontidas e independentes. O probe não depende de `SET ROLE`
persistente, tabela temporária, advisory lock de sessão, variável de sessão,
estado mantido na conexão ou prepared statement obrigatório. Isso é uma prova do
contrato SQL local, não uma prova de conectividade Supavisor.

## Como reproduzir

```bash
cd /tmp/novo-app-dossier-flow-05a
bash scripts/proofs/run-dossier-worker-identity-proof.sh
```

O runner deixa um diretório de evidências em `/private/tmp` com:

- `gates.txt`, `manifest.txt`, versão PostgreSQL e hashes dos scripts;
- matriz de roles/grants e `pg_get_functiondef`;
- saídas individuais das sessões concorrentes, stale, denied e rotação;
- timestamps de sobreposição e estado final das tabelas sintéticas.

Execução aceita registrada:

```text
evidence=/private/tmp/novo-app-05d2a-r3-pg.x5Yewb
postgres_version=17.10 (Homebrew)
remote_connections=0 (loopback only)
```

Os hashes dessa execução estão em `input-sha256.txt`; valores de senha do
cluster descartável não fazem parte do pacote canônico.

## Limites e próximo gate

Este resultado não autoriza 05D.2B. Ainda faltam prova direta do plano Vercel
para a mesma equipe, elegibilidade de cron, binding Preview/Produção e desenho
operacional de segredo no ambiente. O próximo passo é adjudicação do Planner
com os gates locais acima; nenhuma migration real deve ser alterada antes da
autorização textual correspondente.
