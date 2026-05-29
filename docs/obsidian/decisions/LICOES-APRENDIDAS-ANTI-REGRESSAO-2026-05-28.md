---
type: licoes-aprendidas
area: test-anti-regression
data: 2026-05-28
sessao: test-anti-regression
tags:
  - licao
  - testes
  - contratos
  - e2e
  - playwright
  - data-testid
  - react
  - render-state
  - fallback
  - empty-state
  - typescript
---

# Licoes Aprendidas — Estrutura de Testes Anti-Regressao

Voltar para [[DECISIONS-Index]].

## Contexto

Implementacao de 3 camadas de teste (contracts + helper + E2E) + fallback visual controlado para impedir tela branca parcial, loading infinito e erro silencioso. Branch `feat/operator-tracking-supabase`, 1242 testes passando, 45 contratos, 3 specs E2E. Spec em `docs/superpowers/specs/2026-05-28-test-anti-regression-design.md`.

---

## Tabela de Licoes

| #   | Licao                                                                                                                          | Anti-padrao / o que evitar                                                                    | Onde aplicar                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | Fallback visual com 5 condicoes simultaneas e mais seguro que fallback generico — previne mascaramento de bugs de estado       | Fallback unico que nao verifica loading/error antes de mostrar "vazio"                        | `components/ChatInterface.tsx`, `utils/renderStateClassifier.ts`                                            |
| 2   | Classificacao explicita de estado com prioridade fixa (error > loading > content > empty) garante mutua exclusao               | Ordem arbitraria ou semantica implicita de estados                                            | `utils/renderStateClassifier.ts`                                                                            |
| 3   | data-testid padronizados em spec central previnem conflito e duplicacao entre componentes                                      | Testids arbitrarios em cada componente, sem documentacao                                      | `docs/contracts/scout-360-contracts.md`, `docs/superpowers/specs/2026-05-28-test-anti-regression-design.md` |
| 4   | `page.route('**/api/gemini**', route => route.abort())` e mais deterministico que mock de API externa para testes de falha E2E | E2E dependente de rede externa (Gemini real) que falha por rate limit/downtime                | `tests-e2e/loading-smart-recovery.spec.ts`, `tests-e2e/controlled-error-state.spec.ts`                      |
| 5   | Funcao utilitaria exportada para contrato vira contrato automaticamente — qualquer mudanca quebra ambos                        | Funcao interna que muda sem aviso a testes de contrato                                        | `services/operatorTracking.ts`, `tests/contracts/operatorTracking.contract.test.ts`                         |
| 6   | E2E blank-panel nao submete investigacao — verifica apenas estado visual sem depender de nenhuma API                           | E2E que tenta submeter investigacao para testar estado vazio (introduz dependencia de Gemini) | `tests-e2e/blank-center-panel-regression.spec.ts`                                                           |
| 7   | 3 specs E2E curtas (3 testes cada) sao mais sustentaveis que specs monoliticas — cada uma foca num modo de falha especifico    | Spec E2E unica que tenta cobrir todos os modos de falha (lenta, fragil, dificil de manter)    | `tests-e2e/*.spec.ts`                                                                                       |
