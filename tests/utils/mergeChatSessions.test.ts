import { describe, expect, it } from 'vitest';
import { Sender } from '../../types';
import type { ChatSession } from '../../types';
import { mergeChatSessions } from '../../utils/mergeChatSessions';

function makeSession(overrides: Partial<ChatSession> & Pick<ChatSession, 'id'>): ChatSession {
  return {
    id: overrides.id,
    title: overrides.title ?? 'Nova Investigação',
    empresaAlvo: overrides.empresaAlvo ?? null,
    cnpj: overrides.cnpj ?? null,
    modoPrincipal: overrides.modoPrincipal ?? null,
    scoreOportunidade: overrides.scoreOportunidade ?? null,
    resumoDossie: overrides.resumoDossie ?? null,
    createdAt: overrides.createdAt ?? '2026-05-26T10:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-05-26T10:00:00.000Z',
    messages: overrides.messages ?? [],
  };
}

describe('mergeChatSessions', () => {
  it('mantém messages locais quando remoto vem vazio', () => {
    const local = makeSession({
      id: 's1',
      empresaAlvo: 'Scheffer',
      updatedAt: '2026-05-26T12:00:00.000Z',
      messages: [
        {
          id: 'm1',
          sender: Sender.Bot,
          text: 'Dossiê completo com teia societária',
          timestamp: new Date(),
        },
      ],
    });
    const remote = makeSession({
      id: 's1',
      empresaAlvo: 'Scheffer',
      updatedAt: '2026-05-26T12:30:00.000Z',
      messages: [],
    });

    const merged = mergeChatSessions([local], [remote]);
    expect(merged).toHaveLength(1);
    expect(merged[0].messages).toHaveLength(1);
    expect(merged[0].messages[0].text).toContain('Dossiê');
  });

  it('usa messages remotas quando local está vazio e remoto tem conteúdo', () => {
    const local = makeSession({
      id: 's1',
      updatedAt: '2026-05-26T12:30:00.000Z',
      messages: [],
    });
    const remote = makeSession({
      id: 's1',
      updatedAt: '2026-05-26T12:00:00.000Z',
      messages: [
        {
          id: 'm1',
          sender: Sender.Bot,
          text: 'Conteúdo vindo da nuvem',
          timestamp: new Date(),
        },
      ],
    });

    const merged = mergeChatSessions([local], [remote]);
    expect(merged[0].messages[0].text).toBe('Conteúdo vindo da nuvem');
  });

  it('prefere o array de messages com mais caracteres quando ambos têm conteúdo', () => {
    const local = makeSession({
      id: 's1',
      messages: [{ id: 'l', sender: Sender.Bot, text: 'A'.repeat(100), timestamp: new Date() }],
    });
    const remote = makeSession({
      id: 's1',
      messages: [{ id: 'r', sender: Sender.Bot, text: 'B'.repeat(50), timestamp: new Date() }],
    });

    const merged = mergeChatSessions([local], [remote]);
    expect(merged[0].messages[0].id).toBe('l');
  });

  it('preserva sessões que existem só localmente', () => {
    const onlyLocal = makeSession({ id: 'local-only', title: 'Local' });
    const merged = mergeChatSessions([onlyLocal], []);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('local-only');
  });

  it('prefere createdAt remoto válido quando local é inválido', () => {
    const local = makeSession({
      id: 's1',
      createdAt: '',
      updatedAt: '2026-05-26T12:00:00.000Z',
      messages: [{ id: 'm1', sender: Sender.Bot, text: 'Dossiê local', timestamp: new Date() }],
    });
    const remote = makeSession({
      id: 's1',
      createdAt: '2026-05-20T08:00:00.000Z',
      updatedAt: '2026-05-26T11:00:00.000Z',
      messages: [],
    });

    const merged = mergeChatSessions([local], [remote]);
    expect(merged[0].createdAt).toBe('2026-05-20T08:00:00.000Z');
    expect(merged[0].messages).toHaveLength(1);
  });
});
