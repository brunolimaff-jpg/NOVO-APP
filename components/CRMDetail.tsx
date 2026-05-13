import React, { useState, useRef, useMemo } from 'react';
import { ChatSession, CRM_STAGE_LABELS } from '../types';
import { useCRM } from '../contexts/CRMContext';
import { sendMessageToGemini } from '../services/geminiService';
import ConfirmPopover from './ConfirmPopover';
const RevenueIntelligence = React.lazy(() => import('./RevenueIntelligence'));
import { buildRevenueProfile } from '../services/revenueService';

interface CRMDetailProps {
  card: any; // intencionalmente flexível para permitir campos adicionais do CRM
  sessions: ChatSession[];
  onClose: () => void;
  onSelectSession: (sessionId: string) => void;
  onMoveStage: (stage: string) => void;
  onCreateSessionFromCard?: () => void;
  isDarkMode: boolean;
}

type CRMStageKey = 'prospeccao' | 'primeira_reuniao' | 'levantamento' | 'defesa_tecnica' | 'dossie_final';

interface CRMAttachment {
  id: string;
  fileName: string;
  url: string;
  mimeType: string;
  stage: CRMStageKey;
  uploadedAt: string;
}

export const CRMDetail: React.FC<CRMDetailProps> = ({
  card,
  sessions,
  onClose,
  onSelectSession,
  onMoveStage,
  onCreateSessionFromCard,
  isDarkMode,
}) => {
  const { updateCard, deleteCard } = useCRM();

  if (!card) return null;

  const linkedSessions = Array.isArray(card.linkedSessionIds)
    ? sessions.filter(s => card.linkedSessionIds.includes(s.id))
    : [];

  const stages = ['prospeccao', 'primeira_reuniao', 'levantamento', 'defesa_tecnica', 'dossie_final'] as const;

  const porta: number | undefined = typeof card.latestScorePorta === 'number' ? card.latestScorePorta : undefined;
  const portaColor = porta !== undefined
    ? porta >= 71
      ? 'text-emerald-500'
      : porta >= 41
        ? 'text-amber-400'
        : 'text-red-500'
    : 'text-slate-400';

  const portaBadgeBg = porta !== undefined
    ? porta >= 71
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
      : porta >= 41
        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
        : 'bg-red-500/15 text-red-700 dark:text-red-300'
    : 'bg-slate-500/10 text-slate-500';

  const cnpjs: string[] = Array.isArray(card.cnpjs)
    ? card.cnpjs
    : card.cnpj
      ? [card.cnpj]
      : [];

  const website: string = card.website || '';
  const initialExactLink: string = card.exactLink || '';
  const briefDescription: string = card.briefDescription || '';

  const createdAt = card.createdAt ? new Date(card.createdAt).toLocaleDateString('pt-BR') : '';
  const updatedAt = card.updatedAt ? new Date(card.updatedAt).toLocaleDateString('pt-BR') : '';

  const [manualCnpj, setManualCnpj] = useState('');
  const [cnpjStatus, setCnpjStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid' | 'error'>('idle');
  const [cnpjMessage, setCnpjMessage] = useState<string | null>(null);

  const [exactLinkInput, setExactLinkInput] = useState(initialExactLink);
  const [exactScanStatus, setExactScanStatus] = useState<'idle' | 'scanning' | 'ok' | 'error'>(initialExactLink ? 'ok' : 'idle');
  const exactLocked = exactScanStatus === 'ok';

  const initialProspeccaoNotes: string = card.stages?.prospeccao?.crmNotes || '';
  const [prospectionNotes, setProspectionNotes] = useState(initialProspeccaoNotes);

  const initialSpotterRaw: string = card.stages?.prospeccao?.technicalNotes || '';
  const [spotterRaw, setSpotterRaw] = useState(initialSpotterRaw);

  const [companyNameInput, setCompanyNameInput] = useState(card.companyName || '');
  const [websiteInput, setWebsiteInput] = useState(website);
  const [briefDescriptionInput, setBriefDescriptionInput] = useState(briefDescription);
  const [isGeneratingBrief, setIsGeneratingBrief] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const currentStage = card.stage as CRMStageKey;
  const allAttachments: CRMAttachment[] = Array.isArray(card.attachments) ? card.attachments : [];

  // Revenue Intelligence: usa perfil salvo no card ou deriva de sessões vinculadas
  const revenueProfile = useMemo(() => {
    if (card.revenueProfile) return card.revenueProfile;

    // Tenta extrair clienteSeniorData das sessões vinculadas
    const seniorMsg = linkedSessions
      .flatMap(s => s.messages)
      .find(m => m.clienteSeniorData?.encontrado && m.clienteSeniorData.familias?.length);

    const senior = seniorMsg?.clienteSeniorData;
    if (!senior?.familias?.length) return null;

    return buildRevenueProfile({
      cardId: card.id,
      familias: senior.familias ?? [],
      modulosPorFamilia: senior.modulosPorFamilia ?? {},
      totalModulos: senior.totalModulos ?? (senior.familias?.length ?? 0),
    });
  }, [card.id, card.revenueProfile, linkedSessions]);
  const stageAttachments = allAttachments.filter(a => a.stage === currentStage);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const cleanDigits = (value: string) => value.replace(/\D/g, '');

  const persistCnpjAndName = async (digits: string, razaoSocial?: string, fantasia?: string) => {
    const updated = {
      ...card,
      cnpj: digits,
      cnpjs: [digits],
      companyName: razaoSocial || fantasia || card.companyName,
    };
    await updateCard(updated);
    setCompanyNameInput(razaoSocial || fantasia || card.companyName || '');
  };

  const persistExactLink = async (url: string) => {
    const updated = { ...card, exactLink: url };
    await updateCard(updated);
  };

  const persistProspectionNotes = async (value: string) => {
    const existingStage = card.stages?.prospeccao || {
      transcriptions: [],
      executiveNotes: '',
      technicalNotes: '',
    };
    const updated = {
      ...card,
      stages: {
        ...(card.stages || {}),
        prospeccao: { ...existingStage, crmNotes: value },
      },
    };
    await updateCard(updated);
  };

  const persistSpotterRaw = async (value: string) => {
    const existingStage = card.stages?.prospeccao || {
      transcriptions: [],
      executiveNotes: '',
      technicalNotes: '',
    };
    const updated = {
      ...card,
      stages: {
        ...(card.stages || {}),
        prospeccao: { ...existingStage, technicalNotes: value },
      },
    };
    await updateCard(updated);
  };

  const persistCompanyName = async (value: string) => {
    const updated = { ...card, companyName: value.trim() || 'Empresa sem nome' };
    await updateCard(updated);
  };

  const persistWebsite = async (value: string) => {
    const cleaned = value.trim();
    const updated = { ...card, website: cleaned || null };
    await updateCard(updated);
  };

  const persistBriefDescription = async (value: string) => {
    const updated = { ...card, briefDescription: value.trim() };
    await updateCard(updated);
  };

  const uploadCrmAttachmentWithSupabase = async (
    _cardId: string,
    _stage: CRMStageKey,
    _file: File,
  ): Promise<{ url: string; path: string }> => {
    throw new Error('Upload de arquivos ainda não foi configurado com o Supabase.');
  };

  const handleUploadAttachments = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      const uploaded: CRMAttachment[] = [];
      for (const file of Array.from(files)) {
        const { url } = await uploadCrmAttachmentWithSupabase(card.id, currentStage, file);
        uploaded.push({
          id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 8)}`,
          fileName: file.name,
          url,
          mimeType: file.type || 'application/octet-stream',
          stage: currentStage,
          uploadedAt: new Date().toISOString(),
        });
      }
      const updated = { ...card, attachments: [...allAttachments, ...uploaded] };
      await updateCard(updated);
    } catch (err) {
      console.error('Erro ao enviar anexos do CRM:', err);
      setUploadError('Upload indisponível no momento. Configure o serviço de armazenamento.');
      setTimeout(() => setUploadError(null), 5000);
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  const handleValidateCnpj = async () => {
    const digits = cleanDigits(manualCnpj);
    if (digits.length !== 14) {
      setCnpjStatus('invalid');
      setCnpjMessage('Informe um CNPJ com 14 digitos.');
      return;
    }
    try {
      setCnpjStatus('validating');
      setCnpjMessage(null);
      const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
      if (!resp.ok) {
        setCnpjStatus('invalid');
        setCnpjMessage('CNPJ nao encontrado na BrasilAPI. Verifique os numeros.');
        return;
      }
      const data: any = await resp.json().catch(() => null);
      const razao = data?.razao_social || data?.nome_fantasia;
      await persistCnpjAndName(digits, razao, data?.nome_fantasia);
      setCnpjStatus('valid');
      setCnpjMessage(
        razao
          ? `CNPJ valido. Razao social: ${razao}.`
          : 'CNPJ valido. Dados basicos conferidos na BrasilAPI.',
      );
    } catch (err) {
      console.error('Erro ao validar CNPJ na BrasilAPI', err);
      setCnpjStatus('error');
      setCnpjMessage('Nao foi possivel validar agora. Tente novamente em instantes.');
    }
  };

  const normalizeUrl = (raw: string) => raw.trim().replace(/[),.]+$/g, '');

  const handleScanExactLink = () => {
    const url = normalizeUrl(exactLinkInput);
    if (!url || !url.startsWith('http')) { setExactScanStatus('error'); return; }
    if (!url.includes('app.exactspotter.com')) { setExactScanStatus('error'); return; }
    setExactScanStatus('scanning');
    setTimeout(async () => {
      setExactScanStatus('ok');
      try { await persistExactLink(url); } catch (err) { console.error('Erro ao salvar exactLink no CRM', err); }
    }, 700);
  };

  const handleGenerateBriefWithAI = async () => {
    if (isGeneratingBrief) return;
    setIsGeneratingBrief(true);
    setBriefError(null);
    try {
      const contextParts: string[] = [];
      if (spotterRaw?.trim()) contextParts.push(`FICHA SPOTTER:\n${spotterRaw.substring(0, 3500)}`);
      if (prospectionNotes?.trim()) contextParts.push(`ANOTACOES SDR:\n${prospectionNotes.substring(0, 1500)}`);
      const message = `
        Gere um resumo curto (2 a 3 frases, maximo 400 caracteres)
        sobre essa empresa, com foco em contexto comercial para prospeccao.
        Foque em: segmento, porte aproximado, situacao atual e oportunidade de abordagem.
        ${contextParts.join('\n\n')}
      `;
      const { text } = await sendMessageToGemini(message, [], 'Voce e um SDR resumindo rapidamente uma empresa para outro vendedor.');
      const clean = text.replace(/[#*]/g, '').trim();
      setBriefDescriptionInput(clean);
      await persistBriefDescription(clean);
    } catch (err) {
      console.error('Erro ao gerar resumo breve com IA:', err);
      setBriefError('Nao foi possivel gerar o resumo agora. Verifique sua conexao e tente novamente.');
    } finally {
      setIsGeneratingBrief(false);
    }
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${isDarkMode ? 'bg-black/70' : 'bg-black/50'}`}>
      <div
        className={`w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border shadow-2xl ${
          isDarkMode
            ? 'bg-slate-900 border-slate-700 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header */}
        <div className={`flex items-start justify-between gap-4 p-5 border-b ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Empresa no Mini CRM
            </p>
            <h2 className="mt-1 text-lg font-semibold truncate flex items-center gap-2">
              {card.companyName || 'Empresa sem nome'}
              {porta !== undefined && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${portaBadgeBg}`}>
                  PORTA {porta}/100
                </span>
              )}
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
            aria-label="Fechar detalhes do CRM"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-5 pb-4 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {/* Coluna esquerda: dados da empresa */}
            <div className="md:col-span-3 space-y-4">
              <div className={`rounded-xl border p-4 ${isDarkMode ? 'bg-slate-900/60 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400 mb-3">
                  Dados da empresa
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Nome da empresa</label>
                    <input
                      type="text"
                      value={companyNameInput}
                      onChange={e => setCompanyNameInput(e.target.value)}
                      onBlur={() => persistCompanyName(companyNameInput)}
                      className={`mt-1 w-full rounded-lg border px-3 py-1.5 text-sm bg-transparent ${isDarkMode ? 'border-slate-700 text-slate-100' : 'border-slate-300 text-slate-900'}`}
                    />
                    <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                      Pode ajustar o nome mesmo depois da validacao do CNPJ.
                    </p>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">CNPJs</label>
                    {cnpjs.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {cnpjs.map(cnpj => (
                          <span key={cnpj} className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-700 dark:text-slate-200">
                            {cnpj}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-1 space-y-2">
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">
                          Nao encontramos CNPJ automaticamente neste dossie. Informe um CNPJ para validar os dados.
                        </p>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={manualCnpj}
                            onChange={e => setManualCnpj(e.target.value)}
                            placeholder="00.000.000/0000-00"
                            className={`flex-1 rounded-lg border px-3 py-1.5 text-sm bg-transparent ${isDarkMode ? 'border-slate-700 text-slate-100 placeholder-slate-600' : 'border-slate-300 text-slate-900 placeholder-slate-400'}`}
                          />
                          <button
                            type="button"
                            onClick={handleValidateCnpj}
                            disabled={cnpjStatus === 'validating'}
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                          >
                            {cnpjStatus === 'validating' && (
                              <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                              </svg>
                            )}
                            {cnpjStatus === 'validating' ? 'Validando...' : 'Validar CNPJ'}
                          </button>
                        </div>
                        {cnpjMessage && (
                          <p className={`text-[11px] ${cnpjStatus === 'valid' ? 'text-emerald-500' : cnpjStatus === 'invalid' || cnpjStatus === 'error' ? 'text-red-400' : 'text-slate-400'}`}>
                            {cnpjMessage}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Website</label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="text"
                        value={websiteInput}
                        onChange={e => setWebsiteInput(e.target.value)}
                        onBlur={() => persistWebsite(websiteInput)}
                        placeholder="https://exemplo.com"
                        className={`flex-1 rounded-lg border px-3 py-1.5 text-sm bg-transparent ${isDarkMode ? 'border-slate-700 text-slate-100 placeholder-slate-600' : 'border-slate-300 text-slate-900 placeholder-slate-400'}`}
                      />
                      {websiteInput?.trim() && (
                        <button
                          type="button"
                          onClick={() => {
                            const raw = websiteInput.trim();
                            window.open(raw.startsWith('http') ? raw : `https://${raw}`, '_blank');
                          }}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-500 text-white hover:bg-emerald-600"
                        >
                          Abrir
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Resumo breve</label>
                    <div className="mt-1 flex flex-col gap-2">
                      <textarea
                        value={briefDescriptionInput}
                        onChange={e => setBriefDescriptionInput(e.target.value)}
                        onBlur={() => persistBriefDescription(briefDescriptionInput)}
                        placeholder="Resumo curto da empresa com foco em contexto comercial..."
                        rows={3}
                        className={`w-full rounded-lg border px-3 py-2 text-sm resize-none bg-transparent ${isDarkMode ? 'border-slate-700 text-slate-100 placeholder-slate-600' : 'border-slate-300 text-slate-900 placeholder-slate-400'}`}
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleGenerateBriefWithAI}
                          disabled={isGeneratingBrief}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1.5 ${isGeneratingBrief ? 'bg-slate-400 text-white cursor-wait' : 'bg-emerald-500 text-white hover:bg-emerald-600'}`}
                        >
                          {isGeneratingBrief && (
                            <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                            </svg>
                          )}
                          {isGeneratingBrief ? 'Gerando...' : 'Gerar com IA'}
                        </button>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">
                          A IA usa dossies, Spotter e anotacoes para montar um resumo de 2–3 frases.
                        </span>
                      </div>
                      {briefError && (
                        <p className="text-[11px] text-red-400 mt-1">{briefError}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className={`rounded-xl border p-4 ${isDarkMode ? 'bg-slate-900/60 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400 mb-3">
                  Pesquisa / ExactSpotter
                </h3>
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Link publico da pesquisa</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="text"
                    value={exactLinkInput}
                    onChange={e => setExactLinkInput(e.target.value)}
                    readOnly={exactLocked}
                    placeholder="https://app.exactspotter.com/public/..."
                    className={`flex-1 rounded-lg border px-3 py-1.5 text-sm bg-transparent ${isDarkMode ? 'border-slate-700 text-slate-100 placeholder-slate-600' : 'border-slate-300 text-slate-900 placeholder-slate-400'} ${exactLocked ? 'opacity-80 cursor-not-allowed' : ''}`}
                  />
                  {exactLocked ? (
                    <span className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
                      Link verificado
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleScanExactLink}
                      disabled={exactScanStatus === 'scanning'}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white disabled:opacity-60 disabled:cursor-wait flex items-center gap-1.5"
                    >
                      {exactScanStatus === 'scanning' && (
                        <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                        </svg>
                      )}
                      {exactScanStatus === 'scanning' ? 'Verificando...' : 'Verificar link'}
                    </button>
                  )}
                </div>
                {exactScanStatus === 'idle' && (
                  <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                    Cole o link publico do ExactSpotter na investigacao.
                  </p>
                )}
                {exactScanStatus === 'error' && (
                  <p className="mt-2 text-[11px] text-red-400">
                    Nao parece ser um link valido do ExactSpotter. Confirme se copiou o endereco publico completo.
                  </p>
                )}

                {card.stage === 'prospeccao' && (
                  <div className="mt-4 space-y-2">
                    <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      Conteudo copiado do Spotter (opcional)
                    </label>
                    <textarea
                      rows={5}
                      value={spotterRaw}
                      onChange={e => setSpotterRaw(e.target.value)}
                      onBlur={() => persistSpotterRaw(spotterRaw)}
                      placeholder="Abra o link publico do ExactSpotter, copie todo o texto da ficha e cole aqui."
                      className={`w-full rounded-lg border px-3 py-2 text-[11px] resize-y ${isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-600' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'}`}
                    />
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      Esse texto bruto fica salvo apenas neste dossie e podera ser usado para gerar resumos com IA.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Coluna direita */}
            <div className="md:col-span-2 space-y-4">
              {porta !== undefined && (
                <div className={`rounded-xl border p-4 ${isDarkMode ? 'bg-slate-900/60 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Score PORTA</span>
                    <span className={`text-lg font-bold ${portaColor}`}>{porta}/100</span>
                  </div>
                  <div className={`w-full h-2 rounded-full mt-2 ${isDarkMode ? 'bg-slate-800' : 'bg-slate-200'}`}>
                    <div
                      className={`h-full rounded-full transition-all ${porta >= 71 ? 'bg-emerald-500' : porta >= 41 ? 'bg-amber-400' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(porta, 100)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                    Com novos aprofundamentos de pesquisa, o PORTA pode mudar.
                  </p>
                </div>
              )}

              {revenueProfile && (
                <React.Suspense fallback={null}>
                  <RevenueIntelligence profile={revenueProfile} isDarkMode={isDarkMode} />
                </React.Suspense>
              )}

              <div className={`rounded-xl border p-4 ${isDarkMode ? 'bg-slate-900/60 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 block">Etapa do funil</label>
                <select
                  value={card.stage}
                  onChange={e => onMoveStage(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'}`}
                >
                  {stages.map(stage => (
                    <option key={stage} value={stage}>{CRM_STAGE_LABELS[stage]}</option>
                  ))}
                </select>
                <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                  Na etapa desde: {card.movedToStageAt?.[card.stage]
                    ? new Date(card.movedToStageAt[card.stage]!).toLocaleDateString('pt-BR')
                    : 'Data nao registrada'}
                </p>
              </div>

              {card.stage === 'prospeccao' && (
                <div className={`rounded-xl border p-4 ${isDarkMode ? 'bg-slate-900/60 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 block">
                    Anotacoes (Prospecção)
                  </label>
                  <textarea
                    rows={4}
                    value={prospectionNotes}
                    onChange={e => setProspectionNotes(e.target.value)}
                    onBlur={() => persistProspectionNotes(prospectionNotes)}
                    placeholder="Anote aqui dores principais, decisores, contexto da ligacao, proximo passo, etc."
                    className={`w-full rounded-lg border px-3 py-2 text-sm resize-y ${isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-600' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'}`}
                  />
                  <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                    Essas anotacoes ficam apenas neste modal para apoiar o follow-up.
                  </p>
                </div>
              )}

              <div className={`rounded-xl border p-4 ${isDarkMode ? 'bg-slate-900/60 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    Documentos desta etapa
                  </h3>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                  >
                    Anexar arquivos
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.txt,.doc,.docx,.xlsx,.csv,image/*"
                    className="hidden"
                    onChange={handleUploadAttachments}
                  />
                </div>
                {uploadError && (
                  <p className="text-[11px] text-amber-500 mt-1 animate-fade-in">⚠ {uploadError}</p>
                )}
                {stageAttachments.length > 0 ? (
                  <ul className="space-y-1 max-h-32 overflow-y-auto text-[11px] pr-1">
                    {stageAttachments.map(att => (
                      <li key={att.id} className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => window.open(att.url, '_blank')}
                          className="text-slate-600 dark:text-slate-200 hover:underline truncate text-left"
                        >
                          {att.fileName}
                        </button>
                        <span className="text-[10px] text-slate-400">
                          {new Date(att.uploadedAt).toLocaleDateString('pt-BR')}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    Nenhum documento anexado nesta etapa ainda.
                  </p>
                )}
              </div>

              {/* Sessoes vinculadas + botao Nova Investigacao (caminho inverso CRM → Chat) */}
              <div className={`rounded-xl border p-4 ${isDarkMode ? 'bg-slate-900/60 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    Sessoes de investigacao vinculadas
                  </h3>
                  {onCreateSessionFromCard && (
                    <button
                      type="button"
                      onClick={onCreateSessionFromCard}
                      className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-600 text-white hover:bg-emerald-500 font-medium"
                    >
                      + Nova investigação
                    </button>
                  )}
                </div>
                {linkedSessions.length > 0 ? (
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {linkedSessions.map(session => (
                      <button
                        key={session.id}
                        onClick={() => onSelectSession(session.id)}
                        className={`w-full text-left p-3 rounded-lg border text-xs flex flex-col gap-0.5 transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-700 hover:border-emerald-500/60' : 'bg-white border-slate-200 hover:border-emerald-500/70'}`}
                      >
                        <span className="font-medium truncate">{session.title}</span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">
                          {new Date(session.updatedAt).toLocaleDateString('pt-BR')} · {session.messages.length} mensagens
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    Nenhuma sessao vinculada. Use "+ Nova investigação" para iniciar uma pesquisa sobre esta empresa.
                  </p>
                )}
              </div>

              <div className={`rounded-xl border p-3 text-[11px] flex flex-col gap-0.5 ${isDarkMode ? 'bg-slate-900/60 border-slate-700 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                <span>Criado em: {createdAt || '—'}</span>
                <span>Ultima atualizacao: {updatedAt || '—'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between p-5 border-t ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <ConfirmPopover
            message="Excluir do CRM?"
            onConfirm={async () => { await deleteCard(card.id); onClose(); }}
            isDarkMode={isDarkMode}
          >
            {({ onClick }) => (
              <button
                type="button"
                onClick={onClick}
                className="order-2 md:order-1 inline-flex items-center justify-center px-3 py-2 rounded-lg border border-red-500/60 text-[12px] font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10"
              >
                🗑 Excluir empresa do CRM
              </button>
            )}
          </ConfirmPopover>
          <button
            type="button"
            onClick={onClose}
            className="order-1 md:order-2 inline-flex items-center justify-center flex-1 md:flex-none px-4 py-2.5 rounded-lg text-[13px] font-medium bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
