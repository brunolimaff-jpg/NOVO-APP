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

**Branch: `main` — PR #285 (`ed5c825`) e PR #286 (`0eb2935`) foram mergeadas. Nao ha PR aberta no GitHub neste momento.**

### Atualizacao 2026-05-25 20:36 — fechamento final do ciclo

- PR #285 mergeada: `ed5c825 feat: show partner CNPJs in societary map (#285)`.
- PR #286 mergeada: `0eb2935 fix: distribuir links inline no texto para maior auditoria (#286)`.
- `gh pr list --state open` retornou lista vazia.
- Estado local: `main` alinhada com `origin/main`, sem arquivos modificados antes desta baixa documental final.
- Pendencias que sobram para proximo ciclo: `SUPABASE_SERVICE_ROLE_KEY` na Vercel Preview, smoke de preview mais forte para inventario vazio/degradado, reestruturacao da Teia CNPJ como modulo de dominio, PR #266/UX quando voltar para essa trilha.

### Atualizacao 2026-05-25 17:35 — pos-merge da #285 e validacao da #286

- PR #285 mergeada por squash em `main`: `ed5c825 feat: show partner CNPJs in societary map (#285)`.
- PR #286 era a unica PR aberta restante.
- Pendencias encontradas na #286: 3 threads do Gemini Code Assist e falha no job `Tests` por snapshot de prompt desatualizado.
- Correcoes aplicadas na #286: remover `useMemo` dentro de `map`, preservar titulo quando URL falsa e descartada, deduplicar fontes com URL normalizada e atualizar golden de prompts.
- Validacao da #286: recortes, `validate-prompts.sh`, `typecheck`, `npm run test`, `npm run build` e `npm run lint` passaram localmente; apos push `ee74d35`, GitHub ficou `CLEAN` com Typecheck, Dossier Golden, Tests, Build, GitGuardian, Vercel, Vercel Preview Comments e Smoke Preview verdes.
- As 3 threads do Gemini Code Assist na #286 foram respondidas e resolvidas.

### Atualizacao 2026-05-25 17:05 — fechamento documental da Teia

- PR #285 esta `CLEAN` no GitHub com checks remotos verdes.
- Fonte atual do fechamento: `docs/obsidian/decisions/FECHAMENTO-TEIA-CNPJ-PR285-2026-05-25.md`.
- Nenhum P0 conhecido continua bloqueando a #285 depois da validacao por proxy/local.
- Status superado pelo fechamento de 20:36: #285 e #286 ja foram mergeadas. Pendencias atuais sao cache persistente, smoke de preview mais forte e reestruturacao da Teia como modulo de dominio.

### Atualizacao 2026-05-25 16:45 — limpeza visual final da Teia

- Matriz societaria removeu a coluna/badge visual `CNPJ lateral do socio`; agora exibe `EMPRESA`, `CNPJ`, `CNAE` e colunas de socios.
- `Tabela` e `Grafo` usam os mesmos nomes curtos de socios (`Gilliard`, `Elizeu`, `Guilherme`, `Gislayne`, `Scheffer`, `Carolina`).
- Renderer remove da mensagem exibida e do copiar:
  - secao `Outros CNPJs onde o socio aparece`;
  - linha textual `Outros CNPJs:`;
  - secao `Alertas de validacao societaria`;
  - texto `Vinculo do socio; grupo nao confirmado`.
- `/api/socio-search` teve cache versionado para `v7-structured-lateral-cnpj` para escapar do cache persistente antigo.
- `.env.local` local aponta o proxy Vite para a preview da PR, inclui `VERCEL_AUTOMATION_BYPASS_SECRET` sem versionar segredo, e continua ignorado pelo Git.
- Validacao local: recorte Vitest da teia `88` testes, `validate-prompts.sh` `59` testes, `typecheck`, `lint` com 5 warnings preexistentes, `build`.
- Browser local `http://127.0.0.1:3000/`: DOM confirmou que a matriz nao mostra `Relação`, `CNPJ lateral do socio`, `Outros CNPJs`, `Alertas` nem `Vinculo...`; depois de alternar `Grafo -> Tabela`, a matriz exibiu `18` CNPJs laterais.
- API via proxy local apos deploy da PR: `GUILHERME MOGNON SCHEFFER` retornou `15` empresas, `5` rejeitadas, `degraded: false`; amostra com `partner_other_cnpj` e `rootContext: false`.

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
| P1 | Heuristica de side business pode precisar refinamento com dados reais de outras empresas | features/dossier/societaryCategories.ts |
| P1 | `SUPABASE_SERVICE_ROLE_KEY` nao configurada na Preview — cache persistente indisponivel | Vercel env / Supabase |
| P1 | Smoke de preview deve falhar quando todos os socios retornarem `companies: 0` ou payload degradado sem inventario util | scripts / GitHub Actions |
| P1 | Reestruturar Teia CNPJ como boundary de dominio unico | api + features/dossier + prompts |
| P2 | Ordenacao por coluna na tabela — futura iteracao | SocietaryMatrix.tsx |
| P2 | Clique na linha → expandir detalhes de evidencia — futura iteracao | SocietaryMatrix.tsx |
| P2 | Entidades internacionais sem link de auditoria — "Conexao INFERIDA" sem comprovacao documental | prompts/mega/specialist-prompts.ts |
| P2 | Mermaid no contrato e condicional ("quando houver dados"), deveria ser obrigatorio | prompts/mega/builders.ts |

## Immediate next step

1. Configurar `SUPABASE_SERVICE_ROLE_KEY` na Vercel Preview para cache persistente de `/api/socio-search`.
2. Criar smoke de preview que falhe quando o inventario da Teia voltar vazio/degradado.
3. Planejar a reestruturacao da Teia CNPJ como boundary de dominio unico.
4. Retomar PR #266/UX quando essa trilha voltar para prioridade.
