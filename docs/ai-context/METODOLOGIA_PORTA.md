# Score PORTA — Framework de Inteligência Forense Comercial

## Referência Operacional Completa
**Autor**: Bruno Ferreira
**Implementação**: Senior Scout 360
**Propósito**: Qualificação preditiva de prospects no agronegócio brasileiro

---

## O que é o Score PORTA

Framework de qualificação preditiva que responde à pergunta: **"Vale a pena alocar recursos sênior nesta conta AGORA?"**

Não substitui a Neoway (dados firmográficos por CNPJ). Opera **ACIMA** como camada complementar especializada: reconstrói o grupo econômico real, estima a complexidade operacional e captura o momento de adoção.

### Problema que resolve

No agronegócio brasileiro, scoring por CNPJ falha sistematicamente por causa da estrutura de holding familiar rural:

- **Erro Tipo 1 — Subestimação**: Grupo com 16 CNPJs parece pequeno individualmente, mas é um mega produtor. Exemplos validados: Cavaco Forte (Lucas do Rio Verde-MT), Santa Tereza Agropecuária (Cáceres-MT).
- **Erro Tipo 2 — Superestimação**: CNPJ com faturamento alto por trading de commodities, sem operação própria complexa. Exemplos validados: Coperrede, Chicago Agro / Usado Agrícola.

O PORTA corrige ambos os erros ao olhar o grupo econômico real, não o CNPJ isolado.

### Hipótese central

A probabilidade de uma empresa agroindustrial contratar e implementar ERP de alta complexidade é determinada pela interação entre:
- **Potencial estrutural** (dimensões de escala e complexidade operacional → P + O)
- **Pressões de mudança** (dimensões regulatória e tecnológica → R + T)
- **Probabilidade de decisão** (dimensão de adoção e timing → A)

E **não** pelo faturamento declarado de qualquer CNPJ isolado do grupo econômico.

---

## As 5 Dimensões

### GRUPO 1 — Potencial Estrutural (o que a conta É)

#### P — Porte (Massa Crítica de Negócio)

**Mede**: Escala REAL do grupo econômico, não do CNPJ isolado. Hectares sob gestão, número de unidades físicas (fazendas, armazéns, UBAs, plantas industriais), complexidade societária (quantos CNPJs, filiais, participações cruzadas) e faturamento inferido cruzado via consolidação do grupo.

**Justificativa comercial**: Porte determina o teto máximo de ticket potencial. Um grupo com 15.000 hectares distribuídos em 8 CNPJs pode precisar de SimpleFarm + controle industrial + custos + balança + logística + rastreabilidade — ticket potencial 5x a 10x maior do que um CNPJ isolado de 500 hectares sugeriria.

**P mede QUANTO** (escala absoluta). **O mede COMO** (arquitetura operacional). Um grupo com 20.000 ha que só planta e vende na porteira tem P alto e O baixo. Um grupo com 3.000 ha que planta, armazena, beneficia e exporta tem P médio e O alto. Perfis radicalmente diferentes.

**Escala 0-10**:
| Score | Referência |
|-------|-----------|
| 9-10 | Grupo com >15.000 ha, múltiplas fazendas/unidades, >5 CNPJs operacionais |
| 7-8 | Grupo com 8.000-15.000 ha, estrutura societária estabelecida, 3-5 CNPJs |
| 5-6 | Produtor com 3.000-8.000 ha ou agroindústria de porte médio, até 3 CNPJs |
| 3-4 | Operação de 1.000-3.000 ha, estrutura societária simples |
| 1-2 | <1.000 ha ou empresa com poucos ativos fundiários identificáveis |

**Regras especiais**:
- P tem comportamento **logarítmico**, não linear. A diferença entre 5.000 e 10.000 ha não é o dobro; entre 10.000 e 20.000, menos ainda.
- **Teto para cooperativas pequenas**: Se cooperativa com receita <R$50M ou base reduzida de cooperados, P máximo = 6.

**Fontes OSINT**: CAR/SICAR (car.gov.br), SIGEF/INCRA (sigef.incra.gov.br), Receita Federal/QSA (dados.gov.br), Meu Imóvel Rural (Gov.br).

---

#### O — Operação (Arquitetura da Cadeia de Valor)

**Mede**: Grau de verticalização real — quantos elos da cadeia agroindustrial o grupo controla de forma própria e integrada.

