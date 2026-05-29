import React, { useState, useEffect, useRef } from 'react';
import Tooltip from './Tooltip';
import { Feedback, FeedbackReason, FeedbackSubmissionOptions } from '../types';
import { FEEDBACK_REASONS } from '../constants';
import { normalizeMermaidBlocks } from '../utils/reportUtils';
import { openPrintReportWindow } from '../utils/printExport';
import { sanitizeSensitivePersonalData } from '../utils/privacy';
import { trackOperatorEvent } from '../services/operatorTracking';
import { useMaybeOperator } from '../contexts/OperatorContext';

interface MessageActionsBarProps {
  content: string;
  verifiedSourcesCount: number;
  citedLinksCount: number;
  currentFeedback?: Feedback;
  onFeedback: (type: Feedback) => void;
  onSubmitFeedback: (type: Feedback, comment: string, content: string, options?: FeedbackSubmissionOptions) => void;
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
  isDarkMode,
}) => {
  const downloadTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const [downloadError, setDownloadError] = useState(false);
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [comment, setComment] = useState('');
  const [selectedReason, setSelectedReason] = useState<FeedbackReason | null>(null);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState<Feedback | null>(currentFeedback ?? null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      if (downloadTimerRef.current) clearTimeout(downloadTimerRef.current);
    };
  }, []);

  const texts = {
    successLike: 'Obrigado, isso ajuda a melhorar os próximos dossiês.',
    successDislike: 'Registrado. Vamos usar isso para ajustar esse tipo de análise.',
    prompt: 'Essas informações te ajudaram a mapear a conta?',
  };

  const textColor = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const hoverColor = isDarkMode ? 'hover:text-slate-200' : 'hover:text-slate-800';
  const activeBg = isDarkMode ? 'bg-slate-700/50' : 'bg-slate-200';
  const borderColor = isDarkMode ? 'border-slate-700/50' : 'border-slate-200';
  const totalSourcesCount = verifiedSourcesCount + citedLinksCount;
  const sourcesLabel = totalSourcesCount > 0 ? `Fontes (${totalSourcesCount})` : 'Fontes';

  const handleCopy = async () => {
    const safeContent = sanitizeSensitivePersonalData(content);
    try {
      await navigator.clipboard.writeText(safeContent);
      setCopyState('copied');
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopyState('idle'), 3000);
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
          if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
          copyTimerRef.current = setTimeout(() => setCopyState('idle'), 3000);
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
      setDownloadError(true);
      if (downloadTimerRef.current) clearTimeout(downloadTimerRef.current);
      downloadTimerRef.current = setTimeout(() => setDownloadError(false), 4000);
    }
  };

  const operator = useMaybeOperator();

  const handleShare = async () => {
    const operatorId = operator?.operatorId || '';
    const operatorEmail = operator?.email;

    trackOperatorEvent('dossier_shared', {
      operatorId,
      email: operatorEmail || undefined,
      entityType: 'message',
    });

    if (navigator.share && window.isSecureContext) {
      try {
        await navigator.share({ title: '🦅 Senior Scout 360 — Dossiê', text: sanitizeSensitivePersonalData(content) });
      } catch {
        handleCopy();
      }
    } else {
      handleCopy();
    }
  };

  const handleCopyLink = async () => {
    const safeContent = sanitizeSensitivePersonalData(content);
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(`${safeContent.substring(0, 120)}...\n\n${url}`);
      setCopyState('copied');
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopyState('idle'), 3000);
    } catch {
      handleCopy();
    }
  };

  const handleLike = () => {
    if (feedbackSubmitted === 'up') return;

    onFeedback('up');
    onSubmitFeedback('up', '', content, { scope: 'message' });
    setFeedbackSubmitted('up');
    setShowCommentBox(false);
    setSelectedReason(null);
  };

  const handleDislikeStart = () => {
    if (feedbackSubmitted === 'down') return;
    setFeedbackSubmitted(null);
    setShowCommentBox(true);
  };

  const submitDislike = () => {
    if (!selectedReason) return;

    onFeedback('down');
    onSubmitFeedback('down', comment.trim(), content, {
      scope: 'message',
      reason: selectedReason,
    });
    setFeedbackSubmitted('down');
    setShowCommentBox(false);
    setComment('');
    setSelectedReason(null);
  };

  const cancelDislike = () => {
    setShowCommentBox(false);
    setComment('');
    setSelectedReason(null);
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
            onClick={handleCopyLink}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-all ${hoverColor} hover:${activeBg}`}
            title="Copiar link da página"
          >
            <span>📋</span>
            <span className="hidden sm:inline">Copiar link</span>
          </button>

          <button
            onClick={handleDownload}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-all ${hoverColor} hover:${activeBg}`}
            title="Baixar HTML"
          >
            <span>📕</span>
            <span className="hidden sm:inline">HTML</span>
          </button>
          {downloadError && (
            <span role="alert" className="text-[10px] text-red-400 animate-fade-in">
              Erro ao gerar PDF
            </span>
          )}

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
              totalSourcesCount === 0 ? 'opacity-50 cursor-not-allowed' : `${hoverColor} hover:${activeBg}`
            } ${isSourcesVisible ? `${activeBg} text-emerald-500` : ''}`}
            title={totalSourcesCount > 0 ? 'Ver fontes citadas e consultadas pela IA' : 'Nenhuma fonte citada'}
          >
            <span>📚</span>
            <span className="hidden sm:inline">{sourcesLabel}</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          {feedbackSubmitted === 'up' && (
            <span className="text-[10px] text-emerald-500 mr-1 animate-fade-in">{texts.successLike}</span>
          )}
          {feedbackSubmitted === 'down' && (
            <span className="text-[10px] text-red-400 mr-1 animate-fade-in">{texts.successDislike}</span>
          )}
          <span className={`text-[11px] mr-1 ${textColor}`}>{texts.prompt}</span>
          <button
            onClick={handleLike}
            disabled={feedbackSubmitted === 'up'}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-md transition-all ${
              feedbackSubmitted === 'up'
                ? 'text-emerald-500 bg-emerald-500/10'
                : `${textColor} ${hoverColor} hover:${activeBg}`
            }`}
            title="Resposta útil"
          >
            <span>👍</span>
            <span>Útil</span>
          </button>
          <button
            onClick={handleDislikeStart}
            disabled={feedbackSubmitted === 'down'}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-md transition-all ${
              feedbackSubmitted === 'down'
                ? 'text-red-500 bg-red-500/10'
                : `${textColor} ${hoverColor} hover:${activeBg}`
            }`}
            title="Resposta não útil"
          >
            <span>👎</span>
            <span>Ajustar</span>
          </button>
        </div>
      </div>

      {showCommentBox && (
        <div
          className={`p-3 rounded-lg text-xs animate-slide-in ${
            isDarkMode ? 'bg-slate-800/80 border border-slate-700' : 'bg-slate-50 border border-slate-200'
          }`}
        >
          <p className={`mb-2 font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            O que precisa ajustar para ficar mais útil na próxima ação?
          </p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {FEEDBACK_REASONS.map(reason => {
              const isSelected = selectedReason === reason.value;
              return (
                <button
                  key={reason.value}
                  type="button"
                  onClick={() => setSelectedReason(reason.value)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                    isSelected
                      ? isDarkMode
                        ? 'border-emerald-500/70 bg-emerald-500/15 text-emerald-200'
                        : 'border-emerald-500/60 bg-emerald-50 text-emerald-700'
                      : isDarkMode
                        ? 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                  }`}
                >
                  {reason.label}
                </button>
              );
            })}
          </div>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Comentário opcional para dar contexto comercial."
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
                disabled={!selectedReason}
                className="px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-500 transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                Registrar ajuste
              </button>
            </Tooltip>
          </div>
        </div>
      )}
    </div>
  );
};

export default MessageActionsBar;
