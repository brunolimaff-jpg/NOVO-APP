# Handoff — Fase 3B.1 Execução Controlada

> **Fase 3A:** concluída e mergeada.
> **PR:** #423
> **Squash:** `0f9858a1e37c95bb9a711faea0b34a2887f77f5f`
> **Ruby:** 3.3.7
> **Planner dry-run:** ativo
> **Próxima etapa:** Fase 3B.1 — execução local controlada
> **Branch atual:** `feat/fase-3b-execucao-controlada`
> **Vault:** `[[2026-07-13T08-40-20-novo-app-pr423-fase3a-handoff]]`

## Contexto

- A Fase 3B.1 entrega executor local controlado para gates de governança.
- Não executa LLM, agentes reais, shell arbitrário, rede, commit, push, PR, merge, deploy ou banco.
- Execução real exige `--execute` e `AGENT_ORCHESTRATION_EXECUTE=1`.
- Catálogo inicial limitado a validações Ruby da governança/orquestração e `git diff --check`.

## O que foi feito nesta retomada

- Consolidado contexto dos reviews: path traversal, permissões efetivas, autorização de escrita, `acoes_solicitadas`, schema validation, tests helpers, allowlist Skills Governance.
- Alterado `scripts/plan-agent-mission.rb`:
  - `require 'tmpdir'` e path safety real por `File.expand_path`, `File.realpath`, `REPO_ROOT` e `Dir.tmpdir`;
  - validador JSON Schema interno;
  - `acoes_solicitadas` separado de `acoes_permitidas`;
  - ação solicitada e não permitida vira negação;
  - gate A2+ e `executor-escopo` para escrita;
  - permissões efetivas para rede/shell;
  - skills com `pode_escrever` ou `pode_executar_shell` exigem A2;
  - `ACTION_MIN_AUTH` em loop;
  - negações estruturadas `{codigo,mensagem}`;
  - remoção do load redundante de `compatibilidade.yaml`.
- Alterado `cartao-missao.schema.json` para exigir `autorizacao.acoes_solicitadas`.
- Alterado `contrato-plano.schema.json` para `negacoes` estruturadas e campos `acoes_solicitadas`/`acoes_permitidas`.
- Atualizados 5 exemplos com `acoes_solicitadas`.
- Alterado `scripts/validate-agent-orchestration.rb`:
  - `YAML.safe_load`;
  - regex de `require` com indentação;
  - allowlist stdlib com `tempfile` e `tmpdir`;
  - `git diff --name-only` para alterações funcionais;
  - check real de delivery-loop no diff;
  - valida exemplos contra schema e planos gerados contra `contrato-plano.schema.json`.
- Alterado `scripts/validate-skills-governance.rb` para permitir artefatos Fase 3A.
- Alterado `scripts/test-agent-orchestration.rb`: 57 testes, incluindo escrita A0/A1/A2, ação permitida vs solicitada, schema, paths/symlinks, hash e compatibilidade comportamental.
- Alterado `scripts/test-validate-skills-governance.rb`: 28 testes, incluindo negativos para evitar liberação genérica de `scripts/`, `docs/`, `.github/` e `.agents/`.

## Validação local

- `ruby scripts/validate-skills-governance.rb` → OK.
- `ruby scripts/test-validate-skills-governance.rb` → OK, 28 tests.
- `ruby scripts/validate-agent-orchestration.rb` → OK.
- `ruby scripts/test-agent-orchestration.rb` → OK, 57 tests.
- `git diff --check` → OK.

## Estado atual do worktree

Arquivos modificados localmente, não commitados:

- `.agents/orquestracao/cartao-missao.schema.json`
- `.agents/orquestracao/contrato-plano.schema.json`
- `.agents/orquestracao/exemplos/exploracao-readonly.json`
- `.agents/orquestracao/exemplos/implementacao-autorizada.json`
- `.agents/orquestracao/exemplos/investigacao-incidente.json`
- `.agents/orquestracao/exemplos/merge-negado.json`
- `.agents/orquestracao/exemplos/skill-mutante-negada.json`
- `scripts/plan-agent-mission.rb`
- `scripts/test-agent-orchestration.rb`
- `scripts/test-validate-skills-governance.rb`
- `scripts/validate-agent-orchestration.rb`
- `scripts/validate-skills-governance.rb`

## Próximos passos

1. Commitar correção na mesma branch.
2. Push para PR #423.
3. Aguardar `Agent Orchestration`, `Skills Governance`, `Build`, CodeQL/Analyze/CodeRabbit/GitGuardian.
4. Responder threads da PR com evidência dos testes.

## Não fazer

- Não mexer em `.agents/skills/delivery-loop/SKILL.md`.
- Não criar Fase 3B.
- Não mergear/deployar.
- Não declarar pronto para merge antes dos checks remotos e threads.
