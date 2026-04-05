import React, { createContext, useContext, useEffect, useState } from 'react';
import { del, set } from 'idb-keyval';
import { ChatSession, CRMCard, CRMStage, DealHealth, Sender } from '../types';

const LOCAL_KEY = 'scout360_crm_cards_v1';

interface CRMContextValue {
  cards: CRMCard[];
  createCardFromSession: (session: ChatSession) => Promise<CRMCard>;
  createManualCard: (input: {
    companyName: string;
    cnpj?: string;
    website?: string;
    briefDescription?: string;
    stage?: CRMStage;
  }) => Promise<CRMCard>;
  updateCard: (card: CRMCard) => Promise<void>;
  deleteCard: (cardId: string) => Promise<void>;
  moveCardToStage: (cardId: string, stage: CRMStage) => Promise<void>;
}

const CRMContext = createContext<CRMContextValue | undefined>(undefined);

function computeHealth(card: CRMCard): DealHealth {
  const now = Date.now();

  const movedAt = card.movedToStageAt[card.stage];
  const daysSinceMoved = movedAt
    ? (now - new Date(movedAt).getTime()) / 86_400_000
    : 0;

  const daysSinceUpdated = (now - new Date(card.updatedAt).getTime()) / 86_400_000;

  const score = card.latestScorePorta;

  // Vermelho: score baixo OU negócio parado há muito tempo sem atualização
  if (
    (score !== undefined && score < 40) ||
    (daysSinceMoved > 30 && daysSinceUpdated > 14)
  ) {
    return 'red';
  }

  // Amarelo: score mediano OU negócio sem movimentação recente
  if ((score !== undefined && score < 60) || daysSinceMoved > 15) {
    return 'yellow';
  }

  return 'green';
}

function extractCompanyNameFromSession(session: ChatSession): string {
  if (session.empresaAlvo && session.empresaAlvo.trim().length > 0) return session.empresaAlvo.trim();
  if (session.title && session.title.trim().length > 0) return session.title.replace(/\.\.\.$/, '').trim();
  return 'Empresa sem nome';
}

function normalizeUrl(raw: string): string {
  return raw
    .trim()
    .replace(/[),.]+$/g, '')
    .replace(/^<|>$/g, '');
}

function extractFirstUrl(text: string): string | undefined {
  const matches = text.match(/https?:\/\/[^\s)]+/g);
  if (!matches || matches.length === 0) return undefined;
  return normalizeUrl(matches[0]);
}

function extractExactLinkFromSession(session: ChatSession): string | undefined {
  const text = (session.messages || []).map(m => m.text || '').join('\n');
  const matches = text.match(/https?:\/\/[^\s)]+/g) || [];
  const exact = matches.map(normalizeUrl).find(u => u.includes('app.exactspotter.com'));
  return exact;
}

function extractWebsiteFromSession(session: ChatSession): string | undefined {
  const blob = [session.companyContext || '', (session.messages || []).map(m => m.text || '').join('\n')].join('\n');
  const matches = blob.match(/https?:\/\/[^\s)]+/g) || [];
  const cleaned = matches.map(normalizeUrl);

  // Preferir um site "da empresa" (heuristica simples)
  const preferred = cleaned.find(u =>
    !u.includes('google.') &&
    !u.includes('brasilapi.com.br') &&
    !u.includes('github.com') &&
    !u.includes('app.exactspotter.com')
  );

  return preferred || undefined;
}

