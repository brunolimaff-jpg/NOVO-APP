# Auditoria de Falhas Silenciosas (Silent Catch Audit)

## Sumario

- Total de ocorrencias: 128 (catch blocks em codigo fonte, excluindo testes)
- P0 (corrigir imediatamente): 7
- P1 (corrigir na proxima sprint): 14
- P2 (aceitavel por design): 107

---

## Criterios de Classificacao

| Prioridade | Definicao                                                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **P0**     | Operacao criticas que falham sem nenhum log, sem feedback ao usuario, e podem causar perda de dados ou comportamento incorreto silencioso |
| **P1**     | Falha silenciosa degrada a experiencia (ex: fallback gracioso sem log), mas nao corrompe dados. Deveria ter scoutDiag.warn                |
| **P2**     | Aceitavel por design (IDB indisponivel, clipboard fallback, localStorage privado, parse de URL com fallback explicito, funcoes debug)     |

---

## P0 — Corrigir Imediatamente (7)

### 1. `services/gemini/investigation-orchestration.ts:631`

```ts
    } catch {
      // silencioso
    }
```

**Contexto:** Detecta concorrente no texto final do dossie. Se `isConcorrenteOuPropria()` lanca excecao, a deteccao e engolida sem nenhum rastro. O usuario pode receber um dossie sobre concorrente sem saber.

**Sugestao:**

```ts
    } catch (error) {
      scoutDiag.error('Investigation', 'Falha em isConcorrenteOuPropria', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
```

---

### 2. `features/radar/useRadar.ts:104-117` (4 persist functions)

```ts
try {
  await set(IDB_ALERTS_KEY, data);
} catch {
  /* IDB unavailable */
}
try {
  await set(IDB_CONFIG_KEY, data);
} catch {
  /* IDB unavailable */
}
try {
  await set(IDB_LAST_SCAN_KEY, ts);
} catch {
  /* IDB unavailable */
}
try {
  await set(IDB_META_INSIGHT_KEY, insight);
} catch {
  /* IDB unavailable */
}
```

**Contexto:** Quando o usuario configura o Radar e executa varreduras, as preferencias e alertas sao persistidos em IndexedDB. Se o IDB falhar (storage cheio, corrompido, Safari privado), o usuario nunca sabe. A interface mostra os alertas normalmente, mas apos recarregar a pagina, tudo desaparece. Perda total de configuracao + alertas acumulados sem nenhum aviso.

**Impacto:** Usuario confia que dados estao salvos. Recarrega a pagina. Perde tudo.

**Sugestao:** Adicionar `scoutDiag.warn` em cada catch. Alternativamente, consolidar em uma funcao unica com log centralizado.

```ts
try {
  await set(IDB_ALERTS_KEY, data);
} catch {
  scoutDiag.warn('Radar', 'Falha ao persistir alertas em IDB');
}
```

---

### 3. `features/radar/useRadar.ts:138-140`

```ts
      } catch {
        // IDB unavailable, use defaults
      }
```

**Contexto:** Carregamento inicial do Radar. Se o IDB esta disponivel mas corrompido, ou se o parse do JSON salvo falha, todas as configuracoes e alertas salvos sao perdidos silenciosamente. O usuario comeca do zero sem saber.

**Sugestao:**

```ts
      } catch (err) {
        scoutDiag.warn('Radar', 'Falha ao carregar dados iniciais do IDB (usando defaults)', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
```

---

### 4. `utils/conversationHistory.ts:42-44`

```ts
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
```

**Contexto:** Se o localStorage tem dados corrompidos (ex: versao antiga do formato), `JSON.parse` lanca excecao e o historico inteiro do usuario e perdido sem aviso. Nenhuma tentativa de recuperacao ou fallback.

**Sugestao:**

```ts
  } catch (err) {
    console.warn('[ConversationHistory] Historico corrompido, iniciando novo:', err);
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
```

---

### 5. `utils/linkValidation.ts:26-28`

```ts
  } catch {
    return {};
  }
```

