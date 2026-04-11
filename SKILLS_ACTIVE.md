# SKILLS ATIVAS — Scout 360

Mapa das **skills críticas** absorvidas de `/Users/brunolima/Documents/NOVO-APP/.agent/skills` (961 total).

Última atualização: **2026-04-11**

---

## 🎯 Localização das Skills

```
Origem:  /Users/brunolima/Documents/NOVO-APP/.agent/skills
Uso:     Referenciar diretamente (não copiadas — sincronizadas por git)
```

---

## 📋 SKILLS POR ESPECIALISTA

### 🧠 **SOPHIA — Prompt Systems & IA**
**Responsabilidade**: Design de prompts, chains, anti-alucinação, Search Grounding, temperatura por caso.

| Skill | Descrição |
|-------|-----------|
| `prompt-engineer` | Fundamentos de prompt engineering |
| `prompt-engineering` | Padrões avançados de prompt |
| `prompt-engineering-patterns` | Patterns reutilizáveis em prompts |
| `prompt-caching` | Cache estratégico de prompts (dupe prevention) |
| `llm-app-patterns` | Patterns para apps com LLMs |
| `llm-application-dev-prompt-optimize` | Otimização de prompts |
| `llm-application-dev-ai-assistant` | AI assistant patterns |
| `llm-application-dev-langchain-agent` | Agent patterns (LangChain-style) |
| `llm-evaluation` | Avaliação e scoring de outputs LLM |
| `gemini-api-dev` | Desenvolvimento com Gemini API |

**Prioridade**: 🔴 **CRÍTICA** — todos os prompts vivem em `src/prompts/`

---

### 📊 **ANDRÉ — Qualidade de Dados**
**Responsabilidade**: Validação CNPJ, freshness >6m, fontes divergentes, acurácia, dados acionáveis.

| Skill | Descrição |
|-------|-----------|
| `data-quality-frameworks` | Frameworks de qualidade de dados |
| `data-engineer` | Engenharia de dados (pipelines, ETL) |
| `data-engineering-data-driven-feature` | Features orientadas a dados |
| `data-engineering-data-pipeline` | Design de data pipelines |
| `database` | Database design & patterns |
| `database-design` | Modelagem de dados |
| `database-optimizer` | Otimização de queries |
| `data-storytelling` | Comunicação de dados ao stakeholder |

**Prioridade**: 🔴 **CRÍTICA** — valida dados antes de Gemini

---

### 🎨 **DIEGO — UX/Performance**
**Responsabilidade**: Skeleton screens, loading granular, zero layout shift, mobile-first, streaming token a token.

| Skill | Descrição |
|-------|-----------|
| `react-best-practices` | Best practices React (hooks, closure, memoization) |
| `react-patterns` | Patterns avançados em React |
| `react-state-management` | Gestão de estado (Context, Zustand, etc) |
| `react-ui-patterns` | Patterns de componentes UI |
| `frontend-design` | Design de interfaces |
| `frontend-dev-guidelines` | Diretrizes de desenvolvimento frontend |
| `frontend-mobile-development-component-scaffold` | Mobile-first component scaffolding |
| `performance-profiling` | Profiling de performance |
| `performance-testing-review-ai-review` | Testing de performance |
| `tailwind-design-system` | Design system com Tailwind |
| `tailwind-patterns` | Patterns e utilities Tailwind |

**Prioridade**: 🔴 **CRÍTICA** — Diego obsessiona por perceived performance

---

### 🛡️ **RAQUEL — QA & Segurança**
**Responsabilidade**: 5 edge cases/feature, retry patterns, timeout 30s, error handling, LGPD, zero catch vazio.

| Skill | Descrição |
|-------|-----------|
| `testing-patterns` | Patterns para testes (unit, integration, e2e) |
| `test-driven-development` | TDD workflows |
| `test-automator` | Automação de testes |
| `test-fixing` | Debug e fix de testes quebrados |
| `error-handling-patterns` | Patterns para tratamento de erros |
| `error-debugging-smart-debug` | Debug inteligente |
| `security-audit` | Auditoria de segurança |
| `security-scanning-security-hardening` | Hardening de segurança |
| `security-scanning-security-sast` | Static analysis (SAST) |
| `security-compliance-compliance-check` | Compliance checks (LGPD, etc) |
| `cc-skill-security-review` | CC custom: code security review |

**Prioridade**: 🟠 **ALTA** — valida 5 falhas/feature

---

### 💻 **HELENA — Dev Senior (Frontend)**
**Responsabilidade**: TypeScript/React COMPLETO, zero `any`, hooks responsabilidade única, decomposição >15KB.

