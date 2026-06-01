const CPF_PATTERN = /\b(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})\b/g;

export function maskCpf(value: string): string {
  return value.replace(CPF_PATTERN, 'CPF xxx.xxx.$3-xx');
}

export function sanitizeSensitivePersonalData(value: string): string {
  if (!value) return '';
  return maskCpf(value);
}

export function containsFullCpf(value: string): boolean {
  CPF_PATTERN.lastIndex = 0;
  return CPF_PATTERN.test(value);
}

const SCRIPT_TAG = /<script[\s\S]*?<\/script>/gi;
const EVENT_HANDLER = /\s(on\w+)\s*=\s*["'][^"']*["']/gi;
const DANGEROUS_TAGS = /<\/?(?:iframe|object|embed)\s[^>]*>/gi;
const JS_PROTOCOL = /\s(?:href|xlink:href)\s*=\s*["']\s*javascript\s*:/gi;

/**
 * Remove tags e atributos perigosos de uma string HTML/SVG antes de
 * renderizar com dangerouslySetInnerHTML.
 */
export function sanitizeSvgHtml(html: string): string {
  return html.replace(SCRIPT_TAG, '').replace(EVENT_HANDLER, '').replace(DANGEROUS_TAGS, '').replace(JS_PROTOCOL, '');
}
