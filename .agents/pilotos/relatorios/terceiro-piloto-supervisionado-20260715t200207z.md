# Encerramento do terceiro piloto supervisionado

## 1. Resumo executivo

A missão `terceiro-piloto-supervisionado-20260715t200207z` foi executada uma única vez sobre a baseline `e1c803f0f2bc3413b537864e5cd9f419c7604235`.

O runtime supervisionado iniciou corretamente, o Codex encerrou com `exit_code=0` e a worktree permaneceu limpa. A entrega obrigatória não foi criada. O resultado formal é `THIRD_PILOT_FAILED_NO_RETRY`, com código `DELIVERY_FILE_MISSING`.

Estado operacional: `runtime_started=true`, `codex_started=true`,
`codex_exit_code=0`, `timeout=false`, `sinal=ausente`,
`attempts_consumed=1`, `retry=false`.

Não houve sucesso funcional do piloto. A causa específica da ausência do arquivo permaneceu inconclusiva por uma lacuna confirmada de observabilidade: o JSONL bruto não foi persistido.

## 2. Escopo e baseline

- Mission ID: `terceiro-piloto-supervisionado-20260715t200207z`
- Baseline: `e1c803f0f2bc3413b537864e5cd9f419c7604235`
- Tentativas autorizadas: 1
- Tentativa consumida: 1
- Worktree alterada: não
- Output esperado: `.agents/pilotos/sandbox/resultado-terceiro-piloto.md`
- Output existente: não
- Entrega: `failed`
- Compliance: não conforme

O Card e o Plan foram preparados fora do repositório, com remoção exclusiva do campo top-level `baseline`. Os originais permaneceram inalterados.

## 3. Linha do tempo dos bloqueios de precheck

1. O primeiro bloqueio ocorreu antes da normalização porque o validador não aceitava o `baseline` estruturado dos artefatos reais.
2. O staging seguinte foi rejeitado porque continha arquivos auxiliares além de `card.json` e `plan.json`.
3. Uma chamada posterior foi encerrada antes de carregar os artefatos porque `STAGING_DIR` chegou vazio; nenhum runtime foi iniciado nessa chamada.
4. Um novo staging de entrada e um diretório separado de evidências foram criados na autorização seguinte.
5. A chamada canônica final passou pelos prechecks e consumiu a tentativa 1.

## 4. Normalização de Card e Plan

A transformação autorizada foi somente:

```text
normalized = original.reject { |key, _| key == "baseline" }
```

Card e Plan passaram nos schemas canônicos. O staging final permaneceu com exatamente dois arquivos: `card.json` e `plan.json`.

`baseline` é somente metadado documental externo. Não integra o schema do Card
nem o schema do Plan e não deve ser inserido nesses artefatos. Preparadores
futuros devem emitir recibo separado para a baseline autorizada.

## 5. Gates executados

- Dry-run: passou (`status=dry-run`).
- Readiness: passou (`PILOT_READY_ENVIRONMENT`).
- Preflight live: passou (`status=ready`).
- Codex: versão `0.144.0`.
- DCG: versão `0.6.6`, checksum e hook válidos.
- Bypass de segurança: ausente.

## 6. Execução canônica

O runtime supervisionado iniciou um processo Codex e um agente, usando a worktree autorizada. Os parâmetros observados incluíram `workspace-write`, rede desabilitada, execução JSONL e o caminho correto da worktree.

Fatos observados:

- `exit_code=0`;
- `timeout=false`;
- `sinal=null`;
- `processos_iniciados=1`;
- `arquivos_modificados=[]`;
- `arquivos_protegidos_alterados=[]`;
- `violacoes_escopo=[]`;
- HEAD inicial e final iguais à baseline.

## 7. Evidências de que a tentativa foi consumida

O state da missão foi criado com `tentativa=1`. O ledger registrou uma tarefa, `status=failed` e `codigo_final=DELIVERY_FAILED`. O Run Report registrou `status=failure` e vinculou o resultado ao `mission_id` correto.

Evidências existentes: state da missão, Run Report, ledger, handoff e
diagnóstico JSONL agregado. Evidências não persistidas: JSONL bruto, mensagens
completas do agente e comandos internos completos.

O state registra consumo de tentativa, não sucesso funcional.

