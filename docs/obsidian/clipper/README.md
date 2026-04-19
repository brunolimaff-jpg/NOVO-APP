# Padrao Operacional - Obsidian Web Clipper

Este documento define o padrao oficial do Senior Scout 360 para clipping operacional no Obsidian.

## Objetivo

Padronizar captura, triagem e promocao de evidencias comerciais em markdown com o Obsidian Web Clipper, mantendo o fluxo auditavel e consistente entre operadores.

## Escopo da Fase 1

- Plataforma suportada: Chromium desktop (`Chrome`, `Edge`, `Brave`).
- Fluxo suportado: `Inbox/WebClips/` -> revisao manual -> `Prospects/<empresa>/`.
- Templates obrigatorios: `template_scout_inbox.json` e `template_scout_prospect.json`.
- Sem automacao por script e sem pipeline MCP nesta fase.

## Politica de governanca

- `GitHub` continua como unica integracao externa de IA do repositorio.
- `Obsidian Web Clipper` e ferramenta operacional oficial (nao e integracao externa de IA).
- `.mcp.json` permanece sem servidores extras nesta fase.

## Pre-requisitos

1. Obsidian Desktop instalado e vault operacional.
2. Extensao oficial Web Clipper instalada no navegador:
   - Chrome/Brave/Edge: [obsidian.md/clipper](https://obsidian.md/clipper)
3. Estrutura minima de pastas no vault:
   - `Inbox/WebClips/`
   - `Prospects/`

## Import dos templates oficiais

1. Abrir a extensao do Obsidian Web Clipper.
2. Entrar em `Templates`.
3. Importar os arquivos:
   - `docs/obsidian/clipper/template_scout_inbox.json`
   - `docs/obsidian/clipper/template_scout_prospect.json`
4. Validar se os templates aparecem com os nomes:
   - `Scout Inbox - WebClip Prospect`
   - `Scout Prospect - Dossie Inicial`

## Contrato publico de captura

### Convencao de nome de arquivo

Formato alvo obrigatorio:

`YYYY-MM-DD_empresa_fonte`

Observacao:
- Os templates geram nome com placeholder de empresa.
- A empresa deve ser preenchida no nome do arquivo antes da promocao para `Prospects/`.

### Frontmatter obrigatorio

Todos os registros devem conter estes campos:

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

## Fluxo operacional oficial

1. Capturar nova fonte com `Scout Inbox - WebClip Prospect` em `Inbox/WebClips/`.
2. Completar placeholders obrigatorios (`prospect`, `owner`, nome do arquivo).
3. Executar checklist de promocao:
   - `docs/obsidian/clipper/PROMOCAO-CHECKLIST.md`
4. Promover a nota para `Prospects/<empresa>/`.
5. Se necessario, usar `Scout Prospect - Dossie Inicial` para captura direta de material ja classificado.

## Politica de sensibilidade

A captura aceita qualquer origem (publica ou autenticada), mas com controle obrigatorio:

- Conteudo sensivel deve passar por redacao/mascaramento antes da promocao.
- Definir `sensitivity: restricted` quando houver dado autenticado, interno ou sensivel.
- Sem redacao + classificacao correta, a nota nao pode sair de `Inbox/WebClips/`.

## Gate de aceite do rollout

Para considerar Fase 1 concluida:

- `2 operadores x 3 capturas ponta a ponta` cada.
- Cada captura deve cobrir:
  - criacao em `Inbox/WebClips/`,
  - checklist completo,
  - promocao para `Prospects/<empresa>/`,
  - classificacao de sensibilidade quando aplicavel.

## Artefatos oficiais desta pasta

- `README.md` — guia operacional e contrato
- `template_scout_inbox.json` — template de captura inicial
- `template_scout_prospect.json` — template de registro classificado
- `PROMOCAO-CHECKLIST.md` — gate de promocao Inbox -> Prospects
