# Senior Scout 360 — GitHub Copilot Instructions

## Projeto

Copiloto de inteligência comercial para executivos de contas da Senior Sistemas no Agronegócio.
App: https://scoutagro.vercel.app

## Stack

React 18 · TypeScript · TailwindCSS · Vite · Google Gemini (streaming) · Clerk.dev · Vercel serverless · Pinecone

## Convenções obrigatórias

- Prompts Gemini → `src/prompts/` (nunca inline)
- API keys → `api/` serverless (nunca no frontend)
- ZERO catch vazio — sempre log + fallback + feedback visual
- `any` só com comentário justificando
- Loading granular — skeleton screens enquanto IA processa
- Tipagem forte em todo TypeScript

## Score PORTA — Framework proprietário

Qualificação preditiva 0–100 em 5 dimensões:
- **P** Porte (tamanho real do grupo econômico)
- **O** Operação (complexidade operacional)
- **R** Retorno (pressão externa: compliance, financiamento)
- **T** Tecnologia (maturidade e dívida tech)
- **A** Adoção (janela política e cultural)

Sugestões que toquem em scoring devem respeitar as 5 dimensões com evidências reais.

## Vocabulário

- Dossiê = relatório investigativo do prospect
- Radar = monitoramento proativo
- GATEC = produto Senior de gestão agrícola
- HCM = produto Senior de gestão de pessoas

## Issues pré-existentes (não reportar como bugs novos)

- ESLint v10 + `.eslintrc.cjs` → `npm run lint` falha (pré-existente)
- `old.tsx` na raiz → erros de TS (pré-existente, ignorar)
- Clerk requer chave válida para renderizar UI
