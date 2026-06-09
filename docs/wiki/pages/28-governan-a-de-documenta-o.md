---
grok_wiki: true
page_id: "page-governanca-documentacao"
title: "Governança de documentação"
repository: "local/NOVO-APP"
branch: "default"
generated_at: "2026-06-08T23:39:43.629Z"
source_files:
  - "docs/obsidian/00-MASTER.md"
  - "docs/obsidian/_meta/manifest.json"
  - "scripts/obsidian/check.mjs"
  - "docs/PROJECT-CARD.md"
  - "HANDOFF_AI.md"
  - ".agents/memory/activeContext.md"
  - "docs/SKILLS-GOVERNANCE.md"
  - "AGENTS.md"
---

---
title: "Governança de documentação"
description: "Contrato do grafo Obsidian, manifesto obrigatório, checker local, fontes canônicas, handoff de fechamento e regras de atualização por tarefa relevante."
---

A governança documental do NOVO-APP combina fontes operacionais no repositório (`HANDOFF_AI.md`, `.agents/memory/*`, `docs/ai-context/refactor/*`) com uma camada versionada de navegação em grafo em `docs/obsidian/`, validada pelo comando `npm run docs:obsidian:check`.

## Contrato operacional

A documentação que orienta agentes e mantenedores tem uma hierarquia explícita. O grafo Obsidian ajuda a navegar arquitetura e roadmap, mas não substitui os arquivos vivos de handoff, memória e decisões.

| Camada | Caminho | Papel |
| --- | --- | --- |
| Entrada rápida | `HANDOFF_AI.md` | Resumo executivo da situação atual, PRs, riscos, gatilhos e próxima ação |
| Memória ativa | `.agents/memory/activeContext.md` | Estado detalhado da sessão, decisões ativas, pendências e condições de reabertura |
| Progresso | `.agents/memory/progress.md` | Timeline curta, marcos concluídos e comandos de validação usados |
| Decisões duráveis | `.agents/memory/decisions.md` | Decisões que sobrevivem ao sprint atual |
| Grafo local | `docs/obsidian/00-MASTER.md` | Navegação visual para arquitetura, roadmap e decisões |
| Biblioteca central | `~/Documents/Senior IA/docs/obsidian` | Índice central externo ao repo; pode indexar o projeto, mas não sobrepõe as fontes operacionais |

<Warning>
Não trate `docs/obsidian/00-MASTER.md`, a biblioteca central Obsidian ou `PLAN.md` como fonte operacional superior. Eles só entram como fonte principal quando os handoffs ou memórias canônicas apontam explicitamente para eles.
</Warning>

## Ordem de leitura para agentes

<Steps>
<Step title="Abrir o handoff">
Leia `HANDOFF_AI.md` primeiro. Ele resume o estado atual, a branch relevante, PRs, riscos residuais e o prompt de retomada quando existir.
</Step>

<Step title="Carregar memória local">
Leia `.agents/memory/activeContext.md` e `.agents/memory/progress.md` antes de diagnosticar, planejar ou editar. Para decisões que devem sobreviver ao sprint, consulte `.agents/memory/decisions.md`.
</Step>

<Step title="Usar o grafo como navegação">
Depois das fontes operacionais, use `docs/obsidian/00-MASTER.md` para localizar notas de arquitetura, roadmap e decisões. O grafo é uma camada de navegação, não o estado vivo da execução.
</Step>

<Step title="Fechar com atualização durável">
Ao concluir tarefa relevante, atualize `HANDOFF_AI.md` e `.agents/memory/*` com o que mudou, validação executada, risco residual e próximo passo seguro.
</Step>
</Steps>

## Grafo Obsidian versionado

A pasta `docs/obsidian/` é uma camada documental versionada para abrir o repositório como vault no Obsidian e usar o Graph como mapa de arquitetura e roadmap.

:::files
docs/obsidian/
├── 00-MASTER.md
├── OBSIDIAN-README.md
├── _meta/
│   ├── META-Contract.md
│   └── manifest.json
├── architecture/
│   ├── ARCH-App-Orchestration.md
│   ├── ARCH-Chat-Experience.md
│   ├── ARCH-Services-Gemini.md
│   ├── ARCH-Serverless-RAG.md
│   ├── ARCH-State-Storage.md
│   └── ARCH-Tests-Quality.md
├── roadmap/
│   ├── ROADMAP-Overview.md
│   ├── ROADMAP-Sprint-Atual.md
│   ├── ROADMAP-Refactor-Track.md
│   └── ROADMAP-Proximos-Blocos.md
└── decisions/
    └── DECISIONS-Index.md
