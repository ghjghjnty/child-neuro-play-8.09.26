import { LocalNotifications } from '@capacitor/local-notifications';

const REST_NOTIFICATION_ID = 2001;
const REST_CHANNEL_ID = 'rest_timer_channel';

const STORAGE_END_TIME_KEY = 'neuroplayer_rest_target_end_time';
const STORAGE_LABEL_KEY = 'neuroplayer_rest_timer_label';
const STORAGE_PROTOCOL_STATE_KEY = 'neuroplayer_rest_protocol_state';
const STORAGE_QUEUE_KEY = 'neuroplayer_rest_queue';
const STORAGE_CYCLE_COLOR_KEY = 'neuroplayer_rest_cycle_color';
export const STORAGE_SLEEP_UNTIL_4AM_KEY = 'artemka_sleep_until_4am';
export const STORAGE_CYCLE_TIMESTAMP_KEY = 'artemka_cycle_timestamp';

let isChannelCreated = false;

/**
 * Инициализация канала уведомлений на Android (звук, максимальный приоритет, вибрация)
 */
export async function initNotificationChannel(): Promise<void> {
  if (isChannelCreated) return;
  try {
    // Проверяем / создаем канал для Android 8.0+
    await LocalNotifications.createChannel({
      id: REST_CHANNEL_ID,
      name: 'Таймер отдыха',
      description: 'Звуковые уведомления об окончании 2-часового отдыха нейросистемы',
      importance: 5, // MAX importance - всплывающее уведомление со звуком
      visibility: 1, // VISIBILITY_PUBLIC
      sound: undefined, // Системный звук уведомления по умолчанию
      vibration: true,
      lights: true,
      lightColor: '#00E676',
    });
    isChannelCreated = true;
  } catch (err) {
    // В обычной браузерной среде метод может отсутствовать, что допустимо
    console.debug('LocalNotifications.createChannel non-critical notice:', err);
  }
}

/**
 * Запрос разрешений на отправку уведомлений (Android 13+ и Web)
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const status = await LocalNotifications.checkPermissions();
    if (status.display !== 'granted') {
      const requested = await LocalNotifications.requestPermissions();
      return requested.display === 'granted';
    }
    return true;
  } catch {
    // Fallback для веб-браузера
    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'default') {
          const perm = await Notification.requestPermission();
          return perm === 'granted';
        }
        return Notification.permission === 'granted';
      }
    } catch {}
    return false;
  }
}

/**
 * Планирование локального уведомления на время окончания отдыха
 */
export async function scheduleRestNotification(
  targetEndTimeMs: number,
  label: string = 'Отдых'
): Promise<void> {
  try {
    await initNotificationChannel();
    await requestNotificationPermission();

    // Сначала отменяем предыдущее запланированное уведомление отдыха (если было)
    await cancelRestNotification();

    const scheduledDate = new Date(targetEndTimeMs);

    // Запланировать уведомление в Capacitor
    await LocalNotifications.schedule({
      notifications: [
        {
          id: REST_NOTIFICATION_ID,
          title: 'Время отдыха завершено 🔔',
          body: `2-часовой ${label.toLowerCase()} окончен. Нейросистема готова к следующему этапу!`,
          schedule: {
            at: scheduledDate,
            allowWhileIdle: true, // Срабатывает даже в режиме энергосбережения Doze
          },
          sound: undefined, // Системный звук уведомления
          channelId: REST_CHANNEL_ID,
          smallIcon: 'ic_stat_icon_config_sample',
          actionTypeId: '',
          extra: {
            type: 'rest_timer_completed',
          },
        },
      ],
    });
  } catch (err) {
    console.debug('LocalNotifications schedule fallback (standard web behavior):', err);
  }
}

/**
 * Отмена запланированного уведомления (при сбросе таймера кнопкой ❌ или досрочном завершении)
 */
export async function cancelRestNotification(): Promise<void> {
  try {
    await LocalNotifications.cancel({
      notifications: [{ id: REST_NOTIFICATION_ID }],
    });
  } catch {
    // Игнорируем в веб-режиме без плагина
  }
}

