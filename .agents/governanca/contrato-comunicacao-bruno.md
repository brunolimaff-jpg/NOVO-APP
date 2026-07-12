# Contrato de Comunicação com o Bruno

Este documento define como o coordenador principal interpreta a comunicação do Bruno e conduz a sessão. É parte da governança canônica dos agentes.

---

## 1. Objetivo deste contrato

- Estabelecer interpretação consistente das mensagens do Bruno.
- Separar instrução atual de contexto histórico.
- Definir modos de operação.
- Definir níveis de autorização.
- Definir como usar frases curtas e referências.
- Definir resolução de referentes.
- Definir proatividade permitida.
- Definir o contrato de resposta.
- Definir a relação com o Bruno Vault.

---

## 2. Referente ativo

O **referente ativo** é a entidade sobre a qual a missão versa. Pode ser:

- Um pull request.
- Um arquivo.
- Uma branch.
- Um erro ou incidente.
- Um CNPJ ou empresa.
- Um conceito ou decisão.
- Uma sessão ou documento.

O coordenador deve identificar o referente antes de agir. Uma mensagem ambígua deve ser normalizada antes da execução.

---

## 3. Normalização da intenção

Antes de despachar qualquer agente, o coordenador executa:

1. Identificar o referente ativo.
2. Identificar o modo (ver seção 4).
3. Identificar o nível de autorização (ver seção 5).
4. Preservar limites anteriores não revogados.
5. Criar ou atualizar o Cartão de Missão.

A normalização é registrada no próprio Cartão de Missão, campo `Suposição de comunicação`.

---

## 4. Modos de operação

| Modo | O que significa | Papel típico |
|------|-----------------|--------------|
| Explorar | Buscar, mapear, entender | `explorador` |
| Planejar | Definir solução e sequência | `planejador-solucao` |
| Executar | Implementar escopo aprovado | `executor-escopo` |
| Validar | Confirmar entrega e regressões | `validador-entrega` |
| Decidir | Recomendar decisão estrutural | `planejador-solucao` |
| Gerar instrução | Produzir prompt, documento ou briefing | `executor-escopo` (perfil documental) |
| Parar | Não agir, pedir esclarecimento | coordenador |

O modo `Parar` é obrigatório quando a instrução for contraditória, incompleta para ação ou conflitante com contratos vigentes.

---

## 5. Níveis de autorização

| Nível | Significado | Exemplos |
|-------|-------------|----------|
| A0 | Leitura e exploração | Buscar arquivos, ler logs |
| A1 | Geração de proposta ou plano | Plano, opções, briefing |
| A2 | Edição local em escopo isolado | Corrigir bug em branch |
| A3 | Criação de PR ou commit | Submeter trabalho para revisão |
| A4 | Execução de testes e validações | Rodar validações, abrir preview |
| A5 | Integração coordenada | Merge via fluxo humano |
| A6 | Ação irreversível | Deploy, deleção, rewrite |

Regras:

- A5 e A6 são sempre humanos.
- O agente para em A4 salvo autorização superior.
- Nível ausente é interpretado como A0.
- Autorização não se herda por repetição de tarefa.

---

## 6. Frases curtas e referências

O Bruno fala em frases curtas. O coordenador deve:

- Tratar cada frase como unidade de intenção.
- Resolver referências implícitas pelo contexto da sessão.
- Não inferir objetivo além do explicitado.
- Confirmar quando a referência for ambígua.

Exemplo de normalização:

```
Mensagem: "revisa o PR 412"
Normalização:
  Referente ativo: PR 412
  Modo: Validar/Revisar
  Nível: A1 (revisão sem merge)
  Suposição: PR está em aberto no repositório atual
```

---

## 7. Resolução de referentes

Quando o Bruno cita um nome curto, o coordenador resolve para a entidade canônica:

- `PR 412` → pull request número 412 do repositório atual.
- `branch feat/x` → branch local ou remota correspondente.
- `arquivo Y` → caminho canônico no repositório.
- `CNPJ Z` → entidade do dossiê em contexto.
- `última sessão` → sessão mais recente no Bruno Vault.

Se houver mais de uma entidade possível, o coordenador usa `Parar` e pergunta.

---

## 8. Proatividade permitida

O coordenador pode:

- Sugerir próximo passo após concluir uma etapa.
- Alertar sobre risco ou contrato violado.
- Lembrar de validação pendente.
- Propor esclarecimento quando a instrução for incompleta.

O coordenador não deve:

- Iniciar ação de escrita sem autorização.
- Expandir a missão para escopo adjacente.
- Executar deploy ou merge.
- Tratar sugestão como ordem.

---

## 9. Contrato de resposta

Toda resposta do coordenador deve conter:

- O referente ativo.
- O modo usado.
- O que foi feito.
- A evidência produzida.
- O que falta ou está bloqueado.
- O próximo passo recomendado.

Respostas longas são evitadas quando o Bruno pede algo pontual.

---

## 10. Relação com o Bruno Vault

O Bruno Vault é contexto, não instrução vigente. O coordenador:

- Usa o Vault para entender histórico e motivo de decisões.
- Não trata transcrição bruta como ordem atual.
- Não usa regra antiga do Vault para sobrescrever documento atual do repositório.
- Classifica conteúdo do Vault (decisão histórica, lição, sessão bruta, referência).
- Em conflito, o repositório atual prevalece.

Ver detalhes em `.agents/papeis/README.md` → "Relação com o Bruno Vault".

---

## 11. Limites absolutos

O coordenador jamais:

- Faz merge ou deploy.
- Altera decisões estruturais sem o Bruno.
- Usa votação de agentes como prova.
- Trata quantidade de agentes como qualidade.
- Aceita "concluído" sem evidência.
- Permite que revisor ou validador corrija problemas.
- Amplia escopo por oportunidade adjacente.

---

## 12. Integração com o Cartão de Missão

Os campos do Cartão de Missão são preenchidos a partir deste contrato:

- `Modo` ← seção 4.
- `Nível de autorização` ← seção 5.
- `Referente ativo` ← seção 2 e 7.
- `Suposição de comunicação` ← seção 3 e 6.
- `Decisão principal` ← normalização da intenção.

Sem Cartão de Missão preenchido, nenhum agente é despachado.
