# Checklist de Promocao - Inbox para Prospects

Use este checklist antes de mover qualquer nota de `Inbox/WebClips/` para `Prospects/<empresa>/`.

## Gate obrigatorio

- [ ] Nome da nota segue o formato `YYYY-MM-DD_empresa_fonte`.
- [ ] Campo `prospect` preenchido com a empresa correta.
- [ ] Campo `owner` preenchido com o operador responsavel.
- [ ] Campo `status` atualizado para um estado de triagem (`triado`, `prospect`, ou equivalente do time).
- [ ] Campo `title` representa o assunto real do recorte.
- [ ] Campo `source_url` aponta para a fonte original.
- [ ] Campo `source_domain` corresponde ao dominio da fonte.
- [ ] Campo `captured_at` existe e esta valido.
- [ ] Campo `sensitivity` esta definido corretamente:
  - `public` para fonte sem sensibilidade
  - `restricted` para fonte autenticada ou conteudo sensivel
- [ ] Secao `Resumo` preenchida.
- [ ] Secao `Sinais PORTA` preenchida com pelo menos um sinal acionavel.
- [ ] Secao `Evidencias` inclui trechos ou fatos verificaveis.
- [ ] Secao `Proxima acao` define responsavel e proximo passo.

## Regras de bloqueio

Nao promover quando:

- houver placeholder (`PREENCHER_*`) em nome, frontmatter ou conteudo;
- houver dados sensiveis sem redacao;
- `sensitivity` nao estiver coerente com a origem;
- faltar qualquer secao obrigatoria.

## Acao final

Se todos os itens estiverem OK:

1. Mover para `Prospects/<empresa>/`.
2. Registrar a promocao na rotina operacional do time.
