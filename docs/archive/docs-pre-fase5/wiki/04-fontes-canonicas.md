---
grok_wiki: true
page_id: 'page-fontes-canonicas'
title: 'Fontes canônicas'
description: 'Ordem de leitura para agentes, handoff vivo, memória local, decisões duráveis, skill governance e limites do grafo Obsidian.'
repository: 'local/NOVO-APP'
branch: 'default'
generated_at: '2026-06-08T23:39:43.629Z'
source_files:
  - 'AGENTS.md'
  - 'HANDOFF_AI.md'
  - '.agents/memory/activeContext.md'
  - '.agents/memory/progress.md'
  - '.agents/memory/decisions.md'
  - 'docs/PROJECT-CARD.md'
  - 'docs/SKILLS-GOVERNANCE.md'
---

O NOVO-APP mantém a continuidade operacional em arquivos versionados do próprio repositório: `HANDOFF_AI.md` para entrada rápida, `.agents/memory/*` para estado vivo e decisões, `docs/ai-context/refactor/*` para trilhas estruturais e `docs/obsidian/*` apenas como navegação visual validável.

## Ordem de autoridade

Use esta ordem antes de diagnosticar, planejar ou editar:

```text
AGENTS.md
  -> regras do repo, layout, comandos, merge guard e protocolo de sessão

HANDOFF_AI.md
  -> entrada rápida do estado atual e próximo passo seguro

.agents/memory/activeContext.md
.agents/memory/progress.md
  -> contexto vivo obrigatório antes de diagnóstico ou plano

.agents/memory/decisions.md
  -> contratos duráveis e decisões que sobrevivem à sprint

docs/ai-context/refactor/*
  -> board, riscos, validação e handoff quando a tarefa toca a trilha de refatoração

docs/PROJECT-CARD.md
docs/obsidian/00-MASTER.md
  -> identidade do projeto e navegação visual do grafo

docs/SKILLS-GOVERNANCE.md
skills-lock.json
  -> política de skills, integrações e portabilidade
```

<Warning>
Não trate `PLAN.md` da raiz como fonte canônica a menos que `HANDOFF_AI.md`, `.agents/memory/*` ou um documento de handoff referencie explicitamente esse arquivo.
</Warning>

## Função de cada fonte

| Fonte                             | Papel operacional                                                                  | Quando consultar                                                               | Quando atualizar                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `AGENTS.md`                       | Protocolo principal do repo, layout, comandos, preferências do Bruno e merge guard | Início de sessão, tarefa nova, dúvida de regra                                 | Quando regras de operação, comandos ou limites do repo mudarem            |
| `HANDOFF_AI.md`                   | Handoff vivo e entrada rápida para o próximo agente                                | Sempre antes de retomar trabalho                                               | Fechamento de tarefa relevante, incidente, PR ou mudança de próximo passo |
| `.agents/memory/activeContext.md` | Estado atual, pendências, gatilhos de reabertura e risco vivo                      | Antes de diagnosticar ou planejar                                              | Ao mudar status, branch ativa, risco ou gatilho operacional               |
| `.agents/memory/progress.md`      | Timeline curta, marcos concluídos e comandos de validação recentes                 | Antes de avaliar histórico ou regressão                                        | Ao concluir etapa validada ou registrar novo marco                        |
| `.agents/memory/decisions.md`     | Decisões arquiteturais, contratos e hipóteses descartadas                          | Antes de tocar fluxo sensível, UI, waterfall, loading, prompts ou persistência | Quando uma decisão deve sobreviver ao chat atual                          |
| `docs/PROJECT-CARD.md`            | Identidade do projeto e lista resumida de fontes canônicas                         | Onboarding, indexação e integração com biblioteca central                      | Quando nome, status, caminho, nota central ou lista canônica mudar        |
| `docs/SKILLS-GOVERNANCE.md`       | Política de skills, MCPs, integrações e dependências de agente                     | Antes de documentar ou exigir skill/conector                                   | Quando uma skill ou integração virar requisito real                       |
| `docs/obsidian/00-MASTER.md`      | Mapa visual de arquitetura e roadmap                                               | Depois das fontes canônicas, para navegar o grafo                              | Quando notas principais entram, saem ou mudam de relacionamento           |
| `docs/ai-context/refactor/*`      | Trilha de refatoração, board, riscos, validação e handoff do programa              | Tarefas de arquitetura, manutenção estrutural ou sprint                        | Ao mexer em estado de sprint, risco, validação ou alvo arquitetural       |

