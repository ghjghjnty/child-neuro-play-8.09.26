import React from 'react';
import { BrtPlayMode } from '../types';

interface LoopButtonProps {
  mode: BrtPlayMode;
  onToggle: () => void;
  currentTrackNum?: number;
  totalTracksInQueue?: number;
}

export const LoopButton: React.FC<LoopButtonProps> = ({
  mode,
  onToggle,
  currentTrackNum,
  totalTracksInQueue,
}) => {
  const getButtonConfig = () => {
    switch (mode) {
      case 'track':
        return {
          title: 'Обычное воспроизведение по длине трека (без зацикливания)',
          badgeText: '',
          containerClass:
            'bg-slate-900/90 hover:bg-slate-800 border-slate-500/70 text-slate-300 shadow-[0_0_10px_rgba(148,163,184,0.25)]',
          badgeClass: '',
        };
      case 'normal_5m':
        return {
          title: 'Д — Детский режим: фабула 20 минут',
          badgeText: 'Д',
          containerClass:
            'bg-emerald-950/90 hover:bg-emerald-900 border-emerald-400/80 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.45)]',
          badgeClass: 'text-emerald-300 bg-emerald-900/60 border-emerald-500/40',
        };
      case 'single_20m':
        return {
          title: '1Брт — 1 борт 20 минут',
          badgeText: '1Брт',
          containerClass:
            'bg-sky-950/90 hover:bg-sky-900 border-sky-400/80 text-sky-300 shadow-[0_0_12px_rgba(56,189,248,0.45)]',
          badgeClass: 'text-sky-300 bg-sky-900/60 border-sky-500/40',
        };
      case 'all_20m':
        return {
          title: '4Брт — 4 борта 20 минут',
          badgeText: '4Брт',
          containerClass:
            'bg-amber-950/90 hover:bg-amber-900 border-amber-400/80 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.45)]',
          badgeClass: 'text-amber-300 bg-amber-900/60 border-amber-500/40',
        };
      default:
        return {
          title: 'Обычное воспроизведение по длине трека (без зацикливания)',
          badgeText: '',
          containerClass:
            'bg-slate-900/90 hover:bg-slate-800 border-slate-500/70 text-slate-300 shadow-[0_0_10px_rgba(148,163,184,0.25)]',
          badgeClass: '',
        };
    }
  };

  const config = getButtonConfig();

  return (
    <button
      id="btn_loop_mode_toggle"
      type="button"
      onClick={onToggle}
      className={`h-7 ${
        config.badgeText ? 'px-2 sm:px-2.5 gap-1.5' : 'px-2 justify-center'
      } rounded-lg border flex items-center transition-all duration-200 cursor-pointer select-none active:scale-95 backdrop-blur-md shadow-md ${config.containerClass}`}
      title={config.title}
      aria-label={config.title}
    >
      {/* SVG значок зацикливания */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-3.5 h-3.5 flex-shrink-0"
      >
        <path d="m17 2 4 4-4 4" />
        <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
        <path d="m7 22-4-4 4-4" />
        <path d="M21 13v1a4 4 0 0 1-4 4H3" />
      </svg>

      {/* Название активного режима (если задан) */}
      {config.badgeText ? (
        <span
          className={`text-[11px] font-bold tracking-tight whitespace-nowrap px-1 py-0.2 rounded border ${config.badgeClass}`}
        >
          {config.badgeText}
        </span>
      ) : null}
    </button>
  );
};

