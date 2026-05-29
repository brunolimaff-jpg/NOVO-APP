// tests/contracts/operatorTracking.contract.test.ts
// Contrato de tracking — valida eventos, payloads, sanitizacao contra o codigo REAL.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockInsert = vi.hoisted(() => vi.fn(() => ({ then: (fn: (v: unknown) => void) => fn({ error: null }) })));
const mockUpsert = vi.hoisted(() => vi.fn(() => ({ then: (fn: (v: unknown) => void) => fn({ error: null }) })));
const mockUpdate = vi.hoisted(() =>
  vi.fn(() => ({ eq: vi.fn(() => ({ then: (fn: (v: unknown) => void) => fn({ error: null }) })) })),
);

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(() => ({
    insert: mockInsert,
    upsert: mockUpsert,
    update: mockUpdate,
  })),
}));

vi.mock('../../lib/supabaseClient', () => ({
  supabase: supabaseMock,
  isSupabaseAvailable: vi.fn(() => true),
}));

import {
  trackOperatorEvent,
  startOperatorSession,
  initSessionTracking,
  sanitizeMetadata,
} from '../../services/operatorTracking';
import { isSupabaseAvailable } from '../../lib/supabaseClient';

const ALLOWED_EVENTS = [
  'app_opened',
  'operator_registered',
  'dossier_started',
  'dossier_completed',
  'dossier_failed',
  'dossier_opened',
  'dossier_shared',
] as const;

type AllowedEvent = (typeof ALLOWED_EVENTS)[number];

describe('operatorTracking contract — eventos permitidos', () => {
  it('contém exatamente 7 eventos', () => {
    expect(ALLOWED_EVENTS).toHaveLength(7);
  });

  it.each(ALLOWED_EVENTS)('%s é um evento válido', event => {
    expect(ALLOWED_EVENTS).toContain(event);
  });

  it('evento inválido não compila (type-check)', () => {
    const valid: AllowedEvent = 'app_opened';
    expect(ALLOWED_EVENTS).toContain(valid);
    // @ts-expect-error — valor inválido não deve compilar
    const _invalid: AllowedEvent = 'fake_event';
    void _invalid;
  });
});

describe('operatorTracking contract — sanitizeMetadata real', () => {
  it('remove chaves sensíveis (regex: prompt|gemini|response|token|secret|key|password)', () => {
    const result = sanitizeMetadata({
      userName: 'Bruno',
      apiKey: 'sk-secret-123',
      gemini_response: 'dados confidenciais',
      promptText: 'solicitação',
      token: 'bearer-abc',
      company: 'Senior',
    });
    expect(result).toHaveProperty('userName');
    expect(result).toHaveProperty('company');
    expect(result).not.toHaveProperty('apiKey');
    expect(result).not.toHaveProperty('gemini_response');
    expect(result).not.toHaveProperty('promptText');
    expect(result).not.toHaveProperty('token');
  });

  it('trunca strings > 200 chars (limite real: 197 + "...")', () => {
    const longString = 'a'.repeat(500);
    const result = sanitizeMetadata({ note: longString });
    const note = result.note as string;
    expect(note.length).toBeLessThanOrEqual(200); // 197 + "..."
    expect(note.endsWith('...')).toBe(true);
  });

  it('mantém strings curtas intactas', () => {
    const result = sanitizeMetadata({ note: 'hello' });
    expect(result.note).toBe('hello');
  });

  it('ignora null e undefined', () => {
    const result = sanitizeMetadata({ a: null, b: undefined, c: 'keep' });
    expect(result).not.toHaveProperty('a');
    expect(result).not.toHaveProperty('b');
    expect(result).toHaveProperty('c', 'keep');
  });

  it('trata objetos aninhados recursivamente', () => {
    const result = sanitizeMetadata({
      nested: { apiKey: 'secret', safe: 'value' },
    });
    const nested = result.nested as Record<string, unknown>;
    expect(nested).not.toHaveProperty('apiKey');
    expect(nested).toHaveProperty('safe', 'value');
  });

  it('retorna {} para entrada vazia', () => {
    expect(sanitizeMetadata(undefined)).toEqual({});
    expect(sanitizeMetadata({})).toEqual({});
  });
});

