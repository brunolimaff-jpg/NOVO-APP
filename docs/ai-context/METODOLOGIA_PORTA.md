# METODOLOGIA_PORTA.md — Score PORTA: Framework de Inteligência Forense Comercial

> **Referência canônica** para o sistema Senior Scout 360. Todo prompt de scoring, toda saída de dossiê e toda sugestão tática da IA deve ser ancorada neste documento.
> Fonte: "Score PORTA: Um Framework de Inteligência Forense Comercial para Qualificação de Prospects no Agronegócio Brasileiro" — Bruno Ferreira.

---

## 1. O Problema que o PORTA Resolve

Plataformas de inteligência comercial que analisam faturamento por CNPJ de forma isolada cometem dois erros estruturais no agronegócio brasileiro:

- **Erro Tipo 1 — Subestimação:** múltiplos CNPJs com faturamento modesto classificados como Inside Sales, quando na realidade é um grande grupo (holding familiar rural fragmentada). Ex: Cavaco Forte (Lucas do Rio Verde-MT), Santa Tereza Agropecuária (Cáceres-MT).
- **Erro Tipo 2 — Superestimação:** faturamento alto por trading de commodities sem operação própria complexa, classificado como Field Sales. Ex: Coperrede (CNPJ 13.783.825/0001-71), Chicago Agro / Usado Agrícola (CNPJ 20.334.840/0001-06).

**Hipótese central:** a probabilidade de uma empresa agroindustrial contratar ERP de alta complexidade é determinada pela interação entre potencial estrutural de conta (P e O), pressões externas e internas de mudança (R e T) e probabilidade política e cultural de decisão (A) — e não pelo faturamento declarado de qualquer CNPJ isolado.

O Score PORTA opera **acima** da base firmográfica (como a Neoway): reconstrói o grupo econômico real, estima a complexidade operacional e captura o momento de adoção — melhorando o roteamento de contas e a priorização de esforço sênior.

---

## 2. Estrutura do Framework

O Score PORTA é composto de **cinco dimensões**, organizadas em dois grupos funcionais:

| Grupo | Dimensão | Papel |
|---|---|---|
| **Potencial Estrutural** (o que a conta é) | P — Porte | Massa crítica de negócio |
| **Potencial Estrutural** (o que a conta é) | O — Operação | Arquitetura da cadeia de valor |
| **Pressão e Probabilidade de Mudança** (o que está acontecendo) | R — Retorno | Pressão externa (regulatória e de mercado) |
| **Pressão e Probabilidade de Mudança** (o que está acontecendo) | T — Tecnologia | Pressão interna de stack (dívida técnica) |
| **Pressão e Probabilidade de Mudança** (o que está acontecendo) | A — Adoção | Fricção cultural e janela política |

> P e O medem o que a conta **vale em potencial**. R, T e A medem a **probabilidade e urgência de ela agir agora**.

---

## 3. As Cinco Dimensões em Detalhe

### 3.1 P — Porte: Massa Crítica de Negócio

Mensura a **escala real do grupo econômico** — não do CNPJ isolado. Considera hectares sob gestão, número de unidades físicas (fazendas, armazéns, UBAs, plantas), complexidade societária (CNPJs, filiais, participações cruzadas) e faturamento inferido consolidado do grupo.

**Diferença em relação a O:** P mede **escala absoluta** (quanto). O mede **arquitetura** (como e quantos elos). Um grupo com 20.000 ha que só planta e vende na porteira tem P alto e O baixo.

| Pontuação | Referência de Porte |
|---|---|
| 9–10 | Grupo com >15.000 ha, múltiplas fazendas/unidades, >5 CNPJs operacionais |
| 7–8 | Grupo com 8.000–15.000 ha, estrutura societária estabelecida, 3–5 CNPJs |
| 5–6 | Produtor com 3.000–8.000 ha ou agroindústria de porte médio, até 3 CNPJs |
| 3–4 | Operação de 1.000–3.000 ha, estrutura societária simples |
| 1–2 | <1.000 ha ou empresa com poucos ativos fundiários identificáveis |

