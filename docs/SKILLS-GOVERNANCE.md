# Governança de Skills e Integrações

Este documento é a fonte de verdade do ambiente de IA deste repositório.

Objetivo: manter o repo operável sem depender de skills versionadas dentro do repositório ou de integrações externas obrigatórias.

## Política atual

- Integração externa padrão: nenhuma obrigatória
- MCPs extras no repo: nenhum
- Skills globais do usuário não são pré-requisito operacional
- Skills válidas para uso padrão: nenhuma é exigida pelo repo
- `docs/obsidian/` é uma camada documental versionada do repo para navegação em grafo, não uma integração externa nem um MCP extra
- **Supabase** é a nova camada de banco de dados para persistência (Postgres gerenciado via `lib/supabaseClient.ts`), integração obrigatória para persistência remota — `services/storage.ts`, `services/syncQueue.ts`

## Registry canônico

A camada canônica de skills auditadas passa a viver em:

- `.agents/skills/README.md`
- `.agents/skills/registry.yaml`
- `.agents/skills/politica-seguranca.md`
- `.agents/skills/compatibilidade.yaml`
- `.agents/skills/avaliacoes/autoskills.md`

O `skills-lock.json` atual continua mínimo e compatível. Não foi sobrescrito nem migrado destrutivamente nesta fase.

## Orquestração de agentes

A camada de orquestração determinística (Fase 3A) vive em `.agents/orquestracao/`:

- `README.md` — documentação canônica (CLI, papéis, autorização A0–A6)
- `cartao-missao.schema.json` — schema de entrada (Cartão de Missão)
- `contrato-plano.schema.json` — schema de saída (Plano de Execução)
- `roteamento.yaml` — tabela de roteamento intenção→papel + autorização
- `politica-despacho.md` — política de despacho (pipelines, filtros, regras)
- `contrato-evidencias.yaml` — dimensões de evidência

Scripts: `plan-agent-mission.rb` (planner dry-run), `validate-agent-orchestration.rb` (validador), `test-agent-orchestration.rb` (57 testes). CI: job `Agent Orchestration`.

Baseline Ruby oficial: `3.3.x`, fixado em `.ruby-version` e nos jobs `Skills Governance` e `Agent Orchestration`. O Ruby legado fornecido pelo sistema operacional não é baseline suportado.

## Classificação operacional

### `active`

- `delivery-loop` — fluxo canônico de entrega, mantido como skill empacotada com restrições explícitas no registry. Fonte: `.agents/skills/delivery-loop/SKILL.md`. Spec: `docs/plans/2026-06-23-delivery-loop-design.md`.
- `validate-gates` — skill local de validação, aprovada com restrições para papéis não leitores.
- `supabase-migration` — skill local de migration, aprovada com restrições e dependente de autorização explícita.

### `archived`

Continuam versionados em `.agents/skills/archive/2026-04-curation/` como lições aprendidas e material de referência:

- `api-design`
- `debugging-tools`
- `frontend-developer`
- `observability`
- `playwright-testing`
- `skill-audit`
- `super-brainstorm`
- `superhuman`
- `test-strategy`
- notas e guias avulsos que estavam misturados em `.agents/skills/`

Também foram arquivados os documentos legados de MCP/skills que descreviam um stack maior do que o uso atual.

### `global-only`

Skills globais podem existir na máquina do usuário e podem ser usadas por conveniência, mas não entram como aprovadas no registry do projeto sem auditoria local explícita.

## Regras de uso

- Antes de usar uma skill, confirme se ela é realmente necessária para a tarefa.
- Antes de citar uma integração externa, confirme se ela é opcional ou foi oficialmente adicionada aqui.
- Não documente fluxos que dependam de skills globais específicas não versionadas no repo.
- Não reintroduza MCPs locais sem atualizar este documento, `README.md`, `AGENTS.md`, `CLAUDE.md` e `skills-lock.json`.
- AutoSkills foi avaliado como `piloto controlado`, não dependência operacional.

## Estado esperado do repo

- `.agents/skills/` contém `delivery-loop/`, `archive/`, o registry canônico e a política de segurança
- `.claude/skills/` mantém skills locais de compatibilidade (`supabase-migration`, `validate-gates`) até eventual consolidação futura
- `skills-lock.json` segue compatível e mínimo; migração destrutiva ficou fora do escopo
- `.mcp.json` não declara servidores extras
- `README.md`, `CLAUDE.md`, `AGENTS.md` e `HANDOFF_AI.md` contam a mesma história
- `docs/obsidian/00-MASTER.md` aponta para arquitetura + roadmap e deixa explícitas as fontes canônicas reais

