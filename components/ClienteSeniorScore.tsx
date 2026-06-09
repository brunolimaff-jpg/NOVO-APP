import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ClienteSeniorData } from '../types';
import { formatCnpj } from '../utils/cnpj';

interface ClienteSeniorScoreProps {
  data: ClienteSeniorData;
  isDarkMode?: boolean;
  cnpj?: string | null;
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

const isScoreDataAvailable = (data: ClienteSeniorScoreProps['data']): boolean =>
  Boolean(data.encontrado) && data.matchType === 'exact' && Boolean(data.familias?.length);

const ClienteSeniorScore: React.FC<ClienteSeniorScoreProps> = ({ data, isDarkMode = true, cnpj }) => {
  const [activeFamily, setActiveFamily] = useState<string | null>(null);

  if (!isScoreDataAvailable(data)) return null;

  const cardBg = isDarkMode ? '#0f172a' : '#ffffff';
  const barColor = isDarkMode ? '#10b981' : '#059669'; // Emerald
  const subtleBg = isDarkMode ? '#0b1220' : '#f8fafc';
  const subtleBorder = isDarkMode ? 'rgba(148,163,184,0.12)' : '#e2e8f0';
  const labelColor = isDarkMode ? '#94a3b8' : '#64748b';
  const valueColor = isDarkMode ? '#e2e8f0' : '#334155';
  const badgeBg = isDarkMode ? '#111827' : '#e2e8f0';

  const modulosArray = Object.entries(data.modulosPorFamilia || {});

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        margin: '0 0 16px',
        padding: '14px 16px',
        borderRadius: '12px',
        border: `1.5px solid ${barColor}40`,
        background: cardBg,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '16px' }}>✅</span>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                color: labelColor,
              }}
            >
              CLIENTE SENIOR CONFIRMADO
            </span>
          </div>
          {data.grupo && (
            <div style={{ fontSize: '11px', color: labelColor, fontWeight: 500 }}>
              Grupo: <span style={{ color: valueColor, fontWeight: 600 }}>{data.grupo}</span>
            </div>
          )}
          {cnpj && (
            <div style={{ fontSize: '10px', color: labelColor, fontWeight: 400, opacity: 0.8 }}>
              CNPJ: <span style={{ color: valueColor, fontWeight: 500 }}>{formatCnpj(cnpj)}</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            style={{ fontSize: '28px', fontWeight: 800, color: barColor, lineHeight: 1 }}
          >
            {data.totalModulos || 0}
          </motion.span>
          <span style={{ fontSize: '14px', fontWeight: 600, color: labelColor }}>
            Módulo{data.totalModulos !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {modulosArray.map(([fam, modulos], idx) => {
          if (fam === 'Infra' || fam === 'Outros') return null;
          return (
            <motion.button
              key={fam}
              type="button"
              onClick={() => setActiveFamily(prev => (prev === fam ? null : fam))}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.08 * (idx + 1), type: 'spring', stiffness: 300 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 10px',
                borderRadius: '20px',
                background: activeFamily === fam ? `${barColor}22` : badgeBg,
                border: activeFamily === fam ? `1px solid ${barColor}55` : '1px solid transparent',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: '11px' }}>{FAMILIA_ICONS[fam] || '📦'}</span>
              <span style={{ fontWeight: 700, color: valueColor }}>{fam}</span>
              <span style={{ fontSize: '11px', color: labelColor, fontWeight: 600 }}>
                · {Array.isArray(modulos) ? modulos.length : 1}
              </span>
            </motion.button>
          );
        })}
      </div>

      {activeFamily && data.modulosPorFamilia?.[activeFamily] && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            marginTop: '10px',
            padding: '10px',
            borderRadius: '10px',
            background: subtleBg,
            border: `1px solid ${subtleBorder}`,
          }}
        >
          <div
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: barColor,
              marginBottom: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>{FAMILIA_ICONS[activeFamily] || '📦'}</span>
            Módulos contratados - {activeFamily}
          </div>
          <div style={{ fontSize: '12px', color: valueColor, lineHeight: 1.5 }}>
            {Array.isArray(data.modulosPorFamilia[activeFamily])
              ? data.modulosPorFamilia[activeFamily].join(' • ')
              : data.modulosPorFamilia[activeFamily]}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};

export default ClienteSeniorScore;
