# Active Context

Last updated: 2026-05-24

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

**Sessao adicional: automacao de validacao E2E (Scripts + Playwright + curl).**

Arquivos criados:
- `tests-e2e/cnpj-investigation-flow.spec.ts` — teste Playwright E2E: CNPJ Scheffer, lookup BrasilAPI, investigacao Gemini, assercao de resposta > 50 chars, rejeicao de CNPJ invalido
- `scripts/validate-preview.sh` — script curl: health check GET /, CNPJ lookup GET /api/cnpj, validacao JSON (companyName/city/state/cnae), print PASS/FAIL colorido

Arquivos alterados:
- `package.json` — scripts `test:e2e:cnpj` e `validate:preview`
- `playwright.config.ts` — suporte a `BASE_URL` env var, salta webServer quando URL externa, timeout 180s

Arquivos alterados anteriormente nesta sessao:
- `prompts/megaPrompts.ts` — consolidacao, anti-fabrication, correcao de exports
- `prompts/mega/foundation.ts` — blocos de traducao unificados
- `prompts/mega/builders.ts` — PROMPT_CAMINHO_DE_VENDA
- `prompts/mega/specialist-prompts.ts` — classDef removido, anti-fabrication
- `tests/prompts/megaPrompts.test.ts` — testes atualizados
- `services/storage.ts` — ajustes de teste
- `tests/services/storage.test.ts` — testes atualizados

## Problemas residuais da sessao

| Prioridade | Problema | Arquivo/Modulo |
|------------|----------|----------------|
| Resolvido nesta branch | CNPJs dos socios aparecem com escopo explicito `partner_other_cnpj`, sem afirmar grupo economico; raiz/filiais de mesmo radical nao viram empresa relacionada; `scripts/validate-prompts.sh` cobre prompt/parser/grafo | api/socio-search.ts, lib/cnpjLookup.ts, features/dossier/societaryGraph.ts, features/dossier/SocietaryMap.tsx, scripts/validate-prompts.sh |
| P1 | Entidades internacionais sem link de auditoria — "Conexao INFERIDA" sem comprovacao documental | prompts/mega/specialist-prompts.ts |
| P2 | Mermaid no contrato e condicional ("quando houver dados"), deveria ser obrigatorio | prompts/mega/builders.ts |

## Immediate next step

1. Aguardar review/merge da PR #285 (`codex/cnpj-socios-todos-cnpjs`); CI/Vercel/Smoke preview estao verdes no commit `b238f25`.
2. Depois do merge, fazer a baixa documental separada das pendencias antigas de CNPJ/PRs ja mergeadas.
3. Configurar/validar `SUPABASE_SERVICE_ROLE_KEY` na Vercel para cache persistente de `/api/socio-search`.
4. Resolver problemas residuais P1/P2 restantes acima.
