import type { AccentClasses, WarRoomTheme } from './theme';
import type { ModeConfig } from './types';

interface WarRoomSidebarProps {
  cfg: ModeConfig;
  isOpen: boolean;
  onClose: () => void;
  onToggleSidebar: (isOpen: boolean) => void;
  queryCount: number;
  t: WarRoomTheme;
  accent: AccentClasses;
}

export function WarRoomSidebar({ cfg, isOpen, onClose, onToggleSidebar, queryCount, t, accent }: WarRoomSidebarProps) {
  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 sm:hidden" onClick={() => onToggleSidebar(false)} />
      )}

      <div className={`
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        sm:translate-x-0 sm:relative fixed inset-y-0 left-0 z-50
        w-80 sm:w-72 flex-shrink-0 border-r ${t.sidebarBdr} flex flex-col ${t.sidebarBg}
        transition-transform duration-300 ease-in-out
      `}>
        <div className={`p-4 border-b ${t.headerBdr} ${t.headerBg}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl filter drop-shadow-lg">⚔️</span>
              <div>
                <h2 className={`font-black uppercase tracking-[0.2em] text-xs ${t.headerTitle}`}>The War Room</h2>
                <p className={`text-[10px] sm:text-[9px] uppercase tracking-widest font-semibold ${t.headerSub}`}>Centro de Comando Tático</p>
              </div>
            </div>
            <button onClick={onClose} className={`p-1.5 rounded-lg transition-all text-xs ${t.closeTxt}`}>✕</button>
          </div>
        </div>

        <div className="flex-1 p-3 space-y-2 overflow-y-auto custom-scrollbar">
          <p className={`text-[10px] sm:text-[9px] font-bold uppercase tracking-[0.15em] ${t.labelTxt} mb-2`}>Modo ativo</p>
          <div className={`w-full text-left p-3 sm:p-3 rounded-xl border ${accent.bg[cfg.accent]} ${accent.border[cfg.accent]} shadow-sm`}>
            <div className="flex items-center gap-3">
              <span className="text-xl sm:text-lg flex-shrink-0">⚔️</span>
              <div className="min-w-0 flex-1">
                <p className={`text-xs sm:text-[11px] font-bold leading-tight mb-0.5 ${accent.text[cfg.accent]}`}>
                  The War Room
                </p>
                <p className={`text-[10px] sm:text-[9px] leading-snug ${t.cardSub}`}>
                  Roteamento automático para técnico e comparativo
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className={`p-3 border-t ${t.sidebarBdr} ${t.statusBg}`}>
          <div className="flex items-center justify-between text-[10px] sm:text-[9px]">
            <span className="flex items-center gap-1.5 text-emerald-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />OPERACIONAL
            </span>
            <span className={t.statusTxt}>{queryCount} consulta{queryCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
    </>
  );
}
