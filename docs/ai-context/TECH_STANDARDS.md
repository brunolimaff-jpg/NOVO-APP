# Padrões Técnicos & Convenções — Senior Scout 360

---

## Padrões de Código

### TypeScript
- **Strict mode SEMPRE ativado** (`tsconfig.json`)
- **Zero `any`** — usar `unknown` + type guard se necessário. Se `any` for inevitável, documentar em comentário o porquê
- **Interfaces** para contratos públicos, **Types** para unions e utilidades internas
- **Tipos centralizados** em `types.ts` — nunca definir tipo inline em componente
- **Union types > Enums**: preferir `type Status = 'idle' | 'loading' | 'error'`

### React / Componentes
- **Functional components** exclusivamente (zero class components, exceto ErrorBoundary)
- **Named exports** (nunca default export para componentes)
- **Um componente = uma responsabilidade** — se ultrapassar 300 linhas, avaliar decomposição
- **Componentes >15KB** são candidatos obrigatórios à análise de decomposição
- **Props tipadas** com interface dedicada no topo do arquivo
- **Desestruturação de props** na assinatura da função

### Hooks
- **Responsabilidade única** — um hook não deve gerenciar chat + sessões + UI
- **Naming convention**: `use[Domínio][Ação]` (ex: `useSessionManager`, `useChatStream`)
- **Custom hooks retornam objeto nomeado**, não array (exceto padrões simples como useState)
- **Vigiar stale closures**: toda referência a state dentro de useCallback/useEffect deve estar no array de dependências ou usar useRef
- **Cleanup obrigatório** em useEffect que cria subscriptions, timers ou listeners
- `hooks/useChat.ts` é legado: não adicionar novos imports de produção; a proteção arquitetural vive em `tests/architecture/useChatImportGuard.test.ts`

### State Management
- **Estado local** (useState) para UI state do componente
- **Context** para estado compartilhado entre árvores de componentes (operator, theme, toast)
- **Hooks customizados** para lógica de negócio (useChat, useRadar, useSessionManager)
- **localStorage** para persistência de sessões (via useSessionStorage com serialização tipada)
- **NUNCA** estado global quando local é suficiente
- **NUNCA** prop drilling além de 2 níveis — usar Context

### Styling (TailwindCSS)
- **Tailwind utility classes** como padrão principal
- **Mobile-first** — começar com classes mobile, usar `md:` e `lg:` para breakpoints maiores
- **Cores do tema Senior** definidas em `tailwind.config.js`
- **CSS customizado** SOMENTE quando Tailwind não resolve (animações complexas, keyframes)
- **Meta**: migrar `mobile-responsive.css` para classes Tailwind nativas

---

## Padrões de Engenharia de Prompt (Sophia)

