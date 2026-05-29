---
type: licoes-aprendidas
area: debug-teia
data: 2026-05-23
sessao: teia-societaria-alucinacao
tags:
  - licao
  - gemini
  - alucinacao
  - teia-societaria
  - busca-web
  - serverless
  - temperatura
  - entidade-internacional
  - validacao
---

# Licoes Aprendidas — Teia Societaria: Alucinacao Internacional e Busca Degradada

Voltar para [[DECISIONS-Index]].

## Licao 7: Regex com `i` flag nao cobre acentos em JavaScript

### Problema

O `parseTeiaText` falhava silenciosamente porque o Gemini gera colunas com acentos (Razão, Relação, Confiança) e o JavaScript regex `i` flag **nao cobre caracteres acentuados**. `/razao/i` nao casa com "Razão".

O parser retornava `{ companies: [], warnings: [] }` sem nenhum warning — as empresas da tabela eram simplesmente ignoradas.

### Regra derivada

**Sempre normalizar texto antes de comparar com regex em JavaScript:**

```typescript
const normalized = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
```

Usar `normalize('NFD')` + remover combining marks + `toLowerCase()` em vez de confiar no `i` flag.

### Impacto

3+ horas perdidas debugando o pipeline de integracao (SectionalBotMessage → SocietaryMap) quando o bug estava no parser base. O parser funcionava nos testes unitarios (que usavam texto sem acento) mas falhava em producao (Gemini gera com acentos).

---

## Licao 8: Sempre testar parser com dados realistas (acentos, Unicode)

### Problema

O teste manual do `parseTeiaText` usou colunas sem acento: `| CNPJ | Razao Social |`. O Gemini real gera: `| CNPJ | Razão Social | Relação na Teia | Confiança |`. O parser passou no teste mas falhou em producao.

### Regra derivada

Testar parsers com dados que incluam: acentos, caracteres Unicode, variações de formatação. Não confiar que o LLM vai gerar exatamente o formato do prompt.

---

## Licao 0: Sempre Consultar o que Ja Temos Antes de Pensar em Evolucao

### Problema

Passamos horas diagnosticando por que o `/api/socio-search` retornava `degraded: true`. A hipotese inicial era falha no cache Supabase. Configuramos `SUPABASE_SERVICE_ROLE_KEY`, ajustamos RLS, debugamos a tabela `extract_cache`. A causa real era o `performWebSearch()` usando DuckDuckGo Lite — que falha em serverless.

**Pior:** a `BRAVE_SEARCH_API_KEY` JA ESTAVA configurada no Vercel. Ninguem verificou. O codigo usava DuckDuckGo enquanto a chave da Brave Search estava la, sem uso, ha semanas.

### Regra derivada

**Antes de qualquer evolucao de codigo, verificar:**

1. Que APIs, chaves e recursos JA temos configurados? (`vercel env ls`, Supabase tables, etc.)
2. Esses recursos estao sendo usados pelo codigo atual? (`grep` pela env var no codigo)
3. Se nao estao sendo usados: por que? E o caminho mais curto.

### Impacto

Se tivessemos verificado no inicio: 0 minutos de debug. Bastava `grep BRAVE_SEARCH_API_KEY` no codigo, ver que nao era usada, e integrar. Em vez disso: ~3h de diagnostico em producao.

---

## Contexto

