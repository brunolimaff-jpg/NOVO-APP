# Benchmark do harness Codex — protocolo 5.6

> **Fase:** 3B.1.5  
> **Atualizado:** 2026-07-13  
> **Superfície preferencial:** `codex exec` / CLI nativo  
> **Não usar como baseline:** Desktop, Ultra, Fast, Multi-Agent V2 global

## Objetivo

Comparar, com tarefa mínima e read-only:

```text
A — agente único
B — coordenador + 1 filho
```

Esta fase **não** implementa mais autonomia. O benchmark só mede se multi-agent reduz tempo/qualidade sem explodir consumo.

## Condições de execução

Pré-requisitos:

- `codex` instalado
- autenticação válida
- sem alerta de limite/quota
- versão identificável

Limites desta fase:

- no máximo **2 probes reais**
- não alterar `~/.codex/config.toml`
- não ativar `features.multi_agent_v2`
- não fixar janela de contexto
- não usar Desktop como baseline
- parar se o harness não confirmar modelo/papel/sandbox do filho

## Probe A — agente único

```text
modelo solicitado: Sol
reasoning: medium
sandbox: read-only
subagentes: nenhum
tarefa: inspecionar git status e resumir em uma frase
```

## Probe B — um único filho

```text
pai: Sol medium
máximo: 1 filho
filho solicitado: Terra medium
fork_turns: none
sandbox: read-only
tarefa: inspecionar git status e resumir em uma frase
```

Confirmar no runtime, quando exposto:

- modelo real do filho
- reasoning real
- `agent_role` real
- sandbox real

Não repetir o probe se:

- o filho herdar Sol indevidamente
- o papel ficar `null`
- o sandbox não for read-only
- surgir erro de schema
- o consumo cair de forma anormal
- o filho não encerrar
- houver aviso de limite

Nesses casos, registrar `BLOCKED_BY_HARNESS` (ou `BLOCKED_BY_QUOTA`).

## Métricas

Registrar por execução:

```text
data/hora
versão do Codex
superfície utilizada
modelo do pai solicitado
reasoning do pai solicitado
modelo do pai observado
reasoning do pai observado
filho criado
fork solicitado
modelo do filho solicitado
modelo do filho observado
reasoning do filho solicitado
reasoning do filho observado
agent_role observado
sandbox observado
duração
compactações observadas
consumo antes/depois, quando disponível
resultado
intervenções humanas
erros
```

## Critério de aprovação futura

Multi-agent somente poderá virar padrão quando:

```text
reduzir tempo em pelo menos 20%
ou melhorar materialmente a qualidade

e

consumir no máximo 1,5x o agente único
e não aumentar a intervenção humana
```

## Classificação de resultado

```text
SUPPORTED
PARTIAL
UNRELIABLE
BLOCKED_BY_HARNESS
BLOCKED_BY_QUOTA
NOT_EXECUTED
```

## Registro desta fase (3B.1.5)

| Campo                  | Valor                                                 |
| ---------------------- | ----------------------------------------------------- |
| data/hora              | 2026-07-13T18:36Z                                     |
| versão do Codex        | `codex-cli 0.144.0`                                   |
| superfície             | CLI nativo (`codex exec --ephemeral`)                 |
| Probe A                | tentado 1x; interrompido após ~270s sem resposta útil |
| Probe B                | **não executado** (parar se A não encerrar)           |
| classificação agregada | `BLOCKED_BY_HARNESS`                                  |

### Resultado dos probes

#### Probe A

```text
classificação: BLOCKED_BY_HARNESS
modelo do pai solicitado: Sol (mapeado no CLI para gpt-5.5)
reasoning do pai solicitado: medium
sandbox solicitado: read-only
filho criado: não
duração observada: ~270s até kill manual
consumo antes/depois: indisponível (sem output JSON utilizável)
intervenções humanas: 1 (kill do processo pendurado)
erros: processo não encerrou; sem confirmação runtime de modelo/reasoning
notas: auth_file presente; versão identificável; sem alerta explícito de quota no stdout capturado
```

#### Probe B

```text
classificação: NOT_EXECUTED
notas: regra da fase — não expandir após A não encerrar
```

## Limitações conhecidas do harness (externas)

Não corrigir o Codex nesta fase. Tratar como limitações externas:

- `#31814` — Sol/V2 pode ocultar modelo, reasoning e agent_type
- `#31864` — colisão com `collaboration.spawn_agent`
- `#20077` — fork padrão pode copiar histórico completo
- `#32291` — Desktop pode ignorar agente customizado e modelo solicitado
- `#32591` — amplificação de consumo com múltiplas threads/subagentes
- `#32640` — loops de espera podem gerar novas inferências
- `#32806` — janela de contexto entregue pelo catálogo pode variar

## Relação com governança do repo

- `.codex/agents/*.toml` continuam adaptadores declarativos.
- Cartão de Missão + executor controlado permanecem a fronteira de autorização.
- Esta limitação **não** invalida as Fases 0–3B.1.