## Recibo forense sanitizado e persistente

O bloco abaixo é a cópia sanitizada e versionada das evidências externas
usadas no encerramento. Os hashes e tamanhos referenciam os arquivos externos
originais; ledger, handoff e diagnóstico são componentes embutidos no
`run-report.json`. O JSONL bruto não foi persistido nem reconstruído. Este
recibo não resolve a causa específica da falha. Nenhum dado sensível foi
versionado.

```json
{
  "attempt": 1,
  "baseline": "e1c803f0f2bc3413b537864e5cd9f419c7604235",
  "delivery_result": "DELIVERY_FILE_MISSING",
  "diagnostic": {
    "codes": [],
    "event_counts": {
      "alteracoes_arquivo": 0,
      "erros_estruturados": 0,
      "eventos_terminais": 1,
      "execucoes_comando": 4,
      "mensagens_agente": 7
    },
    "items_unknown": 0,
    "last_event_type": "turn.completed",
    "raw_jsonl_persisted": false,
    "status": "available",
    "total_lines": 19,
    "valid_json_objects": 19
  },
  "handoff": {
    "comparison_status": "desvio",
    "delivery_expected": ".agents/pilotos/sandbox/resultado-terceiro-piloto.md",
    "delivery_observed": "missing",
    "human_approval_required": true,
    "next_action": "corrigir_manualmente"
  },
  "ledger": {
    "attempt": 1,
    "end": "2026-07-16T22:38:09Z",
    "final_code": "DELIVERY_FAILED",
    "mission_id": "terceiro-piloto-supervisionado-20260715t200207z",
    "start": "2026-07-16T22:37:13Z",
    "status": "failed",
    "task_count": 1
  },
  "limitations": [
    "raw_jsonl_not_persisted",
    "full_agent_messages_not_persisted",
    "internal_command_details_not_persisted"
  ],
  "mission_id": "terceiro-piloto-supervisionado-20260715t200207z",
  "result": "THIRD_PILOT_FAILED_NO_RETRY",
  "run_report": {
    "codex_version": "0.144.0",
    "delivery_code": "DELIVERY_FILE_MISSING",
    "delivery_observed_bytes": 0,
    "delivery_status": "missing",
    "duration_ms": 56286,
    "exit_code": 0,
    "mode": "agent-runtime",
    "output_exists": false,
    "output_path": ".agents/pilotos/sandbox/resultado-terceiro-piloto.md",
    "prompt_sha256": "2db30f972d4d87d7c84aa40bfa42d9fffb74a4c81f2f7c7f9ad2ed4d24de6f2d",
    "report_sha256": "852ac405c826acd60a2b6e1fc9b3073abc0361cf7e3f825478fb446fa462434d",
    "signal": "absent",
    "status": "failure",
    "timeout": false,
    "worktree_basename": "NOVO-APP-third-pilot-prep-post-440-20260716"
  },
  "sanitized_receipt_sha256": "ee448b2fc81d8369d4bd7f729314841288ea310e25726ee8d92d7899b40c114f",
  "schema_version": 1,
  "sources": [
    {
      "bytes": 179,
      "filename": "terceiro-piloto-supervisionado-20260715t200207z.json",
      "logical_name": "state",
      "origin_class": "external-local-evidence",
      "sha256": "3e9b237f2a931c23980b157e3db398341be8380391e9b8beb943274cbead4173"
    },
    {
      "bytes": 10353,
      "filename": "run-report.json",
      "logical_name": "run-report",
      "origin_class": "external-local-evidence",
      "sha256": "2381a973622130839e2ad7f87ccc52425e835d16405cc64a7c536666c4846359"
    },
    {
      "bytes": 10353,
      "filename": "run-report.json",
      "logical_name": "ledger",
      "origin_class": "external-local-evidence",
      "sha256": "2381a973622130839e2ad7f87ccc52425e835d16405cc64a7c536666c4846359"
    },
    {
      "bytes": 10353,
      "filename": "run-report.json",
      "logical_name": "handoff",
      "origin_class": "external-local-evidence",
      "sha256": "2381a973622130839e2ad7f87ccc52425e835d16405cc64a7c536666c4846359"
    },
    {
      "bytes": 10353,
      "filename": "run-report.json",
      "logical_name": "diagnostic",
      "origin_class": "external-local-evidence",
      "sha256": "2381a973622130839e2ad7f87ccc52425e835d16405cc64a7c536666c4846359"
    }
  ],
  "state": {
    "mission_id": "terceiro-piloto-supervisionado-20260715t200207z",
    "one_shot": true,
    "report_hash": "852ac405c826acd60a2b6e1fc9b3073abc0361cf7e3f825478fb446fa462434d",
    "timestamp": "2026-07-16T22:38:09Z"
  }
}
```

