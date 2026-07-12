# Adaptadores dos Papéis Canônicos

Adaptador é uma camada fina específica de ferramenta que conecta um mecanismo de agente ao papel canônico correspondente em `.agents/papeis/`.

O adaptador **não é** o papel. O adaptador **aponta para** o papel.

## Princípio do adaptador fino

1. Cada adaptador identifica o papel canônico e aponta para `.agents/papeis/<papel>.md`.
2. O adaptador não reescreve as 13 seções do papel.
3. O adaptador aplica permissões compatíveis com a ferramenta.
4. O adaptador preserva condições de parada e contrato de saída.
5. Em caso de conflito, prevalece o papel canônico.

## Precedência

1. Instrução explícita atual do Bruno
2. `AGENTS.md` e governança do repositório
3. Cartão de Missão
4. Papel canônico (`.agents/papeis/`)
5. Adaptador específico da ferramenta
6. Configuração global

O adaptador **nunca** prevalece sobre o papel canônico.

## Permissões

### Leitores

`explorador`, `investigador-incidentes`, `planejador-solucao`, `revisor-contratos`, `validador-entrega`, `revisor-evidencias-dossie`

- Sem escrita no workspace por padrão.
- Sem commit, push ou PR.
- Sem delegação por contrato.
- Quando a ferramenta não fornece bloqueio técnico comprovado por agente, a limitação deve ser declarada.

### Executor

`executor-escopo`

- Escrita no workspace depende do Cartão de Missão.
- Sem merge.
- Sem deploy.
- Sem delegação por contrato.
- Commit, push e PR dependem do nível de autorização.

## Delegação

- Agentes filhos não delegam por contrato de governança.
- Codex preserva `agents.max_depth = 1`, que permite filhos diretos e bloqueia netos.
- Claude Code bloqueia subdelegação quando `Agent` não está em `tools` e/ou está em `disallowedTools`.
- OpenCode bloqueia subdelegação nos adaptadores com `permission.task: deny`.
- Cursor permite subagentes aninhados em certas condições; nesta rodada a proibição ficou contratual, com garantia técnica local não comprovada.
- Cline IDE informa subagentes read-only sem subdelegação; Agent Teams existem nas superfícies CLI/SDK/Kanban, não na extensão VS Code/JetBrains.

## Paralelismo

- Quando a ferramenta suporta execução paralela de agentes, o coordenador pode despachar múltiplos leitores em paralelo.
- O executor opera em série (um Cartão de Missão por vez).
- O `max_threads = 6` do Codex é preservado.

## Base documental verificada

Consulta realizada em 2026-07-12.

### Codex

Ferramenta: Codex CLI / IDE extension / ChatGPT desktop app / cloud

Páginas oficiais consultadas:
- `https://developers.openai.com/codex/llms.txt`
- `https://developers.openai.com/codex/agent-configuration/subagents.md`
- `https://developers.openai.com/codex/agent-approvals-security.md`
- `https://developers.openai.com/codex/config-file/config-reference.md`
- `https://developers.openai.com/codex/sandboxing.md`

Data da consulta: 2026-07-12

Mecanismo confirmado: custom agents em `.codex/agents/*.toml` e `~/.codex/agents/*.toml`; cada arquivo define um agente.

Localização dos arquivos: `.codex/agents/` para projeto; `~/.codex/agents/` para usuário.

Permissões disponíveis: `sandbox_mode` por agente (`read-only`, `workspace-write`, `danger-full-access`) e políticas de aprovação da sessão.

Delegação: `agents.max_depth` controla profundidade; padrão `1` permite filhos diretos e impede descendentes mais profundos.

Herança de modelo: campos opcionais como `model`, `model_reasoning_effort`, `sandbox_mode`, MCP e skills herdam da sessão quando omitidos; nesta PR o modelo é omitido.

Limitações: permissões e sandbox ativos da sessão principal ainda influenciam o filho; sandbox por agente não substitui governança humana.

Evidência local: `codex-cli 0.144.0`; `.codex/config.toml` já preserva `[agents] max_threads = 6` e `max_depth = 1`.

### Claude Code

Ferramenta: Claude Code

Páginas oficiais consultadas:
- `https://docs.anthropic.com/en/docs/claude-code/sub-agents`

Data da consulta: 2026-07-12

Mecanismo confirmado: subagents em Markdown com YAML frontmatter.

Localização dos arquivos: `.claude/agents/` para projeto; `~/.claude/agents/` para usuário; também há escopos gerenciados, CLI e plugins.

Permissões disponíveis: `tools`, `disallowedTools`, `permissionMode`, `hooks`, `mcpServers`, `skills`, `isolation`, `model` e outros campos de frontmatter.

Delegação: a ferramenta `Agent` permite subdelegação; omitir `Agent` e declarar `disallowedTools: Write, Edit, Agent` bloqueia essa superfície para leitores.

Herança de modelo: `model` omitido ou `inherit` herda da conversa principal.

Limitações: `permissionMode` pode ser influenciado por modo da sessão principal; Bash sem hook confiável não deve ser tratado como somente leitura.

Evidência local: Claude Code `2.1.200`; 7 adaptadores em `.claude/agents/`.

### Cursor

Ferramenta: Cursor Agent editor / CLI / Cloud Agents

