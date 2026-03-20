import React from 'react';

export interface HeaderSessionSearchProps {
  value: string;
  onChange: (next: string) => void;
  isDarkMode: boolean;
  /** Classes extra no container externo (ex.: max-width responsivo). */
  className?: string;
}

function MagnifyingGlassIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

/**
 * Busca do histórico no topo: campo único, foco visível no container, ícone SVG e limpar.
 */
const HeaderSessionSearch: React.FC<HeaderSessionSearchProps> = ({ value, onChange, isDarkMode, className = '' }) => {
  const shell = isDarkMode
    ? 'border-slate-600/50 bg-slate-800/40 shadow-inner shadow-black/20 focus-within:border-emerald-500/60 focus-within:ring-2 focus-within:ring-emerald-500/25'
    : 'border-slate-200 bg-slate-100/80 shadow-sm focus-within:border-emerald-500/70 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-500/20';

  return (
    <div
      className={`flex w-full min-w-0 max-w-2xl items-center gap-2 rounded-xl border px-3 py-2 transition-colors md:max-w-none ${shell} ${className}`.trim()}
    >
      <MagnifyingGlassIcon
        className={`flex-shrink-0 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}
      />
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Empresa, CNPJ ou nome da sessão…"
        autoComplete="off"
        spellCheck={false}
        className={`min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500 ${
          isDarkMode ? 'text-slate-100' : 'text-slate-800'
        }`}
        aria-label="Buscar no histórico de investigações"
      />
      {value.trim().length > 0 && (
        <button
          type="button"
          onClick={() => onChange('')}
          className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-base leading-none transition-colors ${
            isDarkMode
              ? 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              : 'text-slate-400 hover:bg-slate-200 hover:text-slate-700'
          }`}
          aria-label="Limpar busca"
        >
          ×
        </button>
      )}
    </div>
  );
};

export default HeaderSessionSearch;
