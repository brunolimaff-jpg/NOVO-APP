import type React from 'react';
import type { AccentClasses, WarRoomTheme } from './theme';
import type { ModeConfig } from './types';

interface WarRoomComposerProps {
  cfg: ModeConfig;
  input: string;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  isLoading: boolean;
  onChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onSend: () => void;
  t: WarRoomTheme;
  accent: AccentClasses;
}

export function WarRoomComposer({
  cfg,
  input,
  inputRef,
  isLoading,
  onChange,
  onKeyDown,
  onSend,
  t,
  accent,
}: WarRoomComposerProps) {
  return (
    <div className={`p-3 sm:p-4 border-t ${t.terminalBdr} ${t.inputWrap}`}>
      <div
        className={`flex items-end gap-2 sm:gap-3 rounded-xl border ${accent.border[cfg.accent]} ${t.inputBg} p-2 transition-colors focus-within:shadow-sm`}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Pergunte sobre produto, processo, integração ou comparação com concorrentes..."
          rows={1}
          className={`flex-1 bg-transparent text-sm outline-none resize-none max-h-[120px] p-2 ${t.inputTxt}`}
          style={{ minHeight: '36px' }}
        />
        <button
          onClick={onSend}
          disabled={!input.trim() || isLoading}
          className={`px-3 sm:px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider text-white ${accent.btn[cfg.accent]} transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg flex-shrink-0`}
        >
          {isLoading ? '⏳' : '▶'}
        </button>
      </div>
    </div>
  );
}
