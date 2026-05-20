import type { AccentClasses, WarRoomTheme } from './theme';
import type { ModeConfig } from './types';

interface WarRoomEmptyStateProps {
  cfg: ModeConfig;
  suggestions: string[];
  onSelectSuggestion: (suggestion: string) => void;
  t: WarRoomTheme;
  accent: AccentClasses;
}

export function WarRoomEmptyState({ cfg, suggestions, onSelectSuggestion, t, accent }: WarRoomEmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center h-full px-4">
      <div className="text-center max-w-md">
        <span className={`text-5xl block mb-4 ${t.emptyIcon}`}>{cfg.icon}</span>
        <h4 className={`font-semibold text-sm mb-2 ${t.emptyTxt}`}>The War Room</h4>
        <p className={`text-xs mb-6 ${t.emptySub}`}>Faça perguntas técnicas ou comparativas. A rota é escolhida automaticamente.</p>
        <div className="grid grid-cols-1 gap-2">
          {suggestions.map((hint) => (
            <button key={hint} onClick={() => onSelectSuggestion(hint)}
              className={`text-left p-3 rounded-xl border ${t.hintBdr} ${accent.bg[cfg.accent]} transition-all text-xs ${t.hintTxt} hover:shadow-sm`}>
              💡 {hint}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
