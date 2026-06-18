# Plano: Push final do CI para PR #379

## Contexto

Continuando a resolução da PR #379. Todos os comentários inline foram respondidos, todos os checks CI estão verdes. O commit `37aeba2c` (adição do step `bash tests/scripts/completion-check.test.sh` no job Tests do CI) está pronto no worktree mas não foi pushado porque o OAuth token não tem escopo `workflow`.

## Ação

Operação única — sem código:

1. `unset GITHUB_TOKEN` (a variável de ambiente bloqueia o keyring)
2. `gh auth refresh -h github.com -s workflow` (interativo, abre navegador)
3. `cd /Users/brunolima/.config/superpowers/worktrees/NOVO-APP/p0-playbook-foundation && git push origin codex/p0-playbook-foundation`

Após o push, a PR #379 estará 100% completa.

## Verificação

- `git log origin/codex/p0-playbook-foundation --oneline -1` deve mostrar `37aeba2c`
- CI deve incluir o step "Shell hook tests"