const SLEEP_WAKE_NOTIFICATION_ID = 2002;

/**
 * Планирование локального уведомления на 04:00 утра для выхода из спящего режима
 */
export async function scheduleSleepWakeNotification(targetEndTimeMs: number): Promise<void> {
  try {
    await initNotificationChannel();
    await requestNotificationPermission();
    await cancelSleepWakeNotification();

    const scheduledDate = new Date(targetEndTimeMs);
    await LocalNotifications.schedule({
      notifications: [
        {
          id: SLEEP_WAKE_NOTIFICATION_ID,
          title: 'Утренний терапевтический цикл начался 🌅',
          body: 'Наступило 04:00 утра. Активирована КРАСНАЯ кнопка светофора и день увеличен на +1!',
          schedule: {
            at: scheduledDate,
            allowWhileIdle: true,
          },
          sound: undefined,
          channelId: REST_CHANNEL_ID,
          smallIcon: 'ic_stat_icon_config_sample',
          actionTypeId: '',
          extra: {
            type: 'sleep_4am_wake',
          },
        },
      ],
    });
  } catch (err) {
    console.debug('LocalNotifications scheduleSleepWake fallback:', err);
  }
}

/**
 * Отмена запланированного уведомления пробуждения в 04:00 утра
 */
export async function cancelSleepWakeNotification(): Promise<void> {
  try {
    await LocalNotifications.cancel({
      notifications: [{ id: SLEEP_WAKE_NOTIFICATION_ID }],
    });
  } catch {}
}

/**
 * Сохранение данных таймера в localStorage для поддержания фонового режима и блокировки экрана
 */
export function persistRestTimer(
  targetEndTimeMs: number,
  label: string,
  protocolState: string,
  queue: unknown[],
  cycleColor?: string
): void {
  try {
    localStorage.setItem(STORAGE_END_TIME_KEY, targetEndTimeMs.toString());
    localStorage.setItem(STORAGE_LABEL_KEY, label);
    localStorage.setItem(STORAGE_PROTOCOL_STATE_KEY, protocolState);
    localStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify(queue));
    if (cycleColor) {
      localStorage.setItem(STORAGE_CYCLE_COLOR_KEY, cycleColor);
    }
  } catch (e) {
    console.error('Failed to persist rest timer:', e);
  }
}

/**
 * Получение сохранённых данных активного таймера отдыха
 */
export function getPersistedRestTimer(): {
  targetEndTimeMs: number;
  label: string;
  protocolState: string | null;
  queue: unknown[];
  cycleColor: string | null;
} | null {
  try {
    const endTimeStr = localStorage.getItem(STORAGE_END_TIME_KEY);
    if (!endTimeStr) return null;
    const targetEndTimeMs = parseInt(endTimeStr, 10);
    if (isNaN(targetEndTimeMs)) return null;

    const label = localStorage.getItem(STORAGE_LABEL_KEY) || 'Отдых';
    const protocolState = localStorage.getItem(STORAGE_PROTOCOL_STATE_KEY);
    const cycleColor = localStorage.getItem(STORAGE_CYCLE_COLOR_KEY);
    let queue: unknown[] = [];
    try {
      const qStr = localStorage.getItem(STORAGE_QUEUE_KEY);
      if (qStr) queue = JSON.parse(qStr);
    } catch {}

    return { targetEndTimeMs, label, protocolState, queue, cycleColor };
  } catch {
    return null;
  }
}

/**
 * Очистка сохранённых данных таймера
 */
export function clearPersistedRestTimer(): void {
  try {
    localStorage.removeItem(STORAGE_END_TIME_KEY);
    localStorage.removeItem(STORAGE_LABEL_KEY);
    localStorage.removeItem(STORAGE_PROTOCOL_STATE_KEY);
    localStorage.removeItem(STORAGE_QUEUE_KEY);
    localStorage.removeItem(STORAGE_CYCLE_COLOR_KEY);
  } catch (e) {
    console.error('Failed to clear rest timer persistence:', e);
  }
}

