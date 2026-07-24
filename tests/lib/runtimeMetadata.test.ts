import { describe, expect, it } from 'vitest';
import { resolveRuntimeAppVersion, resolveRuntimeEnvironment } from '../../lib/runtimeMetadata';
describe('runtime metadata', () => {
  it.each([['preview','preview'],['production','production'],['development','development'],['local','development'],['','development']])('%s -> %s', (input, expected) => expect(resolveRuntimeEnvironment(input)).toBe(expected));
  it('usa SHA e fallbacks não vazios', () => {
    expect(resolveRuntimeAppVersion({ buildSha: 'sha' })).toBe('sha');
    expect(resolveRuntimeAppVersion({ buildSha: '', envSha: 'env' })).toBe('env');
    expect(resolveRuntimeAppVersion({ buildSha: '', envSha: '', packageVersion: '1.2.3' })).toBe('1.2.3');
    expect(resolveRuntimeAppVersion({ buildSha: '', envSha: '', packageVersion: '' })).not.toBe('');
  });
});