**Justificativa comercial**: Cada elo adicional corresponde a um módulo adicional do portfólio GAtec necessário:

| Elo controlado | Módulo GAtec |
|---------------|-------------|
| Plantio próprio | SimpleFarm GAtec |
| Armazenagem própria | Balança + Logística de Grãos |
| Beneficiamento (UBA, sementes) | Beneficiamento de Algodão/Sementes |
| Processamento industrial | Controle Industrial + Custos |
| Exportação direta | Rastreabilidade + Logística |

**O mede complexidade** (caos interno de cadeia). **R mede pressão externa** (multa, compliance, exigência de cliente). São drivers diferentes.

**Escala 0-10**:
| Score | Referência |
|-------|-----------|
| 9-10 | 4+ elos próprios: planta + armazena + beneficia (UBA/semente) + exporta diretamente |
| 7-8 | 3 elos próprios: planta + armazena + beneficia OU planta + armazena + exporta |
| 5-6 | 2 elos próprios: planta + armazena, ou cooperativa com múltiplos serviços |
| 3-4 | 1,5 elos: planta e usa armazém arrendado/parceiro; ou só industrializa sem produção |
| 1-2 | 1 elo: só planta e entrega em terceiros, ou só trading sem operação física própria |

**Regras especiais**:
- **Regra do Algodão**: Algodão em escala, algodoeira ou indústria têxtil associada → +2 pontos em O (teto 10). Cadeia algodoeira exige rastreabilidade fardo a fardo.
- **Regra do TRR**: Distribuidores de combustível (TRRs) só são priorizados AGI quando possuem operação agrícola própria (ex: Grupo Andreis).
- **Trading sem ativos físicos**: Classificado como cenário ideal para ERP Senior + Commerce da GAtec. Se acoplado a ativos produtivos (ex: Jequitibá Agro), classificado como Cadeia Complexa (AGI).

**Fontes OSINT**: Licenças MAPA, Comex Stat (MDIC), CONAB (capacidade estática regional).

---

### GRUPO 2 — Pressão e Probabilidade de Mudança (o que ESTÁ ACONTECENDO)

#### R — Retorno / Pressão Externa (Regulatória e de Mercado)

**Mede**: Intensidade de forças externas que criam urgência de compliance, rastreabilidade, governança ou eficiência. Três subcomponentes:

1. **Exposição regulatória ambiental**: Autos de infração IBAMA ativos ou recentes, embargos, áreas em regularização fundiária.
2. **Exigência de mercado/certificação**: Clientes exportadores que demandam Rainforest Alliance, Global G.A.P., certificação de origem.
3. **Complexidade tributária e fiscal**: Operações multi-estado, exportação, transferências entre empresas do grupo.

**Justificativa comercial**: R alto cria **urgência política interna**. Uma multa de IBAMA de R$2M ou uma notificação de cliente europeu sobre rastreabilidade insuficiente transforma o projeto de ERP de "vamos estudar" para "temos que resolver". No MEDDPICC, R alto = evidence de Identify Pain com nível executivo.

**R NÃO mede capacidade financeira.** Mede **pressão para agir**.

**Escala 0-10**:
| Score | Referência |
|-------|-----------|
| 9-10 | Trifecta: auto IBAMA ativo + notificação de exportador + compliance tributário complexo |
| 7-8 | Dois dos três subcomponentes com alta intensidade, ou um em nível crítico recente |
| 5-6 | Pressão moderada: regularização em andamento, certificação iniciante, exportação inicial |
| 3-4 | Baixa exposição regulatória, opera no mercado interno, sem certificações exigidas |
| 1-2 | Operação simples, sem exposição regulatória relevante |

**Regra do Algodão**: Algodão adiciona ponto em R (certificações ABR, BCI, pressões contratuais).

**Fontes OSINT**: dadosabertos.ibama.gov.br, certificadoras públicas, Comex Stat, JusBrasil (complementar).

---

#### T — Tecnologia / Pressão Interna de Stack (Dívida Técnica)

**Mede**: Fragilidade, custo e inadequação do ecossistema de TI atual. Dois subcomponentes:

1. **Sistema instalado (ERP atual)**: Qual plataforma usa hoje + aderência ao agro + grau de liberdade para trocar.
2. **Dor tecnológica ativa**: Vagas de "analista TOTVS" ou "suporte de sistema" abertas, reclamações, instabilidade em safra.

