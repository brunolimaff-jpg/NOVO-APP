# HANDOFF AI — Gold EXPERIENCE-01C (PR #483)

> Atualizado: 2026-08-10 18:40
> Projeto: **NOVO-APP**
> Worktree ativo: `/private/tmp/v6-worktree`
> Branch: `feat/v6-shadow-prep`
> PR: **#483** (DRAFT, OPEN, não mergeada)
> HEAD: `cc1bfb4ae0b1c4db68e78356004e7eb93a6ee47c` (local = remoto)
> Vault: [[2026-08-10T18-30-00-gold-experience-01c-canonical-mermaid|Sessão 01C no Bruno Vault]]

---

## 1. Estado

- **01C CANONICAL MERMAID: IMPLEMENTADO + PUSHED + CI GREEN + PREVIEW NOVO**
- Cadeia validada: commit `cc1bfb4a` → GitHub → CI success (run 31436052266) → Vercel `scoutagro-5xhliiq2x` (bundle `index-CtBCnw6g.js`) → HTTP 200 → smoke zero erros.
- **Planejador deu GO para rodada Scheffer paga** (1 execução controlada, sem retry).

## 2. Arquivos alterados (commit cc1bfb4a — 8 arquivos, +1020/-55)

| Arquivo | O que |
|---------|-------|
| `services/llm/gold/mermaid/mermaid-deterministic.ts` | NOVO — `injectCanonicalGoldMermaids` (3 mapas, graph LR + paleta canônica, legenda fora do fence, canonical vence) |
| `services/llm/gold/gold-pipeline.ts` | Builder entre compose e verify (stage `mermaid-inject`) |
| `services/llm/gold/prompts/gold-contract-prompts.ts` | Composer não escreve Mermaid; leak `canonical.qsaPeople` fechado; qsaCount do canonical |
| `services/llm/gold/entity-aware-gold-verifier.ts` | R10 sinônimos + exceção por categoria/direção/entidade/multi-claim |
| `tests/llm/gold/mermaid-deterministic.test.ts` | NOVO — 38 testes RED→GREEN |
| `tests/llm/gold/{gold-pipeline,prompts/gold-contract-prompts,entity-aware-gold-verifier}.test.ts` | Atualizados |

## 3. Gates

- 175/175 testes gold (exit 0) · typecheck OK · lint 0 · build OK · diff-check OK
- Pré-existentes (não causados): 5 arquivos teste gold com `No such built-in module: node:`; falhas React.act na suíte completa; warnings lint em `api/*`.

## 4. Próxima ação (autorizada)

Rodada Scheffer paga no Preview `https://scoutagro-5xhliiq2x-brunolimaff-3629s-projects.vercel.app`:
1. Gerar 1 Gold Scheffer (sem retry automático).
2. Capturar Gold completo + 3 Mermaid renderizados + console/runtime + Verifier/Contract.
3. Screenshots seções 2/3/5/7/8/9.
4. Devolver evidência compacta ao Planejador.

## 5. Não fazer

- Merge #483 sem token `MERGE` do Bruno.
- Mais de 1 rodada paga (sem retry).
- Alterar Supabase/Produção/provider/budgets/RUN_ORPHAN.
- Tocar o repo principal (`fix/remove-auth-migration-gate`).
- Commitar untrackeds: `.commandcode/`, `scripts/gold-forensic-dump.ts`.
