---
type: licoes-aprendidas
area: code-review
data: 2026-05-28
sessao: code-review-security-review-handoff
projetos: NOVO-APP
tags:
  - licao
  - code-review
  - security-review
  - supabase
  - rls
  - sanitize
  - testing
  - react
  - usecallback
  - data-testid
  - e2e
  - obsidian
---

# Licoes Aprendidas — Code Review + Security Review (2026-05-28)

Voltar para [[DECISIONS-Index]].

## Contexto

Apos a implementacao da camada de tracking de operadores via Supabase (sessoes + eventos), foram executados code review (agente `reviewer`, 20 findings), security review automatico (2 findings) e `/code-review` modo maximo (9 angulos, dezenas de findings nao aplicados). Branch `feat/operator-tracking-supabase`, 14 commits ahead of main.

---

## Tabela de Licoes

| #   | Licao                                                                                                                                                  | Anti-padrao / o que evitar                                                                                               | Onde aplicar                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| 1   | data-testid com espaco no valor quebra `getByTestId()` do Playwright — `data-testid="a b"` vira seletor CSS `[data-testid="a"] b`                      | Usar espacos em data-testid ou valores compostos sem documentar que o seletor CSS nao aceita espacos                     | `components/chat/Composer.tsx`                                   |
| 2   | useCallback com stale closure em operatorId/email — variaveis usadas dentro do callback mas ausentes do deps array causam perda silenciosa de tracking | Assumir que variaveis de closure sao capturadas sem lista-las em deps                                                    | `features/chat/message-orchestrator.ts`                          |
| 3   | E2E que testa erro de API interceptando rota: erro 500 capturado internamente nunca propaga para React ErrorBoundary                                   | `try/catch` que engole erro sem propagar para boundary; E2E que assume erro vai para boundary sem verificar o fluxo real | `tests-e2e/controlled-error-state.spec.ts`, `api/gemini.ts`      |
| 4   | findUserByEmail com referencia a coluna que so existe apos migration — codigo deploya antes da coluna existir                                          | Referenciar coluna nova no codigo antes da migration ser aplicada                                                        | `services/storage.ts`                                            |
| 5   | classifyPanelState com hasDossierContent/hasError hardcoded false — branch 'error' vira codigo morto                                                   | Passar parametros fixos (false) para classificador que tem logica condicional nesses mesmos parametros                   | `components/ChatInterface.tsx`, `utils/renderStateClassifier.ts` |
| 6   | camelCase em sanitizePayload: regex word-boundary nao detecta palavras em camelCase (`apiKey` nao contem `key` como palavra standalone)                | Confiar apenas em word-boundary regex sem considerar camelCase                                                           | `utils/serverDiagnostics.ts`                                     |
| 7   | RLS FOR ALL e muito amplo para anon — INSERT+UPDATE separados com escopo minimo sao o correto                                                          | Usar FOR ALL quando o caso de uso so precisa de INSERT e UPDATE                                                          | `supabase/migrations/*.sql`                                      |
| 8   | Code review com agente especializado antes do commit final — encontrou 4 P0, 6 P1, 10 P2 em 18 arquivos                                                | Pular code review por confiar na correcao manual                                                                         | Processo de PR do NOVO-APP                                       |
| 9   | Security review automatico complementa code review — encontrou 2 issues que o code review nao detectou                                                 | Fazer code review mas pular security review (ou vice-versa)                                                              | Fluxo de validacao pre-PR                                        |
| 10  | /code-review max effort com 9 angulos: priorizar por criticidade e concordancia entre angulos                                                          | Tentar aplicar todos os findings de uma vez sem priorizar                                                                | Fluxo de /code-review                                            |
