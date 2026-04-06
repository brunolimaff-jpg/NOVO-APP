
// services/apiConfig.ts
// Centraliza TODAS as URLs de APIs externas e mapeamentos

// === URLs do Backend ===
const FALLBACK_BACKEND_URL = 'https://script.google.com/macros/s/AKfycbxvhFIWm6wOW0qDSrSB0lKA7UGkvxGltvZY9hghDpxv9r3diYcPoiPUq_n4WzJpkEY/exec';
const FALLBACK_LOOKUP_URL = 'https://script.google.com/macros/s/AKfycbxscB2gSotAxrCdpRpyaqrPKlsPbRfe6fgjicbd69fG6sMM3vrbuGjDaRctWCTcE8d-/exec';

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || FALLBACK_BACKEND_URL;
export const LOOKUP_URL = import.meta.env.VITE_LOOKUP_URL || FALLBACK_LOOKUP_URL;

// === Mapeamento de produtos Senior → URLs reais ===
export const SENIOR_PRODUCT_URLS: Record<string, string> = {
  // PLATAFORMA / PERFORMANCE CORPORATIVA
  'bpm': 'https://www.senior.com.br/solucoes/performance-corporativa/bpm',
  'modelagem e execução de processos': 'https://www.senior.com.br/solucoes/performance-corporativa/bpm',
  'modelagem e execucao de processos': 'https://www.senior.com.br/solucoes/performance-corporativa/bpm',
  'gestão de processos': 'https://www.senior.com.br/solucoes/performance-corporativa/bpm',
  'senior flow': 'https://www.senior.com.br/solucoes/performance-corporativa/bpm',
  'workflow': 'https://www.senior.com.br/solucoes/performance-corporativa/bpm',
  'ged': 'https://www.senior.com.br/solucoes/performance-corporativa/ged',
  'ecm': 'https://www.senior.com.br/solucoes/performance-corporativa/ged',
  'ecm/ged': 'https://www.senior.com.br/solucoes/performance-corporativa/ged',
  'gestão de documentos': 'https://www.senior.com.br/solucoes/performance-corporativa/ged',
  'gestão eletrônica de documentos': 'https://www.senior.com.br/solucoes/performance-corporativa/ged',
  'gestao de documentos': 'https://www.senior.com.br/solucoes/performance-corporativa/ged',
  'bot': 'https://www.senior.com.br/solucoes/performance-corporativa/bot',
  'chatbot': 'https://www.senior.com.br/solucoes/performance-corporativa/bot',
  'bi': 'https://www.senior.com.br/solucoes/performance-corporativa/bi',
  'business intelligence': 'https://www.senior.com.br/solucoes/performance-corporativa/bi',
  'analytics': 'https://www.senior.com.br/solucoes/performance-corporativa/bi',

  // ERP
  'erp': 'https://www.senior.com.br/solucoes/gestao-empresarial-erp',
  'sapiens': 'https://www.senior.com.br/solucoes/gestao-empresarial-erp',
  'erp senior': 'https://www.senior.com.br/solucoes/gestao-empresarial-erp',
  'gestão empresarial': 'https://www.senior.com.br/solucoes/gestao-empresarial-erp',
  'gestao empresarial': 'https://www.senior.com.br/solucoes/gestao-empresarial-erp',
  'gestão financeira': 'https://www.senior.com.br/solucoes/gestao-empresarial-erp/gestao-financeira',
  'gestao financeira': 'https://www.senior.com.br/solucoes/gestao-empresarial-erp/gestao-financeira',
  'gestão de compras': 'https://www.senior.com.br/solucoes/gestao-empresarial-erp/gestao-de-compras',
  'gestao de compras': 'https://www.senior.com.br/solucoes/gestao-empresarial-erp/gestao-de-compras',
  'gestão fiscal': 'https://www.senior.com.br/solucoes/gestao-empresarial-erp',
  'gestão contábil': 'https://www.senior.com.br/solucoes/gestao-empresarial-erp',
  'senior capital': 'https://www.senior.com.br/solucoes/gestao-empresarial-erp/gestao-financeira',
  'tesouraria': 'https://www.senior.com.br/solucoes/gestao-empresarial-erp/gestao-financeira',
  'gestão de tesouraria avançada': 'https://www.senior.com.br/solucoes/gestao-empresarial-erp/gestao-financeira',

  // HCM / GESTÃO DE PESSOAS
  'hcm': 'https://www.senior.com.br/solucoes/gestao-de-pessoas-hcm',
  'gestão de pessoas': 'https://www.senior.com.br/solucoes/gestao-de-pessoas-hcm',
  'gestao de pessoas': 'https://www.senior.com.br/solucoes/gestao-de-pessoas-hcm',
  'folha de pagamento': 'https://www.senior.com.br/solucoes/gestao-de-pessoas-hcm/departamento-pessoal',
  'departamento pessoal': 'https://www.senior.com.br/solucoes/gestao-de-pessoas-hcm/departamento-pessoal',
  'controle de ponto': 'https://www.senior.com.br/solucoes/gestao-de-pessoas-hcm/gestao-de-ponto',
  'gestão de ponto': 'https://www.senior.com.br/solucoes/gestao-de-pessoas-hcm/gestao-de-ponto',
  'gestao de ponto': 'https://www.senior.com.br/solucoes/gestao-de-pessoas-hcm/gestao-de-ponto',
  'controle de acesso': 'https://www.senior.com.br/solucoes/gestao-de-pessoas-hcm/controle-de-acesso',
  'gestão de acesso': 'https://www.senior.com.br/solucoes/gestao-de-pessoas-hcm/controle-de-acesso',
  'gestao de acesso': 'https://www.senior.com.br/solucoes/gestao-de-pessoas-hcm/controle-de-acesso',
  'recrutamento e seleção': 'https://www.senior.com.br/solucoes/gestao-de-pessoas-hcm/recrutamento-e-selecao',
  'recrutamento e selecao': 'https://www.senior.com.br/solucoes/gestao-de-pessoas-hcm/recrutamento-e-selecao',
  'gestão de terceiros': 'https://www.senior.com.br/solucoes/gestao-de-terceiros',
  'gestao de terceiros': 'https://www.senior.com.br/solucoes/gestao-de-terceiros',
  'ronda': 'https://www.senior.com.br/solucoes/gestao-de-pessoas-hcm/controle-de-acesso',

  // LOGÍSTICA
  'tms': 'https://www.senior.com.br/solucoes/logistica/tms',
  'gestão de transporte': 'https://www.senior.com.br/solucoes/logistica/tms',
  'gestao de transporte': 'https://www.senior.com.br/solucoes/logistica/tms',
  'wms': 'https://www.senior.com.br/solucoes/logistica/wms',
  'gestão de armazém': 'https://www.senior.com.br/solucoes/logistica/wms',
  'gestao de armazem': 'https://www.senior.com.br/solucoes/logistica/wms',
  'yms': 'https://www.senior.com.br/solucoes/logistica/yms',
  'gestão de pátio': 'https://www.senior.com.br/solucoes/logistica/yms',
  'gestao de patio': 'https://www.senior.com.br/solucoes/logistica/yms',
  'rms': 'https://www.senior.com.br/solucoes/logistica/rms',
  'gestão de riscos': 'https://www.senior.com.br/solucoes/logistica/rms',
  'gestao de riscos': 'https://www.senior.com.br/solucoes/logistica/rms',

  // GATEC / AGRO
  'simplefarm': 'https://www.gatec.com.br/simplefarm',
  'simple farm': 'https://www.gatec.com.br/simplefarm',
  'mapfy': 'https://www.gatec.com.br/mapfy',
  'operis': 'https://www.gatec.com.br/operis',
  'commerce': 'https://www.gatec.com.br/commerce',
  'commerce log': 'https://www.gatec.com.br/commerce',
  'shield': 'https://www.gatec.com.br/shield',
  'gatec': 'https://www.gatec.com.br',
  'oneclick': 'https://www.gatec.com.br',
  'simpleviewer': 'https://www.gatec.com.br',

  // OUTROS
  'senior x': 'https://www.senior.com.br/seniorx',
  'senior x platform': 'https://www.senior.com.br/seniorx',
  'xplatform': 'https://www.senior.com.br/seniorx',
  'crm': 'https://www.senior.com.br/solucoes/gestao-comercial',
  'gestão comercial': 'https://www.senior.com.br/solucoes/gestao-comercial',
  'gestao comercial': 'https://www.senior.com.br/solucoes/gestao-comercial',
  'gestão de despesas': 'https://www.senior.com.br/solucoes/gestao-de-despesas',
  'gestao de despesas': 'https://www.senior.com.br/solucoes/gestao-de-despesas',
};

