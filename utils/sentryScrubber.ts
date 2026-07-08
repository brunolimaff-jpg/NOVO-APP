const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const CNPJ_REGEX = /\b(?:\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/g;
const CPF_REGEX = /\b(?:\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/g;
const REDACTED_EMAIL = '[email-redacted]';
const REDACTED_CNPJ = '[cnpj-redacted]';
const REDACTED_CPF = '[cpf-redacted]';
const REDACTED_FIELD = '[field-redacted]';

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.includes('email') || lower.includes('cnpj') || lower.includes('cpf');
}

export function scrubSensitiveText(value: string): string {
  return value
    .replace(EMAIL_REGEX, REDACTED_EMAIL)
    .replace(CNPJ_REGEX, REDACTED_CNPJ)
    .replace(CPF_REGEX, REDACTED_CPF);
}

function scrubValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return scrubSensitiveText(value);
  if (typeof value !== 'object' || value === null) return value;
  if (seen.has(value)) return '[circular]';

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map(item => scrubValue(item, seen));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      isSensitiveKey(key) ? REDACTED_FIELD : scrubValue(entry, seen),
    ]),
  );
}

export function scrubSentryEvent<TEvent>(event: TEvent): TEvent {
  return scrubValue(event, new WeakSet()) as TEvent;
}
