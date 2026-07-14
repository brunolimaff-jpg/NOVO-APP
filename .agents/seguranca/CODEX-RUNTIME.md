# Codex Runtime — capacidades pinadas (Fase 3B.3B)

## Versão testada

- **CLI:** `codex-cli 0.144.0` (`codex --version`)
- **Invocação:** `codex exec` (modo não interativo)
- **Data de verificação:** 2026-07-13

## Capacidades obrigatórias e como garantir

| Capacidade                      | Evidência na 0.144.0                                            | Argv / config usada                                  |
| ------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------- |
| Execução não interativa         | subcomando `exec`                                               | `codex`, `exec`                                      |
| Diretório de trabalho explícito | `-C, --cd <DIR>` em `codex exec --help`                         | `-C`, `<worktree>`                                   |
| Sandbox workspace-write         | `-s` valores incluem `workspace-write`                          | `-s`, `workspace-write`                              |
| Sem aprovação interativa        | `approval_policy` via `-c` (flag `-a` **não** existe em `exec`) | `-c`, `approval_policy="never"`                      |
| Tool network desabilitada       | default off; override explícito                                 | `-c`, `sandbox_workspace_write.network_access=false` |
| Saída capturável                | `--json` + stdout/stderr do processo                            | `--json`, `--color`, `never`                         |
| Sem multi-agent experimental    | não passar `--enable` de multi-agent                            | argv sem features multi-agent                        |

## Argv canônico (produção)

```text
codex exec
  -C <worktree_realpath>
  -s workspace-write
  -c approval_policy="never"
  -c sandbox_workspace_write.network_access=false
  --json
  --color never
  -
```

Prompt operacional é enviado em **stdin**; stdin é fechado após o envio. Execução via `Open3` com `argv` (nunca `bash -lc` / `eval`).

## Falha de capacidade

Se `codex exec --help` não expuser `-C`/`--cd`, `-s`/`--sandbox` com `workspace-write`, `-c`/`--config` ou `--json`, o runtime nega com `CODEX_RUNTIME_CAPABILITY_UNAVAILABLE`. Não há fallback para shell livre.

## Testes

O runner **nunca** descobre fixtures. Fake Codex só quando:

- `AGENT_RUNTIME_TEST_CODEX=1`
- `AGENT_RUNTIME_TEST_CODEX_BIN=<path absoluto do fake>`
