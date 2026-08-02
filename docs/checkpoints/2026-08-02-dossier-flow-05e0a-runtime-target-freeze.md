# Checkpoint 05E.0A — alvo server-owned multi-call congelado

Data: 2026-08-02 10:05 America/Cuiaba
Worktree: `/private/tmp/novo-app-dossier-flow-05a`
Source head: `a65f425b579ae429d9dd3823b0721a1a1d7d52bf`
Decisão do Planner: `DECISION=D`; `05E.0A_STATUS=CONTINUA_AUTORIZADO_APOS_ESTE_TARGET_FREEZE`.

## Resultado executivo

O alvo da prova deixou de ser híbrido/ambíguo. O experimento deve representar o futuro caminho server-owned multi-call:

```text
api/dossier.ts (envelope futuro)
  -> autenticação/ownership/lease/heartbeat
  -> api/_dossier-server-pipeline.ts (helper canônico)
  -> pesquisa/coleta server-owned
  -> módulos LLM
  -> consolidação
  -> persistência/finalização server-owned
  -> estado terminal/resposta
```

O waterfall atualmente conectado continua apenas como baseline de comportamento. `api/dossier.ts` com uma única chamada `runDossierGateway` é referência de envelope, não representa o dossiê completo.

## Call graph observado no helper canônico

| Caminho | Provider min | Provider esperado | Provider max limitado | Pesquisa | Topologia | Situação |
|---|---:|---:|---:|---:|---|---|
| Base | 8 | 8 | 8 | 12–18 | 6 LLM seriais + planner + consolidação; buscas em lotes de 4 | Limitado pelo código |
| Condicional | 0–8 | 8 | 8 | 0–18 | planner pode degradar; benchmark pode ficar indisponível | Limitado, mas sem provider real |
| Recovery | não representado | não representado | não comprovado | não representado | abort/stage failure existem; retry/PORTA/persistência terminal não | **Falha de capacidade** |

Exercício direto com adapters sintéticos: 8 chamadas LLM, 12 buscas sintéticas e 1 benchmark sintético; `clientDependenciesUsed=[]`; `terminalPersistenceAttempted=false`.

## Modelo de orçamento congelado

- `PLATFORM_HARD_CAP_MS=300000`
- `APPLICATION_DEADLINE_MS=270000`
- `FINALIZATION_RESERVE_MS=30000`
- cutoff para novas chamadas externas: `240000ms`
- body-read, parse, retry agregado, lease, persistência e resposta entram no cálculo.

O modelo local cobre chamadas de 20s, 50s e 120s, caminho serial até 240s, cutoff, body-read além do deadline, retry sem orçamento, cancelamento, persistência lenta, conclusão ambígua, resposta tardia e lease órfã. Não simula espera real nem provider.

## Gates executados

```text
17/17 testes do harness
67/67 testes focados API/contrato + harness
npm run typecheck                 PASS
eslint focado                    PASS
npm run build                    PASS
git diff --check                 PASS
NO_NEW_API_FUNCTION              PASS
REAL_PROVIDER_CALLS              0
PREVIEW_DEPLOYMENTS              0
SUPABASE_REMOTE_MUTATIONS        0
PRODUCTION_MUTATIONS             0
R3_ARTIFACTS_PRESERVED           PASS
```

O guard compara hashes/status de `api/` antes e depois e não encontrou alteração. R3 permanece íntegro: `dossier-worker-identity-proof.sql` SHA-256 `6a4cc335afb18eec14ee47f5ecfbdb32ae4546ae17777d35d361b2ac8b404ef2`; runner SHA-256 `3e2f1353d678a6e6e3620a9cd5f86afebabb4535f365604ac5ae8bbd19ce1760`.

## Limites e bloqueios

- `api/dossier.ts` declara `maxDuration=60`; `vercel.json` não configura esse arquivo (`API_DOSSIER_VERCEL_JSON_MAX_DURATION=UNSET`).
- O helper canônico usa budget interno estimado de 50s, com 5s por etapa LLM, 5s de collector, 3s de benchmark e 2s de margem; isso não comprova latência real nem persistência/finalização.
- `api/_dossier-runtime-envelope.ts` existente ainda valida apenas envelope de 50s/60s; não foi alterado para 300s por proibição do lote. O modelo de 300s é, portanto, `BUDGET_MODEL_ONLY` para o envelope.
- `API_TS_FILE_COUNT=22`; existem 9 candidatos sem prefixo `_`, porém a contagem efetivamente empacotada pela Vercel não foi verificada (`VERCEL_DEPLOYABLE_FUNCTION_COUNT=NOT_VERIFIED`). Consequentemente `HOBBY_FUNCTION_LIMIT_COMPLIANCE=NOT_VERIFIED` e `FUNCTION_SLOTS_REMAINING=NOT_VERIFIED`.
- A documentação oficial confirma 300s no Hobby quando Fluid Compute está efetivo, mas a efetividade no deployment vinculado não foi comprovada; registrar `FLUID_COMPUTE_EFFECTIVE=NOT_VERIFIED`.
- Latências históricas de 62–119s referem-se ao waterfall cliente/modelo/topologia anteriores e não são comparáveis ao helper server-owned (`HISTORICAL_LATENCY_COMPARABILITY=NOT_COMPARABLE`).
- O helper não reproduz retries, reconciliação PORTA nem persistência terminal do produto atual. Por isso `SERVER_OWNED_270S_RECOVERY_PATH_FIT=FAIL`, `THEORETICAL_270S_FIT=INCONCLUSIVE` e `READY_FOR_05E_0B_PREVIEW_REAL_PROVIDER_PROOF=NO`.

## Decisão operacional

05E.0A fica concluído **com bloqueio explícito**. Não executar 05E.0B, não fazer Preview, deploy, provider real, migration, SQL remoto, commit, push ou merge. A próxima autorização deve tratar a lacuna de recovery/persistência do helper canônico e só então preparar a prova Preview isolada.
