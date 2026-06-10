import { useMemo } from 'react';
import type { ChatTheme } from '../components/chat/contracts';

export function useChatTheme(isDarkMode: boolean): ChatTheme {
  return useMemo<ChatTheme>(
    () => ({
      bg: isDarkMode ? 'bg-slate-950' : 'bg-slate-50',
      surface: isDarkMode ? 'bg-slate-900' : 'bg-white',
      border: isDarkMode ? 'border-slate-800' : 'border-slate-200',
      textPrimary: isDarkMode ? 'text-slate-100' : 'text-slate-900',
      textSecondary: isDarkMode ? 'text-slate-400' : 'text-slate-500',
      inputBg: isDarkMode ? 'bg-slate-800' : 'bg-white',
      inputBorder: isDarkMode ? 'border-slate-700' : 'border-slate-300',
      itemHover: isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100',
      itemActive: isDarkMode ? 'bg-slate-800' : 'bg-slate-100',
      btnSecondary: isDarkMode
        ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200',
    }),
    [isDarkMode],
  );
}
