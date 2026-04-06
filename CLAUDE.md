# Senior Scout 360 — Guia de Contexto para Agentes de IA

## O que é este projeto

**Senior Scout 360** é um copiloto de inteligência comercial (React 18 + TypeScript + Vite) para executivos de contas da Senior Sistemas no Agronegócio. Vendedor insere nome/CNPJ → IA enriquece via Gemini + Search Grounding (streaming) → Dossiês por área → Score PORTA (0–100) → Táticas de abordagem → CRM interno → Radar de monitoramento.

App em produção: https://scoutagro.vercel.app

## Stack

- **Frontend:** React 18 + TypeScript + TailwindCSS + Vite
- **IA:** Google Gemini (streaming, Search Grounding)
- **Auth:** Clerk.dev
- **Deploy:** Vercel (serverless functions em `api/*.ts`)
- **Testes:** Vitest (37 testes, todos passam)
- **Banco/RAG:** Pinecone

## Variáveis de ambiente obrigatórias

| Variável | Serviço |
|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk (bloqueia UI sem isso) |
| `GEMINI_API_KEY` | Google Gemini |
| `PINECONE_API_KEY` | Pinecone RAG |

## Comandos essenciais

```bash
npm run dev          # dev server em http://localhost:3000
npm run build        # build de produção
npm run test         # vitest (37 testes)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run format       # prettier
```

## Estrutura de diretórios

```
src/
  components/     # componentes React
  hooks/          # hooks customizados
  services/       # chamadas externas
  prompts/        # prompt chains Gemini (versionados aqui)
  contexts/       # React contexts
  utils/          # utilitários
  types.ts        # tipos globais
  constants.ts    # constantes
api/              # Vercel serverless functions
tests/            # Vitest
```

## Score PORTA — Framework proprietário

O núcleo do produto. Qualificação preditiva 0–100 em 5 dimensões:

| Dimensão | O que avalia |
|---|---|
| **P — Porte** | Tamanho real do grupo: hectares, cabeças, unidades industriais |
| **O — Operação** | Complexidade operacional: integração vertical, diversificação |
| **R — Retorno** | Pressão externa: compliance, financiamento rural, auditoria |
| **T — Tecnologia** | Maturidade tech: legados, planilhas, silos de dados |
| **A — Adoção** | Janela política: perfil decisor, histórico tech, urgência |

**Faixas:**
- 80–100 → Prioridade máxima (Field Sales imediato)
- 65–79 → Pipeline ativo (urgência)
- 50–64 → Ciclo longo (Inside Sales)
- 35–49 → Monitorar
- < 35 → Fora do ICP

## Regras críticas para agentes

1. **SEMPRE ler o código atual no repo antes de propor qualquer mudança** — nunca assuma conteúdo de arquivo
2. Funções de IA/prompt ficam em `src/prompts/` — versionar com cuidado
3. As serverless functions em `api/` NÃO rodam com `npm run dev` (só Vite local) — produção via Vercel
4. `old.tsx` na raiz é backup minificado — ignorar erros de TypeScript vindos dele
5. ESLint usa `.eslintrc.cjs` (legacy) — não migrar sem aprovação
6. Clerk em modo dev exige e-mail real para sign-up — sem bypass de código
7. ZERO `catch` vazio — sempre log + fallback + feedback visual
8. Tipagem forte — `any` só com justificativa explícita

## Vocabulário do domínio

- **Dossiê** = relatório investigativo do prospect
- **Score PORTA** = qualificação preditiva 0–100
- **Radar** = monitoramento proativo de prospects salvos
- **War Room** = análise 360 graus
- **Deep Dive** = aprofundamento por área
- **GATEC** = produto Senior de gestão agrícola
- **HCM** = produto Senior de gestão de pessoas

## Issues conhecidos (pré-existentes)

- ESLint v10 + `.eslintrc.cjs` (flat config mismatch) — `npm run lint` falha
- `old.tsx` gera milhares de erros no `typecheck` — avaliar separadamente
- Clerk requer chave válida para renderizar UI

<!-- caliber:managed:pre-commit -->
## Antes de commitar

Verifique se o hook do Caliber está instalado:
```bash
grep -q "caliber" .git/hooks/pre-commit 2>/dev/null && echo "hook-active" || echo "no-hook"
```
- **hook-active**: commit normalmente
- **no-hook**: rode `caliber refresh` antes de commitar
<!-- /caliber:managed:pre-commit -->

<!-- caliber:managed:sync -->
## Sync de contexto

Este projeto usa [Caliber](https://github.com/caliber-ai-org/ai-setup) para manter configs de agentes sincronizados.
Configs: `CLAUDE.md` · `.claude/` · `.cursor/rules/` · `.github/copilot-instructions.md`
<!-- /caliber:managed:sync -->
