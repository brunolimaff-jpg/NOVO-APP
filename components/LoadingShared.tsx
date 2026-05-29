export function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 3" />
    </svg>
  );
}

export function StepCheckIcon({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <div
      className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
        isDarkMode ? 'bg-emerald-500/20' : 'bg-emerald-100'
      }`}
    >
      <svg
        className={`w-4 h-4 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={3}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </div>
  );
}

export function StepSpinner({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <div className="flex-shrink-0 w-7 h-7 flex items-center justify-center relative">
      <div
        className={`absolute inset-0 rounded-full ${isDarkMode ? 'bg-emerald-500/10' : 'bg-emerald-100/60'} animate-ping`}
        style={{ animationDuration: '2s' }}
      />
      <div
        className={`w-5 h-5 border-2 ${isDarkMode ? 'border-emerald-400' : 'border-emerald-600'} border-t-transparent rounded-full animate-spin`}
      />
    </div>
  );
}

export function StepPending({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <div
      className={`flex-shrink-0 w-7 h-7 rounded-full border-2 ${
        isDarkMode ? 'border-slate-700 bg-slate-800/50' : 'border-slate-300 bg-slate-100'
      }`}
    />
  );
}