**Regra especial — Teto para Cooperativas Pequenas:** Se o segmento for cooperativa (COP) com receita inferior a R$50M ou base reduzida de cooperados, a nota máxima de P é limitada a **6**. Evita que o peso regulatório de R jogue cooperativas menores para a régua Enterprise.

**Nota sobre não-linearidade:** P deve ter comportamento logarítmico, não linear. A diferença de potencial de ticket entre 10.000 e 20.000 hectares é menor do que entre 5.000 e 10.000. Isso evita que mega grupos monopolizem scores altos só por tamanho.

**Fontes primárias:** CAR/SICAR (área por CPF/CNPJ), SIGEF/INCRA (parcelas certificadas), Receita Federal/QSA (estrutura societária para reconstruir o grupo econômico).

---

### 3.2 O — Operação: Arquitetura da Cadeia de Valor

Mensura o **grau de verticalização real** — quantos elos da cadeia agroindustrial o grupo controla de forma própria e integrada. Cada elo adicional corresponde aproximadamente a um módulo adicional do portfólio GAtec:

| Elo controlado | Módulo GAtec correspondente |
|---|---|
| Plantio próprio | SimpleFarm GAtec |
| Armazenagem própria | Balança + Logística de Grãos |
| Beneficiamento (UBA, sementes) | Beneficiamento de Algodão / Sementes |
| Processamento industrial | Controle Industrial + Custos |
| Exportação direta | Rastreabilidade + Logística |

**Diferença em relação a R:** O mede complexidade de **processo operacional** (caos interno de cadeia). R mede **pressão externa** que força mudança.

| Pontuação | Referência de Verticalização |
|---|---|
| 9–10 | 4+ elos próprios: planta + armazena + beneficia (UBA/semente) + exporta diretamente |
| 7–8 | 3 elos próprios: planta + armazena + beneficia OU planta + armazena + exporta |
| 5–6 | 2 elos próprios: planta + armazena, ou cooperativa com múltiplos serviços |
| 3–4 | 1,5 elos: planta e usa armazém arrendado/parceiro; ou só industrializa sem produção |
| 1–2 | 1 elo: só planta e entrega em terceiros, ou só trading sem operação física própria |

**Regra do Algodão (Amplificador de Complexidade):** Se identificado cultivo de algodão em escala, algodoeira ou indústria têxtil associada (ex: Andreis Têxtil, Grupo Guimarães), adiciona-se **+2 pontos** à nota O (até o teto de 10). A cadeia algodoeira exige rastreabilidade fardo a fardo e altíssimo controle logístico/industrial.

**Regra do TRR com Ativo Agrícola:** TRRs só são priorizados na alta complexidade agro (AGI) quando possuem operação agrícola própria em anexo (ex: Grupo Andreis). TRRs de distribuição simples (ex: Ecodiesel) não se enquadram no perfil AGI.

**Regra do Trading com Ativos:** Trading sem ativos físicos não sofre penalização — é o cenário ideal para ERP Senior com Commerce GAtec. Se trading estiver acoplado a ativos produtivos (ex: Jequitibá Agro), classifica como Cadeia Complexa (AGI), elevando O.

**Fontes primárias:** Licenças MAPA, Comex Stat/MDIC (exportações por empresa), LinkedIn (vagas e perfis que revelam elos da cadeia).

---

### 3.3 R — Retorno: Pressão Externa (Regulatória e de Mercado)

Mensura a **intensidade de forças externas** que criam urgência de compliance, rastreabilidade, governança ou eficiência. Três subcomponentes:

1. **Exposição regulatória ambiental:** autos de infração IBAMA ativos ou recentes, embargos, áreas em regularização fundiária.
2. **Exigência de mercado / certificação:** clientes exportadores que demandam Rainforest Alliance, Global G.A.P., certificação de origem.
3. **Complexidade tributária e fiscal:** operações multi-estado, exportação, transferências entre empresas do grupo.

