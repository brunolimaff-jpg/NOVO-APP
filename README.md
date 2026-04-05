# 🦅 Senior Scout 360
[![CI](https://github.com/SEU-USUARIO/SEU-REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/SEU-USUARIO/SEU-REPO/actions/workflows/ci.yml)

### Copiloto de Inteligência Comercial para o Agronegócio

---

## O que é

**Senior Scout 360** é o copiloto de inteligência comercial de executivos de contas da Senior Sistemas.

Em menos de 5 minutos, entrega um dossiê completo do prospect, qualifica a oportunidade com o **Score PORTA** e sugere a abordagem certa para fechar — sem pesquisa manual, sem achismo, sem tempo perdido.

---

## O problema que resolve

| Antes do Scout | Com o Scout |
|---|---|
| 2 a 4 horas de pesquisa antes de cada reunião | Dossiê completo em menos de 5 minutos |
| Qualificação baseada em intuição | Score PORTA 0–100 com base em evidências reais |
| Análise genérica, igual para todos os prospects | Dossiê por área: Fiscal, TI, RH, Supply Chain |
| Oportunidades esfriando sem acompanhamento | Radar de monitoramento contínuo dos prospects |

---

## Como funciona

A jornada do vendedor em 5 passos:

**1. Busca a empresa**
Insere o nome ou CNPJ do prospect no Scout.

**2. A IA investiga**
O Scout pesquisa em múltiplas fontes, cruza dados e monta o Dossiê 360 automaticamente.

**3. Qualifica com o Score PORTA**
A oportunidade é pontuada nas 5 dimensões que realmente indicam potencial de fechamento no Agronegócio.

**4. Recebe a estratégia de abordagem**
O Scout sugere táticas calibradas para a realidade daquele prospect — não um roteiro genérico.

**5. Registra e monitora**
A investigação vai para o CRM integrado. O Radar avisa quando algo relevante muda no prospect.

---

## Capacidades principais

**Dossiê 360 por área**
Análise investigativa por dimensão: situação fiscal, maturidade de TI, gestão de pessoas, operação de supply chain. Exportável em PDF ou DOC para levar direto para a reunião.

**Score PORTA**
Framework proprietário de qualificação preditiva. Elimina o julgamento subjetivo e entrega um score baseado em evidências do próprio prospect.

**Dois modos de análise**
— *Campo:* linguagem direta, focada em execução e próximos passos táticos.
— *Diretoria:* linguagem executiva, orientada a estratégia e ROI.

**CRM integrado**
Pipeline kanban que nasce da investigação — sem retrabalho de copiar e colar dados entre ferramentas.

**Radar de monitoramento**
Acompanha os prospects salvos e sinaliza quando há movimentação relevante: expansão, licitação, mudança societária, pressão regulatória.

---

## Score PORTA — a qualificação que faz sentido no Agro

O **Score PORTA** resolve um problema clássico: sistemas de qualificação tradicionais subestimam ou superestimam empresas do agronegócio porque olham só para faturamento no CNPJ. O PORTA olha para o que realmente importa.

| Dimensão | O que avalia |
|---|---|
| **P — Porte** | Tamanho real do grupo econômico: hectares, cabeças, unidades industriais |
| **O — Operação** | Complexidade operacional: integração vertical, diversificação de culturas, rastreabilidade |
| **R — Retorno** | Pressão externa: compliance, financiamento rural, exigências de auditoria |
| **T — Tecnologia** | Maturidade e dívida tecnológica interna: sistemas legados, planilhas, silos de dados |
| **A — Adoção** | Janela política e cultural: perfil do decisor, histórico com tecnologia, urgência percebida |

**Como interpretar o score:**

| Faixa | Prioridade |
|---|---|
| 80 – 100 | Prioridade máxima — ação imediata de Field Sales |
| 65 – 79 | Pipeline ativo — trabalhar com senso de urgência |
| 50 – 64 | Ciclo longo — Inside Sales ou nutrição |
| 35 – 49 | Monitorar — ainda não é o momento certo |
| < 35 | Fora do ICP atual |

---

## Para quem é

**Executivo de Contas Senior Sistemas** com foco em Agronegócio, responsável pela venda de ERP, GATEC (gestão agrícola) e HCM (gestão de pessoas) para:

- Usinas sucroalcooleiras
- Cooperativas agrícolas
- Fazendas corporativas e grupos produtores
- Agroindústrias e frigoríficos
- Tradings e distribuidoras de insumos

---

## Impacto esperado

- **Prep de reunião:** de 2–4 horas para menos de 5 minutos
- **Taxa de conversão:** meta de +30% com qualificação mais precisa
- **Qualidade do dossiê:** baseado em evidências, não em suposições
- **Foco do vendedor:** em fechar, não em pesquisar

---

## Primeiros passos (para o time técnico)

```bash
npm install
cp .env.example .env   # configure as chaves necessárias
npm run dev            # acesse em http://localhost:3000
```

Para configuração completa, consulte [`docs/GUIA-INICIANTE.md`](./docs/GUIA-INICIANTE.md).

---

## Documentação interna

| Documento | Finalidade |
|---|---|
| [`docs/GUIA-INICIANTE.md`](./docs/GUIA-INICIANTE.md) | Onboarding passo a passo |
| [`docs/CHECKLIST-PRODUCAO.md`](./docs/CHECKLIST-PRODUCAO.md) | Checklist antes de publicar |
| [`ARQUITETURA.md`](./ARQUITETURA.md) | Visão técnica detalhada (para devs) |
| [`CLAUDE.md`](./CLAUDE.md) | Guia de referência para assistentes de IA |

---

*Senior Scout 360 — Inteligência que fecha negócio.*

## CI/CD e Governança de Merge

- Workflow de CI em `.github/workflows/ci.yml` com checks de `typecheck`, `test` e `build`.
- Recomenda-se proteger a branch `main` exigindo os status checks desse workflow antes de merge.
- No painel da Vercel, mantenha **Production Branch = `main`** para publicar somente código já aprovado no CI.

> **Nota:** substitua `SEU-USUARIO/SEU-REPO` no badge acima pelo caminho real do seu repositório no GitHub.