Páginas oficiais consultadas:
- `https://cursor.com/docs/subagents`
- `https://cursor.com/docs/subagents.md`

Data da consulta: 2026-07-12

Mecanismo confirmado: subagents nativos em Markdown com YAML frontmatter.

Localização dos arquivos: `.cursor/agents/` para projeto; `~/.cursor/agents/` para usuário. Cursor também reconhece `.claude/agents/` e `.codex/agents/` por compatibilidade.

Permissões disponíveis: campo `readonly: true` restringe edições e comandos shell que alterem estado; `model: inherit` herda do agente pai.

Delegação: Cursor 2.5 permite subagentes aninhados até limite; hooks ou políticas de ferramentas podem bloquear, mas bloqueio local por agente não foi comprovado nesta rodada.

Herança de modelo: `model: inherit` usa o modelo do agente pai; plano, Max Mode ou políticas de time podem alterar fallback.

Limitações: `.cursor/agents/` prevalece sobre compatibilidade `.claude/agents/` e `.codex/agents/`; garantia técnica de não subdelegação não comprovada localmente.

Evidência local: `cursor` existe em PATH, mas `cursor --version` não retornou versão; smoke test local não comprovado.

### Cline

Ferramenta: Cline IDE / CLI / SDK / Kanban

Páginas oficiais consultadas:
- `https://docs.cline.bot/features/subagents.md`
- `https://docs.cline.bot/llms.txt`
- `https://docs.cline.bot/cli/agent-teams.md`
- `https://docs.cline.bot/getting-started/config.md`

Data da consulta: 2026-07-12

Mecanismo confirmado: Cline IDE possui subagents experimentais read-only; CLI/SDK/Kanban possuem Agent Teams; configuração documenta `.cline/agents/` global e de projeto.

Localização dos arquivos: `.cline/agents/` para projeto e `~/.cline/agents/` para global, conforme página de configuração.

Permissões disponíveis: IDE subagents são read-only, sem edição, sem browser, sem MCP e sem subdelegação; CLI/SDK expõem políticas de ferramentas e `CLINE_COMMAND_PERMISSIONS`.

Delegação: IDE subagents não podem criar subagents; Agent Teams existem em CLI/SDK/Kanban e não na extensão VS Code/JetBrains.

Herança de modelo: depende da superfície e configuração de provider; não foi criado adaptador Cline nesta PR por falta de smoke local do formato carregável.

Limitações: não confundir hooks com agentes; `.cline/agents/` é suporte documentado na configuração, mas carregamento local do formato não foi comprovado.

Evidência local: Cline `3.0.39`; sem adaptadores `.cline/agents/` criados nesta rodada.

### OpenCode

Ferramenta: OpenCode TUI / CLI / IDE / Web

Páginas oficiais consultadas:
- `https://opencode.ai/docs/agents`
- `https://opencode.ai/docs/permissions/`

Data da consulta: 2026-07-12

Mecanismo confirmado: agents em JSON ou Markdown; Markdown em `.opencode/agents/` para projeto e `~/.config/opencode/agents/` para global.

Localização dos arquivos: `.opencode/agents/` e `~/.config/opencode/agents/`.

Permissões disponíveis: `permission` por agente com `edit`, `bash`, `task`, `external_directory`, `read`, `grep`, `glob`, `webfetch`, `lsp` etc.; regras por padrão com último match prevalecendo.

Delegação: `permission.task: deny` remove subagentes da ferramenta Task para o agente.

Herança de modelo: subagents sem `model` usam o modelo do agente primário que os invocou.

Limitações: permissões globais existem, mas regras do agente têm precedência; smoke test local ainda não comprovou bloqueio em execução real.

Evidência local: OpenCode `1.17.18`; 7 adaptadores em `.opencode/agents/`.

## Ferramentas suportadas nesta PR

| Ferramenta | Status | Adaptadores |
|------------|--------|-------------|
| Claude Code | ativo-sem-smoke-test | 7 em `.claude/agents/` |
| Codex | ativo-sem-smoke-test | 7 em `.codex/agents/` |
| Cursor | ativo-sem-smoke-test | 7 em `.cursor/agents/` |
| OpenCode | ativo-sem-smoke-test | 7 em `.opencode/agents/` |
| Cline IDE | parcial-por-superficie | sem arquivo novo; usa subagents experimentais read-only |
| Cline CLI/SDK/Kanban | suporte-documentado-nao-validado-localmente | sem arquivo novo; Agent Teams ficam para subtarefa |

## Relação futura com o `delivery-loop`

A Fase 2 **não modifica** o `delivery-loop`. O contrato futuro é:

```
delivery-loop
  ↓ cria ou solicita Cartão de Missão
coordenador
  ↓ escolhe papel
mapa-adaptadores.yaml
  ↓ encontra adaptador compatível
adaptador da ferramenta
  ↓ carrega papel canônico
agente executa
  ↓ devolve saída e evidências
coordenador integra
```

## Como validar divergências

1. Compare o adaptador com o papel canônico em `.agents/papeis/`.
2. Se houver conflito, o papel canônico prevalece.
3. Registre a divergência no mapa de adaptadores.
4. Corrija o adaptador para alinhar com o papel.

## Mapa de adaptadores

Ver `.agents/adaptadores/mapa-adaptadores.yaml` para o registro completo e atualizado.