> R alto cria **urgência política interna**: uma multa IBAMA de R$2M transforma o projeto de ERP de "vamos estudar" para "temos que resolver". Dentro do MEDDPICC, R alto é evidência de pain com nível executivo.

> **Importante:** R não avalia capacidade financeira. Isso está em P (tamanho = capacidade). R significa "tem pressão para agir", não "tem dinheiro".

| Pontuação | Referência de Pressão Externa |
|---|---|
| 9–10 | Auto de infração IBAMA ativo + notificação de exportador + compliance tributário complexo (trifecta) |
| 7–8 | Dois dos três subcomponentes com alta intensidade, ou um deles em nível crítico recente |
| 5–6 | Pressão moderada: irregularidade fundiária em regularização, certificação em andamento, exportação iniciante |
| 3–4 | Baixa exposição regulatória, opera principalmente no mercado interno, sem certificações exigidas |
| 1–2 | Operação simples, sem exposição regulatória relevante, sem exigências de rastreabilidade |

**Regra do Algodão (Pressão Externa):** Presença da cultura do algodão adiciona **+1 ponto** à nota R, pelas exigências massivas de certificações internacionais (ABR, BCI) e pressões contratuais do mercado comprador.

**Fontes primárias:** IBAMA (autos de infração — dadosabertos.ibama.gov.br), JusBrasil (processos por CPF/CNPJ), certificadoras públicas (Rainforest Alliance, IBD Orgânicos, GlobalG.A.P.).

---

### 3.4 T — Tecnologia: Pressão Interna de Stack (Dívida Técnica)

Mensura a **fragilidade, custo e inadequação do ecossistema de TI atual** do prospect. Dois subcomponentes:

1. **Sistema instalado (ERP atual):** aderência ao agroindustrial + grau de liberdade para trocar.
2. **Dor tecnológica ativa:** vagas de "analista TOTVS" ou "suporte de sistema" sendo abertas, reclamações em fóruns, instabilidade em períodos de safra.

| Pontuação | Referência de Dívida Técnica |
|---|---|
| 9–10 | Operação em planilha + ausência total de sistema integrado + vagas de TI abertas buscando "controle manual" |
| 7–8 | Sistema legado ou sistema pequeno (Unisystem, CHB, Viasoft) claramente subdimensionado para a complexidade operacional |
| 5–6 | TOTVS Protheus ou Datasul com sinais de inadequação ao agro específico: módulos customizados, vagas de "analista TOTVS agro", reclamações |
| 3–4 | TOTVS funcional com pouca dor aparente, ou SAP B1 com suporte ativo; sem evidências de substituição em horizonte próximo |
| 1–2 | SAP ERP global / contrato de longo prazo com integrador forte / autonomia de decisão de TI quase nula |

**Regra do Produtor Invisível (Piso de T por O):** Se a operação tiver alta complexidade (nota O ≥ 8), mas a empresa tiver baixa pegada digital na OSINT (sem LinkedIn, vagas de TI ou site institucional), a nota T **não deve ser rebaixada artificialmente** — o sistema eleva automaticamente T para o piso de **5**. Operações complexas no agro têm dívida técnica inerente, mesmo quando digitalmente opacas (ex: Hervalense Agrícola, Santa Tereza Agropecuária).

**Alerta Qualitativo — Travamento por Sistemas Globais:** A existência de contrato global com SAP ou outro ERP de matriz **não aplica penalização matemática** na fórmula. É classificada apenas como "Alerta Qualitativo" de risco de governança, dado que grupos multirregionais frequentemente têm autonomia local para adoção de software agro (GAtec).

**Fontes primárias:** LinkedIn/portais de vagas (Gupy, Indeed, Catho) — vagas de "Analista TOTVS", "Consultor SAP", "Coordenador de TI Agro" revelam stack instalado e intensidade da dor. BuiltWith/Wappalyzer para maturidade digital geral.

---

### 3.5 A — Adoção: Fricção Cultural e Janela Política

Mensura a **probabilidade real, no horizonte de 6 a 18 meses**, de a empresa iniciar, aprovar e implementar um projeto de ERP. É a dimensão que captura o **timing** que todas as outras dimensões ignoram.

