# Roadmap — Senior Scout 360

**Atualizado:** 13/05/2026 | **Ondas 1, 2 e 3 concluídas** ✅

---

## ✅ Onda 1 — Críticos de IA

| Item | O quê | Arquivos | Status |
|---|---|---|---|
| 1.1 | Loop RAG fechado — extração web quando metadata vazio | `api/docs-rag.ts`, `utils/documentExtractor.ts` | ✅ |
| 1.2 | Sinal de contexto vazio nos handlers RAG | `api/docs-rag.ts`, `api/rag.ts` | ✅ |
| 1.3 | Score mínimo elevado (0.60 docs, 0.55 propostas) | `api/docs-rag.ts`, `api/rag.ts` | ✅ |
| 1.4 | Guard anti-alucinação no buildExtraContext | `services/gemini/investigation-orchestration.ts` | ✅ |
| — | ExtractWithTimeout real (Promise.race) | `api/docs-rag.ts` | ✅ |
| — | Testes (3 arquivos, 19 casos) | `tests/api-docs-rag.test.ts`, `tests/api-rag.test.ts`, `tests/services/investigation-anti-hallucination.test.ts` | ✅ |

---

## ✅ Onda 2 — Refatoração (duplicação + centralização)

| Item | O quê | Arquivos | Status |
|---|---|---|---|
| 2.1 | Extrair utilitários Gemini duplicados | `services/gemini/shared.ts` (novo) | ✅ |
| 2.2 | Unificar lógica RAG | `services/gemini/rag-shared.ts` (novo) | ✅ |
| 2.3 | Centralizar modelo `gemini-3-flash-preview` | 6 arquivos → `config/models.ts` | ✅ |
| 2.4 | Remover `any` dos handlers | `api/gemini.ts` (Chat + GenerateContentResponse), `api/radar-scan.ts` (RadarAlert + CategoryStats) | ✅ |

**Linhas eliminadas:** ~100 linhas de duplicação. 2 novos módulos compartilhados. Zero `any` nos handlers de API.

---

## ✅ Onda 3 — Bundle & performance

| Item | O quê | Resultado | Status |
|---|---|---|---|
| 3.1 | Lazy-loading dos prompts mega | `megaPrompts.ts` → barrel assíncrono com `loadFoundationBlocks()`, `loadSpecialistPrompts()`, `loadBuilders()` | ✅ |
| 3.1 | Consumidores migrados | `ChatInterface.tsx`, `DeepDiveTopics.tsx`, `waterfall-orchestrator.ts`, `porta-reconciliation.ts` → `await import()` | ✅ |
| 3.1 | Teste migrado | `megaPrompts.test.ts` → 15/15 passando com async loaders | ✅ |
| 3.2 | RevenueIntelligence → React.lazy | `CRMDetail.tsx` — último componente pesado sem code-splitting | ✅ |
| 3.2 | WarRoom/RadarPanel/InvestigationDashboard | Já eram `React.lazy()` em `ChatPanels.tsx` (confirmado) | ✅ |
| 3.3 | Quebrar monolito `radar-scan.ts` | Adiado — precisa de cobertura de testes primeiro | ⏸️ |

**Build:** `foundation-*.js` (48.92 KB gzip 19.24) + `specialist-prompts-*.js` (66.89 KB gzip 23.29) extraídos como chunks separados. **~116 KB removidos do bundle inicial.**

---

## 📋 Backlog (pós-varredura)

| Item | Descrição |
|---|---|
| 3.3 | Quebrar monolito `radar-scan.ts` (precisa de testes antes) |
| P2.1 | API Interactions (Beta Google) para loading granular via `execution_steps` |
| P2.2 | Encadeamento de dossiês com `previous_interaction_id` |
| P3.2 | `background=true` para Deep Research async |
| P3.4 | Re-indexação do Pinecone `senior-erp-docs` com conteúdo real |

---

## ⚠️ Próximo passo

1. Commit + push + PR
2. Deploy para Vercel e validação em produção
3. Rodar bateria completa (851 testes) antes do push
