# Relatório — Worktree `fix-consolidando-stuck-monitoring`

**Data:** 2026-07-11
**Status:** Preservada (não removida na Fase 0)

## Descrição

Worktree com estrutura quebrada — sem link `.git` próprio. Contém apenas
diretório `test-results/` com 2 arquivos. O `git status` reportado pertence
ao trunk principal (não tem git próprio).

## Inventário

| Atributo | Valor |
|---|---|
| Caminho | `.claude/worktrees/fix-consolidando-stuck-monitoring/` |
| Tamanho total | 16K |
| Arquivos | 2 (em `test-results/`) |
| Branch declarada | `stabilize/from-production-fe6c6f9` (herdada do trunk) |
| SHA provável | `fe6c6f9b` (mesmo do trunk) |
| Link `.git` | **AUSENTE** — sem worktree git metadata |
| Arquivos não rastreados | 2 (test-results) |
| Commits exclusivos | 0 (sem git próprio para verificar) |
| PR relacionada | Nenhuma |

## Estratégia de backup

1. Os 2 arquivos em `test-results/` são produtos de execução de teste, não código-fonte
2. A "worktree" é na verdade um diretório órfão sem associação git funcional
3. **Backup seguro:** `tar czf fix-consolidando-backup.tar.gz .claude/worktrees/fix-consolidando-stuck-monitoring/`
4. **Recuperação:** `tar xzf fix-consolidando-backup.tar.gz`
5. **Remoção segura (fase posterior):** `rm -rf .claude/worktrees/fix-consolidando-stuck-monitoring/` + `git worktree prune`

## Recomendação

Esta worktree pode ser removida com segurança em uma fase posterior pois:
- Não tem git metadata próprio
- Não tem commits exclusivos
- Não tem PR
- Não tem código-fonte (apenas test-results)
- O `git worktree prune` já a removeria automaticamente
