import { describe, it, expect } from 'vitest';
import { parseMarkdownSections } from '../../utils/sectionParser';

describe('parseMarkdownSections', () => {
  it('retorna array vazio para string vazia', () => {
    expect(parseMarkdownSections('')).toEqual([]);
  });

  it('retorna array vazio para texto sem headers e sem conteúdo', () => {
    expect(parseMarkdownSections('\n\n')).toEqual([]);
  });

  it('parseia seção com header ## corretamente', () => {
    const md = '## Análise Fiscal\nConteúdo da análise fiscal aqui.';
    const sections = parseMarkdownSections(md);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('Análise Fiscal');
    expect(sections[0].content).toContain('Conteúdo da análise fiscal');
    expect(sections[0].level).toBe(2);
  });

  it('parseia seção com header ### (nível 3)', () => {
    const md = '### Subseção de TI\nDetalhe técnico aqui.';
    const sections = parseMarkdownSections(md);
    expect(sections).toHaveLength(1);
    expect(sections[0].level).toBe(3);
  });

  it('parseia múltiplas seções', () => {
    const md = [
      '## 🔍 Seção 1',
      'Conteúdo da seção 1.',
      '',
      '## 📊 Seção 2',
      'Conteúdo da seção 2.',
    ].join('\n');

    const sections = parseMarkdownSections(md);
    expect(sections.length).toBeGreaterThanOrEqual(2);
    expect(sections.some(s => s.title === '🔍 Seção 1')).toBe(true);
    expect(sections.some(s => s.title === '📊 Seção 2')).toBe(true);
  });

  it('cria seção "intro" para conteúdo antes do primeiro header', () => {
    const md = 'Texto introdutório aqui.\n\n## Header Principal\nConteúdo.';
    const sections = parseMarkdownSections(md);
    const intro = sections.find(s => s.key === 'intro');
    expect(intro).toBeDefined();
    expect(intro?.content).toContain('Texto introdutório');
  });

  it('gera key como slug do título', () => {
    const md = '## Análise de TI e Tecnologia\nConteúdo aqui.';
    const sections = parseMarkdownSections(md);
    expect(sections[0].key).toMatch(/^[a-z0-9_]+$/);
    expect(sections[0].key).not.toContain(' ');
  });

  it('limita key a 50 caracteres', () => {
    const longTitle = 'A'.repeat(80);
    const md = `## ${longTitle}\nConteúdo aqui.`;
    const sections = parseMarkdownSections(md);
    expect(sections[0].key.length).toBeLessThanOrEqual(50);
  });

  it('filtra seções com conteúdo vazio', () => {
    const md = '## Header Sem Conteúdo\n\n## Header Com Conteúdo\nConteúdo válido.';
    const sections = parseMarkdownSections(md);
    expect(sections.every(s => s.content.length > 0)).toBe(true);
  });

  it('parseia seções com emojis no título', () => {
    const md = '## 🌾 Análise Agro\nDados do agronegócio.';
    const sections = parseMarkdownSections(md);
    expect(sections[0].title).toBe('🌾 Análise Agro');
  });

  it('conteúdo da seção não inclui o header em si', () => {
    const md = '## Seção Limpa\nApenas este conteúdo.';
    const sections = parseMarkdownSections(md);
    expect(sections[0].content).not.toContain('## Seção Limpa');
  });

  it('agrupa módulos principais por header H1 e preserva subseções dentro do conteúdo', () => {
    const md = [
      '# 🦅 DOSSIÊ SCOUT 360: OPERACIONAL',
      '',
      '## 🎯 RADAR',
      'Bullet 1',
      '',
      '# 🦅 DOSSIÊ SCOUT 360: TECH STACK',
      '',
      '### 🗺️ MAPA',
      'Detalhe técnico',
    ].join('\n');

    const sections = parseMarkdownSections(md);
    expect(sections).toHaveLength(2);
    expect(sections[0].level).toBe(1);
    expect(sections[0].title).toContain('OPERACIONAL');
    expect(sections[0].content).toContain('## 🎯 RADAR');
    expect(sections[1].title).toContain('TECH STACK');
    expect(sections[1].content).toContain('### 🗺️ MAPA');
  });
});
