# Phase 2 Maintainability Plan (Post-Sprint 8)

Last updated: 2026-04-23

## 1. Contexto e baseline

- Baseline da fase: `origin/main` apos o merge da Sprint 8 via PR `#241` (`ccd2001518367961637b1a9488c2319aa83d0a21`).
- A fase anterior (Sprints 1-8) esta concluida e validada.
- Politica ativa desta fase: fachadas publicas congeladas, com refactor interno incremental.
- Objetivo da fase: reduzir acoplamento estrutural e custo de mudanca sem regressao funcional.

## 2. Mapa do codigo (estado atual)

Inventario por dominio (censo de arquivos):

- UI/components: `51`
- features: `13`
- hooks: `11`
- services: `35`
- stores: `2`
- utils: `32`
- tests: `114`

Boundaries ja estabilizadas:

- `services/gemini/*` (fachada publica: `services/geminiService.ts`)
- `services/war-room/*` (fachada publica: `services/warRoomService.ts`)
- `features/chat/*`
- `features/dossier/*`
- `features/radar/*` (stub arquitetural oficial)

## 3. Matriz de hotspots e ajustes necessarios

| Hotspot | Sinal atual | Risco de manutencao | Ajustes alvo | Padroes de refactor |
|---|---|---|---|---|
| `App.tsx` | `724` linhas, `44` imports | acoplamento de composicao e wiring centralizado | reduzir orchestration local e criar fronteiras de app shell | `Extract Class/Module`, `Move Function`, `Introduce Facade` |
| `components/CRMDetail.tsx` | `664` linhas | tipagem fraca (`card: any`) + responsabilidades misturadas | fortalecer contratos e quebrar renderizacao/transformacao | `Introduce Parameter Object`, `Extract Component`, `Decompose Conditional` |
| `components/LoadingSmart.tsx` | `704` linhas | timeline, modelo e render acoplados | separar fases de preparacao de dados e render | `Extract Method`, `Split Phase`, `Replace Magic Number with Constant` |
| `components/WarRoom.tsx` | `513` linhas | complexidade local de UI ainda alta | continuar extracao de blocos visuais e objetos de parametros | `Extract Component`, `Introduce Parameter Object` |
| Radar runtime fora do boundary | `hooks/useRadar.ts` (`248`) + `services/radarService.ts` (`200`) + wiring no `App.tsx` | runtime do Radar ainda fora de `features/radar/*` | mover orquestracao para o boundary oficial mantendo compatibilidade | `Move Method`, `Extract Module`, `Facade over orchestration` |
| Debt operacional | OI-003, OI-004, OI-005 | ruido de build/test/lint reduz sinal de regressao | hardening de baseline e fechamento de warnings prioritarios | hardening incremental + cleanup dedicado |

## 4. Plano de sprints da nova fase (4 sprints curtas)

### Sprint 9 - App shell decoupling + governanca da fase

- reduzir responsabilidade direta de composicao em `App.tsx`
- formalizar guardrails e contratos para nao reintroduzir acoplamento
- preparar limites de ownership por dominio

### Sprint 10 - Radar boundary completion

- mover runtime de Radar para `features/radar/*`
- preservar contratos atuais de `types.ts`, hooks e servicos
- remover wiring residual do `App.tsx` ligado ao Radar

### Sprint 11 - Componentes grandes + tipagem forte

- atacar `CRMDetail`, `LoadingSmart` e continuidade de reducao em `WarRoom`
- eliminar `any` criticos e consolidar contratos explicitos
- reduzir complexidade ciclomatica de blocos de render

### Sprint 12 - Hardening final e fechamento

- tratar warnings operacionais remanescentes (OI-003, OI-004, OI-005)
- fechar guardrails e documentar estado final da trilha
- consolidar handoff final da fase

## 5. Criterios de aceite por sprint

Gates tecnicos obrigatorios:

- `npm run test`
- `npm run typecheck`
- `npm run build`
- `npm run lint`

Validacao manual minima:

- chat
- dossie
- war room
- radar
- save/reload/export

Regra de rollback:

- nao avancar sprint com gate vermelho

## Public APIs / Types congelados na fase

Manter sem quebra:

- `services/geminiService.ts`
- `services/warRoomService.ts`
- `components/ChatInterface.tsx`
- `constants.ts`
- `prompts/megaPrompts.ts`
- `types.ts` centralizado (reavaliar so com ROI explicito)

## Assumptions

- Sprint 8 concluida e mergeada em `main`.
- Esta entrega inicial da nova fase e documental, sem patch de codigo de runtime.
- `mcp-server/` continua fora da trilha.
- Este arquivo vira a base para abrir os documentos individuais de Sprint 9-12.