Quatro aspectos fundamentais:

1. **Perfil geracional dos decisores:** transição G1 (patriarca, 60–75 anos, resistência alta) → G2 (herdeiro, 28–45 anos, aberto a profissionalização) é a janela de modernização mais poderosa no agro. Quando o herdeiro assume formalmente, o projeto de ERP deixa de ser "ameaça ao controle do patriarca" e se torna "marca da nova gestão".
2. **Governança corporativa:** conselho de administração, CFO profissional externo, auditorias independentes — reduz a fricção de implementação.
3. **Histórico de adoção tecnológica:** participação em Agrishow, Tecnoshow; posts no LinkedIn sobre tecnologia; contratações recentes de TI ou controladoria; uso de agricultura de precisão.
4. **Janela orçamentária e de safra:** pós-colheita com caixa positivo (tipicamente 2º semestre no Centro-Oeste para soja/milho) é o momento de maior probabilidade de decisão. Entressafra = janela natural para projetos internos.

| Pontuação | Referência de Adoção |
|---|---|
| 9–10 | Herdeiro G2 assumiu recentemente + CFO profissional + safra boa + abordagem na entressafra |
| 7–8 | Transição geracional em curso ou governança profissionalizada + histórico de adoção tech |
| 5–6 | Gestão mista G1/G2, alguns sinais de abertura, participação esporádica em eventos |
| 3–4 | Patriarca ainda centralizador, pouca abertura declarada, nenhum sinal recente de modernização |
| 1–2 | Gestão totalmente fechada, patriarca resistente, momento de caixa negativo ou dívida de custeio alta |

**Fontes primárias:** LinkedIn (perfis de sócios e diretores — faixa etária, formação, histórico), feiras e eventos (Agrishow, Tecnoshow, Show Rural Coopavel), notícias locais e regionais.

---

## 4. Fórmula do Score PORTA

### 4.1 Estrutura Geral

```
Score PORTA = (P × wP) + (O × wO) + (R × wR) + (T × wT) + (A × wA)
```

- Cada dimensão: escala de **0 a 10**
- Resultado final: **0 a 10** (multiplicar por 10 para expressão percentual 0–100)

### 4.2 Pesos por Segmento

| Dimensão | Produtor Grande (>5.000 ha) | Agroindústria e Beneficiadora | Cooperativa |
|---|---|---|---|
| P (Porte) | 10% | 15% | 15% |
| O (Operação) | 25% | 30% | 20% |
| R (Retorno regulatório) | 10% | 20% | 25% |
| T (Tecnologia) | 30% | 20% | 20% |
| A (Adoção) | 25% | 15% | 20% |

**Tese de negócios por perfil:**
- **Produtor grande:** T e A dominam — dor tecnológica aguda + decisão dependente do momento geracional.
- **Agroindústria:** O e R sobem — complexidade de cadeia e pressão regulatória são os principais drivers de urgência.
- **Cooperativa:** R sobe ao máximo — entidades mais sujeitas a compliance, auditoria de cooperados e regulação setorial.

### 4.3 Interpretação Operacional

| Faixa | Leitura Operacional |
|---|---|
| 80–100 | Conta de **alta prioridade Field Sales**: alocar vendedor sênior imediatamente |
| 65–79 | Conta de **prioridade Field**: colocar em pipeline ativo, monitorar sinais de janela |
| 50–64 | Conta de **prioridade Inside ou Field com ciclo longo**: nurturing ativo |
| 35–49 | Conta a **monitorar**: não justifica esforço sênior agora, revisitar em 6 meses |
| <35 | Conta **fora do ICP atual** ou Inside Sales com ticket pequeno |

---

## 5. Exemplos Práticos: Três Prospects em Mato Grosso

### 5.1 Grupo Verticalizado de MT (Agroindústria)

Perfil: >10.000 ha, plantio + armazenagem 120.000 t + UBA de algodão 60.000 t/ano + exportação direta via corredor Norte. TOTVS Protheus com contrato ativo e TI própria. Gestão mista G1/G2.