**Escala 0-10**:
| Score | Referência |
|-------|-----------|
| 9-10 | Planilha + ausência total de sistema integrado + vagas de TI buscando "controle manual" |
| 7-8 | Sistema legado ou pequeno (Unisystem, CHB, Viasoft) subdimensionado para complexidade |
| 5-6 | TOTVS Protheus/Datasul com sinais de inadequação ao agro: módulos customizados, vagas, reclamações |
| 3-4 | TOTVS funcional com pouca dor, ou SAP B1 com suporte ativo; sem evidência de troca |
| 1-2 | SAP ERP global / contrato longo prazo / autonomia de decisão de TI quase nula |

**Regras especiais**:
- **Regra do Produtor Invisível**: Se O >= 8 mas baixa pegada digital (sem LinkedIn, sem vagas, sem site), T mínimo = 5. Operações complexas no agro têm dívida técnica inerente.
- **Contrato global SAP**: Não penaliza matematicamente na fórmula. Vira Alerta Qualitativo de risco de governança.

**Fontes OSINT**: LinkedIn/portais de vagas (Gupy, Indeed, Catho), BuiltWith/Wappalyzer, perfis LinkedIn de funcionários TI.

---

#### A — Adoção / Fricção Cultural e Janela Política

**Mede**: Probabilidade real, no horizonte de 6 a 18 meses, de a empresa iniciar, aprovar e implementar um projeto de ERP. **É a dimensão de TIMING** que todas as outras ignoram.

Quatro aspectos fundamentais:

1. **Perfil geracional dos decisores**: Transição G1 (patriarca 60-75 anos, gestão centralizada, resistente) → G2 (herdeiro 28-45 anos, formação técnica, aberto a profissionalização). Quando o herdeiro assume, o projeto de ERP deixa de ser "ameaça" e vira "marca da nova gestão".

2. **Governança corporativa**: Conselho de administração, CFO profissional externo, auditorias independentes = menor fricção de implementação.

3. **Histórico de adoção tecnológica**: Participação em Agrishow/Tecnoshow, LinkedIn ativo com posts sobre tecnologia, contratações recentes de TI/controladoria, uso de agricultura de precisão.

4. **Janela orçamentária e de safra**: Pós-colheita com caixa positivo (segundo semestre Centro-Oeste para soja/milho) = momento ideal. Entressafra = janela natural para projetos internos.

**Escala 0-10**:
| Score | Referência |
|-------|-----------|
| 9-10 | Herdeiro G2 assumiu recentemente + CFO profissional + safra boa + abordagem na entressafra |
| 7-8 | Transição geracional em curso ou governança profissionalizada + histórico de adoção tech |
| 5-6 | Gestão mista G1/G2, alguns sinais de abertura, participação esporádica em eventos |
| 3-4 | Patriarca ainda centralizador, pouca abertura declarada, nenhum sinal recente |
| 1-2 | Gestão totalmente fechada, patriarca resistente, caixa negativo ou dívida de custeio alta |

**Fontes OSINT**: LinkedIn (perfis sócios/diretores), participação em feiras, notícias regionais.

---

## Fórmula do Score PORTA
Score PORTA = (P × wP) + (O × wO) + (R × wR) + (T × wT) + (A × wA)


Resultado: **0 a 100**

### Pesos por Segmento

| Dimensão | Produtor Grande (>5.000 ha) | Agroindústria/Beneficiadora | Cooperativa |
|----------|---------------------------|---------------------------|-------------|
| P (Porte) | 10% | 15% | 15% |
| O (Operação) | 22% | 30% | 20% |
| R (Retorno) | 13% | 20% | 25% |
| T (Tecnologia) | 28% | 20% | 20% |
| A (Adoção) | 27% | 15% | 20% |

**Teses por segmento**:
- **Produtor grande**: T e A dominam — dor tecnológica aguda + momento geracional = prospect mais quente do agro.
- **Agroindústria**: O e R sobem — complexidade de cadeia + pressão regulatória são os drivers de urgência. A cai porque decisões tendem a ser mais racionais.
- **Cooperativa**: R no máximo — mais sujeitas a compliance, auditoria de cooperados e regulação setorial.

### Interpretação Operacional

