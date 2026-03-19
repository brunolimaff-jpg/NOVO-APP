import React from 'react';

interface RadarBellProps {
  unreadCount: number;
  isScanning: boolean;
  onClick: () => void;
  isDarkMode: boolean;
}

const RadarBell: React.FC<RadarBellProps> = ({ unreadCount, isScanning, onClick, isDarkMode }) => {
  return (
    <button
      onClick={onClick}
      className={`relative p-2.5 rounded-xl transition-all duration-300 shadow-sm border ${
        isScanning
          ? isDarkMode
            ? 'text-emerald-400 bg-gray-800/80 border-emerald-900/50 backdrop-blur-md animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.2)]'
            : 'text-emerald-600 bg-emerald-50/90 border-emerald-200 backdrop-blur-md animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.2)]'
          : isDarkMode
            ? 'text-gray-400 bg-gray-800/50 border-gray-700/50 backdrop-blur-sm hover:text-amber-400 hover:bg-gray-800 hover:border-amber-900/50'
            : 'text-gray-500 bg-white/80 border-gray-200 backdrop-blur-sm hover:text-amber-500 hover:bg-amber-50/80 hover:border-amber-200'
      }`}
      title={isScanning ? 'Radar varrendo...' : `Radar Setorial${unreadCount > 0 ? ` (${unreadCount} novas)` : ''}`}
    >
      <span className={`text-lg block ${unreadCount > 0 ? 'animate-[bell-shake_0.5s_ease-in-out]' : ''}`}>
        🔔
      </span>
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 leading-none">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
      {isScanning && (
        <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
      )}
    </button>
  );
};

export default RadarBell;
