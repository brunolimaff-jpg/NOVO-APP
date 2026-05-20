
import React, { useState, useMemo, useEffect, useRef } from 'react';
import Tooltip from './Tooltip';
import { ChatSession } from '../types';
import { cleanTitle } from '../utils/textCleaners';
import ConfirmPopover from './ConfirmPopover';

interface SessionsSidebarProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  isOpen: boolean;
  onCloseMobile: () => void;
  isDarkMode: boolean;
  /** Busca sincronizada com a barra superior (opcional = estado interno). */
  searchTerm?: string;
  onSearchChange?: (term: string) => void;
  /** Se false, o campo de busca não é exibido (filtro continua vindo do pai via searchTerm). */
  showSearchField?: boolean;
  toggleButtonRef?: React.RefObject<HTMLButtonElement | null>;
}

const SessionsSidebar: React.FC<SessionsSidebarProps> = ({
  sessions,
  currentSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  isOpen,
  onCloseMobile,
  isDarkMode,
  searchTerm: searchTermProp,
  onSearchChange,
  showSearchField = true,
  toggleButtonRef,
}) => {
  const [internalSearchTerm, setInternalSearchTerm] = useState('');
  const asideRef = useRef<HTMLElement>(null);
  const searchControlled = searchTermProp !== undefined && onSearchChange !== undefined;
  const searchTerm = searchControlled ? searchTermProp! : internalSearchTerm;
  const setSearchTerm = (v: string) => {
    if (searchControlled) onSearchChange!(v);
    else setInternalSearchTerm(v);
  };

  const getDisplayName = (session: ChatSession): string => {
    if (session.empresaAlvo) {
        return cleanTitle(session.empresaAlvo);
    }

    const bracketMatch = session.title?.match(/dossi[êe]\s+completo\s+de\s*\[([^\]]+)\]/i);
    if (bracketMatch?.[1]) return cleanTitle(bracketMatch[1]);

    const clean = session.title
        ?.replace(/^(investigar|analisar|pesquisar|dossiê\s*de\s*)/i, '')
        ?.replace(/de\s*cuiabá.*/i, '')
        ?.replace(/-\s*mt.*/i, '')
        ?.trim();

    return cleanTitle(clean || "Sessão sem nome");
  };

  const getLastMessagePreview = (session: ChatSession): string | null => {
    if (!session.messages || session.messages.length === 0) return null;
    let botText: string | null = null;
    for (let i = session.messages.length - 1; i >= 0; i--) {
      if (session.messages[i].sender === 'bot') {
        botText = session.messages[i].text || null;
        break;
      }
    }
    const lastMessage = session.messages[session.messages.length - 1];
    return botText || lastMessage?.text || null;
  };

  const filteredSessions = useMemo(() =>
    sessions
      .filter((session) => {
          const term = searchTerm.toLowerCase();
          const empresa = (session.empresaAlvo || '').toLowerCase();
          const cnpj = (session.cnpj || '').toLowerCase();
          const titulo = (session.title || '').toLowerCase();
          const display = getDisplayName(session).toLowerCase();

          return empresa.includes(term) ||
                 cnpj.includes(term) ||
                 titulo.includes(term) ||
                 display.includes(term);
      })
      .sort((a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    [sessions, searchTerm]
  );

  const theme = {
    bg: isDarkMode ? 'bg-slate-900 border-r border-slate-800' : 'bg-slate-50 border-r border-slate-200',
    textPrimary: isDarkMode ? 'text-slate-200' : 'text-slate-700',
    textSecondary: isDarkMode ? 'text-slate-500' : 'text-slate-500',
    itemHover: isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-200',
    itemActive: isDarkMode ? 'bg-emerald-500/15' : 'bg-emerald-500/10',
    newChatBtn: isDarkMode
      ? 'bg-emerald-600/90 hover:bg-emerald-500 text-white shadow-sm'
      : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm',
    inputBg: isDarkMode ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-800 placeholder-slate-400',
  };

  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    if (!isOpen || !isMobile) return;

    const focusable = asideRef.current?.querySelector<HTMLElement>(
      'input,button,[href],select,textarea,[tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseMobile();
        toggleButtonRef?.current?.focus();
      }
      if (event.key !== 'Tab' || !asideRef.current) return;
      const elements = asideRef.current.querySelectorAll<HTMLElement>(
        'input,button,[href],select,textarea,[tabindex]:not([tabindex="-1"])',
      );
      if (elements.length === 0) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onCloseMobile, toggleButtonRef]);

  return (
    <>
      <div 
        className={`fixed inset-0 bg-black/50 z-20 md:hidden transition-opacity duration-200 ease-out motion-reduce:transition-none ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onCloseMobile}
        aria-hidden="true"
      />

      <aside
        id="sessions-sidebar-panel"
        ref={asideRef}
        role="dialog"
        aria-modal={window.innerWidth < 768 ? 'true' : undefined}
        aria-label="Histórico de investigações"
        className={`
        fixed inset-y-0 left-0 z-30 h-full border-r flex flex-col
        ${theme.bg}
        w-72 will-change-transform
        transition-transform duration-200 ease-out motion-reduce:transition-none
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        md:static md:translate-x-0 md:transition-none md:will-change-auto
        ${isOpen ? 'md:w-72' : 'md:w-0 md:border-none md:overflow-hidden'}
      `}
      >
        
        <div className="w-72 flex flex-col h-full min-w-[18rem]">
            <div className="p-3 flex-none space-y-2.5">
                <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      onClick={() => {
                          onNewSession();
                          if (window.innerWidth < 768) onCloseMobile();
                      }}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${theme.newChatBtn}`}
                    >
                      <span className="text-sm" aria-hidden>🦅</span>
                      <span>Nova investigação</span>
                    </button>

                </div>
                
                {showSearchField && (
                <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-xs opacity-50">🔍</span>
                    <input 
                      type="text" 
                      placeholder="Buscar empresa ou CNPJ..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      aria-label="Buscar no histórico"
                      className={`w-full pl-8 pr-3 py-2 text-xs rounded-lg border focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors ${theme.inputBg}`}
                    />
                </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-4 custom-scrollbar">
                <div className={`text-[10px] font-bold uppercase tracking-wider mb-2 px-2 mt-2 ${theme.textSecondary}`}>
                  {searchTerm
                    ? `${filteredSessions.length} de ${sessions.length} encontrada${filteredSessions.length !== 1 ? 's' : ''}`
                    : `Histórico (${filteredSessions.length})`}
                </div>
                
                {filteredSessions.length === 0 ? (
                <div className={`text-center py-8 px-4 text-xs ${theme.textSecondary}`}>
                    {searchTerm ? 'Nenhuma empresa encontrada.' : 'Nenhuma investigação salva.'}
                </div>
                ) : (
                <div className="space-y-1" role="list">
                    {filteredSessions.map((session) => {
                    const isActive = session.id === currentSessionId;
                    const date = new Date(session.updatedAt);
                    const isToday = new Date().toDateString() === date.toDateString();
                    const displayName = getDisplayName(session);
                    const messagePreview = getLastMessagePreview(session);

                    return (
                        <div
                          role="listitem"
                          key={session.id}
                          className={`
                            group relative flex items-start gap-3 p-3 rounded-md cursor-pointer transition-all
                            ${isActive ? theme.itemActive : theme.itemHover}
                          `}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onSelectSession(session.id);
                              if (window.innerWidth < 768) onCloseMobile();
                            }}
                            className="flex w-full items-start gap-3 text-left"
                            aria-current={isActive ? 'true' : undefined}
                            aria-label={`Abrir investigação ${displayName}`}
                          >
                            <div className={`flex-none text-lg opacity-80 mt-0.5`}>
                                🏢
                            </div>
                            <div className="flex-1 min-w-0 pr-12">
                                <h3 className={`text-sm font-medium truncate ${isActive ? 'text-emerald-500' : theme.textPrimary}`}>
                                  {displayName}
                                </h3>
                                <div className="flex items-center justify-between gap-2 mt-0.5">
                                  <span className={`text-[10px] ${theme.textSecondary}`}>
                                    {isToday
                                      ? date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                                      : date.toLocaleDateString([], {day: '2-digit', month: '2-digit'})}
                                  </span>
                                  {session.scoreOportunidade && (
                                      <span className={`text-[9px] px-1 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20`}>
                                        Score: {session.scoreOportunidade}
                                      </span>
                                  )}
                                </div>
                                {messagePreview && (
                                  <p className={`text-xs mt-1 line-clamp-1 ${theme.textSecondary}`}>
                                    {messagePreview}
                                  </p>
                                )}
                            </div>
                          </button>

                          {/* Bolinha verde indicadora de sessão ativa */}
                          {isActive && (
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-emerald-500 shadow-sm" />
                          )}

                          {/* Botao de acao da sessao - sempre visivel em mobile, hover no desktop */}
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 transition-opacity md:opacity-0 md:group-hover:opacity-100 z-10">
                            <ConfirmPopover
                              message="Excluir dossiê?"
                              onConfirm={() => onDeleteSession(session.id)}
                            >
                              {({ onClick }) => (
                                <Tooltip label="Excluir investigação" position="top">
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); onClick(e); }}
                                    className="p-1.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-all shadow-sm"
                                    title="Excluir Investigação"
                                  >
                                    🗑️
                                  </button>
                                </Tooltip>
                              )}
                            </ConfirmPopover>
                          </div>
                        </div>
                    );
                    })}
                </div>
                )}
            </div>

            <div className={`p-4 border-t flex-none ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
                <p className={`text-[10px] text-center ${theme.textSecondary}`}>
                  🦅 Senior Scout 360
                </p>
            </div>
        </div>
      </aside>
    </>
  );
};

export default SessionsSidebar;
