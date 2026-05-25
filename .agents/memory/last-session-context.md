# Last Session Context
Saved: 2026-05-25

## Git
Branch: codex/cnpj-socios-todos-cnpjs | HEAD: 2e1e986 | PR #285 (OPEN)

## Resumo da sessao
Nova sessao focada em fechar o ciclo da PR #285. O estado atual mudou: CNPJ Aberto resolveu a fonte de dados, mas revelou P0 semantico de escopo.

### Atualizacao 2026-05-25 16:01 — Onde paramos

- PR #285 continua aberta e nao deve ser mergeada ate validar preview.
- Achado P0: QSA/CNPJ Aberto confirma `socio -> CNPJ`, nao `CNPJ -> grupo`.
- Laterais agora devem aparecer como `CNPJs laterais` / `CNPJ lateral do socio`, nunca `Proprias` ou `Side business`.
- Historico diario append-only criado em `docs/obsidian/daily/`.
- Nota principal: `docs/obsidian/decisions/ACHADO-P0-TEIA-CNPJ-ESCOPO-2026-05-25.md`.
- Recorte Vitest da teia passou com 91 testes; `validate-prompts.sh`, `typecheck`, `lint` e `build` passaram localmente.

> O bloco abaixo preserva o snapshot anterior da PR #285 e nao libera merge sem a validacao P0 acima.

### CNPJ Aberto API Integration
- **Problema resolvido:** busca de CNPJs por nome de socio retornava vazio ou alucinado
- **Solucao:** integracao com [CNPJ Aberto](https://cnpjaberto.com.br) (API gratuita, 1000 queries/dia)
- **Endpoint:** `GET /api/socio/empresas?nome={name}&limit=50`
- **Env var:** `CNPJABERTO_API_KEY` configurada na Vercel preview
- **Pipeline atual:**
  ```
  CNPJ Aberto API → consultasocio.com (fallback) → Gemini Search Grounding → DuckDuckGo (final fallback)
  ```
- **Arquivos alterados:** `utils/documentExtractor.ts` (funcao `searchCnpjAberto()`, linhas 324-381), `api/socio-search.ts` (CNPJ Aberto como primeira fonte), `tests/api-socio-search.test.ts` (`searchFailureCount: 2 → 3`)

### SocietaryMatrix (Tabela Societaria)
- **Novo arquivo:** `features/dossier/SocietaryMatrix.tsx` (376 linhas) — tabela com filtros, colunas CNPJ/CNAE, dots de socios
- **Novo arquivo:** `features/dossier/societaryCategories.ts` (~60 linhas) — `classifyCompany()`, `isSideBusiness()`, `countByCategory()`
- **Modificado:** `features/dossier/SocietaryMap.tsx` — toggle Tabela | Grafo, enriquecimento CNAE via `lookupCnpj()` batch de 5
- **Tests:** `tests/features/dossier/SocietaryMap.test.tsx` — clique "Grafo" antes de testes Mermaid

### Funcionalidades da Tabela
- Layout 5 colunas: Empresa | Grupo | CNPJ | CNAE | [dots socios]
- Classificacao: Estrategico (3+ socios), Operacoes (2 socios), Proprias (1 socio)
- Filtros: Todos + pills de categoria + pills de socio (AND)
- Filtros condicionais: mostra apenas categorias com >0 empresas
- Enriquecimento CNAE: batch background de 5 via `lookupCnpj()`, fire-and-forget
- Dots de socio: preenchido = compartilhado, borda tracejada = side business, vazio = sem conexao
- Suporte a dark mode
- Legenda com cores dos socios

### Email autocomplete
- `components/GreetingWelcomeScreen.tsx` — carrega ultimo email usado do IndexedDB ao montar

### Mockup validation
- `mockups-mermaid.html` — validado design da tabela com usuario
- 16 empresas ativas mapeadas para grupo Scheffer em 5 socios

## Decisoes arquiteturais da sessao
1. **Mermaid + Table sao complementares** — Table mostra distribuicao/CNAE/CNPJ, Mermaid mostra relacoes de aresta. Toggle entre elas.
2. **CNAE enrichment no frontend** — reusa `lookupCnpj()` com batch de 5, nao bloqueia UI
3. **View padrao: Table** — preferencia do usuario
4. **Empresas inativas excluidas** — "Baixada" filtradas
5. **Sem mudancas no backend** — todas as features sao frontend-only

## Mudancas pendentes
- Validacao da preview pendente para provar que CNPJ lateral nao vira grupo
- Ordenacao por coluna (futura iteracao)
- Clique na linha → expandir detalhes de evidencia (futura iteracao)
- PR #285 merge somente apos validacao do P0 na preview
- Merge PR #286 (links inline auditaveis)

## Recuperacao
Na proxima sessao, recovery-context.sh vai ler HANDOFF_AI.md,
activeContext.md e decisions.md automaticamente.