:::

A configuração compartilhável do Obsidian fica em `.obsidian/core-plugins.json` e `.obsidian/graph.json`. O filtro do grafo usa `path:"docs/obsidian"` para limitar a visualização às notas versionadas do repositório. Estado local de workspace, arquivos `.canvas` e artefatos pessoais da interface do Obsidian não fazem parte do contrato versionado.

## Frontmatter obrigatório

Toda nota principal da camada Obsidian precisa declarar os metadados exigidos pelo manifesto:

```yaml
---
type: guide
area: repo-graph
status: active
source_of_truth:
  - HANDOFF_AI.md
last_reviewed: 2026-04-19
tags:
  - obsidian
  - repo-graph
---
```

<ParamField body="type" type="string" required>
Classificação da nota, como `master`, `guide`, `meta-contract`, `architecture`, `roadmap`, `decision` ou outro tipo usado no grafo.
</ParamField>

<ParamField body="area" type="string" required>
Área de responsabilidade da nota. A camada atual usa `repo-graph` para o contrato do grafo versionado.
</ParamField>

<ParamField body="status" type="string" required>
Estado documental da nota, como `active`.
</ParamField>

<ParamField body="source_of_truth" type="string[]" required>
Lista de arquivos canônicos reais que sustentam a nota. Para notas operacionais, aponte para handoff, memória local, refactor docs ou arquivos de implementação relevantes.
</ParamField>

<ParamField body="last_reviewed" type="date" required>
Data da última revisão explícita da nota.
</ParamField>

<ParamField body="tags" type="string[]" required>
Tags usadas pelo grafo e filtros do Obsidian.
</ParamField>

## Manifesto obrigatório

O arquivo `docs/obsidian/_meta/manifest.json` define o contrato que o checker local valida.

| Campo | Função |
| --- | --- |
| `version` | Versão do formato do manifesto |
| `root` | Raiz documental, hoje `docs/obsidian` |
| `master_note` | Nota principal obrigatória, hoje `docs/obsidian/00-MASTER.md` |
| `required_frontmatter` | Chaves obrigatórias em todas as notas principais listadas |
| `required_notes` | Lista de notas obrigatórias e wikilinks que cada uma precisa conter |

Cada entrada de `required_notes` contém um `path` e uma lista `required_links`. O checker valida existência do arquivo, frontmatter, backlink para `[[00-MASTER]]` quando a nota não é a master, e todos os wikilinks obrigatórios declarados para aquela nota.

## Checker local

O gate documental roda com Node.js:

```bash
npm run docs:obsidian:check
```

Esse script executa:

```bash
node scripts/obsidian/check.mjs
```

Saída esperada quando o grafo obrigatório está íntegro:

```text
[obsidian-check] OK - 14 notas validadas
```

Erros comuns retornam com prefixo `[obsidian-check]` e encerram o processo com código `1`.

| Erro | Causa provável | Correção |
| --- | --- | --- |
| `manifesto ausente` | `docs/obsidian/_meta/manifest.json` não existe no checkout | Restaurar o manifesto antes de validar |
| `manifesto sem required_frontmatter` | Lista de metadados obrigatórios está vazia ou inválida | Declarar as chaves obrigatórias no manifesto |
| `manifesto sem required_notes` | Nenhuma nota principal foi registrada | Registrar as notas obrigatórias no manifesto |
| `nota obrigatoria ausente` | Uma nota listada em `required_notes` não existe | Criar/restaurar a nota ou remover a entrada se ela deixou de ser principal |
| `frontmatter ausente` | A nota não começa com bloco YAML `---` | Adicionar frontmatter válido no topo do arquivo |
| `frontmatter obrigatorio ausente` | Alguma chave exigida não está presente | Completar o frontmatter da nota |
| `backlink para [[00-MASTER]] ausente` | Nota principal não aponta de volta para a master | Adicionar `[[00-MASTER]]` na nota |
| `wikilink obrigatorio ausente` | Link declarado no manifesto não aparece no conteúdo | Adicionar o wikilink ou revisar o manifesto |

<Check>
Rode `npm run docs:obsidian:check` antes de fechar qualquer tarefa que altera `docs/obsidian/`, `docs/PROJECT-CARD.md`, o contrato de fontes canônicas ou a estrutura de notas principais.
</Check>

## Regras de atualização por tarefa relevante

Atualize documentação quando a tarefa mudar qualquer uma destas superfícies:

