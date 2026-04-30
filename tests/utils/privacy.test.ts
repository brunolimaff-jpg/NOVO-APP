import { describe, expect, it } from 'vitest';
import { containsFullCpf, sanitizeSensitivePersonalData } from '../../utils/privacy';

describe('privacy', () => {
  it('mascara CPF completo em texto livre', () => {
    const text = sanitizeSensitivePersonalData('Sócio produtor rural CPF 123.456.789-10 em fonte pública.');

    expect(text).toContain('CPF xxx.xxx.789-xx');
    expect(text).not.toContain('123.456.789-10');
    expect(containsFullCpf(text)).toBe(false);
  });
});
