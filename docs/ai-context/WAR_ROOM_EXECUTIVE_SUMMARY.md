# Resumo Executivo — War Room Hardening

## O que foi travado

O War Room técnico deixou de responder com base em “conhecimento provável”.
Agora ele só responde quando encontra contexto suficiente na documentação oficial indexada e validada por domínio.

## Por que o Google Search saiu

O pedido original era restringir busca aberta ao domínio oficial da Senior.
Isso não é suportado de forma nativa pelo SDK Gemini hoje.
Para evitar falsa segurança, a iteração atual desliga `googleSearch` e opera apenas com Pinecone + allowlist de domínio.

## O que muda para o vendedor

- cai o risco de receber resposta inventada com aparência confiável
- perguntas fora da cobertura documental passam a receber recusa clara
- a recusa já aponta reformulação e portal oficial como rota alternativa

## O que fica para roadmap

- ativação real do modo `Concorrentes`, hoje apenas visível como “Em breve”
- busca custom por domínio oficial via function-calling/serverless
- eventual reavaliação do grounding nativo se o SDK Gemini passar a suportar `allowedDomains`
