import { describe, it, expect } from 'vitest';
import { extractCompanyName } from '../../utils/companyNameExtractor';

describe('extractCompanyName', () => {
  it('returns "Empresa" for null/undefined input', () => {
    expect(extractCompanyName(null)).toBe('Empresa');
    expect(extractCompanyName(undefined)).toBe('Empresa');
    expect(extractCompanyName('')).toBe('Empresa');
  });

  it('extracts company name from "investigar" pattern', () => {
    expect(extractCompanyName('Investigar Grupo Scheffer')).toBe('Scheffer');
    expect(extractCompanyName('investigar a SLC Agrícola')).toBe('SLC Agrícola');
  });

  it('extracts company name from gerund labels used by the UI shell', () => {
    expect(extractCompanyName('Investigando SCHEFFER & CIA LTDA...')).toBe('SCHEFFER & CIA LTDA');
    expect(extractCompanyName('🔍 Investigando Grupo Scheffer...')).toBe('Scheffer');
    expect(extractCompanyName('Mapeando Bom Futuro')).toBe('Bom Futuro');
  });

  it('extracts company name from "empresa" pattern', () => {
    expect(extractCompanyName('empresa Bunge')).toBe('Bunge');
    expect(extractCompanyName('Grupo Amaggi')).toBe('Amaggi');
  });

  it('extracts company name from "dossie" pattern', () => {
    expect(extractCompanyName('dossie da Cargill')).toBe('Cargill');
  });

  it('extracts company name from "sobre" pattern', () => {
    expect(extractCompanyName('sobre a JBS')).toBe('JBS');
  });

  it('strips trailing ellipsis', () => {
    expect(extractCompanyName('Investigar Marfrig...')).toBe('Marfrig');
  });

  it('returns "Empresa" when no pattern matches (avoids sending full text to lookup)', () => {
    expect(extractCompanyName('BRF S.A.')).toBe('Empresa');
  });

  it('returns "Empresa" when extracted name is too short (<=2 chars)', () => {
    expect(extractCompanyName('Investigar AB')).toBe('Empresa');
  });

  it('extracts from new conversational patterns', () => {
    expect(extractCompanyName('me fala da Bom Futuro')).toBe('Bom Futuro');
    expect(extractCompanyName('quero saber sobre Agrindus')).toBe('Agrindus');
    expect(extractCompanyName('informações da SLC Agrícola')).toBe('SLC Agrícola');
    expect(extractCompanyName('como está a Copersucar')).toBe('Copersucar');
    expect(extractCompanyName('cliente Marfrig')).toBe('Marfrig');
  });

  it('strips trailing noise from greedy captures', () => {
    expect(extractCompanyName('investigar a Bom Futuro e suas operações')).toBe('Bom Futuro');
    expect(extractCompanyName('sobre a JBS por favor')).toBe('JBS');
  });

  it('extracts from "sobre X" without article', () => {
    expect(extractCompanyName('sobre Bunge')).toBe('Bunge');
  });
});