| Dimensão | Nota | Peso (AGI) | Contribuição |
|---|---|---|---|
| P | 9 | 15% | 1,35 |
| O | 10 | 30% | 3,00 |
| R | 7 | 20% | 1,40 |
| T | 4 | 20% | 0,80 |
| A | 4 | 15% | 0,60 |
| **Score PORTA** | | | **7,15 (71,5/100)** |

**Leitura:** conta de alta prioridade, mas janela fechada por perfil conservador. Estratégia: abordagem consultiva de longo prazo focada em rastreabilidade de exportação como dor de R; cultivar relação com G2; revisitar em 12 meses ou após mudança geracional.

---

### 5.2 Fazenda Média em Transição Geracional (Produtor)

Perfil: 3.200 ha em Sorriso, soja e milho, armazém arrendado de terceiros. Gestão inteiramente em Excel + sistema de NF que "trava toda semana". Filho de 31 anos assumiu há 6 meses após problema de saúde do pai. Safra excelente, caixa positivo. Participou da Agrishow 2025, LinkedIn ativo com posts sobre gestão rural.

| Dimensão | Nota | Peso (Produtor) | Contribuição |
|---|---|---|---|
| P | 5 | 10% | 0,50 |
| O | 4 | 25% | 1,00 |
| R | 3 | 10% | 0,30 |
| T | 9 | 30% | 2,70 |
| A | 9 | 25% | 2,25 |
| **Score PORTA** | | | **6,75 (67,5/100)** |

**Leitura:** alta prioridade para Field Sales — o herdeiro vai tomar decisão de sistema nos próximos 12 meses, com ou sem a Senior. Abordagem correta: "seu sistema atual não vai escalar com o crescimento que você planejou."

**Demonstração do princípio central:** a fazenda de 3.200 ha (67,5) chegou perto do grupo de 10.000 ha (71,5). Não por tamanho — por janela. O PORTA não é um ranking de quem é maior; é um ranking de **quem está mais pronto para tomar decisão agora**.

---

### 5.3 Cooperativa Regional com Sistema Legado (Cooperativa)

Perfil: 50 cooperados em Lucas do Rio Verde, recebimento e armazenagem de grãos, serviços de insumos e assistência técnica. Sistema próprio desenvolvido há 12 anos, sem suporte externo desde 2021, com falhas recorrentes no módulo de balança. Novo presidente (47 anos, perfil moderno), mas dois dos cinco conselheiros são conservadores.

| Dimensão | Nota | Peso (COP) | Contribuição |
|---|---|---|---|
| P | 7 | 15% | 1,05 |
| O | 6 | 20% | 1,20 |
| R | 8 | 25% | 2,00 |
| T | 6 | 20% | 1,20 |
| A | 4 | 20% | 0,80 |
| **Score PORTA** | | | **6,25 (62,5/100)** |

**Leitura:** prioridade média para Field, ciclo longo projetado. Ângulo de entrada: "vocês têm risco de contestação de pesagem por cooperado com sistema que falha" — não é "o sistema é velho", é o risco jurídico. Trabalhar o presidente novo como champion interno.

---

### 5.4 Síntese Comparativa

| Prospect | P | O | R | T | A | Score Final |
|---|---|---|---|---|---|---|
| Grupo verticalizado MT | 9 | 10 | 7 | 4 | 4 | **71,5** |
| Fazenda média em transição | 5 | 4 | 3 | 9 | 9 | **67,5** |
| Cooperativa com legado | 7 | 6 | 8 | 6 | 4 | **62,5** |

**Comportamento dinâmico:** se a fazenda média tiver um incidente crítico (sistema cai na colheita, perde rastreabilidade de um lote), T sobe para 10. Novo score: **7,05 (70,5/100)** — ultrapassa o grupo verticalizado. O PORTA responde em tempo quase real a mudanças de contexto.

---

## 6. Gestão de Falsos Positivos e Negativos

### 6.1 Falso Positivo — Trading com Ativos Globais

