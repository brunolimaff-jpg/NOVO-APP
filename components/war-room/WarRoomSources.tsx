import { normalizeSourceUrl, type AuditableSource } from '../../utils/textCleaners';
import type { WarRoomTheme } from './theme';
import type { LinkStatusMap } from './types';

interface WarRoomSourcesProps {
  isDarkMode: boolean;
  linkStatuses: LinkStatusMap;
  sources: AuditableSource[];
  t: WarRoomTheme;
}

export function WarRoomSources({ isDarkMode, linkStatuses, sources, t }: WarRoomSourcesProps) {
  const dk = isDarkMode;

  return (
    <div className={`mt-3 pt-3 border-t ${t.srcBdr}`}>
      <p className={`text-[9px] uppercase tracking-wider font-bold mb-1.5 ${t.srcLabel}`}>Fontes</p>
      <ul className="space-y-1.5">
        {sources.map((s, i) => {
          const status = s.url ? linkStatuses[s.url] || linkStatuses[normalizeSourceUrl(s.url)] : undefined;
          const statusLabel = !s.url
            ? 'ANÁLISE INFERIDA'
            : status?.status === 'valid'
              ? 'CONFIRMADO'
              : status?.status === 'broken'
                ? (status.note || 'OFF-LINE').toUpperCase()
                : 'AUDITORIA EM CURSO';
          const context =
            s.contexts[0] ||
            (s.url
              ? 'Referência usada para sustentar parte da resposta.'
              : 'Menção inferida sem URL explícita; valide manualmente.');

          return (
            <li key={s.key || s.url || `${s.title}-${i}`} className="text-[10px]">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold opacity-80">
                  {s.citationIndex ? `[${s.citationIndex}]` : '[inferida]'}
                </span>
                {s.url ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${t.srcTxt} hover:underline break-all`}
                  >
                    {s.title || s.url}
                  </a>
                ) : (
                  <span className={dk ? 'text-slate-300' : 'text-slate-700'}>{s.title}</span>
                )}
                <span
                  className={`px-1.5 py-0.5 rounded-full ${
                    statusLabel.includes('CONFIRMADO')
                      ? dk
                        ? 'bg-emerald-900/50 text-emerald-300 font-bold'
                        : 'bg-emerald-100 text-emerald-700 font-bold'
                      : statusLabel.includes('OFF-LINE')
                        ? dk
                          ? 'bg-red-900/40 text-red-300'
                          : 'bg-red-100 text-red-700'
                        : dk
                          ? 'bg-amber-900/40 text-amber-300'
                          : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {statusLabel}
                </span>
              </div>
              <p className={`mt-0.5 ${dk ? 'text-slate-400' : 'text-slate-500'}`}>{context}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
