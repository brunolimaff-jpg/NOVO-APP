import React, { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ChatMode, MODE_LABELS } from '../constants';
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
}

const VALID_UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

const BULLETS: Record<ChatMode, string[]> = {
  operacao: [
    'Dossiê integrado com síntese objetiva e rastreio de fontes.',
    'CNPJ opcional com validação na BrasilAPI e localização conferida no IBGE.',
    'Fluxo pronto para continuar no chat, exportar e enviar ao CRM.',
  ],
  diretoria: [
    'Enquadramento estratégico da conta e leitura de risco/oportunidade.',
    'Base para decisão: contexto, stakeholders e próximos passos sugeridos.',
    'Compatível com aprofundamento em Modo Operação após o cadastro.',
  ],
};

const EmptyStateHome: React.FC<EmptyStateHomeProps> = ({ mode, onStartInvestigation, isDarkMode }) => {
  const { user } = useAuth();
  const userName = user?.displayName;

  const [randomGreeting] = useState(() => {
    const greetings = [
      'Qual empresa ou grupo econômico vamos mapear agora?',
      'Informe o alvo para montar o contexto inicial da investigação.',
      'Comece pelo cadastro mínimo; o restante segue no fluxo assistido.',
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  });

  const displayGreeting =
    userName && userName !== 'Sair' && userName.trim().length > 0
      ? mode === 'operacao'
        ? `Olá, ${userName}. Vamos iniciar uma nova investigação.`
        : `Olá, ${userName}. Selecione a conta para análise executiva.`
      : randomGreeting;

  const modeMeta = MODE_LABELS[mode];
  const bullets = BULLETS[mode];

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
    setCnpjStatus('Consultando CNPJ na BrasilAPI...');
    try {
      const data = await fetchCompanyByCnpj(cnpjDigits);
      setLastLookupCnpj(data.cnpj);
      setCompanyName(prev => prev.trim() || data.companyName);
      setCity(prev => prev.trim() || data.city);
      setState(prev => (prev.trim() || data.state).toUpperCase());
      setCnpjStatus('CNPJ validado e dados preenchidos.');
      setCnpjLocked(true);
    } catch {
      setCnpjStatus('Não foi possível preencher via CNPJ. Complete manualmente.');
      setCnpjLocked(false);
    } finally {
      setIsFetchingCnpj(false);
    }
  };

  const handleUnlockCnpj = () => {
    setCnpjLocked(false);
    setLastLookupCnpj(null);
    setCnpjStatus(null);
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
                {mode === 'operacao' ? 'Campo' : 'Estratégia'}
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
                  Cadastro inicial da conta
                </h2>
                <p className={`mt-1 text-sm ${textSecondary}`}>
                  Preencha empresa, CNPJ (opcional), cidade e UF para iniciar o mapeamento.
                </p>
              </div>

              <div className="space-y-4 p-5 md:p-6">
                <div>
                  <label htmlFor="empty-company" className={`mb-1.5 block text-xs font-medium ${textMuted}`}>
                    Nome da empresa <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="empty-company"
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder="Razão social ou nome fantasia"
                    autoComplete="organization"
                    className={inputClass}
                  />
                </div>

                <div>
                  <span className={`mb-1.5 block text-xs font-medium ${textMuted}`}>CNPJ (opcional)</span>

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
                        value={formatCnpj(cnpjInput)}
                        onChange={e => setCnpjInput(normalizeCnpj(e.target.value))}
                        onBlur={handleCnpjLookup}
                        placeholder="00.000.000/0000-00"
                        inputMode="numeric"
                        className={`${inputClass} sm:flex-1`}
                      />
                      <button
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

                  {cnpjStatus && !cnpjLocked && (
                    <p className={`mt-1.5 text-[11px] ${textMuted}`}>{cnpjStatus}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
                  <div className="sm:col-span-4">
                    <label htmlFor="empty-city" className={`mb-1.5 block text-xs font-medium ${textMuted}`}>
                      Cidade <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="empty-city"
                      value={city}
                      onChange={e => setCity(e.target.value)}
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
                      value={state}
                      onChange={e => setState(e.target.value.toUpperCase().slice(0, 2))}
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

        <p className={`mt-12 text-center text-[10px] font-semibold uppercase tracking-[0.2em] ${textMuted} opacity-70`}>
          Senior Scout 360 — Inteligência forense
        </p>
      </div>
    </div>
  );
};

export default EmptyStateHome;
