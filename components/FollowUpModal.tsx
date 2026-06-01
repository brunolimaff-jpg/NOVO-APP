import React, { useState } from 'react';

export type FollowUpScheduleResult = {
  ok: boolean;
  method?: 'outlook' | 'ics';
  error?: string;
};

interface FollowUpModalProps {
  emailTo: string;
  onEmailToChange: (value: string) => void;
  followUpDias: number;
  onDiasChange: (value: number) => void;
  followUpNotas: string;
  onNotasChange: (value: string) => void;
  followUpStatus: 'idle' | 'sending' | 'sent' | 'error';
  companyName?: string;
  onSchedule: (result: FollowUpScheduleResult) => void;
  onClose: () => void;
}

/* ── Constantes de template ───────────────────────────────── */

const ICS_VCALENDAR_HEADER = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//🦅 Senior Scout 360//FollowUp//PT-BR',
  'CALSCALE:GREGORIAN',
  'METHOD:PUBLISH',
  'BEGIN:VEVENT',
].join('\r\n');

const ICS_VCALENDAR_FOOTER = ['END:VEVENT', 'END:VCALENDAR'].join('\r\n');

const OUTLOOK_URL_BASE =
  'https://outlook.office.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent';

/* ── Helpers de data/escape ───────────────────────────────── */

const formatICSDate = (date: Date): string =>
  date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');

const escapeICSText = (text: string): string =>
  text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

