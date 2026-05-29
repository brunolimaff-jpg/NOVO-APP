import type { AccentClasses, WarRoomTheme } from './theme';
import type { ModeConfig } from './types';

interface WarRoomHeaderProps {
  cfg: ModeConfig;
  hasMessages: boolean;
  isLoading: boolean;
  isSidebarOpen: boolean;
  onAbort: () => void;
  onClearMessages: () => void;
  onToggleSidebar: () => void;
  t: WarRoomTheme;
  accent: AccentClasses;
}

export function WarRoomHeader({
  cfg,
  hasMessages,
  isLoading,
  isSidebarOpen,
  onAbort,
  onClearMessages,
  onToggleSidebar,
  t,
  accent,
}: WarRoomHeaderProps) {
  return (
    <div className={`flex items-center justify-between px-3 sm:px-5 py-3 border-b ${t.terminalBdr} ${t.terminalHdr}`}>
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className={`sm:hidden p-2 rounded-lg ${t.btnClear} border`}
          aria-expanded={isSidebarOpen}
        >
          ☰
        </button>
        <span className="text-xl">{cfg.icon}</span>
        <div className="min-w-0">
          <h3 className={`text-sm font-black uppercase tracking-wide ${accent.text[cfg.accent]} truncate`}>
            The War Room
          </h3>
          <p className={`text-[10px] ${t.emptySub} truncate`}>Rota atual: {cfg.label}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {hasMessages && (
          <button
            onClick={onClearMessages}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${t.btnClear}`}
          >
            🗑️ <span className="hidden sm:inline">Limpar</span>
          </button>
        )}
        {isLoading && (
          <button
            onClick={onAbort}
            className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all text-red-500 border-red-400/40 hover:bg-red-500/10"
          >
            ⏹ <span className="hidden sm:inline">Parar</span>
          </button>
        )}
      </div>
    </div>
  );
}
