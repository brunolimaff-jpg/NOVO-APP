---
name: validate-gates
description: Executa os gates de validação corretos conforme os arquivos alterados no contexto atual
---

# Validate Gates

Skill de validação pré-commit/pré-PR. Executa os scripts de gate apropriados baseado no que foi alterado.

## Quando usar

- Antes de declarar uma tarefa como concluída
- Antes de criar um commit
- Quando o PatternBank sinaliza o gate `validate-prompts.sh`
- Quando o usuário pede "valida" ou "roda os gates"

## Lógica de decisão

| O que mudou                                                       | Gate a executar                       |
| ----------------------------------------------------------------- | ------------------------------------- |
| `prompts/`, `prompts/mega/`, `megaPrompts.ts`, `services/gemini/` | `npm run validate:prompts`            |
| `components/chat/`, `ChatInterface.tsx`, scroll/chat behavior     | `npm run validate:chat:no-autoscroll` |
| Qualquer `.ts` ou `.tsx`                                          | `npm run typecheck`                   |
| `services/`, `contexts/`, `features/`                             | `npm run test`                        |
| Múltiplas áreas ou preparando PR                                  | `npm run validate:ci`                 |
| Preparando release/produção                                       | `npm run validate:release`            |

## Execução

1. Identificar quais arquivos foram alterados (git diff/staged)
2. Determinar quais gates são necessários pela tabela acima
3. Executar os gates em ordem: typecheck → tests → contracts → E2E
4. Reportar resultados com ✅/❌ por gate
5. Se todos passarem: ✅ Pronto para commit/PR
6. Se algum falhar: ❌ Listar falhas e sugerir correções

## Scripts disponíveis

```bash
npm run typecheck          # Verificação de tipos
npm run test               # Vitest (unit + integration)
npm run test:contracts     # Testes de contrato
npm run test:e2e:blank     # E2E regressão blank panel
npm run validate:prompts   # Valida prompts e parsers
npm run validate:chat:no-autoscroll  # Valida comportamento chat
npm run validate:preview   # Valida preview build
npm run validate:ci        # typecheck + test + contracts
npm run validate:release   # typecheck + test + contracts + E2E
npm run test:flow          # typecheck + test + contracts + E2E blank
```
