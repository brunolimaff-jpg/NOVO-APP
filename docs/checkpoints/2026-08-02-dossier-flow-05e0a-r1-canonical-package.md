# Pacote canônico 05E.0A-R1 — feasibility closure

## Identidade

```text
TASK_ID=DOSSIER-FLOW-05E-0A-R1-FEASIBILITY-CLOSURE
SOURCE_HEAD=a65f425b579ae429d9dd3823b0721a1a1d7d52bf
WORKTREE=/private/tmp/novo-app-dossier-flow-05a
ALLOWED_REPO_SCOPE=docs/checkpoints/**; docs/handoffs/**; scripts/proofs/dossier-300s-runtime/**; tests/proofs/dossier-300s-runtime/**
CANONICAL_WORKLOAD_TARGET=api/_dossier-server-pipeline.ts
ENTRYPOINT_ENVELOPE_TARGET=api/dossier.ts
TARGET_FUNCTION_BUDGET=ONE_VERCEL_FUNCTION_INVOCATION_WITH_300_SECOND_PLATFORM_CAP
```

## Retorno estruturado ao Planner

```text
RECOVERY_STATE_MACHINE_DEFINED=PASS
ATTEMPT_FENCING_DEFINED=PASS
STALE_ATTEMPT_FINALIZATION_DENIED=PASS
RETRY_POLICY_BOUNDED=PASS
RECONCILIATION_SINGLE_TERMINAL_STATE=PASS
CANCELLATION_WINS_LATE_FINALIZATION=PASS
PERSISTENCE_FAILURE_NOT_SUCCESS=PASS
TERMINAL_PERSISTENCE_MATRIX=PASS
ZERO_ORPHAN_LEASE_IN_HARNESS=PASS
FINALIZATION_RESERVE_PROTECTED=PASS
SERVER_OWNED_270S_BASE_PATH_FIT=PASS
SERVER_OWNED_270S_CONDITIONAL_PATH_FIT=PASS
SERVER_OWNED_270S_RECOVERY_PATH_FIT=PASS
VERCEL_PLAN_PROOF=HOBBY
FLUID_COMPUTE_EFFECTIVE=TRUE
PLATFORM_MAX_DURATION_MS=300000
CURRENT_API_DOSSIER_DURATION_MS=300000
VERCEL_DEPLOYABLE_FUNCTION_COUNT=10
API_ENTRYPOINT_FUNCTION_COUNT=9
PLAN_FUNCTION_LIMIT=12_OFFICIAL_VERCEL_DOCS
FUNCTION_SLOTS_REMAINING=2_DERIVED_FROM_OFFICIAL_LIMIT
DOSSIER_300S_CONFIGURABLE=PASS_CURRENT_DEPLOYMENT_PROVES_EFFECTIVE_PLATFORM_VALUE
PROHIBITED_FILES_CHANGED=NONE
REAL_PROVIDER_CALLS=0
REMOTE_MUTATIONS=0
```

## Artefatos da prova

- `scripts/proofs/dossier-300s-runtime/recovery-model.ts` — state machine e orçamento contratual; sem pipeline, provider ou storage.
- `tests/proofs/dossier-300s-runtime/recovery.test.ts` — 10 cenários de fencing, lease, retry, checkpoint, terminalidade e budgets.
- `scripts/proofs/dossier-300s-runtime/vercel-readonly-evidence.sh` — consulta GET/inspect e saída sanitizada.
- `scripts/proofs/dossier-300s-runtime/run-05e0a.sh` — guard de API/rede/banco, focused tests e gates.
- `docs/checkpoints/2026-08-02-dossier-flow-05e0a-r1-feasibility-closure.md` — narrativa e resultado.
- `docs/handoffs/2026-08-02-dossier-flow-05e0a-r1-feasibility-handoff.md` — retomada operacional.

## Decisão de continuidade

```text
DECISION=CONTINUE_05E_TO_IMPLEMENTATION_ADJUDICATION
PLANNER_FINAL=APPROVED_WITH_RESERVATIONS
RECOVERY_CONTRACT_PROOF=PASS
RECOVERY_RUNTIME_IMPLEMENTATION=NOT_PROVEN
RUNTIME_READINESS=NOT_PROVEN
05E_0B_AUTHORIZED=NO
```

O próximo passo não é implementar automaticamente: é o Planner adjudicar se e como
o contrato de recovery será incorporado ao único owner server-side. O cartão futuro
deve preservar uma invocação, não criar nova Function, não usar memória entre requests
e não declarar `completed` antes de persistência terminal confirmada.

Ressalvas do Planner: reconciliar `maxDuration=60` na fonte contra 300s no deployment
antes de qualquer implementação; o pior caminho de 235s deixa somente 5s além da
reserva terminal de 30s; recovery runtime e resultados locais ainda não são prova de
produção. `05E.0B` permanece sem autorização.
