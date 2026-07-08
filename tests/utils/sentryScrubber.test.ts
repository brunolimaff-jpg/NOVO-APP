import { describe, expect, it } from 'vitest';
import { scrubSensitiveText, scrubSentryEvent } from '../../utils/sentryScrubber';

describe('sentryScrubber', () => {
  it('redige CPF, CNPJ e email em strings', () => {
    const scrubbed = scrubSensitiveText(
      'Contato maria.silva@example.com, CPF 123.456.789-00, CNPJ 09.567.366/0001-11.',
    );

    expect(scrubbed).not.toContain('maria.silva@example.com');
    expect(scrubbed).not.toContain('123.456.789-00');
    expect(scrubbed).not.toContain('09.567.366/0001-11');
    expect(scrubbed).toContain('[email-redacted]');
    expect(scrubbed).toContain('[cpf-redacted]');
    expect(scrubbed).toContain('[cnpj-redacted]');
  });

  it('redige dados sensiveis em eventos aninhados do Sentry', () => {
    const event = {
      message: 'Falha no CNPJ 09567366000111 para contato bruno@example.com',
      user: {
        email: 'bruno@example.com',
      },
      extra: {
        cpf: '12345678900',
        payload: {
          note: 'Cliente informou 09.567.366/0001-11 no dossie.',
        },
      },
    };

    const scrubbed = scrubSentryEvent(event);

    expect(JSON.stringify(scrubbed)).not.toContain('bruno@example.com');
    expect(JSON.stringify(scrubbed)).not.toContain('12345678900');
    expect(JSON.stringify(scrubbed)).not.toContain('09567366000111');
    expect(JSON.stringify(scrubbed)).not.toContain('09.567.366/0001-11');
    expect(scrubbed.user.email).toBe('[field-redacted]');
    expect(scrubbed.extra.cpf).toBe('[field-redacted]');
  });

  it('preserva mensagem e stack de Error enquanto redige dados sensiveis', () => {
    const error = new Error('Falha para bruno@example.com no CNPJ 09.567.366/0001-11');
    error.stack = 'Error: contato bruno@example.com\n    at test';

    const scrubbed = scrubSentryEvent({ extra: { error } });

    expect(scrubbed.extra.error).toMatchObject({
      name: 'Error',
      message: 'Falha para [email-redacted] no CNPJ [cnpj-redacted]',
      stack: 'Error: contato [email-redacted]\n    at test',
    });
  });
});
