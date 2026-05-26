import React, { useState, useRef, useEffect, useCallback } from 'react';
import Tooltip from './Tooltip';
import type { ExportFormat, ReportType } from '../types';

interface ExportDropdownProps {
  isDarkMode: boolean;
  onExportPDF: () => void;
  onExportConversation?: (format: ExportFormat, reportType: ReportType) => void;
  onCopyMarkdown: () => void;
  exportStatus: 'idle' | 'loading' | 'success' | 'error';
}

const ExportDropdown: React.FC<ExportDropdownProps> = ({
  isDarkMode,
  onExportPDF,
  onExportConversation,
  onCopyMarkdown,
  exportStatus,
}) => {
  const [open, setOpen] = useState(false);
  const focusIndexRef = useRef(-1);
  const ref = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuId = 'export-dropdown-menu';
  const menuItemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const close = useCallback(() => {
    setOpen(false);
    focusIndexRef.current = -1;
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        toggleRef.current?.focus();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const items = menuItemsRef.current;
        let next = focusIndexRef.current;
        for (let attempt = 0; attempt < items.length; attempt++) {
          next = next + 1 >= items.length ? 0 : next + 1;
          if (items[next] && !items[next]?.disabled) break;
        }
        focusIndexRef.current = next;
        items[next]?.focus();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const items = menuItemsRef.current;
        let next = focusIndexRef.current;
        for (let attempt = 0; attempt < items.length; attempt++) {
          next = next - 1 < 0 ? items.length - 1 : next - 1;
          if (items[next] && !items[next]?.disabled) break;
        }
        focusIndexRef.current = next;
        items[next]?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, close]);

  const handleAction = (fn: () => void) => {
    fn();
    close();
  };

  const isLoading = exportStatus === 'loading';

  return (
    <div ref={ref} className="relative">
      <Tooltip label="Exportar dossiê" position="bottom">
        <button
          ref={toggleRef}
          onClick={() => setOpen(prev => !prev)}
          disabled={isLoading}
          className={`p-2 rounded-lg transition-colors ${
            isDarkMode
              ? 'text-gray-400 hover:text-white hover:bg-gray-700'
              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
          } ${isLoading ? 'opacity-50 cursor-wait' : ''}`}
          aria-label="Exportar dossiê"
          aria-expanded={open}
          aria-haspopup="true"
          aria-controls={menuId}
        >
          {isLoading ? (
            <span className="inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          )}
        </button>
      </Tooltip>

      {open && (
        <div
          id={menuId}
          className={`absolute right-0 top-full mt-1 w-56 rounded-xl border shadow-lg z-50 overflow-hidden ${
            isDarkMode
              ? 'bg-gray-900 border-gray-700'
              : 'bg-white border-gray-200'
          }`}
          role="menu"
        >
          <div role="presentation" className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider ${
            isDarkMode ? 'text-gray-500' : 'text-gray-400'
          }`}>
            Exportar dossiê
          </div>

          <div role="separator" className={`h-px ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`} />

          <button
            ref={el => { menuItemsRef.current[0] = el; }}
            onClick={() => handleAction(() => onExportConversation?.('html', 'full'))}
            disabled={!onExportConversation}
            role="menuitem"
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
              onExportConversation
                ? isDarkMode
                  ? 'text-gray-200 hover:bg-emerald-900/30 focus:bg-emerald-900/30'
                  : 'text-gray-700 hover:bg-emerald-50 focus:bg-emerald-50'
                : 'opacity-40 cursor-not-allowed'
            }`}
          >
            <span className={`w-7 h-7 flex items-center justify-center rounded-md text-xs font-bold ${
              isDarkMode ? 'bg-emerald-800/50 text-emerald-300' : 'bg-emerald-100 text-emerald-700'
            }`}>HT</span>
            <div>
              <p className="font-medium">HTML navegável</p>
              <p className={`text-[11px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Relatório completo no browser</p>
            </div>
          </button>

          <button
            ref={el => { menuItemsRef.current[1] = el; }}
            onClick={() => handleAction(onExportPDF)}
            role="menuitem"
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
              isDarkMode
                ? 'text-gray-200 hover:bg-gray-800 focus:bg-gray-800'
                : 'text-gray-700 hover:bg-gray-50 focus:bg-gray-50'
            }`}
          >
            <span className={`w-7 h-7 flex items-center justify-center rounded-md text-xs font-bold ${
              isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
            }`}>PD</span>
            <div>
              <p className="font-medium">PDF</p>
              <p className={`text-[11px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Imprimir / salvar como PDF</p>
            </div>
          </button>

          <button
            ref={el => { menuItemsRef.current[2] = el; }}
            onClick={() => handleAction(() => onExportConversation?.('doc', 'full'))}
            disabled={!onExportConversation}
            role="menuitem"
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
              onExportConversation
                ? isDarkMode
                  ? 'text-gray-200 hover:bg-gray-800 focus:bg-gray-800'
                  : 'text-gray-700 hover:bg-gray-50 focus:bg-gray-50'
                : 'opacity-40 cursor-not-allowed'
            }`}
          >
            <span className={`w-7 h-7 flex items-center justify-center rounded-md text-xs font-bold ${
              isDarkMode ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-50 text-blue-600'
            }`}>DO</span>
            <div>
              <p className="font-medium">Word (.doc)</p>
              <p className={`text-[11px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Editar e compartilhar</p>
            </div>
          </button>

          <button
            ref={el => { menuItemsRef.current[3] = el; }}
            onClick={() => handleAction(() => onExportConversation?.('md', 'full'))}
            disabled={!onExportConversation}
            role="menuitem"
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
              onExportConversation
                ? isDarkMode
                  ? 'text-gray-200 hover:bg-gray-800 focus:bg-gray-800'
                  : 'text-gray-700 hover:bg-gray-50 focus:bg-gray-50'
                : 'opacity-40 cursor-not-allowed'
            }`}
          >
            <span className={`w-7 h-7 flex items-center justify-center rounded-md text-xs font-bold ${
              isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
            }`}>MD</span>
            <div>
              <p className="font-medium">Markdown</p>
              <p className={`text-[11px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Texto estruturado</p>
            </div>
          </button>

          <div role="separator" className={`h-px ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`} />

          <button
            ref={el => { menuItemsRef.current[4] = el; }}
            onClick={() => handleAction(onCopyMarkdown)}
            role="menuitem"
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
              isDarkMode
                ? 'text-gray-200 hover:bg-gray-800 focus:bg-gray-800'
                : 'text-gray-700 hover:bg-gray-50 focus:bg-gray-50'
            }`}
          >
            <span className={`w-7 h-7 flex items-center justify-center rounded-md ${
              isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
            }`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
            </span>
            <div>
              <p className="font-medium">Copiar Markdown</p>
              <p className={`text-[11px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Área de transferência</p>
            </div>
          </button>

          {exportStatus !== 'idle' && (
            <div role="status" aria-live="polite" className={`mx-3 mb-2 mt-1 rounded-lg px-3 py-2 text-xs ${
              exportStatus === 'error'
                ? isDarkMode
                  ? 'bg-red-900/30 text-red-300'
                  : 'bg-red-50 text-red-700'
                : exportStatus === 'success'
                  ? isDarkMode
                    ? 'bg-emerald-900/30 text-emerald-300'
                    : 'bg-emerald-50 text-emerald-700'
                  : isDarkMode
                    ? 'bg-blue-900/30 text-blue-300'
                    : 'bg-blue-50 text-blue-700'
            }`}>
              {exportStatus === 'loading' && 'Preparando exportação...'}
              {exportStatus === 'success' && 'Exportação concluída.'}
              {exportStatus === 'error' && 'Falha ao exportar.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ExportDropdown;
