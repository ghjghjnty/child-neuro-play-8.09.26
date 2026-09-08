import { AudioItem } from '../types';

export const DEFAULT_FILES: AudioItem[] = [];

const STORAGE_KEY = 'artemka_neuroplayer_files';
const COURSE_KEY = 'artemka_course_config';

const MOCK_DEMO_IDS = new Set([
  'red_fabula_1',
  'red_brt_1',
  'red_brt_2',
  'yellow_fabula_1',
  'yellow_brt_1',
  'green_fabula_1',
  'green_brt_1',
  'green_brt_2',
]);

export function getStoredFiles(): AudioItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Оставляем только реально добавленные пользователем треки, исключая тестовые заглушки
        const userFiles = parsed.filter((item: AudioItem) => item && !MOCK_DEMO_IDS.has(item.id));
        return userFiles;
      }
    }
  } catch (e) {
    console.error('Failed to load files from storage', e);
  }
  return [];
}

export function saveStoredFiles(files: AudioItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
  } catch (e) {
    console.error('Failed to save files to storage', e);
  }
}

// Поиск фабулы (.flac) в выбранной папке
export function scanFolderForFabula(folder: '1_Red' | '2_Yellow' | '3_Green', files: AudioItem[]): AudioItem | null {
  const folderFiles = files.filter((f) => f.folder === folder);
  const flac = folderFiles.find((f) => f.format === 'flac' || f.fileName.toLowerCase().endsWith('.flac'));
  return flac || null;
}

// Поиск всех БРТ (.mp3) в выбранной папке (до 4 треков подряд)
export function scanFolderForBrt(folder: '1_Red' | '2_Yellow' | '3_Green', files: AudioItem[]): AudioItem[] {
  const folderFiles = files.filter((f) => f.folder === folder);
  const mp3s = folderFiles.filter((f) => f.format === 'mp3' || f.fileName.toLowerCase().endsWith('.mp3'));
  return mp3s.slice(0, 4);
}

// Форматирование имени файла без расширения
export function extractCleanDisplayName(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '');
}