function generateBriefDescriptionFromSession(session: ChatSession): string | undefined {
  let text = (session.resumoDossie || '').trim();

  if (!text) {
    const lastBot = [...(session.messages || [])]
      .reverse()
      .find(m => m.sender === Sender.Bot && typeof m.text === 'string' && m.text.trim().length > 0);
    text = (lastBot?.text || '').trim();
  }

  if (!text) return undefined;

  // limpeza leve de markdown / blocos e "fontes"
  text = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\n+/g, '\n')
    .replace(/^#+\s+/gm, '')
    .replace(/\[(?:web|cite|page|memory|file):\d+\]/g, '')
    .replace(/\bFontes Consultadas\b[\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  // tentar pegar 1-2 frases do inicio
  const max = 260;
  const min = 120;
  if (text.length <= max) return text;

  const slice = text.slice(0, max);
  const dot = slice.indexOf('.', min);
  if (dot !== -1) return slice.slice(0, dot + 1).trim();

  return slice.trim().replace(/[,:;-]\s*$/, '') + '...';
}

function sanitizeLoadedCard(card: CRMCard): CRMCard {
  return {
    ...card,
    linkedSessionIds: Array.isArray(card.linkedSessionIds) ? card.linkedSessionIds : [],
    cnpjs: Array.isArray(card.cnpjs)
      ? card.cnpjs.filter((cnpj): cnpj is string => typeof cnpj === 'string' && cnpj.trim().length > 0)
      : undefined,
    movedToStageAt: card.movedToStageAt ?? {},
    stages: card.stages ?? {},
    revenueProfile: card.revenueProfile
      ? {
          ...card.revenueProfile,
          streamsAtivos: Array.isArray(card.revenueProfile.streamsAtivos)
            ? card.revenueProfile.streamsAtivos
            : [],
          oportunidadesExpansao: Array.isArray(card.revenueProfile.oportunidadesExpansao)
            ? card.revenueProfile.oportunidadesExpansao
            : [],
          totalRRAnual:
            typeof card.revenueProfile.totalRRAnual === 'number' ? card.revenueProfile.totalRRAnual : 0,
          totalNR: typeof card.revenueProfile.totalNR === 'number' ? card.revenueProfile.totalNR : 0,
          prazoContratoPadrao:
            typeof card.revenueProfile.prazoContratoPadrao === 'number'
              ? card.revenueProfile.prazoContratoPadrao
              : 24,
        }
      : undefined,
  };
}

export const CRMProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cards, setCards] = useState<CRMCard[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LOCAL_KEY);
      if (!raw) return;
      const parsed: CRMCard[] = JSON.parse(raw);
      setCards(parsed.map(sanitizeLoadedCard));
    } catch (err) {
      console.error('Erro ao carregar CRM do localStorage', err);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(LOCAL_KEY, JSON.stringify(cards));
    } catch (err) {
      console.error('Erro ao salvar CRM no localStorage', err);
    }
  }, [cards]);

  const saveFull = async (card: CRMCard) => {
    await set(`crm_card_${card.id}`, card);
  };

  const createCardFromSession = async (session: ChatSession): Promise<CRMCard> => {
    const now = new Date().toISOString();
    const id = `crm_${session.id}`;

    const cnpjDigits = session.cnpj ? String(session.cnpj).replace(/\D/g, '') : '';
    const cnpj = cnpjDigits.length === 14 ? cnpjDigits : (session.cnpj || undefined);

    const base: CRMCard = {
      id,
      companyName: extractCompanyNameFromSession(session),
      cnpj: cnpj || undefined,
      cnpjs: cnpj ? [String(cnpj)] : undefined,
      website: extractWebsiteFromSession(session),
      briefDescription: generateBriefDescriptionFromSession(session),
      exactLink: extractExactLinkFromSession(session),
      linkedSessionIds: [session.id],
      stage: 'prospeccao',
      createdAt: now,
      updatedAt: now,
      movedToStageAt: { prospeccao: now },
      stages: {},
      latestScorePorta: session.scoreOportunidade || undefined,
      health: 'green',
      newsRadarEnabled: false,
    };

    setCards(prev => [base, ...prev]);
    await saveFull(base);
    return base;
  };

  const createManualCard = async (input: {
    companyName: string;
    cnpj?: string;
    website?: string;
    briefDescription?: string;
    stage?: CRMStage;
  }): Promise<CRMCard> => {
    const now = new Date().toISOString();
    const stage: CRMStage = input.stage || 'prospeccao';

    const cleanCnpj = input.cnpj ? String(input.cnpj).replace(/\D/g, '') : undefined;

    const base: CRMCard = {
      id: `crm_manual_${Date.now()}`,
      companyName: input.companyName.trim() || 'Empresa sem nome',
      cnpj: cleanCnpj && cleanCnpj.length === 14 ? cleanCnpj : undefined,
      cnpjs: cleanCnpj && cleanCnpj.length === 14 ? [cleanCnpj] : undefined,
      website: input.website?.trim() || undefined,
      briefDescription: input.briefDescription?.trim() || undefined,
      exactLink: undefined,
      linkedSessionIds: [],
      stage,
      createdAt: now,
      updatedAt: now,
      movedToStageAt: { [stage]: now },
      stages: {},
      latestScorePorta: undefined,
      health: 'green',
      newsRadarEnabled: false,
    };

    setCards(prev => [base, ...prev]);
    await saveFull(base);
    return base;
  };

  const updateCard = async (card: CRMCard) => {
    const updated: CRMCard = sanitizeLoadedCard({
      ...card,
      updatedAt: new Date().toISOString(),
      health: computeHealth(card),
    });
    setCards(prev => prev.map(c => (c.id === card.id ? updated : c)));
    await saveFull(updated);
  };

  const deleteCard = async (cardId: string) => {
    setCards(prev => prev.filter(c => c.id !== cardId));
    try {
      await del(`crm_card_${cardId}`);
    } catch {
      // fallback: nao quebra o app se o del falhar
      await set(`crm_card_${cardId}`, null);
    }
  };

  const moveCardToStage = async (cardId: string, stage: CRMStage) => {
    const card = cards.find(c => c.id === cardId);
    if (!card) return;
    const now = new Date().toISOString();
    const updated: CRMCard = {
      ...card,
      stage,
      movedToStageAt: { ...card.movedToStageAt, [stage]: now },
      updatedAt: now,
    };
    await updateCard(updated);
  };

  const value: CRMContextValue = {
    cards,
    createCardFromSession,
    createManualCard,
    updateCard,
    deleteCard,
    moveCardToStage,
  };

  return <CRMContext.Provider value={value}>{children}</CRMContext.Provider>;
};

export const useCRM = (): CRMContextValue => {
  const ctx = useContext(CRMContext);
  if (!ctx) throw new Error('useCRM must be used within CRMProvider');
  return ctx;
};
