# Estratégia de Testes

## 1) Escopo por pasta

Esta estratégia define o objetivo de cada suíte dentro de `tests/` para manter feedback rápido e cobertura útil.

### Testes unitários

- `tests/utils`
- `tests/services`

**Objetivo:** validar regras de negócio, transformações de dados e contratos de funções de forma isolada.

### Integração leve de frontend

- `tests/components`
- `tests/hooks`
- `tests/contexts`

**Objetivo:** validar comportamento observável da UI com integração entre componentes, hooks e providers, sem depender de backend real.

---

## 2) Critérios mínimos obrigatórios

1. **Toda regra crítica nova precisa de teste unitário.**
   - Inclui validações de domínio, cálculo, autorização, mapeamentos e regras condicionais relevantes ao negócio.
2. **Fluxos visuais críticos precisam de teste de componente.**
   - Inclui estados essenciais da interface (carregando, sucesso, erro), interações principais (cliques, preenchimento, submissão) e regressões de comportamento percebido pelo usuário.

---

## 3) Convenções de naming e estrutura

### Naming padrão

- Arquivos TypeScript sem JSX: `*.test.ts`
- Arquivos com JSX/TSX: `*.test.tsx`

Exemplos:

- `priceCalculator.test.ts`
- `LeadCard.test.tsx`

### Estrutura AAA (Arrange / Act / Assert)

Todos os testes devem seguir a organização AAA:

1. **Arrange**: preparar dados, mocks, estado inicial e renderização.
2. **Act**: executar a ação testada (chamada de função ou interação do usuário).
3. **Assert**: verificar resultado esperado, efeitos observáveis e mensagens relevantes.

Modelo recomendado:

```ts
it('deve aplicar desconto para cliente premium', () => {
  // Arrange
  const order = buildOrder({ isPremium: true, total: 100 });

  // Act
  const result = applyDiscount(order);

  // Assert
  expect(result.finalTotal).toBe(90);
});
```

---

## 4) O que NÃO testar

Para evitar custo alto e fragilidade, **não** devemos:

1. **Testar detalhes internos de framework/biblioteca**
   - Ex.: comportamento interno do React, Vitest, Testing Library ou implementação privada de terceiros.
2. **Depender de snapshots frágeis como estratégia principal**
   - Snapshot amplo de árvore completa tende a quebrar com mudanças cosméticas e gerar ruído.
3. **Chamar APIs externas reais em testes automatizados**
   - Testes devem usar mocks/fakes/stubs para garantir previsibilidade, velocidade e independência de rede.

---

## 5) Regra prática de revisão (PR)

Antes de aprovar mudanças:

- Há **teste unitário** para cada regra crítica nova?
- Há **teste de componente** para cada fluxo visual crítico alterado/adicionado?
- O arquivo segue `*.test.ts` ou `*.test.tsx`?
- O teste está claramente estruturado em **AAA**?
- O teste evita os itens de “o que NÃO testar”?

---

## 6) Gates de CI (BRU-13) — determinísticos e não bloqueadores

Desde o BRU-13 (2026-08-06), o Playwright **não** é gate obrigatório de PR.

### Gates obrigatórios (bloqueadores, determinísticos)

- Typecheck
- Lint
- Vitest completo (`npm run test`)
- Testes focados proporcionais à superfície alterada
- Contratos (`npm run test:contracts`)
- Build
- Dossier Golden determinístico (`npm run test:dossier`) quando aplicável
- No-Gemini Gate
- Gates de governança/segurança existentes (Skills Governance, Agent Orchestration, Agent Execution Control, Agent Runtime Observation, Runtime Safety Preflight)
- Análise nominal de regressão (0 falhas novas por identidade)

Comando agregado: `npm run validate:ci` (typecheck + test + contracts + contrato de CI).

### Validações NÃO bloqueadoras (manuais / com autorização)

- Playwright E2E manual (workflow `e2e-critical-manual.yml`, `workflow_dispatch` only)
- Preview visual do Bruno (gate final de UX)
- Golden Live (requer autorização explícita)
- CNPJ real / serviços externos / LLM live

### Contrato estático de CI

`scripts/validate-ci-contract.rb` falha se:

1. `ci.yml` voltar a chamar Playwright ou instalar Chromium;
2. `validate:ci` voltar a depender de E2E;
3. o workflow manual ganhar trigger `pull_request`, `push` ou `schedule`;
4. o workflow manual usar secrets ou variáveis de LLM live;
5. jobs determinísticos obrigatórios forem removidos.

Testes: `npm run test:ci-contract` (1 positivo + 5 negativos).
