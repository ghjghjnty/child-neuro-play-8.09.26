import { motion } from 'motion/react';
import { Play, Square, Music, Volume2 } from 'lucide-react';
import { TrafficColor } from '../types';

interface TrafficButtonProps {
  color: TrafficColor;
  title: string;
  subtitle: string;
  isActive: boolean;
  isPlaying: boolean;
  onPress: (color: TrafficColor) => void;
  id?: string;
}

const colorStyles: Record<
  TrafficColor,
  {
    name: string;
    bgOff: string;
    bgOn: string;
    glow: string;
    ring: string;
    border: string;
    badgeBg: string;
    badgeText: string;
    highlight: string;
  }
> = {
  red: {
    name: 'Красный',
    bgOff: 'bg-gradient-to-b from-rose-950/80 via-red-950 to-neutral-950',
    bgOn: 'bg-gradient-to-b from-red-500 via-rose-600 to-red-700',
    glow: 'shadow-[0_0_60px_rgba(239,68,68,0.75)]',
    ring: 'border-red-400/80',
    border: 'border-red-900/60',
    badgeBg: 'bg-red-500/20 text-red-300 border-red-500/30',
    badgeText: 'text-red-200',
    highlight: 'from-red-300/40 via-red-500/20 to-transparent',
  },
  yellow: {
    name: 'Жёлтый',
    bgOff: 'bg-gradient-to-b from-amber-950/80 via-yellow-950 to-neutral-950',
    bgOn: 'bg-gradient-to-b from-amber-300 via-yellow-400 to-amber-500',
    glow: 'shadow-[0_0_60px_rgba(245,158,11,0.85)]',
    ring: 'border-amber-300/80',
    border: 'border-amber-900/60',
    badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    badgeText: 'text-amber-100',
    highlight: 'from-amber-200/50 via-yellow-400/30 to-transparent',
  },
  green: {
    name: 'Зелёный',
    bgOff: 'bg-gradient-to-b from-emerald-950/80 via-green-950 to-neutral-950',
    bgOn: 'bg-gradient-to-b from-emerald-400 via-green-500 to-emerald-600',
    glow: 'shadow-[0_0_60px_rgba(16,185,129,0.85)]',
    ring: 'border-emerald-300/80',
    border: 'border-emerald-900/60',
    badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    badgeText: 'text-emerald-100',
    highlight: 'from-emerald-200/50 via-green-400/30 to-transparent',
  },
};

export function TrafficButton({
  color,
  title,
  subtitle,
  isActive,
  isPlaying,
  onPress,
  id,
}: TrafficButtonProps) {
  const style = colorStyles[color];
  const activeAndPlaying = isActive && isPlaying;

  return (
    <div className="flex flex-col items-center group w-full" id={id || `traffic-btn-wrapper-${color}`}>
      {/* Visual Visor Hood (Крырек светофора) */}
      <div className="w-40 sm:w-48 h-3 bg-neutral-800 rounded-t-full border-t border-x border-neutral-700 shadow-md relative -mb-1 z-10 opacity-75" />

      {/* Main 3D Tactile Push Button */}
      <motion.button
        id={`traffic-button-${color}`}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.94, y: 3 }}
        onClick={() => onPress(color)}
        className={`relative w-36 h-36 sm:w-44 sm:h-44 rounded-full flex flex-col items-center justify-center p-3 transition-all duration-300 cursor-pointer select-none border-4 outline-none focus:outline-none ${
          activeAndPlaying
            ? `${style.bgOn} ${style.glow} ${style.ring} ring-4 ring-offset-4 ring-offset-neutral-900 ring-white/40`
            : `${style.bgOff} ${style.border} hover:brightness-125 border-neutral-700/60 shadow-inner`
        }`}
        style={{
          boxShadow: activeAndPlaying
            ? undefined
            : 'inset 0 10px 20px rgba(0,0,0,0.8), 0 6px 12px rgba(0,0,0,0.6)',
        }}
        aria-label={`${style.name} сигнал: ${title}`}
      >
        {/* Glass lens reflection overlay */}
        <div
          className={`absolute inset-1 rounded-full bg-gradient-to-b ${
            activeAndPlaying ? style.highlight : 'from-white/10 via-transparent to-black/30'
          } pointer-events-none`}
        />

        {/* Textured lens grid pattern */}
        <div className="absolute inset-2 rounded-full opacity-20 pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:8px_8px]" />

        {/* Pulsing halo ring when playing */}
        {activeAndPlaying && (
          <motion.div
            animate={{
              scale: [1, 1.15, 1],
              opacity: [0.7, 0.2, 0.7],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute inset-0 rounded-full border-2 border-white/50 pointer-events-none"
          />
        )}

        {/* Center Icon & Status */}
        <div className="relative z-10 flex flex-col items-center justify-center pointer-events-none text-white drop-shadow-md">
          {activeAndPlaying ? (
            <motion.div
              animate={{ scale: [0.95, 1.08, 0.95] }}
              transition={{ duration: 1.2, repeat: Infinity }}
              className="flex items-center justify-center w-12 h-12 rounded-full bg-black/25 backdrop-blur-sm"
            >
              <Volume2 className="w-7 h-7 text-white" />
            </motion.div>
          ) : (
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-black/30 border border-white/10">
              <Play className="w-6 h-6 ml-1 text-white/90" />
            </div>
          )}

          {/* Equalizer animation lines when playing */}
          {activeAndPlaying && (
            <div className="flex items-end gap-1 h-4 mt-2">
              <motion.span
                animate={{ height: ['4px', '16px', '6px'] }}
                transition={{ duration: 0.4, repeat: Infinity, repeatType: 'reverse' }}
                className="w-1 bg-white rounded-full"
              />
              <motion.span
                animate={{ height: ['12px', '4px', '14px'] }}
                transition={{ duration: 0.35, repeat: Infinity, repeatType: 'reverse', delay: 0.1 }}
                className="w-1 bg-white rounded-full"
              />
              <motion.span
                animate={{ height: ['6px', '16px', '8px'] }}
                transition={{ duration: 0.45, repeat: Infinity, repeatType: 'reverse', delay: 0.2 }}
                className="w-1 bg-white rounded-full"
              />
            </div>
          )}
        </div>
      </motion.button>

      {/* Button Label for Child & Grandfather */}
      <div className="mt-3 text-center">
        <div className="font-bold text-lg sm:text-xl text-neutral-100 tracking-wide flex items-center justify-center gap-1.5">
          <span>{title}</span>
          {activeAndPlaying && (
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-400 animate-ping" />
          )}
        </div>
        <div className="text-xs sm:text-sm text-neutral-400 font-medium">
          {subtitle}
        </div>
      </div>
    </div>
  );
}
