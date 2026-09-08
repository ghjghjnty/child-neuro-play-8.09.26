// Модуль постоянного сохранения аудио-треков и прогресса воспроизведения
// Сохраняет бинарные данные (Blob) в IndexedDB, чтобы они не терялись при перезапуске приложения
// и формирует свежие Blob URL при каждом запуске.

const DB_NAME = 'ArtemkaTrackStorageDB';
const DB_VERSION = 1;
const STORE_NAME = 'audio_blobs';
const PROGRESS_KEY_PREFIX = 'artemka_playback_progress_';

function openTrackDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e: IDBVersionChangeEvent) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Сохраняет бинарный файл трека в постоянную память IndexedDB
 */
export async function saveTrackBlob(id: string, blob: Blob): Promise<void> {
  try {
    const db = await openTrackDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(blob, id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Failed to save track blob to IndexedDB', err);
  }
}

/**
 * Получает бинарный файл трека из IndexedDB
 */
export async function getTrackBlob(id: string): Promise<Blob | null> {
  try {
    const db = await openTrackDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve((req.result as Blob) || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Failed to get track blob from IndexedDB', err);
    return null;
  }
}

/**
 * Удаляет бинарный файл трека из IndexedDB
 */
export async function deleteTrackBlob(id: string): Promise<void> {
  try {
    const db = await openTrackDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Failed to delete track blob from IndexedDB', err);
  }
}

/**
 * Восстанавливает рабочие Blob URL для всех треков после перезапуска приложения
 */
export async function restoreAudioBlobUrls<T extends { id: string; customBlobUrl?: string }>(
  items: T[]
): Promise<T[]> {
  try {
    const updated = await Promise.all(
      items.map(async (item) => {
        // Проверяем, есть ли сохранённый бинарный Blob в постоянной памяти
        const blob = await getTrackBlob(item.id);
        if (blob) {
          return {
            ...item,
            customBlobUrl: URL.createObjectURL(blob),
          };
        }
        return item;
      })
    );
    return updated;
  } catch (err) {
    console.error('Failed to restore audio blob URLs', err);
    return items;
  }
}

/**
 * Сохраняет прогресс воспроизведения трека (в секундах)
 */
export function saveTrackProgress(trackIdOrFolder: string, seconds: number): void {
  try {
    if (seconds > 0) {
      localStorage.setItem(`${PROGRESS_KEY_PREFIX}${trackIdOrFolder}`, seconds.toString());
    } else {
      localStorage.removeItem(`${PROGRESS_KEY_PREFIX}${trackIdOrFolder}`);
    }
  } catch (e) {
    console.error('Failed to save track progress', e);
  }
}

/**
 * Загружает сохранённый прогресс воспроизведения трека
 */
export function getTrackProgress(trackIdOrFolder: string): number {
  try {
    const raw = localStorage.getItem(`${PROGRESS_KEY_PREFIX}${trackIdOrFolder}`);
    if (raw) {
      const parsed = parseFloat(raw);
      return !isNaN(parsed) && isFinite(parsed) ? parsed : 0;
    }
  } catch (e) {
    console.error('Failed to get track progress', e);
  }
  return 0;
}

/**
 * Сбрасывает сохранённый прогресс (например, при завершении трека)
 */
export function clearTrackProgress(trackIdOrFolder: string): void {
  try {
    localStorage.removeItem(`${PROGRESS_KEY_PREFIX}${trackIdOrFolder}`);
  } catch (e) {
    console.error('Failed to clear track progress', e);
  }
}
