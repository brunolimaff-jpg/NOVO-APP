import { stripPortaMarkers } from '../../utils/porta';
import { stripInternalMarkers } from '../../utils/textCleaners';

const BENCHMARK_HISTORY_STRIP_REGEX =
  /## 🏷️ CLIENTES SIMILARES PARA REFERÊNCIA[\s\S]*?(?=\n##|\n\[|$)/g;

const BENCHMARK_NAME_BLOCKLIST =
  /^(empresa|empresas|companhia|cia|cliente|clientes|alvo|investigada|unknown|undefined|null|empresa\s+n[aã]o\s+identificada|a\s+empresa|nova\s+investiga[cç][aã]o)$/i;

export function sanitizeStreamText(text: string): string {
  return stripInternalMarkers(stripPortaMarkers(text));
}

export function sanitizeHistoryText(text: string): string {
  return sanitizeStreamText(text)
    .replace(BENCHMARK_HISTORY_STRIP_REGEX, '')
    .trim();
}

export function isValidEmpresaParaBenchmark(name: string | null): boolean {
  if (!name || name.trim().length < 3) return false;
  return !BENCHMARK_NAME_BLOCKLIST.test(name.trim());
}