| Mudança | Arquivos a revisar |
| --- | --- |
| Estado atual, risco, PR, bug aberto ou próxima ação | `HANDOFF_AI.md`, `.agents/memory/activeContext.md`, `.agents/memory/progress.md` |
| Decisão arquitetural durável | `.agents/memory/decisions.md`, nota apropriada em `docs/obsidian/decisions/` quando fizer sentido |
| Arquitetura, fronteira de módulo ou roadmap | Nota correspondente em `docs/obsidian/architecture/` ou `docs/obsidian/roadmap/`, além de `00-MASTER.md` se entrar/sair nota principal |
| Nova nota principal no grafo | Nota nova, `docs/obsidian/00-MASTER.md`, `docs/obsidian/_meta/manifest.json` |
| Política de skills ou integrações | `docs/SKILLS-GOVERNANCE.md`, `AGENTS.md`, `README.md`, `CLAUDE.md`, `skills-lock.json` quando aplicável |
| Fechamento de investigação relevante | `HANDOFF_AI.md`, `.agents/memory/*`, e nota de decisão/lições se houver aprendizado reutilizável |

O fechamento mínimo precisa registrar quatro itens: `o que mudou`, `validação executada`, `risco residual` e `próximo passo seguro`.

## Skills e integrações

O repo não exige skills locais ativas nem MCPs extras para operar. Skills globais da máquina podem ser usadas por conveniência, mas não devem aparecer como pré-requisito de automações, handoffs ou páginas do projeto.

`docs/SKILLS-GOVERNANCE.md` mantém a política atual:

| Classificação | Regra |
| --- | --- |
| `active` | Nenhuma skill operacional versionada em `.agents/skills/` |
| `archived` | Materiais históricos em `.agents/skills/archive/2026-04-curation/` servem como referência |
| `global-only` | Skills globais podem existir, mas não são assumidas pelo repo |

<Info>
A camada `docs/obsidian/` é documentação versionada, não uma integração externa. Ela permanece portátil: pode ser lida como arquivos Markdown, como grafo Obsidian local ou por uma ferramenta de wiki que indexe repositório, sem depender de provedor de modelo, conector proprietário ou skill pack específico.
</Info>

## Integração com wiki gerada

Uma integração Grok-Wiki ou equivalente deve tratar o repositório como fonte primária e o grafo Obsidian como camada de navegação. O design permanece neutro a provedor quando a indexação aceita fontes de arquivo, repositório ou catálogo de skills sem exigir um runtime específico.

Regras para páginas geradas:

- priorize arquivos de implementação, testes, configs e contratos versionados;
- use `HANDOFF_AI.md` e `.agents/memory/*` para estado atual, não para inventar comportamento de runtime;
- use `docs/obsidian/00-MASTER.md` para descobrir tópicos relacionados já planejados;
- não crie links para páginas fora do catálogo planejado;
- não transforme skills globais ou snapshots externos em dependência operacional do repo;
- quando uma página alterar o entendimento canônico, atualize o handoff e a memória local no fechamento da tarefa.

## Procedimento de fechamento documental

<Steps>
<Step title="Atualizar fontes operacionais">
Registre a mudança em `HANDOFF_AI.md` e nos arquivos relevantes de `.agents/memory/`.
</Step>

<Step title="Atualizar o grafo quando necessário">
Se a tarefa mudou arquitetura, roadmap, decisões ou notas principais, atualize a nota Obsidian afetada e ajuste `00-MASTER.md`.
</Step>

<Step title="Sincronizar o manifesto">
Se entrou ou saiu nota principal, altere `docs/obsidian/_meta/manifest.json` com o `path` e os `required_links` esperados.
</Step>

<Step title="Validar">
Execute `npm run docs:obsidian:check` e corrija qualquer erro antes de declarar a tarefa fechada.
</Step>
</Steps>

## Related pages

<CardGroup>
<Card title="Fontes canônicas" href="/fontes-canonicas">
Ordem de leitura para agentes, handoff vivo, memória local, decisões duráveis e limites do grafo Obsidian.
</Card>

<Card title="Testes e gates" href="/testes-gates">
Comandos npm, gates de validação e critérios por tipo de mudança.
</Card>

<Card title="Visão geral" href="/overview">
Superfície pública do Senior Scout 360 e caminho mínimo de checkout limpo para app validável.
</Card>
</CardGroup>

## Related pages

- page-fontes-canonicas
- page-testes-gates


## Source files

- `docs/obsidian/00-MASTER.md`
- `docs/obsidian/_meta/manifest.json`
- `scripts/obsidian/check.mjs`
- `docs/PROJECT-CARD.md`
- `HANDOFF_AI.md`
- `.agents/memory/activeContext.md`
- `docs/SKILLS-GOVERNANCE.md`
- `AGENTS.md`
