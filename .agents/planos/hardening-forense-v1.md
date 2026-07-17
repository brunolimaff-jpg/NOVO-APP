# Especificação canônica — hardening forense v1

## Escopo e problema

O terceiro piloto supervisionado iniciou o runtime e consumiu uma tentativa. O
Codex terminou com `exit_code=0`, sem timeout ou sinal, mas o arquivo obrigatório
não foi entregue (`DELIVERY_FILE_MISSING`). A causa permaneceu
`INSUFFICIENT_EVIDENCE`: o runtime não preservou JSONL bruto, mensagens completas,
mensagem final, comandos, argv, cwd, exit codes internos e stdout/stderr
suficientes para reconstruir a execução.

O hardening deve permitir reconstrução segura após o spawn, sem expor segredos,
alterar a semântica de entrega, ampliar permissões, habilitar rede, introduzir
shell indireto ou permitir retry automático.

## Lacunas atuais confirmadas

- A captura atual lê stdout e stderr completos em memória e só trunca depois do
  encerramento do processo.
- O processamento retém principalmente hashes e diagnóstico agregado; detalhes
  de eventos, mensagens, comandos e streams não são persistidos de forma forense.
- A reserva one-shot ocorre depois do retorno de `AgentSingleRuntime.run!`, criando
  uma janela em que o processo pode iniciar sem a tentativa ficar registrada.

## Contrato de execução

### Reserva one-shot

Depois de todos os prechecks, autorizações e validações, e antes de
`Open3.popen3`, reservar atomicamente a missão com `File::CREAT | File::EXCL`.
Registrar missão, tentativa, timestamp, baseline/hash aplicável e status
`reserved`. State existente bloqueia a execução e nunca é removido
automaticamente. Após a reserva, qualquer falha consome a tentativa; não existe
retry automático.

Estados mínimos: `reserved`, `spawn_started`, `process_finished`,
`report_finalized`, `failed`. A leitura deve permanecer compatível com state
legado contendo apenas `missao_id`, `timestamp` e `report_hash`; não converter nem
apagar state legado.

### Raiz e layout de evidências

Execução real em modo agent-runtime exige `--evidence-root PATH` ou
`AGENT_RUNTIME_EVIDENCE_ROOT`. Ausência produz
`FORENSIC_EVIDENCE_ROOT_REQUIRED`. `Dir.tmpdir` é permitido somente em testes e
como local temporário da escrita atômica, cujo rename final ocorre na raiz
definitiva.

Requisitos da raiz: caminho absoluto, ancestor validado por `realpath`, cadeia
sem symlink, missão normalizada, diretório por missão/tentativa sem traversal,
raiz e diretórios `0700`, arquivos `0600`, criação fail-closed e nenhuma escrita
na worktree ou fora da raiz autorizada. A recomendação operacional é
`${XDG_STATE_HOME:-$HOME/.local/state}/novo-app/agent-evidence`.

Cada tentativa deve produzir, quando possível, exatamente estes quatro artefatos:

1. `execution-stream.sanitized.jsonl` — stdout observado como stream JSONL
   sanitizado, incluindo registros explícitos para linhas inválidas;
2. `execution-evidence.json` — eventos normalizados, mensagens, comandos/tool
   calls disponíveis no protocolo, processo, entrega, limitações e estado;
3. `stderr.sanitized.log` — stderr sanitizado e limitado;
4. `evidence-manifest.json` — manifesto determinístico de integridade.

Não criar `stdout.sanitized.log`. O Run Report deve referenciar apenas caminhos
relativos à raiz externa, nunca a raiz absoluta.

### Captura e limites

Ler stdout e stderr concorrentemente com `readpartial`, drenando ambos os pipes
mesmo depois de um limite. Preservar a ordem observável do stdout com sequência
monotônica. Não acumular conteúdo ilimitado e não introduzir shell.

Limites obrigatórios:

- 1 MiB para stdout/JSONL sanitizado;
- 1 MiB para stderr sanitizado;
- 10.000 registros de stream;
- 16 KiB por evento ou mensagem.