Perfil de risco: grupo de trading com alta receita, ativos logísticos relevantes, mas sem produção própria e com SAP Business One gerido globalmente por matriz multinacional. Score hipotético PORTA: 75–80.

**Sinalização obrigatória no dossiê:**
- Flag: "⚠️ Trading sem ativo produtivo próprio — risco de superestimação de O"
- Flag: "⚠️ Contrato global SAP ativo — A qualitativo baixo independente da nota calculada"
- Ação: rebaixar manualmente A para máximo de 3, documentando a razão

### 6.2 Falso Negativo — Produtor Grande Digitalmente Opaco

Perfil de risco: grupo com 15.000+ ha operando em planilhas, sem LinkedIn, sem site, sem vagas abertas. T pode ser subavaliado por falta de evidências digitais.

**Regra aplicada:** Piso de T = 5 quando O ≥ 8 (Regra do Produtor Invisível). Documentar no dossiê: "Nota T elevada ao piso de 5 por complexidade operacional confirmada (O = X) com baixa pegada digital — dívida técnica inerente presumida."

---

## 7. Fontes de Dados por Dimensão

| Dimensão | Fonte Primária | Fonte Complementar |
|---|---|---|
| P | CAR/SICAR (car.gov.br), Receita Federal/QSA | SIGEF/INCRA (sigef.incra.gov.br) |
| O | Licenças MAPA, Comex Stat/MDIC | CONAB (armazenagem por município) |
| R | IBAMA (dadosabertos.ibama.gov.br), Certificadoras (Rainforest Alliance, IBD) | JusBrasil, Diários Oficiais |
| T | LinkedIn/vagas (Gupy, Indeed, Catho — buscar "Analista TOTVS", "Suporte de Sistema") | BuiltWith, Wappalyzer, perfis de TI |
| A | LinkedIn (perfis de sócios e diretores), Agrishow/Tecnoshow | Notícias regionais, Diários Oficiais de alteração societária |

**Fontes game changer (horizonte de parceria):**
- RAIS/CAGED (emprego formal por CNPJ) — melhor proxy de P e O se acessível
- SICOR/Banco Central (crédito rural por CPF/CNPJ) — sinal fortíssimo de escala real
- RENAGRO (registro de máquinas agrícolas) — proxy de investimento e apetite por modernização

---

## 8. Integração com Metodologias de Venda

### MEDDPICC
O PORTA opera **antes** do MEDDPICC: enquanto MEDDPICC responde "vou fechar esse negócio?", o PORTA responde "vale alocar recursos sênior nessa conta?". Convergências:
- R alto → evidência de **Identify Pain** com nível executivo
- A alto (G2, CFO profissional) → indicadores de **Economic Buyer** e **Champion** já identificáveis

### Challenger Sale
O PORTA habilita o Reframing estruturado:
- Score alto em O e T: "nossa análise identificou que sua operação tem complexidade de cadeia incompatível com o que você usa hoje"
- R alto + T alto: "você tem um risco regulatório que seu sistema atual não endereça"

Isso transforma a abordagem de **transacional → consultiva** sem depender de anos de experiência do vendedor.

---

## 9. Vocabulário Obrigatório nos Dossiês

| Termo técnico | Como usar no dossiê |
|---|---|
| Score PORTA | "Score PORTA: X,X/10 (XX/100) — [Leitura operacional]" |
| Dimensão P | "Porte: X/10 — [evidência de grupo econômico reconstituído]" |
| Dimensão O | "Operação: X/10 — [elos da cadeia identificados]" |
| Dimensão R | "Retorno/Pressão: X/10 — [fontes de pressão regulatória/mercado]" |
| Dimensão T | "Tecnologia: X/10 — [stack identificado e dívida técnica]" |
| Dimensão A | "Adoção: X/10 — [perfil geracional, janela e governança]" |
| Segmento aplicado | "Pesos aplicados: Produtor Grande / Agroindústria / Cooperativa" |
| Flag qualitativa | "⚠️ [nome da flag]: [descrição e impacto]" |
| Leitura operacional | Sempre seguir a tabela da seção 4.3 — nunca inventar classificações |
