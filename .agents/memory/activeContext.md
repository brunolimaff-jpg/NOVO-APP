# Active Context

Last updated: 2026-05-25

## Current operating context

This repo uses repo-local memory plus canonical handoff docs so sessions can resume on any machine.

Read order:

1. `AGENTS.md`
2. `HANDOFF_AI.md`
3. `.agents/memory/activeContext.md`
4. `.agents/memory/progress.md`
5. `.agents/memory/decisions.md`
6. `docs/ai-context/refactor/02-BOARD.md`
7. `docs/obsidian/00-MASTER.md` for visual navigation only

## Current operating phase

**Branch: `codex/cnpj-socios-todos-cnpjs` — PR #285 BLOQUEADA por achado P0 semantico ate preview atualizado validar. Localmente o contrato ja foi corrigido: CNPJ lateral nao vira empresa do grupo, textos inseguros foram removidos e a matriz nao duplica filtros.**

### Atualizacao 2026-05-25 16:45 — limpeza visual final da Teia

- Matriz societaria removeu a coluna/badge visual `CNPJ lateral do socio`; agora exibe `EMPRESA`, `CNPJ`, `CNAE` e colunas de socios.
- `Tabela` e `Grafo` usam os mesmos nomes curtos de socios (`Gilliard`, `Elizeu`, `Guilherme`, `Gislayne`, `Scheffer`, `Carolina`).
- Renderer remove da mensagem exibida e do copiar:
  - secao `Outros CNPJs onde o socio aparece`;
  - linha textual `Outros CNPJs:`;
  - secao `Alertas de validacao societaria`;
  - texto `Vinculo do socio; grupo nao confirmado`.
- `/api/socio-search` teve cache versionado para `v7-structured-lateral-cnpj` para escapar do cache persistente antigo.
- `.env.local` local aponta o proxy Vite para a preview da PR e continua ignorado pelo Git.
- Validacao local: recorte Vitest da teia `88` testes, `validate-prompts.sh` `59` testes, `typecheck`, `lint` com 5 warnings preexistentes, `build`.
- Browser local `http://127.0.0.1:3000/`: DOM confirmou que a matriz nao mostra `Relação`, `CNPJ lateral do socio`, `Outros CNPJs`, `Alertas` nem `Vinculo...`. A busca estruturada ainda depende do deploy atualizado da PR para a API recomputar sem cache antigo.

### Atualizacao 2026-05-25 16:01 — Achado P0 Teia CNPJ

- QSA oficial / CNPJ Aberto confirma `socio -> CNPJ`, nao `CNPJ -> grupo`.
- `partner_other_cnpj` deve aparecer como `CNPJ lateral do socio`, com `rootContext: false`.
- Proibido chamar lateral de `Proprias`, `Side business`, `veiculo operacional`, bioinsumos, verticalizacao, enterprise ou wedge Senior.
- Fonte principal do contexto: `docs/obsidian/decisions/ACHADO-P0-TEIA-CNPJ-ESCOPO-2026-05-25.md`.
- Historico diario append-only: `docs/obsidian/daily/INDEX.md`.
- Gates locais verdes: `validate-prompts.sh`, recorte Vitest da teia (91 testes), `typecheck`, `lint` e `build`.

> O snapshot abaixo sobre CNPJ Aberto/SocietaryMatrix preserva o estado anterior da PR #285. Nao usar como liberacao de merge sem validar o P0.

### Resumo do que foi feito nesta sessao

