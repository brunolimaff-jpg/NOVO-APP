/**
 * Revenue Intelligence Component
 *
 * Exibe a separação de RR (Receita Recorrente) e NR (Receita Não-Recorrente)
 * para um cliente, com base no perfil de receita calculado.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CustomerRevenueProfile, RevenueStream, PorteCliente } from '../types';
import { formatarMoeda, labelTipo } from '../services/revenueService';

interface RevenueIntelligenceProps {
  profile: CustomerRevenueProfile;
  isDarkMode?: boolean;
}

const FAMILIA_ICONS: Record<string, string> = {
  GATec: '🌾',
  ERP: '💼',
  HCM: '👥',
  Logística: '🚛',
  Acesso: '🔐',
  Plataforma: '📚',
  Hypnobox: '🏠',
};

const PORTE_LABELS: Record<PorteCliente, string> = {
  pequeno: 'Pequeno',
  medio: 'Médio',
  grande: 'Grande',
};

const PORTE_COLORS: Record<PorteCliente, string> = {
  pequeno: '#64748b',
  medio: '#f59e0b',
  grande: '#10b981',
};

// ===================================================================
// SUB-COMPONENTES
// ===================================================================

const MetricCard: React.FC<{
  label: string;
  value: string;
  sub?: string;
  color: string;
  isDarkMode: boolean;
}> = ({ label, value, sub, color, isDarkMode }) => {
  const bg = isDarkMode ? '#0f172a' : '#f8fafc';
  const border = `${color}33`;
  const labelColor = isDarkMode ? '#94a3b8' : '#64748b';

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        padding: '10px 12px',
        borderRadius: '10px',
        background: bg,
        border: `1.5px solid ${border}`,
      }}
    >
      <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '1px', color: labelColor, textTransform: 'uppercase', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ fontSize: '18px', fontWeight: 700, color, lineHeight: 1.2 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: '10px', color: labelColor, marginTop: '2px' }}>{sub}</div>
      )}
    </div>
  );
};

const StreamRow: React.FC<{
  stream: RevenueStream;
  isDarkMode: boolean;
}> = ({ stream, isDarkMode }) => {
  const labelColor = isDarkMode ? '#94a3b8' : '#64748b';
  const valueColor = isDarkMode ? '#e2e8f0' : '#334155';
  const subtleBg = isDarkMode ? '#111827' : '#f1f5f9';

  const icon = FAMILIA_ICONS[stream.familiasProduto] ?? '📦';
  const isRR = stream.recorrente;

  const color = isRR ? '#10b981' : '#f59e0b';
  const badge = isRR ? 'RR' : 'NR';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '7px 10px',
        borderRadius: '8px',
        background: subtleBg,
        marginBottom: '4px',
      }}
    >
      <span style={{ fontSize: '14px', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: valueColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {stream.descricao}
        </div>
        {stream.modulo && (
          <div style={{ fontSize: '10px', color: labelColor, marginTop: '1px' }}>
            {stream.modulo}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', flexShrink: 0 }}>
        <span
          style={{
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '0.8px',
            padding: '1px 5px',
            borderRadius: '4px',
            background: `${color}20`,
            color,
          }}
        >
          {badge}
        </span>
        <span style={{ fontSize: '11px', fontWeight: 600, color: valueColor }}>
          {isRR
            ? stream.valorMensal ? `${formatarMoeda(stream.valorMensal)}/mês` : '—'
            : stream.custoImplantacao ? formatarMoeda(stream.custoImplantacao) : '—'}
        </span>
        <span style={{ fontSize: '9px', color: labelColor }}>{labelTipo(stream.tipo)}</span>
      </div>
    </div>
  );
};

// ===================================================================
// COMPONENTE PRINCIPAL
// ===================================================================

const RevenueIntelligence: React.FC<RevenueIntelligenceProps> = ({
  profile,
  isDarkMode = true,
}) => {
  const [expandido, setExpandido] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<'ativos' | 'expansao'>('ativos');

  const resolvedPorte = PORTE_LABELS[profile.porte] ? profile.porte : 'pequeno';
  const streamsAtivos = Array.isArray(profile.streamsAtivos) ? profile.streamsAtivos : [];
  const oportunidadesExpansao = Array.isArray(profile.oportunidadesExpansao)
    ? profile.oportunidadesExpansao
    : [];
  const totalRRAnual = typeof profile.totalRRAnual === 'number' ? profile.totalRRAnual : 0;
  const totalNR = typeof profile.totalNR === 'number' ? profile.totalNR : 0;
  const prazoContratoPadrao =
    typeof profile.prazoContratoPadrao === 'number' && profile.prazoContratoPadrao > 0
      ? profile.prazoContratoPadrao
      : 24;
  const tcvEstimado =
    typeof profile.tcvEstimado === 'number' ? profile.tcvEstimado : undefined;

  const cardBg = isDarkMode ? '#0f172a' : '#ffffff';
  const subtleBorder = isDarkMode ? 'rgba(148,163,184,0.12)' : '#e2e8f0';
  const labelColor = isDarkMode ? '#94a3b8' : '#64748b';
  const valueColor = isDarkMode ? '#e2e8f0' : '#334155';
  const abaBg = isDarkMode ? '#111827' : '#f1f5f9';
  const abaAtivaColor = '#3b82f6';

  const rrMensal = totalRRAnual / 12;
  const porteColor = PORTE_COLORS[resolvedPorte];

  const rrStreams = streamsAtivos.filter(s => s.recorrente);
  const nrStreams = streamsAtivos.filter(s => !s.recorrente);

  // Razão RR/(RR+NR) anualizado
  const totalTudo = totalRRAnual + totalNR;
  const rrRatio = totalTudo > 0 ? Math.round((totalRRAnual / totalTudo) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      style={{
        margin: '0 0 16px',
        padding: '14px 16px',
        borderRadius: '12px',
        border: `1.5px solid ${abaAtivaColor}33`,
        background: cardBg,
      }}
    >
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '15px' }}>💰</span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '1.2px',
              textTransform: 'uppercase',
              color: labelColor,
            }}
          >
            Revenue Intelligence
          </span>
          <span
            style={{
              fontSize: '9px',
              fontWeight: 700,
              letterSpacing: '0.5px',
              padding: '2px 6px',
              borderRadius: '4px',
              background: `${porteColor}20`,
              color: porteColor,
            }}
          >
            {PORTE_LABELS[resolvedPorte].toUpperCase()}
          </span>
        </div>
        <button
          onClick={() => setExpandido(v => !v)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: labelColor,
            fontSize: '18px',
            lineHeight: 1,
            padding: '0 2px',
          }}
          aria-label={expandido ? 'Recolher' : 'Expandir'}
        >
          {expandido ? '▲' : '▼'}
        </button>
      </div>

      {/* Métricas principais */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        <MetricCard
          label="RR Anual"
          value={formatarMoeda(totalRRAnual)}
          sub={`${formatarMoeda(rrMensal)}/mês`}
          color="#10b981"
          isDarkMode={isDarkMode}
        />
        <MetricCard
          label="NR Total"
          value={formatarMoeda(totalNR)}
          sub="implantação"
          color="#f59e0b"
          isDarkMode={isDarkMode}
        />
        {tcvEstimado !== undefined && (
          <MetricCard
            label={`TCV (${prazoContratoPadrao}m)`}
            value={formatarMoeda(tcvEstimado)}
            sub="valor total contrato"
            color="#3b82f6"
            isDarkMode={isDarkMode}
          />
        )}
      </div>

      {/* Barra de proporção RR vs NR */}
      <div style={{ marginBottom: expandido ? '12px' : '0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontSize: '10px', color: '#10b981', fontWeight: 600 }}>RR {rrRatio}%</span>
          <span style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 600 }}>NR {100 - rrRatio}%</span>
        </div>
        <div
          style={{
            height: '6px',
            borderRadius: '3px',
            background: isDarkMode ? '#1e293b' : '#e2e8f0',
            overflow: 'hidden',
          }}
        >
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${rrRatio}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            style={{ height: '100%', background: '#10b981', borderRadius: '3px' }}
          />
        </div>
        <div style={{ fontSize: '10px', color: labelColor, marginTop: '4px' }}>
          Expansão potencial: +{formatarMoeda(
            oportunidadesExpansao
              .filter(o => o.valorAnual)
              .reduce((acc, o) => acc + (o.valorAnual ?? 0), 0),
          )}/ano em {oportunidadesExpansao.length} famílias
        </div>
      </div>

      {/* Painel expandido */}
      <AnimatePresence>
        {expandido && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            style={{ overflow: 'hidden' }}
          >
            {/* Abas */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', borderBottom: `1px solid ${subtleBorder}`, paddingBottom: '8px' }}>
              {(['ativos', 'expansao'] as const).map(aba => (
                <button
                  key={aba}
                  onClick={() => setAbaAtiva(aba)}
                  style={{
                    background: abaAtiva === aba ? `${abaAtivaColor}20` : abaBg,
                    border: `1px solid ${abaAtiva === aba ? abaAtivaColor : 'transparent'}`,
                    borderRadius: '6px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    color: abaAtiva === aba ? abaAtivaColor : labelColor,
                  }}
                >
                  {aba === 'ativos'
                    ? `Carteira Ativa (${streamsAtivos.length})`
                    : `Cross-sell (${oportunidadesExpansao.length})`}
                </button>
              ))}
            </div>

            {/* Lista de streams */}
            {abaAtiva === 'ativos' && (
              <div>
                {rrStreams.length > 0 && (
                  <>
                    <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.8px', color: '#10b981', marginBottom: '6px', textTransform: 'uppercase' }}>
                      Receita Recorrente (RR)
                    </div>
                    {rrStreams.map(s => (
                      <StreamRow key={s.id} stream={s} isDarkMode={isDarkMode} />
                    ))}
                  </>
                )}
                {nrStreams.length > 0 && (
                  <>
                    <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.8px', color: '#f59e0b', marginBottom: '6px', marginTop: '10px', textTransform: 'uppercase' }}>
                      Receita Não-Recorrente (NR)
                    </div>
                    {nrStreams.map(s => (
                      <StreamRow key={s.id} stream={s} isDarkMode={isDarkMode} />
                    ))}
                  </>
                )}
              </div>
            )}

            {abaAtiva === 'expansao' && (
              <div>
                {oportunidadesExpansao.length === 0 ? (
                  <div style={{ fontSize: '12px', color: labelColor, textAlign: 'center', padding: '16px 0' }}>
                    Cliente já possui todas as famílias de produto
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: '10px', color: labelColor, marginBottom: '8px' }}>
                      Oportunidades identificadas por gap de portfólio — estimativa por porte {PORTE_LABELS[resolvedPorte].toLowerCase()}
                    </div>
                    {oportunidadesExpansao.map(s => (
                      <StreamRow key={s.id} stream={s} isDarkMode={isDarkMode} />
                    ))}
                    <div
                      style={{
                        marginTop: '10px',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        background: isDarkMode ? '#0b1220' : '#f0fdf4',
                        border: `1px solid #10b98133`,
                        fontSize: '11px',
                        color: valueColor,
                      }}
                    >
                      <span style={{ color: '#10b981', fontWeight: 700 }}>Potencial total de expansão: </span>
                      {formatarMoeda(
                        oportunidadesExpansao
                          .filter(o => o.valorAnual)
                          .reduce((acc, o) => acc + (o.valorAnual ?? 0), 0),
                      )}{'/ano + '}
                      {formatarMoeda(
                        oportunidadesExpansao
                          .filter(o => o.custoImplantacao)
                          .reduce((acc, o) => acc + (o.custoImplantacao ?? 0), 0),
                      )}{' NR'}
                    </div>
                  </>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default RevenueIntelligence;