**Contexto:** `fetchLinkStatuses` e chamado para validar links antes de exibi-los como verificados. Se a API `link-status` falha (rede, servico indisponivel, 5xx), o retorno `{}` faz com que todos os links parecam `unknown` ou `valid`. O usuario ve links "verificados" que nao foram verificados.

**Sugestao:**

```ts
  } catch (err) {
    scoutDiag.warn('LinkValidation', 'Falha ao consultar /api/link-status', {
      urls: uniqueUrls.length,
      error: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
```

---

### 6. `features/dossier/waterfall-orchestrator.ts:102-104`

```ts
  } catch {
    return [];
  }
```

**Contexto:** A funcao que valida URLs candidatas para o dossie chamando `/api/link-status` retorna `[]` silenciosamente em qualquer erro. Os sources do dossie ficam vazios e o usuario nao ve fontes verificadas. Nenhuma indicacao de que a verificacao falhou.

**Sugestao:**

```ts
  } catch (err) {
    scoutDiag.warn('ModularDossier', 'Falha ao filtrar URLs validas', {
      candidates: candidates.length,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
```

---

### 7. `services/competitorService.ts:92-94`

```ts
  } catch {
    return null;
  }
```

**Contexto:** `parseFirstJsonObject` tenta fazer `JSON.parse` em um chunk de texto. Se falha, retorna `null`. Os callers (`pullCompetitorProfile`, `generatePricingIntel`) recebem `null` e continuam — o concorrente simplesmente nao aparece. Se o erro for por formato inesperado da API Gemini, deveria logar.

**Sugestao:**

```ts
  } catch (err) {
    scoutDiag.warn('Competitor', 'Falha ao parsear JSON do concorrente', {
      error: err instanceof Error ? err.message : String(err),
      preview: jsonChunk.slice(0, 100),
    });
    return null;
  }
```

---

## P1 — Corrigir na Proxima Sprint (14)

### 8-11. `services/gemini/auxiliary.ts:91, 101, 357`

```ts
91:    } catch {
      // fallback para o roteador atual...
    }
101:  } catch {
      return fallback;
    }
357:  } catch {
      return [];
    }
```

**Contexto:** Geracao de curiosidades de loading e questoes de continuidade. Quando o modelo Flash falha (linha 91), faz fallback para Router. Quando o Router tambem falha (linha 101), retorna fallback basico. A linha 357 e parse de JSON para perguntas. Todos deveriam logar ao menos um `scoutDiag.warn` para diagnosticar a saude dos modelos.

---

### 12-13. `services/gemini/recovery.ts:8-9, 56-58`

```ts
8:   } catch {
      // no-op
    }
56:  } catch {
      return false;
    }
```

A linha 8 (`debugRecovery`) e uma funcao de debug que ja tem guard — aceitavel, mas `// no-op` e sempre duvidoso. A linha 56 (`shouldRecoverOpenQuestionByJudge`) retorna false silenciosamente se a chamada Gemini falha, o que pode mascarar um problema no judge.

---

### 14. `services/exportService.ts:149`

```ts
  } catch {
      return response.ok;
  }
```

**Contexto:** No envio de email do dossie, tenta parsear JSON de resposta. Se falha, assume que `response.ok`. Isso e aceitavel (Apps Script pode retornar HTML em vez de JSON), mas deveria logar para debug.

---

### 15-18. `utils/loadingCuriosities.ts:150` e `utils/conversationHistory.ts:42` (ja mencionado)

A linha 150 de loadingCuriosities retorna fallback sem log. Vale o mesmo diagnostico.

---

### 19. `components/FollowUpModal.tsx:100`

```ts
    } catch {
      return false;
    }
```

**Contexto:** Geracao de arquivo .ics para calendario. Se falha, retorna `false` e o caller mostra `toast.error`. Ja ha feedback visual, mas nao ha log para diagnosticar por que a geracao falhou.

---

### 20. `services/war-room/sources.ts:18`

