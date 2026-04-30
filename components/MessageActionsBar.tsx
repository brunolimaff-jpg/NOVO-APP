
import React, { useState } from 'react';
import Tooltip from './Tooltip';
import { Feedback } from '../types';
import { normalizeMermaidBlocks } from '../utils/reportUtils';
import { openPrintReportWindow } from '../utils/printExport';
import { sanitizeSensitivePersonalData } from '../utils/privacy';

interface MessageActionsBarProps {
  content: string;
  verifiedSourcesCount: number;
  citedLinksCount: number;
  currentFeedback?: Feedback;
  onFeedback: (type: Feedback) => void;
  onSubmitFeedback: (type: Feedback, comment: string, content: string) => void;
  onToggleSources: () => void;
  isSourcesVisible: boolean;
  isDarkMode: boolean;
}

// ============================================================
// COMPONENTE
// ============================================================
const MessageActionsBar: React.FC<MessageActionsBarProps> = ({
  content,
  verifiedSourcesCount,
  citedLinksCount,
  currentFeedback,
  onFeedback,
  onSubmitFeedback,
  onToggleSources,
  isSourcesVisible,
  isDarkMode
}) => {
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [comment, setComment] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState<Feedback | null>(currentFeedback || null);

  const textColor = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const hoverColor = isDarkMode ? 'hover:text-slate-200' : 'hover:text-slate-800';
  const activeBg = isDarkMode ? 'bg-slate-700/50' : 'bg-slate-200';
  const borderColor = isDarkMode ? 'border-slate-700/50' : 'border-slate-200';
  const totalSourcesCount = verifiedSourcesCount + citedLinksCount;
  const sourcesLabel = verifiedSourcesCount > 0
    ? `Fontes (${verifiedSourcesCount})`
    : citedLinksCount > 0
      ? `Links (${citedLinksCount})`
      : 'Fontes';

  const handleCopy = async () => {
    const safeContent = sanitizeSensitivePersonalData(content);
    try {
      await navigator.clipboard.writeText(safeContent);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 3000);
    } catch (err) {
      console.warn('Clipboard API failed, trying fallback...', err);
      try {
        const textArea = document.createElement('textarea');
        textArea.value = safeContent;
        textArea.style.cssText = 'position:fixed;left:-9999px;top:0;';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (ok) {
          setCopyState('copied');
          setTimeout(() => setCopyState('idle'), 3000);
        }
      } catch (fallbackErr) {
        console.error('Fallback copy error', fallbackErr);
      }
    }
  };

  // ============================================================
  // EXPORTAR PDF — visualização HTML própria para impressão/salvar como PDF
  // ============================================================
  const handleDownload = async () => {
    try {
      const now = new Date();
      const dateStr = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
      const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      // Extrai título da primeira linha de heading do conteúdo
      const titleMatch = content.match(/^#+ (.+)/m);
      const title = titleMatch ? titleMatch[1].trim() : 'Análise Scout 360';
      const normalizedContent = normalizeMermaidBlocks(sanitizeSensitivePersonalData(content));

      const opened = openPrintReportWindow({
        title,
        subtitle: `${dateStr} às ${timeStr}`,
        content: normalizedContent,
      });
      if (!opened) throw new Error('Popup bloqueado ao abrir exportação em PDF.');
    } catch (e) {
      console.error('Erro ao gerar PDF:', e);
      alert('Erro ao gerar PDF. Tente novamente.');
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: '🦅 Senior Scout 360 — Dossiê', text: sanitizeSensitivePersonalData(content) });
      } catch {
        handleCopy();
      }
    } else {
      handleCopy();
    }
  };

  const handleLike = () => {
    onFeedback('up');
    onSubmitFeedback('up', '', content);
    setFeedbackSubmitted('up');
    setShowCommentBox(false);
  };

  const handleDislikeStart = () => setShowCommentBox(true);

  const submitDislike = () => {
    onFeedback('down');
    onSubmitFeedback('down', comment, content);
    setFeedbackSubmitted('down');
    setShowCommentBox(false);
    setComment('');
  };

  const cancelDislike = () => {
    setShowCommentBox(false);
    setComment('');
  };

  return (
    <div className={`mt-3 pt-2 border-t ${borderColor} flex flex-col gap-2 select-none`}>
      <div className="flex flex-wrap items-center justify-between text-xs gap-2">
        <div className={`flex items-center gap-1 ${textColor}`}>
          <button
            onClick={handleShare}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-all ${hoverColor} hover:${activeBg}`}
            title="Compartilhar (ou Copiar)"
          >
            <span>🔗</span>
            <span className="hidden sm:inline">Compartilhar</span>
          </button>

          <button
            onClick={handleDownload}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-all ${hoverColor} hover:${activeBg}`}
            title="Baixar PDF premium"
          >
            <span>📕</span>
            <span className="hidden sm:inline">PDF</span>
          </button>

          <button
            onClick={handleCopy}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-all ${hoverColor} hover:${activeBg}`}
            title="Copiar texto"
          >
            <span>{copyState === 'copied' ? '✅' : '📋'}</span>
            <span className="hidden sm:inline">{copyState === 'copied' ? 'Copiado' : 'Copiar'}</span>
          </button>

          <button
            onClick={onToggleSources}
            disabled={totalSourcesCount === 0}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-all ${
              totalSourcesCount === 0
                ? 'opacity-50 cursor-not-allowed'
                : `${hoverColor} hover:${activeBg}`
            } ${isSourcesVisible ? `${activeBg} text-emerald-500` : ''}`}
            title={verifiedSourcesCount > 0 ? 'Ver fontes verificadas' : citedLinksCount > 0 ? 'Ver links citados no texto' : 'Nenhuma fonte citada'}
          >
            <span>📚</span>
            <span className="hidden sm:inline">{sourcesLabel}</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          {feedbackSubmitted === 'up' && (
            <span className="text-[10px] text-emerald-500 mr-1 animate-fade-in">Obrigado!</span>
          )}
          {feedbackSubmitted === 'down' && (
            <span className="text-[10px] text-red-400 mr-1 animate-fade-in">Feedback enviado</span>
          )}
          <button
            onClick={handleLike}
            className={`p-1.5 rounded-md transition-all ${
              feedbackSubmitted === 'up'
                ? 'text-emerald-500 bg-emerald-500/10'
                : `${textColor} ${hoverColor} hover:${activeBg}`
            }`}
            title="Resposta útil"
          >
            👍
          </button>
          <button
            onClick={handleDislikeStart}
            className={`p-1.5 rounded-md transition-all ${
              feedbackSubmitted === 'down'
                ? 'text-red-500 bg-red-500/10'
                : `${textColor} ${hoverColor} hover:${activeBg}`
            }`}
            title="Resposta não útil"
          >
            👎
          </button>
        </div>
      </div>

      {showCommentBox && (
        <div
          className={`p-3 rounded-lg text-xs animate-slide-in ${
            isDarkMode
              ? 'bg-slate-800/80 border border-slate-700'
              : 'bg-slate-50 border border-slate-200'
          }`}
        >
          <p className={`mb-2 font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            O que não ficou bom nesta resposta?
          </p>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Ex: Informação desatualizada, alucinação, link quebrado..."
            className={`w-full p-2 rounded mb-2 resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
              isDarkMode
                ? 'bg-slate-900 text-white placeholder-slate-500 border-slate-700'
                : 'bg-white text-slate-800 placeholder-slate-400 border-slate-300'
            }`}
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <Tooltip label="Cancelar envio de feedback" position="top">
              <button
                onClick={cancelDislike}
                className={`px-3 py-1.5 rounded transition-colors ${
                  isDarkMode
                    ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
                }`}
              >
                Cancelar
              </button>
            </Tooltip>
            <Tooltip label="Enviar avaliação negativa com comentário" position="top">
              <button
                onClick={submitDislike}
                className="px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-500 transition-colors shadow-sm"
              >
                Enviar Feedback
              </button>
            </Tooltip>
          </div>
        </div>
      )}
    </div>
  );
};

export default MessageActionsBar;
