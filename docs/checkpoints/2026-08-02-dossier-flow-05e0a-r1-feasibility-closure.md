# Checkpoint 05E.0A-R1 — fechamento de viabilidade

Data: 2026-08-02 10:35 America/Cuiaba
Worktree: `/private/tmp/novo-app-dossier-flow-05a`
Source head: `a65f425b579ae429d9dd3823b0721a1a1d7d52bf`
Escopo autorizado: somente prova local de recovery/persistência e inspeção Vercel read-only.

## Resultado executivo

O lote fechou a lacuna de **contrato de recovery** para adjudicação: estados, fencing,
lease, retries limitados, checkpoints sem duplicação, cancelamento dominante,
reconciliação terminal e matriz de persistência estão modelados e testados. Isso não
é implementação runtime e não prova que o helper canônico atual já possui essas
capacidades.

```text
DECISION=CONTINUE_05E_TO_IMPLEMENTATION_ADJUDICATION
PLANNER_FINAL=APPROVED_WITH_RESERVATIONS
RECOVERY_CONTRACT_PROOF=PASS
RECOVERY_RUNTIME_IMPLEMENTATION=NOT_PROVEN
RUNTIME_READINESS=NOT_PROVEN
PLATFORM_ELIGIBILITY=PASS_READ_ONLY_CURRENT_DEPLOYMENT
05E_0B_AUTHORIZED=NO
SCOPE_VIOLATION_OBSERVED=NO
REMOTE_MUTATIONS=0
```

## Recovery e terminalidade

| Gate | Resultado |
| --- | --- |
| `RECOVERY_STATE_MACHINE_DEFINED` | PASS — `queued`, `running`, `checkpointed`, `retryable_failure`, `cancelled`, `failed`, `completed` |
| `ATTEMPT_FENCING_DEFINED` | PASS — token monotônico por tentativa |
| `STALE_ATTEMPT_FINALIZATION_DENIED` | PASS |
| `RETRY_POLICY_BOUNDED` | PASS — 2 tentativas no total, backoff de 5s, orçamento agregado de 20s |
| `RESUME_WITHOUT_DUPLICATE_CONFIRMED_WORK` | PASS — checkpoint idempotente por módulo/fingerprint |
| `RECONCILIATION_SINGLE_TERMINAL_STATE` | PASS |
| `CANCELLATION_WINS_LATE_FINALIZATION` | PASS |
| `PERSISTENCE_FAILURE_NOT_SUCCESS` | PASS — `failed`/`unknown` nunca retornam `completed` |
| `TERMINAL_PERSISTENCE_MATRIX` | PASS — success, failure, cancel, timeout, idempotente equivalente, conflito divergente |
| `ZERO_ORPHAN_LEASE_IN_HARNESS` | PASS |

Orçamentos sintéticos conservadores, todos abaixo do cutoff externo de 240s:

| Caminho | Trabalho | Retry/retomada | Persistência terminal | Total | Reserva até 270s |
| --- | ---: | ---: | ---: | ---: | ---: |
| Base | 180.000ms | 0ms | 30.000ms | 210.000ms | 60.000ms |
| Conditional | 185.000ms | 20.000ms | 30.000ms | 235.000ms | 35.000ms |
| Recovery | 170.000ms | 35.000ms | 30.000ms | 235.000ms | 35.000ms |

Todos preservam a reserva mínima de 30s (`APPLICATION_DEADLINE_MS=270000`,
`FINALIZATION_RESERVE_MS=30000`, cutoff de novas chamadas externas em 240000ms).

## Evidência Vercel somente leitura

Fonte operacional: `scripts/proofs/dossier-300s-runtime/vercel-readonly-evidence.sh`. O
script filtra a resposta antes de imprimir; valores de variáveis criptografadas nunca
são gravados no artefato.

```text
READ_ONLY_VERCEL_EVIDENCE=PASS
VERCEL_PLAN_PROOF=HOBBY
FLUID_COMPUTE_EFFECTIVE=TRUE
PLATFORM_MAX_DURATION_MS=300000
DEPLOYMENT_ID=dpl_FC1bBU3VQHXUdAFSc58zf9kUQUo1
DEPLOYMENT_READY_STATE=READY
VERCEL_DEPLOYABLE_FUNCTION_COUNT=10
API_ENTRYPOINT_FUNCTION_COUNT=9
CURRENT_API_DOSSIER_DURATION_MS=300000
DOSSIER_300S_EFFECTIVE=PASS
PLAN_FUNCTION_LIMIT=12_OFFICIAL_VERCEL_DOCS
FUNCTION_SLOTS_REMAINING=2_DERIVED_FROM_OFFICIAL_LIMIT
DOSSIER_300S_CONFIGURABLE=PASS_CURRENT_DEPLOYMENT_PROVES_EFFECTIVE_PLATFORM_VALUE
```

Leituras importantes:

- A fonte de código ainda declara `api/dossier.ts` com `maxDuration=60` e `vercel.json`
  não tem override desse arquivo. O deployment efetivo atual, entretanto, reporta 300s
  com Fluid Compute ativo; não houve alteração de configuração neste lote.
- A contagem observada é de 10 saídas Lambda no deployment, sendo 9 caminhos `api/` e
  um middleware. O limite de 12 é documentação oficial, não um campo de quota exposto
  pela API do projeto; os 2 slots são uma derivação explícita.
- Docs oficiais consultados: duração de Functions,
  limitações de Functions e runtimes/limite de funções.

## Validação

```text
27/27 testes 05E.0A + 05E.0A-R1                         PASS
run-05e0a.sh (guard + focused tests)                     PASS
typecheck                                                 PASS
eslint focado (proof dirs)                                PASS
build                                                     PASS
git diff --check                                          PASS
API manifest/status antes/depois                          UNCHANGED
NO_NEW_API_FUNCTION                                       PASS
REAL_PROVIDER_CALLS                                       0
PREVIEW_DEPLOYMENTS_CREATED                               0
SUPABASE_REMOTE_MUTATIONS                                 0
PRODUCTION_MUTATIONS                                      0
```

## Limites e decisão seguinte

- O modelo de recovery é prova contratual local; o helper `api/_dossier-server-pipeline.ts`
  continua sem retry/PORTA/persistência terminal conectados ao produto.
- Gate Zero da próxima implementação: reconciliar explicitamente `api/dossier.ts`
  (`maxDuration=60`) com a Function construída/implantada em 300s; não depender de
  precedência implícita entre código, `vercel.json`, dashboard e Fluid Compute.
- O pior caminho modelado consome 235s: sobram 35s, dos quais 30s são reserva terminal e
  apenas 5s são margem adicional. Isso prova consistência contratual, não robustez a
  cold start, rede ou latência real de provedor.
- A auditoria independente do Planner confirmou deployment, SHA e 10 funções; plano,
  Fluid, duração individual e resultados locais permanecem sustentados pelo artefato
  read-only do executor e exigem reconciliação no Gate Zero.
- `RUNTIME_READINESS` permanece `NOT_PROVEN`; não iniciar Preview/provider real,
  05E.0B, API/frontend wiring, migration/RPC/RLS/grant, commit, push, CI, deploy,
  Produção ou merge.
- Resultado a enviar ao Planner: `CONTINUE_05E_TO_IMPLEMENTATION_ADJUDICATION`.
  Qualquer implementação futura exige cartão separado e nova validação média/grande.
