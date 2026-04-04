import React from 'react';
import {
  SHARED_FOUNDATION_BLOCK,
  PROMPT_RAIO_X_OPERACIONAL_ATAQUE,
  PROMPT_TECH_STACK_GOD_MODE_ATAQUE,
  PROMPT_RISCOS_COMPLIANCE_GOD_MODE,
  PROMPT_RADAR_EXPANSAO_GOD_MODE,
  PROMPT_RH_SINDICATOS_GOD_MODE,
  PROMPT_MAPEAMENTO_DECISORES_GOD_MODE,
  PROMPT_ORCAMENTO_JANELA_GOD_MODE,
} from '../prompts/megaPrompts';

const withFoundation = (prompt: string) =>
  SHARED_FOUNDATION_BLOCK + '\n\n---\n\n' + prompt;

interface DeepDiveTopicsProps {
  onSelectTopic: (displayMessage: string, hiddenPrompt: string) => void;
}

export const DeepDiveTopics: React.FC<DeepDiveTopicsProps> = ({ onSelectTopic }) => {
    const topics = [
    {
      id: 'raio-x',
      label: 'Raio-X Operacional',
      tooltip: 'Mapear hectares, silos, frotas e armazéns. (Gatilho para GAtec/WMS)',
      icon: '🚜',
      hiddenPrompt: withFoundation(PROMPT_RAIO_X_OPERACIONAL_ATAQUE)
    },
    {
      id: 'tech-stack',
      label: 'Tech Stack & ERP',
      tooltip: 'Descobrir qual sistema usam hoje e vagas de TI abertas. (Gatilho de migração)',
      icon: '💻',
      hiddenPrompt: withFoundation(PROMPT_TECH_STACK_GOD_MODE_ATAQUE)
    },
    {
      id: 'compliance',
      label: 'Riscos & Compliance',
      tooltip: 'Buscar execuções fiscais, malha fina de LCDPR e passivos ambientais.',
      icon: '🚨',
      hiddenPrompt: withFoundation(PROMPT_RISCOS_COMPLIANCE_GOD_MODE)
    },
    {
      id: 'radar',
      label: 'Teia Societária (M&A)',
      tooltip: 'Vasculhar CNPJs cruzados, holdings, laranjas e estimar faturamento.',
      icon: '🕸️',
      hiddenPrompt: withFoundation(PROMPT_RADAR_EXPANSAO_GOD_MODE)
    },
    {
      id: 'rh-sindicatos',
      label: 'RH, SST & Cultura',
      tooltip: 'Mapear Headcount, sistemas de DP ocultos, CAEPF e risco FAP/RAT.',
      icon: '👥',
      hiddenPrompt: withFoundation(PROMPT_RH_SINDICATOS_GOD_MODE)
    },
    {
      id: 'mapeamento-decisores',
      label: 'Mapa de Decisores',
      tooltip: 'Identificar C-Level, Shadow Board, gatekeepers externos e sabotadores internos do projeto.',
      icon: '🎭',
      hiddenPrompt: withFoundation(PROMPT_MAPEAMENTO_DECISORES_GOD_MODE)
    },
    {
      id: 'orcamento-janela',
      label: 'Orçamento & Janela',
      tooltip: 'Decodificar capacidade de investimento, crédito rural, ciclo orçamentário e timing ideal de abordagem.',
      icon: '💵',
      hiddenPrompt: withFoundation(PROMPT_ORCAMENTO_JANELA_GOD_MODE)
    }
  ];

  return (
    <div className="flex flex-wrap gap-2 my-4">
      {topics.map((topic) => (
        <button
          key={topic.id}
          title={topic.tooltip}
          onClick={() => onSelectTopic(
            `Dossiê completo: ${topic.label}`,
            topic.hiddenPrompt
          )}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-blue-100 border border-gray-300 rounded-full text-sm font-medium text-gray-700 transition-colors duration-200"
        >
          <span>{topic.icon}</span>
          {topic.label}
        </button>
      ))}
    </div>
  );
};