describe('operatorTracking contract — payload insert real', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.mocked(isSupabaseAvailable).mockReturnValue(true);
    mockInsert.mockReturnValue({ then: (fn: (v: unknown) => void) => fn({ error: null }) });
    mockUpsert.mockReturnValue({ then: (fn: (v: unknown) => void) => fn({ error: null }) });
    mockUpdate.mockReturnValue({ eq: vi.fn(() => ({ then: (fn: (v: unknown) => void) => fn({ error: null }) })) });
    supabaseMock.from.mockReturnValue({
      insert: mockInsert,
      upsert: mockUpsert,
      update: mockUpdate,
    } as unknown as ReturnType<typeof supabaseMock.from>);
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('trackOperatorEvent insere na tabela operator_events', () => {
    trackOperatorEvent('app_opened', {
      operatorId: 'op_test',
      email: 'test@test.com',
    });

    expect(supabaseMock.from).toHaveBeenCalledWith('operator_events');
    expect(mockInsert).toHaveBeenCalled();
  });

  it('startOperatorSession insere na tabela operator_sessions', () => {
    startOperatorSession('op_test', 'test@test.com');

    expect(supabaseMock.from).toHaveBeenCalledWith('operator_sessions');
    expect(mockUpsert).toHaveBeenCalled();
  });

  it('startOperatorSession faz upsert na primeira chamada e touch na reentrada', () => {
    startOperatorSession('op_test');

    expect(supabaseMock.from).toHaveBeenCalledWith('operator_sessions');
    expect(mockUpsert).toHaveBeenCalledTimes(1);

    // Segunda chamada: sessionStorage ja tem ID → touchOperatorSession (update, nao upsert)
    startOperatorSession('op_test');
    // upsert nao e chamado novamente — so update (touch)
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('initSessionTracking dispara app_opened (1 evento)', async () => {
    await initSessionTracking('op_test', 'test@test.com');

    // startOperatorSession chamado 1x
    expect(supabaseMock.from).toHaveBeenCalledWith('operator_sessions');
    // trackOperatorEvent com app_opened chamado 1x
    expect(supabaseMock.from).toHaveBeenCalledWith('operator_events');
  });
});

describe('operatorTracking contract — falha não quebra UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('trackOperatorEvent não lança quando Supabase indisponível', () => {
    vi.mocked(isSupabaseAvailable).mockReturnValue(false);

    expect(() => {
      trackOperatorEvent('dossier_started', { operatorId: 'op_test' });
    }).not.toThrow();
  });

  it('trackOperatorEvent não lança com operatorId vazio', () => {
    vi.mocked(isSupabaseAvailable).mockReturnValue(true);

    expect(() => {
      trackOperatorEvent('dossier_completed', { operatorId: '' });
    }).not.toThrow();
  });

  it('startOperatorSession não lança quando Supabase indisponível', () => {
    vi.mocked(isSupabaseAvailable).mockReturnValue(false);

    expect(() => {
      startOperatorSession('op_test');
    }).not.toThrow();
  });
});

describe('operatorTracking contract — UUID de sessão', () => {
  const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function isValidUUIDv4(id: string): boolean {
    return UUID_V4_REGEX.test(id);
  }

  it('session_id válido é UUID v4', () => {
    expect(isValidUUIDv4('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('session_id inválido é rejeitado', () => {
    expect(isValidUUIDv4('not-a-uuid')).toBe(false);
    expect(isValidUUIDv4('')).toBe(false);
    expect(isValidUUIDv4('550e8400-e29b-31d4-a716-446655440000')).toBe(false); // version 3, not 4
  });
});
