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
      type="button"
      onClick={onClick}
      className={`relative rounded-lg p-2 transition-colors duration-200 ${
        isScanning
          ? isDarkMode
            ? 'text-emerald-400 animate-pulse hover:bg-gray-800'
            : 'text-emerald-600 animate-pulse hover:bg-gray-100'
          : isDarkMode
            ? 'text-gray-500 hover:bg-gray-800 hover:text-amber-400'
            : 'text-gray-400 hover:bg-gray-100 hover:text-amber-500'
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
