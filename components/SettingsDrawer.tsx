import React, { useState, useEffect, useRef } from 'react';
import { ChatMode } from '../constants';
import { usePWA } from '../hooks/usePWA';
import { useToast } from '../hooks/useToast';
import { version } from '../package.json';
import type { ExportFormat, ReportType } from '../types';
import { exportSessionsAsJSON, importSessionsFromJSON } from '../utils/sessionExport';
const SystemHealthCheck = React.lazy(() => import('./SystemHealthCheck'));

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  userName: string;
  onUpdateName: (name: string) => void;
  mode: ChatMode;
  onSetMode: (mode: ChatMode) => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onOpenDashboard: () => void;
  onExportPDF: () => void;
  onExportConversation?: (format: ExportFormat, reportType: ReportType) => void;
  onCopyMarkdown: () => void;
  onScheduleFollowUp: () => void;
  onLogout?: () => void;
  exportStatus: 'idle' | 'loading' | 'success' | 'error';
  exportError?: string | null;
  canAccessDashboard?: boolean;
  canAccessIntegrityCheck?: boolean;
}

const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
  userName,
  onUpdateName,
  isDarkMode,
  onToggleTheme,
  onOpenDashboard,
  onExportPDF,
  onExportConversation,
  onCopyMarkdown,
  onScheduleFollowUp,
  onLogout,
  exportStatus,
  exportError,
  canAccessDashboard = true,
  canAccessIntegrityCheck = true,
}) => {
  const { canInstall, isInstalled, installApp } = usePWA();
  const [showHealthCheck, setShowHealthCheck] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Backup & Restauração states
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [lastExportDate, setLastExportDate] = useState<string | null>(null);
  const [lastImportDate, setLastImportDate] = useState<string | null>(null);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [importSessionCount, setImportSessionCount] = useState(0);

  // Estado local para edição do nome — evita cursor pulando ao digitar
  const [localName, setLocalName] = useState(userName);

  // Sincroniza se o userName externo mudar (ex: logout/login)
  useEffect(() => {
    setLocalName(userName);
  }, [userName]);

  // Confirma a alteração ao sair do campo ou pressionar Enter
  const commitName = () => {
    const trimmed = localName.trim();
    if (trimmed && trimmed !== userName) {
      onUpdateName(trimmed);
    } else if (!trimmed) {
      // Não permite nome vazio — restaura o valor anterior
      setLocalName(userName);
    }
  };

  const runExport = (format: ExportFormat, reportType: ReportType = 'full') => {
    onExportConversation?.(format, reportType);
  };

  const handleExportSessions = async () => {
    setIsExporting(true);
    try {
      await exportSessionsAsJSON();
      const now = new Date();
      const dateStr = now.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      setLastExportDate(dateStr);
      toast.success('Histórico exportado com sucesso!');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Erro ao exportar histórico'
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const backup = await importSessionsFromJSON(file);
      setImportSessionCount(backup.sessionCount);
      setShowImportConfirm(true);

      // Limpar input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Erro ao ler arquivo'
      );
      setIsImporting(false);

      // Limpar input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleConfirmImport = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    setLastImportDate(dateStr);
    setShowImportConfirm(false);
    setIsImporting(false);
    toast.success(`${importSessionCount} sessões restauradas com sucesso!`);
  };

  const handleCancelImport = () => {
    setShowImportConfirm(false);
    setIsImporting(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay escuro */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity animate-fade-in"
        onClick={onClose}
      />

      {/* Drawer lateral direito */}
      <div className={`fixed right-0 top-0 h-full w-80 md:w-96 border-l z-50 overflow-y-auto shadow-2xl transform transition-transform duration-300 animate-slide-in ${
        isDarkMode
          ? 'bg-gray-900 border-gray-700/50'
          : 'bg-white border-gray-200'
      }`}>

        {/* Header do painel */}
        <div className={`flex items-center justify-between p-5 border-b sticky top-0 backdrop-blur-md z-10 ${
          isDarkMode
            ? 'border-gray-700/50 bg-gray-900/95'
            : 'border-gray-200 bg-white/95'
        }`}>
          <h2 className={`text-lg font-bold flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            <span>⚙️</span> Configurações
          </h2>
          <button
            onClick={onClose}
            className={`text-xl p-2 rounded-lg transition-colors ${
              isDarkMode
                ? 'text-gray-400 hover:text-white hover:bg-gray-800'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-8">

          {/* ===== PERFIL ===== */}
          <section>
            <h3 className={`text-xs font-bold uppercase tracking-wider mb-3 ml-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Perfil</h3>

            <div className="space-y-2">
              <label className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Como quer ser chamado?</label>
              <input
                type="text"
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  }
                }}
                placeholder="Ex: Bruno Lima"
                className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all ${
                  isDarkMode
                    ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-600'
                    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'
                }`}
              />
              <p className={`text-[10px] ml-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                Pressione Enter ou clique fora para salvar.
              </p>
            </div>
          </section>

          {/* ===== APARÊNCIA ===== */}
          <section>
            <h3 className={`text-xs font-bold uppercase tracking-wider mb-3 ml-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Aparência</h3>

            <div className={`flex items-center justify-between p-4 rounded-xl border ${isDarkMode ? 'bg-gray-800/50 border-gray-700/50' : 'bg-gray-50 border-gray-200'}`}>
              <div className="flex items-center gap-3">
                <span className="text-xl">{isDarkMode ? '🌙' : '☀️'}</span>
                <div>
                  <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Tema Escuro</p>
                  <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{isDarkMode ? 'Ativado' : 'Desativado'}</p>
                </div>
              </div>
              <button
                onClick={onToggleTheme}
                className={`relative w-12 h-6 rounded-full transition-colors duration-300 focus:outline-none ${
                  isDarkMode ? 'bg-emerald-600' : 'bg-gray-600'
                }`}
              >
                <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-300 shadow-sm ${
                  isDarkMode ? 'translate-x-6' : 'translate-x-0'
                }`} />
              </button>
            </div>
          </section>

          {/* ===== EXPORTAÇÃO ===== */}
          <section>
            <h3 className={`text-xs font-bold uppercase tracking-wider mb-3 ml-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Exportação do dossiê</h3>

            <div className="space-y-2">
              <button
                onClick={onExportPDF}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left group border-emerald-500/30 ${
                  isDarkMode
                    ? 'bg-emerald-900/15 hover:bg-emerald-900/30'
                    : 'bg-emerald-50 hover:bg-emerald-100'
                }`}
              >
                <span className={`text-lg p-2 rounded-lg ${isDarkMode ? 'bg-emerald-800/50' : 'bg-emerald-200'}`}>📕</span>
                <div>
                  <p className={`text-sm font-medium ${isDarkMode ? 'text-emerald-300' : 'text-emerald-900'}`}>Baixar PDF</p>
                  <p className={`text-xs ${isDarkMode ? 'text-emerald-500' : 'text-emerald-700'}`}>Versão completa com layout premium</p>
                </div>
              </button>

              <button
                onClick={() => runExport('doc', 'full')}
                disabled={!onExportConversation}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left group ${
                  onExportConversation
                    ? isDarkMode
                      ? 'bg-gray-800/30 border-gray-700/30 hover:bg-gray-800 hover:border-gray-600'
                      : 'bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                    : 'opacity-50 cursor-not-allowed border-gray-300/30'
                }`}
              >
                <span className={`text-lg p-2 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>📝</span>
                <div>
                  <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Baixar Word</p>
                  <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Arquivo .doc para compartilhar e editar</p>
                </div>
              </button>

              <button
                onClick={() => runExport('md', 'full')}
                disabled={!onExportConversation}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left group ${
                  onExportConversation
                    ? isDarkMode
                      ? 'bg-gray-800/30 border-gray-700/30 hover:bg-gray-800 hover:border-gray-600'
                      : 'bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                    : 'opacity-50 cursor-not-allowed border-gray-300/30'
                }`}
              >
                <span className={`text-lg p-2 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>📄</span>
                <div>
                  <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Baixar Markdown</p>
                  <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Texto estruturado do dossiê completo</p>
                </div>
              </button>

              <button
                onClick={onCopyMarkdown}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left group ${
                  isDarkMode
                    ? 'bg-gray-800/30 border-gray-700/30 hover:bg-gray-800 hover:border-gray-600'
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                }`}
              >
                <span className={`text-lg p-2 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>📋</span>
                <div>
                  <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Copiar Markdown</p>
                  <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Leva o dossiê para área de transferência</p>
                </div>
              </button>

              {exportStatus !== 'idle' && (
                <div className={`rounded-xl border px-3 py-2 text-xs ${
                  exportStatus === 'error'
                    ? isDarkMode
                      ? 'border-red-500/30 bg-red-900/20 text-red-300'
                      : 'border-red-200 bg-red-50 text-red-700'
                    : exportStatus === 'success'
                      ? isDarkMode
                        ? 'border-emerald-500/30 bg-emerald-900/20 text-emerald-300'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : isDarkMode
                        ? 'border-blue-500/30 bg-blue-900/20 text-blue-300'
                        : 'border-blue-200 bg-blue-50 text-blue-700'
                }`}>
                  {exportStatus === 'loading' && 'Preparando exportação do dossiê...'}
                  {exportStatus === 'success' && 'Exportação concluída.'}
                  {exportStatus === 'error' && (exportError || 'Falha ao exportar o dossiê.')}
                </div>
              )}
            </div>
          </section>

          {/* ===== BACKUP & RESTAURAÇÃO ===== */}
          <section>
            <h3 className={`text-xs font-bold uppercase tracking-wider mb-3 ml-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Backup & Restauração</h3>

            <div className="space-y-4">
              {/* Seção EXPORTAR */}
              <div className={`rounded-xl p-4 space-y-3 border ${isDarkMode ? 'bg-gray-800/30 border-gray-700/30' : 'bg-blue-50 border-blue-200'}`}>
                <div>
                  <p className={`text-sm font-bold flex items-center gap-2 ${isDarkMode ? 'text-blue-300' : 'text-blue-900'}`}>
                    <span>📥</span> Exportar Histórico
                  </p>
                  <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Crie um backup de todas as suas sessões
                  </p>
                </div>
                <button
                  onClick={handleExportSessions}
                  disabled={isExporting}
                  className={`w-full px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                    isExporting
                      ? isDarkMode
                        ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-300 text-gray-600 cursor-not-allowed'
                      : isDarkMode
                      ? 'bg-blue-700 text-white hover:bg-blue-600'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {isExporting ? (
                    <>
                      <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Exportando...
                    </>
                  ) : (
                    <>📥 Exportar Histórico</>
                  )}
                </button>
                {lastExportDate && (
                  <p className={`text-xs text-center ${isDarkMode ? 'text-gray-500' : 'text-gray-600'}`}>
                    Última exportação: {lastExportDate}
                  </p>
                )}
              </div>

              {/* Seção IMPORTAR */}
              <div className={`rounded-xl p-4 space-y-3 border ${isDarkMode ? 'bg-gray-800/30 border-gray-700/30' : 'bg-purple-50 border-purple-200'}`}>
                <div>
                  <p className={`text-sm font-bold flex items-center gap-2 ${isDarkMode ? 'text-purple-300' : 'text-purple-900'}`}>
                    <span>📤</span> Restaurar Histórico
                  </p>
                  <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Carregue um arquivo de backup
                  </p>
                </div>
                <button
                  onClick={handleImportClick}
                  disabled={isImporting}
                  className={`w-full px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                    isImporting
                      ? isDarkMode
                        ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-300 text-gray-600 cursor-not-allowed'
                      : isDarkMode
                      ? 'bg-purple-700 text-white hover:bg-purple-600'
                      : 'bg-purple-600 text-white hover:bg-purple-700'
                  }`}
                >
                  {isImporting ? (
                    <>
                      <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>📤 Importar Histórico</>
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileSelected}
                  className="hidden"
                  aria-label="Selecionar arquivo de backup"
                />
                {lastImportDate && (
                  <p className={`text-xs text-center ${isDarkMode ? 'text-gray-500' : 'text-gray-600'}`}>
                    Última importação: {lastImportDate}
                  </p>
                )}
                <p className={`text-[10px] text-center ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                  💡 Não feche esta aba durante a importação
                </p>
              </div>
            </div>
          </section>

          {/* ===== AÇÕES ===== */}
          <section>
            <h3 className={`text-xs font-bold uppercase tracking-wider mb-3 ml-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Ações</h3>

            <div className="space-y-2">
              {canInstall && (
                <button
                  onClick={installApp}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left group border-emerald-500/40 ${
                    isDarkMode
                      ? 'bg-emerald-900/20 hover:bg-emerald-900/40'
                      : 'bg-emerald-50 hover:bg-emerald-100'
                  }`}
                >
                  <span className={`text-lg p-2 rounded-lg ${isDarkMode ? 'bg-emerald-800/60' : 'bg-emerald-200'}`}>📲</span>
                  <div>
                    <p className={`text-sm font-medium ${isDarkMode ? 'text-emerald-300' : 'text-emerald-800'}`}>Instalar aplicativo</p>
                    <p className={`text-xs ${isDarkMode ? 'text-emerald-500' : 'text-emerald-600'}`}>Adicionar à tela inicial</p>
                  </div>
                </button>
              )}
              {isInstalled && (
                <div className={`flex items-center gap-3 p-3 rounded-xl border ${isDarkMode ? 'border-emerald-700/30 bg-emerald-900/10' : 'border-emerald-200 bg-emerald-50'}`}>
                  <span className="text-lg">✅</span>
                  <p className={`text-xs ${isDarkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>App instalado na tela inicial</p>
                </div>
              )}

              {canAccessDashboard && (
                <button
                  onClick={() => { onOpenDashboard(); onClose(); }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left group ${
                    isDarkMode
                      ? 'bg-gray-800/30 border-gray-700/30 hover:bg-gray-800 hover:border-gray-600'
                      : 'bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                  }`}
                >
                  <span className={`text-lg p-2 rounded-lg transition-colors ${isDarkMode ? 'bg-gray-700 group-hover:bg-gray-600' : 'bg-gray-200 group-hover:bg-gray-300'}`}>📊</span>
                  <div>
                    <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Dashboard</p>
                    <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Histórico e estatísticas</p>
                  </div>
                </button>
              )}

              {canAccessIntegrityCheck && (
                <button
                  onClick={() => setShowHealthCheck(true)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left group border-blue-500/40 ${
                    isDarkMode
                      ? 'bg-blue-900/20 hover:bg-blue-900/40'
                      : 'bg-blue-50 hover:bg-blue-100'
                  }`}
                >
                  <span className={`text-lg p-2 rounded-lg ${isDarkMode ? 'bg-blue-800/60' : 'bg-blue-200'}`}>🔧</span>
                  <div>
                    <p className={`text-sm font-medium ${isDarkMode ? 'text-blue-300' : 'text-blue-800'}`}>Teste de Integridade</p>
                    <p className={`text-xs ${isDarkMode ? 'text-blue-500' : 'text-blue-600'}`}>Verificar sistema completo</p>
                  </div>
                </button>
              )}

              <button
                onClick={() => {
                  onClose();
                  onLogout?.();
                }}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left group border-red-500/40 ${
                  isDarkMode
                    ? 'bg-red-900/20 hover:bg-red-900/40'
                    : 'bg-red-50 hover:bg-red-100'
                }`}
              >
                <span className={`text-lg p-2 rounded-lg ${isDarkMode ? 'bg-red-800/60' : 'bg-red-200'}`}>🚪</span>
                <div>
                  <p className={`text-sm font-medium ${isDarkMode ? 'text-red-300' : 'text-red-800'}`}>Sair da conta</p>
                  <p className={`text-xs ${isDarkMode ? 'text-red-500' : 'text-red-600'}`}>Encerrar sessão atual</p>
                </div>
              </button>
            </div>
          </section>

          {/* ===== SOBRE ===== */}
          <section>
            <div className={`text-center pt-6 border-t ${isDarkMode ? 'border-gray-700/30' : 'border-gray-200'}`}>
              <p className={`text-xs font-bold ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>🦅 Senior Scout 360 · v{version}</p>
              <p className={`text-[10px] mt-1 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>Inteligência Comercial para Agronegócio</p>
            </div>
          </section>

        </div>
      </div>

      {/* Modal de Teste de Integridade */}
      {showHealthCheck && canAccessIntegrityCheck && (
        <React.Suspense fallback={null}>
          <SystemHealthCheck
            isDarkMode={isDarkMode}
            onClose={() => setShowHealthCheck(false)}
          />
        </React.Suspense>
      )}

      {/* Modal de Confirmação de Importação */}
      {showImportConfirm && (
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity"
            onClick={handleCancelImport}
          />
          <div
            className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-2xl shadow-2xl z-50 ${
              isDarkMode
                ? 'bg-gray-900 border border-gray-700'
                : 'bg-white border border-gray-200'
            }`}
            role="dialog"
            aria-modal="true"
          >
            <div
              className={`flex items-center gap-3 p-6 border-b ${
                isDarkMode ? 'border-gray-700/50' : 'border-gray-200'
              }`}
            >
              <span className="text-3xl">⚠️</span>
              <div>
                <h2
                  className={`text-lg font-bold ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}
                >
                  Restaurar Histórico?
                </h2>
              </div>
            </div>

            <div className={`p-6 space-y-4 ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
              <p
                className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
              >
                O arquivo contém <strong>{importSessionCount} sessões</strong>.
              </p>
              <p
                className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}
              >
                Isso vai carregar as sessões para sua área de trabalho. Pode levar alguns segundos.
              </p>
            </div>

            <div
              className={`flex gap-3 p-6 border-t ${
                isDarkMode
                  ? 'border-gray-700/50 bg-gray-900/50'
                  : 'border-gray-200 bg-gray-50/50'
              }`}
            >
              <button
                onClick={handleCancelImport}
                className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all text-sm ${
                  isDarkMode
                    ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Cancelar
              </button>

              <button
                onClick={handleConfirmImport}
                className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all text-sm ${
                  isDarkMode
                    ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white hover:shadow-lg'
                    : 'bg-gradient-to-r from-purple-500 to-purple-600 text-white hover:shadow-lg'
                }`}
              >
                Restaurar
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default SettingsDrawer;