#### CNPJ Aberto API (resolve o bug principal da PR #285)
- Integracao com [CNPJ Aberto](https://cnpjaberto.com.br) — API gratuita (1000 queries/dia)
- Endpoint: `GET /api/socio/empresas?nome={name}&limit=50`
- Env var: `CNPJABERTO_API_KEY` configurada na Vercel preview
- `searchCnpjAberto()` em `utils/documentExtractor.ts` (linhas 324-381)
- Pipeline atualizado em `api/socio-search.ts`: CNPJ Aberto como primeira fonte

#### SocietaryMatrix (Tabela Societaria)
- **Novo:** `features/dossier/SocietaryMatrix.tsx` (376 linhas) — tabela completa com filtros
- **Novo:** `features/dossier/societaryCategories.ts` (~60 linhas) — classificacao de empresas
- **Modificado:** `features/dossier/SocietaryMap.tsx` — toggle Tabela | Grafo, CNAE enrichment
- **Tests:** `tests/features/dossier/SocietaryMap.test.tsx` atualizados

#### Funcionalidades da tabela
- 5 colunas: Empresa | Grupo | CNPJ | CNAE | dots de socios
- Categorias: Estrategico (3+), Operacoes (2), Proprias (1)
- Filtros: categoria (AND) + socio (AND)
- CNAE enrichment: batch de 5, fire-and-forget
- Dots com significado visual (preenchido/tracejado/vazio)
- Dark mode
- Empresas inativas excluidas

#### Mockup validation
- `mockups-mermaid.html` validado com usuario
- 16 empresas ativas para Scheffer em 5 socios

### Pipeline de busca atual

```
/api/socio-search (runSearch)
  |
  +-> searchCnpjAberto(socioName)              [Primaria: CNPJ Aberto API, funciona local + Vercel]
  |
  +-> searchConsultasocioDirect(socioName)      [Fallback 1: funciona local, BLOQUEIA Vercel]
  |
  +-> performGeminiSearch(query, apiKey)         [Fallback 2: Gemini URL-only + scrape]
  |
  +-> performDuckDuckGoSearch(query)             [Fallback 3: pode retornar empty_result na Vercel]
```

- **CNPJ Aberto**: Funciona em ambos ambientes (local e Vercel). Primeira tentativa.
- **consultasocio.com**: Fallback quando CNPJ Aberto retorna vazio. Funciona local, bloqueia Vercel.
- **Gemini Search v2**: Fallback secundario. URL discovery + scrape direto. Zero alucinacao.
- **DuckDuckGo Lite**: Fallback final. Gratuito, pode retornar `empty_result` na Vercel.

### Estado dos ambientes

| Ambiente | Pipeline de busca | Status |
|----------|-------------------|--------|
| Local | CNPJ Aberto → consultasocio → Gemini → DDG | OK |
| Vercel Preview | CNPJ Aberto → Gemini → DDG (consultasocio bloqueia) | Deploy buildando |
| Producao (futuro) | CNPJ Aberto → Gemini → DDG | Depende de env vars |

### Dependencias de configuracao

1. `CNPJABERTO_API_KEY` — Configurada na Vercel preview. Necessaria para CNPJ Aberto funcionar.
2. `GEMINI_API_KEY` — Necessaria para Gemini Search Grounding (fallback).
3. `SUPABASE_SERVICE_ROLE_KEY` — Necessaria para cache persistente. Nao configurada.

### Arquivos alterados nesta sessao (diff 6d49b28..2e1e986)

- `features/dossier/SocietaryMatrix.tsx` — NOVO (376 linhas)
- `features/dossier/societaryCategories.ts` — NOVO (~60 linhas)
- `features/dossier/SocietaryMap.tsx` — toggle Tabela | Grafo, CNAE enrichment
- `utils/documentExtractor.ts` — `searchCnpjAberto()` (linhas 324-381)
- `api/socio-search.ts` — CNPJ Aberto como primeira fonte
- `components/GreetingWelcomeScreen.tsx` — email autocomplete do IndexedDB
- `tests/features/dossier/SocietaryMap.test.tsx` — clique "Grafo" antes de testes Mermaid
- `tests/api-socio-search.test.ts` — `searchFailureCount: 2 → 3`

### Validacao local executada

- `npm run typecheck` — verde
- `npm run test` — verde (128 arquivos, 1086 testes)
- `npm run lint` — verde
- `npm run build` — verde (preview buildando na Vercel)

### Problemas residuais

| Prioridade | Problema | Arquivo/Modulo |
|------------|----------|----------------|
| P0 | Validacao da preview pendente — deploy ainda buildando, confirmar CNPJ Aberto funcionando na Vercel | Vercel Preview / CNPJ Aberto |
| P1 | Heuristica de side business pode precisar refinamento com dados reais de outras empresas | features/dossier/societaryCategories.ts |
| P1 | `SUPABASE_SERVICE_ROLE_KEY` nao configurada na Preview — cache persistente indisponivel | Vercel env / Supabase |
| P2 | Ordenacao por coluna na tabela — futura iteracao | SocietaryMatrix.tsx |
| P2 | Clique na linha → expandir detalhes de evidencia — futura iteracao | SocietaryMatrix.tsx |
| P2 | Entidades internacionais sem link de auditoria — "Conexao INFERIDA" sem comprovacao documental | prompts/mega/specialist-prompts.ts |
| P2 | Mermaid no contrato e condicional ("quando houver dados"), deveria ser obrigatorio | prompts/mega/builders.ts |

## Immediate next step

1. Validar preview Vercel com Scheffer `04.733.767/0001-80`:
   - laterais aparecem como `CNPJs laterais`;
   - nenhum lateral aparece como `Próprias`/`Side business`;
   - grafo nao cria aresta `Root -> company` para lateral;
   - narrativa nao usa lateral como tese operacional/bioinsumos/verticalizacao.
2. **Se P0 validado:** merge da PR #285 em main.
3. Merge PR #286 (links inline auditaveis).
4. Configurar `SUPABASE_SERVICE_ROLE_KEY` na Vercel para cache persistente.
