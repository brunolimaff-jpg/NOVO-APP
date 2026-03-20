import React from 'react';

export interface AppIconRailProps {
  isDarkMode: boolean;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onNewSession: () => void;
  onOpenKanban?: () => void;
  canAccessMiniCRM?: boolean;
}

const btnBase =
  'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500';

const AppIconRail: React.FC<AppIconRailProps> = ({
  isDarkMode,
  isSidebarOpen,
  onToggleSidebar,
  onNewSession,
  onOpenKanban,
  canAccessMiniCRM = true,
}) => {
  const railBg = isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-900 border-slate-800';
  const idle = isDarkMode
    ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
    : 'text-slate-400 hover:bg-slate-800 hover:text-white';
  const active = isDarkMode
    ? 'bg-slate-800 text-emerald-400 ring-1 ring-emerald-500/40'
    : 'bg-slate-800 text-emerald-400 ring-1 ring-emerald-500/40';

  return (
    <nav
      className={`flex h-full w-14 flex-shrink-0 flex-col items-center border-r py-2 gap-1 z-[45] ${railBg}`}
      aria-label="Navegação principal"
    >
      <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600/90 text-lg shadow-inner">
        🦅
      </div>

      <button
        type="button"
        className={`${btnBase} ${isSidebarOpen ? active : idle}`}
        onClick={onToggleSidebar}
        title={isSidebarOpen ? 'Fechar histórico' : 'Histórico'}
        aria-pressed={isSidebarOpen}
      >
        ☰
      </button>

      <button
        type="button"
        className={`${btnBase} ${idle}`}
        onClick={onNewSession}
        title="Nova investigação"
      >
        ➕
      </button>

      {canAccessMiniCRM && onOpenKanban && (
        <button
          type="button"
          className={`${btnBase} ${idle}`}
          onClick={onOpenKanban}
          title="CRM Kanban"
        >
          📋
        </button>
      )}
    </nav>
  );
};

export default AppIconRail;
