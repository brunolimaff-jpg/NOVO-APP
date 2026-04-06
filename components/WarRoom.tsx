import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import MarkdownRenderer from './MarkdownRenderer';
import { WarRoomMode, queryWarRoom } from '../services/warRoomService';
import { buildAuditableSources, normalizeSourceUrl, type AuditableSource } from '../utils/textCleaners';
import { fetchLinkStatuses, type LinkValidationResult } from '../utils/linkValidation';

interface WarRoomProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  defaultCompetitorTarget?: string | null;
}

interface WRMessage {
  id: string;
  role: 'user' | 'model';
  mode: WarRoomMode;
  text: string;
  sources?: Array<{ title: string; url: string }>;
  isLoading?: boolean;
  isError?: boolean;
  retryable?: boolean;
  technicalDetails?: string;
}

type UnifiedRoute = 'tech' | 'benchmark';

const MODE_CONFIG: Record<WarRoomMode, { icon: string; label: string; subtitle: string; accent: string; placeholder: string }> = {
  tech: {
    icon: '🧠', label: 'Tira-Dúvidas Técnico', subtitle: 'ERP, Módulos, Processos e Integrações',
    accent: 'blue', placeholder: 'Como funciona o processo de compras no ERP Senior?',
  },
  killscript: {
    icon: '🎯', label: 'Kill-Script Generator', subtitle: 'Scripts de venda contra o concorrente',
    accent: 'red', placeholder: 'O cliente diz que o TOTVS é mais barato... como rebato?',
  },
  benchmark: {
    icon: '📊', label: 'Benchmark Tático', subtitle: 'Comparativo técnico lado a lado',
    accent: 'amber', placeholder: 'Compare o módulo de RH da Senior vs TOTVS',
  },
  objections: {
    icon: '🛡️', label: 'Análise de Objeções', subtitle: 'Desmonte objeções do cliente',
    accent: 'purple', placeholder: 'O cliente diz que SAP tem mais integrações...',
  },
};

const UNIFIED_SUGGESTIONS = [
  'Como funciona o custo por talhão no SimpleFarm?',
  'Qual o fluxo completo da ordem de serviço até a valorização?',
  'Compare Senior x TOTVS para folha + agronegócio.',
  'Quais integrações da Senior reduzem retrabalho com ERP?',
];

const BENCHMARK_INTENT_PATTERNS = [
  /\bbenchmark\b/i,
  /\bcompar(a|ar|e|ativo)\b/i,
  /\bversus\b/i,
  /\bvs\b/i,
  /\bcontra\b/i,
  /\bconcorr[eê]n/i,
  /\bdiferen[cç]a\b/i,
];

const BLOCKED_INTENT_PATTERNS = [
  /\bkill[-\s]?script\b/i,
  /\ban[aá]lise de obje[cç][oõ]es\b/i,
  /\bquebrar obje[cç][aã]o\b/i,
];

const isBlockedIntent = (text: string): boolean =>
  BLOCKED_INTENT_PATTERNS.some((pattern) => pattern.test(text));

const resolveWarRoomIntent = (text: string): UnifiedRoute =>
  BENCHMARK_INTENT_PATTERNS.some((pattern) => pattern.test(text)) ? 'benchmark' : 'tech';

const CLEAN_TARGET_RE = /^[\s"'"'`(,-]+|[\s"'"'`).,;:!?-]+$/g;

const normalizeCompetitorTarget = (value: string): string =>
  value
    .replace(/^\s*(?:a|o|as|os)\s+/i, '')
    .replace(CLEAN_TARGET_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

const isSeniorAlias = (value: string): boolean =>
  /\b(senior|senior sistemas)\b/i.test(value);

const extractCompetitorFromMessage = (message: string): string => {
  const text = message.trim();

  // 1) "compare X com Y" (ou "comparar X com Y")
  const compareWith = text.match(/\bcompar(?:e|ar)?\s+(.{2,80}?)\s+\bcom\b\s+(.{2,80}?)(?:$|[?.!,;])/i);
  if (compareWith) {
    const left = normalizeCompetitorTarget(compareWith[1]);
    const right = normalizeCompetitorTarget(compareWith[2]);
    if (isSeniorAlias(left) && !isSeniorAlias(right)) return right;
    if (isSeniorAlias(right) && !isSeniorAlias(left)) return left;
    if (!isSeniorAlias(right)) return right;
  }

  // 2) "senior vs X" / "senior versus X" / "senior contra X"
  const seniorFirst = text.match(/\bsenior(?:\s+sistemas)?\s+(?:vs|versus|contra)\s+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 ._/-]{1,60})/i);
  if (seniorFirst) {
    return normalizeCompetitorTarget(seniorFirst[1]);
  }

  // 3) "X vs senior" / "X contra senior"
  const seniorSecond = text.match(/([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 ._/-]{1,60})\s+(?:vs|versus|contra)\s+senior(?:\s+sistemas)?\b/i);
  if (seniorSecond) {
    return normalizeCompetitorTarget(seniorSecond[1]);
  }

  // 4) fallback: vs/contra como palavra isolada (evita capturar "totvs")
  const generic = text.match(/\b(?:vs|versus|contra)\b\s+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 ._/-]{1,60})/i);
  return normalizeCompetitorTarget(generic?.[1] || '');
};

