import { CourseConfig, DayType } from '../types';

const COURSE_STORAGE_KEY = 'artemka_course_v2';
const LEGACY_COURSE_STORAGE_KEY = 'artemka_course_v1';

export const DEFAULT_COURSE: CourseConfig = {
  totalDays: 21,
  currentDay: 0,
  startDate: new Date().toISOString().split('T')[0],
};

export function loadCourseConfig(): CourseConfig {
  try {
    const raw = localStorage.getItem(COURSE_STORAGE_KEY) || localStorage.getItem(LEGACY_COURSE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.totalDays === 'number' && typeof parsed.currentDay === 'number') {
        return {
          totalDays: parsed.totalDays === 14 ? 14 : 21,
          currentDay: Math.max(0, Math.min(35, parsed.currentDay)),
          startDate: parsed.startDate || DEFAULT_COURSE.startDate,
        };
      }
    }
  } catch (e) {
    console.error('Failed to load course config', e);
  }
  return DEFAULT_COURSE;
}

export const STORAGE_LAST_INCREMENT_CYCLE_KEY = 'artemka_last_auto_increment_cycle';

/**
 * Получить строковый идентификатор суточного цикла (граница в 04:00 утра).
 * Время от 04:00:00 сегодняшнего дня до 03:59:59 завтрашнего дня
 * принадлежит одному и тому же суточному терапевтическому циклу.
 */
export function getCycleDateKey(fromTime: number = Date.now()): string {
  const d = new Date(fromTime);
  if (d.getHours() < 4) {
    d.setDate(d.getDate() - 1);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Проверяет и выполняет автоматическое увеличение номера дня на +1 при утреннем триггере 04:00.
 * Инкремент выполняется СТРОГО 1 раз за сутки для текущего утреннего цикла.
 *
 * @param now Текущее системное время в миллисекундах.
 * @param forceIfNewMorning Если true (например, при явном пробуждении из SLEEP_UNTIL_4AM
 *                           или истечении ночной границы 04:00), при отсутствии предыдущей записи
 *                           выполняется инкремент дня.
 * @returns Обновлённый CourseConfig если инкремент произошёл, либо null если инкремент сегодня уже выполнялся.
 */
export function autoIncrementCourseDayOn4Am(
  now: number = Date.now(),
  forceIfNewMorning: boolean = false
): CourseConfig | null {
  try {
    const currentCycleKey = getCycleDateKey(now);
    const lastCycleKey = localStorage.getItem(STORAGE_LAST_INCREMENT_CYCLE_KEY);

    // Строгая проверка: если в текущие терапевтические сутки (от 04:00 до 03:59:59)
    // инкремент уже выполнялся — повторный вызов полностью блокируется.
    if (lastCycleKey === currentCycleKey) {
      return null;
    }

    // Если приложение запущено впервые посреди дня (без спящего режима),
    // фиксируем текущий цикл как начальную точку, чтобы не делать неожиданный скачок дня.
    if (!lastCycleKey && !forceIfNewMorning) {
      localStorage.setItem(STORAGE_LAST_INCREMENT_CYCLE_KEY, currentCycleKey);
      return null;
    }

    // Загружаем текущую конфигурацию курса и инкрементируем день: День = Текущий день + 1
    const currentConfig = loadCourseConfig();
    const newDay = currentConfig.currentDay + 1;
    const updatedConfig: CourseConfig = {
      ...currentConfig,
      currentDay: newDay,
    };

    // Сохраняем в постоянную память LocalStorage
    saveCourseConfig(updatedConfig);
    // Фиксируем метку выполненного суточного инкремента
    localStorage.setItem(STORAGE_LAST_INCREMENT_CYCLE_KEY, currentCycleKey);

    return updatedConfig;
  } catch (e) {
    console.error('Failed to auto increment course day on 4am:', e);
    return null;
  }
}

export function saveCourseConfig(config: CourseConfig) {
  try {
    localStorage.setItem(COURSE_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save course config', e);
  }
}

export interface DayStatus {
  dayNumber: number;
  dayType: DayType;
  title: string;
  subtitle: string;
  isLocked: boolean;
  colorClass: string;
  badgeBg: string;
}

export function getDayStatus(currentDay: number, totalDays: 14 | 21): DayStatus {
  // 0. Если текущий день 0 (курс ещё не начат или находится в состоянии ожидания)
  if (currentDay <= 0) {
    return {
      dayNumber: 0,
      dayType: 'THERAPY',
      title: 'ДЕНЬ 0',
      subtitle: 'Ожидание старта (нажмите длительность курса)',
      isLocked: false,
      colorClass: 'text-neutral-300',
      badgeBg: 'bg-neutral-800/80 text-neutral-300 border-neutral-600/50',
    };
  }

  // 1. Проверяем, находится ли день внутри курса
  if (currentDay <= totalDays) {
    // Цикл 5/2 (5 дней терапии + 2 дня выходных)
    const cycleDay = ((currentDay - 1) % 7) + 1; // 1, 2, 3, 4, 5, 6, 7

    if (cycleDay <= 5) {
      // 5 дней терапии (числа горят белым цветом, светофор работает)
      return {
        dayNumber: currentDay,
        dayType: 'THERAPY',
        title: `ДЕНЬ ${currentDay}`,
        subtitle: `Терапия (${cycleDay} из 5 дней недели)`,
        isLocked: false,
        colorClass: 'text-white',
        badgeBg: 'bg-white/15 text-white border-white/40',
      };
    } else {
      // 2 дня отдыха (числа выходных дней горят оранжевым цветом, светофор заблокирован, значок сна 💤)
      const restDay = cycleDay - 5; // 1 или 2 день выходного
      return {
        dayNumber: currentDay,
        dayType: 'WEEKEND',
        title: `ДЕНЬ ${currentDay}`,
        subtitle: `💤 Выходной (${restDay}/2) — нейроотдых`,
        isLocked: true,
        colorClass: 'text-orange-400',
        badgeBg: 'bg-orange-950/60 text-orange-300 border-orange-500/50',
      };
    }
  }

  // 2. После окончания курса — 5 дней межкурсового отдыха (числа дней горят зеленым цветом)
  const postCourseDay = currentDay - totalDays;
  if (postCourseDay <= 5) {
    return {
      dayNumber: currentDay,
      dayType: 'POST_COURSE',
      title: `ДЕНЬ ${currentDay}`,
      subtitle: `🌱 Межкурсовой отдых (${postCourseDay} из 5)`,
      isLocked: true,
      colorClass: 'text-emerald-400',
      badgeBg: 'bg-emerald-950/60 text-emerald-300 border-emerald-500/50',
    };
  }

  // Курс полностью завершён
  return {
    dayNumber: currentDay,
    dayType: 'POST_COURSE',
    title: `КУРС ЗАВЕРШЁН`,
    subtitle: `Все ${totalDays} дней и 5 дней отдыха пройдены`,
    isLocked: true,
    colorClass: 'text-emerald-300',
    badgeBg: 'bg-emerald-950/70 text-emerald-300 border-emerald-400/60',
  };
}
