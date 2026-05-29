# Caliber Learnings — Senior Scout 360

Padrões e anti-padrões aprendidos de sessões anteriores. Tratados como regras do projeto.

## Padrões confirmados

- **Supabase + IDB como cache offline** [react, typescript, supabase, offline]
  Offline-first com sync queue: IDB para leitura/escrita instantanea, Supabase como source of truth.
  Stale-while-revalidate nas leituras, fila com retry exponencial nas escritas.
  Aplicado com sucesso — migracao completa de idb-keyval para Supabase.

- **Validar intencao de produto alem do evento tecnico** [ux, feedback, supabase, produto]
  Ao validar fluxos de produto, confirmar se o comportamento real representa a intencao esperada, nao apenas se o evento chegou no destino tecnico.
  Exemplo: feedback chegou no Supabase, mas cliques repetidos revelaram duplicacao e o clique negativo dependia de motivo + confirmacao.
  Validacao boa cruza banco, UX e semantica esperada antes de concluir que "funcionou".

- Prompts Gemini com XML delimiters têm menor taxa de alucinação
- Score PORTA deve sempre ser gerado com temperatura 0.1 (factual)
- Search Grounding nunca deve ser cacheado — dados de empresa mudam
- Skeleton screens com dimensões fixas eliminam layout shift no streaming
- Validar CNPJ antes de qualquer chamada IA evita desperdício de tokens
- Pool de fontes cumulativo entre módulos do waterfall reduz alucinação de links em módulos sem grounding
- Pipeline único de integridade ao final (não por módulo) é idempotente e evita duplicação de fontes
- Três categorias de fontes (citadas, consultadas, inferidas) dão transparência completa ao usuário

## Anti-padrões identificados

- Prompt inline no componente: dificulta versionamento e teste
- catch vazio em chamadas Gemini: vendedor vê tela travada sem saber o motivo
- `any` em tipos de resposta da IA: propaga erros silenciosos para o dossiê
- Cache de Search Grounding: dossiê com dados desatualizados compromete credibilidade na reunião
- `break` em fallback de busca web: um módulo degradado não deve abortar o pipeline inteiro; `continue` preserva resiliência e fontes de módulos anteriores
- `?? 'hero'` em `loadingVariant`: coerção de `undefined` para valor padrão ignora semântica do nulo; comparar explicitamente com `=== 'hero'`
- `useMemo` para strings primitivas: desnecessário e mais complexo que concatenação direta de string — React já compara `===` em deps de useEffect

- **Benchmark timeout reduzido para 20s** [performance, benchmark, timeout]
  `MODULAR_BENCHMARK_TIMEOUT_MS` de 45000 para 20000. Benchmark e etapa opcional — timeout curto evita travamento do loading.

- **completeLoadingProgress() no finally** [loading, react, safe]
  `setIsLoading(false)` no finally nao basta: o progress tracker interno do LoadingSmart precisa ser resetado com `completeLoadingProgress()`. Sem isso, o proximo request herda estado zumbi.

- **Timeout aninhado multiplica tempo real** [api, timeout, anti-pattern]
  Camadas de retry (fetchWithRetry 3x, cold-start, withAutoRetry 3x) acumulam delay mesmo com timeout externo. Cada camada adiciona seu proprio tempo de execucao. Para etapas opcionais, 1 tentativa com timeout curto e melhor que multiplos retries.

- **Preview Vercel revela bugs de rede que testes nao pegam** [testing, deploy, vercel]
  Travamento do LoadingSmart so apareceu no preview Vercel. Testes unitarios nao cobrem comportamento real de HTTP (benchmark lento, cold-start). Preview deploy e gate obrigatorio antes de merge.

<!-- caliber:managed:learnings -->

_Atualizado automaticamente pelo Caliber após sessões de agente._

<!-- /caliber:managed:learnings -->
