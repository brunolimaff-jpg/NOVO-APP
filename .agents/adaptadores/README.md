# Adaptadores dos Papéis Canônicos

## O que é um adaptador

Adaptador é uma camada fina específica de ferramenta que conecta um mecanismo de agente (Claude Code, Codex, etc.) ao papel canônico correspondente em `.agents/papeis/`.

O adaptador **não é** o papel. O adaptador **aponta para** o papel.

## Diferenças fundamentais

| Conceito | Definição |
|----------|-----------|
| **Papel canônico** | Definição completa em `.agents/papeis/<papel>.md`. Fonte de verdade. |
| **Adaptador** | Ponteiro fino que conecta uma ferramenta ao papel. Não duplica o conteúdo. |
| **Agente especializado** | Perfil com expertise adicional (ex: `security-reviewer`, `silent-failure-hunter`). Permanece como modo especializado do papel. |
| **Fluxo auxiliar** | Sequência operacional não mapeada a um papel (ex: `commit-pr`, `gh-resolve-pr-comments`). |

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

### Leitores (somente leitura)

`explorador`, `investigador-incidentes`, `planejador-solucao`, `revisor-contratos`, `validador-entrega`, `revisor-evidencias-dossie`

- Sem escrita em workspace
- Sem commit, push ou PR
- Sem delegação
- Testes, logs, consultas e diagnósticos não mutantes permitidos

### Executor (escrita no workspace)

`executor-escopo`

- Escrita no workspace permitida
- Sem merge
- Sem deploy
- Sem delegação
- Commit, push e PR dependem do Cartão de Missão e nível de autorização

## Sandbox

- Usar opção nativa quando a ferramenta possuir suporte documentado.
- Leitores usam o modo mais restritivo compatível com sua missão.
- Executor usa escrita somente no workspace.
- Caso a ferramenta não suporte sandbox por agente, documentar a limitação.
- Não inventar campos de configuração.

## Herança de modelo

- O modelo é herdado da sessão por padrão.
- Nenhum adaptador hardcoda modelo nesta fase.
- Exceções existentes (ex: agentes globais do Claude Code com `model: sonnet`) são preservadas mas não replicadas.
- Mudança de modelo fica para decisão posterior baseada em pilotos.

## Delegação

- Agentes filhos não delegam.
- Quando a ferramenta suporta `max_depth`, configurar profundidade máxima 1.
- Somente o coordenador principal despacha papéis.
- Não criar cadeias de subagentes.

## Paralelismo

- Quando a ferramenta suporta execução paralela de agentes, o coordenador pode despatchar múltiplos leitores em paralelo.
- O executor opera em série (um Cartão de Missão por vez).
- O `max_threads=6` existente no Codex é preservado quando correto.

## Condições de parada

Cada adaptador preserva as condições de parada definidas no papel canônico. O agente deve parar quando:

- Objetivo do Cartão de Missão foi atingido.
- Evidência é insuficiente e não pode ser obtida sem exceder autorização.
- Conflito material exige decisão do coordenador.
- Limite de tempo ou recursos foi atingido.
- Reprodução exigir mutação não autorizada (investigador-incidentes).

## Ferramentas suportadas

### Claude Code — SUPORTADO

- **Mecanismo**: `.claude/agents/*.md` (Markdown com frontmatter YAML)
- **Campos confirmados**: `name`, `description`, `tools`, `model`
- **Restrição de ferramentas**: campo `tools` lista permitidas
- **Sandbox por agente**: não nativo; conseguido via restrição de `tools`
- **Delegação**: não possui campo nativo de profundidade; agentes não delegam por padrão
- **Adaptadores criados**: 7 arquivos em `.claude/agents/`

### Codex — SUPORTADO

- **Mecanismo**: `.codex/agents/*.toml` (TOML)
- **Campos confirmados**: `name`, `description`, `developer_instructions`
- **Recurso multi_agent_v2**: ativo (`tool_namespace = "agents"`)
- **max_threads**: 6 (global, em `~/.codex/config.toml`)
- **max_depth**: 1 (preservado quando existente)
- **Sandbox por agente**: não confirmado neste projeto
- **Adaptadores criados**: 7 arquivos em `.codex/agents/`

### Cursor — PARCIAL

- **Mecanismo**: `.cursor/rules/*.mdc` (regras, não agentes)
- **Limitação**: Cursor usa rules como diretrizes de comportamento, não como entidades nomeadas com permissões isoladas
- **Agentes via `use_subagents`**: templates em `docs/agent-templates/` servem como prompts
- **Sem adaptador direto**: a integração ocorre via leitura dos papéis canônicos, não via configuração nativa de agentes
- **Status**: sem adaptador criado; limitação documentada

### Cline — NÃO SUPORTADO PARA AGENTES

- **Mecanismo ativo**: hooks (`.clinerules/hooks/`)
- **Agentes**: Cline não suporta agentes nomeados
- **Modelo**: único por sessão; não fixável por agente
- **Prompt via `use_subagents`**: templates em `docs/agent-templates/` servem como referência
- **Status**: sem adaptador criado; limitação documentada

### OpenCode — NÃO ENCONTRADO

- **Configuração local**: inexistente
- **Configuração global**: inexistente
- **Status**: pendência registrada

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

O `delivery-loop` será o principal orquestrador para entregas de software. Fluxos especializados podem ser chamados diretamente quando aplicável.

## Como validar divergências

1. Compare o adaptador com o papel canônico em `.agents/papeis/`.
2. Se houver conflito, o papel canônico prevalece.
3. Registre a divergência no mapa de adaptadores.
4. Corrija o adaptador para alinhar com o papel.

## Mapa de adaptadores

Ver `.agents/adaptadores/mapa-adaptadores.yaml` para o registro completo e atualizado.
