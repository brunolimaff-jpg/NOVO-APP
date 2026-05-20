import React, { useMemo, useRef, useState } from 'react';
import { useOperator } from '../contexts/OperatorContext';
import { getTimeGreeting } from '../utils/timeGreeting';
import { ChatMode, MODE_LABELS, DEFAULT_MODE } from '../constants';
import type { RadarAlert } from '../types';
import { RADAR_CATEGORY_ICONS } from '../types';
import {
  fetchCompanyByCnpj,
  formatCnpj,
  isValidCnpj,
  normalizeCnpj,
  validateCityInState,
} from '../services/brasilApiService';

interface EmptyStateHomeProps {
  mode: ChatMode;
  onStartInvestigation: (payload: { companyName: string; cnpj: string | null; city: string; state: string }) => void;
  isDarkMode: boolean;
  radarAlerts?: RadarAlert[];
  radarIsScanning?: boolean;
  onForceScan?: () => void;
  onOpenRadar?: () => void;
}

const VALID_UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

const BULLETS: string[] = [
  'Dossiê completo por área: Fiscal, TI, RH e Supply Chain com fontes rastreáveis.',
  'Score PORTA com qualificação preditiva em 5 dimensões — feche os certos primeiro.',
  'Exportável para follow-up comercial — sem retrabalho manual.',
];

