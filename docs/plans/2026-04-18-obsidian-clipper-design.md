# Design Spec - Obsidian Clipper Operational Standard

- Data: 2026-04-18
- Contexto: Senior Scout 360
- Tipo: padrao operacional (nao integracao externa de IA)

## 1. Resumo

Estabelecer o Obsidian Web Clipper como padrao oficial de captura operacional para inteligencia comercial, com contrato unico de template, controle de sensibilidade e fluxo de triagem ate promocao para prospects.

Escopo da Fase 1:

- navegador desktop Chromium (`Chrome`, `Edge`, `Brave`);
- promocao manual com checklist;
- sem automacao por script;
- sem pipeline MCP para Obsidian.

## 2. Objetivos e nao objetivos

### Objetivos

- Padronizar a captura inicial em `Inbox/WebClips/`.
- Padronizar promocao para `Prospects/<empresa>/`.
- Garantir metadados minimos obrigatorios em todo recorte.
- Impor redacao obrigatoria para conteudo sensivel.

### Nao objetivos

- Implementar servidor MCP para Obsidian.
- Automatizar classificacao/promocao.
- Alterar a politica de integracao externa de IA (`GitHub` permanece unico padrao).

## 3. Contrato publico de captura

### Convencao de nome

Formato alvo:

`YYYY-MM-DD_empresa_fonte`

### Frontmatter obrigatorio

- `title`
- `source_url`
- `source_domain`
- `captured_at`
- `prospect`
- `status`
- `owner`
- `sensitivity`

### Secoes obrigatorias no corpo

- `Resumo`
- `Sinais PORTA`
- `Evidencias`
- `Proxima acao`

## 4. Fluxo operacional

1. Captura inicial com template de inbox em `Inbox/WebClips/`.
2. Revisao manual de consistencia e preenchimento de placeholders.
3. Aplicacao do checklist oficial de promocao.
4. Promocao para `Prospects/<empresa>/` somente apos gate completo.
5. Uso do template de prospect para materiais ja classificados.

## 5. Politica de sensibilidade

- Fontes publicas e autenticadas podem ser capturadas.
- Quando houver dado sensivel/autenticado:
  - executar redacao/mascaramento obrigatorio;
  - marcar `sensitivity: restricted`;
  - bloquear promocao se a redacao nao estiver concluida.

## 6. Mudancas no repositorio

- Novo pacote oficial em `docs/obsidian/clipper/`:
  - `README.md`
  - `template_scout_inbox.json`
  - `template_scout_prospect.json`
  - `PROMOCAO-CHECKLIST.md`
- Atualizacoes de governanca:
  - `README.md`
  - `AGENTS.md`
  - `CLAUDE.md`
  - `docs/SKILLS-GOVERNANCE.md`
- `.mcp.json` mantido sem alteracoes.

## 7. Testes e aceite

Validacoes obrigatorias:

- import dos templates no Web Clipper sem erro;
- criacao de nota em `Inbox/WebClips/`;
- promocao manual validada por checklist;
- validacao de pelo menos 1 captura autenticada com `sensitivity: restricted`.

Gate final de rollout:

- `2 operadores x 3 capturas ponta a ponta` cada.

## 8. Riscos e mitigacao

- Risco: recorte incompleto por placeholders nao preenchidos.
  - Mitigacao: gate de checklist antes de promocao.
- Risco: exposicao de dados sensiveis em vault.
  - Mitigacao: redacao obrigatoria + classificacao `restricted`.
- Risco: desvio de governanca (MCP extra ad hoc).
  - Mitigacao: manter `.mcp.json` sem extras e reforcar politica em docs centrais.

## 9. Compatibilidade e continuidade

- Mantem o modelo atual de AI ops do repo.
- Nao exige alteracao de lockfiles de skill.
- Nao muda comportamento de runtime da aplicacao.