```ts
    } catch {
      // Ignore invalid URIs without breaking the full response.
    }
```

**Contexto:** Processa chunks de grounding do Gemini. Se uma URI e invalida, pula. Aceitavel para um chunk, mas se TODAS as URIs falharem, o usuario ve resposta sem fontes e nao ha log.

---

### 21. `hooks/useAppInitialization.ts:35, 79`

```ts
35: fetch(`${LOOKUP_URL}?q=warmup`, ...).catch(() => {});
79: .catch(() => { /* remote sync is best-effort */ });
```

**Contexto:** A linha 35 e warmup (intencionalmente fire-and-forget). A linha 79 e sync remoto. Ambos sao best-effort, mas nao custa nada logar ao menos `scoutDiag.warn` para visibilidade.

---

## P2 — Aceitavel por Design (107 ocorrencias)

### Categorias de aceitacao

| Categoria                          | Exemplos                                                                                                                                                                                        | Quantidade |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **Clipboard fallback**             | SectionalBotMessage, WarRoom, ErrorBoundary, MessageActionsBar                                                                                                                                  | ~6         |
| **IDB/locaStorage intencional**    | idbStorage (documentado), useSessionStorage (fallback para localStorage), diagnosticLog                                                                                                         | ~10        |
| **URL parse com fallback**         | webVerification, textCleaners, documentExtractor (isValidPublicUrl), apiConfig (isFakeDomain)                                                                                                   | ~10        |
| **Debug/metrics tracking**         | recovery.ts debugRecovery, trackOpenQuestionRecoveryAttempt                                                                                                                                     | ~4         |
| **Erro com rethrow**               | sessionRemoteStore (parseJsonObject), brasilApiService (parse error rethrows)                                                                                                                   | ~5         |
| **Erro com scoutDiag.error/warn**  | Dossier waterfall, PORTA reconciliation, CompetitorService, useRadar scan, ChatInterface, InvestigationOrchestration, WarRoom retrieval, ExtractContentService, ragService, feedbackRemoteStore | ~30        |
| **Erro com console.error/warn**    | sessionExport, downloadHelpers, useSessionStorage, conversationHistory (save), useUpdateNotification, SettingsDrawer, FeedbackSection, ChatInterface, EmptyStateHome                            | ~15        |
| **Erro com toast/feedback visual** | MessageActionsBar (share fallback), WarRoom (copy feedback), SystemHealthCheck (updateTest), FollowUpModal (retorna false)                                                                      | ~7         |
| **Fallback gracioso + log**        | extractContentService (cache), brasilApiService (IBGE), clientLookupService (cold start)                                                                                                        | ~10        |
| **Chunk retry com reload**         | loadWithChunkRetry (reloads page)                                                                                                                                                               | ~1         |

### Exemplares — bem tratados

Diversos catch blocks no projeto sao modelos de como tratar erros graciosamente:

- **`features/dossier/waterfall-orchestrator.ts:183, 300, 419`** — todos com `scoutDiag.warn` + detalhes do erro + contexto
- **`features/dossier/porta-reconciliation.ts:177, 225`** — `scoutDiag.warn`/`error` com sessionId, company, error message
- **`components/EmptyStateHome.tsx:261`** — `catch (err)` com `err.message` parse, feedback visual via `setCnpjStatus`
- **`components/SettingsDrawer.tsx:99, 126`** — `catch (error)` com `toast.error`
- **`services/ragService.ts:49-79`** — circuito completo: timeout log, server error log, retry com log, fallback final com log

---

## Estatisticas

### Por directory

| Diretorio     | Total | P0  | P1  | P2  |
| ------------- | ----- | --- | --- | --- |
| `services/`   | 44    | 2   | 7   | 35  |
| `utils/`      | 25    | 1   | 2   | 22  |
| `components/` | 17    | 0   | 1   | 16  |
| `features/`   | 14    | 3   | 1   | 10  |
| `hooks/`      | 7     | 0   | 1   | 6   |
| `api/`        | 12    | 0   | 0   | 12  |
| `contexts/`   | 2     | 0   | 0   | 2   |
| `scripts/`    | 4     | 0   | 0   | 4   |
| `lib/`        | 1     | 0   | 0   | 1   |

