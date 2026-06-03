import React from 'react';
import { ClockIcon } from './LoadingShared';

interface LoadingOverlayHeaderProps {
  isDarkMode: boolean;
  companyFocus: string;
  elapsed: string;
  confirmStop: boolean;
  onStop?: () => void;
  onRequestStop: () => void;
  onCancelStop: () => void;
}

export const LoadingOverlayHeader: React.FC<LoadingOverlayHeaderProps> = React.memo(
  ({ isDarkMode, companyFocus, elapsed, confirmStop, onStop, onRequestStop, onCancelStop }) => (
    <div
      className={`flex-shrink-0 flex flex-wrap items-center justify-between gap-2 px-4 md:px-8 py-3 md:py-4 border-b ${
        isDarkMode ? 'border-slate-800' : 'border-slate-200'
      }`}
    >
      <div className="flex w-full min-w-0 items-center gap-2 md:w-auto md:gap-3">
        <div
          className={`w-3 h-3 flex-shrink-0 rounded-full animate-pulse ${isDarkMode ? 'bg-emerald-400' : 'bg-emerald-500'}`}
        />
        <h1
          className={`text-sm md:text-base font-bold tracking-tight truncate ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}
        >
          Senior Scout 360
        </h1>
        {companyFocus && (
          <span
            className={`hidden sm:inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full flex-shrink-0 ${
              isDarkMode
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'bg-emerald-100 text-emerald-700 border border-emerald-300'
            }`}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
              />
            </svg>
            {companyFocus}
          </span>
        )}
      </div>
      <div className="relative z-20 ml-0 flex w-full flex-wrap items-center justify-end gap-2 md:ml-2 md:w-auto md:gap-3">
        <span
          className={`flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded-lg ${
            isDarkMode
              ? 'bg-slate-800 text-emerald-400 border border-slate-700'
              : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
          }`}
        >
          <ClockIcon className="w-3.5 h-3.5" />
          {elapsed}
        </span>
        {onStop &&
          (confirmStop ? (
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <span className={`text-xs font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                Interromper?
              </span>
              <button
                type="button"
                onClick={() => {
                  onCancelStop();
                  onStop();
                }}
                className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-full transition-all text-xs font-bold"
              >
                Sim
              </button>
              <button
                type="button"
                onClick={onCancelStop}
                className={`px-3 py-1.5 rounded-full transition-all text-xs font-bold border ${
                  isDarkMode
                    ? 'border-slate-600 text-slate-400 hover:bg-slate-700'
                    : 'border-slate-300 text-slate-500 hover:bg-slate-100'
                }`}
              >
                Não
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onRequestStop}
              className="bg-red-500/10 hover:bg-red-500 border border-red-500/30 text-red-500 hover:text-white px-3 md:px-4 py-1.5 rounded-full transition-all text-xs font-bold"
            >
              Interromper
            </button>
          ))}
      </div>
    </div>
  ),
);