| Skill | Descrição |
|-------|-----------|
| `typescript-expert` | TypeScript avançado |
| `typescript-advanced-types` | Tipos complexos e genéricos |
| `react-modernization` | Modernização de código React |
| `react-flow-architect` | Arquitetura de fluxos React |
| `react-state-management` | State management patterns |
| `cc-skill-frontend-patterns` | CC custom: React/TS frontend patterns |
| `cc-skill-coding-standards` | CC custom: padrões de código |

**Prioridade**: 🔴 **CRÍTICA** — Helena entrega código typesafe completo

---

### 🏛️ **CARLOS — CTO (Arquitetura)**
**Responsabilidade**: SOLID, Clean Architecture, débito técnico, veto acoplamento, decomposição.

| Skill | Descrição |
|-------|-----------|
| `architecture` | Architecture fundamentals |
| `architecture-patterns` | Padrões arquiteturais |
| `architecture-decision-records` | ADRs (Architectural Decision Records) |
| `clean-code` | Clean code principles |
| `cc-skill-backend-patterns` | CC custom: backend patterns (SOLID) |
| `cc-skill-strategic-compact` | CC custom: strategic decisions |

**Prioridade**: 🟠 **ALTA** — Carlos veta acoplamento/god components

---

### ⚙️ **VICTOR — Infra & Integrações**
**Responsabilidade**: Serverless Vercel, API keys server-side, retry + jitter, cache tipado, CI/CD.

| Skill | Descrição |
|-------|-----------|
| `vercel-automation` | Automação de deploys Vercel |
| `vercel-deploy-claimable` | Deploy patterns Vercel |
| `api-design-principles` | API design |
| `api-patterns` | Patterns para APIs |
| `api-security-best-practices` | Security em APIs |
| `api-testing-observability-api-mock` | Testing & mocking de APIs |
| `deployment-pipeline-design` | CI/CD pipeline design |
| `deployment-validation-config-validate` | Validation de configs |

**Prioridade**: 🟢 **MÉDIA** — Victor cuida da infra

---

### 📈 **MARCOS — Comercial & Produto**
**Responsabilidade**: ROI, SPIN/Challenger/MEDDPICC, personas vendedor, score PORTA, feature viabilidade.

| Skill | Descrição |
|-------|-----------|
| `sales-automator` | Automação de vendas |
| `product-manager-toolkit` | PM toolkit (roadmap, metrics, OKRs) |
| `salesforce-development` | Integrações Salesforce |

**Prioridade**: 🟢 **MÉDIA** — Marcos valida ROI

---

## 📚 CC-SKILLS TRANSVERSAIS

Skills custom do projeto (começam com `cc-skill-`):

| Skill | Responsável | Descrição |
|-------|-------------|-----------|
| `cc-skill-frontend-patterns` | Helena | React/TS patterns específicos do projeto |
| `cc-skill-backend-patterns` | Carlos | Backend patterns e SOLID |
| `cc-skill-security-review` | Raquel | Security review checklist |
| `cc-skill-coding-standards` | Helena | Padrões de código do projeto |
| `cc-skill-continuous-learning` | Board | Melhorias contínuas |
| `cc-skill-project-guidelines-example` | Board | Guidelines do projeto |
| `cc-skill-strategic-compact` | Carlos | Strategic decision tracking |
| `cc-skill-clickhouse-io` | André/Victor | Analytics & warehouse |

**Prioridade**: 🔴 **CRÍTICA** — são customizadas para Scout 360

---

## 🔄 COMO USAR

### Referenciando uma Skill
```bash
# As skills vivem em /Users/brunolima/Documents/NOVO-APP/.agent/skills/
# Claude Code as encontra automaticamente por nome

# Exemplo: usar a skill prompt-engineer
/prompt-engineer  # ou via slash command se registrada
```

### Adicionando Skill ao settings.json
```json
{
  "skills": {
    "active": [
      "prompt-engineer",
      "react-best-practices",
      "cc-skill-frontend-patterns"
    ]
  }
}
```

---

## ⚠️ SKILLS EXPLICITAMENTE NÃO USADAS

Skills que foram revisadas mas **não são críticas** para Scout 360:

- `angular-*` (projeto é React)
- `vue-*` (projeto é React)
- `mobile-native` (não é native, é web React)
- `kubernetes-*` (infra é Vercel serverless, não k8s)
- `terraform-*` (não aplicável a stack)
- `blockchain-*` (fora do escopo)
- `game-dev-*` (fora do escopo)

---

## 📞 PRÓXIMOS PASSOS

1. **Testar integração** — executar skill-creator, skill-developer para validar que as skills carregam
2. **Mapear cada Especialista** — criar shortcut ou `.claude/skills-{especialista}.json`
3. **Validar Sophia** — testar 3 prompts com variações de temperatura
4. **Documentar fluxo** — criar tutorial de "como usar skill X"

---

**Board Room Sign-off**: Aguardando aprovação do stakeholder (Bruno).
