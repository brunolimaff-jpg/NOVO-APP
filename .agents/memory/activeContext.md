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

**Sessao de consolidacao de prompts + correcao de anti-alucinacao CONCLUIDA em 2026-05-24.**

Branches envolvidas:
- `codex/prompt-consolidation-v6` (PR #282) — consolidacao de prompts, correcao de regressao, anti-fabrication
- `fix/war-room-rag-antialucinacao` — anti-alucinacao para war room e RAG
- PR #283 — unificacao das duas branches anteriores

### Fases executadas:

**Fase 1 — Diagnostico com 4 agentes em paralelo:**
- Debugger: A2 feeds ignorados, decimal quebra parsing, output_contract conflitante com especialistas
- RAG-Gemini: temperature nao passada (API default 1.0), recomendou 0.1 + system instruction separada
- UI-UX: 18 gatilhos repetidos no dossier, abordagem comercial diluida
- Explore: waterfall repete foundation 7-9x (~109K tokens), golden dossier 452 linhas

**Fase 2 — Consolidacao:**
- 5 blocos de traducao -> 1 (`SHARED_COMMERCIAL_INTELLIGENCE_ENGINE`)
- `MASTER_INVESTIGATION_ORCHESTRATOR_V5` removido -> REGRESSAO no mapa societario -> RESTAURADO
- `PROMPT_CAMINHO_DE_VENDA` criado como novo modulo
- Contrato de output V2: modulos sem gatilhos individuais
- Mermaid classDef removido dos especialistas

**Fase 3 — Anti-alucinacao:**
- `<anti_fabrication_rules>`, `<refusal_protocol>`, `<evidence_scope_protocol>`, `<fact_vs_inference_examples>`
- Temperature 0.1 em `proxyChatSendMessage`
- Queries de bioinsumos, mineracao, mercado de capitais

**Fase 4 — Bug do Mapeamento:**
- CAMINHO DE VENDA mapeado para `PROMPT_RH_SINDICATOS_GOD_MODE` (prompt de RH/SST!) no waterfall-orchestrator.ts
- Corrigido para `PROMPT_CAMINHO_DE_VENDA`

## Current implementation branch

**Branch atual: `codex/cnpj-socios-todos-cnpjs` — hotfix P0 de Teia CNPJ em revisao apos regressao de profundidade em preview.**

Escopo do hotfix:
- `/api/socio-search` passa a extrair todos os CNPJs validos do perfil do socio, mesmo quando o snippet ja tinha um CNPJ, e retorna excedentes sem lookup oficial como CNPJ pendente (`relationshipScope: unconfirmed`, `validationStatus: pending`, `rawCnpjLabel` com `*`), nao como CNPJ oficial.
- Cache versionado para `v6-pending-cnpj-diagnostics` para nao reutilizar respostas antigas que escondiam CNPJs, traziam nomes truncados ou promoviam CNPJ nao confirmado.
- Nome oficial truncado como `Cia Ltda` nao entra mais no payload; a API usa razao inferida do bloco do CNPJ ou fallback `Empresa CNPJ ##.###.###/####-##`.
- Diagnostico explicito de parcialidade: `diagnostics.totalCnpjsFound`, `diagnostics.truncated`, `diagnostics.truncatedReason`; a UI mostra aviso de inventario parcial.
- `teia-deep` proibe amostragem (`10 mais relevantes`) e exige inventario parseavel, inclusive tabela `Outros CNPJs onde o socio aparece`.
- `teiaTextParser` le varias tabelas, aceita coluna legada `CNPJ / Tipo` e mapeia tabela de outros CNPJs como `partner_other_cnpj`.
- `societaryGraph` preserva CNPJs laterais por CNPJ exato, rejeita nomes sem identidade real e rotula `Outro CNPJ do socio` sem aresta raiz -> empresa.
- CNPJ inferido/não confirmado pode aparecer no dossiê como `##.###.###/####-##*`, mas o parser/grafo/UI tratam como validação pendente, confiança fraca, nó tracejado no Mermaid, sem selo `oficial` e sem aresta forte de grupo.
- Diagnóstico de busca distingue `searchNoResultCount` de `searchFailureCount`, para separar “sem resultado encontrado” de falha/degradação de busca.

Validacao local ja executada:
- `./scripts/validate-prompts.sh` verde (56 testes) em 2026-05-25
- `npm run typecheck` verde
- Recorte Vitest verde em 2026-05-25: `tests/api-open-web-search.test.ts`, `tests/features/dossier/SocietaryMap.test.tsx`, `tests/features/dossier/teiaTextParser.test.ts`, `tests/features/dossier/societaryGraph.test.ts`, `tests/api-socio-search.test.ts`, `tests/prompts/megaPrompts.test.ts` (91 testes)
- `npm run build` verde com warning conhecido de chunks grandes
- PR checks remotos verdes no commit `d743c77`: Typecheck, Tests, Dossier Golden, Build, GitGuardian, Vercel, Vercel Preview Comments e Smoke Preview.
- `gh pr view 285` em 2026-05-25: `mergeStateStatus: CLEAN`, sem review threads inline abertas; Gemini Code Assist sem feedback acionavel. Mesmo assim, **nao mergear ainda**.
- Preview Scheffer `04.733.767/0001-80` validada em 2026-05-25 09:30 -04: `/api/cnpj` retornou `SCHEFFER & CIA LTDA`, Sapezal/MT e 6 socios; `/api/open-web-search` retornou `OpenWebSearch/DdgDegraded`, DuckDuckGo `empty_result`, `contentLength: 0`; `/api/socio-search` retornou 0 empresas para todos os 6 socios, `degraded: true`, `pagesFetched: 0`, `searchFailureCount: 6`, `cacheSource: memory`.
- Decisao do Bruno mantida: remover Brave do codigo e deixar busca web somente em DuckDuckGo Lite, ignorando `BRAVE_SEARCH_API_KEY` mesmo que a env continue cadastrada na Vercel. Licao atual: DuckDuckGo-only remove a dependencia ruim, mas nao resolve a profundidade por si so.
- A causa operacional de cache ainda inclui `SUPABASE_SERVICE_ROLE_KEY` existente em Production e em uma preview de outra branch, nao na preview geral/branch `codex/cnpj-socios-todos-cnpjs`.

## Problemas residuais da sessao

| Prioridade | Problema | Arquivo/Modulo |
|------------|----------|----------------|
| P0 | PR #285 nao esta pronta para merge: preview atual retorna 0 empresas para todos os 6 socios Scheffer em `/api/socio-search`, apesar de checks verdes e `/api/cnpj` OK | api/socio-search.ts, utils/documentExtractor.ts, api/open-web-search.ts, Vercel Preview |
| Validado localmente nesta branch | Todos os CNPJs validos encontrados para socios aparecem com escopo explicito `partner_other_cnpj`; nomes truncados como `Cia Ltda` sao substituidos/rejeitados; parser/prompt nao podem mais amostrar inventario; UI avisa inventario parcial. Isso protege dados encontrados, mas nao resolve a ausencia de fonte na preview | api/socio-search.ts, features/dossier/societaryGraph.ts, features/dossier/SocietaryMap.tsx, features/dossier/teiaTextParser.ts, prompts/mega/teia-deep.ts, prompts/mega/teia-identity.ts, prompts/mega/specialist-prompts.ts |
| P1 | Entidades internacionais sem link de auditoria — "Conexao INFERIDA" sem comprovacao documental | prompts/mega/specialist-prompts.ts |
| P2 | Mermaid no contrato e condicional ("quando houver dados"), deveria ser obrigatorio | prompts/mega/builders.ts |

## Immediate next step

1. Nao mergear PR #285 ate a profundidade real ser recuperada.
2. Investigar `performWebSearch`/DuckDuckGo Lite na Vercel: HTML vazio, bloqueio, rate-limit, parser quebrado ou User-Agent.
3. Definir fonte confiavel para consulta por socio; DuckDuckGo-only nao esta suficiente na preview.
4. Configurar/validar `SUPABASE_SERVICE_ROLE_KEY` na Vercel para cache persistente de `/api/socio-search`.
5. Atualizar Smoke Preview para falhar quando todos os 6 socios Scheffer retornarem `companies: 0`.
6. Manter `docs/obsidian/decisions/LICOES-APRENDIDAS-TEIA-CNPJ-2026-05-24.md` como guia de prevencao para novas regressoes nessa trilha.