const buildFollowUpDescription = (targetName: string, notas: string, emailTo: string): string => {
  const notesLine = notas.trim() ? `Notas: ${notas.trim()}` : 'Sem notas adicionais.';
  return [
    `Lembrete de follow-up para ${targetName}.`,
    notesLine,
    emailTo.trim() ? `Email de lembrete: ${emailTo.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');
};

const buildEventWindow = (daysAhead: number) => {
  const start = new Date();
  start.setDate(start.getDate() + daysAhead);
  start.setMinutes(0, 0, 0);
  if (start.getHours() < 8 || start.getHours() > 18) {
    start.setHours(9, 0, 0, 0);
  }

  const end = new Date(start.getTime() + 30 * 60 * 1000);
  return { start, end };
};

export const FollowUpModal: React.FC<FollowUpModalProps> = ({
  emailTo,
  onEmailToChange,
  followUpDias,
  onDiasChange,
  followUpNotas,
  onNotasChange,
  followUpStatus,
  companyName,
  onSchedule,
  onClose,
}) => {
  const [lastMethod, setLastMethod] = useState<'outlook' | 'ics' | null>(null);
  const rawTargetName = (companyName || '').trim() || 'Conta em prospecção';
  const targetName = rawTargetName.length > 80 ? `${rawTargetName.slice(0, 77)}...` : rawTargetName;
  const { start, end } = buildEventWindow(followUpDias);
  const subject = `Follow-up 🦅 Senior Scout 360 | ${targetName}`;
  const description = buildFollowUpDescription(targetName, followUpNotas, emailTo);

  const handleDownloadInvite = (): boolean => {
    try {
      const icsContent = [
        ICS_VCALENDAR_HEADER,
        `UID:${Date.now()}@seniorscout360.local`,
        `DTSTAMP:${formatICSDate(new Date())}`,
        `DTSTART:${formatICSDate(start)}`,
        `DTEND:${formatICSDate(end)}`,
        `SUMMARY:${escapeICSText(subject)}`,
        `DESCRIPTION:${escapeICSText(description)}`,
        'LOCATION:Outlook',
        ICS_VCALENDAR_FOOTER,
      ].join('\r\n');

      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `follow_up_${targetName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.ics`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return true;
    } catch (err) {
      console.warn('FollowUpModal: erro ao gerar/download arquivo .ics', err);
      return false;
    }
  };

  const handleOpenOutlook = (): boolean => {
    const outlookUrl = `${OUTLOOK_URL_BASE}&subject=${encodeURIComponent(subject)}&startdt=${encodeURIComponent(start.toISOString())}&enddt=${encodeURIComponent(end.toISOString())}&body=${encodeURIComponent(description)}`;
    const popup = window.open(outlookUrl, '_blank', 'noopener,noreferrer');
    return !!popup;
  };

  const handleSchedulePrimary = () => {
    setLastMethod(null);
    if (handleOpenOutlook()) {
      setLastMethod('outlook');
      onSchedule({ ok: true, method: 'outlook' });
      return;
    }
    if (handleDownloadInvite()) {
      setLastMethod('ics');
      onSchedule({ ok: true, method: 'ics' });
      return;
    }
    onSchedule({
      ok: false,
      error: 'Não foi possível abrir o Outlook nem gerar o convite .ics.',
    });
  };

  const handleDownloadClick = () => {
    setLastMethod(null);
    if (handleDownloadInvite()) {
      setLastMethod('ics');
      onSchedule({ ok: true, method: 'ics' });
      return;
    }
    onSchedule({ ok: false, error: 'Falha ao gerar o arquivo .ics.' });
  };

  const handleOutlookClick = () => {
    setLastMethod(null);
    if (handleOpenOutlook()) {
      setLastMethod('outlook');
      onSchedule({ ok: true, method: 'outlook' });
      return;
    }
    onSchedule({ ok: false, error: 'O navegador bloqueou a abertura do Outlook.' });
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 px-4 pointer-events-none">
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-md w-full shadow-xl pointer-events-auto">
          <h3 className="text-lg font-bold text-white mb-4">📅 Agendar Follow-up</h3>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[3, 7, 15, 30].map(d => (
              <button
                key={d}
                onClick={() => onDiasChange(d)}
                className={`p-3 rounded-xl border text-center transition-all ${
                  followUpDias === d
                    ? 'border-emerald-500 bg-emerald-500/10 text-white'
                    : 'border-gray-700/30 bg-gray-800/50 text-gray-400'
                }`}
              >
                <p className="text-lg font-bold">{d}</p>
                <p className="text-xs">dias</p>
              </button>
            ))}
          </div>
          <input
            type="email"
            value={emailTo}
            onChange={e => onEmailToChange(e.target.value)}
            placeholder="Seu email para lembrete"
            className="w-full px-3 py-2.5 rounded-lg bg-gray-900 border border-gray-700/50 text-white text-sm mb-3 focus:outline-none focus:border-emerald-500"
          />
          <input
            type="text"
            value={followUpNotas}
            onChange={e => onNotasChange(e.target.value)}
            placeholder="Notas (opcional)"
            className="w-full px-3 py-2.5 rounded-lg bg-gray-900 border border-gray-700/50 text-white text-sm mb-3 focus:outline-none focus:border-emerald-500"
          />
          <p className="text-[11px] text-gray-400 mb-4">
            Convite sugerido para <span className="text-emerald-400 font-semibold">{targetName}</span> em{' '}
            <span className="text-white">{start.toLocaleDateString('pt-BR')}</span>.
          </p>
          {followUpStatus === 'sent' && (
            <div className="text-sm mb-4 p-2 rounded-lg text-emerald-400 bg-emerald-500/10">
              ✅ {lastMethod === 'outlook' ? 'Follow-up aberto no Outlook.' : 'Convite .ics gerado com sucesso.'}
            </div>
          )}
          {followUpStatus === 'error' && (
            <div className="text-sm mb-4 p-2 rounded-lg text-red-400 bg-red-500/10">
              ❌ Não foi possível preparar o follow-up localmente.
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              onClick={handleDownloadClick}
              className="px-3 py-2 rounded-lg border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 text-xs font-medium"
            >
              ⬇️ Baixar convite (.ics)
            </button>
            <button
              onClick={handleOutlookClick}
              className="px-3 py-2 rounded-lg border border-blue-500/40 text-blue-300 hover:bg-blue-500/10 text-xs font-medium"
            >
              📆 Abrir no Outlook
            </button>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={handleSchedulePrimary}
              disabled={followUpStatus === 'sending'}
              className="flex-1 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-600 text-white text-sm"
            >
              {followUpStatus === 'sending' ? 'Agendando...' : `Agendar (${followUpDias}d)`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
