# Padroes Tecnicos e Convencoes - Senior Scout 360

Ultima revisao: 2026-04-23

## Codigo

### TypeScript

- `strict` deve permanecer ativo
- evitar `any`; preferir `unknown` + type guards
- interfaces para contratos publicos, types para unions e utilitarios internos
- `types.ts` segue como concentrador de contratos compartilhados

### React

- componentes funcionais por padrao
- `ErrorBoundary` pode continuar class component
- decompor componentes grandes quando o arquivo comecar a misturar UI, IO e regra de negocio
- componentes acima de ~15 KB sao candidatos explicitos a revisao estrutural

### Hooks

- um hook, uma responsabilidade dominante
- cleanup obrigatorio para timers, listeners e subscriptions
- cuidar de stale closures em callbacks e efeitos
- `hooks/useChat.ts` foi removido; o guardrail arquitetural continua em `tests/architecture/useChatImportGuard.test.ts`

### State management

- `useState` para estado estritamente local
- `contexts/*` para preocupacoes pequenas e transversais
- `stores/*` para estado compartilhado do chat/dossie
- evitar prop drilling profundo quando houver boundary clara

## Arquitetura

- `services/geminiService.ts` e fachada publica; novas responsabilidades entram em `services/gemini/`
- `services/warRoomService.ts` e fachada publica; novas responsabilidades entram em `services/war-room/`
- `constants.ts` e `prompts/megaPrompts.ts` permanecem como fachadas publicas finas
- `features/radar/` existe como boundary oficial; nao reacoplar Radar novo em `App.tsx`
- nao remover uma fachada publica no mesmo sprint em que os submodulos internos nascerem

## Tratamento de erro

- nunca usar `catch {}` vazio
- logar com contexto suficiente para diagnostico
- devolver fallback ou feedback visual quando a falha alcancar a UI
- abort, timeout e falha parcial de rede devem ser tratados como caminhos previstos

## Integracao e runtime

- Vercel e o runtime real de validacao manual
- `npm run dev` nao replica o ambiente serverless completo
- chaves e segredos nunca vao para o frontend
- APIs externas devem ser acessadas por `api/*.ts` quando exigirem segredo ou controle server-side

## Estilo de arquivo

- componentes: `PascalCase.tsx`
- hooks/services/utils: `camelCase.ts`
- constantes: `UPPER_SNAKE_CASE`
- manter comentarios raros e de alto valor

## Qualidade e gates

- gates minimos: `npm run test`, `npm run typecheck`, `npm run build`
- a partir do baseline atual, `npm run lint` tambem faz parte do gate tecnico, mesmo com warnings conhecidos
- registrar warnings aceitos e riscos residuais em `docs/ai-context/refactor/03-OPEN-ITEMS.md`
