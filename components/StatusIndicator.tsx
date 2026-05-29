import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface StatusIndicatorProps {
  status: string | null;
  isComplete?: boolean;
  isDarkMode?: boolean;
}

const statusIcons: Record<string, string> = {
  'Consultando base de clientes': '🔍',
  'Buscando dados públicos': '🌐',
  'Analisando perfil da empresa': '📊',
  'Mapeando tecnologia e concorrentes': '🖥️',
  'Identificando oportunidades': '💡',
  'Avaliando riscos e compliance': '⚠️',
  'Analisando mercado e sazonalidade': '📈',
  'Montando recomendações': '🎯',
  'Gerando dossiê final': '📝',
};

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status, isComplete, isDarkMode = true }) => {
  if (!status) return null;

  const icon = statusIcons[status] || '⏳';

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={status}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.2 }}
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-lg
          ${isDarkMode ? 'bg-slate-800/90 border-slate-700' : 'bg-white/90 border-slate-200'}
        `}
      >
        <motion.span
          animate={isComplete ? {} : { rotate: 360 }}
          transition={isComplete ? {} : { duration: 1, repeat: Infinity, ease: 'linear' }}
          className="text-base"
        >
          {isComplete ? '✅' : icon}
        </motion.span>
        <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-300' : 'text-slate-700'}`}>{status}</span>
        {!isComplete && (
          <motion.div
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1, repeat: Infinity }}
            className="flex gap-0.5"
          >
            <span className="w-1 h-1 rounded-full bg-emerald-400" />
            <span className="w-1 h-1 rounded-full bg-emerald-400" />
            <span className="w-1 h-1 rounded-full bg-emerald-400" />
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

// Componente para mostrar progresso da investigação em lista
interface InvestigationProgressProps {
  statuses: string[];
  currentStatus: string | null;
  isDarkMode?: boolean;
}

export const InvestigationProgress: React.FC<InvestigationProgressProps> = ({
  statuses,
  currentStatus,
  isDarkMode = true,
}) => {
  const allSteps = [
    'Consultando base de clientes',
    'Buscando dados públicos',
    'Analisando perfil da empresa',
    'Mapeando tecnologia e concorrentes',
    'Identificando oportunidades',
    'Avaliando riscos e compliance',
    'Analisando mercado e sazonalidade',
    'Montando recomendações',
    'Gerando dossiê final',
  ];

  return (
    <div
      className={`
      flex items-center gap-1 p-2 rounded-lg overflow-x-auto
      ${isDarkMode ? 'bg-slate-800/50' : 'bg-slate-100'}
    `}
    >
      {allSteps.map((step, index) => {
        const isComplete = statuses.includes(step);
        const isCurrent = currentStatus === step;
        const icon = statusIcons[step] || '⏳';

        return (
          <motion.div
            key={step}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.03 }}
            className={`
              flex items-center gap-1 px-2 py-1 rounded text-[10px] whitespace-nowrap
              ${isComplete ? 'bg-green-500/20 text-green-400' : ''}
              ${isCurrent ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500' : ''}
              ${
                !isComplete && !isCurrent
                  ? isDarkMode
                    ? 'bg-slate-700/50 text-gray-500'
                    : 'bg-slate-200 text-slate-400'
                  : ''
              }
            `}
          >
            <span>{isComplete ? '✓' : icon}</span>
            <span className="hidden md:inline">{step.replace('...', '')}</span>
          </motion.div>
        );
      })}
    </div>
  );
};

export default StatusIndicator;
