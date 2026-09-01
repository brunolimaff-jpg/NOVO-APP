# HANDOFF AI — NOVO-APP (Scout 360)

> Atualizado: 2026-09-01 (madrugada, pós-BRU-158 microdelta + BRU-162 instrumentação)
> Branch ativa: `feat/bru-157-zen-only-stabilization` @ `0d336442` (PR #492, Draft, Merge Lock)
> Produção: `main` @ `b6fa24c5` (#489)

## Estado atual

- **BRU-158 MICRODELTA: FECHADO** @ `287358ff` — Gate 1: caracterização do wiring EvidencePack→extraContext + negative control provado (sem `connectEvidencePackToPool`, teste FALHA). Gate 2: formatter expõe `[match=…]`+`[origin=…]` (RED→GREEN). Teste órfão `identityWindowRaceCondition` removido (importava funções inexistentes) → full suite 1789/1789. CI verde no SHA.
- **BRU-162 (Terminalização órfã, P0): In Progress** — criado pelo Planejador após 2 runs órfãos RUNNING com freeze determinístico:
  - Run `e8c1ad56` (deploy 287358ff): 6/6 módulos zen OK, morte pós-`module:end` do último módulo (heartbeat morto 00:18:06Z).
  - Run `c2b3cb56` (deploy 287358ff, sem instrumentação): 6/6 módulos + benchmark + PORTA + inline-validation OK, morte entre `inline-validation:json:parsed` e `post-validate-inline` (02:20:50Z).
  - B1 repro local: NÃO reproduziu (pipeline linear; regex de link patológica satura ~17ms). STOP conforme despacho.
- **Instrumentação implementada** @ `0a396975` (desenho do Planejador): `utils/longTaskObserver.ts` (long tasks >100ms, timestamp+duração+fase, sem PII) + `markPhase()` com 8 marcadores (benchmark/finalize/save/mark_completed, start/done) + `flushDiagnosticsNow` imediato. Testes: observer 7/7, orchestrator 42/42, full 1789/1789, CI verde.
- **DuplicateDossierModal → banner inline** @ `0d336442` (pedido do Bruno): overlay z-50 não bloqueia mais o fluxo; botões com data-testid (`btn-new-research`, `btn-access-existing`, `btn-dismiss-duplicate`).
- **Deploys**: `scoutagro-1tgi2jrsi` (0a396975) · `scoutagro-pcgupdbon` (0d336442, Ready 22:34) — **run #3 deve ser disparado aqui**.
- **CI**: todos os gates verdes no head; Golden Dossier Live = FAILURE pré-existente de credencial (BRU-160).
- **BRU-156 (recovery)** e **BRU-161 (epistemic guard)**: bloqueados por BRU-162.

## Não fazer

- Nunca mergear sem a palavra MERGE do Bruno. Merge Lock ativo na #492.
- Nada de senha/Golden/Brave/troca de modelo/Produção/schema sem despacho.
- Decisões de credencial/secret/segurança: NUNCA sozinhas.
- Cleanup de runs órfãos: agora são 2 candidatos (`e8c1ad56`, `c2b3cb56`) — a condição "único candidato" do Planejador não vale mais; pedir autorização.
- Não criar `VITE_OPENCODE_ZEN_*`; nunca imprimir chave/senha.

## Próximo passo

1. **Bruno dispara run #3 em `scoutagro-pcgupdbon`** (recarregar a aba p/ build novo); executor acompanha pelo banco xlvs (`WaterfallPhase`, `LongTask`, `module:*`, `dossier_runs`) — zero polling de DOM (protocolo BRU-98).
2. Com o pino do freeze: retorno ao Planejador → despacho da correção.
3. Cleanup dos 2 órfãos (autorização condicional expirada — são 2 candidatos).
4. Depois: BRU-156 → BRU-161 → V3 (#491).

## Referências

- PR #492: https://github.com/brunolimaff-jpg/NOVO-APP/pull/492
- Vault: [[2026-09-01T22-45-00-bru162-instrumentacao-freeze]] · [[2026-08-31T19-30-30-bru158-q1-evidence-pool-fechamento]]
- Lições: [[2026-09-01-build-info-prova-sha-em-execucao]] · [[2026-09-01-modal-bloqueante-vs-banner-inline]]
- Evidência B1: `.tmp/bru162-b1/` (repro + RESULTADO.md)
