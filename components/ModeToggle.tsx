
import React from 'react';
import { useMode } from '../contexts/ModeContext';
import { MODE_LABELS, DEFAULT_MODE } from '../constants';

const ModeToggle: React.FC = () => {
  const { mode } = useMode();
  const currentConfig = MODE_LABELS[mode] ?? MODE_LABELS[DEFAULT_MODE];

  const { theme } = currentConfig;

  return (
    <div className="relative group">
      <button
        disabled
        className={`
          flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full border-2 shadow-lg
          opacity-70 cursor-not-allowed
          ${theme.bg} ${theme.text} ${theme.border} ${theme.hover}
        `}
        title={`Modo Atual: ${currentConfig.label}. Diretoria desativado no MVP.`}
      >
        <span className="text-lg md:text-xl drop-shadow-md filter">{currentConfig.icon}</span>
        <span className="font-bold text-xs md:text-sm whitespace-nowrap hidden sm:inline-block tracking-wide">
          {currentConfig.label}
        </span>
      </button>

      {/* Tooltip */}
      <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 w-48 p-2 bg-gray-800 text-white text-xs rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 text-center border border-gray-700">
        <p className="font-bold mb-1">{currentConfig.label}</p>
        <p className="text-gray-300 leading-tight">{currentConfig.description}</p>
        <p className="mt-2 text-[10px] text-amber-300 font-mono">Diretoria desativado no MVP</p>
      </div>
    </div>
  );
};

export default ModeToggle;
