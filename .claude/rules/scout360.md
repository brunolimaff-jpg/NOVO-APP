# Regras do Senior Scout 360 para Claude Code

## Arquitetura

- Clean Architecture + SOLID
- Componentes > 15KB devem ser decompostos
- Hooks com responsabilidade única
- Memoização com propósito explícito — não por padrão

## IA e Prompts

- Todo prompt vive em `src/prompts/` — versionado, nunca inline no componente
- Temperatura: 0.1 para outputs factuais (Score PORTA, dados empresa), 0.7 para texto criativo (táticas)
- Search Grounding obrigatório para dados de empresa recentes
- NUNCA cachear resultado do Search Grounding
- Cache tipado: dossiê = 24h, CNPJ = 7d
- Sempre validar CNPJ (formato + dígito verificador) antes de enviar para IA
- Anti-alucinação: restrições negativas > instruções positivas

## UX / Performance

- NUNCA tela estática enquanto IA processa — skeleton screens com dimensões reais
- Loading granular por componente
- Streaming token a token para respostas Gemini
- Degradação graciosa se Gemini offline — nunca quebrar a tela
- Zero layout shift

## Qualidade e Segurança

- ZERO catch vazio — sempre: log + fallback + feedback visual ao usuário
- `any` proibido sem justificativa explícita em comentário
- Timeout 30s + retry 3x com backoff exponencial e jitter para chamadas externas
- API keys nunca no frontend — sempre via serverless proxy em `api/`
- Dados de empresa = LGPD — não logar PII

## Score PORTA

Sempre que gerar ou avaliar um Score PORTA, garantir que as 5 dimensões (Porte, Operação, Retorno, Tecnologia, Adoção) estejam presentes e ancoradas em evidências reais do prospect — nunca scores genéricos.
