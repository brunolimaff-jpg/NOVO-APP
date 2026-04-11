import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFeatureAccessForUser, isAdminUser } from '../../utils/featureAccess';

describe('featureAccess', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('recognizes admin by first name', () => {
    expect(isAdminUser({ displayName: 'Admin Lima', email: 'outro@empresa.com', id: '' })).toBe(true);
  });

  it('recognizes admin by email prefix', () => {
    expect(isAdminUser({ displayName: 'Usuário', email: 'admin@empresa.com', id: '' })).toBe(true);
  });

  it('keeps Deep Dive disabled by default when env flag is not set', () => {
    vi.stubEnv('VITE_ENABLE_DEEP_DIVE', '');
    const access = getFeatureAccessForUser({ displayName: 'Maria', email: 'maria@empresa.com', id: '' });
    expect(access).toEqual({
      miniCRM: true,
      dashboard: true,
      integrityCheck: true,
      clientLookup: true,
      deepDive: false,
      warRoom: true,
    });
  });

  it('enables Deep Dive when VITE_ENABLE_DEEP_DIVE=true', () => {
    vi.stubEnv('VITE_ENABLE_DEEP_DIVE', 'true');
    const access = getFeatureAccessForUser({ displayName: 'Admin', email: 'admin@empresa.com', id: '' });
    expect(access).toEqual({
      miniCRM: true,
      dashboard: true,
      integrityCheck: true,
      clientLookup: true,
      deepDive: true,
      warRoom: true,
    });
  });

  it('matches MVP lookup access cases from requirements', () => {
    expect(
      getFeatureAccessForUser({
        displayName: 'Admin Lima',
        email: 'adminlff@hotmail.com',
        id: '',
      }).clientLookup,
    ).toBe(true);

    expect(
      getFeatureAccessForUser({
        displayName: 'João Silva',
        email: 'joao@senior.com.br',
        id: '',
      }).clientLookup,
    ).toBe(true);

    expect(getFeatureAccessForUser(null).clientLookup).toBe(true);
  });

  it('keeps Deep Dive off for guest-like users when env flag is disabled', () => {
    vi.stubEnv('VITE_ENABLE_DEEP_DIVE', 'false');
    const access = getFeatureAccessForUser({
      displayName: 'Visitante',
      email: '',
      id: 'guest',
    });
    expect(access).toEqual({
      miniCRM: true,
      dashboard: true,
      integrityCheck: true,
      clientLookup: true,
      deepDive: false,
      warRoom: true,
    });
  });
});
