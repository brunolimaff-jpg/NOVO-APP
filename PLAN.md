# Nota

O roadmap canonico da refatoracao estrutural vive em:

- `docs/ai-context/refactor/01-MASTER-PLAN.md`
- `docs/ai-context/refactor/02-BOARD.md`

Este arquivo pode continuar sendo usado para planos pontuais de features, correcoes
ou mudancas locais.

# Plano: Simplificação da página inicial (EmptyStateHome)

## Diagnóstico

O componente `EmptyStateHome.tsx` tem 337 linhas. A maioria é conteúdo estático de onboarding que aparece **toda vez** que o chat está vazio. O resultado é uma tela longa que o usuário rola antes de conseguir digitar.

Problemas concretos:

- **Heading duplicado**: "💡 Arsenal de Sugestões" aparece em duas seções distintas (linhas 197 e 222)
- **Card PORTA**: ~60 linhas de JSX de documentação metodológica — aparece em toda sessão nova
- **"Como funciona" + "Limites da Plataforma"**: conteúdo tutorial/guardrail, não acionável
- **`onSendMessage`**: declarada na interface e desestruturada, porém nunca chamada no JSX

---

## O que REMOVER

| Seção                                           | Linhas  | Motivo                                          |
| ----------------------------------------------- | ------- | ----------------------------------------------- |
| Card PORTA completo                             | 134–193 | Onboarding pesado repetido em todo empty state  |
| Segunda seção "Arsenal de Sugestões" (God Mode) | 219–245 | Heading duplicado; quickActions já cobre o caso |
| "Como funciona o OSINT"                         | 247–268 | Tutorial estático, não acionável                |
| "Limites da Plataforma"                         | 270–323 | Disclaimer — não pertence à área de trabalho    |
| Array `steps`                                   | 80–100  | Alimenta apenas a seção removida                |
| Objeto `suggestionCategories`                   | 61–78   | Alimenta apenas a seção removida                |

---

## O que MANTER

- **Header** (ícone, título, subtitle, saudação dinâmica) — leve e orienta o usuário
- **Quick actions grid** (5 botões: Investigar, Cross-sell, Competitivo, Radar, Alertas) — acionáveis e acima do fold
- **Footer** — uma linha, define o limite visual

---

## Mudanças estruturais

1. **Heading** da seção de ações: renomear de `"💡 Arsenal de Sugestões"` para `"✦ Por onde começar"` (elimina a ambiguidade na raiz)
2. **Prop `onSendMessage`**: remover da interface `EmptyStateHomeProps` e da desestruturação — também remover o prop-passing em `ChatInterface.tsx` linha 444
3. **Espaçamento**: reduzir `pt-4 md:pt-8` para `pt-6` no container externo — header e ações ficam mais próximos do textarea

---

## Limpeza do objeto `theme`

Tokens que ficam mortos após a remoção e devem ser deletados:

`exampleBg`, `exampleBorder`, `exampleHover`, `tutorialBg`, `tutorialBorder`, `checkBg`, `checkBorder`, `crossBg`, `crossBorder`

Tokens que sobrevivem (8):
`textPrimary`, `textSecondary`, `heading`, `cardBg`, `cardBorder`, `cardHover`, `cardHoverBorder`, `highlight`

---

## Resultado esperado

| Métrica                     | Antes | Depois                      |
| --------------------------- | ----- | --------------------------- |
| Linhas do componente        | 337   | ~120                        |
| Tokens no `theme`           | 18    | 8                           |
| Seções visuais              | 7     | 3 (header + ações + footer) |
| Prop `onSendMessage` usada? | Nunca | Removida                    |

---

## Arquivos impactados

1. `components/EmptyStateHome.tsx` — todas as remoções
2. `components/ChatInterface.tsx` — remover `onSendMessage={onSendMessage}` na linha 444
3. `tests/components/EmptyStateHome.test.tsx` — verificar se há assertivas sobre texto removido
