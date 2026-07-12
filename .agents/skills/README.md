# Governança de Skills — Fase 2.5

Esta pasta define a camada canônica de skills do NOVO-APP.

Objetivo: separar **papéis**, **adaptadores**, **skills** e **fluxos**, registrar somente skills auditadas, impedir expansão implícita de autorização e preparar a seleção futura por Cartão de Missão.

## Definições

### Papel canônico

Define **quem executa** e **qual responsabilidade assume**.

Fonte: `.agents/papeis/`

### Adaptador

Define **como uma ferramenta carrega** um papel canônico.

Fontes: `.claude/agents/`, `.codex/agents/`, `.cursor/agents/`, `.opencode/agents/`

### Skill

Define **conhecimento ou procedimento reutilizável** carregado para uma missão específica.

Uma skill pode conter instruções, referências, exemplos, checklists, templates e scripts auxiliares. Uma skill **não** pode conceder autorização, ampliar escrita, habilitar delegação, sobrescrever um papel canônico, permitir merge/deploy por conta própria ou alterar a ordem de precedência.

### Fluxo

Coordena múltiplos passos, papéis ou skills.

Exemplos: `delivery-loop`, `commit-pr`, `review-branch`, `gh-resolve-pr-comments`, `doc-handoff`.

Fluxos **não** são papéis. Quando um fluxo estiver empacotado como skill por limitação de ferramenta, ele deve ser tratado como **exceção controlada**, não como skill genérica elegível à seleção por papel.

## Precedência

1. instrução explícita atual do Bruno
2. `AGENTS.md` e governança do repositório
3. Cartão de Missão
4. papel canônico
5. adaptador
6. skill aprovada
7. configuração global

Uma skill nunca prevalece sobre autorização, condição de parada, papel, escopo de escrita ou instrução explícita do Bruno.

Entradas `tipo: fluxo` não participam da futura seleção automática por missão, mesmo quando tecnicamente estão empacotadas como skill.

## Descoberta

### Escopo local do repositório

- `.agents/skills/`
- `.claude/skills/`
- `.codex/skills/`
- `.cursor/skills/`
- `.opencode/skills/`
- `.cline/skills/`

### Escopo global observado nesta máquina

- `~/.claude/skills/`
- `~/.codex/skills/`
- `~/.config/opencode/` (não possui `skills/` hoje)
- `~/.cursor/` (não possui `skills/` hoje)

O inventário desta fase foi feito em modo somente leitura. Nenhuma skill global foi copiada para o repositório.

## Estado do inventário atual

### Skills locais do repositório

- `delivery-loop` em `.agents/skills/delivery-loop/`
- `supabase-migration` em `.claude/skills/supabase-migration/`
- `validate-gates` em `.claude/skills/validate-gates/`

### Acervo legado local

- `.agents/skills/archive/2026-04-curation/` contém skills históricas importadas, incluindo `api-design`, `debugging-tools`, `frontend-developer`, `observability`, `playwright-testing`, `skill-audit`, `super-brainstorm`, `superhuman` e `test-strategy`

Essas skills **não** são aprovadas por padrão nesta fase. Elas permanecem como referência histórica, sujeitas a auditoria individual posterior.

### Skills globais observadas

- Claude global: `analise-dossie`, `brainstorming`, `commit-pr`, `doc-handoff`, `effort`, `excalidraw-diagram`, `gh-resolve-pr-comments`, `mermaid-visualizer`, `obsidian-canvas-creator`, `source-command-delivery-loop`, `stress-test`, `supabase`, `supabase-migration`, `supabase-postgres-best-practices`, `validate-gates`
- Codex global sistema: `imagegen`, `openai-docs`, `plugin-creator`, `skill-creator`, `skill-installer`

Essas skills globais são **externas ao repositório**. Elas podem ser usadas por conveniência, mas não entram no registry canônico como aprovadas sem auditoria própria.

## Ciclo de vida de uma skill

1. descoberta
2. inventário
3. auditoria de conteúdo
4. auditoria de scripts e rede
5. classificação (`aprovada`, `aprovada-com-restricoes`, `bloqueada`, `legada`, `não-auditada`, `candidata`, `desativada`)
6. registro em `registry.yaml`
7. validação estrutural e de política
8. uso controlado por papel e autorização
9. atualização ou desativação
10. reversão, se necessário

## Regras de aprovação

Uma skill só pode ser `aprovada` ou `aprovada-com-restricoes` quando houver:

- origem identificada
- objetivo claro
- compatibilidade comprovada ou explicitamente restrita
- risco documentado
- impacto em shell, escrita, rede e Git analisado
- enquadramento correto por papel canônico

Sem isso, ela deve ficar como `bloqueada`, `não-auditada`, `candidata` ou `legada`.

## Tipo e seleção

- `tipo: skill` representa conhecimento ou procedimento reutilizável elegível à seleção futura por Cartão de Missão.
- `tipo: fluxo` representa coordenação multi-etapa e deve ter `selecionavel_por_missao: false`.
- Fluxo não pode possuir `papeis_permitidos`.
- Só `skill` com status `aprovada` ou `aprovada-com-restricoes` pode ser `selecionavel_por_missao: true`.

## Regras de autorização

- Skill não concede autorização.
- Skill não transforma leitor em executor.
- Skill com shell ou escrita indireta não pode ser atribuída a papel leitor.
- Skill de migration, PR, commit, deploy ou merge depende da autorização da missão, não do texto da skill.
- Merge continua exigindo A5 e a palavra `MERGE` na mensagem atual.

## Seleção futura por missão

Contrato futuro, ainda **não implementado** nesta fase:

```text
Cartão de Missão
  ↓
Papel canônico
  ↓
Registry de skills aprovadas
  ↓
Filtro por papel, tecnologia, risco e autorização
  ↓
Skill selecionada
  ↓
Adaptador da ferramenta
  ↓
Subagente executa
```

Critérios previstos para seleção futura:

- objetivo da missão
- papel canônico
- escopo permitido
- autorização vigente
- stack detectada
- risco operacional
- compatibilidade com a ferramenta
- custo de contexto
- duplicações
- histórico de sucesso

## Relação futura com o `delivery-loop`

A Fase 2.5 **não integra** o `delivery-loop`.

O `delivery-loop` permanece fora da seleção automática de skills por papel. Ele é tratado como **fluxo** com governança própria e continuará isolado até a fase específica de integração.

## Atualização, desativação e reversão

### Atualização

- auditar origem e conteúdo novamente
- revalidar compatibilidade
- recalcular hash
- atualizar registry e lockfile de forma compatível

### Desativação

- mudar status no registry
- manter histórico e justificativa
- não apagar automaticamente sem autorização explícita

### Reversão

- restaurar o estado anterior do registry e dos arquivos auditados
- registrar o motivo da reversão
- reclassificar a skill

## Arquivos desta camada

- `registry.yaml` — registry canônico de skills auditadas
- `politica-seguranca.md` — regras de segurança e confiança
- `compatibilidade.yaml` — compatibilidade por ferramenta
- `avaliacoes/autoskills.md` — avaliação do `midudev/autoskills`