## Rotina mínima de entrada

<Steps>
  <Step title="Leia as regras do repo">
    Abra `AGENTS.md` para confirmar layout, comandos, merge guard, fontes prioritárias e limites como `api/*.ts` para serverless Vercel e ausência de `src/` como raiz de aplicação.
  </Step>
  <Step title="Carregue o handoff vivo">
    Leia `HANDOFF_AI.md`, depois `.agents/memory/activeContext.md` e `.agents/memory/progress.md`. Esses dois arquivos são obrigatórios antes de diagnóstico, plano ou edição.
  </Step>
  <Step title="Cheque decisões duráveis">
    Consulte `.agents/memory/decisions.md` quando a tarefa tocar contratos de UI, waterfall, loading, prompts, persistência, observabilidade, testes ou comportamento já investigado.
  </Step>
  <Step title="Verifique a realidade do checkout">
    Rode uma checagem curta no Git antes de agir, porque handoff e memória podem carregar estado de sessão anterior.
    ```bash
    git status --short --branch
    ```
  </Step>
</Steps>

<Note>
Se o handoff disser que há arquivos modificados, branches abertas ou pendências, confirme no checkout atual. A memória orienta a continuidade, mas o Git e o código atual definem o estado operacional imediato.
</Note>

## Estado vivo versus histórico

`HANDOFF_AI.md`, `activeContext.md` e `progress.md` podem descrever incidentes recentes, como regressões de tela branca, safety nets, gatilhos de reabertura e validações de produção. Use esses arquivos para entender o estado vivo e a próxima ação segura.

`decisions.md` tem peso diferente: ele guarda contratos e hipóteses descartadas. Quando uma decisão diz que uma hipótese foi refutada ou que um fallback deve permanecer até causa raiz identificada, não reabra a mesma linha de investigação sem evidência nova.

`CALIBER_LEARNINGS.md` funciona como banco de padrões e antipadrões aprendidos. Ele não substitui as fontes canônicas, mas ajuda a evitar regressões recorrentes, como validar apenas evento técnico sem confirmar intenção de produto visível.

## Trilha de refatoração

A pasta `docs/ai-context/refactor/` é a fonte de verdade apenas para o programa de refatoração estrutural. Dentro dela:

| Arquivo            | Responsabilidade                                           |
| ------------------ | ---------------------------------------------------------- |
| `00-README.md`     | Ordem de leitura da trilha de refatoração                  |
| `02-BOARD.md`      | Status vivo do programa de refatoração                     |
| `03-OPEN-ITEMS.md` | Riscos, warnings, decisões adiadas e itens abertos         |
| `05-VALIDATION.md` | Regra de parada, checklist automatizado e validação manual |
| `06-HANDOFF.md`    | Próximo passo seguro da trilha                             |
| `07-SPRINT-LOG.md` | Histórico de execução                                      |

A regra dessa pasta é explícita: se o chat divergir dos arquivos versionados, siga o repositório. Para trabalho fora da refatoração estrutural, prefira `HANDOFF_AI.md` e `.agents/memory/*`.

## Governança de skills

O repo não exige skills locais ativas para operar. `skills-lock.json` declara `allowlist` vazia e `skills` vazio; `.agents/skills/archive/` guarda material histórico, não runtime obrigatório.

| Classificação | Significado no repo                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| `active`      | Nenhuma skill operacional versionada é exigida                                                        |
| `archived`    | Material de referência preservado em `.agents/skills/archive/`                                        |
| `global-only` | Skills globais da máquina podem ajudar, mas não podem ser pré-requisito de docs, handoff ou automação |

<Warning>
Não documente um fluxo como obrigatório só porque uma skill global, conector local ou perfil externo existe na máquina. Para virar contrato do projeto, a dependência precisa estar refletida em `docs/SKILLS-GOVERNANCE.md`, `skills-lock.json` e nos documentos operacionais correspondentes.
</Warning>

