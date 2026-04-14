import { describe, expect, it } from 'vitest';
import { universalExtract } from '../../utils/documentExtractor';

describe('universalExtract', () => {
  it('retorna length consistente com o texto processado', async () => {
    const result = await universalExtract({
      base64Content: Buffer.from('  abcdef  ', 'utf-8').toString('base64'),
      mimeType: 'text/plain',
      limit: 5,
    });

    expect(result).toEqual({
      text: 'abcde',
      length: 5,
    });
  });
});
