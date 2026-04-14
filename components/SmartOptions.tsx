import React from 'react';
import { cleanSuggestionText } from '../utils/textCleaners';

interface SmartOptionsProps {
  options: string[];
  onPreFillInput: (text: string) => void;
  isRegenerating?: boolean;
  onRegenerate?: () => void;
}

export function parseSmartOptions(text?: string): { cleanText: string; options: string[] } {
  if (!text) return { cleanText: '', options: [] };

  // Tenta vários padrões de cabeçalho de sugestões (do mais específico ao mais genérico)
  const regexes = [
    // Com separador (---, ___, ***) antes do header
    /(?:---|___|\*\*\*)\s*[\r\n]+(?:\*\*|##|###)?\s*(?:🔎|⚡|🤠)?\s*(?:O que você quer descobrir agora|E aí, onde a gente joga o adubo agora|E aí, qual desses você quer cavucar|Próximos passos|Sugestões?(?:\s+de\s+perguntas)?)(?:.*?)[\r\n]+/i,
    // Sem separador: **Sugestões** ou ## Sugestões (no fim do texto)
    /\n+(?:\*\*|##|###)\s*(?:🔎|⚡|🤠)?\s*(?:Sugestões?(?:\s+de\s+perguntas)?|Próximos\s+passos|O que você quer descobrir agora)\s*\*?\*?\s*[\r\n]+/i,
  ];

  for (const regex of regexes) {
    const parts = text.split(regex);
    if (parts.length >= 2) {
      const cleanText = parts[0].trim();
      const suggestionsBlock = parts[parts.length - 1];

      const lines = suggestionsBlock.split('\n');
      const options = lines
        .map(line => line.trim())
        .filter(line => /^[*+\-•]\s/.test(line) || /^\d+\./.test(line))
        .map(line => {
            const clean = line
                .replace(/^[*+•\d.-]+\s*/, '')
                .replace(/^"|"$|^'|'$/g, '')
                .replace(/\*+$/, '')
                .trim();
            return cleanSuggestionText(clean);
        })
        .filter(line => line.length > 0)
        .slice(0, 4);

      if (options.length > 0) {
        return { cleanText, options };
      }
    }
  }

  return { cleanText: text, options: [] };
}

const SmartOptions: React.FC<SmartOptionsProps> = ({ 
  options, 
  onPreFillInput,
  isRegenerating = false,
  onRegenerate
}) => {
  if (!options || options.length === 0) return null;

  return (
    <div className="mt-4 flex w-full min-w-0 flex-col gap-2 animate-fade-in select-none">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wider opacity-50">
          💡 Sugestões
        </span>
        {onRegenerate && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onRegenerate();
            }}
            disabled={isRegenerating}
            className={`flex shrink-0 items-center gap-1 text-[10px] opacity-50 transition-opacity hover:opacity-100 ${isRegenerating ? 'animate-pulse cursor-not-allowed' : ''}`}
            title="Gerar novas sugestões baseadas neste contexto"
          >
            {isRegenerating ? '↻ Gerando...' : '↻ Novas'}
          </button>
        )}
      </div>
      
      {/* Grid flexível: mobile 1 coluna, tablet 2, desktop 2-3 */}
      <div className="grid w-full min-w-0 grid-cols-1 items-stretch gap-2 sm:grid-cols-2">
        {options.map((option, idx) => (
          <button
            key={idx}
            onClick={() => onPreFillInput(option)}
            className="flex min-h-[44px] w-full min-w-0 items-center rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-left text-xs text-emerald-700 shadow-sm transition-all active:scale-[0.98] hover:bg-emerald-100 dark:border-emerald-900/30 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
          >
            <span className="block w-full break-words line-clamp-2">{option}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default React.memo(SmartOptions);
