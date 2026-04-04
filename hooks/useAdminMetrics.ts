import { useMemo } from 'react';
import { ChatSession } from '../types';

function normalizeModeLabel(mode: string | null | undefined): string {
  if (!mode) return 'investigacao';
  if (mode === 'operacao' || mode === 'diretoria') return 'investigacao';
  return mode;
}

export interface VendorMetric {
  name: string;
  sessions: number;
  companies: Set<string>;
  avgScore: number;
  lastActive: string;
}

export interface AdminMetrics {
  totalSessions: number;
  totalCompanies: number;
  avgScore: number;
  topVendors: VendorMetric[];
  scoreDistribution: { label: string; count: number }[];
  recentActivity: { date: string; count: number }[];
  modeBreakdown: { mode: string; count: number }[];
}

export function useAdminMetrics(sessions: ChatSession[]): AdminMetrics {
  return useMemo(() => {
    const vendorMap = new Map<string, VendorMetric>();
    const companies = new Set<string>();
    let totalScore = 0;
    let scoredCount = 0;
    const scoreRanges = [
      { label: '0–20', min: 0, max: 20, count: 0 },
      { label: '21–40', min: 21, max: 40, count: 0 },
      { label: '41–60', min: 41, max: 60, count: 0 },
      { label: '61–80', min: 61, max: 80, count: 0 },
      { label: '81–100', min: 81, max: 100, count: 0 },
    ];
    const activityMap = new Map<string, number>();
    const modeMap = new Map<string, number>();

    for (const s of sessions) {
      const vendor = s.messages.find(m => m.sender === 'user')?.text
        ? (s as any).vendorName ?? 'Desconhecido'
        : 'Desconhecido';

      if (!vendorMap.has(vendor)) {
        vendorMap.set(vendor, {
          name: vendor,
          sessions: 0,
          companies: new Set(),
          avgScore: 0,
          lastActive: s.updatedAt ?? s.createdAt,
        });
      }

      const vm = vendorMap.get(vendor)!;
      vm.sessions++;
      if (s.empresaAlvo) {
        vm.companies.add(s.empresaAlvo);
        companies.add(s.empresaAlvo);
      }
      if (s.scoreOportunidade != null) {
        totalScore += s.scoreOportunidade;
        scoredCount++;
        const range = scoreRanges.find(
          r => s.scoreOportunidade! >= r.min && s.scoreOportunidade! <= r.max,
        );
        if (range) range.count++;
      }
      if (s.updatedAt && s.updatedAt > vm.lastActive) vm.lastActive = s.updatedAt;

      const date = (s.createdAt ?? '').slice(0, 10);
      if (date) activityMap.set(date, (activityMap.get(date) ?? 0) + 1);

      const mode = normalizeModeLabel(s.modoPrincipal);
      modeMap.set(mode, (modeMap.get(mode) ?? 0) + 1);
    }

    // Avg score per vendor
    for (const vm of vendorMap.values()) {
      const vendorSessions = sessions.filter(
        s => ((s as any).vendorName ?? 'Desconhecido') === vm.name,
      );
      const scores = vendorSessions
        .map(s => s.scoreOportunidade)
        .filter((v): v is number => v != null);
      vm.avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    }

    const topVendors = [...vendorMap.values()]
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 10);

    const recentActivity = [...activityMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([date, count]) => ({ date, count }));

    const modeBreakdown = [...modeMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([mode, count]) => ({ mode, count }));

    return {
      totalSessions: sessions.length,
      totalCompanies: companies.size,
      avgScore: scoredCount ? Math.round(totalScore / scoredCount) : 0,
      topVendors,
      scoreDistribution: scoreRanges,
      recentActivity,
      modeBreakdown,
    };
  }, [sessions]);
}
