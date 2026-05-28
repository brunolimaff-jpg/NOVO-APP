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

<!-- caliber:managed:learnings -->
_Atualizado automaticamente pelo Caliber após sessões de agente._
<!-- /caliber:managed:learnings -->
