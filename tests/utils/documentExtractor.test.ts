import { afterEach, describe, expect, it, vi } from 'vitest';
import { universalExtract, isValidPublicUrl, extractHtml, searchCnpjAbertoCompanies } from '../../utils/documentExtractor';

describe('isValidPublicUrl', () => {
  it('aceita URLs publicas validas com https', () => {
    expect(isValidPublicUrl('https://example.com')).toBe(true);
    expect(isValidPublicUrl('https://www.gov.br/empresas')).toBe(true);
    expect(isValidPublicUrl('http://example.com')).toBe(true);
  });

  it('rejeita URLs com protocolo invalido', () => {
    expect(isValidPublicUrl('ftp://example.com')).toBe(false);
    expect(isValidPublicUrl('file:///etc/passwd')).toBe(false);
    expect(isValidPublicUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejeita localhost e IPs locais', () => {
    expect(isValidPublicUrl('http://localhost')).toBe(false);
    expect(isValidPublicUrl('http://localhost:3000')).toBe(false);
    expect(isValidPublicUrl('http://127.0.0.1')).toBe(false);
    expect(isValidPublicUrl('http://[::1]')).toBe(false);
  });

  it('rejeita ranges de IP privados', () => {
    expect(isValidPublicUrl('http://10.0.0.1')).toBe(false);
    expect(isValidPublicUrl('http://192.168.1.1')).toBe(false);
    expect(isValidPublicUrl('http://172.16.0.1')).toBe(false);
    expect(isValidPublicUrl('http://172.31.255.255')).toBe(false);
  });

  it('rejeita ranges de link-local', () => {
    expect(isValidPublicUrl('http://169.254.1.1')).toBe(false);
  });

  it('rejeita dominios .local e .internal', () => {
    expect(isValidPublicUrl('http://app.local')).toBe(false);
    expect(isValidPublicUrl('http://service.internal')).toBe(false);
  });

  it('rejeita strings que nao sao URLs validas', () => {
    expect(isValidPublicUrl('not-a-url')).toBe(false);
    expect(isValidPublicUrl('')).toBe(false);
  });
});

describe('extractHtml', () => {
  it('extrai texto limpo de HTML simples', async () => {
    const result = await extractHtml('<html><body><p>Hello World</p></body></html>');
    expect(result).toBe('Hello World');
  });

  it('remove tags indesejadas (script, style, nav, footer, iframe, noscript)', async () => {
    const html = `
      <html>
        <body>
          <script>alert('xss')</script>
          <style>.cls{color:red}</style>
          <nav>Menu</nav>
          <footer>Rodape</footer>
          <iframe src="ads.html"></iframe>
          <noscript>JS off</noscript>
          <p>Conteudo real</p>
        </body>
      </html>
    `;
    const result = await extractHtml(html);
    expect(result).toContain('Conteudo real');
    expect(result).not.toContain('alert');
    expect(result).not.toContain('color:red');
    expect(result).not.toContain('Menu');
    expect(result).not.toContain('Rodape');
  });

  it('prioriza conteudo de article, main, .content, #content, .post, .article', async () => {
    const html = `
      <html>
        <body>
          <header>Cabecalho</header>
          <main><p>Conteudo principal</p></main>
          <footer>Rodape</footer>
        </body>
      </html>
    `;
    const result = await extractHtml(html);
    expect(result).toContain('Conteudo principal');
    expect(result).not.toContain('Cabecalho');
    expect(result).not.toContain('Rodape');
  });

  it('stripNullCharacters trata caracteres nulos em texto puro (via universalExtract)', async () => {
    const input = 'text' + String.fromCharCode(0) + 'null';
    const result = await universalExtract({
      base64Content: Buffer.from(input, 'utf-8').toString('base64'),
      mimeType: 'text/plain',
    });

    expect(result.text).toContain('text null');
  });

  it('normaliza whitespace e trima o resultado', async () => {
    const result = await extractHtml('<body>  texto    com   multiplos    espacos  </body>');
    expect(result).toBe('texto com multiplos espacos');
  });

  it('respeita o limite de caracteres', async () => {
    const longText = 'a'.repeat(200);
    const result = await extractHtml(`<body>${longText}</body>`, 100);
    expect(result).toHaveLength(100);
  });
});

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

  it('retorna error quando mime-type nao suportado', async () => {
    const result = await universalExtract({
      base64Content: Buffer.from('test', 'utf-8').toString('base64'),
      mimeType: 'image/png',
    });

    expect(result).toEqual({
      text: '',
      length: 0,
      error: 'Mime-type não suportado para extração.',
    });
  });

  it('retorna error quando URL nao e valida', async () => {
    const result = await universalExtract({
      url: 'http://localhost:3000',
    });

    expect(result).toEqual({
      text: '',
      length: 0,
      error: 'URL restrita ou inválida por segurança.',
    });
  });
});

describe('searchCnpjAbertoCompanies', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('ignora registros sem CNPJ valido antes de aceitar resultado do CNPJ Aberto', async () => {
    vi.stubEnv('CNPJABERTO_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          empresas: [
            {
              razao_social: 'Empresa Invalida LTDA',
              cnpj: '12.345.678/0001-00',
              qualificacao: 'Sócio-administrador',
            },
            {
              razao_social: 'E.Z.M.S. Participacoes LTDA',
              cnpj: '09.567.366/0001-11',
              qualificacao: 'Sócio-administrador',
            },
          ],
        }),
      }),
    );

    const results = await searchCnpjAbertoCompanies('Elizeu Zulmar Maggi Scheffer');

    expect(results).toHaveLength(1);
    expect(results?.[0]).toMatchObject({
      name: 'E.Z.M.S. Participacoes LTDA',
      cnpj: '09567366000111',
      sourceUrl: 'https://cnpjaberto.com.br/09567366000111',
    });
  });
});