| Faixa | Leitura |
|-------|---------|
| 80-100 | Alta prioridade Field Sales: alocar vendedor sênior imediatamente |
| 65-79 | Prioridade Field: pipeline ativo, monitorar sinais de janela |
| 50-64 | Inside ou Field ciclo longo: nurturing ativo |
| 35-49 | Monitorar: não justifica esforço sênior agora, revisitar em 6 meses |
| <35 | Fora do ICP atual ou Inside Sales com ticket pequeno |

---

## Gestão de Erros do Modelo

### Falso Positivo (score alto, conta ruim)
**Perfil**: Trading com SAP global imposto. Score sobe por ativos e compliance, mas decisão de TI não é local e o problema de negócio (trading/finanças) não tem cobertura na GAtec.
**Mitigação**: Subscore "autonomia de decisão de TI" dentro de T deve rebaixar T para 2. Flag binário de "fit de portfólio" antes de apresentar score.

### Falso Negativo (score baixo, conta boa)
**Perfil**: Fazenda média decidindo em silêncio — herdeiro pesquisando sem sinais externos.
**Mitigação**: Sinal de inbound (formulário, ligação, evento) sobrescreve score OSINT. O scoring de inteligência forense é **complementar** ao sinal de intenção, nunca substituto.

---

## Integração com Processo Comercial

| Etapa | Como o PORTA é usado |
|-------|---------------------|
| **IC (Inteligência Comercial)** | Engine de priorização. Ordena listas eliminando debate subjetivo de "quem atacar primeiro" |
| **LDR** | Recebe mapa de dimensões, aprofunda pesquisa nas dimensões com menor confiança |
| **BDR** | Liga com contexto Challenger: "identificamos que sua operação tem complexidade incompatível com seu sistema atual" |
| **SDR Inbound** | Roteamento Field vs Inside com PORTA em vez de só faturamento CNPJ |
| **Vendedor Field** | PORTA como hipótese de dor estruturada. Reuniões passam de "descoberta ampla" para "validação de hipótese" |

### PORTA vs Neoway
Camadas complementares, não concorrentes:
- **Neoway**: Dados cadastrais, financeiros e firmográficos de CNPJ. Base de dados primária.
- **Scout 360 / PORTA**: Interpreta dados com lente do agro, adiciona fontes fundiárias (CAR, SIGEF), trabalhistas (LinkedIn, vagas), regulatórias (IBAMA) e culturais (perfil decisores), produz score de oportunidade.

> "A Neoway nos diz quem parece grande olhando o CNPJ. O Scout nos diz quem está pronto para agir, olhando o grupo real e o contexto de dor."

---

## Exemplos de Aplicação

### Prospect A — Grupo Verticalizado MT
Perfil: >10.000 ha, planta soja/milho, armazém 120.000t, UBA algodão 60.000t/ano, exporta via corredor Norte. TOTVS Protheus com contrato ativo.
**P:9 O:10 R:7 T:4 A:4 = 71,5/100**
Leitura: Alta prioridade Field, mas janela fechada por adoção conservadora. Estratégia: longo prazo + rastreabilidade como dor + cultivar G2.

### Prospect B — Fazenda Média em Transição
Perfil: 3.200 ha em Sorriso, soja/milho, armazém arrendado. Gestão em planilhas, sistema NF que "trava toda semana". Filho de 31 anos assumiu há 6 meses, safra excelente, participou Agrishow, LinkedIn ativo.
**P:5 O:4 R:3 T:9 A:9 = 67,5/100**
**PRINCÍPIO CENTRAL DO PORTA**: Fazenda de 3.200 ha chegou perto do grupo de 10.000 ha. Não por tamanho — por JANELA. O herdeiro vai decidir nos próximos 12 meses, com ou sem a Senior.

### Prospect C — Cooperativa com Sistema Legado
Perfil: 50 cooperados em Lucas do Rio Verde, armazenagem + serviços. Sistema próprio de 12 anos sem suporte desde 2021, falhas no módulo de balança. Novo presidente mais moderno, mas 2 de 5 conselheiros são conservadores.
**P:7 O:6 R:8 T:6 A:4 = 62,5/100**
Leitura: Prioridade média, ciclo longo. Ângulo: risco jurídico do módulo de balança com falhas.

### Demonstração de sensibilidade
Se a fazenda média (Prospect B) tivesse um incidente técnico crítico (sistema cai na colheita), T subiria para 10:
**Novo Score: 70,5/100** — ultrapassaria o grupo verticalizado. O PORTA responde em tempo quase real a mudanças de contexto.
