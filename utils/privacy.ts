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