Para geração de wiki, Ask ou Grok-Wiki, perfis externos e snapshots empacotados devem ser tratados como orientação portátil de escrita, não como dependência do repo. A arquitetura da documentação permanece neutra em relação a provedor: a fonte de verdade é arquivo versionado, não modelo, conector proprietário ou catálogo local específico.

## Limites do grafo Obsidian

`docs/obsidian/` é uma camada documental versionada para navegação em grafo. Ela não substitui `HANDOFF_AI.md`, `.agents/memory/*` nem `docs/ai-context/refactor/*`.

O grafo tem contrato próprio:

| Item                   | Contrato                                                             |
| ---------------------- | -------------------------------------------------------------------- |
| Entrada                | `docs/obsidian/00-MASTER.md`                                         |
| Manifesto              | `docs/obsidian/_meta/manifest.json`                                  |
| Metadados obrigatórios | `type`, `area`, `status`, `source_of_truth`, `last_reviewed`, `tags` |
| Backlink obrigatório   | Notas principais devem apontar para `[[00-MASTER]]`                  |
| Escopo visual          | `.obsidian/graph.json` filtra `path:"docs/obsidian"`                 |
| Validação              | `npm run docs:obsidian:check`                                        |

Comando esperado:

```bash
npm run docs:obsidian:check
```

Saída esperada quando o contrato está íntegro:

```text
[obsidian-check] OK - 14 notas validadas
```

## Fechamento de tarefa relevante

Ao fechar tarefa com impacto técnico, produto ou operação, atualize as fontes vivas com:

- o que mudou;
- validação executada;
- risco residual;
- próximo passo seguro.

Use este checklist curto:

<Steps>
  <Step title="Atualize o handoff">
    Registre em `HANDOFF_AI.md` o estado final, PR ou branch relevante, risco residual e próximo passo.
  </Step>
  <Step title="Atualize a memória local">
    Sincronize `.agents/memory/activeContext.md` e `.agents/memory/progress.md`. Se houver contrato durável, registre em `.agents/memory/decisions.md`.
  </Step>
  <Step title="Atualize docs especializadas">
    Se a mudança tocar refatoração, ajuste `docs/ai-context/refactor/*`. Se tocar navegação Obsidian, ajuste `docs/obsidian/*` e rode o checker.
  </Step>
  <Step title="Registre validação">
    Use os comandos adequados ao escopo, como `npm run typecheck`, `npm run test`, `npm run build`, `npm run lint`, testes E2E ou validação de preview Vercel.
  </Step>
</Steps>

## Divergências e resolução

| Sinal                                                        | Ação segura                                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `HANDOFF_AI.md` diverge de `activeContext.md`                | Leia ambos, confirme no Git e atualize o arquivo stale no fechamento                                          |
| `docs/obsidian/*` contradiz `.agents/memory/*`               | Siga `.agents/memory/*`; ajuste o grafo depois                                                                |
| `docs/SKILLS-GOVERNANCE.md` contradiz README ou config local | Trate a governança como política; não promova conector local a requisito sem atualizar os documentos oficiais |
| `PLAN.md` propõe tarefa não referenciada                     | Considere rascunho, não plano canônico                                                                        |
| Testes verdes contradizem UX observada                       | Priorize validação de produto visível, DOM e estado final esperado antes de fechar                            |

## Related pages

<CardGroup>
  <Card title="Governança de documentação" href="/governanca-documentacao">
    Contrato do grafo Obsidian, manifesto obrigatório, checker local e regras de atualização por tarefa relevante.
  </Card>
  <Card title="Testes e gates" href="/testes-gates">
    Comandos npm, Vitest, Playwright, contratos, E2E críticos e critérios por tipo de mudança.
  </Card>
  <Card title="Observabilidade e diagnósticos" href="/observabilidade">
    Sentry, `scoutDiag`, Supabase diagnostics, eventos de operador e traces de layout usados em incidentes.
  </Card>
  <Card title="Visão geral" href="/overview">
    Superfície pública, runtime principal, rotas de maior valor e caminho mínimo para app validável.
  </Card>
</CardGroup>

## Source files

- `AGENTS.md`
- `HANDOFF_AI.md`
- `.agents/memory/activeContext.md`
- `.agents/memory/progress.md`
- `.agents/memory/decisions.md`
- `docs/PROJECT-CARD.md`
- `docs/SKILLS-GOVERNANCE.md`
