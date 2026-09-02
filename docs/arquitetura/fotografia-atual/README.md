# Fotografia atual do Scout

Documentação visual e técnica do AS-IS do Senior Scout 360.

## Regra editorial

- Português e conceito primeiro.
- Nome técnico apenas entre parênteses ou na referência técnica.
- Uma visão responde uma pergunta.
- Separar **O QUE ESTÁ COMPROVADO HOJE**, **O QUE ISSO INDICA PARA A ARQUITETURA** e **O QUE AINDA PRECISA SER DECIDIDO**.
- PNG é usado nos documentos do Google Drive; Mermaid é a fonte editável versionada aqui.
- Código presente, wiring, configuração, deploy, execução e resultado são níveis diferentes de evidência.

## Visões canônicas

1. Visão geral — o que é o Scout hoje.
2. Fluxo completo do dossiê — do início à entrega.
3. Sistemas e conexões — com quem o Scout conversa.
4. APIs e integrações — quais serviços são chamados.
5. Caminho dos dados — onde cada informação nasce e termina.
6. Estados da investigação — como começa, termina ou fica presa.
7. Onde cada parte funciona — navegador, Vercel, Supabase e externos.
8. Qualidade e publicação — o que revisa, altera ou libera o resultado.
9. Proteções e recuperação — o que existe para evitar ou recuperar falhas.
10. Segurança e fronteiras de dados — quem acessa o quê e onde os dados circulam.
11. Monitoramento e custo — como sabemos o que aconteceu.
12. Estado do código — em uso, condicional, desativado do fluxo ou residual.
13. Riscos e dívidas atuais — o que merece decisão.

### Aprofundamento operacional do CP-05

- **12A — Mapa operacional de capacidades:** qual é o estado, ambiente e força da evidência de cada capacidade.
- **12B — Dependências e criticidade:** o que acontece se cada capacidade falhar.
- **12C — Responsabilidades atuais:** quem garante cada propriedade hoje.

Vocabulário operacional usado nesta fase:

- **Em uso (LIVE)** — governa o caminho atual do baseline indicado.
- **Em uso sob condição (CONDICIONAL)** — depende de flag, configuração, ambiente ou condição.
- **Desativado do fluxo principal (SHADOW)** — existe e pode estar testado, mas não governa o produto atual.
- **Desativado por configuração (OFF/GATED)** — existe, mas uma regra explícita impede a execução.
- **Disponível, uso não comprovado** — implementação presente sem caller material demonstrado.
- **Residual / histórico** — compatibilidade, história ou telemetria antiga; não é a espinha atual.
- **Fora do baseline** — pertence a outra branch, PR ou versão.
- **Capacidade ausente (GAP)** — propriedade necessária sem capacidade canônica equivalente comprovada hoje.

## Baseline

A fotografia atual está sendo consolidada sobre o PR #492 / `feat/bru-157-zen-only-stabilization` no SHA auditado `c5a7ab8bc37256ab9c4085a98b61fc5072ceb8d9`.

Regra canônica: **#492 does not contain V3; V3 exists only on sibling #491.**

Esta branch é exclusivamente documental. Não altera código do produto, não muda PRs de produto e não redefine o backlog do Linear.
