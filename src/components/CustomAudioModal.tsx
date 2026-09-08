import React, { useRef } from 'react';
import { TrafficColor, TrafficTrack } from '../types';
import { Upload, RotateCcw, X, Check, Music } from 'lucide-react';

interface CustomAudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: Record<TrafficColor, TrafficTrack>;
  onUpdateTrack: (color: TrafficColor, file: File | null) => void;
  onResetDefaults: () => void;
}

export function CustomAudioModal({
  isOpen,
  onClose,
  tracks,
  onUpdateTrack,
  onResetDefaults,
}: CustomAudioModalProps) {
  const fileInputRefs = {
    red: useRef<HTMLInputElement>(null),
    yellow: useRef<HTMLInputElement>(null),
    green: useRef<HTMLInputElement>(null),
  };

  if (!isOpen) return null;

  const colorMeta: Record<TrafficColor, { title: string; colorClass: string; bgClass: string }> = {
    red: { title: 'Красная кнопка', colorClass: 'text-red-400', bgClass: 'border-red-800/40 bg-red-950/20' },
    yellow: { title: 'Жёлтая кнопка', colorClass: 'text-amber-400', bgClass: 'border-amber-800/40 bg-amber-950/20' },
    green: { title: 'Зелёная кнопка', colorClass: 'text-emerald-400', bgClass: 'border-emerald-800/40 bg-emerald-950/20' },
  };

  const handleFileChange = (color: TrafficColor, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpdateTrack(color, file);
    }
  };

  return (
    <div
      id="custom-audio-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        id="custom-audio-modal-card"
        className="w-full max-w-lg bg-neutral-900 border border-neutral-700 rounded-3xl p-6 shadow-2xl space-y-6 text-neutral-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div>
            <h2 className="text-xl font-bold text-neutral-100 flex items-center gap-2">
              <Music className="w-5 h-5 text-amber-400" />
              Настройка мелодий
            </h2>
            <p className="text-xs text-neutral-400 mt-1">
              Загрузите любимые детские песенки или сказки внука (MP3 / WAV)
            </p>
          </div>
          <button
            id="close-modal-btn"
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white rounded-full hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3 Colors track managers */}
        <div className="space-y-4">
          {(['red', 'yellow', 'green'] as TrafficColor[]).map((color) => {
            const track = tracks[color];
            const meta = colorMeta[color];
            return (
              <div
                key={color}
                className={`p-4 rounded-2xl border ${meta.bgClass} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
              >
                <div>
                  <div className={`font-semibold ${meta.colorClass} flex items-center gap-2 text-sm`}>
                    <span className="w-3 h-3 rounded-full bg-current inline-block" />
                    {meta.title}
                  </div>
                  <div className="text-sm font-medium text-neutral-200 mt-0.5">
                    {track.customFileName ? (
                      <span className="text-white flex items-center gap-1.5">
                        <Check className="w-4 h-4 text-emerald-400" />
                        {track.customFileName}
                      </span>
                    ) : (
                      <span className="text-neutral-400 italic">
                        Встроенная мелодия ({track.defaultTitle})
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRefs[color]}
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => handleFileChange(color, e)}
                  />
                  <button
                    id={`upload-btn-${color}`}
                    onClick={() => fileInputRefs[color].current?.click()}
                    className="px-3.5 py-2 text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-100 border border-neutral-600 rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {track.customFileName ? 'Заменить' : 'Выбрать файл'}
                  </button>

                  {track.customFileName && (
                    <button
                      id={`reset-track-btn-${color}`}
                      onClick={() => onUpdateTrack(color, null)}
                      title="Вернуть встроенную"
                      className="p-2 text-neutral-400 hover:text-red-400 bg-neutral-800/80 hover:bg-neutral-800 rounded-xl transition cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-neutral-800">
          <button
            id="reset-all-tracks-btn"
            onClick={onResetDefaults}
            className="text-xs text-neutral-400 hover:text-neutral-200 flex items-center gap-1.5 py-2 px-3 rounded-lg hover:bg-neutral-800/60 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Сбросить всё на заводские мелодии
          </button>

          <button
            id="done-modal-btn"
            onClick={onClose}
            className="px-5 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow transition cursor-pointer"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}
