# Active Context

Last updated: 2026-08-10 18:57 — Gold 01C.1 observability + 01D visual-first local gates

## Estado

- **Branch:** `feat/v6-shadow-prep` · **HEAD:** `cc1bfb4a` (local = remoto)
- **PR #483 DRAFT** (OPEN, não mergeada): BRU-33 + SEMANTICS-FIX + EXPERIENCE-01 + 01B + **01C (cc1bfb4a)**
- **CI:** success (run 31436052266) · **Preview:** `scoutagro-5xhliiq2x` (bundle `index-CtBCnw6g.js`), HTTP 200, smoke zero erros
- **01C entregue:** builder Mermaid determinístico (`services/llm/gold/mermaid/mermaid-deterministic.ts`), leak `canonical.qsaPeople` fechado (qsaCount do canonical), R10 com exceção categoria+direção+entidade+multi-claim, legenda fora do fence, canonical vence relação fraca
- **01C.1/01D local:** observabilidade segura de `codes`/`codeCounts` no verifier/fallback; tabela dinâmica de elos por `ScoutSegment` no builder visual; Composer recebe segmento opcional
- **Gates locais:** 128/128 testes Gold focados (Verifier, prompts, pipeline, Mermaid) · typecheck OK · build OK · lint 0 erros/69 warnings preexistentes · diff-check OK
- **Pré-existentes (não causados):** suítes com `No such built-in module: node:`; waterfall/React.act falhando no ambiente; warnings lint; códigos/claims da rodada paga não persistidos

## Próximo passo (AUTORIZADO pelo Planejador)

**Rodada Scheffer paga** (1 execução controlada, sem retry) no Preview `scoutagro-5xhliiq2x`:
1. Gerar 1 Gold Scheffer
2. Capturar Gold completo + 3 Mermaid renderizados + console/runtime + Verifier/Contract
3. Screenshots seções 2/3/5/7/8/9
4. Devolver evidência compacta ao Planejador

## Não fazer

- Merge #483 sem token `MERGE` do Bruno
- Mais de 1 rodada paga (sem retry automático)
- Alterar Supabase/Produção/provider/budgets/RUN_ORPHAN (congelados)
- Tocar o repo principal (`fix/remove-auth-migration-gate`)
- Commitar untrackeds: `.commandcode/`, `scripts/gold-forensic-dump.ts`

## Vault

- Sessão: [[2026-08-10T18-30-00-gold-experience-01c-canonical-mermaid]]
- Lição nova: `02 - Meus Projetos/NOVO-APP/Lições/gold/fato-verdadeiro-nao-autoriza-claim-b-arestas-e-r10.md`