export default function WarRoom({ isOpen, onClose, isDarkMode, defaultCompetitorTarget }: WarRoomProps) {
  const dk = isDarkMode;

  const [lastRoute, setLastRoute] = useState<UnifiedRoute>('tech');
  const [messages, setMessages] = useState<WRMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [queryCount, setQueryCount] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [linkStatuses, setLinkStatuses] = useState<Record<string, LinkValidationResult>>({});
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const messageSourcesMap = useMemo<Record<string, AuditableSource[]>>(() => {
    const map: Record<string, AuditableSource[]> = {};
    for (const msg of messages) {
      if (msg.role !== 'model' || msg.isLoading) continue;
      map[msg.id] = buildAuditableSources(msg.text || '', msg.sources || []);
    }
    return map;
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const copyToClipboard = useCallback(async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setCopyFeedback('Conteúdo copiado.');
      setTimeout(() => setCopiedId(null), 2000);
      setTimeout(() => setCopyFeedback(null), 2200);
    } catch {
      setCopyFeedback('Não foi possível copiar. Copie manualmente.');
      setTimeout(() => setCopyFeedback(null), 2600);
    }
  }, []);

  useEffect(() => {
    if (!isOpen && abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setIsLoading(false);
      setStatus('');
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  useEffect(() => {
    const urls = Array.from(
      new Set(
        Object.values(messageSourcesMap)
          .flatMap((sources) => sources.map((s) => s.url).filter(Boolean) as string[])
      )
    );
    if (urls.length === 0) return;

    let cancelled = false;
    fetchLinkStatuses(urls).then((results) => {
      if (!cancelled) setLinkStatuses(results);
    });
    return () => {
      cancelled = true;
    };
  }, [messageSourcesMap]);

  const submitMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;
    if (isBlockedIntent(text)) {
      const userMsg: WRMessage = { id: Date.now().toString(), role: 'user', mode: 'tech', text };
      const blockedReply: WRMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        mode: 'tech',
        text: 'Essa frente está temporariamente bloqueada. **Em breve** liberaremos esse recurso no War Room.',
      };
      setInput('');
      setIsSidebarOpen(false);
      setMessages((prev) => [...prev, userMsg, blockedReply]);
      return;
    }

    const resolvedMode = resolveWarRoomIntent(text);
    setLastRoute(resolvedMode);
    const inferredTarget = extractCompetitorFromMessage(text);
    const target = resolvedMode === 'benchmark'
      ? inferredTarget || (defaultCompetitorTarget || '').trim()
      : '';

    setInput('');
    setIsSidebarOpen(false);
    const userMsg: WRMessage = { id: Date.now().toString(), role: 'user', mode: resolvedMode, text };
    const botId = (Date.now() + 1).toString();
    const loadingMsg: WRMessage = { id: botId, role: 'model', mode: resolvedMode, text: '', isLoading: true };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setIsLoading(true);
    setStatus('Preparando...');
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const history = messages
        .filter(m => !m.isLoading && !m.isError)
        .map(m => ({ role: m.role, text: m.text }));
      const requestTimeoutMs = resolvedMode === 'benchmark' ? 120000 : 90000;

      const result = await queryWarRoom(resolvedMode, text, history, target, setStatus, {
        signal: controller.signal,
        timeoutMs: requestTimeoutMs,
      });
      setQueryCount(prev => prev + 1);

      setMessages((prev) => prev.map((m) =>
        m.id === botId
          ? {
            ...m,
            text: result.text,
            sources: result.sources,
            isLoading: false,
            isError: Boolean(result.isError),
            retryable: result.retryable,
            technicalDetails: result.technicalDetails,
          }
          : m
      ));
    } catch (err: any) {
      setMessages((prev) => prev.map((m) =>
        m.id === botId
          ? {
            ...m,
            text: `⚠️ ${err.message || 'Erro de conexão'}`,
            isError: true,
            isLoading: false,
            retryable: true,
            technicalDetails: err?.stack || err?.message || 'Falha sem stack disponível.',
          }
          : m
      ));
    } finally {
      setIsLoading(false);
      setStatus('');
      abortRef.current = null;
    }
  }, [defaultCompetitorTarget, isLoading, messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    await submitMessage(text);
  }, [input, isLoading, submitMessage]);

  const resendFromFailedMessage = useCallback((failedMessageId: string) => {
    if (isLoading) return;
    const failedIndex = messages.findIndex((m) => m.id === failedMessageId);
    if (failedIndex <= 0) return;
    const userMsg = [...messages.slice(0, failedIndex)].reverse().find((m) => m.role === 'user');
    if (!userMsg) return;
    void submitMessage(userMsg.text);
  }, [isLoading, messages, submitMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  if (!isOpen) return null;

  const cfg = MODE_CONFIG[lastRoute] ?? MODE_CONFIG['tech'];

  const t = {
    pageBg: dk ? 'bg-slate-950' : 'bg-slate-50',
    sidebarBg: dk ? 'bg-slate-900' : 'bg-white',
    sidebarBdr: dk ? 'border-slate-800' : 'border-slate-200',
    headerBg: dk ? 'bg-red-950/30' : 'bg-red-50',
    headerBdr: dk ? 'border-red-900/50' : 'border-red-200',
    headerTitle: dk ? 'text-red-400' : 'text-red-700',
    headerSub: dk ? 'text-red-500/40' : 'text-red-800/50',
    labelTxt: dk ? 'text-slate-500' : 'text-slate-400',
    terminalBg: dk ? 'bg-slate-950' : 'bg-white',
    terminalHdr: dk ? 'bg-slate-900/80' : 'bg-slate-50',
    terminalBdr: dk ? 'border-slate-800' : 'border-slate-200',
    msgBotBg: dk ? 'bg-slate-900/60 border-slate-800/40 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800',
    msgBotErr: dk ? 'bg-red-950/30 border-red-900/40 text-red-300' : 'bg-red-50 border-red-200 text-red-700',
    emptyIcon: dk ? 'opacity-20' : 'opacity-10',
    emptyTxt: dk ? 'text-slate-400' : 'text-slate-500',
    emptySub: dk ? 'text-slate-500' : 'text-slate-400',
    inputBg: dk ? 'bg-slate-900/50' : 'bg-slate-50',
    inputTxt: dk ? 'text-white placeholder-slate-500' : 'text-slate-900 placeholder-slate-400',
    inputWrap: dk ? 'bg-slate-900' : 'bg-white',
    statusBg: dk ? 'bg-slate-950/50' : 'bg-slate-100',
    statusTxt: dk ? 'text-slate-500' : 'text-slate-400',
    textMain: dk ? 'text-white' : 'text-slate-900',
    cardInactive: dk ? 'border-slate-800/40 bg-slate-900/30 hover:bg-slate-800/30 hover:border-slate-700/60'
      : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300',
    cardTxt: dk ? 'text-slate-300' : 'text-slate-700',
    cardSub: dk ? 'text-slate-500' : 'text-slate-400',
    srcBg: dk ? 'bg-slate-800/60 hover:bg-slate-700/60' : 'bg-slate-100 hover:bg-slate-200',
    srcTxt: dk ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700',
    btnClear: dk ? 'text-slate-400 hover:text-white border-slate-700/50 hover:border-slate-600'
      : 'text-slate-500 hover:text-slate-800 border-slate-300 hover:border-slate-400',
    btnCopy: dk ? 'text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10'
      : 'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50',
    loadDot: dk ? 'bg-slate-400' : 'bg-slate-500',
    loadTxt: dk ? 'text-slate-400' : 'text-slate-500',
    hintBdr: dk ? 'border-slate-800/40' : 'border-slate-200',
    hintTxt: dk ? 'text-slate-300' : 'text-slate-600',
    closeTxt: dk ? 'text-red-500/60 hover:text-red-400 hover:bg-red-500/10'
      : 'text-red-400 hover:text-red-600 hover:bg-red-100',
    srcBdr: dk ? 'border-slate-700/30' : 'border-slate-200',
    srcLabel: dk ? 'text-slate-500' : 'text-slate-400',
  };

  const accentGrad: Record<string, string> = {
    blue: 'from-blue-600 to-blue-700', red: 'from-red-600 to-red-700',
    amber: 'from-amber-500 to-amber-700', purple: 'from-purple-600 to-purple-700',
  };
  const accentBorder: Record<string, string> = {
    blue: dk ? 'border-blue-500/30' : 'border-blue-400/40',
    red: dk ? 'border-red-500/30' : 'border-red-400/40',
    amber: dk ? 'border-amber-500/30' : 'border-amber-400/40',
    purple: dk ? 'border-purple-500/30' : 'border-purple-400/40',
  };
  const accentBg: Record<string, string> = {
    blue: dk ? 'bg-blue-500/10' : 'bg-blue-50',
    red: dk ? 'bg-red-500/10' : 'bg-red-50',
    amber: dk ? 'bg-amber-500/10' : 'bg-amber-50',
    purple: dk ? 'bg-purple-500/10' : 'bg-purple-50',
  };
  const accentText: Record<string, string> = {
    blue: dk ? 'text-blue-400' : 'text-blue-700',
    red: dk ? 'text-red-400' : 'text-red-700',
    amber: dk ? 'text-amber-400' : 'text-amber-700',
    purple: dk ? 'text-purple-400' : 'text-purple-700',
  };
  const accentBtn: Record<string, string> = {
    blue: 'bg-blue-600 hover:bg-blue-500', red: 'bg-red-600 hover:bg-red-500',
    amber: 'bg-amber-600 hover:bg-amber-500', purple: 'bg-purple-600 hover:bg-purple-500',
  };

  return (
    <div className={`fixed inset-0 z-50 flex ${t.pageBg} ${t.textMain} animate-fade-in`}>
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 sm:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      <div className={`
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        sm:translate-x-0 sm:relative fixed inset-y-0 left-0 z-50
        w-80 sm:w-72 flex-shrink-0 border-r ${t.sidebarBdr} flex flex-col ${t.sidebarBg}
        transition-transform duration-300 ease-in-out
      `}>
        <div className={`p-4 border-b ${t.headerBdr} ${t.headerBg}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl filter drop-shadow-lg">⚔️</span>
              <div>
                <h2 className={`font-black uppercase tracking-[0.2em] text-xs ${t.headerTitle}`}>The War Room</h2>
                <p className={`text-[10px] sm:text-[9px] uppercase tracking-widest font-semibold ${t.headerSub}`}>Centro de Comando Tático</p>
              </div>
            </div>
            <button onClick={onClose} className={`p-1.5 rounded-lg transition-all text-xs ${t.closeTxt}`}>✕</button>
          </div>
        </div>

        <div className="flex-1 p-3 space-y-2 overflow-y-auto custom-scrollbar">
          <p className={`text-[10px] sm:text-[9px] font-bold uppercase tracking-[0.15em] ${t.labelTxt} mb-2`}>Modo ativo</p>
          <div className={`w-full text-left p-3 sm:p-3 rounded-xl border ${accentBg[cfg.accent]} ${accentBorder[cfg.accent]} shadow-sm`}>
            <div className="flex items-center gap-3">
              <span className="text-xl sm:text-lg flex-shrink-0">⚔️</span>
              <div className="min-w-0 flex-1">
                <p className={`text-xs sm:text-[11px] font-bold leading-tight mb-0.5 ${accentText[cfg.accent]}`}>
                  The War Room
                </p>
                <p className={`text-[10px] sm:text-[9px] leading-snug ${t.cardSub}`}>
                  Roteamento automático para técnico e comparativo
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className={`p-3 border-t ${t.sidebarBdr} ${t.statusBg}`}>
          <div className="flex items-center justify-between text-[10px] sm:text-[9px]">
            <span className="flex items-center gap-1.5 text-emerald-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />OPERACIONAL
            </span>
            <span className={t.statusTxt}>{queryCount} consulta{queryCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      <div className={`flex-1 flex flex-col min-w-0 ${t.terminalBg}`}>
        <div className={`flex items-center justify-between px-3 sm:px-5 py-3 border-b ${t.terminalBdr} ${t.terminalHdr}`}>
          <div className="flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className={`sm:hidden p-2 rounded-lg ${t.btnClear} border`}>☰</button>
            <span className="text-xl">{cfg.icon}</span>
            <div className="min-w-0">
              <h3 className={`text-sm font-black uppercase tracking-wide ${accentText[cfg.accent]} truncate`}>The War Room</h3>
              <p className={`text-[10px] ${t.emptySub} truncate`}>
                Rota atual: {cfg.label}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button onClick={() => setMessages([])}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${t.btnClear}`}>
                🗑️ <span className="hidden sm:inline">Limpar</span>
              </button>
            )}
            {isLoading && (
              <button
                onClick={() => {
                  if (abortRef.current) abortRef.current.abort();
                }}
                className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all text-red-500 border-red-400/40 hover:bg-red-500/10"
              >
                ⏹ <span className="hidden sm:inline">Parar</span>
              </button>
            )}
          </div>
        </div>

        {copyFeedback && (
          <div className={`mx-3 sm:mx-5 mt-2 text-[11px] rounded-lg px-3 py-2 ${dk ? 'bg-slate-900 text-slate-300' : 'bg-slate-100 text-slate-700'}`}>
            {copyFeedback}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4 custom-scrollbar">
          {messages.length === 0 && (
            <div className="flex-1 flex items-center justify-center h-full px-4">
              <div className="text-center max-w-md">
                <span className={`text-5xl block mb-4 ${t.emptyIcon}`}>{cfg.icon}</span>
                <h4 className={`font-semibold text-sm mb-2 ${t.emptyTxt}`}>The War Room</h4>
                <p className={`text-xs mb-6 ${t.emptySub}`}>Faça perguntas técnicas ou comparativas. A rota é escolhida automaticamente.</p>
                <div className="grid grid-cols-1 gap-2">
                  {UNIFIED_SUGGESTIONS.map((hint, i) => (
                    <button key={i} onClick={() => { setInput(hint); inputRef.current?.focus(); }}
                      className={`text-left p-3 rounded-xl border ${t.hintBdr} ${accentBg[cfg.accent]} transition-all text-xs ${t.hintTxt} hover:shadow-sm`}>
                      💡 {hint}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {messages.map(msg => {
            const mergedSources = messageSourcesMap[msg.id] || [];
            return (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[95%] sm:max-w-[85%] rounded-2xl px-3 sm:px-4 py-3 relative group ${msg.role === 'user'
                ? `bg-gradient-to-br ${accentGrad[MODE_CONFIG[msg.mode].accent]} text-white shadow-lg`
                : msg.isError ? t.msgBotErr : t.msgBotBg}`}>
                {msg.isLoading ? (
                  <div className="flex items-center gap-2 py-1">
                    <div className="flex gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${t.loadDot} animate-bounce`} style={{ animationDelay: '0ms' }} />
                      <span className={`w-1.5 h-1.5 rounded-full ${t.loadDot} animate-bounce`} style={{ animationDelay: '150ms' }} />
                      <span className={`w-1.5 h-1.5 rounded-full ${t.loadDot} animate-bounce`} style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className={`text-[10px] animate-pulse ${t.loadTxt}`}>{status || 'Processando...'}</span>
                  </div>
                ) : msg.role === 'user' ? (
                  <p className="text-sm">{msg.text}</p>
                ) : (
                  <div>
                    {/* BOTÃO COPIAR */}
                    <button
                      onClick={() => copyToClipboard(msg.text, msg.id)}
                      className={`absolute top-2 right-2 p-1.5 rounded-lg transition-all opacity-0 group-hover:opacity-100 ${t.btnCopy}`}
                      title="Copiar resposta"
                    >
                      {copiedId === msg.id ? '✓' : '📋'}
                    </button>
                    <MarkdownRenderer content={msg.text} isDarkMode={dk} allowRawHtml={false} auditableSources={mergedSources} />
                    {msg.isError && (
                      <div className={`mt-3 pt-3 border-t ${t.srcBdr} flex flex-wrap items-center gap-2`}>
                        {(msg.retryable ?? true) && (
                          <button
                            type="button"
                            onClick={() => resendFromFailedMessage(msg.id)}
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border transition-all ${
                              dk
                                ? 'border-amber-700/50 text-amber-300 hover:bg-amber-500/10'
                                : 'border-amber-300 text-amber-700 hover:bg-amber-50'
                            }`}
                          >
                            Tentar novamente
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setExpandedErrorId((current) => current === msg.id ? null : msg.id)}
                          className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border transition-all ${
                            dk
                              ? 'border-slate-700 text-slate-300 hover:bg-slate-800/50'
                              : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {expandedErrorId === msg.id ? 'Ocultar detalhes' : 'Ver detalhes'}
                        </button>
                        {expandedErrorId === msg.id && (
                          <pre className={`w-full mt-1 text-[10px] whitespace-pre-wrap break-words p-2 rounded-md ${
                            dk ? 'bg-slate-950/60 text-slate-300' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {msg.technicalDetails || 'Sem detalhes técnicos disponíveis para esta falha.'}
                          </pre>
                        )}
                      </div>
                    )}
                    {mergedSources.length > 0 && (
                      <div className={`mt-3 pt-3 border-t ${t.srcBdr}`}>
                        <p className={`text-[9px] uppercase tracking-wider font-bold mb-1.5 ${t.srcLabel}`}>Fontes</p>
                        <ul className="space-y-1.5">
                          {mergedSources.map((s, i) => {
                            const status = s.url ? linkStatuses[s.url] || linkStatuses[normalizeSourceUrl(s.url)] : undefined;
                            const statusLabel = !s.url
                              ? 'ANÁLISE INFERIDA'
                              : status?.status === 'valid'
                                ? 'CONFIRMADO'
                                : status?.status === 'broken'
                                  ? (status.note || 'OFF-LINE').toUpperCase()
                                  : 'AUDITORIA EM CURSO';
                            const context = s.contexts[0] || (s.url
                              ? 'Referência usada para sustentar parte da resposta.'
                              : 'Menção inferida sem URL explícita; valide manualmente.');

                            return (
                              <li key={s.key || i} className="text-[10px]">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-semibold opacity-80">
                                    {s.citationIndex ? `[${s.citationIndex}]` : '[inferida]'}
                                  </span>
                                  {s.url ? (
                                    <a href={s.url} target="_blank" rel="noopener noreferrer" className={`${t.srcTxt} hover:underline break-all`}>
                                      {s.title || s.url}
                                    </a>
                                  ) : (
                                    <span className={dk ? 'text-slate-300' : 'text-slate-700'}>{s.title}</span>
                                  )}
                                  <span className={`px-1.5 py-0.5 rounded-full ${
                                    statusLabel.includes('CONFIRMADO')
                                      ? (dk ? 'bg-emerald-900/50 text-emerald-300 font-bold' : 'bg-emerald-100 text-emerald-700 font-bold')
                                      : statusLabel.includes('OFF-LINE')
                                        ? (dk ? 'bg-red-900/40 text-red-300' : 'bg-red-100 text-red-700')
                                        : (dk ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-100 text-amber-700')
                                  }`}>
                                    {statusLabel}
                                  </span>
                                </div>
                                <p className={`mt-0.5 ${dk ? 'text-slate-400' : 'text-slate-500'}`}>{context}</p>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )})}
          <div ref={messagesEndRef} />
        </div>

        <div className={`p-3 sm:p-4 border-t ${t.terminalBdr} ${t.inputWrap}`}>
          <div className={`flex items-end gap-2 sm:gap-3 rounded-xl border ${accentBorder[cfg.accent]} ${t.inputBg} p-2 transition-colors focus-within:shadow-sm`}>
            <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="Pergunte sobre produto, processo, integração ou comparação com concorrentes..." rows={1}
              className={`flex-1 bg-transparent text-sm outline-none resize-none max-h-[120px] p-2 ${t.inputTxt}`}
              style={{ minHeight: '36px' }} />
            <button onClick={handleSend} disabled={!input.trim() || isLoading}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider text-white ${accentBtn[cfg.accent]} transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg flex-shrink-0`}>
              {isLoading ? '⏳' : '▶'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
