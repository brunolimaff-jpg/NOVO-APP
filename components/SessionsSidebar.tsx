
import React, { useState, useMemo } from 'react';
import { ChatSession } from '../types';
import { cleanTitle } from '../utils/textCleaners';
import ConfirmPopover from './ConfirmPopover';

interface SessionsSidebarProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onSaveToCRM: (id: string) => void;
  onOpenKanban: () => void;
  isOpen: boolean;
  onCloseMobile: () => void;
  isDarkMode: boolean;
  canAccessMiniCRM?: boolean;
  /** Busca sincronizada com a barra superior (opcional = estado interno). */
  searchTerm?: string;
  onSearchChange?: (term: string) => void;
  /** Se false, o campo de busca não é exibido (filtro continua vindo do pai via searchTerm). */
  showSearchField?: boolean;
}

const SessionsSidebar: React.FC<SessionsSidebarProps> = ({
  sessions,
  currentSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onSaveToCRM,
  onOpenKanban,
  isOpen,
  onCloseMobile,
  isDarkMode,
  canAccessMiniCRM = true,
  searchTerm: searchTermProp,
  onSearchChange,
  showSearchField = true,
}) => {
  const [internalSearchTerm, setInternalSearchTerm] = useState('');
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
    itemActive: isDarkMode ? 'bg-slate-800 border-l-2 border-emerald-500' : 'bg-white border-l-2 border-emerald-500 shadow-sm',
    newChatBtn: isDarkMode 
      ? 'bg-emerald-600 hover:bg-emerald-500 text-white' 
      : 'bg-emerald-600 hover:bg-emerald-500 text-white',
    inputBg: isDarkMode ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-800 placeholder-slate-400',
    crmBtn: isDarkMode
      ? 'bg-blue-600/90 hover:bg-blue-500 text-white border border-blue-500/50'
      : 'bg-blue-500 hover:bg-blue-600 text-white border border-blue-400'
  };

  return (
    <>
      <div 
        className={`fixed inset-0 bg-black/50 z-20 transition-opacity duration-300 md:hidden ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onCloseMobile}
        aria-hidden="true"
      />

      <aside className={`
        fixed inset-y-0 left-0 z-30 h-full border-r flex flex-col
        ${theme.bg}
        transition-all duration-300 ease-in-out
        w-72
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        md:static md:translate-x-0
        ${isOpen ? 'md:w-72' : 'md:w-0 md:border-none md:overflow-hidden'}
      `}>
        
        <div className="w-72 flex flex-col h-full min-w-[18rem]">
            <div className="p-4 flex-none space-y-3">
                <div className="flex gap-2">
                    <button
                      onClick={() => {
                          onNewSession();
                          if (window.innerWidth < 768) onCloseMobile();
                      }}
                      className={`flex-1 py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors shadow-md ${theme.newChatBtn}`}
                    >
                      <span>🦅</span>
                      <span>Nova Investigação</span>
                    </button>

                    {canAccessMiniCRM && (
                      <button
                        onClick={() => {
                            onOpenKanban();
                            if (window.innerWidth < 768) onCloseMobile();
                        }}
                        className={`py-2.5 px-3 rounded-lg flex items-center justify-center gap-1.5 font-medium transition-colors shadow-md ${theme.crmBtn}`}
                        title="Abrir Kanban CRM"
                      >
                        <span>📋</span>
                        <span className="text-sm">CRM</span>
                      </button>
                    )}
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
                <div className="space-y-1">
                    {filteredSessions.map((session) => {
                    const isActive = session.id === currentSessionId;
                    const date = new Date(session.updatedAt);
                    const isToday = new Date().toDateString() === date.toDateString();
                    const displayName = getDisplayName(session);
                    
                    return (
                        <div
                          key={session.id}
                          className={`
                            group relative flex items-center gap-3 p-3 rounded-md cursor-pointer transition-all
                            ${isActive ? theme.itemActive : theme.itemHover}
                          `}
                          onClick={() => {
                              onSelectSession(session.id);
                              if (window.innerWidth < 768) onCloseMobile();
                          }}
                        >
                          <div className={`flex-none text-lg opacity-80`}>
                              🏢
                          </div>
                          <div className="flex-1 min-w-0 pr-16">
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
                          </div>

                          {/* Botões de ação (CRM e Delete) */}
                          <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10">
                            {canAccessMiniCRM && (
                              <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSaveToCRM(session.id);
                                    if (window.innerWidth < 768) onCloseMobile();
                                }}
                                className={`
                                  p-1.5 rounded bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-800/50 text-blue-600 dark:text-blue-400 transition-all shadow-sm
                                `}
                                title="Enviar para CRM"
                              >
                                📋
                              </button>
                            )}

                            <ConfirmPopover
                              message="Excluir dossiê?"
                              onConfirm={() => onDeleteSession(session.id)}
                            >
                              {({ onClick }) => (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); onClick(e); }}
                                  className="p-1.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-all shadow-sm"
                                  title="Excluir Investigação"
                                >
                                  🗑️
                                </button>
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