Sessao de debugging do Modulo 1b da Teia Societaria (PR #279) apos diagnostico de dois problemas em producao: alucinacao de entidade internacional e mapa visual sempre degradado no Vercel Preview.

## Licao 1: Alucinacao Internacional — Prompt Brasileiro, Entidade Holandesa

### Problema

O Modulo 1b (Gemini, temp 0.2) conectou "Scheffer Europe B.V." (Holanda) ao grupo Scheffer Brasil baseado apenas em nome similar. A conexao e FALSA.

### Causa Raiz

O prompt (`prompts/mega/teia-deep.ts`, linhas 54-61) define regra de comprovacao que so cobre CNPJ/CPF/CNAE brasileiros. Entidade holandesa (B.V.) nao tem nenhum desses -- escapa de todas as salvaguardas.

### Fatores Contribuintes

1. **Gateway de complexidade ALTA** (`teia-identity.ts:72`) inclui "presenca internacional" -- incentiva o LLM a encontrar algo internacional
2. **PASSO 3 pergunta sugestivamente** "exportacao direta, filial no exterior?" -- cria vies de confirmacao
3. **Constraint "Nao invente CNPJs"** nao protege contra empresas sem CNPJ
4. **Constraint de fontes internacionais** e de formato (idioma), nao de validacao substantiva
5. **`validateTeiaCnpjsOutput`** so valida CNPJ brasileiro (regex `\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}`)
6. **Temperatura 0.2 no Modulo 1b** vs 0.1 no Modulo 1a -- inconsistente para analise factual
7. **Bug do modelo:** `gemini-3-flash-preview` tem bug conhecido desde abril/2026 onde `groundingMetadata` nao retorna `groundingChunks` -- Search Grounding essencialmente quebrado

### Correcoes Aplicadas

- `waterfall-orchestrator.ts`: `validateTeiaCnpjsOutput` expandido para detectar entidades internacionais (S.A.S., B.V., GmbH, Inc./LLC, Ltd., S.L.)
- `api/socio-search.ts`: removido early return que degradava quando Supabase ausente
- `utils/documentExtractor.ts`: migrado DuckDuckGo para Brave Search API como fonte primaria

### Padrao Identificado

**Sempre verificar se API keys configuradas estao sendo usadas** -- BRAVE_SEARCH_API_KEY existia mas o codigo usava DuckDuckGo.

---

## Licao 2: Diagnostico em Producao Requer Logs

### Problema

O SocietaryMap sempre mostrava "degradado" no Vercel Preview. A hipotese inicial (errada) foi que o Supabase cache nao estava configurado.

### Causa Real (apos debug com logs)

O `performWebSearch()` usa DuckDuckGo Lite com scraping HTTP. As queries usam sintaxe Google (`site:`, `OR`) que o DDG nao suporta. No runtime serverless da Vercel, falha consistentemente.

### Agravante

`BRAVE_SEARCH_API_KEY` estava configurada no Vercel mas NAO era usada pelo codigo.

### Correcoes Aplicadas

- `utils/documentExtractor.ts`: Brave Search API como fonte primaria, DDG como fallback
- `api/socio-search.ts`: cache volatil (in-memory) quando Supabase ausente, em vez de degradar

### Padrao Identificado

**Diagnosticar com logs antes de culpar infraestrutura.** Sem os logs do Supabase e Vercel, teriamos culpado o cache incorretamente.

---

## Licao 3: Temperatura para Analise Factual Maximo 0.1

### Problema

Temperatura 0.2 no Modulo 1b permitiu alucinacao que 0.1 teria evitado.

### Regra Derivada

**Toda analise factual (CNPJ, societario, dados publicos) deve usar temperatura 0.1.** Temperatura > 0.1 e aceitavel apenas para modulos de inferencia (analise de risco, tendencias, insights nao-estruturados).

### Aplicacao Imediata

Manter temperatura 0.1 no Modulo 1a e reduzir Modulo 1b de 0.2 para 0.1.

### Padrao Identificado

**Temperatura acima de 0.1 para analise factual e perigosa** -- 0.2 ja e suficiente para o modelo "criar" conexoes que nao existem.

---

## Licao 4: DuckDuckGo Lite Nao Funciona em Serverless

### Problema

DuckDuckGo Lite com scraping HTTP falha consistentemente no runtime serverless da Vercel.

### Causa Provavel

IPs da Vercel podem ser rate-limited ou bloqueados pelo DuckDuckGo. Alem disso, as queries usam sintaxe Google (`site:`, `OR`) que o DDG nao suporta.

### Correcao

Migrar para Brave Search API como fonte primaria de busca web.

### Padrao Identificado

**DuckDuckGo Lite nao e viavel para backend serverless.** Preferir APIs com chave (Brave, SerpAPI, Google Custom Search) em runtime serverless.

---

## Licao 5: Prompts Brasileiros Nao Cobrem Entidades Internacionais

### Problema

Todas as regras de validacao nos prompts foram desenhadas para o ecossistema brasileiro (CNPJ, CPF, CNAE). Entidades estrangeiras (B.V., GmbH, Ltd., S.A.S., Inc.) escapam de toda validacao.

### Regra Derivada

**Todo prompt que valida dados brasileiros deve tambem declarar explicitamente o que NAO e aceito como comprovacao.** Regras do tipo "So aceite se tiver CNPJ brasileiro" sao mais seguras que "Nao invente CNPJs".

### Aplicacao Imediata

`validateTeiaCnpjsOutput` expandido para bandeira `isInternational` quando detectar formatos estrangeiros.

### Padrao Identificado

**Prompts desenhados para ecossistema BR falham com entidades internacionais** -- regras de validacao precisam cobrir o que NAO e brasileiro tambem.

---

## Licao 6: Gap Texto-Mapa no Dossie

### Problema

O Gemini (Modulos 1a/1b) produz analise textual riquissima (tabela CNPJ, QSA), mas o SocietaryMap nao consome esses dados -- depende exclusivamente de APIs externas.

### Status

Plano arquitetural criado (P3: sinergia texto-mapa), mas implementacao pendente:

- P3.1: Prop `geminiCnpjs` no SocietaryMap
- P3.6: Parseador de tabela markdown para extrair CNPJs do texto do Gemini

### Padrao Identificado

**Nao assumir que modulos visuais consomem dados textuais.** A arquitetura precisa explicitar o pipeline: texto -> parser -> dados estruturados -> visualizacao.

---

## Registro

Esta licao foi registrada em:

- `.agents/memory/decisions.md` -- entrada `2026-05-23 -- Licao Aprendida`
- `docs/obsidian/decisions/LICOES-APRENDIDAS.md` (este documento)
- `docs/obsidian/decisions/LATEST-DECISIONS.md` -- feed automatico

---

## Licoes Anteriores

---

---

type: licoes-aprendidas
area: processo
data: 2026-05-23
sessao: teia-societaria-tipo5
tags:

- licao
- worktree
- retrabalho
- commit
- gate
- agente

---

# Licoes Aprendidas — Worktree sem Commit = Retrabalho

Voltar para [[DECISIONS-Index]].

## Contexto

Sessão de implementação da Teia Societária Tipo 5 (PR #279). O fluxo envolveu:

1. Brainstorming (planner + ideator + reviewer) para revisar o plano
2. Quick wins (Bloco A) aplicados no worktree
3. Implementer trabalhou no worktree `codex/teia-societaria-tipo5`
4. Merge da branch no `feat/migration-notice-supabase`
5. Usuário testou em `localhost:3000` — Módulo 1b não executou

## Linha do Tempo do Retrabalho

| Etapa        | O que aconteceu                                                                                        | Problema                              |
| ------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| Implementer  | Trabalhou no worktree, declarou "all steps complete", typecheck verde, 903 testes                      | Não commitou as alterações            |
| Merge        | `git merge codex/teia-societaria-tipo5` trouxe 3 commits originais da PR                               | 12 arquivos do implementer não vieram |
| Teste        | Usuário rodou `localhost:3000`, dossiê sem profundidade                                                | Código simplesmente não existia       |
| Debug        | Ciclo extra de diagnóstico para descobrir que era ausência de arquivo, não bug                         | ~15min perdidos                       |
| Cópia manual | `cp` de 12 arquivos do worktree para a branch atual                                                    | ~10min                                |
| Ajustes      | Import paths quebrados (`tests/api/` → `tests/`), tipo `temperature` ausente em `DossierModuleOptions` | ~5min                                 |

**Custo total do retrabalho: ~30min + quebra de confiança no agente.**

## Causa Raiz

O agente implementer trabalhou em worktree isolado (`isolation: "worktree"`) e **não foi instruído a commitar**. O protocolo de conclusão do agente verificou typecheck e testes, mas não verificou `git status --porcelain`. As alterações ficaram como uncommitted changes no worktree, invisíveis para o merge.

## Arquivos Afetados

### Criados (não existiam na branch após merge)

- `prompts/mega/teia-identity.ts` (142 linhas)
- `prompts/mega/teia-deep.ts` (206 linhas)
- `docs/obsidian/decisions/DOSSIE-SCHEFFER-PROFUNDIDADE-TEIA.md`

### Modificados (versão da PR #279 veio sem as alterações do implementer)

- `features/dossier/waterfall-orchestrator.ts` — `runTeiaSocietariaOrchestration`
- `prompts/mega/specialist-prompts.ts` — regra CNPJ
- `prompts/megaPrompts.ts` — exports `PROMPT_TEIA_IDENTITY_MODULE` e `PROMPT_TEIA_DEEP_MODULE`
- `features/dossier/societaryGraph.ts` — badge "operação" → "oficial"
- `features/dossier/SocietaryMap.tsx` — `normalizeCnpj` + cache fix
- `api/socio-search.ts` — cache probe placeholder bug
- `services/gemini/investigation-orchestration.ts` — suporte a `temperature`
- `services/gemini/contracts.ts` — campo `temperature?: number`
- `docs/obsidian/decisions/TEIA-SOCIETARIA-ENRIQUECIMENTO.md` — decisão revisada
- `tests/features/dossier/waterfall-orchestrator.test.ts`
- `tests/App.dossierGolden.test.tsx`
- `tests/prompts/megaPrompts.test.ts`

## Correção

1. Cópia manual dos 12 arquivos do worktree
2. Ajuste de path do `tests/api-socio-search.test.ts` (movido de `tests/api/` para `tests/`)
3. Adição do campo `temperature?: number` em `DossierModuleOptions` (`services/gemini/contracts.ts`)
4. Typecheck e testes revalidados (903 passando)

## Prevenção — Novo Gate

### Gate #1: Commit obrigatório pós-agente

Ao receber resultado de agente que usou worktree, verificar:

```bash
git -C <worktree-path> status --porcelain
```

Se NÃO vazio → o agente não commitou. Solicitar commit ou commitar manualmente.

### Gate #2: Instrução explícita no prompt do agente

Todo prompt de agente com `isolation: "worktree"` deve incluir:

> Ao finalizar todas as alterações, faça commit com `git add -A && git commit -m "..."`. Rode `git status --porcelain` para confirmar que não há arquivos pendentes.

### Gate #3: Verificação pós-merge

Após merge de branch onde agente trabalhou, verificar:

```bash
# Confirma que arquivos esperados existem
ls <arquivos-criados-esperados>

# Confirma que funções esperadas existem
grep -r "<funcao-esperada>" <arquivos-modificados-esperados>
```

## Registro

Esta lição foi registrada em:

- `.agents/memory/decisions.md` — entrada `2026-05-23 — Lição Aprendida`
- `docs/obsidian/decisions/LICOES-APRENDIDAS.md` (este documento)
- `docs/obsidian/decisions/LATEST-DECISIONS.md` — feed automático

## Ações Derivadas

- [ ] Atualizar regra global em `~/.claude/rules/` com gate de commit pós-worktree
- [ ] Revisar prompts de agentes existentes para incluir instrução de commit
- [ ] Adicionar verificação no hook `SessionEnd` para detectar worktrees com uncommitted changes
