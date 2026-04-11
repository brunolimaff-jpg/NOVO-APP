import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ScorePortaData } from '../types';
import { getPortaCompatibility, normalizePortaFlags, PORTA_FLAG_META } from '../utils/porta';

interface ScorePortaProps extends ScorePortaData {
  isDarkMode?: boolean;
}

const pillars = [
  { key: 'p', letter: 'P', short: 'Porte', label: 'Porte / massa crítica' },
  { key: 'o', letter: 'O', short: 'Operação', label: 'Operação / cadeia' },
  { key: 'r', letter: 'R', short: 'Retorno', label: 'Retorno / pressão externa' },
  { key: 't', letter: 'T', short: 'Tecnologia', label: 'Tecnologia / dor + troca' },
  { key: 'a', letter: 'A', short: 'Adoção', label: 'Adoção / governança + timing' },
] as const;

const PILLAR_EXPLANATIONS: Record<string, { title: string; text: string }> = {
  p: {
    title: 'Porte (P)',
    text: 'Mede escala da conta: tamanho de operação, massa crítica e potencial de projeto.',
  },
  o: {
    title: 'Operação (O)',
    text: 'Mostra complexidade operacional: processos, cadeia e necessidade real de gestão integrada.',
  },
  r: {
    title: 'Retorno (R)',
    text: 'Reflete pressão externa e risco/oportunidade de ROI para acelerar decisão comercial.',
  },
  t: {
    title: 'Tecnologia (T)',
    text: 'Avalia dor tecnológica atual, legado e espaço para troca de solução.',
  },
  a: {
    title: 'Adoção (A)',
    text: 'Indica maturidade de governança e timing político para aderir à mudança.',
  },
};

  const ScorePorta: React.FC<ScorePortaProps> = (scoreData = {} as ScorePortaProps) => {
  const {
    score = 0,
    p = 0,
    o = 0,
    r = 0,
    t = 0,
    a = 0,
    segmento = 'Não Identificado',
    flags = [],
    isDarkMode = true,
  } = scoreData;

  const [activePillar, setActivePillar] = useState<string | null>(null);
  const compatibility = getPortaCompatibility(score);
  const barColor = compatibility.color;
  const barBg = compatibility.background;

  const cardBg = isDarkMode ? '#0f172a' : '#ffffff';
  const pillBg = isDarkMode ? '#1e293b' : '#f1f5f9';
  const labelColor = isDarkMode ? '#94a3b8' : '#64748b';
  const valueColor = isDarkMode ? '#e2e8f0' : '#334155';
  const subColor = isDarkMode ? '#475569' : '#94a3b8';
  const badgeBg = isDarkMode ? '#111827' : '#e2e8f0';
  const subtleBg = isDarkMode ? '#0b1220' : '#f8fafc';
  const subtleBorder = isDarkMode ? 'rgba(148,163,184,0.12)' : '#e2e8f0';

  const validFlags = normalizePortaFlags(flags ?? []).filter(flag => flag in PORTA_FLAG_META);
  const values: Record<string, number> = { p, o, r, t, a };
  const justificativasObj: Record<string, string> = { 
    p: scoreData.justificativas?.P || '',
    o: scoreData.justificativas?.O || '',
    r: scoreData.justificativas?.R || '',
    t: scoreData.justificativas?.T || '',
    a: scoreData.justificativas?.A || ''
  };

  const activeExplanation = useMemo(() => {
    if (!activePillar) return null;
    
    const defaultExp = PILLAR_EXPLANATIONS[activePillar];
    const justification = justificativasObj[activePillar];
    
    return {
      title: defaultExp.title,
      text: justification || defaultExp.text,
      isCustom: !!justification
    };
  }, [activePillar, justificativasObj]);

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
          marginBottom: '8px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '16px' }}>🎯</span>
            <span
              title="P = Porte · O = Operação · R = Retorno · T = Tecnologia · A = Adoção"
              style={{
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                color: labelColor,
                cursor: 'help',
              }}
            >
              PORTA
            </span>
            <span
              title={segmento}
              style={{
                padding: '3px 8px',
                borderRadius: '999px',
                background: `${barColor}14`,
                color: barColor,
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.4px',
              }}
            >
              {segmento}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            style={{ fontSize: '28px', fontWeight: 800, color: barColor, lineHeight: 1 }}
          >
            {score}
          </motion.span>
          <span style={{ fontSize: '14px', fontWeight: 600, color: subColor }}>/100</span>
        </div>
      </div>

      <div
        style={{
          width: '100%',
          height: '8px',
          borderRadius: '4px',
          background: barBg,
          marginBottom: '10px',
          overflow: 'hidden',
        }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(score, 100)}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{ height: '100%', borderRadius: '4px', background: barColor }}
        />
      </div>

      <div style={{ marginBottom: '10px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: barColor }}>
          {compatibility.emoji} {compatibility.label}
        </span>
      </div>

      {validFlags.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            marginBottom: '10px',
            padding: '8px 10px',
            borderRadius: '10px',
            background: subtleBg,
            border: `1px solid ${subtleBorder}`,
          }}
        >
          {validFlags.map(flag => (
            <span
              key={flag}
              title={PORTA_FLAG_META[flag].description}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                borderRadius: '999px',
                background: pillBg,
                color: valueColor,
                fontSize: '11px',
                fontWeight: 700,
              }}
            >
              <span>{PORTA_FLAG_META[flag].icon}</span>
              <span>{PORTA_FLAG_META[flag].shortLabel}</span>
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {pillars.map(({ key, letter, short, label }, idx) => (
          <motion.button
            key={key}
            title={`${label}: ${values[key]}/10 (clique para entender)`}
            type="button"
            onClick={() => setActivePillar(prev => (prev === key ? null : key))}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.08 * (idx + 1), type: 'spring', stiffness: 300 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 10px',
              borderRadius: '20px',
              background: activePillar === key ? `${barColor}22` : badgeBg,
              border: activePillar === key ? `1px solid ${barColor}55` : '1px solid transparent',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontWeight: 700, color: barColor, fontSize: '11px' }}>{letter}</span>
            <span style={{ fontWeight: 700, color: valueColor }}>{values[key]}</span>
            <span style={{ fontSize: '11px', color: labelColor }}>· {short}</span>
          </motion.button>
        ))}
      </div>

      {activeExplanation && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            marginTop: '10px',
            padding: '10px',
            borderRadius: '10px',
            background: activeExplanation.isCustom ? `${barColor}14` : subtleBg,
            border: activeExplanation.isCustom ? `1px solid ${barColor}40` : `1px solid ${subtleBorder}`,
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: activeExplanation.isCustom ? barColor : valueColor, marginBottom: '4px' }}>
            {activeExplanation.title}
          </div>
          <div style={{ fontSize: '11px', color: activeExplanation.isCustom ? valueColor : labelColor }}>
            {activeExplanation.text}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};

export default ScorePorta;
