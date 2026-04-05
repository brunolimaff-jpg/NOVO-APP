import { describe, expect, it } from 'vitest';
import { getFeatureAccessForUser, isAdminUser } from '../../utils/featureAccess';

describe('featureAccess', () => {
  it('recognizes admin by first name', () => {
    expect(isAdminUser({ displayName: 'Admin Lima', email: 'outro@empresa.com', id: '' })).toBe(true);
  });

  it('recognizes admin by email prefix', () => {
    expect(isAdminUser({ displayName: 'Usuário', email: 'admin@empresa.com', id: '' })).toBe(true);
  });

  it('grants full access when MVP_LOCK_RESTRICTED_FEATURES is off', () => {
    const access = getFeatureAccessForUser({ displayName: 'Maria', email: 'maria@empresa.com', id: '' });
    expect(access).toEqual({
      miniCRM: true,
      dashboard: true,
      integrityCheck: true,
      clientLookup: true,
      deepDive: true,
      warRoom: true,
    });
  });

  it('unlocks restricted features for admin users', () => {
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

  it('grants full access for guest-like users when MVP_LOCK_RESTRICTED_FEATURES is off', () => {
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
      deepDive: true,
      warRoom: true,
    });
  });
});