const IMPACTO_BADGE: Record<string, { label: string; cls: string }> = {
  oportunidade: { label: 'OPORTUNIDADE', cls: 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300' },
  ameaca:       { label: 'AMEAÇA',        cls: 'bg-red-500/20 text-red-700 dark:text-red-300' },
  vulnerabilidade: { label: 'VULNERABILIDADE', cls: 'bg-amber-500/20 text-amber-700 dark:text-amber-300' },
  neutro:       { label: 'NEUTRO',        cls: 'bg-slate-500/15 text-slate-600 dark:text-slate-400' },
};

const RELEVANCE_BARS: Record<string, { label: string; bars: number; cls: string }> = {
  alta:  { label: 'ALTA',  bars: 3, cls: 'text-red-500 dark:text-red-400' },
  media: { label: 'MÉDIA', bars: 2, cls: 'text-amber-500 dark:text-amber-400' },
  baixa: { label: 'BAIXA', bars: 1, cls: 'text-slate-500 dark:text-slate-400' },
};

const ACTION_LABEL: Record<string, string> = {
  oportunidade: 'Ver Dossiê',
  ameaca: 'Monitorar',
  vulnerabilidade: 'Mitigar',
  neutro: 'Ver mais',
};

function timeAgoHome(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `HÁ ${mins} MIN`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `HÁ ${hours} HORA${hours > 1 ? 'S' : ''}`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ONTEM';
  return `HÁ ${days} DIAS`;
}

interface RadarCardProps {
  alert: RadarAlert;
  isDarkMode: boolean;
  onOpenRadar?: () => void;
}

const RadarCard: React.FC<RadarCardProps> = ({ alert, isDarkMode, onOpenRadar }) => {
  const impacto = alert.impacto ?? 'neutro';
  const badge = IMPACTO_BADGE[impacto] ?? IMPACTO_BADGE.neutro;
  const rel = RELEVANCE_BARS[alert.relevance] ?? RELEVANCE_BARS.baixa;
  const catIcon = RADAR_CATEGORY_ICONS[alert.category] ?? '📡';
  const actionLabel = alert.sourceUrl && alert.sourceUrl !== '#' ? 'LER NOTÍCIA' : (ACTION_LABEL[impacto] ?? 'Ver mais');

  const cardBg = isDarkMode ? 'bg-slate-900/80 border-slate-700/60 hover:border-emerald-500/50' : 'bg-white border-slate-200 hover:border-emerald-500/50';
  const textTitle = isDarkMode ? 'text-slate-100' : 'text-slate-900';
  const textBody = isDarkMode ? 'text-slate-400' : 'text-slate-600';
  const textMeta = isDarkMode ? 'text-slate-500' : 'text-slate-500';

  // Limpeza profunda do resumo de qualquer lixo HTML que possa ter vindo da IA ou do RSS
  const cleanSummaryRaw = (alert.summary || '')
    .replace(/&lt;[^&]*&gt;/g, '') // remove &lt;a ...&gt;
    .replace(/<[^>]*>/g, '')      // remove <a ...>
    .replace(/&amp;[a-z0-9#]+;/gi, '') // remove entidades
    .trim();

  // Tenta remover o nome da fonte se ele estiver grudado no final do resumo (comum em RSS do Google)
  const sourceName = alert.sourceName || '';
  const cleanSummary = cleanSummaryRaw && sourceName 
    ? cleanSummaryRaw.replace(new RegExp(`${sourceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), '').trim()
    : cleanSummaryRaw;

  const handleCardClick = () => {
    if (alert.sourceUrl && alert.sourceUrl !== '#') {
      window.open(alert.sourceUrl, '_blank', 'noopener,noreferrer');
    } else if (onOpenRadar) {
      onOpenRadar();
    }
  };

  return (
    <div 
      className={`flex flex-col rounded-xl border ${cardBg} overflow-hidden transition-all hover:shadow-lg cursor-pointer group`}
      onClick={handleCardClick}
    >
      <div className="flex items-start justify-between gap-2 p-4 pb-3">
        <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge.cls}`}>
          {badge.label}
        </span>
        <span className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide ${rel.cls}`}>
          {rel.label}
          <span aria-hidden className="font-mono tracking-tighter">
            {'|'.repeat(rel.bars)}
          </span>
        </span>
      </div>

      <div className="flex-1 px-4 pb-3">
        <div className="flex items-start justify-between gap-1">
          <p className={`text-sm font-semibold leading-snug group-hover:text-emerald-500 transition-colors ${textTitle}`}>
            {alert.title}
          </p>
          <span className="text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs">↗</span>
        </div>
        <p className={`mt-1.5 text-xs leading-relaxed line-clamp-3 ${textBody}`}>{cleanSummary}</p>
      </div>

      <div className={`flex items-center justify-between gap-2 border-t px-4 py-3 ${isDarkMode ? 'border-slate-700/60' : 'border-slate-100'}`}>
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="text-[11px]">{catIcon}</span>
          <span className={`truncate text-[10px] font-bold uppercase tracking-wide ${isDarkMode ? 'text-slate-300' : 'text-slate-900'}`}>{sourceName}</span>
          <span className={`text-[10px] ${textMeta}`}>·</span>
          <span className={`shrink-0 text-[10px] font-semibold ${textMeta}`}>{timeAgoHome(alert.publishedAt)}</span>
        </div>
        <button
          type="button"
          className={`shrink-0 rounded px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
            isDarkMode
              ? 'bg-slate-800 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white'
              : 'bg-emerald-50 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white'
          }`}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
};

const EmptyStateHome: React.FC<EmptyStateHomeProps> = ({ mode, onStartInvestigation, isDarkMode, radarAlerts, radarIsScanning, onForceScan, onOpenRadar }) => {
  const { name: operatorName } = useOperator();

  const timeGreeting = getTimeGreeting();

  const displayGreeting =
    operatorName && operatorName.trim().length > 0
      ? `${timeGreeting}, ${operatorName}. Qual é o próximo alvo?`
      : `${timeGreeting}! Qual empresa vamos investigar agora?`;

  const modeMeta = MODE_LABELS[mode] ?? MODE_LABELS[DEFAULT_MODE];
  const bullets = BULLETS;

  const [companyName, setCompanyName] = useState('');
  const [cnpjInput, setCnpjInput] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [isFetchingCnpj, setIsFetchingCnpj] = useState(false);
  const [cnpjStatus, setCnpjStatus] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [lastLookupCnpj, setLastLookupCnpj] = useState<string | null>(null);
  const [didSubmit, setDidSubmit] = useState(false);
  const [cnpjLocked, setCnpjLocked] = useState(false);

  // Rastreia quais campos foram preenchidos automaticamente via BrasilAPI.
  // Campos preenchidos manualmente pelo usuário NÃO são limpos ao clicar "Alterar".
  const filledByCnpj = useRef({ companyName: false, city: false, state: false });

  const pageBg = isDarkMode
    ? 'bg-slate-950'
    : 'bg-slate-50/90';
  const textPrimary = isDarkMode ? 'text-white' : 'text-slate-900';
  const textSecondary = isDarkMode ? 'text-slate-400' : 'text-slate-600';
  const textMuted = isDarkMode ? 'text-slate-500' : 'text-slate-500';
  const cardBg = isDarkMode ? 'bg-slate-900/80' : 'bg-white';
  const cardBorder = isDarkMode ? 'border-slate-700/80' : 'border-slate-200';
  const inputClass = `w-full rounded-md border px-3 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-600 ${
    isDarkMode
      ? 'border-slate-600 bg-slate-950/50 text-slate-100 placeholder:text-slate-500'
      : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'
  }`;

  const cnpjDigits = normalizeCnpj(cnpjInput);
  const hasValidCnpj = cnpjDigits.length === 14 && isValidCnpj(cnpjDigits);
  const stateNormalized = state.trim().toUpperCase();
  const isStateValid = VALID_UFS.has(stateNormalized);
  const isFormValid = companyName.trim().length >= 2 && city.trim().length >= 2 && isStateValid;

  const canLookupCnpj = useMemo(
    () => hasValidCnpj && cnpjDigits !== lastLookupCnpj && !isFetchingCnpj,
    [hasValidCnpj, cnpjDigits, lastLookupCnpj, isFetchingCnpj],
  );

  const handleCnpjLookup = async () => {
    if (!canLookupCnpj) return;
    setIsFetchingCnpj(true);
    setCnpjStatus('Buscando dados da empresa...');
    try {
      const data = await fetchCompanyByCnpj(cnpjDigits);
      setLastLookupCnpj(data.cnpj);

      // Preenche nome apenas se vazio; marca como preenchido via CNPJ.
      if (!companyName.trim()) {
        setCompanyName(data.companyName);
        filledByCnpj.current.companyName = true;
      }
      // Sempre sobrescreve cidade e UF vindas de um lookup anterior (marcadas).
      // Se o usuário digitou manualmente, mantém o valor digitado.
      if (!city.trim() || filledByCnpj.current.city) {
        setCity(data.city);
        filledByCnpj.current.city = true;
      }
      if (!state.trim() || filledByCnpj.current.state) {
        setState(data.state.toUpperCase());
        filledByCnpj.current.state = true;
      }

      setCnpjStatus('✓ Dados preenchidos automaticamente via Receita Federal.');
      setCnpjLocked(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('404') || msg.toLowerCase().includes('não encontrado')) {
        setCnpjStatus('CNPJ não encontrado na Receita Federal. Preencha os campos manualmente.');
      } else if (msg.includes('Local dev sem proxy')) {
        setCnpjStatus('Ambiente local sem proxy para consulta de CNPJ. Rode via vercel dev ou configure o proxy.');
      } else {
        setCnpjStatus('Serviço de consulta indisponível no momento. Preencha os campos manualmente.');
      }
      setCnpjLocked(false);
    } finally {
      setIsFetchingCnpj(false);
    }
  };

  const handleUnlockCnpj = () => {
    setCnpjLocked(false);
    setLastLookupCnpj(null);
    setCnpjStatus(null);
    // FIX: limpa apenas os campos que foram preenchidos automaticamente via BrasilAPI,
    // preservando valores digitados manualmente pelo usuário.
    if (filledByCnpj.current.companyName) {
      setCompanyName('');
      filledByCnpj.current.companyName = false;
    }
    if (filledByCnpj.current.city) {
      setCity('');
      filledByCnpj.current.city = false;
    }
    if (filledByCnpj.current.state) {
      setState('');
      filledByCnpj.current.state = false;
    }
  };

  const handleSubmit = async () => {
    setDidSubmit(true);
    if (!isFormValid) return;
    setLocationStatus('Validando cidade/UF no IBGE...');
    const locationValidation = await validateCityInState(city.trim(), stateNormalized);
    if (!locationValidation.isValid) {
      setLocationStatus('Cidade não encontrada para a UF informada. Verifique o cadastro.');
      return;
    }

    setLocationStatus('Localização validada.');
    onStartInvestigation({
      companyName: companyName.trim(),
      cnpj: cnpjDigits.length === 14 ? cnpjDigits : null,
      city: locationValidation.normalizedCity,
      state: locationValidation.normalizedState,
    });
  };

  // ── Derivações de estado do Radar ──────────────────────────────────────────
  // radarAlerts === undefined  → Radar não configurado ainda
  // radarAlerts definido       → Radar ativo (pode estar varrendo ou com/sem dados)
  const radarConfigured = radarAlerts !== undefined;
  const radarScanning   = radarConfigured && !!radarIsScanning && radarAlerts.length === 0;
  const radarEmpty      = radarConfigured && !radarIsScanning && radarAlerts.length === 0;
  const radarHasData    = radarConfigured && radarAlerts.length > 0;

  return (
    <div className={`animate-fade-in min-h-full w-full ${pageBg}`}>
      <div
        className="h-0.5 w-full bg-gradient-to-r from-emerald-800 via-emerald-600 to-teal-500"
        aria-hidden
      />

      <div className="mx-auto max-w-5xl px-4 py-8 md:py-10 lg:px-8 lg:py-12">
        <div className="grid items-start gap-10 lg:grid-cols-12 lg:gap-12">
          {/* Coluna contextual — tom corporativo */}
          <div className="lg:col-span-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-400">
              Nova investigação
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <h1 className={`text-2xl font-bold tracking-tight md:text-3xl ${textPrimary}`}>
                {modeMeta.label}
              </h1>
              <span
                className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  isDarkMode
                    ? 'border-emerald-700/60 bg-emerald-950/40 text-emerald-300'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                }`}
              >
                Fluxo único
              </span>
            </div>
            <p className={`mt-3 text-sm leading-relaxed ${textSecondary}`}>{modeMeta.description}</p>
            <p className={`mt-5 text-sm ${textMuted}`}>{displayGreeting}</p>

            <ul className={`mt-8 space-y-3 text-sm leading-snug ${textSecondary}`}>
              {bullets.map(line => (
                <li key={line} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" aria-hidden />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Formulário — cartão principal */}
          <div className="lg:col-span-7">
            <div
              className={`overflow-hidden rounded-xl border shadow-sm ${cardBorder} ${cardBg} border-l-[3px] border-l-emerald-600 dark:border-l-emerald-500 dark:shadow-none`}
            >
              <div
                className={`border-b px-5 py-4 ${isDarkMode ? 'border-slate-700/80 bg-slate-900' : 'border-slate-200 bg-slate-50/80'}`}
              >
                <h2 className={`text-xs font-bold uppercase tracking-wider ${textMuted}`}>
                  Dados do alvo
                </h2>
                <p className={`mt-1 text-sm ${textSecondary}`}>
                  Empresa e localização são suficientes para começar.
                </p>
              </div>

              <div className="space-y-4 p-5 md:p-6">
                <div>
                  <label htmlFor="empty-company" className={`mb-1.5 block text-xs font-medium ${textMuted}`}>
                    Nome da empresa <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="empty-company"
                    data-testid="investigation-company-input"
                    value={companyName}
                    onChange={e => {
                      setCompanyName(e.target.value);
                      filledByCnpj.current.companyName = false;
                    }}
                    placeholder="Razão social ou nome fantasia"
                    autoComplete="organization"
                    className={inputClass}
                  />
                </div>

                <div>
                  <span className={`mb-1.5 block text-xs font-medium ${textMuted}`}>CNPJ (opcional)</span>
                  <p
                    className={`mb-2 rounded-md border px-2.5 py-2 text-[11px] leading-relaxed ${
                      isDarkMode
                        ? 'border-amber-700/50 bg-amber-900/25 text-amber-200'
                        : 'border-amber-200 bg-amber-50 text-amber-800'
                    }`}
                  >
                    Sem CNPJ confirmado, a investigação pode ficar incompleta e reduzir a precisão do Score PORTA.
                  </p>

                  {cnpjLocked ? (
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex flex-1 items-center gap-2 rounded-md border px-3 py-2.5 text-sm ${
                          isDarkMode
                            ? 'border-emerald-700/60 bg-emerald-950/30 text-emerald-300'
                            : 'border-emerald-300 bg-emerald-50 text-emerald-800'
                        }`}
                      >
                        <span className="text-emerald-500">✓</span>
                        <span className="font-mono font-semibold">{formatCnpj(cnpjInput)}</span>
                        <span
                          className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                            isDarkMode
                              ? 'bg-emerald-900/60 text-emerald-400'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          Validado
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleUnlockCnpj}
                        className={`shrink-0 rounded-md px-4 py-2.5 text-xs font-semibold transition-colors ${
                          isDarkMode
                            ? 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                        }`}
                      >
                        Alterar
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        data-testid="investigation-cnpj-input"
                        value={formatCnpj(cnpjInput)}
                        onChange={e => setCnpjInput(normalizeCnpj(e.target.value))}
                        onBlur={handleCnpjLookup}
                        placeholder="00.000.000/0000-00"
                        inputMode="numeric"
                        className={`${inputClass} sm:flex-1`}
                      />
                      <button
                        data-testid="investigation-cnpj-validate-button"
                        type="button"
                        onClick={handleCnpjLookup}
                        disabled={!canLookupCnpj}
                        className={`shrink-0 rounded-md px-4 py-2.5 text-xs font-semibold transition-colors ${
                          canLookupCnpj
                            ? 'bg-emerald-700 text-white hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500'
                            : isDarkMode
                              ? 'cursor-not-allowed bg-slate-800 text-slate-500'
                              : 'cursor-not-allowed bg-slate-200 text-slate-500'
                        }`}
                      >
                        {isFetchingCnpj ? 'Buscando…' : 'Validar CNPJ'}
                      </button>
                    </div>
                  )}

                  {!cnpjLocked && !cnpjStatus && (
                    <p className={`mt-1.5 text-[11px] ${textMuted}`}>
                      Digite o CNPJ e clique em Validar — nome, cidade e UF serão preenchidos automaticamente.
                    </p>
                  )}
                  {cnpjStatus && !cnpjLocked && (
                    <p className={`mt-1.5 text-[11px] ${cnpjStatus.startsWith('✓') ? 'text-emerald-600 dark:text-emerald-400' : cnpjStatus.includes('não encontrado') || cnpjStatus.includes('indisponível') ? 'text-amber-600 dark:text-amber-400' : textMuted}`}>
                      {cnpjStatus}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
                  <div className="sm:col-span-4">
                    <label htmlFor="empty-city" className={`mb-1.5 block text-xs font-medium ${textMuted}`}>
                      Cidade <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="empty-city"
                      data-testid="investigation-city-input"
                      value={city}
                      onChange={e => {
                        setCity(e.target.value);
                        filledByCnpj.current.city = false;
                      }}
                      placeholder="Município"
                      autoComplete="address-level2"
                      className={inputClass}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="empty-uf" className={`mb-1.5 block text-xs font-medium ${textMuted}`}>
                      UF <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="empty-uf"
                      data-testid="investigation-uf-input"
                      value={state}
                      onChange={e => {
                        setState(e.target.value.toUpperCase().slice(0, 2));
                        filledByCnpj.current.state = false;
                      }}
                      placeholder="SP"
                      maxLength={2}
                      autoComplete="address-level1"
                      className={inputClass}
                    />
                  </div>
                </div>

                {didSubmit && !isFormValid && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    Preencha empresa, cidade e UF válida para iniciar.
                  </p>
                )}
                {locationStatus && <p className={`text-[11px] ${textMuted}`}>{locationStatus}</p>}

                <button
                  data-testid="investigation-submit-button"
                  type="button"
                  onClick={handleSubmit}
                  className="w-full rounded-md bg-emerald-700 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:focus-visible:ring-offset-slate-950"
                >
                  Iniciar investigação completa
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            RADAR SETORIAL — sempre visível, 4 estados distintos
            ══════════════════════════════════════════════════════════════════ */}
        <section className="mt-12" aria-label="Radar Setorial" data-testid="radar-home-section">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className={`text-xl font-bold tracking-tight ${textPrimary}`}>Radar Setorial</h2>
              <p className={`mt-1 text-sm ${textSecondary}`}>
                {radarConfigured
                  ? 'Sinais vitais e inteligência de mercado em tempo real.'
                  : 'Monitoramento automático de oportunidades e ameaças no Agro.'}
              </p>
            </div>

            {/* Ações do Radar só aparecem quando já está configurado */}
            {radarConfigured && (
              <div className="shrink-0 flex items-center gap-2">
                <button
                  type="button"
                  onClick={onOpenRadar}
                  disabled={!onOpenRadar}
                  className={`rounded-lg border px-4 py-2 text-xs font-semibold transition-colors ${
                    isDarkMode
                      ? 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 disabled:opacity-50'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50'
                  }`}
                >
                  Configurar Radar
                </button>

                <button
                  type="button"
                  onClick={onForceScan ?? onOpenRadar}
                  disabled={radarIsScanning}
                  className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-semibold transition-colors ${
                    isDarkMode
                      ? 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 disabled:opacity-50'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50'
                  }`}
                >
                  <span className={radarIsScanning ? 'animate-spin inline-block' : ''} aria-hidden>↻</span>
                  {radarIsScanning ? 'Varrendo…' : 'Varrer agora'}
                </button>
              </div>
            )}
          </div>

          {/* ── ESTADO 1: Radar não configurado ────────────────────────────── */}
          {!radarConfigured && (
            <div
              className={`flex flex-col items-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
                isDarkMode
                  ? 'border-slate-700/60 bg-slate-900/40'
                  : 'border-slate-200 bg-slate-50/60'
              }`}
            >
              {/* Ícone com ping animado */}
              <div className="relative mb-5 flex h-14 w-14 items-center justify-center" aria-hidden>
                <span className="text-3xl">📡</span>
                <span
                  className={`absolute inset-0 animate-ping rounded-full opacity-20 ${
                    isDarkMode ? 'bg-emerald-500' : 'bg-emerald-400'
                  }`}
                  style={{ animationDuration: '2.5s' }}
                />
              </div>

              <h3 className={`text-base font-bold ${textPrimary}`}>
                Radar Setorial não configurado
              </h3>
              <p className={`mt-2 max-w-xs text-sm leading-relaxed ${textSecondary}`}>
                Configure temas, culturas e regiões de interesse para receber
                inteligência de mercado automaticamente — antes da concorrência.
              </p>

              {/* Bullets de valor do Radar */}
              <ul className={`mt-5 space-y-2 text-left text-xs ${textSecondary}`}>
                {[
                  'Alertas de oportunidade e ameaça em tempo real',
                  'Filtros por cultura, região e tipo de operação',
                  'Sinais integrados ao Dossiê da investigação',
                ].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <span
                      className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
                      aria-hidden
                    />
                    {item}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={onOpenRadar}
                disabled={!onOpenRadar}
                className={`mt-8 inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold transition-colors ${
                  isDarkMode
                    ? 'bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40'
                    : 'bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-40'
                }`}
              >
                <span aria-hidden>⚙️</span>
                Configurar Radar agora
              </button>
            </div>
          )}

          {/* ── ESTADO 2: Radar configurado, varrendo, sem dados ainda ─────── */}
          {radarScanning && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" aria-label="Carregando sinais do radar">
              {[1, 2, 3].map(i => (
                <div
                  key={i}
                  className={`h-48 animate-pulse rounded-xl border ${
                    isDarkMode
                      ? 'border-slate-700/60 bg-slate-900/60'
                      : 'border-slate-200 bg-slate-100/80'
                  }`}
                  aria-hidden
                />
              ))}
            </div>
          )}

          {/* ── ESTADO 3: Radar configurado, varredura concluída, sem sinais ── */}
          {radarEmpty && (
            <div
              className={`rounded-xl border px-6 py-10 text-center ${
                isDarkMode
                  ? 'border-slate-700/60 bg-slate-900/40'
                  : 'border-slate-200 bg-slate-50/60'
              }`}
            >
              <p className={`text-sm font-medium ${textMuted}`}>
                Nenhum sinal relevante detectado no momento.
              </p>
              <p className={`mt-1 text-xs ${textMuted}`}>
                O Radar varre automaticamente. Clique em "Varrer agora" para forçar uma nova leitura.
              </p>
            </div>
          )}

          {/* ── ESTADO 4: Radar com dados — comportamento original ──────────── */}
          {radarHasData && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {radarAlerts.slice(0, 6).map(alert => (
                <RadarCard
                  key={alert.id}
                  alert={alert}
                  isDarkMode={isDarkMode}
                  onOpenRadar={onOpenRadar}
                />
              ))}
            </div>
          )}
        </section>

        <p className={`mt-12 text-center text-[10px] font-semibold uppercase tracking-[0.2em] ${textMuted} opacity-70`}>
          Senior Scout 360 — Inteligência forense
        </p>
      </div>
    </div>
  );
};

export default EmptyStateHome;
