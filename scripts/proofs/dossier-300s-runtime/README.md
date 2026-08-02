# Prova local 05E.0A — alvo server-owned multi-call

Este diretório contém somente um harness local e injetável para o alvo congelado pelo Planner:

`api/dossier.ts` (envelope futuro) → `api/_dossier-server-pipeline.ts` (helper canônico) → provider/pesquisa/persistência/finalização.

O `pipeline-harness.ts` exerce diretamente `createDossierServerPipeline` com adapters sintéticos. Não há provider, rede, Supabase, Preview, deploy ou espera real. O `budget-model.ts` é explicitamente um modelo independente de orçamento para o hard cap de 300s, pois o envelope existente sob `api/` permanece somente leitura neste lote e ainda está parametrizado para 50s/60s.

Execute:

```bash
bash scripts/proofs/dossier-300s-runtime/run-05e0a.sh
```

O script compara manifesto, hashes e status de `api/` antes/depois, executa o teste focado e falha diante de referência a provider/rede/banco remoto nas provas.

O `recovery-model.ts` é uma prova contratual separada: define estados, fencing token,
lease, retry limitado, checkpoints sem duplicação, reconciliação terminal e matriz de
persistência. Ele não copia a orquestração do helper canônico e não representa
persistência real. Os três caminhos sintéticos (base, conditional e recovery) ficam
abaixo de 240s de trabalho para preservar 30s antes do hard cap de 300s.

Limite importante: o helper canônico atual ainda não contém retry, reconciliação PORTA
ou persistência terminal. A prova registra essa ausência; ela não é simulada nem
tratada como capacidade server-owned aprovada.