/**
 * Расчёт временной метки следующего наступления 04:00 утра:
 * - Если сессия закончилась глубокой ночью до 04:00 — просыпается в 04:00 этого же утра.
 * - Если позже 04:00 — в 04:00 следующего утра.
 */
export function getNext4AmTimestamp(fromTime: number = Date.now()): number {
  const d = new Date(fromTime);
  const target = new Date(fromTime);
  target.setHours(4, 0, 0, 0);

  // Если сегодня 04:00 утра уже прошло (например, сейчас 14:00 или 22:30),
  // то следующее 04:00 будет на следующий день
  if (d.getTime() >= target.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime();
}

/**
 * Возвращает временную метку (timestamp) 04:00 утра, когда начался текущий суточный терапевтический цикл:
 * - Если сейчас время от 04:00:00 до 23:59:59 — цикл начался сегодня в 04:00 утра.
 * - Если сейчас глубокая ночь (от 00:00:00 до 03:59:59) — цикл начался вчера в 04:00 утра.
 */
export function getCycleStart4Am(fromTime: number = Date.now()): number {
  const d = new Date(fromTime);
  const start = new Date(fromTime);
  start.setHours(4, 0, 0, 0);
  if (d.getTime() < start.getTime()) {
    start.setDate(start.getDate() - 1);
  }
  return start.getTime();
}

/**
 * Получение сохранённой временной метки активности текущего цикла
 */
export function getPersistedCycleTimestamp(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_CYCLE_TIMESTAMP_KEY);
    if (!raw) return null;
    const ts = parseInt(raw, 10);
    return isNaN(ts) ? null : ts;
  } catch {
    return null;
  }
}

/**
 * Сохранение временной метки активности текущего цикла
 */
export function persistCycleTimestamp(ts: number = Date.now()): void {
  try {
    localStorage.setItem(STORAGE_CYCLE_TIMESTAMP_KEY, ts.toString());
  } catch (e) {
    console.error('Failed to persist cycle timestamp:', e);
  }
}

/**
 * Очистка метки активности цикла
 */
export function clearPersistedCycleTimestamp(): void {
  try {
    localStorage.removeItem(STORAGE_CYCLE_TIMESTAMP_KEY);
  } catch (e) {
    console.error('Failed to clear cycle timestamp:', e);
  }
}

/**
 * Проверка, истекла ли сессия относительно границы 04:00 утра:
 * - Если сессия не дослушана до 4:00 утра -> просыпается в 4:00 утра этого же утра.
 * - Если одна кнопка (зелёная) не дослушана до 4:00 утра -> просыпается в 4:00 утра этого же утра.
 * - Если две кнопки (жёлтая и зелёная) не дослушаны до 4:00 утра -> просыпается в 4:00 этого же утра.
 * - Если сессия не прослушана совсем -> просыпается в 4:00 утра этого же утра.
 */
export function isCycleExpired(lastActivityTime: number | null, now: number = Date.now()): boolean {
  if (!lastActivityTime) return false;
  const currentCycleStart = getCycleStart4Am(now);
  return lastActivityTime < currentCycleStart;
}

/**
 * Получение сохранённой метки спящего режима до 04:00 утра
 */
export function getPersistedSleepUntil4Am(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_SLEEP_UNTIL_4AM_KEY);
    if (!raw) return null;
    const ts = parseInt(raw, 10);
    return isNaN(ts) ? null : ts;
  } catch {
    return null;
  }
}

/**
 * Сохранение спящего режима до 04:00 утра в локальную память
 */
export function persistSleepUntil4Am(targetMs: number): void {
  try {
    localStorage.setItem(STORAGE_SLEEP_UNTIL_4AM_KEY, targetMs.toString());
  } catch (e) {
    console.error('Failed to persist sleep until 4am:', e);
  }
}

/**
 * Очистка спящего режима из памяти
 */
export function clearPersistedSleepUntil4Am(): void {
  try {
    localStorage.removeItem(STORAGE_SLEEP_UNTIL_4AM_KEY);
  } catch (e) {
    console.error('Failed to clear sleep until 4am:', e);
  }
}
