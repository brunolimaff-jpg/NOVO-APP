export type HelpCenterIntent =
  | 'overview'
  | 'phases'
  | 'features'
  | 'limits'
  | 'usage'
  | 'porta'
  | 'radar'
  | 'crm'
  | 'exports'
  | 'war_room';

export interface HelpCenterQuestion {
  id: string;
  question: string;
  answer: string;
  tags: string[];
  allowedIntents: HelpCenterIntent[];
  deepDivePrompt: string;
}

export interface HelpCenterSection {
  id: string;
  title: string;
  summary: string;
  body: string;
  tags: string[];
  questions: HelpCenterQuestion[];
}

export const HELP_CENTER_SECTIONS: HelpCenterSection[] = [
  {
    id: 'overview',
    title: 'O que e',
    summary: 'O Scout prepara o vendedor para falar com o prospect certo, com contexto e prioridade.',
    body:
      'O Senior Scout 360 e um copiloto de inteligencia comercial para o agronegocio. Ele ajuda a transformar nome, CNPJ e localizacao de uma empresa em um dossie de preparacao comercial, com sinais de oportunidade, riscos, Score PORTA e proximos passos para a abordagem.',
    tags: ['scout', 'senior scout', 'o que e', 'ferramenta', 'copiloto', 'inteligencia comercial'],
    questions: [
      {
        id: 'what-is-scout',
        question: 'O que e o Senior Scout 360?',
        answer:
          'E uma ferramenta para preparar reunioes comerciais no Agro. Ela investiga a empresa, organiza evidencias, aponta dores provaveis e ajuda o vendedor a decidir como abordar a conta.',
        tags: ['scout', 'senior scout', 'o que e', 'copiloto'],
        allowedIntents: ['overview'],
        deepDivePrompt: 'Explique de forma simples o que e o Senior Scout 360 e quando o vendedor deve usa-lo.',
      },
      {
        id: 'who-uses-scout',
        question: 'Para quem o Scout foi feito?',
        answer:
          'Foi feito para executivos de contas e times comerciais da Senior que vendem ERP, GATEC, HCM e solucoes relacionadas para empresas do agronegocio.',
        tags: ['persona', 'vendedor', 'executivo de contas', 'senior'],
        allowedIntents: ['overview', 'usage'],
        deepDivePrompt: 'Explique para qual perfil de usuario o Senior Scout 360 foi feito.',
      },
    ],
  },
  {
    id: 'phases',
    title: 'Fases',
    summary: 'A jornada vai do cadastro do alvo ate a acao comercial: investigar, pontuar, agir e monitorar.',
    body:
      'A jornada principal tem seis fases: informar a empresa, a IA investigar fontes e contexto, gerar o Dossie 360, calcular o Score PORTA, sugerir proximos passos e permitir acoes como exportar, salvar no CRM, agendar follow-up ou monitorar no Radar.',
    tags: ['fases', 'jornada', 'etapas', 'fluxo', 'investigacao', 'dossie'],
    questions: [
      {
        id: 'investigation-phases',
        question: 'Quais sao as fases da investigacao?',
        answer:
          '1. Voce informa empresa, CNPJ quando tiver, cidade e UF. 2. O Scout investiga e cruza sinais. 3. Ele monta o Dossie 360. 4. Calcula o Score PORTA. 5. Sugere abordagem e proximos passos. 6. Voce exporta, salva no CRM, agenda follow-up ou monitora no Radar.',
        tags: ['fases', 'etapas', 'jornada', 'investigacao'],
        allowedIntents: ['phases'],
        deepDivePrompt: 'Explique as fases da jornada de investigacao do Senior Scout 360 em linguagem simples.',
      },
      {
        id: 'dossie-360',
        question: 'O que e o Dossie 360?',
        answer:
          'E o relatorio investigativo do prospect. Ele organiza leitura fiscal, tecnologia, RH, supply chain, sinais comerciais, riscos e argumentos de abordagem para o vendedor chegar mais preparado.',
        tags: ['dossie', 'dossie 360', 'relatorio', 'areas'],
        allowedIntents: ['phases', 'features'],
        deepDivePrompt: 'Explique o Dossie 360 do Senior Scout 360 e quais areas ele ajuda o vendedor a entender.',
      },
    ],
  },
  {
    id: 'features',
    title: 'Features',
    summary: 'Dossie, PORTA, Radar, Deep Dive, Smart Options, CRM, exportacao, follow-up e War Room.',
    body:
      'As principais features sao Dossie 360 por area, Score PORTA, Radar de sinais, Deep Dive para aprofundar uma parte do dossie, Smart Options com perguntas sugeridas, CRM interno, exportacao em PDF/Word/Markdown, geracao de email, follow-up e War Room quando estiver habilitado.',
    tags: ['features', 'funcionalidades', 'recursos', 'dossie', 'porta', 'radar', 'crm', 'exportacao'],
    questions: [
      {
        id: 'porta-score',
        question: 'Como funciona o Score PORTA?',
        answer:
          'O PORTA prioriza contas por cinco dimensoes: Porte, Operacao, Retorno, Tecnologia e Adocao. Ele nao e so tamanho da empresa: mede tambem complexidade, pressao de mudanca e chance de agir agora.',
        tags: ['porta', 'score porta', 'priorizacao', 'qualificacao'],
        allowedIntents: ['features', 'porta'],
        deepDivePrompt: 'Explique o Score PORTA e as cinco dimensoes em linguagem simples para um vendedor.',
      },
      {
        id: 'radar-monitoring',
        question: 'O que o Radar monitora?',
        answer:
          'O Radar acompanha sinais de mercado, regulacao, concorrencia, expansao, AgTech e temas trabalhistas conforme a configuracao. Ele ajuda a perceber quando uma conta merece nova abordagem.',
        tags: ['radar', 'monitoramento', 'alertas', 'sinais'],
        allowedIntents: ['features', 'radar'],
        deepDivePrompt: 'Explique o Radar do Senior Scout 360, o que ele monitora e como usar no fluxo comercial.',
      },
      {
        id: 'crm-actions',
        question: 'Como o CRM entra no fluxo?',
        answer:
          'Quando uma investigacao vira oportunidade, o vendedor pode salvar a conta no CRM interno, acompanhar o estagio do negocio e manter o dossie conectado ao historico da conversa.',
        tags: ['crm', 'kanban', 'lead', 'pipeline', 'oportunidade'],
        allowedIntents: ['features', 'crm'],
        deepDivePrompt: 'Explique como o CRM interno do Senior Scout 360 apoia o vendedor depois da investigacao.',
      },
      {
        id: 'exports-follow-up',
        question: 'O que posso exportar ou compartilhar?',
        answer:
          'O Scout pode apoiar exportacao do dossie e da conversa, alem de ajudar com email e follow-up. A ideia e transformar a pesquisa em material de acao, nao deixar o conhecimento preso no chat.',
        tags: ['exportar', 'pdf', 'word', 'markdown', 'email', 'follow-up'],
        allowedIntents: ['features', 'exports'],
        deepDivePrompt: 'Explique as opcoes de exportacao, email e follow-up do Senior Scout 360.',
      },
    ],
  },
  {
    id: 'limits',
    title: 'Ate onde vai',
    summary: 'O Scout acelera preparacao e decisao comercial, mas nao substitui julgamento humano.',
    body:
      'O Scout vai ate a preparacao comercial: pesquisa, organiza evidencias, sugere hipoteses, prioriza contas e recomenda abordagem. Ele nao garante fechamento, nao substitui validacao humana, nao acessa dados sigilosos fora das integracoes disponiveis, nao precifica proposta oficial e nao deve inventar fonte quando nao houver evidencia.',
    tags: ['limites', 'ate onde vai', 'nao faz', 'guardrails', 'seguranca', 'validacao'],
    questions: [
      {
        id: 'tool-limits',
        question: 'O que o Scout nao consegue fazer?',
        answer:
          'Ele nao garante fechamento, nao substitui a leitura do vendedor, nao cria preco ou proposta oficial, nao acessa dados sigilosos fora das integracoes disponiveis e nao deve inventar informacao sem evidencia.',
        tags: ['limites', 'nao faz', 'restricoes', 'seguranca'],
        allowedIntents: ['limits'],
        deepDivePrompt: 'Explique claramente os limites do Senior Scout 360 para evitar uso incorreto.',
      },
      {
        id: 'seller-validation',
        question: 'O que eu devo validar antes de falar com o cliente?',
        answer:
          'Valide se a empresa e a correta, revise fontes e datas, confirme se o CNPJ/localizacao fazem sentido, trate o PORTA como priorizacao e use as sugestoes como hipoteses comerciais, nao como verdade absoluta.',
        tags: ['validar', 'fontes', 'cliente', 'uso correto', 'revisao'],
        allowedIntents: ['limits', 'usage'],
        deepDivePrompt: 'Liste o que o vendedor deve validar antes de usar uma resposta do Scout em uma conversa com cliente.',
      },
    ],
  },
  {
    id: 'usage',
    title: 'Como usar bem',
    summary: 'Quanto melhor o alvo informado, melhor a investigacao e os proximos passos.',
    body:
      'Para usar bem, comece com nome da empresa, CNPJ quando tiver, cidade e UF. Depois leia o resumo, cheque fontes, olhe o PORTA, aprofunde os pontos fracos com Deep Dive e salve no CRM quando houver oportunidade real.',
    tags: ['como usar', 'boas praticas', 'uso correto', 'cnpj', 'cidade', 'uf', 'deep dive'],
    questions: [
      {
        id: 'best-start',
        question: 'Como comeco uma boa investigacao?',
        answer:
          'Comece com nome da empresa, CNPJ se tiver, cidade e UF. Esse contexto reduz erro de homonimo e ajuda o Scout a montar uma leitura mais util para a venda.',
        tags: ['comecar', 'investigacao', 'cnpj', 'cidade', 'uf'],
        allowedIntents: ['usage', 'phases'],
        deepDivePrompt: 'Explique como iniciar uma boa investigacao no Senior Scout 360.',
      },
      {
        id: 'deep-dive-use',
        question: 'Quando devo usar Deep Dive?',
        answer:
          'Use Deep Dive quando o dossie apontar uma dor promissora, mas ainda faltar detalhe para a abordagem. E bom para tecnologia, compliance, expansao, decisores, RH, orcamento e outros recortes especificos.',
        tags: ['deep dive', 'aprofundar', 'dossie', 'perguntas'],
        allowedIntents: ['usage', 'features'],
        deepDivePrompt: 'Explique quando o vendedor deve usar Deep Dive no Senior Scout 360.',
      },
    ],
  },
];

export const HELP_CENTER_REFUSAL_MESSAGE =
  'Esse painel e so para entender o Scout. Para investigar uma empresa, comece pelo formulario da tela inicial.';
