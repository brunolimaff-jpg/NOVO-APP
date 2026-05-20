import type { WarRoomMode } from '../../services/warRoomService';
import type { ModeConfig } from './types';

export const MODE_CONFIG: Record<WarRoomMode, ModeConfig> = {
  tech: {
    icon: '🧠',
    label: 'Tira-Dúvidas Técnico',
    subtitle: 'ERP, Módulos, Processos e Integrações',
    accent: 'blue',
    placeholder: 'Como funciona o processo de compras no ERP Senior?',
  },
  killscript: {
    icon: '🎯',
    label: 'Kill-Script Generator',
    subtitle: 'Scripts de venda contra o concorrente',
    accent: 'red',
    placeholder: 'O cliente diz que o TOTVS é mais barato... como rebato?',
  },
  benchmark: {
    icon: '📊',
    label: 'Benchmark Tático',
    subtitle: 'Comparativo técnico lado a lado',
    accent: 'amber',
    placeholder: 'Compare o módulo de RH da Senior vs TOTVS',
  },
  objections: {
    icon: '🛡️',
    label: 'Análise de Objeções',
    subtitle: 'Desmonte objeções do cliente',
    accent: 'purple',
    placeholder: 'O cliente diz que SAP tem mais integrações...',
  },
};

export const UNIFIED_SUGGESTIONS = [
  'Como funciona o custo por talhão no SimpleFarm?',
  'Qual o fluxo completo da ordem de serviço até a valorização?',
  'Compare Senior x TOTVS para folha + agronegócio.',
  'Quais integrações da Senior reduzem retrabalho com ERP?',
];
