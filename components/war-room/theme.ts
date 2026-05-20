export function getWarRoomTheme(isDarkMode: boolean) {
  const dk = isDarkMode;

  return {
    pageBg: dk ? 'bg-slate-950' : 'bg-slate-50',
    sidebarBg: dk ? 'bg-slate-900' : 'bg-white',
    sidebarBdr: dk ? 'border-slate-800' : 'border-slate-200',
    headerBg: dk ? 'bg-red-950/30' : 'bg-red-50',
    headerBdr: dk ? 'border-red-900/50' : 'border-red-200',
    headerTitle: dk ? 'text-red-400' : 'text-red-700',
    headerSub: dk ? 'text-red-500/40' : 'text-red-800/50',
    labelTxt: dk ? 'text-slate-500' : 'text-slate-400',
    terminalBg: dk ? 'bg-slate-950' : 'bg-white',
    terminalHdr: dk ? 'bg-slate-900/80' : 'bg-slate-50',
    terminalBdr: dk ? 'border-slate-800' : 'border-slate-200',
    msgBotBg: dk ? 'bg-slate-900/60 border-slate-800/40 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800',
    msgBotErr: dk ? 'bg-red-950/30 border-red-900/40 text-red-300' : 'bg-red-50 border-red-200 text-red-700',
    emptyIcon: dk ? 'opacity-20' : 'opacity-10',
    emptyTxt: dk ? 'text-slate-400' : 'text-slate-500',
    emptySub: dk ? 'text-slate-500' : 'text-slate-400',
    inputBg: dk ? 'bg-slate-900/50' : 'bg-slate-50',
    inputTxt: dk ? 'text-white placeholder-slate-500' : 'text-slate-900 placeholder-slate-400',
    inputWrap: dk ? 'bg-slate-900' : 'bg-white',
    statusBg: dk ? 'bg-slate-950/50' : 'bg-slate-100',
    statusTxt: dk ? 'text-slate-500' : 'text-slate-400',
    textMain: dk ? 'text-white' : 'text-slate-900',
    cardSub: dk ? 'text-slate-500' : 'text-slate-400',
    srcBg: dk ? 'bg-slate-800/60 hover:bg-slate-700/60' : 'bg-slate-100 hover:bg-slate-200',
    srcTxt: dk ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700',
    btnClear: dk ? 'text-slate-400 hover:text-white border-slate-700/50 hover:border-slate-600'
      : 'text-slate-500 hover:text-slate-800 border-slate-300 hover:border-slate-400',
    btnCopy: dk ? 'text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10'
      : 'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50',
    loadDot: dk ? 'bg-slate-400' : 'bg-slate-500',
    loadTxt: dk ? 'text-slate-400' : 'text-slate-500',
    hintBdr: dk ? 'border-slate-800/40' : 'border-slate-200',
    hintTxt: dk ? 'text-slate-300' : 'text-slate-600',
    closeTxt: dk ? 'text-red-500/60 hover:text-red-400 hover:bg-red-500/10'
      : 'text-red-400 hover:text-red-600 hover:bg-red-100',
    srcBdr: dk ? 'border-slate-700/30' : 'border-slate-200',
    srcLabel: dk ? 'text-slate-500' : 'text-slate-400',
  };
}

export type WarRoomTheme = ReturnType<typeof getWarRoomTheme>;

export function getAccentClasses(isDarkMode: boolean) {
  const dk = isDarkMode;

  return {
    grad: {
      blue: 'from-blue-600 to-blue-700',
      red: 'from-red-600 to-red-700',
      amber: 'from-amber-500 to-amber-700',
      purple: 'from-purple-600 to-purple-700',
    },
    border: {
      blue: dk ? 'border-blue-500/30' : 'border-blue-400/40',
      red: dk ? 'border-red-500/30' : 'border-red-400/40',
      amber: dk ? 'border-amber-500/30' : 'border-amber-400/40',
      purple: dk ? 'border-purple-500/30' : 'border-purple-400/40',
    },
    bg: {
      blue: dk ? 'bg-blue-500/10' : 'bg-blue-50',
      red: dk ? 'bg-red-500/10' : 'bg-red-50',
      amber: dk ? 'bg-amber-500/10' : 'bg-amber-50',
      purple: dk ? 'bg-purple-500/10' : 'bg-purple-50',
    },
    text: {
      blue: dk ? 'text-blue-400' : 'text-blue-700',
      red: dk ? 'text-red-400' : 'text-red-700',
      amber: dk ? 'text-amber-400' : 'text-amber-700',
      purple: dk ? 'text-purple-400' : 'text-purple-700',
    },
    btn: {
      blue: 'bg-blue-600 hover:bg-blue-500',
      red: 'bg-red-600 hover:bg-red-500',
      amber: 'bg-amber-600 hover:bg-amber-500',
      purple: 'bg-purple-600 hover:bg-purple-500',
    },
  };
}

export type AccentClasses = ReturnType<typeof getAccentClasses>;
