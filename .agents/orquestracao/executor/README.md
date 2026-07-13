# Executor Local Controlado — Fase 3B.1

Executa localmente apenas comandos de governança previamente cadastrados.

Fluxo:

```text
Cartão de Missão -> Planner Fase 3A -> Plano validado -> Executor controlado -> Catálogo fixo -> Relatório
```

## Escopo

- Sem LLM, subagente real, rede, shell arbitrário, commit, push, PR, merge, deploy ou banco.
- Execução real exige `--execute` e `AGENT_ORCHESTRATION_EXECUTE=1`.
- Sem a dupla confirmação, o executor opera em dry-run determinístico.

## Catálogo Inicial

IDs permitidos:

- `validate-skills-governance`
- `test-skills-governance`
- `validate-agent-orchestration`
- `test-agent-orchestration`
- `git-diff-check`

O cartão e o plano precisam solicitar exatamente o mesmo conjunto de IDs (normalizado: uniq + sort). A execução usa somente `plan.comandos`.

### Status executável (Fase 3B.1, fail-closed)

| status do plano            | executável?                      |
| -------------------------- | -------------------------------- |
| `planejado`                | sim (exige `comandos` não vazio) |
| `planejado-com-restricoes` | não — `PLAN_STATUS_INVALID`      |
| `negado`                   | não — `PLAN_STATUS_INVALID`      |
| `incompleto`               | não — `PLAN_STATUS_INVALID`      |

`planejado-com-restricoes` permanece não executável porque o executor ainda não interpreta semanticamente as restrições.

## Exit codes

| status         | exit |
| -------------- | ---- |
| dry-run        | 0    |
| success        | 0    |
| failure        | 1    |
| denied         | 2    |
| timeout        | 3    |
| internal-error | 4    |

## Segurança operacional

- Subprocessos via `Open3.popen3` em process group próprio; timeout envia `TERM` → `KILL` e sempre faz `wait`.
- Ambiente sanitizado com `unsetenv_others: true`.
- `safe_path` rejeita symlinks de arquivo/parent fora de repo/tmp.
- Truncamento de stdout/stderr a 1 MB com `scrub` UTF-8.
- Hooks Cursor da PR: apenas `beforeShellExecution` com matcher `git commit` (sem `preToolUse` genérico).

## Hook Cursor de branch health

O hook Cursor de branch health usa `failClosed: false` intencionalmente para não bloquear o ambiente quando o hook estiver indisponível.

Ele é uma proteção de higiene operacional e não uma fronteira de segurança. As autorizações e negações do executor não dependem desse hook.

## Limitações da Fase 3B.1 / atualização 3B.2A

**Fase 3B.2A (parcial de 3B.2):** o planner propaga `cartao.executor.comandos` → `plano.comandos` (somente IDs do catálogo; dedupe preservando a primeira ocorrência; sem inventar comandos). Também emite `resumo_operacional` (com `executavel`), `topologia` (default single-agent), `simplicidade` (`avaliada=false` até 3B.2B) e `limites`.

### Plano analítico vs executável

| tipo                  | status típico                            | `executavel` | `comandos` | enviar ao runner?         |
| --------------------- | ---------------------------------------- | ------------ | ---------- | ------------------------- |
| analitico (leitor)    | `planejado`                              | `false`      | `[]`       | **não**                   |
| executor com catálogo | `planejado`                              | `true`       | ≥1 ID      | sim (dry-run/`--execute`) |
| executor sem comandos | `negado` (`PLANEJADO_REQUIRES_COMMANDS`) | `false`      | `[]`       | não                       |

Missão `executor-escopo` ou com escrita autorizada **não** depende da presença da chave `executor` para a exigência: ausência de comandos válidos produz negação no planner.

### Stop conditions

O planner **preserva a ordem** de `condicoes_parada` do cartão e **acrescenta** condições operacionais padrão (`comandos_concluidos`, `alteracao_fora_do_escopo`, `tempo_excedido`, `agente_nao_planejado`). Duplicatas são removidas sem reordenar alfabeticamente.

Ainda deferred:

- exigência condicional via JSON Schema `if`/`then` (validador Ruby ainda não aceita essas keywords)
- execução de `planejado-com-restricoes`
- avaliação automática de simplicidade (`avaliada` permanece `false`)
- scheduler / spawn real de agentes multi-tool

O alinhamento card/plan (mesmo conjunto de IDs) permanece: a execução usa somente `plan.comandos`, e o executor falha fechado se card e plan divergirem após normalização.

O executor rejeita plano `planejado` sem comandos com `PLANEJADO_REQUIRES_COMMANDS`.
