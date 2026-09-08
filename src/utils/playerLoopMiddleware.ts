import { AudioItem, BrtPlayMode, LoopMode } from '../types';

export const BRT_PLAY_MODES: BrtPlayMode[] = ['track', 'normal_5m', 'single_20m', 'all_20m'];
export const LOOP_MODES: LoopMode[] = BRT_PLAY_MODES;

export const SESSION_DURATION_MAP: Record<BrtPlayMode, number> = {
  track: 0, // Без зацикливания (по длине трека)
  normal_5m: 20 * 60, // 1200 сек (20 минут) — Детский режим «Д» для фабул
  single_20m: 20 * 60, // 1200 сек (20 минут)
  all_20m: 20 * 60, // 1200 сек (20 минут) — 4 борта 20 минут
};

/**
 * Расчёт общей длительности сессии для режима «4Брт»:
 * Линейный плейлист: сумма длительностей треков строго с 1-го по 4-й (без зацикливания по кругу).
 */
export function calculate4BrtSessionDuration(queue: AudioItem[]): number {
  if (!queue || queue.length === 0) return 0;
  let totalSec = 0;
  const count = Math.min(4, queue.length);
  for (let i = 0; i < count; i++) {
    const track = queue[i];
    totalSec += track?.durationSeconds && track.durationSeconds > 0 ? track.durationSeconds : 120;
  }
  return totalSec;
}

const STORAGE_KEY = 'artemka_brt_play_mode';

export function getSavedBrtPlayMode(): BrtPlayMode {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val === 'track' || val === 'normal_5m' || val === 'single_20m' || val === 'all_20m') {
      return val;
    }
  } catch {}
  return 'track';
}

export const getSavedLoopMode = getSavedBrtPlayMode;

export function saveBrtPlayMode(mode: BrtPlayMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {}
}

export const saveLoopMode = saveBrtPlayMode;

export function getNextBrtPlayMode(current: BrtPlayMode): BrtPlayMode {
  const currentIndex = BRT_PLAY_MODES.indexOf(current);
  if (currentIndex === -1) return 'track';
  return BRT_PLAY_MODES[(currentIndex + 1) % BRT_PLAY_MODES.length];
}

export const getNextLoopMode = getNextBrtPlayMode;

export interface NextTrackDecision {
  action: 'repeat_current' | 'play_next_index' | 'finish_session';
  nextIndex?: number;
}

/**
 * Логика выбора следующего действия при окончании трека:
 *
 * Состояние 1 (track): «По треку»
 *   Обычное воспроизведение по длине трека (без зацикливания).
 *
 * Состояние 2 (normal_5m): «Д» — Детский режим
 *   Фабула играет ровно 20 минут (зацикливается до 20 минут в логике фабул).
 *   Для БРТ этот пункт не зацикливает (играет по длине трека).
 *
 * Состояние 3 (single_20m): «1 Брт 20м»
 *   Выбранный трек БРТ непрерывно зацикливается, пока общий таймер сессии не достигнет 20 минут.
 *
 * Состояние 4 (all_20m): «4Брт»
 *   Треки проигрываются в очереди друг за другом (1 -> 2 -> 3 -> 4, либо по кругу 1-2-1-2 / 1-2-3-1, если треков < 4).
 *   Смена продолжается строго до завершения 4-го трека по счёту.
 */
export function resolveNextTrackDecision(
  mode: BrtPlayMode,
  currentIndex: number,
  queueLength: number,
  playedCount?: number
): NextTrackDecision {
  if (mode === 'track' || mode === 'normal_5m') {
    // Состояние 1 и 2: для БРТ воспроизведение по длине трека (без зацикливания)
    return { action: 'finish_session' };
  }

  if (mode === 'single_20m') {
    // Состояние 3: 1 трек непрерывно зацикливается до истечения 20 минут
    return { action: 'repeat_current', nextIndex: currentIndex };
  }

  if (mode === 'all_20m') {
    // Состояние 4: «4Брт»
    // Треки проигрываются по очереди друг за другом:
    // Когда заканчивается последний трек списка (например, 4-й), очередь не останавливается,
    // а бесшовно переходит обратно на 1-й трек по кольцевому циклу (index + 1) % queue.length.
    // Если в папке загружено меньше 4 треков (например, 2 или 3), они точно так же циклично сменяют друг друга по кругу: 1 -> 2 -> 1 -> 2...
    const len = Math.max(1, queueLength);
    const nextIdx = (currentIndex + 1) % len;
    return { action: 'play_next_index', nextIndex: nextIdx };
  }

  return { action: 'finish_session' };
}


