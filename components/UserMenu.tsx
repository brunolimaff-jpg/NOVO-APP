import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface UserMenuProps {
  isDarkMode: boolean;
  displayName: string;
  /** Foto do perfil (ex.: Clerk). Fora do ClerkProvider, omitir e usar iniciais. */
  avatarUrl?: string | null;
  onOpenSettings: () => void;
  onClearOperator: () => void;
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const UserMenu: React.FC<UserMenuProps> = ({
  isDarkMode,
  displayName,
  avatarUrl = null,
  onOpenSettings,
  onClearOperator,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const label = displayName.trim() || 'Usuário';
  const initials = initialsFromName(label);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onPointer = (e: MouseEvent | PointerEvent) => {
      const el = rootRef.current;
      if (!el || el.contains(e.target as Node)) return;
      close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open, close]);

  const panelClass = isDarkMode
    ? 'bg-slate-900 border border-slate-700 shadow-xl'
    : 'bg-white border border-slate-200 shadow-lg';

  const itemClass = isDarkMode ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-800 hover:bg-slate-100';

  return (
    <div className="relative flex-shrink-0" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 rounded-full pl-0.5 pr-1 py-0.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
          isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'
        }`}
        aria-expanded={open}
        aria-haspopup="menu"
        title={label}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover ring-2 ring-emerald-600/40" />
        ) : (
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ring-2 ring-emerald-600/50 ${
              isDarkMode ? 'bg-slate-800 text-emerald-300' : 'bg-emerald-50 text-emerald-800'
            }`}
          >
            {initials}
          </span>
        )}
        <span
          className={`hidden sm:inline max-w-[120px] truncate text-xs font-medium ${
            isDarkMode ? 'text-slate-300' : 'text-slate-600'
          }`}
        >
          {label}
        </span>
        <span className={`text-[10px] pr-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>▾</span>
      </button>

      {open && (
        <div role="menu" className={`absolute right-0 z-50 mt-1 min-w-[200px] rounded-lg py-1 ${panelClass}`}>
          <button
            type="button"
            role="menuitem"
            className={`w-full px-3 py-2 text-left text-sm ${itemClass}`}
            onClick={() => {
              close();
              onOpenSettings();
            }}
          >
            Configurações
          </button>
          <button
            type="button"
            role="menuitem"
            className={`w-full px-3 py-2 text-left text-sm ${itemClass}`}
            onClick={() => {
              close();
              void onClearOperator();
            }}
          >
            Trocar nome
          </button>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
