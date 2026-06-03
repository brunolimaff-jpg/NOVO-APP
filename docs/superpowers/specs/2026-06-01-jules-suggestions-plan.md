# Plano de Melhorias — Sugestões Jules (2026-06-01)

**Status:** Plano aprovado, aguardando execução
**Origem:** 50+ sugestões do Jules (code review)
**Modelo alvo:** GLM-5.1 (tokens gratuitos)

---

## Categorização

| Categoria               | Qtd | Risco para o negócio                      | Prioridade            |
| ----------------------- | --- | ----------------------------------------- | --------------------- |
| Segurança               | 6   | Crítico — custos abusivos, dados expostos | Backlog (uso interno) |
| **Performance**         | 6   | Médio — lentidão na UX                    | **Agora**             |
| **Qualidade de código** | 19  | Baixo — manutenção                        | **Agora**             |
| **Testes faltando**     | 15+ | Baixo — confiança                         | **Agora**             |
| **Arquitetura/Config**  | 5   | Baixo-Médio                               | **Agora**             |

---

## Ganhos Totais

| Track          | Ganho para o negócio                | Como se manifesta                                                   | Confiança |
| -------------- | ----------------------------------- | ------------------------------------------------------------------- | --------- |
| A. Performance | Telas carregam mais rápido          | SocietaryMap para de travar com muitos registros; buscas paralelas  | 90%       |
| B. Qualidade   | Menos dor ao mexer no código depois | Strings gigantes viram código legível; edições futuras mais rápidas | 80%       |
| C. Testes      | Segurança para evoluir sem quebrar  | CI bloqueia regressões antes de produção                            | 85%       |
| D. Arquitetura | Estabilidade em edge cases          | Benchmark vazio não quebra tela; CNPJ reset correto                 | 75%       |

---

## Riscos

| Risco                               | Probabilidade | Impacto | Mitigação                                  |
| ----------------------------------- | ------------- | ------- | ------------------------------------------ |
| Quebrar algo que funciona           | 15%           | Médio   | 1249 testes existentes; reverter se falhar |
| Falso positivo do Jules             | 20%           | Baixo   | Agente verifica antes de mudar             |
| Conflito entre agentes              | 5%            | Baixo   | Tracks sem sobreposição de arquivos        |
| Scope creep                         | 10%           | Médio   | Escopo fechado por track                   |
| Nenhum ganho perceptível ao usuário | 25%           | Baixo   | Track A (performance) é o mais visível     |

---

## Execução — 4 Tracks Paralelos

### Track A: Performance (agente `implementer`)

| #   | Problema                   | Arquivo                             | Solução                                              |
| --- | -------------------------- | ----------------------------------- | ---------------------------------------------------- |
| 1   | O(N²) lookup               | `features/dossier/SocietaryMap.tsx` | Trocar `Array.find` aninhado por `Map<id, obj>` O(1) |
| 2   | Sequential fetch loop      | Loop de fetch                       | `Promise.all()` / `Promise.allSettled()`             |
| 3   | Sequential Google News     | `api/pulse-news.ts`                 | Paralelizar requests                                 |
| 4   | Sequential paginated fetch | Loop de paginação                   | Fetch paralelo de páginas independentes              |
| 5   | Sequential tool calls      | `api/gemini.ts`                     | Paralelizar tool calls independentes                 |
| 6   | Manual chunks              | `vite.config.ts`                    | Configurar `manualChunks` para split de bundle       |

### Track B: Qualidade de Código (agente `implementer`)

| Padrão                 | Qtd | Arquivos                                         | Solução                              |
| ---------------------- | --- | ------------------------------------------------ | ------------------------------------ |
| Long inline Tailwind   | 3   | HelpCenterFloating, WelcomeScreen, SyncIndicator | Extrair para constantes ou `clsx()`  |
| Long template literals | 4   | Fercus, ERP Banking, prompt, markdown            | Extrair para prompts/ ou constantes  |
| Complex conditionals   | 3   | InvestigationDashboard, regex, string matching   | Funções nomeadas com semântica clara |
| Hardcoded mapping      | 1   | Client filter                                    | Extrair para config                  |
| Long URL               | 1   | FollowUpModal                                    | URL constructor ou constante         |
| Commented code / TODOs | 2   | Geral                                            | Remover ou implementar               |
| Long strings diversos  | 5   | Dossier export, error, SVG, etc.                 | Extração para constantes             |
| Long inline HTML attr  | 1   | SVG                                              | Constante                            |
| dangerousSetInnerHTML  | 1   | MarkdownRenderer                                 | Sanitizar                            |

### Track C: Testes (agente `validator`)

| Área                          | Itens                | Ação                                             |
| ----------------------------- | -------------------- | ------------------------------------------------ |
| `utils/errorBoundaryAudit.ts` | 3 exports sem teste  | Criar `tests/utils/errorBoundaryAudit.test.ts`   |
| `lib/supabaseClient.ts`       | 2 exports sem teste  | Criar `tests/lib/supabaseClient.test.ts`         |
| `utils/documentExtractor.ts`  | 10 exports sem teste | Expandir `tests/utils/documentExtractor.test.ts` |
| API error paths               | 6 endpoints          | Adicionar teste de try/catch                     |
| API sem testes                | 2                    | `_security-headers`, `comex` completo            |
| Golden fixtures               | 1                    | Rodar e atualizar                                |

### Track D: Arquitetura (agente `implementer`)

| #   | Problema                 | Arquivo                    | Solução                     |
| --- | ------------------------ | -------------------------- | --------------------------- |
| 1   | ESM conflicts jsdom      | `vitest.config.ts`         | Configurar `deps.inline`    |
| 2   | Empty benchmark fallback | Componente                 | Estado visual de fallback   |
| 3   | CNPJ reset excessivo     | Componente                 | Reset só campos manuais     |
| 4   | Gemini endpoint eager    | `api/_gemini-key-utils.ts` | Lazy `resolveEndpoint()`    |
| 5   | React Compiler dev-only  | Config                     | Guard `import.meta.env.DEV` |

---

## Próximo Passo

Bruno dar "vai" para dispatchar os 4 agentes em paralelo.
