
import React, { useState } from "react";
import { v4 as uuidv4 } from 'uuid';
import { sendFeedbackRemote, FeedbackType } from "../services/feedbackRemoteStore";
import { ChatMode } from "../constants";

interface FeedbackSectionProps {
  sectionKey: string;
  sectionTitle: string;
  sectionContent: string;
  sessionId: string;
  messageId: string;
  userId?: string;
  userName?: string;
  isDarkMode: boolean;
  mode: ChatMode; // Added mode
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
  mode
}) => {
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");
  const [feedbackSent, setFeedbackSent] = useState<FeedbackType | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);

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
    label: "Avaliar seção:",
    like: "Útil",
    dislike: "Melhorar",
    successLike: "👍 Obrigado",
    successDislike: "👎 Feedback enviado"
  };

  const submitFeedback = async (type: FeedbackType, userComment: string = "") => {
    setIsSubmitting(true);
    try {
      await sendFeedbackRemote({
        feedbackId: uuidv4(),
        sessionId,
        messageId,
        sectionKey,
        sectionTitle,
        type,
        comment: userComment,
        aiContent: sectionContent,
        userId,
        userName,
        timestamp: new Date().toISOString()
      });
      setFeedbackSent(type);
      setShowComment(false);
      setTimeout(() => setFeedbackSent(null), 4000);
    } catch (err) {
      console.error("Erro ao enviar feedback:", err);
      setSubmitError(true);
      setTimeout(() => setSubmitError(false), 4000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDislikeClick = () => {
    setShowComment(true);
  };

  const handleLikeClick = () => {
    submitFeedback("like");
  };

  const handleSendComment = () => {
    submitFeedback("dislike", comment);
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
        <span className={`${theme.text} uppercase tracking-wide font-medium`}>{texts.label}</span>
        
        <button
          onClick={handleLikeClick}
          disabled={isSubmitting}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-all ${theme.text} ${theme.hoverLike} disabled:opacity-50`}
          title="Conteúdo útil / correto"
        >
          <span className="text-sm">👍</span> 
          <span>{texts.like}</span>
        </button>
        
        <button
          onClick={handleDislikeClick}
          disabled={isSubmitting || showComment}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-all ${theme.text} ${theme.hoverDislike} disabled:opacity-50`}
          title="Conteúdo incorreto / irrelevante"
        >
          <span className="text-sm">👎</span> 
          <span>{texts.dislike}</span>
        </button>
      </div>

      {showComment && (
        <div className="w-full max-w-md animate-slide-in mt-1">
          <div className="flex gap-2">
            <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="O que pode melhorar aqui?"
                className={`flex-1 text-xs px-2 py-1.5 rounded border outline-none focus:ring-1 focus:ring-emerald-500 transition-all ${theme.inputBg}`}
                autoFocus
                onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSendComment();
                    if (e.key === 'Escape') { setShowComment(false); setComment(""); }
                }}
            />
            <button
              onClick={handleSendComment}
              disabled={isSubmitting}
              className={`text-xs px-3 py-1.5 rounded transition-colors shadow-sm whitespace-nowrap ${theme.btnSubmit} disabled:opacity-50`}
            >
              {isSubmitting ? "..." : "Enviar"}
            </button>
            <button
                onClick={() => { setShowComment(false); setComment(""); }}
                className={`text-xs px-2 py-1.5 rounded transition-colors ${theme.btnCancel}`}
                title="Cancelar"
            >
                ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
