# Runbook - Indisponibilidade Supabase

## Quando usar

Use quando auth, persistencia, `scout_diagnostics` ou cache persistente falhar no Preview ou producao.

## Impacto esperado

O app pode continuar parcialmente com estado local, mas persistencia remota, telemetria e isolamento de dados podem ficar indisponiveis. Uma resposta `degraded` nao prova que os dados foram gravados.

## Primeiros 10 minutos

1. Registre horario, SHA, usuario afetado de forma pseudonimizada e superficie: auth, leitura, escrita, cache ou diagnostico.
2. Verifique o status do projeto Supabase e logs Vercel do handler afetado.
3. Diferencie ausencia de env server-side de outage: `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` sao necessarias para cache/diagnostico server-side; nao exponha a service role no browser.
4. Em regressao de dossie, consulte `operator_events` e `scout_diagnostics` antes de atribuir o problema apenas ao frontend.

## Guardrails

- Nao desabilite RLS, nao use service role no cliente e nao aplique migration durante o incidente.
- Nao trate fallback IndexedDB como autorizacao para misturar dados de operadores.
- Nao crie usuarios, dados de teste ou mudancas de schema sem aprovacao explicita.

## Recuperacao

1. Se a causa for externa, manter operacao degradada visivel e registrar o intervalo afetado.
2. Se a causa for configuracao de Preview, corrigir em PR/configuracao autorizada e validar no Preview novo.
3. Se houver suspeita de acesso cross-tenant, parar a validacao funcional, preservar evidencia e seguir o plano da PR #412 com teste multiusuario controlado.

## Encerramento

Registre a causa, tabelas/rotas afetadas, janela de dados potencialmente nao persistidos e confirmacao de recuperacao. Nao inclua service role, bearer token ou registros com PII.
