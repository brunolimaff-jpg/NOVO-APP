# Runbook - LiteLLM 5xx

## Quando usar

Use quando um modulo de chat ou waterfall retorna 5xx, timeout ou fallback inesperado associado ao gateway LiteLLM.

## Impacto esperado

Uma investigacao pode degradar, expirar ou usar o provedor de excecao documentado. Nao conclua que Gemini ou LiteLLM foi usado apenas por uma flag do cliente.

## Primeiros 10 minutos

1. Registre hora, URL do Preview/producao, SHA, modulo e mensagem de erro sem prompt, CNPJ, email ou conteudo de dossie.
2. Consulte os logs Vercel do mesmo deployment e filtre `/api/gemini` por 5xx, timeout e request ID.
3. Consulte a telemetria de roteamento da PR #413: provider, modelo, motivo e status. Ausencia dessa evidencia torna o diagnostico inconclusivo.
4. Compare com uma chamada curta e autorizada no Preview; nao use producao como bancada de teste.

## Diagnostico

| Sinal | Hipotese | Acao segura |
| --- | --- | --- |
| Nao ha request no Vercel | cliente, auth ou gate antes da API | verificar Network e gate de experimento |
| `/api/gemini` retorna 5xx com LiteLLM selecionado | gateway, credencial ou modelo | confirmar URL, autenticacao e modelo no gateway |
| Provider Gemini com cache/grounding | excecao arquitetural conhecida | registrar como excecao; nao chamar de fallback LiteLLM |
| Timeout sem abort observavel | orcamento ou saturacao | coletar duracao por etapa antes de alterar timeout |

## Mitigacao e recuperacao

- Nao altere `LITELLM_*`, `LLM_PROVIDER` ou modelos diretamente em producao durante o incidente.
- Se houver PR de correcao, valide no Preview com evidencias de provider/modelo por modulo e rollback definido por `git revert`.
- Se o problema for externo ao app, comunique degradacao e preserve os IDs de request para o time responsavel pelo gateway.

## Encerramento

Anexe ao incidente: SHA, horario, provider/modelo efetivo, rota, status, duracao e decisao tomada. Nunca anexe prompts, dossies, CPF/CNPJ, tokens ou headers.
