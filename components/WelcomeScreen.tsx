import React, { useState } from 'react';

interface WelcomeScreenProps {
  onSendMessage: (text: string) => void;
  onPreFill: (text: string) => void;
  userName?: string;
  isDarkMode: boolean;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onSendMessage, onPreFill, userName, isDarkMode }) => {
  // Random generic greeting for guests (stable per component mount)
  const [randomGreeting] = useState(() => {
    const greetings = [
      'E aí, parceiro! Qual empresa a gente vai fuçar hoje?',
      'Bora, comandante! Qual alvo vamos investigar?',
      'Pronto pra ação! Qual empresa quer desvendar hoje?',
      'Salve, bandeirante! Quem é o alvo da vez?',
      'Tamo on! Manda o nome da empresa que eu faço o resto.',
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  });

  // Determine which greeting to use
  // We double check against "Sair" here just in case, though ChatInterface handles extraction.
  const hasValidName = userName && userName !== 'Sair' && userName.trim().length > 0;

  const displayGreeting = hasValidName ? `E aí, ${userName}! Qual empresa a gente vai fuçar hoje?` : randomGreeting;

  // Comandos rápidos clicáveis
  const quickActions = [
    { icon: '🔍', label: 'Investigar', desc: 'Dossiê completo', prompt: 'Investigar a empresa ' },
    { icon: '🔄', label: 'Cross-sell', desc: 'O que mais vender', prompt: 'O que consigo vender de cross na ' },
    {
      icon: '⚔️',
      label: 'Competitivo',
      desc: 'Ganhar da concorrência',
      prompt: 'Estou concorrendo contra a TOTVS na empresa ',
    },
    { icon: '📡', label: 'Radar', desc: 'Panorama do setor', prompt: 'Me dá o radar do setor de ' },
    { icon: '🔔', label: 'Alertas', desc: 'O que mudou', prompt: 'Verificar alertas e novidades da ' },
  ];

  // Exemplos prontos (clica e envia direto)
  const examples = [
    { icon: '🤠', text: 'Levanta a capivara completa do Grupo Scheffer' },
    { icon: '💸', text: 'Estou concorrendo contra a TOTVS na Polato Sementes pra vender ERP' },
    { icon: '🔄', text: 'O que consigo vender de cross na Jequitibá Agro?' },
    { icon: '⚡', text: 'Blitz da SLC Agrícola, tenho reunião em 10 min' },
  ];

  // Tutorial
  const steps = [
    { num: '1', icon: '💬', title: 'Fala a empresa', desc: 'Nome, CNPJ ou descreve a situação. Pode ser coloquial.' },
    {
      num: '2',
      icon: '🔎',
      title: 'Scout investiga',
      desc: 'Puxa dados fiscais, societários, tech stack, concorrência e cruza com a base Senior.',
    },
    {
      num: '3',
      icon: '🎯',
      title: 'Você recebe o dossiê',
      desc: 'Score de oportunidade, gaps de cross-sell, argumentos e script de abordagem.',
    },
    {
      num: '4',
      icon: '🔬',
      title: 'Aprofunda o que quiser',
      desc: 'Use os botões de drill-down ou pergunte em texto livre.',
    },
  ];

  const theme = {
    textPrimary: isDarkMode ? 'text-white' : 'text-slate-900',
    textSecondary: isDarkMode ? 'text-gray-400' : 'text-slate-500',
    heading: isDarkMode ? 'text-gray-500' : 'text-slate-400',
    cardBg: isDarkMode ? 'bg-gray-800/50' : 'bg-white shadow-sm',
    cardBorder: isDarkMode ? 'border-gray-700' : 'border-slate-200',
    cardHover: isDarkMode ? 'hover:bg-gray-800' : 'hover:bg-slate-50',
    cardHoverBorder: isDarkMode ? 'hover:border-green-600' : 'hover:border-emerald-500',
    exampleBg: isDarkMode ? 'bg-gray-800/30' : 'bg-slate-50',
    exampleBorder: isDarkMode ? 'border-gray-700/50' : 'border-slate-200',
    exampleHover: isDarkMode ? 'hover:bg-gray-800/60' : 'hover:bg-slate-100',
    tutorialBg: isDarkMode ? 'bg-gray-800/30' : 'bg-slate-50',
    tutorialBorder: isDarkMode ? 'border-gray-800' : 'border-slate-200',
    checkBg: isDarkMode ? 'bg-green-900/10' : 'bg-emerald-50',
    checkBorder: isDarkMode ? 'border-green-900/30' : 'border-emerald-100',
    crossBg: isDarkMode ? 'bg-red-900/10' : 'bg-red-50',
    crossBorder: isDarkMode ? 'border-red-900/30' : 'border-red-100',
  };

  return (
    <div className="flex-1 overflow-auto animate-fade-in custom-scrollbar">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🎯</div>
          <h1 className={`text-2xl font-bold mb-1 ${theme.textPrimary}`}>🦅 Senior Scout 360</h1>
          <p className={`${theme.textSecondary} text-sm`}>Inteligência comercial que transforma dados em vendas</p>
          <p className="text-green-500 font-medium text-sm mt-2">{displayGreeting}</p>
        </div>

        {/* Arsenal de Sugestões */}
        <div className="mb-8">
          <h2 className={`text-xs font-bold uppercase tracking-wider mb-3 px-1 ${theme.heading}`}>
            💡 Arsenal de Sugestões
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {quickActions.map(action => (
              <button
                key={action.label}
                onClick={() => onPreFill(action.prompt)}
                className={`${theme.cardBg} border ${theme.cardBorder} rounded-xl p-3 text-left ${theme.cardHoverBorder} ${theme.cardHover} transition-all group`}
              >
                <div className="text-xl mb-1">{action.icon}</div>
                <div className={`text-sm font-bold group-hover:text-green-500 transition-colors ${theme.textPrimary}`}>
                  {action.label}
                </div>
                <div className={`text-xs ${theme.textSecondary}`}>{action.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Exemplos Clicáveis */}
        <div className="mb-8">
          <h2 className={`text-xs font-bold uppercase tracking-wider mb-3 px-1 ${theme.heading}`}>
            💡 Tenta um desses
          </h2>
          <div className="space-y-2">
            {examples.map((ex, i) => (
              <button
                key={i}
                onClick={() => onSendMessage(ex.text)}
                className={`w-full ${theme.exampleBg} border ${theme.exampleBorder} rounded-xl px-4 py-3 text-left ${theme.cardHoverBorder} ${theme.exampleHover} transition-all flex items-center gap-3 group`}
              >
                <span className="text-xl flex-shrink-0">{ex.icon}</span>
                <span className={`text-sm ${theme.textSecondary} group-hover:${theme.textPrimary} transition-colors`}>
                  "{ex.text}"
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Mini Tutorial */}
        <div className="mb-8">
          <h2 className={`text-xs font-bold uppercase tracking-wider mb-3 px-1 ${theme.heading}`}>📖 Como funciona</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {steps.map(step => (
              <div key={step.num} className={`${theme.tutorialBg} border ${theme.tutorialBorder} rounded-xl p-3`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-green-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
                    {step.num}
                  </span>
                  <span className={`text-sm font-bold ${theme.textPrimary}`}>{step.title}</span>
                  <span className="text-lg">{step.icon}</span>
                </div>
                <p className={`text-xs ${theme.textSecondary} ml-7`}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* O que faz vs não faz */}
        <div className="mb-8">
          <h2 className={`text-xs font-bold uppercase tracking-wider mb-3 px-1 ${theme.heading}`}>
            ℹ️ O que o Scout faz e não faz
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className={`${theme.checkBg} border ${theme.checkBorder} rounded-xl p-3`}>
              <div className="text-sm font-bold text-green-500 mb-2">✅ Faz</div>
              <ul className={`text-xs ${theme.textSecondary} space-y-1.5`}>
                <li>🔍 Investiga empresa em 10 fases (fiscal, gente, tech, risco...)</li>
                <li>🏭 Cruza com a base de clientes Senior</li>
                <li>⚔️ Monta estratégia contra TOTVS, SAP, Unysistem</li>
                <li>🎯 Calcula score de oportunidade 0-100</li>
                <li>📞 Gera script de abordagem personalizado</li>
                <li>📡 Identifica tendências do setor + benchmark</li>
              </ul>
            </div>
            <div className={`${theme.crossBg} border ${theme.crossBorder} rounded-xl p-3`}>
              <div className="text-sm font-bold text-red-500 mb-2">❌ Não faz</div>
              <ul className={`text-xs ${theme.textSecondary} space-y-1.5`}>
                <li>🚫 Não inventa dados — se não acha, marca 🔴</li>
                <li>🚫 Não chuta nome de executivo sem fonte</li>
                <li>🚫 Não usa argumentos genéricos contra concorrente</li>
                <li>🚫 Não substitui a visita presencial ao cliente</li>
                <li>🚫 Não acessa dados sigilosos ou internos do CRM</li>
                <li>🚫 Não gera proposta comercial ou precificação</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer discreto */}
        <div className={`text-center text-xs ${theme.textSecondary} mt-4 pb-4`}>
          🦅 Senior Scout 360 — Modo Sincerão 🤠 — v4.3
          <br />
          Desenvolvido por Bruno Lima — Senior Sistemas — Cuiabá, MT
        </div>
      </div>
    </div>
  );
};

export default WelcomeScreen;
