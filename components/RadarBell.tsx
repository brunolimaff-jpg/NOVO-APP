import React from 'react';

interface RadarBellProps {
  unreadCount: number;
  isScanning: boolean;
  onClick: () => void;
  isDarkMode: boolean;
}

const RadarBell: React.FC<RadarBellProps> = ({ unreadCount, isScanning, onClick, isDarkMode }) => {
  const hasUnread = unreadCount > 0;

  const colorClasses = isScanning
    ? isDarkMode
      ? 'text-emerald-400 animate-pulse hover:bg-gray-800'
      : 'text-emerald-600 animate-pulse hover:bg-gray-100'
    : hasUnread
      ? isDarkMode
        ? 'text-amber-400 hover:bg-gray-800'
        : 'text-amber-500 hover:bg-gray-100'
      : isDarkMode
        ? 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
        : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center justify-center rounded-lg p-2 transition-all duration-200 ${colorClasses}`}
      title={isScanning ? 'Radar varrendo...' : `Radar Setorial${hasUnread ? ' (novos alertas)' : ''}`}
    >
      {/* Sino Icon */}
      <svg
        className={`w-5 h-5 flex-none ${hasUnread && !isScanning ? 'animate-bell-shake' : ''}`}
        viewBox="0 0 24 24"
        fill={hasUnread ? 'currentColor' : 'none'}
        stroke={hasUnread ? 'none' : 'currentColor'}
        strokeWidth={2}
        aria-hidden="true"
      >
        {hasUnread ? (
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
        ) : (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.437L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        )}
      </svg>

      {/* Ponto de Status (Dot) - Substitui o número */}
      {hasUnread && (
        <span className="absolute top-1.5 right-1.5 flex h-3 w-3">
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isDarkMode ? 'bg-amber-400' : 'bg-amber-500'}`}
          ></span>
          <span
            className={`relative inline-flex rounded-full h-3 w-3 border-2 ${isDarkMode ? 'bg-amber-500 border-gray-900' : 'bg-amber-600 border-white'}`}
          ></span>
        </span>
      )}

      {/* Indicador de varredura ativa (Pulse embaixo) */}
      {isScanning && !hasUnread && (
        <span className="absolute bottom-1.5 w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
      )}
    </button>
  );
};

export default RadarBell;