// === Domínios falsos / não-confiáveis que o Gemini gera ou alucina ===
export const FAKE_DOMAINS = [
  // AI / Google internos
  'ai.studio',
  'aistudio.google.com',
  'ai.google.dev',
  'vertexai.google.com',
  'generativelanguage.googleapis.com',
  'makersuite.google.com',
  'bard.google.com',
  'gemini.google.com',
  'g.co',
  // Placeholders
  'example.com',
  'exemplo.com',
  'confirmado',
  'auditoria',
  'fake-link.com',
];

// === Funções de busca de URL real ===
export function findSeniorProductUrl(text: string): string | null {
  if (!text) return null;
  
  const normalized = text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[()]/g, '')
    .trim();

  // Busca exata
  for (const [key, url] of Object.entries(SENIOR_PRODUCT_URLS)) {
    const keyNorm = key.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (normalized === keyNorm || normalized.includes(keyNorm) || keyNorm.includes(normalized)) {
      return url;
    }
  }

  // Busca por keywords parciais
  const keywords: [string, string][] = [
    ['bpm', 'https://www.senior.com.br/solucoes/performance-corporativa/bpm'],
    ['ged', 'https://www.senior.com.br/solucoes/performance-corporativa/ged'],
    ['ecm', 'https://www.senior.com.br/solucoes/performance-corporativa/ged'],
    ['erp', 'https://www.senior.com.br/solucoes/gestao-empresarial-erp'],
    ['hcm', 'https://www.senior.com.br/solucoes/gestao-de-pessoas-hcm'],
    ['tms', 'https://www.senior.com.br/solucoes/logistica/tms'],
    ['wms', 'https://www.senior.com.br/solucoes/logistica/wms'],
    ['yms', 'https://www.senior.com.br/solucoes/logistica/yms'],
    ['rms', 'https://www.senior.com.br/solucoes/logistica/rms'],
    ['simplefarm', 'https://www.gatec.com.br/simplefarm'],
    ['mapfy', 'https://www.gatec.com.br/mapfy'],
    ['operis', 'https://www.gatec.com.br/operis'],
    ['commerce', 'https://www.gatec.com.br/commerce'],
    ['shield', 'https://www.gatec.com.br/shield'],
    ['tesouraria', 'https://www.senior.com.br/solucoes/gestao-empresarial-erp/gestao-financeira'],
    ['capital', 'https://www.senior.com.br/solucoes/gestao-empresarial-erp/gestao-financeira'],
    ['folha', 'https://www.senior.com.br/solucoes/gestao-de-pessoas-hcm/departamento-pessoal'],
    ['ponto', 'https://www.senior.com.br/solucoes/gestao-de-pessoas-hcm/gestao-de-ponto'],
    ['acesso', 'https://www.senior.com.br/solucoes/gestao-de-pessoas-hcm/controle-de-acesso'],
    ['transporte', 'https://www.senior.com.br/solucoes/logistica/tms'],
    ['armazem', 'https://www.senior.com.br/solucoes/logistica/wms'],
    ['patio', 'https://www.senior.com.br/solucoes/logistica/yms'],
    ['documento', 'https://www.senior.com.br/solucoes/performance-corporativa/ged'],
    ['processo', 'https://www.senior.com.br/solucoes/performance-corporativa/bpm'],
    ['financ', 'https://www.senior.com.br/solucoes/gestao-empresarial-erp/gestao-financeira'],
    ['fiscal', 'https://www.senior.com.br/solucoes/gestao-empresarial-erp'],
    ['contab', 'https://www.senior.com.br/solucoes/gestao-empresarial-erp'],
    ['logistic', 'https://www.senior.com.br/solucoes/logistica/tms'],
    ['recrutamento', 'https://www.senior.com.br/solucoes/gestao-de-pessoas-hcm/recrutamento-e-selecao'],
    ['terceiro', 'https://www.senior.com.br/solucoes/gestao-de-terceiros'],
    ['despesa', 'https://www.senior.com.br/solucoes/gestao-de-despesas'],
    ['comercial', 'https://www.senior.com.br/solucoes/gestao-comercial'],
    ['workflow', 'https://www.senior.com.br/solucoes/performance-corporativa/bpm'],
    ['flow', 'https://www.senior.com.br/solucoes/performance-corporativa/bpm'],
    ['ronda', 'https://www.senior.com.br/solucoes/gestao-de-pessoas-hcm/controle-de-acesso'],
  ];

  for (const [keyword, url] of keywords) {
    if (normalized.includes(keyword)) {
      return url;
    }
  }

  return null;
}

// Verifica se URL é de domínio falso gerado pelo Gemini
export function isFakeUrl(url: string): boolean {
  if (!url) return true; // Empty URL is considered fake
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    
    // Verificação direta por domínio (exato ou subdomínio)
    if (FAKE_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))) return true;
    
    // Google Search check - explicitly block search results as "fake" sources in this context
    if (hostname.includes('google.com') && parsed.pathname.includes('/search')) return true;
    
    return false;
  } catch {
    // URL malformada, verificar string raw para catch-all
    const lower = url.toLowerCase();
    return FAKE_DOMAINS.some(d => lower.includes(d)) || lower.includes('google.com/search');
  }
}
