# HANDOFF AI — PR #483 (feat/v6-shadow-prep) — Barreira holding/governança: delta autorizado, 9 REDs escritos

> Atualizado: 2026-08-17 13:25 — checkpoint pré-compactação
> Worktree: `/Users/brunolima/Documents/NOVO-APP-bru62`
> Branch: `feat/v6-shadow-prep` · PR: **#483** (OPEN/DRAFT, não mergeada)
> HEAD remoto: `5ea3b0fd` (restauração teste QSA + progress) sobre `14cd5def` (barreira 1ª versão)
> Vault sessão: `2026-08-17T13-25-00-checkpoint-bru119-governanca-barrier.md`

---

## 0. Frente correta

- **ZCode = fluxo atual (Gold/PR #483)**. Chat do produto (Planejador): `6a81fda2`.

## 1. Estado

- **6 achados + 1 novo furo 7** do Planejador: TODOS CONFIRMADO por análise read-only DeepSeek.
- **Delta executável autorizado** (comentário 91ec007e, BRU-119): ZCODE PODE IMPLEMENTAR ✅.
- **9 REDs escritos** no `entity-aware-gold-verifier.test.ts` (8 falhando + 9 passando dos 17 GOVERNAMENTE_ROLE_PROMOTION).
- **CÓDIGO NÃO IMPLEMENTADO** — apenas os REDs foram escritos. O fix real precisa ser feito no próximo contexto.
- **Provider/Scheffer**: aguarda autorização do Bruno.
- **Merge**: bloqueado.
- **Preview same-SHA**: dpl_ANLst74UuDivQTpeZ2YZayq8L1R8 (SHA d6e48a0f) — ainda não refeito com delta final.

## 2. Escopo: 6→7 achados

O Planejador confirmou os 6 iniciais e adicionou **NOVO FURO 7**: proveniência de GOVERNANÇA é genérica demais (governança|decisão|aprovação|sponsor|fluxo). Categorias devem ser comprovadas pela MESMA categoria (equivalente ao R10).

## 3. Delta executável (7 fixes, 9 REDs)

| # | Fix | Arquivo | Estado |
|---|-----|---------|--------|
| 1 | demandsGovernance inclui "governança" | gold-policy.ts | A FAZER |
| 2 | Bypass: preservar modalidade interrogativa; matchesSafeKnowledgeNegation p/ negações | gold-policy.ts + verifier | A FAZER |
| 3 | Remover "controladoria" de roleProven | gold-policy.ts | A FAZER |
| 4 | Excluir QSA da proveniência (!matchesNonExternalSource não cobre QSA) | entity-aware-gold-verifier.ts | A FAZER |
| 5 | controladora isolada (sem "holding") → detector | gold-policy.ts | A FAZER |
| 6 | Entity binding: 1 PJ usa ela; >1 PJ fail closed | entity-aware-gold-verifier.ts | A FAZER |
| 7 | Proveniência por mesma categoria (governança genérica não prova aprovação) | entity-aware-gold-verifier.ts | A FAZER |

Gates: targeted → Gold 100% → full 100% → typecheck → lint → build → no-gemini → diff-check → FF push → CI exact SHA → Preview same-SHA + Smoke.

## 4. Não fazer

- Schema/Compact/provider/model/Composer/prompt/Mermaid/Supabase/arquitetura
- Scheffer/provider real, Produção, Ready for Review, merge

## 5. Próximo passo

1. Implementar os 7 fixes no gold-policy.ts e entity-aware-gold-verifier.ts.
2. Rodar os 9 REDs (espera: todos GREEN).
3. Gates completos.
4. FF push + CI exact SHA + Preview same-SHA.
5. Aguardar autorização Bruno para rodada Scheffer/provider.

## 6. Lições desta sessão

- Gate de parse Mermaid verde não prova render (nó sintético que parseia).
- splitSentences destrói "?"; bypass lexical com "existe/há/pode" confunde afirmação com pergunta.
- Proveniência NÃO-QSA precisa excluir QSA explicitamente.
- "controladoria" ≠ "controladora" (função/departamento vs papel societário).
- Escopo do Planejador pode aumentar de 6→7 items via análise read-only.

## 7. Artifacts

- PR #483: https://github.com/brunolimaff-jpg/NOVO-APP/pull/483 · HEAD `5ea3b0fd`
- Despacho: BRU-119 comentário 91ec007e
- Vault: `2026-08-17T13-25-00-checkpoint-bru119-governanca-barrier.md`
- Chat Planejador: `6a81fda2` (CDP 9333)