Ao atingir limite, descartar conteúdo adicional sem bloquear o processo,
registrar bytes/registros descartados, marcar `truncated=true` e
`evidence_status=partial`, e impedir resultado geral `success`.

### Sanitização

Usar allowlist fail-closed antes de persistir. Nunca persistir tokens, API keys,
cookies, headers Authorization/Bearer, secrets, variáveis de ambiente,
parâmetros secretos de URL, conteúdo integral de arquivos, payloads arbitrários
de ferramentas ou comandos com credenciais.

Normalizar caminhos conhecidos para `<WORKTREE>`, `<REPOSITORY>`, `<HOME>` e
`<EVIDENCE_ROOT>`. Quando seguro, registrar somente presença, hash, tamanho,
resumo ou valor mascarado. Em falha do sanitizador, descartar o original,
registrar hash/tamanho apenas se seguro, marcar `sanitization_failed=true` e
evidência incompleta; após a reserva, a missão falha.

Linha JSONL inválida deve gerar no stream sanitizado um registro com sequência,
tipo `invalid_jsonl_line`, hash da linha original, bytes observados, conteúdo
sanitizado/truncado quando seguro e motivo do parsing. Eventos desconhecidos
devem ser preservados apenas na forma sanitizada e limitada; campos não
fornecidos pelo protocolo não podem ser inventados.

### Checkpoints e integridade

Persistir atomicamente, com arquivo temporário no mesmo filesystem e rename,
checkpoints de: reserva; spawn/PID; captura iniciada; processo encerrado; streams
drenados; entrega verificada; comparação concluída; relatório construído. Falhas
após o spawn devem preservar evidência parcial e manter a missão bloqueada.

O manifesto é criado por último, com serialização JSON determinística e SHA-256
verificável para cada artefato, registrando nome relativo, bytes, encoding,
truncamento e sanitização. Deve registrar `schema_version: 1`, limite global,
`retention_days: 30` e limitações. Não implementar exclusão automática; retenção
é declarada e remoção permanece manual ou futura, mediante autorização.

O contrato de evidência deve representar indisponibilidade explicitamente, por
exemplo:

```json
{"availability":"unavailable","reason":"not_provided_by_codex_protocol"}
```

O Run Report deve registrar `evidence_status` (`complete`, `partial` ou
`unavailable`), caminho relativo e SHA-256 do manifesto, versão do schema,
códigos de falha forense e limitações.

## Semântica de resultado

`success` exige simultaneamente processo conforme, entrega obrigatória criada e
validada, comparação conforme, evidência `complete` e manifesto persistido e
validado. Entrega e evidência são gates independentes. `exit_code=0` continua
insuficiente.

Falha forense após a reserva mantém a tentativa consumida e produz falha geral,
sem reparar output e sem retry. Preservar os códigos existentes, incluindo
`DELIVERY_FILE_MISSING`, `DELIVERY_FAILED` e
`THIRD_PILOT_FAILED_NO_RETRY`. Adicionar, quando aplicável:

- `FORENSIC_EVIDENCE_ROOT_REQUIRED`;
- `FORENSIC_EVIDENCE_INCOMPLETE`;
- `FORENSIC_PERSISTENCE_FAILED`;
- `EVIDENCE_MANIFEST_INVALID`;
- `CODEX_JSONL_INVALID_LINE`;
- `CODEX_JSONL_LIMIT_REACHED`.

## Arquivos provavelmente modificados

Avaliar primeiro abstrações existentes. Mudanças prováveis:

- `scripts/lib/codex_single_agent_runtime.rb` — captura concorrente e limitada;
- `scripts/lib/agent_single_runtime.rb` — integração, gates e checkpoints;
- `scripts/run-agent-mission.rb` — opção/ambiente de raiz e reserva pré-spawn;
- `scripts/lib/agent_supervised_pilot.rb` — reserva e evolução atômica do state;
- `scripts/lib/codex_jsonl_diagnostics.rb` — consumo de stream sanitizado;
- novo `scripts/lib/agent_evidence_sanitizer.rb`;
- novo `scripts/lib/agent_forensic_evidence.rb`;
- schema versionado em `.agents/orquestracao/executor/`;
- testes e fixtures de runtime, observação, JSONL, entrega, state e segurança;
- documentação técnica mínima em `CODEX-RUNTIME.md`, `pilotos/README.md` e,
  somente se necessário, `memory/decisions.md`.

