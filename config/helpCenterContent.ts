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
  | 'deep_dive';

export interface HelpCenterQuestion {
  id: string;
  question: string;
  answer: string;
  tags: string[];
  allowedIntents: HelpCenterIntent[];
}

export const HELP_CENTER_FAQS: HelpCenterQuestion[] = [
  {
    id: 'what-is-scout',
    question: 'O que é o Senior Scout 360?',
    answer:
      'É uma ferramenta de inteligência comercial para preparar abordagens no agronegócio. Ela organiza contexto, sinais de oportunidade, riscos e próximos passos para o vendedor chegar mais preparado.',
    tags: ['scout', 'senior scout', 'ferramenta', 'inteligência comercial'],
    allowedIntents: ['overview'],
  },
  {
    id: 'when-to-use',
    question: 'Quando devo usar o Scout?',
    answer:
      'Use antes de uma prospecção, reunião, retomada de conta ou priorização de carteira. Ele ajuda a entender onde existe oportunidade e qual abordagem faz mais sentido.',
    tags: ['uso', 'prospecção', 'reunião', 'carteira'],
    allowedIntents: ['usage', 'overview'],
  },
  {
    id: 'start-data',
    question: 'Quais dados preciso informar para começar?',
    answer:
      'Informe o nome da empresa, cidade e estado. Quando tiver, inclua o CNPJ para reduzir risco de confusão com empresas de nome parecido.',
    tags: ['começar', 'dados', 'empresa', 'cnpj', 'cidade', 'estado'],
    allowedIntents: ['usage', 'phases'],
  },
  {
    id: 'journey-phases',
    question: 'Quais são as fases da investigação?',
    answer:
      'O fluxo começa com os dados do alvo, passa pela investigação, gera o Dossiê 360, calcula o Score PORTA e termina com próximos passos comerciais, exportação ou registro no CRM.',
    tags: ['fases', 'investigação', 'fluxo', 'jornada'],
    allowedIntents: ['phases'],
  },
  {
    id: 'dossie-360',
    question: 'O que vem no Dossiê 360?',
    answer:
      'O dossiê reúne leitura comercial por áreas como fiscal, tecnologia, RH e supply chain, além de sinais de dor, oportunidades, riscos e argumentos para a conversa.',
    tags: ['dossiê', 'relatório', 'fiscal', 'tecnologia', 'rh', 'supply chain'],
    allowedIntents: ['features', 'phases'],
  },
  {
    id: 'porta-score',
    question: 'Como funciona o Score PORTA?',
    answer:
      'O PORTA ajuda a priorizar contas por Porte, Operação, Retorno, Tecnologia e Adoção. Ele indica onde vale investir energia comercial primeiro.',
    tags: ['porta', 'score porta', 'priorização', 'qualificação'],
    allowedIntents: ['features', 'porta'],
  },
  {
    id: 'radar-monitoring',
    question: 'O que o Radar monitora?',
    answer:
      'O Radar acompanha sinais de mercado, expansão, regulação, concorrência, AgTech e temas trabalhistas. A ideia é avisar quando uma conta merece atenção novamente.',
    tags: ['radar', 'monitoramento', 'alertas', 'mercado'],
    allowedIntents: ['features', 'radar'],
  },
  {
    id: 'deep-dive',
    question: 'Quando devo usar o Deep Dive?',
    answer:
      'Use quando um ponto do dossiê parecer promissor, mas ainda precisar de mais detalhe para virar abordagem. Ele é útil para aprofundar dores, áreas, riscos e hipóteses comerciais.',
    tags: ['deep dive', 'aprofundar', 'dossiê', 'hipóteses'],
    allowedIntents: ['features', 'deep_dive', 'usage'],
  },
  {
    id: 'crm-export',
    question: 'Posso salvar no CRM ou exportar?',
    answer:
      'Sim. Quando a investigação virar oportunidade, você pode registrar a conta no CRM e exportar materiais para levar a análise para a próxima etapa comercial.',
    tags: ['crm', 'exportar', 'exportação', 'pipeline', 'oportunidade'],
    allowedIntents: ['features', 'crm', 'exports'],
  },
  {
    id: 'tool-limits',
    question: 'Quais são os limites do Scout?',
    answer:
      'Ele não garante fechamento, não substitui validação humana, não define proposta oficial, não acessa dados sigilosos fora das integrações disponíveis e não deve ser usado como fonte única de decisão.',
    tags: ['limites', 'restrições', 'validação', 'segurança'],
    allowedIntents: ['limits'],
  },
];

export const HELP_CENTER_REFUSAL_MESSAGE =
  'Esse painel é só para entender o Scout. Para investigar uma empresa, comece pelo formulário da tela inicial.';