`sanitized_receipt_sha256`:
`ee448b2fc81d8369d4bd7f729314841288ea310e25726ee8d92d7899b40c114f`

Data de geração: `2026-07-16`.

O hash do recibo foi calculado sobre a serialização JSON canônica ordenada,
com o próprio campo `sanitized_receipt_sha256` omitido do material de hash.
Os arquivos externos continuam sendo evidência operacional não versionada.

## 8. Falha de entrega

O comparador registrou:

- código: `DELIVERY_FILE_MISSING`;
- caminho esperado: `.agents/pilotos/sandbox/resultado-terceiro-piloto.md`;
- bytes observados: `0`;
- status da entrega: `missing`.

O arquivo autorizado não foi criado. Não é permitido repará-lo manualmente nem repetir a mesma `mission_id`.

## 9. Auditorias somente leitura

As auditorias confirmaram que o prompt efetivamente enviado continha:

- o caminho exato do output;
- a obrigação de criar exatamente um arquivo;
- `BEGIN_DELIVERY_CONTENT` e `END_DELIVERY_CONTENT`;
- newline final obrigatório;
- verificação antes do encerramento;
- instrução para não declarar conclusão se a escrita falhasse.

O prompt reconstruído bateu com o `prompt_sha256` do Run Report. O diagnóstico agregado registrou 7 mensagens do agente, 4 execuções de comando, 1 evento de erro e último evento `turn.completed`.

## 10. Fatos comprovados

- O runtime e o enforcement fail-closed funcionaram.
- A worktree autorizada foi usada e permaneceu limpa.
- A tentativa 1 foi consumida.
- O Codex iniciou e encerrou com `exit_code=0`.
- A entrega obrigatória não existia ao final.
- O status final permaneceu `failure`.
- Não houve retry.
- Não houve alteração em scripts, runtime, schemas, templates ou testes.

## 11. Fatos não comprovados

O JSONL bruto não foi persistido. Por isso, não foi possível comprovar:

- o conteúdo das 7 mensagens do agente;
- a mensagem final do agente;
- os argv, cwd e exit code individuais das 4 execuções internas;
- se houve tentativa de escrita em outro caminho;
- se houve texto de conclusão sem verificação do arquivo;
- se um comando de escrita falhou.

Essas ausências não mudam o código formal `DELIVERY_FILE_MISSING`. Elas impedem apenas a atribuição da causa específica ao prompt, ao runtime ou ao comportamento do agente.

Categoria causal: `INSUFFICIENT_EVIDENCE`. O prompt continha o contrato de
entrega; não há evidência suficiente para atribuir a falha a prompt, cwd,
permissões, sandbox, modelo, agente ou runtime.

## 12. Conclusão formal

`THIRD_PILOT_FAILED_NO_RETRY`

O piloto não entregou o artefato e não deve ser considerado sucesso funcional. A causa raiz específica é `INSUFFICIENT_EVIDENCE`. O encerramento não deve ser escrito no caminho do arquivo de entrega ausente.

## 13. Lições aprendidas

1. `exit_code=0` do Codex não equivale a missão concluída; a entrega obrigatória precisa permanecer um gate independente.
2. O diagnóstico agregado é insuficiente para atribuir causa após o spawn.
3. O runtime deve preservar evidência forense sanitizada antes de autorizar novo piloto.
4. Recomendações automáticas de “corrigir manualmente” não substituem o contrato de entrega.

## 14. Próxima ação recomendada

Não repetir a missão. Implementar, em missão técnica separada, o hardening de
observabilidade forense e seus testes específicos. Somente depois de validar
esse hardening poderá existir nova decisão humana sobre outro piloto, que
deverá usar uma nova `mission_id`.