Não alterar funcionalidades do produto, falhas preexistentes de CI ou o
encerramento histórico do terceiro piloto.

## Matriz mínima de testes

Testes sem Codex real, cobrindo unitário, integração, negativos, regressão,
segurança e compatibilidade:

| Grupo | Casos mínimos | Resultado esperado |
|---|---|---|
| Entrega | sucesso válido; exit 0 sem arquivo; bytes divergentes; caminho errado; comando falho; texto sem arquivo | entrega continua gate independente e códigos corretos |
| Streams | linha inválida; evento desconhecido; ausência de `turn.completed`; timeout; sinal; stdout/stderr acima do limite; 10.000+ registros | pipes drenados, truncamento explícito, evidência parcial e sem falso sucesso |
| Sanitização | token, cookie, Authorization/Bearer, URL, caminho pessoal, payload e segredo em stdout/stderr | nenhum segredo em qualquer artefato; falha fail-closed |
| Persistência | falha após reserva/spawn; crash Ruby; crash antes do relatório; raiz ausente; diretório indisponível; escrita atômica falha; corrupção/hash divergente | evidência parcial preservada, manifesto rejeitado quando inválido, tentativa consumida |
| Segurança | symlink escape, path traversal, permissões, limites de campo | escrita bloqueada ou permissões `0700`/`0600` |
| State e gates | state legado, reservado, tentativa consumida, precheck bloqueado, dry-run, evidência parcial com entrega válida | compatibilidade, one-shot e ausência de retry preservados |

Adicionar fixtures JSONL determinísticas e testes de regressão para: um agente,
uma missão por vez, aprovação antes da reserva, rede desabilitada, workspace-write,
path guard, DCG fail-closed, proteção de arquivos, comparação planejado ×
observado e impossibilidade de reparo manual do output.

## Critérios de aceite

- Toda execução que ultrapassar o spawn deixa evidência sanitizada, completa ou
  parcial explicitamente marcada.
- Captura é limitada durante a leitura, sem deadlock e sem memória ilimitada.
- Nenhuma credencial ou caminho pessoal indevido aparece nos artefatos.
- Eventos, mensagens finais, comandos, argv, cwd e exit code são persistidos
  somente quando fornecidos pelo protocolo.
- Checkpoints, artefatos e manifesto usam escrita atômica; hashes e ordenação são
  determinísticos e verificáveis.
- Raiz externa é obrigatória em execução real e protegida contra symlink/traversal.
- Falha de evidência após reserva falha a missão e preserva a tentativa.
- Entrega permanece verificação independente; `exit_code=0` não gera sucesso.
- State legado continua legível; one-shot e ausência de retry automático são
  mantidos.
- Testes forenses, de segurança, permissões, corrupção, timeout e pipes passam;
  validações de schemas e `git diff --check` passam.
- Nenhum Codex real, piloto ou quarto piloto é executado nesta implementação.

## Próxima implementação

Implementar em uma única PR técnica, sem merge ou auto-merge, nesta ordem:

1. congelar schema, limites, códigos e fixtures;
2. implementar sanitização fail-closed;
3. implementar raiz, permissões, escrita atômica, checkpoints e manifesto;
4. reservar one-shot antes do spawn com compatibilidade legada;
5. substituir captura integral por leitores concorrentes limitados;
6. integrar eventos, mensagens, entrega, comparação, state e Run Report;
7. atualizar documentação mínima;
8. executar a matriz de testes e gates autorizados;
9. revisar diff, riscos e evidências antes de qualquer publicação.

O quarto piloto permanece proibido até a PR técnica estar implementada,
testada, revisada e mergeada em missão posterior, com nova `mission_id`, novo
template, autorização humana e todos os gates operacionais comprovados.
