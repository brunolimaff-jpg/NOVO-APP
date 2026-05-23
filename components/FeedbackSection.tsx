
import React, { useState, useEffect, useRef } from "react";
import { v4 as uuidv4 } from 'uuid';
import { sendFeedbackRemote, FeedbackType } from "../services/feedbackRemoteStore";
import { ChatMode, FEEDBACK_REASONS } from "../constants";
import type { FeedbackReason } from "../types";

interface FeedbackSectionProps {
  sectionKey: string;
  sectionTitle: string;
  sectionContent: string;
  sessionId: string;
  messageId: string;
  userId?: string;
  userName?: string;
  isDarkMode: boolean;
  mode?: ChatMode;
}

export const FeedbackSection: React.FC<FeedbackSectionProps> = ({
  sectionKey,
  sectionTitle,
  sectionContent,
  sessionId,
  messageId,
  userId = "user_default",
  userName = "Convidado",
  isDarkMode,
}) => {
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");
  const [selectedReason, setSelectedReason] = useState<FeedbackReason | null>(null);
  const [feedbackSent, setFeedbackSent] = useState<FeedbackType | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const theme = {
    text: isDarkMode ? 'text-slate-500' : 'text-slate-400', // Mais discreto
    textActive: isDarkMode ? 'text-slate-300' : 'text-slate-600',
    hoverLike: 'hover:text-emerald-500 hover:bg-emerald-500/5',
    hoverDislike: 'hover:text-red-500 hover:bg-red-500/5',
    inputBg: isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-700',
    btnCancel: isDarkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200',
    btnSubmit: 'bg-emerald-600 text-white hover:bg-emerald-500'
  };

  const texts = {
    label: "Essa parte ajudou?",
    like: "Útil",
    dislike: "Ajustar",
    successLike: "Obrigado, isso ajuda a melhorar os próximos dossiês.",
    successDislike: "Registrado. Vamos usar isso para ajustar esse tipo de análise."
  };

  const submitFeedback = async (type: FeedbackType, userComment: string = "", reason?: FeedbackReason | null) => {
    setIsSubmitting(true);
    try {
      const ok = await sendFeedbackRemote({
        feedbackId: uuidv4(),
        sessionId,
        messageId,
        sectionKey,
        sectionTitle,
        type,
        scope: 'section',
        reason: reason ?? null,
        comment: userComment.trim(),
        aiContent: sectionContent,
        userId,
        userName,
        metadata: { source: 'section_feedback' },
        timestamp: new Date().toISOString()
      });

      if (!ok) {
        throw new Error('Feedback destinations failed');
      }
      setFeedbackSent(type);
      setShowComment(false);
      setComment("");
      setSelectedReason(null);
      feedbackTimerRef.current = setTimeout(() => setFeedbackSent(null), 4000);
    } catch (err) {
      console.error("Erro ao enviar feedback:", err);
      setSubmitError(true);
      errorTimerRef.current = setTimeout(() => setSubmitError(false), 4000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDislikeClick = () => {
    if (feedbackSent === 'dislike') return;
    setShowComment(true);
  };

  const handleLikeClick = () => {
    if (feedbackSent === 'like') return;
    submitFeedback("like");
  };

  const handleSendComment = () => {
    if (!selectedReason) return;
    submitFeedback("dislike", comment, selectedReason);
  };

  // Visual de Erro
  if (submitError) {
    return (
      <div className="mt-1 flex items-center gap-1 text-[10px] text-red-400 animate-fade-in select-none">
        <span>⚠ Falha ao enviar feedback. Tente novamente.</span>
      </div>
    );
  }

  // Visual de Sucesso Compacto
  if (feedbackSent) {
    return (
      <div className={`mt-1 flex items-center gap-1.5 text-[10px] ${theme.text} opacity-80 animate-fade-in select-none`}>
        <span className={feedbackSent === "like" ? "text-emerald-500" : "text-red-400"}>
          {feedbackSent === "like" ? texts.successLike : texts.successDislike}
        </span>
      </div>
    );
  }

  // Layout Compacto Principal
  return (
    <div className={`mt-1 flex flex-col items-start gap-1 select-none group/feedback`}>
      <div className={`flex items-center gap-2 text-[10px] transition-opacity duration-300 opacity-60 group-hover/feedback:opacity-100`}>
        <span className={`${theme.text} font-medium`}>{texts.label}</span>
        
        <button
          onClick={handleLikeClick}
          disabled={isSubmitting || feedbackSent === 'like'}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-all ${theme.text} ${theme.hoverLike} disabled:opacity-50`}
          title="Conteúdo útil / correto"
          aria-label="Marcar conteúdo como útil"
        >
          <span className="text-sm" aria-hidden="true">👍</span>
          <span>{texts.like}</span>
        </button>

        <button
          onClick={handleDislikeClick}
          disabled={isSubmitting || showComment || feedbackSent === 'dislike'}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-all ${theme.text} ${theme.hoverDislike} disabled:opacity-50`}
          title="Conteúdo incorreto / irrelevante"
          aria-label="Reportar conteúdo como incorreto"
        >
          <span className="text-sm" aria-hidden="true">👎</span>
          <span>{texts.dislike}</span>
        </button>
      </div>

      {showComment && (
        <div className="w-full max-w-md animate-slide-in mt-1">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {FEEDBACK_REASONS.map(reason => {
              const isSelected = selectedReason === reason.value;
              return (
                <button
                  key={reason.value}
                  type="button"
                  onClick={() => setSelectedReason(reason.value)}
                  aria-pressed={isSelected}
                  aria-label={`Motivo: ${reason.label}`}
                  className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
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
          <div className="flex gap-2">
            <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Comentário opcional"
                aria-label="Comentário do feedback"
                className={`flex-1 text-xs px-2 py-1.5 rounded border outline-none focus:ring-1 focus:ring-emerald-500 transition-all ${theme.inputBg}`}
                autoFocus
                onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSendComment();
                    if (e.key === 'Escape') { setShowComment(false); setComment(""); }
                }}
            />
            <button
              onClick={handleSendComment}
              disabled={isSubmitting || !selectedReason}
              className={`text-xs px-3 py-1.5 rounded transition-colors shadow-sm whitespace-nowrap ${theme.btnSubmit} disabled:opacity-50`}
              aria-label="Enviar feedback"
            >
              {isSubmitting ? "..." : "Enviar"}
            </button>
            <button
                onClick={() => { setShowComment(false); setComment(""); setSelectedReason(null); }}
                className={`text-xs px-2 py-1.5 rounded transition-colors ${theme.btnCancel}`}
                title="Cancelar"
                aria-label="Cancelar feedback"
            >
                <span aria-hidden="true">✕</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
