import { STABLE_RESEARCH_MODEL_ID } from '../../config/models';

export const MODEL_ID = STABLE_RESEARCH_MODEL_ID;
export const DEFAULT_COMPETITOR_TARGET = 'concorrente principal';
export const MODEL_TIMEOUT_MS = 90000;
export const MAX_HISTORY_TURNS = 8;
export const MAX_HISTORY_CHARS = 4000;
export const MAX_USER_QUESTION_CHARS = 1600;
export const MAX_DOCS_CHARS = 6000;
export const DOCS_CACHE_TTL_MS = 120000;
export const DEFAULT_DOCS_NAMESPACE = 'senior-erp-docs';
export const COMPETITOR_DOCS_NAMESPACE = 'competitor-pdfs';

export const FERCUS_REFERENCE_BLOCK = [
  '### Integracao Gatec: Gestão de Custos Gerenciais (Fercus)',
  'Módulo focado em custos gerenciais dentro do contexto GAtec/ERP.',
  '(Fonte: https://documentacao.senior.com.br/gestaoempresarialerp/manuais_processos/agronegocio/integracao-gatec/gatec-modulo-fercus.htm)',
].join('\n');

export const TALHAO_REFERENCE_BLOCK = [
  '### Agrícola: Consulta Analítica de Talhão',
  'Referências para apuração de custo por talhão e configuração da visão analítica.',
  '(Fonte: https://documentacao.senior.com.br/simplefarm/manual-do-usuario/agricola/estrutura-de-locais/consulta-analitica-de-talhao)',
  '(Fonte: https://documentacao.senior.com.br/simplefarm/manual-do-usuario/agricola/estrutura-de-locais/configuracoes-da-consulta-analitica-de-talhao)',
].join('\n');

export const GATEC_AGRICOLA_REFERENCE_BLOCK = [
  '### SimpleFarm: Manual do Usuário (Agrícola)',
  'Referência primária para processos agrícolas operacionais no ecossistema GAtec/SimpleFarm.',
  '(Fonte: https://documentacao.senior.com.br/simplefarm/manual-do-usuario/)',
  '(Fonte: https://documentacao.senior.com.br/simplefarm/manual-do-usuario/agricola/)',
].join('\n');

export const ERP_BANKING_REFERENCE_BLOCK = [
  '### ERP Banking: Integração Bancária',
  'Referências oficiais para integração de pagamentos eletrônicos, conciliação e fluxo ERP Banking.',
  '(Fonte: https://documentacao.senior.com.br/gestaoempresarialerp/processos-automaticos/166-integracao-erp-banking.htm)',
  '(Fonte: https://documentacao.senior.com.br/seniorxplatform/manual-do-usuario/erp/?utm_source=portal-documentacao&utm_medium=referral&utm_campaign=link-home-portal#Banking/banking.htm)',
].join('\n');

export const ERP_BANKING_CANONICAL_BLOCK = [
  '### Mapeamento canônico: ERP Banking vs TOTVS',
  '- ERP Banking da Senior: pagamento eletrônico abrangente (ACH, cartões e transferências), conciliação e ecossistema financeiro embarcado.',
  '- TOTVS (Protheus): excelente registro online de títulos e boletos via API, reduzindo dependência de CNAB em cenários específicos.',
  '- Leitura correta no comparativo: quando houver menção a Banking, contraste explícito entre API de boletos/títulos e governança de pagamentos/conciliação do ERP Banking.',
  '',
  '### Referência explícita: ERP Banking',
  '- Integração ERP x ERP Banking: https://documentacao.senior.com.br/gestaoempresarialerp/processos-automaticos/166-integracao-erp-banking.htm',
  '- Módulo ERP Banking (Senior X Platform): https://documentacao.senior.com.br/seniorxplatform/manual-do-usuario/erp/?utm_source=portal-documentacao&utm_medium=referral&utm_campaign=link-home-portal#Banking/banking.htm',
].join('\n');
