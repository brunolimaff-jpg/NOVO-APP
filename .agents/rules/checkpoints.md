# Checkpoints Proativos (versão versionada no repo)

Cópia dos CP 2.6 e 2.7 de `~/.claude/rules/copiloto-proativo.md`. Fonte canônica é o arquivo global; esta cópia existe para agentes cloud/CI.

## CP 2.6 — Evidência de Conclusão (Fase / Etapa / Sprint)

Antes de declarar qualquer fase, etapa ou sprint como "concluída":

1. **Git log vs escopo**: `git log <baseline>..HEAD --oneline` — commits batem com o planejado? Use a baseline do plano (ex: `origin/stabilize/from-production-fe6c6f9`, não `origin/main` se o plano usar outra base).
2. **Arquivos tocados**: `git diff <baseline>..HEAD --stat` — artefatos esperados foram alterados? Baseline = branch base do plano.
3. **Artefatos existem**: para cada arquivo/endpoint/componente prometido — `ls` ou `grep` confirma presença no trunk.

Cruzar planejado vs executado. Se gap → **NÃO declarar concluído.** Reportar: o que falta, o que sobrou, o que divergiu.

## CP 2.7 — Validação de Base Branch (antes de push)

Antes de `git push` que vai gerar preview Vercel ou PR:

1. **Qual branch base?** `git merge-base <baseline> HEAD` — baseline é a branch alvo do plano (ex: `origin/stabilize/from-production-fe6c6f9`). Não assumir `origin/main`.
2. **Base correta?** Se o plano define baseline (ex: `stabilize/from-production-fe6c6f9`), a branch DEVE derivar dela, não de `main`
3. **Push na base errada** = preview roda código velho, diagnóstico falso, retrabalho

**Regra:** Se `git merge-base` com a baseline esperada ≠ HEAD da baseline esperada → 🟠 BLOQUEAR push. Rebasear antes.
