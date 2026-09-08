export type FabulaColor = 'red' | 'yellow' | 'green';
export type TrafficColor = FabulaColor;
export type BrtColor = 'brt_red' | 'brt_green';
export type ActiveTrack = FabulaColor | BrtColor | null;

export type ProtocolState =
  | 'IDLE' // Светофор активен, готов к выбору цвета
  | 'PLAYING_FABULA' // Играет .flac фабула, основной светофор погашен (alpha = 0.2)
  | 'REST_1_WAIT_BRT' // Фабула окончена, строгий таймер 120 мин, красный пешеход (БРТ заблокировано)
  | 'BRT_READY' // 2 часа прошло, зеленый пешеход горит, ждет нажатия ребенком
  | 'PLAYING_BRT' // Играет БРТ .mp3 (до 4 треков подряд)
  | 'REST_2_FINAL' // Финальный отдых 120 минут после БРТ
  | 'SLEEP_UNTIL_4AM' // Спящий режим строго до 04:00 утра
  | 'COURSE_WEEKEND_REST' // 2 дня отдыха 5/2 (светофор заблокирован, 💤)
  | 'COURSE_COMPLETED_REST'; // 5 дней межкурсового отдыха

export type DayType = 'THERAPY' | 'WEEKEND' | 'POST_COURSE';

export type BrtPlayMode = 'track' | 'normal_5m' | 'single_20m' | 'all_20m';
export type LoopMode = BrtPlayMode;

export type ThemeMode = 'dark' | 'light';

export interface CalendarDayInfo {
  dayNumber: number;
  dayType: DayType;
  label: string;
}

export interface AudioItem {
  id: string;
  fileName: string;
  displayName: string;
  format: 'flac' | 'mp3';
  folder: '1_Red' | '2_Yellow' | '3_Green';
  durationSeconds: number;
  customBlobUrl?: string;
}

export interface CourseConfig {
  totalDays: 14 | 21;
  currentDay: number;
  startDate: string;
}

export interface TrafficTrack {
  id: TrafficColor;
  name: string;
  subtitle: string;
  defaultTitle: string;
  customAudioUrl?: string;
  customFileName?: string;
}