### Estrutura Obrigatória para Prompts Longos
```xml
<system_context>
  Papel da IA, personalidade, restrições globais, domínio (Agro/Senior)
</system_context>

<user_context>
  Dados da empresa: CNPJ, razão social, setor, porte, dados coletados
  Fonte de cada dado (Search Grounding, CNPJ lookup, input do vendedor)
</user_context>

<instructions>
  Tarefa específica, áreas de análise, formato esperado
  Calibrar profundidade por área baseado nos dados disponíveis
</instructions>

<constraints>
  Restrições NEGATIVAS (mais eficazes que positivas):
  - NÃO inventar dados financeiros sem fonte verificável
  - NÃO gerar perguntas genéricas sobre safra/colheita
  - NÃO repetir informações já presentes no contexto
  - NÃO usar linguagem acadêmica — ser tático e acionável
  - NÃO afirmar que empresa usa sistema X sem evidência
  - Se não houver dados suficientes: DECLARAR explicitamente a lacuna
</constraints>

<output_format>
  Estrutura exata com markdown headers padronizados
  Scores com escala explícita e justificativa baseada em evidências
  Cada afirmação factual com indicação de confiança
</output_format>
Prompt Chains — Dossiê Completo
Chain 1: TRIAGEM (temp 0.1)
  Input: CNPJ + nome
  Output: Classificação setor, porte estimado, relevância para portfólio Senior

Chain 2: ENRIQUECIMENTO (Search Grounding ON, temp 0.1)
  Input: Dados triagem + Search Grounding results
  Output: Dados factuais enriquecidos com fontes e timestamps

Chain 3: DOSSIÊ (temp 0.3)
  Input: Dados enriquecidos validados
  Output: Análise por área (Fiscal, TI, RH, Supply Chain)

Chain 4: SCORING PORTA (temp 0.1)
  Input: Dossiê gerado + evidências coletadas
  Output: 5 dimensões (P, O, R, T, A) com notas, pesos por segmento e justificativas

Chain 5: TÁTICAS (temp 0.7)
  Input: Dossiê + Scores + perfil vendedor
  Output: Sugestões de abordagem, timing, argumentos, objeções prováveis
Anti-Alucinação — Checklist de Sophia
Toda afirmação factual tem fonte identificável?
Scores têm justificativa baseada em dados, não intuição?
Se dados insuficientes, a IA declara lacuna explicitamente?
Restrições negativas cobrem os 5 tipos de alucinação mais comuns?
O output seria útil se o vendedor o lesse 5 minutos antes da reunião?
Qualidade de Dados — Checklist de André
CNPJ validado (formato + dígito verificador)?
Search Grounding: dados referem à empresa CORRETA (não homônima)?
Freshness: dados mais recentes que 6 meses?
Fontes cruzadas: se duas fontes divergem, qual prevalece e por quê?
Enriquecimento: dados são específicos da empresa ou genéricos do setor?
Padrões de Tratamento de Erros
Hierarquia
1. PREVENIR — Validar inputs antes de enviar
2. DETECTAR — Catch com contexto, nunca catch vazio
3. LOGAR — Console.error com info suficiente para debug
4. NOTIFICAR — Feedback visual ao usuário (toast, card, inline message)
5. RECUPERAR — Fallback gracioso, retry quando apropriado
Tratamento por Tipo de Erro
Erro	Ação	Feedback UI
429 Rate Limit	Retry com backoff exponencial (1s, 2s, 4s, max 3 tentativas)	Toast "Muitas requisições, tentando novamente..."
500 Server Error	Log + retry 1x	ErrorMessageCard "Erro no servidor"
Network Offline	Detectar via useOffline, bloquear envio	Banner "Sem conexão. Reconectando..."
Timeout	AbortController com timeout de 30s	Toast "A IA demorou muito. Tente novamente."
Payload null/undefined	Validação pré-envio, early return	Não chega na UI — prevenção
Persistência remota indisponível	Log + fallback local + feedback claro	Toast "Não foi possível sincronizar agora. A sessão segue salva localmente."
localStorage full	Try/catch no setItem, limpar sessões antigas	Toast "Armazenamento cheio"
Gemini response malformed	Fallback para texto raw sem parsing	Exibir resposta sem formatação

Anti-Padrões (PROIBIDO)
// ❌ NUNCA
catch (e) {}
catch (e) { console.log(e) }
catch (error: any) { /* silenciar */ }

// ✅ SEMPRE
catch (error) {
  const message = error instanceof Error ? error.message : 'Erro desconhecido';
  console.error(`[useChat] Falha ao enviar mensagem: ${message}`, {
    sessionId,
    messageLength: content?.length,
    error
  });
  showToast('Não foi possível enviar a mensagem. Tente novamente.', 'error');
  setError({ type: 'SEND_FAILED', message, retryable: true });
}
Padrões de Performance
Perceived Performance (Diego)
Nunca tela estática durante processamento da IA
Skeleton screens com dimensões que correspondam ao conteúdo real (evitar layout shift)
Loading granular: o componente que está mudando exibe seu próprio loading, não a tela toda
Mensagens de loading dinâmicas: "Pesquisando informações...", "Analisando área fiscal...", "Gerando recomendações..."
Streaming visual: tokens aparecem progressivamente, não tudo de uma vez
Bundle & Rendering
Lazy loading para rotas/views pesadas (War Room, CRM Detail)
React.memo onde re-renderizações são mensuravelmente custosas (não prematuramente)
useMemo/useCallback com propósito documentado, não por default
Virtualização para listas longas (sessões, leads CRM)
Imagens: WebP, lazy loading, dimensões explícitas (evitar layout shift)
Padrões de Integração (Victor)
Serverless Functions (Vercel)
Proxy pattern: frontend NUNCA chama APIs externas diretamente
API keys ficam SOMENTE em variáveis de ambiente do servidor
Timeout: configurar maxDuration nas functions (default 10s, IA 60s)
CORS: configurar headers adequadamente
Retry Strategy
text

Tentativa 1: imediata
Tentativa 2: +1s delay
Tentativa 3: +2s delay (com jitter aleatório ±500ms)
Máximo: 3 tentativas
Se 429: respeitar header Retry-After se presente
Cache
Dossiês recentes: cache em localStorage por 24h (key: cnpj + timestamp)
Sessões: persistidas em localStorage (useSessionStorage)
Dados de lookup CNPJ: cache por 7 dias (dados cadastrais mudam pouco)
Search Grounding results: NÃO cachear (precisam ser frescos)
Convenções de Arquivo
Nomenclatura
Componentes: PascalCase.tsx (ex: ChatInterface.tsx)
Hooks: camelCase.ts (ex: useChat.ts)
Services: camelCase.ts (ex: geminiService.ts)
Utils: camelCase.ts (ex: formatCnpj.ts)
Types: PascalCase para interfaces, camelCase para type aliases
Constantes: UPPER_SNAKE_CASE
Estrutura de Arquivo (Componente)
TypeScript

// 1. Imports (React → third-party → local)
// 2. Types/Interfaces
// 3. Constants (se locais ao componente)
// 4. Component function
// 5. Sub-components internos (se pequenos)
// 6. Named export
Limites de Tamanho
Tipo	Ideal	Máximo	Se ultrapassar
Componente	<200 linhas	400 linhas	Decompor em sub-componentes
Hook	<150 linhas	300 linhas	Extrair sub-hooks por responsabilidade
Service	<100 linhas	200 linhas	Separar por domínio
Arquivo de tipos	<100 linhas	200 linhas	Separar por feature

## Regras Arquiteturais Atuais

- `services/geminiService.ts` e uma fachada publica de compatibilidade. Novas responsabilidades internas da camada Gemini devem ser adicionadas em `services/gemini/`.
- Contratos publicos existentes da fachada nao devem ser quebrados sem migracao explicita dos consumidores.
- Validacao manual final deve acontecer em preview/producao na Vercel; `npm run dev` nao representa o runtime serverless real.