### Por tipo de catch

| Tipo                           | Quantidade |
| ------------------------------ | ---------- |
| `catch {` (sem parametro)      | 60         |
| `catch (e/err/error)` com log  | 50         |
| `catch (e/err/error)` sem log  | 10         |
| `.catch(() => {})`             | 4          |
| `.catch((err) => { ... log })` | 4          |

### Por tipo de tratamento

| Tratamento                | Quantidade |
| ------------------------- | ---------- |
| `scoutDiag.warn`          | 20         |
| `scoutDiag.error`         | 12         |
| `console.error`           | 12         |
| `console.warn`            | 6          |
| `toast.error`             | 6          |
| Nenhum (silencioso total) | 72         |

---

## Recomendacoes Gerais

### 1. Adicionar log em todos os catch sem tratamento

72 dos 128 catch blocks (56%) nao tem nenhum tipo de log. Mesmo para erros esperados (como IDB indisponivel), um `scoutDiag.warn` permite diagnosticar problemas em producao sem afetar o usuario.

### 2. Substituir `// no-op` por log

Os comentarios `// no-op` em `recovery.ts` sao particularmente perigosos porque sugerem que o desenvolvedor ativamente escolheu ignorar o erro sem considerar diagnostico.

### 3. Centralizar persistencia do Radar

As 4 funcoes de persistencia do Radar (`persistAlerts`, `persistConfig`, `persistLastScan`, `persistMetaInsight`) compartilham o mesmo padrao de erro. Consolidar em uma unica funcao `persistToIDB(key, data)` com log centralizado reduziria 4 catch blocks para 1 e garantiria logging uniforme.

### 4. Tratar historico corrompido em vez de ignorar

`getConversationHistory` deveria tentar recuperar dados parciais ou ao menos remover a chave corrompida, em vez de retornar `[]` silenciosamente. O usuario que investiu tempo em conversas nao deveria perde-las sem aviso.

### 5. Nao misturar `catch {` com corpo na mesma linha

Diversos catch blocks comecam na mesma linha do fechamento do try:

```ts
} catch {
```

Isso dificulta a leitura e a adicao de logs. Separar em linhas:

```ts
} catch (err) {
  scoutDiag.warn(...);
}
```

### 6. Uso de console.warn vs scoutDiag.warn

`scoutDiag.warn` e `scoutDiag.error` sao o padrao do projeto e devem ser preferidos a `console.error/warn`. Eles fornecem prefixo `[Scout360]`, timers de performance, e filtragem por nivel. Catch blocks que usam `console.warn` deveriam migrar para `scoutDiag.warn`.

---

## Resumo dos P0

| #   | Arquivo                                          | Linha   | Problema                                       |
| --- | ------------------------------------------------ | ------- | ---------------------------------------------- |
| 1   | `services/gemini/investigation-orchestration.ts` | 631     | Deteccao de concorrente engolida sem rastro    |
| 2   | `features/radar/useRadar.ts`                     | 104-117 | 4 persist functions: perda de config sem aviso |
| 3   | `features/radar/useRadar.ts`                     | 138-140 | Carregamento inicial: perda de dados sem aviso |
| 4   | `utils/conversationHistory.ts`                   | 42-44   | Historico corrompido: dados perdidos sem aviso |
| 5   | `utils/linkValidation.ts`                        | 26-28   | Links parecem verificados sem terem sido       |
| 6   | `features/dossier/waterfall-orchestrator.ts`     | 102-104 | Fontes do dossie somem sem aviso               |
| 7   | `services/competitorService.ts`                  | 92-94   | Deteccao de concorrente retorna null sem log   |

---

_Audit gerado em 2026-05-22. Ferramentas: grep + leitura contextual de 40+ arquivos fonte._