## Papéis dos agentes (roles)

Os papéis operacionais dos agentes são definidos em `.agents/papeis/` e governados por `.agents/papeis/README.md`. O contrato de comunicação com o Bruno está em `.agents/governanca/contrato-comunicacao-bruno.md`.

Regras:

- **Papéis não são skills.** Não entram em `skills-lock.json` e não alteram a allowlist deste documento.
- `.agents/papeis/` é a fonte canônica; adaptadores específicos de ferramenta apenas resumem e direcionam.
- A configuração do repositório (`AGENTS.md`, `.agents/papeis/`) prevalece sobre configuração global da ferramenta.
- O coordenador principal interpreta a missão, escolhe o papel e integra resultados; agentes filhos não delegam.
- Apenas um papel tem escrita no workspace: `executor-escopo`. Os demais são leitores.
- Decisões estruturais, merge e deploy continuam humanas (níveis A5 e A6).
- `delivery-loop` permanece inalterado; a integração dos papéis ao ciclo de entrega fica para Fase 2.
- Skills aprovadas não ampliam autorização, escrita, merge, deploy nem delegação.

Papéis canônicos: `explorador`, `investigador-incidentes`, `planejador-solucao`, `executor-escopo`, `revisor-contratos`, `validador-entrega`, `revisor-evidencias-dossie`.

### Adaptadores de ferramenta (Fase 2)

Adaptadores conectam mecanismos de cada ferramenta aos papéis canônicos. São camadas finas que apontam para `.agents/papeis/` e aplicam permissões.

- **Registry completo**: `.agents/adaptadores/mapa-adaptadores.yaml`
- **Contrato dos adaptadores**: `.agents/adaptadores/README.md`
- **Claude Code**: 7 adaptadores em `.claude/agents/` (Markdown com frontmatter YAML, `permissionMode` e `disallowedTools`)
- **Codex**: 7 adaptadores em `.codex/agents/` (TOML com `developer_instructions` e `sandbox_mode`)
- **Cursor**: 7 adaptadores nativos em `.cursor/agents/` (precedência sobre compatibilidade `.claude/agents/` e `.codex/agents/`)
- **OpenCode**: 7 adaptadores nativos em `.opencode/agents/` (`mode: subagent`, permissões por agente)
- **Cline**: suporte varia por superfície; IDE tem subagentes experimentais read-only, CLI/SDK/Kanban têm Agent Teams. `.cline/agents/` ficou documentado, mas sem materialização nesta PR por falta de prova local de carregamento.

Adaptadores não prevalecem sobre os papéis canônicos em caso de conflito.

## Banco de Padrões (PatternBank) — status Fase 1

Inventário de linha de base realizado para a Fase 1:

- **Data da verificação**: 2026-07-12
- **Base analisada**: `main` (commit `e74d8a29`)
- **Comandos de verificação**:
  - `ls -d .agents/patterns/` (Local)
  - `ls ~/.claude/memory/patterns/pattern-index.json` (Global)
  - `python3 -c "import json; print(len(json.load(open('$HOME/.claude/memory/patterns/pattern-index.json'))['patterns']))"` (Contagem)
  - `ls ~/.claude/hooks/pattern-*.sh` (Hooks)

### Resultado do Inventário
- `.agents/patterns/` **não existe em `main`**. No `AGENTS.md` versionado na base analisada, a seção obsoleta não estava presente. Texto diferente encontrado fora desta branch não faz parte desta PR.
- Banco de Padrões **global** (`~/.claude/memory/patterns/pattern-index.json`, 12 padrões registrados) é a única implementação operacional comprovada no momento, integrada via hooks `pattern-retrieve.sh` (global) e `pattern-store.sh` (global).
- Caminhos globais são estado externo da máquina do Bruno e não são garantidos pelo repositório.
- Obsidian (`Bruno Vault/50-PADROES/`) é fonte de contexto, não instrução operacional canônica.

### Precedência e Regras
- Padrão local do repositório (quando criado e versionado) será a fonte canônica.
- Banco global funciona como fallback de implementação externa comprovada.
- **Não migrar, copiar, apagar ou sincronizar padrões nesta fase.** Consolidação fica para tarefa separada.

## Short roadmap

No curto prazo, este setup cobre o necessário para:

- planejar e executar a refatoração estrutural
- documentar decisões de arquitetura e handoff
- preservar lições aprendidas sem acoplar o repo a skills locais
- preparar a seleção futura de skills por Cartão de Missão sem integrar ainda o `delivery-loop`
