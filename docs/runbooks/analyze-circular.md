# Runbook — Análise de dependências circulares (`analyze:circular`)

## Comando

```bash
npm run analyze:circular
```

Executa `madge --circular . --extensions ts,tsx` com exclusões de worktrees e
artefatos de governança (ver abaixo).

## Exit codes (comportamento do Madge — não é falha)

- `0` — nenhum ciclo de dependência encontrado.
- `1` — **ciclos encontrados**. O Madge usa `exit 1` para sinalizar a
  descoberta de ciclos. Em automação/CI, trate `1` como *alerta de análise*,
  não como erro de infraestrutura; o output lista cada ciclo.

## Exclusões

O script exclui, além de `node_modules`, `dist`, `.next`, `public` e
`coverage`:

- `.claude/`, `.codex/`, `.cursor/`, `.opencode/`, `.zcode/`, `.clinerules/` —
  adaptadores de agentes e **worktrees clonados** (`.claude/worktrees/*`).
- `.agents/`, `.agent/` — governança/orquestração.
- `work-` — diretórios de trabalho (ex.: `work-vercel-runtime-fix/`,
  `work-golden-contract-clean/`).
- `docs/` — documentação (sem código TS/TSX).

**Por quê:** sem essas exclusões o mesmo ciclo real é duplicado por cada
worktree. Exemplo medido em 2026-08-06: sem exclusões, 41 ciclos reportados
(40 repetições de `societaryGraph.ts ⇄ buildSocietaryMermaid.ts` em worktrees)
sobre 19.489 arquivos processados; com exclusões, 1 ciclo real sobre 486
arquivos. O tempo de execução varia com cache/máquina (medido de ~51s a
~2m36s), mas o escopo de processamento cai ~40x.

## Interpretação

Todo ciclo listado deve ser conferido no diff/código antes de classificar como
risco (o ciclo pode ser intra-arquivo de tipos, import de tipo, ou já
conhecido). Ciclo real atual do app (2026-08-06):

```text
features/dossier/societaryGraph.ts ⇄ features/dossier/buildSocietaryMermaid.ts
```

## Grafo de imports / hubs

Para hubs e dependentes (sem ciclos), o JSON do grafo:

```bash
node_modules/.bin/madge --json . --extensions ts,tsx \
  --exclude '^(node_modules|dist|\.next|public|coverage|\.claude|\.codex|\.cursor|\.opencode|\.zcode|\.clinerules|\.agents|\.agent|work-|docs)' \
  > /tmp/madge-graph.json
```

Referência histórica: comparação Codemap vs Madge (2026-08-06) concluiu manter
Madge para dependências/ciclos e não adotar Codemap no Scout (ruído de
worktrees no working tree sujo e ausência de achados exclusivos).
