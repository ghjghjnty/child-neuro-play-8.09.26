import React, { useState, useEffect, useRef } from 'react';
import { soundEngine } from './utils/audioSynthesizer';
import { FabulaColor, ProtocolState, AudioItem, CourseConfig, LoopMode, ThemeMode, BrtPlayMode } from './types';
import {
  getStoredFiles,
  saveStoredFiles,
  scanFolderForFabula,
  scanFolderForBrt,
} from './utils/neuroPlayerStorage';
import {
  loadCourseConfig,
  saveCourseConfig,
  getDayStatus,
  autoIncrementCourseDayOn4Am,
} from './utils/courseCalendar';
import { DoctorSettingsModal } from './components/DoctorSettingsModal';
import { LoopButton } from './components/LoopButton';
import {
  getSavedLoopMode,
  saveLoopMode,
  getNextLoopMode,
  resolveNextTrackDecision,
  SESSION_DURATION_MAP,
  calculate4BrtSessionDuration,
} from './utils/playerLoopMiddleware';
import {
  initNotificationChannel,
  scheduleRestNotification,
  cancelRestNotification,
  scheduleSleepWakeNotification,
  cancelSleepWakeNotification,
  persistRestTimer,
  getPersistedRestTimer,
  clearPersistedRestTimer,
  getNext4AmTimestamp,
  getCycleStart4Am,
  getPersistedCycleTimestamp,
  persistCycleTimestamp,
  clearPersistedCycleTimestamp,
  isCycleExpired,
  getPersistedSleepUntil4Am,
  persistSleepUntil4Am,
  clearPersistedSleepUntil4Am,
} from './services/restTimerService';
import {
  restoreAudioBlobUrls,
  saveTrackBlob,
  saveTrackProgress,
  getTrackProgress,
  clearTrackProgress,
} from './utils/trackStorage';
import {
  Footprints,
  ShieldAlert,
  Settings,
  Moon,
  Sparkles,
  Square,
  Play,
} from 'lucide-react';

const TWO_HOURS_MS = 7200000; // 120 минут (2 часа)

export default function App() {
  // Файлы и настройки курса
  const [files, setFiles] = useState<AudioItem[]>(getStoredFiles);
  const [courseConfig, setCourseConfig] = useState<CourseConfig>(() => {
    // Если на момент холодного старта граница 04:00 утра уже наступила (сон истёк или суточный цикл обновился),
    // сразу применяем суточное увеличение дня на +1 (строго 1 раз за сутки)
    const now = Date.now();
    const sleepUntil = getPersistedSleepUntil4Am();
    const lastCycleTime = getPersistedCycleTimestamp();
    if ((sleepUntil && now >= sleepUntil) || isCycleExpired(lastCycleTime, now)) {
      const updated = autoIncrementCourseDayOn4Am(now, true);
      if (updated) return updated;
    }
    return loadCourseConfig();
  });
  const [isDoctorModalOpen, setIsDoctorModalOpen] = useState(false);

  // Состояние медицинского протокола
  const [protocolState, setProtocolState] = useState<ProtocolState>('IDLE');
  const [activeColor, setActiveColor] = useState<FabulaColor | null>(null);
  const [currentPlayingTrack, setCurrentPlayingTrack] = useState<AudioItem | null>(null);
  const [currentBrtIndex, setCurrentBrtIndex] = useState<number>(0);
  const [brtQueue, setBrtQueue] = useState<AudioItem[]>([]);

  // Режимы воспроизведения («Д» детский режим фабул 20м, «1Брт» 20м, «4Брт» 20м)
  const [loopMode, setLoopMode] = useState<BrtPlayMode>(getSavedLoopMode);
  const loopModeRef = useRef<BrtPlayMode>(loopMode);

  useEffect(() => {
    loopModeRef.current = loopMode;
    saveLoopMode(loopMode);
  }, [loopMode]);

  const handleCycleLoopMode = () => {
    soundEngine.playClickSound();
    setLoopMode((prev) => getNextLoopMode(prev));
  };

  // Режим темы интерфейса (тёмный / светлый или ночь / день)
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('artemka_theme_mode');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {}
    return 'dark';
  });

  const handleToggleTheme = () => {
    soundEngine.playClickSound();
    setThemeMode((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('artemka_theme_mode', next);
      } catch {}
      return next;
    });
  };

  // Текущая разрешённая кнопка светофора по порядку (Красный -> Жёлтый -> Зелёный -> Красный)
  const [allowedTrafficColor, setAllowedTrafficColor] = useState<FabulaColor | null>(() => {
    try {
      const now = Date.now();
      const sleepUntil = getPersistedSleepUntil4Am();
      if (sleepUntil) {
        if (now < sleepUntil) {
          return null;
        } else {
          clearPersistedSleepUntil4Am();
          clearPersistedRestTimer();
          persistCycleTimestamp(now);
          try {
            localStorage.setItem('artemka_allowed_traffic_color', 'red');
            localStorage.setItem('artemka_cycle_color', 'red');
            localStorage.setItem('artemka_last_played_color', 'red');
          } catch {}
          autoIncrementCourseDayOn4Am(now, true);
          return 'red';
        }
      }

      // Проверяем границу 04:00 утра:
      // - если сессия не дослушана до 4.00 утра - просыпается в 4.00 утра этого же утра.
      // - если одна кнопка (зелёная) не дослушана до 4.00 утра, приложение просыпается в 4.00 утра этого же утра.
      // - если две кнопки (жёлтая и зелёная) не дослушаны до 4.00 утра - просыпается в 4.00 этого же утра.
      // - если сессия не прослушана совсем -- просыпается в 4.00 утра этого же утра.
      const lastCycleTime = getPersistedCycleTimestamp();
      if (isCycleExpired(lastCycleTime, now)) {
        clearPersistedRestTimer();
        persistCycleTimestamp(now);
        try {
          localStorage.setItem('artemka_allowed_traffic_color', 'red');
          localStorage.setItem('artemka_cycle_color', 'red');
          localStorage.setItem('artemka_last_played_color', 'red');
        } catch {}
        autoIncrementCourseDayOn4Am(now, true);
        return 'red';
      }

      const saved = localStorage.getItem('artemka_allowed_traffic_color');
      if (saved === 'red' || saved === 'yellow' || saved === 'green') {
        return saved as FabulaColor;
      }
    } catch {}
    return 'red';
  });

  // Запоминаем цвет текущей фабулы терапевтического цикла (Красный -> Жёлтый -> Зелёный)
  const currentCycleColorRef = useRef<FabulaColor>(
    (() => {
      try {
        const now = Date.now();
        const lastCycleTime = getPersistedCycleTimestamp();
        if (isCycleExpired(lastCycleTime, now)) {
          return 'red';
        }
        const saved = localStorage.getItem('artemka_cycle_color') || localStorage.getItem('artemka_last_played_color');
        if (saved === 'red' || saved === 'yellow' || saved === 'green') {
          return saved as FabulaColor;
        }
      } catch {}
      return 'red';
    })()
  );

  const lastPlayedColorRef = currentCycleColorRef;

  // Обратный отсчёт спящего режима до 04:00 утра
  const [sleepRemainingSeconds, setSleepRemainingSeconds] = useState<number>(() => {
    try {
      const sleepUntil = getPersistedSleepUntil4Am();
      if (sleepUntil && sleepUntil > Date.now()) {
        return Math.max(0, Math.ceil((sleepUntil - Date.now()) / 1000));
      }
    } catch {}
    return 0;
  });
  const sleepTargetMsRef = useRef<number | null>(getPersistedSleepUntil4Am());

  // Переход в спящий режим строго до 04:00 утра
  const enterSleepModeUntil4Am = () => {
    stopAllPlayback();
    stopRestCountdown();
    setActiveColor(null);
    setBrtQueue([]);
    setCurrentBrtIndex(0);

    const targetTime = getNext4AmTimestamp();
    sleepTargetMsRef.current = targetTime;
    persistSleepUntil4Am(targetTime);
    scheduleSleepWakeNotification(targetTime);

    setProtocolState('SLEEP_UNTIL_4AM');
    setAllowedTrafficColor(null);
    setSleepRemainingSeconds(Math.max(0, Math.ceil((targetTime - Date.now()) / 1000)));
  };

  // Пробуждение приложения в 04:00 утра и автоматическая активация КРАСНОЙ кнопки:
  // - если сессия закончилась глубокой ночью до 04:00 — просыпается в 04:00 этого же утра;
  // - если сессия не дослушана до 4.00 утра — просыпается в 4.00 утра этого же утра;
  // - если одна кнопка (зелёная) не дослушана до 4.00 утра — просыпается в 4.00 утра этого же утра;
  // - если две кнопки (жёлтая и зелёная) не дослушаны до 4.00 утра — просыпается в 4.00 этого же утра;
  // - если сессия не прослушана совсем — просыпается в 4.00 утра этого же утра.
  // При активации КРАСНОЙ кнопки номер дня автоматически увеличивается на +1 (День = Текущий день + 1)
  const wakeUpFromSleepMode = () => {
    clearPersistedSleepUntil4Am();
    clearPersistedRestTimer();
    cancelRestNotification();
    cancelSleepWakeNotification();
    stopAllPlayback();
    stopRestCountdown();
    sleepTargetMsRef.current = null;
    setSleepRemainingSeconds(0);

    const now = Date.now();
    persistCycleTimestamp(now);

    setAllowedTrafficColor('red');
    currentCycleColorRef.current = 'red';
    try {
      localStorage.setItem('artemka_allowed_traffic_color', 'red');
      localStorage.setItem('artemka_cycle_color', 'red');
      localStorage.setItem('artemka_last_played_color', 'red');
    } catch {}

    // Автоматическое увеличение номера дня (День = Текущий день + 1) строго 1 раз в сутки в 04:00
    const updatedCourse = autoIncrementCourseDayOn4Am(now, true);
    if (updatedCourse) {
      setCourseConfig(updatedCourse);
    }

    setProtocolState('IDLE');
    soundEngine.playNotificationAlert();
  };

  // 1. Завершение первого 2-часового отдыха (после фабулы)
  const handleRest1Completed = (
    completedColor: FabulaColor,
    brtFiles: AudioItem[] = []
  ) => {
    updateRestTimer(0);
    persistCycleTimestamp();

    // Если в папке есть БРТ -> активируется зелёная кнопка БРТ правого светофора
    if (brtFiles.length > 0) {
      setBrtQueue(brtFiles);
      setProtocolState('BRT_READY');
      return;
    }

    // Если в папке нет БРТ:
    if (completedColor === 'red') {
      // В красной папке нет БРТ -> после отключения таймера Отдых 2ч активной становится Жёлтая кнопка
      setAllowedTrafficColor('yellow');
      currentCycleColorRef.current = 'yellow';
      try {
        localStorage.setItem('artemka_allowed_traffic_color', 'yellow');
        localStorage.setItem('artemka_cycle_color', 'yellow');
        localStorage.setItem('artemka_last_played_color', 'yellow');
      } catch {}
      setProtocolState('IDLE');
    } else if (completedColor === 'yellow') {
      // В жёлтой папке нет БРТ -> после отключения таймера Отдых 2ч активной становится Зелёная кнопка
      setAllowedTrafficColor('green');
      currentCycleColorRef.current = 'green';
      try {
        localStorage.setItem('artemka_allowed_traffic_color', 'green');
        localStorage.setItem('artemka_cycle_color', 'green');
        localStorage.setItem('artemka_last_played_color', 'green');
      } catch {}
      setProtocolState('IDLE');
    } else if (completedColor === 'green') {
      // В зелёной папке нет БРТ -> приложение переходит в спящий режим строго до 04:00 утра
      enterSleepModeUntil4Am();
    }
  };

  // 2. Завершение второго 2-часового отдыха (после БРТ)
  const handleRest2Completed = (currentColor: FabulaColor) => {
    updateRestTimer(0);
    persistCycleTimestamp();

    if (currentColor === 'red') {
      // После прослушивания БРТ красной папки и 2ч отдыха -> активной становится жёлтая кнопка левого светофора
      setAllowedTrafficColor('yellow');
      currentCycleColorRef.current = 'yellow';
      try {
        localStorage.setItem('artemka_allowed_traffic_color', 'yellow');
        localStorage.setItem('artemka_cycle_color', 'yellow');
        localStorage.setItem('artemka_last_played_color', 'yellow');
      } catch {}
      setProtocolState('IDLE');
    } else if (currentColor === 'yellow') {
      // После прослушивания БРТ жёлтой папки и 2ч отдыха -> активной становится зелёная кнопка левого светофора
      setAllowedTrafficColor('green');
      currentCycleColorRef.current = 'green';
      try {
        localStorage.setItem('artemka_allowed_traffic_color', 'green');
        localStorage.setItem('artemka_cycle_color', 'green');
        localStorage.setItem('artemka_last_played_color', 'green');
      } catch {}
      setProtocolState('IDLE');
    } else {
      // Зелёный цикл после БРТ завершён -> приложение переходит в спящий режим строго до 04:00 утра
      enterSleepModeUntil4Am();
    }
  };

  // Ручное переключение в меню врача (кнопка "Вперёд" таймера)
  const advanceToNextTrafficColor = () => {
    persistCycleTimestamp();
    const isRest1 = protocolState === 'REST_1_WAIT_BRT';
    const isRest2 = protocolState === 'REST_2_FINAL';

    if (isRest1 || isRest2) {
      stopRestCountdown();
      soundEngine.playNotificationAlert();
      const currentColor = currentCycleColorRef.current || 'red';
      if (isRest1) {
        const folderMap: Record<FabulaColor, '1_Red' | '2_Yellow' | '3_Green'> = {
          red: '1_Red',
          yellow: '2_Yellow',
          green: '3_Green',
        };
        const brtFiles = scanFolderForBrt(folderMap[currentColor], files);
        handleRest1Completed(currentColor, brtFiles);
      } else {
        handleRest2Completed(currentColor);
      }
      return;
    }

    const lastColor = currentCycleColorRef.current || 'red';
    let nextColor: FabulaColor = 'red';
    if (lastColor === 'red') {
      nextColor = 'yellow';
    } else if (lastColor === 'yellow') {
      nextColor = 'green';
    } else if (lastColor === 'green') {
      nextColor = 'red';
    }
    setAllowedTrafficColor(nextColor);
    currentCycleColorRef.current = nextColor;
    try {
      localStorage.setItem('artemka_allowed_traffic_color', nextColor);
      localStorage.setItem('artemka_cycle_color', nextColor);
      localStorage.setItem('artemka_last_played_color', nextColor);
    } catch {}
    setProtocolState('IDLE');
  };

  const advanceToNextTrafficColorAndCheckBrt = () => {
    advanceToNextTrafficColor();
  };

  // Состояние нижней панели
  const [isBrtToggleActive, setIsBrtToggleActive] = useState<boolean>(false);
  const [isTestingSignals, setIsTestingSignals] = useState<boolean>(false);
  const [testSignalIndex, setTestSignalIndex] = useState<number>(-1);

  // Две ключевые переменные состояния терапевтического протокола БРТ:
  // 1. totalSessionTimer - общий таймер активной сессии на 5 или 20 минут (в секундах)
  // 2. restTimer - таймер принудительного отдыха на 2 часа (в секундах)
  const [totalSessionTimer, setTotalSessionTimer] = useState<number>(0);
  const totalSessionTimerRef = useRef<number>(0);
  const sessionEndTimeRef = useRef<number | null>(null);
  const sessionRemainingOnPauseRef = useRef<number>(0);
  // Счётчик шага воспроизведения в режиме «4Брт» (всего 4 трека по счёту)
  const brtStepRef = useRef<number>(0);
  const [sessionTotalSeconds, setSessionTotalSeconds] = useState<number>(1200);

  // Таймер принудительного отдыха 120 минут (2 часа)
  const [restTimer, setRestTimer] = useState<number>(0);
  const [timerRemainingSeconds, setTimerRemainingSeconds] = useState<number>(0);
  const [timerLabel, setTimerLabel] = useState<string>('');

  const updateRestTimer = (val: number) => {
    setTimerRemainingSeconds(val);
    setRestTimer(val);
  };

  // Звук и UI
  const [playbackSeconds, setPlaybackSeconds] = useState<number>(0);
  const [isPlaybackPaused, setIsPlaybackPaused] = useState<boolean>(false);
  const [emptyAlertVisible, setEmptyAlertVisible] = useState<boolean>(false);
  const quickFilePickerRef = useRef<HTMLInputElement>(null);
  const pendingFolderRef = useRef<'1_Red' | '2_Yellow' | '3_Green'>('1_Red');
  const emptyAlertTimerRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const restEndTimeRef = useRef<number | null>(null);
  const restOnCompleteRef = useRef<(() => void) | null>(null);
  const audioElemRef = useRef<HTMLAudioElement | null>(null);
  const currentOnEndedRef = useRef<(() => void) | null>(null);

  const showEmptyAndOpenFilePicker = (folder: '1_Red' | '2_Yellow' | '3_Green') => {
    pendingFolderRef.current = folder;
    setEmptyAlertVisible(true);
    if (emptyAlertTimerRef.current) clearTimeout(emptyAlertTimerRef.current);
    emptyAlertTimerRef.current = window.setTimeout(() => {
      setEmptyAlertVisible(false);
    }, 2500);

    // Автоматически открываем проводник памяти
    quickFilePickerRef.current?.click();
  };

  const handleQuickFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const isFlac = selected.name.toLowerCase().endsWith('.flac');
    const isMp3 = selected.name.toLowerCase().endsWith('.mp3');
    const cleanName = selected.name.replace(/\.[^/.]+$/, '');
    const blobUrl = URL.createObjectURL(selected);
    const targetFolder = pendingFolderRef.current;
    const itemId = `quick_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Сохраняем бинарный файл в IndexedDB для постоянного доступа после перезапуска
    await saveTrackBlob(itemId, selected);

    const newItem: AudioItem = {
      id: itemId,
      fileName: selected.name,
      displayName: cleanName,
      format: isFlac ? 'flac' : 'mp3',
      folder: targetFolder,
      durationSeconds: 120,
      customBlobUrl: blobUrl,
    };

    const updated = [...files, newItem];
    setFiles(updated);
    saveStoredFiles(updated);
    setEmptyAlertVisible(false);

    if (isFlac) {
      const colorMap: Record<'1_Red' | '2_Yellow' | '3_Green', FabulaColor> = {
        '1_Red': 'red',
        '2_Yellow': 'yellow',
        '3_Green': 'green',
      };
      const color = colorMap[targetFolder];
      setActiveColor(color);
      lastPlayedColorRef.current = color;
      try {
        localStorage.setItem('artemka_last_played_color', color);
      } catch {}
      setCurrentPlayingTrack(newItem);
      setProtocolState('PLAYING_FABULA');
      playFabulaTrack(newItem, targetFolder);
    } else {
      setBrtQueue([newItem]);
      setCurrentBrtIndex(0);
      setProtocolState('PLAYING_BRT');
      playNextBrtTrack(0, [newItem]);
    }

    e.target.value = '';
  };

  // Счётчик времени прослушивания в нижней строке:
  // 1. Запускается при начале прослушивания трека (с 00:00)
  // 2. При кратковременной остановке прослушивания (пауза/стоп) счётчик замирает на текущей секунде
  // 3. При продолжении прослушивания счётчик стартует с той же позиции
  useEffect(() => {
    const isPlaying = (protocolState === 'PLAYING_FABULA' || protocolState === 'PLAYING_BRT') && !!currentPlayingTrack;
    if (!isPlaying) {
      return;
    }

    if (isPlaybackPaused) {
      // При кратковременной остановке счётчик замирает на текущей позиции
      return;
    }

    // При начале или продолжении прослушивания счётчик идёт каждую секунду дальше
    const timer = window.setInterval(() => {
      setPlaybackSeconds((prev) => {
        const next = prev + 1;
        const totalDuration = currentPlayingTrack?.durationSeconds || 0;
        // Если играет синтезатор без аудиофайла и достигнут конец трека по длительности
        if (!audioElemRef.current && totalDuration > 0 && next >= totalDuration) {
          stopAudioStreamOnly();
          if (currentOnEndedRef.current) {
            currentOnEndedRef.current();
          }
        }
        return next;
      });

      // Обратный отсчёт сессии (БРТ или 20-минутный детский режим «Д» для фабулы)
      const isSessionActive =
        (protocolState === 'PLAYING_BRT' || (protocolState === 'PLAYING_FABULA' && loopModeRef.current === 'normal_5m')) &&
        totalSessionTimerRef.current > 0;

      if (isSessionActive) {
        if (sessionEndTimeRef.current) {
          const now = Date.now();
          const remaining = Math.max(0, Math.ceil((sessionEndTimeRef.current - now) / 1000));
          totalSessionTimerRef.current = remaining;
          setTotalSessionTimer(remaining);
          if (remaining <= 0) {
            sessionEndTimeRef.current = null;
            if (protocolState === 'PLAYING_BRT' && loopModeRef.current === 'all_20m') {
              // Мягкая отсечка для режима 4Брт (20 минут):
              // Таймер 20 минут работает как «флаг завершения».
              // Плеер обязан дать текущему (активному) треку полностью доиграть до конца.
              // При естественном завершении трека (onEnded) плеер остановится и передаст управление логике приложения.
            } else {
              setTimeout(() => {
                if (protocolState === 'PLAYING_BRT') {
                  onBrtSessionCompleted();
                } else if (protocolState === 'PLAYING_FABULA') {
                  const currentColor = activeColor || currentCycleColorRef.current || allowedTrafficColor || 'red';
                  const folderMap: Record<FabulaColor, '1_Red' | '2_Yellow' | '3_Green'> = {
                    red: '1_Red',
                    yellow: '2_Yellow',
                    green: '3_Green',
                  };
                  onFabulaCompleted(folderMap[currentColor]);
                }
              }, 0);
            }
          }
        } else {
          setTotalSessionTimer((prev) => {
            const next = prev - 1;
            totalSessionTimerRef.current = Math.max(0, next);
            if (next <= 0) {
              if (protocolState === 'PLAYING_BRT' && loopModeRef.current === 'all_20m') {
                // Мягкая отсечка для режима 4Брт: фиксируем 0 и ждем естественного окончания активного трека
              } else {
                setTimeout(() => {
                  if (protocolState === 'PLAYING_BRT') {
                    onBrtSessionCompleted();
                  } else if (protocolState === 'PLAYING_FABULA') {
                    const currentColor = activeColor || currentCycleColorRef.current || allowedTrafficColor || 'red';
                    const folderMap: Record<FabulaColor, '1_Red' | '2_Yellow' | '3_Green'> = {
                      red: '1_Red',
                      yellow: '2_Yellow',
                      green: '3_Green',
                    };
                    onFabulaCompleted(folderMap[currentColor]);
                  }
                }, 0);
              }
              return 0;
            }
            return next;
          });
        }
      }
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [protocolState, currentPlayingTrack?.id, isPlaybackPaused]);

  // Статус текущего дня по календарю 5/2
  const dayStatus = getDayStatus(courseConfig.currentDay, courseConfig.totalDays);

  // Остановка и сброс таймера отдыха
  const stopRestCountdown = (keepRemainingTime = false) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    restEndTimeRef.current = null;
    restOnCompleteRef.current = null;
    clearPersistedRestTimer();
    cancelRestNotification();
    if (!keepRemainingTime) {
      updateRestTimer(0);
    }
  };

  // Срабатывание завершения отдыха со звуковым сигналом
  const triggerRestCompletion = (onComplete?: (() => void) | null) => {
    stopRestCountdown(false);

    // Звуковое оповещение об окончании отдыха
    soundEngine.playNotificationAlert();
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([300, 200, 300, 200, 500]);
      }
    } catch {}

    if (onComplete) {
      onComplete();
    }
  };

  // Проверка и тик таймера на основе абсолютного системного времени Date.now()
  // Не прерывается при блокировке телефона, сворачивании приложения и засыпании экрана
  const tickRestCountdown = () => {
    if (!restEndTimeRef.current) return;
    const now = Date.now();
    const remaining = Math.max(0, Math.ceil((restEndTimeRef.current - now) / 1000));
    updateRestTimer(remaining);

    if (remaining <= 0) {
      const cb = restOnCompleteRef.current;
      triggerRestCompletion(cb);
    }
  };

  // Инициализация канала уведомлений и восстановление активного таймера отдыха / спящего режима при запуске
  useEffect(() => {
    initNotificationChannel();

    const now = Date.now();

    // 1. Проверяем сохранение спящего режима до 04:00 утра
    const savedSleepUntil = getPersistedSleepUntil4Am();
    if (savedSleepUntil) {
      if (now < savedSleepUntil) {
        setProtocolState('SLEEP_UNTIL_4AM');
        setAllowedTrafficColor(null);
        setSleepRemainingSeconds(Math.max(0, Math.ceil((savedSleepUntil - now) / 1000)));
      } else {
        // На часах уже 04:00 утра или позже — пробуждаемся и включаем Красную кнопку
        wakeUpFromSleepMode();
      }
      restoreAudioBlobUrls(getStoredFiles()).then((restored) => {
        setFiles(restored);
      });
      return;
    }

    // 2. Проверяем границу 04:00 утра:
    // Если сессия закончилась глубокой ночью до 04:00 — просыпается в 04:00 этого же утра.
    // Если сессия не дослушана до 4.00 утра — просыпается в 4.00 утра этого же утра.
    // Если одна кнопка (зелёная) не дослушана до 4.00 утра — просыпается в 4.00 утра этого же утра.
    // Если две кнопки (жёлтая и зелёная) не дослушаны до 4.00 утра — просыпается в 4.00 этого же утра.
    // Если сессия не прослушана совсем — просыпается в 4.00 утра этого же утра.
    const lastCycleTime = getPersistedCycleTimestamp();
    if (isCycleExpired(lastCycleTime, now)) {
      wakeUpFromSleepMode();
      restoreAudioBlobUrls(getStoredFiles()).then((restored) => {
        setFiles(restored);
      });
      return;
    }

    // 3. Если спящего режима нет и 04:00 утра ещё не истекло, проверяем активный таймер отдыха
    const saved = getPersistedRestTimer();
    if (saved && saved.targetEndTimeMs) {
      const remaining = Math.max(0, Math.ceil((saved.targetEndTimeMs - now) / 1000));
      const cycleColor = (saved.cycleColor as FabulaColor) || currentCycleColorRef.current || 'red';
      currentCycleColorRef.current = cycleColor;
      const queue = (saved.queue as AudioItem[]) || [];
      setBrtQueue(queue);

      if (remaining > 0) {
        restEndTimeRef.current = saved.targetEndTimeMs;
        setTimerLabel(saved.label || 'Отдых');
        updateRestTimer(remaining);

        if (saved.protocolState === 'REST_1_WAIT_BRT' || saved.protocolState === 'REST_2_FINAL') {
          setProtocolState(saved.protocolState as ProtocolState);
        }

        restOnCompleteRef.current = () => {
          if (saved.protocolState === 'REST_1_WAIT_BRT') {
            handleRest1Completed(cycleColor, queue);
          } else {
            handleRest2Completed(cycleColor);
          }
        };

        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = window.setInterval(tickRestCountdown, 1000);
      } else {
        // Таймер завершился пока экран был выключен или приложение было свернуто
        clearPersistedRestTimer();
        cancelRestNotification();
        soundEngine.playNotificationAlert();

        if (saved.protocolState === 'REST_1_WAIT_BRT') {
          handleRest1Completed(cycleColor, queue);
        } else {
          handleRest2Completed(cycleColor);
        }
      }
    }

    // Восстанавливаем постоянные Blob URL для треков из IndexedDB
    restoreAudioBlobUrls(getStoredFiles()).then((restored) => {
      setFiles(restored);
    });
  }, []);

  // Непрерывный мониторинг границы 04:00 утра и спящего режима
  useEffect(() => {
    const tickSleepOrCycleBoundary = () => {
      const now = Date.now();

      // А. Если приложение находится в спящем режиме до 04:00 утра:
      if (protocolState === 'SLEEP_UNTIL_4AM') {
        const savedSleepUntil = getPersistedSleepUntil4Am();
        if (!savedSleepUntil || now >= savedSleepUntil) {
          wakeUpFromSleepMode();
        } else {
          const remaining = Math.max(0, Math.ceil((savedSleepUntil - now) / 1000));
          setSleepRemainingSeconds(remaining);
        }
        return;
      }

      // Б. Если приложение НЕ в спящем режиме (сессия не дослушана, 1 или 2 кнопки не дослушаны, либо сессия не прослушана совсем):
      // Проверяем границу 04:00 утра этого же утра:
      const lastCycleTime = getPersistedCycleTimestamp();
      if (isCycleExpired(lastCycleTime, now)) {
        wakeUpFromSleepMode();
      }
    };

    tickSleepOrCycleBoundary();
    const boundaryInterval = window.setInterval(tickSleepOrCycleBoundary, 1000);
    return () => {
      clearInterval(boundaryInterval);
    };
  }, [protocolState]);

  // Синхронизация при пробуждении (разблокировка экрана, возвращение из фона, активация вкладки)
  useEffect(() => {
    const handleWakeSync = () => {
      const now = Date.now();

      const savedSleepUntil = getPersistedSleepUntil4Am();
      if (savedSleepUntil) {
        if (now >= savedSleepUntil) {
          wakeUpFromSleepMode();
          return;
        } else {
          setSleepRemainingSeconds(Math.max(0, Math.ceil((savedSleepUntil - now) / 1000)));
        }
      }

      // Проверяем границу 04:00 утра для недослушанных сессий / кнопок
      const lastCycleTime = getPersistedCycleTimestamp();
      if (isCycleExpired(lastCycleTime, now)) {
        wakeUpFromSleepMode();
        return;
      }

      if (restEndTimeRef.current) {
        tickRestCountdown();
      }
    };

    document.addEventListener('visibilitychange', handleWakeSync);
    window.addEventListener('focus', handleWakeSync);
    window.addEventListener('pageshow', handleWakeSync);

    return () => {
      document.removeEventListener('visibilitychange', handleWakeSync);
      window.removeEventListener('focus', handleWakeSync);
      window.removeEventListener('pageshow', handleWakeSync);
    };
  }, []);

  useEffect(() => {
    return () => {
      soundEngine.stop();
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (audioElemRef.current) {
        audioElemRef.current.pause();
      }
    };
  }, []);

  // Синхронизация дня с состоянием протокола
  useEffect(() => {
    if (dayStatus.dayType === 'WEEKEND') {
      setProtocolState('COURSE_WEEKEND_REST');
      stopAllPlayback();
      stopRestCountdown();
    } else if (dayStatus.dayType === 'POST_COURSE') {
      setProtocolState('COURSE_COMPLETED_REST');
      stopAllPlayback();
      stopRestCountdown();
    } else if (protocolState === 'COURSE_WEEKEND_REST' || protocolState === 'COURSE_COMPLETED_REST') {
      setProtocolState('IDLE');
    }
  }, [courseConfig.currentDay, courseConfig.totalDays]);

  // Остановка только звукового потока (без сброса текущего трека метаданных)
  const stopAudioStreamOnly = () => {
    soundEngine.stop();
    if (audioElemRef.current) {
      audioElemRef.current.pause();
      audioElemRef.current = null;
    }
  };

  // Полная остановка воспроизведения со сбросом счётчика и состояния
  const stopAllPlayback = () => {
    stopAudioStreamOnly();
    currentOnEndedRef.current = null;
    setCurrentPlayingTrack(null);
    setIsPlaybackPaused(false);
    setPlaybackSeconds(0);
    sessionEndTimeRef.current = null;
    sessionRemainingOnPauseRef.current = 0;
  };

  // Кнопка СТОП внизу экрана:
  // - Одно нажатие останавливает трек и счётчик прослушивания
  // - Повторное нажатие запускает трек и счётчик прослушивания
  const handleTogglePausePlayback = () => {
    soundEngine.playClickSound();

    const isPlaying = (protocolState === 'PLAYING_FABULA' || protocolState === 'PLAYING_BRT') && !!currentPlayingTrack;
    if (!isPlaying) {
      // Если воспроизведение ещё не запущено — запускаем фабулу
      if (dayStatus.isLocked || isResting) return;
      handleFabulaClick(activeColor || 'red');
      return;
    }

    if (!isPlaybackPaused) {
      // ОДНО НАЖАТИЕ: останавливает трек и счётчик прослушивания
      setIsPlaybackPaused(true);
      if (sessionEndTimeRef.current) {
        sessionRemainingOnPauseRef.current = Math.max(0, sessionEndTimeRef.current - Date.now());
      }
      if (audioElemRef.current) {
        audioElemRef.current.pause();
      }
      soundEngine.pause();
    } else {
      // ПОВТОРНОЕ НАЖАТИЕ: запускает трек и счётчик прослушивания
      setIsPlaybackPaused(false);
      if (sessionRemainingOnPauseRef.current > 0) {
        sessionEndTimeRef.current = Date.now() + sessionRemainingOnPauseRef.current;
      }
      if (audioElemRef.current) {
        audioElemRef.current.play().catch(() => {});
      }
      soundEngine.resume();
    }
  };

  // =========================================================================
  // 1. ЗАПУСК И "СТОП" ФАБУЛЫ .FLAC (Основной светофор)
  // =========================================================================
  const handleFabulaClick = (color: FabulaColor) => {
    if (dayStatus.isLocked) return;

    // ПОВТОРНОЕ НАЖАТИЕ НА ТУ ЖЕ САМУЮ АКТИВНУЮ КНОПКУ -> ПРИНУДИТЕЛЬНЫЙ "СТОП"
    if (protocolState === 'PLAYING_FABULA' && activeColor === color) {
      stopAllPlayback();
      stopRestCountdown();
      setProtocolState('IDLE');
      setActiveColor(null);
      return;
    }

    // Если сейчас играет БРТ или другая фабула — останавливаем
    if (protocolState === 'PLAYING_FABULA' || protocolState === 'PLAYING_BRT') {
      stopAllPlayback();
    }

    if (protocolState !== 'IDLE' && protocolState !== 'PLAYING_FABULA') {
      return; // Во время периода покоя или ожидания БРТ светофор отдыхает
    }

    // Разрешена только следующая по порядку кнопка светофора
    if (protocolState !== 'PLAYING_FABULA' && color !== allowedTrafficColor) {
      return;
    }

    soundEngine.playClickSound();

    const folderMap: Record<FabulaColor, '1_Red' | '2_Yellow' | '3_Green'> = {
      red: '1_Red',
      yellow: '2_Yellow',
      green: '3_Green',
    };

    const targetFolder = folderMap[color];
    const fabula = scanFolderForFabula(targetFolder, files);

    if (!fabula) {
      showEmptyAndOpenFilePicker(targetFolder);
      return;
    }

    // Запуск воспроизведения
    setActiveColor(color);
    lastPlayedColorRef.current = color;
    try {
      localStorage.setItem('artemka_last_played_color', color);
    } catch {}
    persistCycleTimestamp();
    setCurrentPlayingTrack(fabula);
    setProtocolState('PLAYING_FABULA');

    // Пункт «Д» (normal_5m): детский режим — фабула проигрывается ровно 20 минут (1200 секунд)
    if (loopModeRef.current === 'normal_5m') {
      const sessionSec = SESSION_DURATION_MAP['normal_5m'] || 1200;
      setTotalSessionTimer(sessionSec);
      totalSessionTimerRef.current = sessionSec;
      sessionEndTimeRef.current = Date.now() + sessionSec * 1000;
      sessionRemainingOnPauseRef.current = 0;
    } else {
      setTotalSessionTimer(0);
      totalSessionTimerRef.current = 0;
      sessionEndTimeRef.current = null;
      sessionRemainingOnPauseRef.current = 0;
    }

    playFabulaTrack(fabula, targetFolder);
  };

  const playFabulaTrack = (
    track: AudioItem,
    folder: '1_Red' | '2_Yellow' | '3_Green'
  ) => {
    playTrackAudio(track, () => {
      // Пункт «Д»: если 20-минутный детский цикл фабулы ещё не истёк — повторяем фабулу
      if (loopModeRef.current === 'normal_5m' && totalSessionTimerRef.current > 0) {
        playFabulaTrack(track, folder);
        return;
      }
      setTotalSessionTimer(0);
      totalSessionTimerRef.current = 0;
      sessionEndTimeRef.current = null;
      sessionRemainingOnPauseRef.current = 0;
      onFabulaCompleted(folder);
    });
  };

  const playTrackAudio = (track: AudioItem, onEnded: () => void) => {
    // Останавливаем предыдущий звук, не сбрасывая при этом текущий трек
    stopAudioStreamOnly();
    currentOnEndedRef.current = onEnded;
    setCurrentPlayingTrack(track);
    // При начале прослушивания трека счётчик стартует с нуля
    setPlaybackSeconds(0);
    setIsPlaybackPaused(false);

    if (track.customBlobUrl) {
      const audio = new Audio(track.customBlobUrl);
      audio.volume = 0.8;

      // Восстанавливаем сохраненный прогресс воспроизведения после перезапуска
      const savedPos = getTrackProgress(track.id);
      if (savedPos > 0 && isFinite(savedPos)) {
        audio.currentTime = savedPos;
        setPlaybackSeconds(Math.round(savedPos));
      }

      audio.onloadedmetadata = () => {
        if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
          const realDuration = Math.round(audio.duration);
          setCurrentPlayingTrack((prev) => (prev ? { ...prev, durationSeconds: realDuration } : prev));

          if (savedPos > 0 && savedPos < audio.duration) {
            audio.currentTime = savedPos;
            setPlaybackSeconds(Math.round(savedPos));
          }
        }
      };

      audio.ontimeupdate = () => {
        if (audio.currentTime > 0) {
          saveTrackProgress(track.id, audio.currentTime);
        }
      };

      audio.onended = () => {
        clearTrackProgress(track.id);
        onEnded();
      };
      audio.onerror = () => {
        playFallbackSynth(track, onEnded);
      };
      audioElemRef.current = audio;
      audio.play().catch(() => {
        playFallbackSynth(track, onEnded);
      });
    } else {
      playFallbackSynth(track, onEnded);
    }
  };

  const playFallbackSynth = (track: AudioItem, onEnded: () => void) => {
    const color = track.folder === '1_Red' ? 'red' : track.folder === '2_Yellow' ? 'yellow' : 'green';
    soundEngine.playColorSynth(color, () => {
      onEnded();
    });
  };

  // =========================================================================
  // 2. ЗАВЕРШЕНИЕ СЕССИИ ФАБУЛЫ И ЗАПУСК ОТДЫХА ПЕРЕД БРТ
  // =========================================================================

  const onFabulaCompleted = (folder: '1_Red' | '2_Yellow' | '3_Green') => {
    stopAllPlayback();
    setActiveColor(null);
    setTotalSessionTimer(0);
    totalSessionTimerRef.current = 0;
    sessionEndTimeRef.current = null;
    sessionRemainingOnPauseRef.current = 0;

    const folderColorMap: Record<'1_Red' | '2_Yellow' | '3_Green', FabulaColor> = {
      '1_Red': 'red',
      '2_Yellow': 'yellow',
      '3_Green': 'green',
    };
    const completedColor = folderColorMap[folder];
    currentCycleColorRef.current = completedColor;
    try {
      localStorage.setItem('artemka_cycle_color', completedColor);
      localStorage.setItem('artemka_last_played_color', completedColor);
    } catch {}

    const brtFiles = scanFolderForBrt(folder, files);
    setBrtQueue(brtFiles);

    // Если в зелёной папке нет Брт то сразу после прослушивания фабулы зелёная кнопка гаснет
    // и приложение переходит в спящий режим строго до 04:00 утра
    if (completedColor === 'green' && brtFiles.length === 0) {
      enterSleepModeUntil4Am();
      return;
    }

    // После окончания фабулы кнопка гаснет и включается таймер Отдых 2 часа
    setProtocolState('REST_1_WAIT_BRT');
    setTimerLabel('Отдых');
    updateRestTimer(TWO_HOURS_MS / 1000);

    soundEngine.playNotificationAlert();

    startCountdown(
      TWO_HOURS_MS,
      () => {
        handleRest1Completed(completedColor, brtFiles);
      },
      'REST_1_WAIT_BRT',
      brtFiles,
      completedColor
    );
  };

  const startCountdown = (
    durationMs: number,
    onComplete: () => void,
    stateForRestore: ProtocolState,
    queueForRestore: AudioItem[] = [],
    cycleColorForRestore?: string
  ) => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    const targetEndTime = Date.now() + durationMs;
    restEndTimeRef.current = targetEndTime;
    restOnCompleteRef.current = onComplete;

    const remaining = Math.max(0, Math.ceil(durationMs / 1000));
    updateRestTimer(remaining);
    setTimerLabel('Отдых');

    // Сохраняем в localStorage для выживания при блокировке экрана / сворачивании
    persistRestTimer(
      targetEndTime,
      'Отдых',
      stateForRestore,
      queueForRestore,
      cycleColorForRestore || currentCycleColorRef.current
    );
    persistCycleTimestamp();

    // Планируем звуковое уведомление через @capacitor/local-notifications
    scheduleRestNotification(targetEndTime, 'Отдых');

    intervalRef.current = window.setInterval(tickRestCountdown, 1000);
  };

  // Зеленый пешеход: СТАРТ / СТОП БРТ
  const handleBrtGreenClick = () => {
    // Если активен период отдыха или спящий режим — зелёная кнопка правого светофора неактивна
    if (protocolState === 'REST_1_WAIT_BRT' || protocolState === 'REST_2_FINAL' || protocolState === 'SLEEP_UNTIL_4AM') {
      return;
    }

    // Повторное нажатие при проигрывании БРТ -> СТОП
    if (protocolState === 'PLAYING_BRT') {
      stopAllPlayback();
      stopRestCountdown();
      setTotalSessionTimer(0);
      totalSessionTimerRef.current = 0;
      sessionEndTimeRef.current = null;
      sessionRemainingOnPauseRef.current = 0;
      brtStepRef.current = 0;
      setProtocolState('IDLE');
      setBrtQueue([]);
      setCurrentBrtIndex(0);
      return;
    }

    const folderMap: Record<FabulaColor, '1_Red' | '2_Yellow' | '3_Green'> = {
      red: '1_Red',
      yellow: '2_Yellow',
      green: '3_Green',
    };
    const folderColor = currentCycleColorRef.current || allowedTrafficColor || 'red';
    const targetFolder = folderMap[folderColor];
    let queue = brtQueue;
    if (queue.length === 0) {
      queue = scanFolderForBrt(targetFolder, files);
      setBrtQueue(queue);
    }

    if (queue.length === 0) {
      showEmptyAndOpenFilePicker(targetFolder);
      return;
    }

    soundEngine.playClickSound();

    // 1. Длительность сессии по выбранному терапевтическому режиму:
    // Состояние 1: «По треку» -> 0 секунд (обычное воспроизведение по длине трека, без таймера)
    // Состояние 2: «Д» -> 0 секунд для БРТ (режим «Д» предназначен исключительно для фабул: 20 минут детского режима; БРТ играет по длине трека)
    // Состояние 3: «1 Брт 20м» -> 1200 секунд (20 минут)
    // Состояние 4: «4Брт» -> ровно 20 минут (1200 секунд)
    let sessionDurationSeconds = 0;
    if (loopModeRef.current === 'single_20m' || loopModeRef.current === 'all_20m') {
      sessionDurationSeconds = SESSION_DURATION_MAP[loopModeRef.current] || 1200;
      setSessionTotalSeconds(sessionDurationSeconds);
    } else {
      sessionDurationSeconds = 0;
    }

    // 2. Логика выбора трека:
    // Для Сценариев «По треку», «Д» и «1Брт» плеер воспроизводит тот трек, который в списке первый (по умолчанию — первый трек списка).
    // Для Сценария «4Брт» плеер всегда начинает последовательное воспроизведение строго с первого трека списка (индекс 0).
    const startIndex = loopModeRef.current === 'all_20m'
      ? 0
      : (currentBrtIndex >= 0 && currentBrtIndex < queue.length ? currentBrtIndex : 0);

    brtStepRef.current = 0;

    setTotalSessionTimer(sessionDurationSeconds);
    totalSessionTimerRef.current = sessionDurationSeconds;
    sessionEndTimeRef.current = sessionDurationSeconds > 0 ? Date.now() + sessionDurationSeconds * 1000 : null;
    sessionRemainingOnPauseRef.current = 0;

    setProtocolState('PLAYING_BRT');
    persistCycleTimestamp();
    setCurrentBrtIndex(startIndex);
    playNextBrtTrack(startIndex, queue);
  };

  const playNextBrtTrack = (index: number, queue: AudioItem[]) => {
    if (queue.length === 0) {
      onBrtSessionCompleted();
      return;
    }

    if (index >= queue.length) {
      index = 0;
    }

    const currentTrack = queue[index];
    setCurrentBrtIndex(index);
    setCurrentPlayingTrack(currentTrack);

    playTrackAudio(currentTrack, () => {
      // Если время терапевтической сессии БРТ (20 минут для 1Брт или 4Брт) уже истекло — завершаем сессию
      const isBrtTimedMode = loopModeRef.current === 'single_20m' || loopModeRef.current === 'all_20m';
      if (isBrtTimedMode && totalSessionTimerRef.current <= 0) {
        onBrtSessionCompleted();
        return;
      }

      // Сценарии поведения при окончании файла трека:
      // Сценарий для режимов «По треку» и «Д»: БРТ воспроизводится по длине трека (без зацикливания)
      // Сценарий «1Брт»: текущий трек зацикливается до истечения 20 минут общего таймера
      // Сценарий «4Брт»: треки проигрываются по очереди (1 -> 2 -> 3 -> 4 -> 1...) по кольцевому циклу (index + 1) % queue.length
      const decision = resolveNextTrackDecision(loopModeRef.current, index, queue.length, brtStepRef.current);
      if (decision.action === 'repeat_current') {
        playNextBrtTrack(index, queue);
      } else if (decision.action === 'play_next_index' && typeof decision.nextIndex === 'number') {
        playNextBrtTrack(decision.nextIndex, queue);
      } else {
        onBrtSessionCompleted();
      }
    });
  };

  const onBrtSessionCompleted = () => {
    stopAllPlayback();
    setTotalSessionTimer(0);
    totalSessionTimerRef.current = 0;
    sessionEndTimeRef.current = null;
    sessionRemainingOnPauseRef.current = 0;
    brtStepRef.current = 0;

    const currentColor = currentCycleColorRef.current || 'red';

    // 3. После прослушивания БРТ зелёная кнопка БРТ гаснет.
    // 4. Приложение должно оставаться в спящем режиме строго до 04:00 утра.
    if (currentColor === 'green') {
      enterSleepModeUntil4Am();
      return;
    }

    // После окончания прослушивания БРТ зелёная кнопка БРТ правого светофора гаснет.
    // Включается таймер Отдых 2 часа. и после отключения таймера Отдых 2 часа активной становится следующая кнопка левого светофора.
    setProtocolState('REST_2_FINAL');
    setTimerLabel('Отдых');
    updateRestTimer(TWO_HOURS_MS / 1000);

    soundEngine.playNotificationAlert();

    startCountdown(
      TWO_HOURS_MS,
      () => {
        handleRest2Completed(currentColor);
      },
      'REST_2_FINAL',
      [],
      currentColor
    );
  };

  // =========================================================================
  // 3. НИЖНЯЯ ТЕХНИЧЕСКАЯ ПОЛОСА УПРАВЛЕНИЯ
  // =========================================================================

  // 1) БРТ Вкл/Выкл
  const handleBrtToggle = () => {
    soundEngine.playClickSound();
    if (!isBrtToggleActive) {
      // Активируем БРТ: кнопка становится серой "БРТ Выкл", правый светофор включается
      setIsBrtToggleActive(true);
      const folderMap: Record<FabulaColor, '1_Red' | '2_Yellow' | '3_Green'> = {
        red: '1_Red',
        yellow: '2_Yellow',
        green: '3_Green',
      };
      const currentFolder = folderMap[allowedTrafficColor] || '1_Red';
      const queue = scanFolderForBrt(currentFolder, files);
      setBrtQueue(queue);
      // Во время отдыха левый светофор фабул должен оставаться заблокированным намертво (alpha = 0.2)
      if (protocolState !== 'REST_1_WAIT_BRT' && protocolState !== 'REST_2_FINAL') {
        setProtocolState('BRT_READY');
      }
    } else {
      // Деактивируем БРТ: возвращается в яркую зеленую "БРТ Вкл"
      setIsBrtToggleActive(false);
      if (protocolState === 'PLAYING_BRT' || protocolState === 'BRT_READY') {
        stopAllPlayback();
        setProtocolState('IDLE');
      }
    }
  };

  // 2) Тест ("🔄")
  const handleTestSignals = () => {
    if (isTestingSignals) return;
    setIsTestingSignals(true);
    soundEngine.playClickSound();

    let step = 0;
    const testInterval = window.setInterval(() => {
      setTestSignalIndex(step);
      soundEngine.playClickSound();
      step++;
      if (step > 4) {
        clearInterval(testInterval);
        setTimeout(() => {
          setIsTestingSignals(false);
          setTestSignalIndex(-1);
        }, 500);
      }
    }, 550);
  };

  // 3) Отмена ("❌")
  const handleCancelTimer = () => {
    soundEngine.playClickSound();
    stopRestCountdown();
    stopAllPlayback();
    setTotalSessionTimer(0);
    totalSessionTimerRef.current = 0;
    sessionEndTimeRef.current = null;
    sessionRemainingOnPauseRef.current = 0;

    clearPersistedSleepUntil4Am();
    sleepTargetMsRef.current = null;
    setSleepRemainingSeconds(0);

    setProtocolState('IDLE');
    setActiveColor(null);
    setIsBrtToggleActive(false);
    setIsTestingSignals(false);
    setTestSignalIndex(-1);
    updateRestTimer(0);
    setTimerLabel('');

    if (!allowedTrafficColor) {
      setAllowedTrafficColor('red');
      currentCycleColorRef.current = 'red';
      try {
        localStorage.setItem('artemka_allowed_traffic_color', 'red');
        localStorage.setItem('artemka_cycle_color', 'red');
      } catch {}
    }
  };

  const handleLongPressStart = () => {
    longPressTimerRef.current = window.setTimeout(() => {
      setIsDoctorModalOpen(true);
    }, 1500);
  };

  const handleLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const formatTime = (totalSec: number) => {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatPlaybackTime = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isWeekendLocked = dayStatus.isLocked;
  const isSleepingUntilMorning = protocolState === 'SLEEP_UNTIL_4AM';
  const isResting = protocolState === 'REST_1_WAIT_BRT' || protocolState === 'REST_2_FINAL';
  const isBrtPedeGreenActive = !isResting && !isSleepingUntilMorning && (protocolState === 'BRT_READY' || protocolState === 'PLAYING_BRT' || isBrtToggleActive || testSignalIndex === 4);
  const isBrtPedeRedActive = isResting || isSleepingUntilMorning || testSignalIndex === 3;

  // После остановки 2-часового отдыха включается ТОЛЬКО СЛЕДУЮЩАЯ по порядку кнопка светофора:
  // Красный -> Жёлтый -> Зелёный -> Красный.
  const isRedEnabled =
    !isWeekendLocked &&
    !isResting &&
    !isSleepingUntilMorning &&
    (protocolState === 'PLAYING_FABULA' ? activeColor === 'red' : allowedTrafficColor === 'red');
  const isYellowEnabled =
    !isWeekendLocked &&
    !isResting &&
    !isSleepingUntilMorning &&
    (protocolState === 'PLAYING_FABULA' ? activeColor === 'yellow' : allowedTrafficColor === 'yellow');
  const isGreenEnabled =
    !isWeekendLocked &&
    !isResting &&
    !isSleepingUntilMorning &&
    (protocolState === 'PLAYING_FABULA' ? activeColor === 'green' : allowedTrafficColor === 'green');

  // Состояние плеера: вычисление процента прогресса трека/сессии (0..100)
  const isPlayingAudio = (protocolState === 'PLAYING_FABULA' || protocolState === 'PLAYING_BRT') && !!currentPlayingTrack;
  const totalTrackDuration = currentPlayingTrack?.durationSeconds || 0;
  const sessionTotal =
    loopMode === 'all_20m' && sessionTotalSeconds > 0
      ? sessionTotalSeconds
      : (SESSION_DURATION_MAP[loopMode] || 1200);
  const isSessionProgress =
    (protocolState === 'PLAYING_BRT' && (loopMode === 'all_20m' || totalSessionTimer > 0)) ||
    (protocolState === 'PLAYING_FABULA' && loopMode === 'normal_5m' && totalSessionTimer > 0);
  const playbackProgressPercent = isPlayingAudio
    ? isSessionProgress
      ? totalSessionTimer <= 0
        ? 100
        : Math.min(100, Math.max(0, ((sessionTotal - totalSessionTimer) / sessionTotal) * 100))
      : totalTrackDuration > 0
      ? Math.min(100, Math.max(0, (playbackSeconds / totalTrackDuration) * 100))
      : 0
    : 0;

  const activeColorForBrtCount = currentCycleColorRef.current || allowedTrafficColor || 'red';
  const folderMapForBrtCount: Record<FabulaColor, '1_Red' | '2_Yellow' | '3_Green'> = {
    red: '1_Red',
    yellow: '2_Yellow',
    green: '3_Green',
  };
  const currentFolderBrtCount = scanFolderForBrt(folderMapForBrtCount[activeColorForBrtCount], files).length;

  return (
    <div
      className="w-screen h-screen flex flex-col m-0 p-2 sm:p-4 select-none box-border overflow-hidden transition-colors duration-300"
      style={{ backgroundColor: themeMode === 'light' ? '#E5E5EA' : '#1C1C1E' }}
    >
      {/* 1. ВЕРХНИЙ ИНДИКАТОР: ОБУЧАЮЩИЙ КАЛЕНДАРЬ 5/2 (секретное удержание для врача) */}
      <div
        id="layout_calendar_header"
        onMouseDown={handleLongPressStart}
        onMouseUp={handleLongPressEnd}
        onTouchStart={handleLongPressStart}
        onTouchEnd={handleLongPressEnd}
        className="w-full bg-[#2C2C2E] rounded-2xl px-4 py-2 sm:py-2.5 flex items-center justify-between border border-neutral-700/60 shadow-md cursor-pointer active:scale-[0.99] transition-transform flex-shrink-0 text-neutral-100"
        title="Удерживайте 2 секунды для входа в меню врача"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl overflow-hidden border border-amber-400/40 shadow-[0_0_12px_rgba(251,191,36,0.3)] bg-neutral-900 flex-shrink-0">
            <img
              src="/icon.jpg"
              alt="Артёмка"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span id="tv_calendar_day" className={`text-xl sm:text-2xl font-black tracking-wider ${dayStatus.colorClass}`}>
                {dayStatus.title}
              </span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${dayStatus.badgeBg}`}>
                {courseConfig.totalDays} Дней 5/2
              </span>
            </div>
            <div
              id="tv_calendar_status"
              className="text-xs text-neutral-400 flex items-center gap-1.5 mt-0.5"
            >
              {protocolState === 'SLEEP_UNTIL_4AM' ? (
                <span className="text-indigo-400 font-mono font-bold flex items-center gap-1">
                  <Moon className="w-3.5 h-3.5" /> Спящий режим до 04:00 ({formatTime(sleepRemainingSeconds)})
                </span>
              ) : protocolState === 'PLAYING_FABULA' && loopMode === 'normal_5m' && totalSessionTimer > 0 ? (
                <span className="text-emerald-400 font-mono font-bold flex items-center gap-1">
                  ⏱ Фабула (режим «Д»): {formatTime(totalSessionTimer)}
                </span>
              ) : protocolState === 'PLAYING_BRT' && (loopMode === 'all_20m' || totalSessionTimer > 0) ? (
                <span className="text-emerald-400 font-mono font-bold flex items-center gap-1">
                  ⏱ Сессия БРТ: {totalSessionTimer > 0 ? formatTime(totalSessionTimer) : 'доигрывание трека...'}
                </span>
              ) : timerRemainingSeconds > 0 ? (
                <span className="text-amber-300 font-mono font-bold flex items-center gap-1">
                  ⏳ {timerLabel}: {formatTime(timerRemainingSeconds)}
                </span>
              ) : dayStatus.dayType === 'WEEKEND' ? (
                <span className="text-orange-400 flex items-center gap-1">
                  <Moon className="w-3.5 h-3.5" /> {dayStatus.subtitle}
                </span>
              ) : dayStatus.dayType === 'POST_COURSE' ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> {dayStatus.subtitle}
                </span>
              ) : (
                <span>{dayStatus.subtitle}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {protocolState === 'SLEEP_UNTIL_4AM' ? (
            <div
              id="tv_sleep_header_badge"
              className="hidden sm:flex px-2.5 py-1 bg-indigo-500/15 border border-indigo-500/40 rounded-full text-xs font-mono font-bold text-indigo-300 animate-pulse tracking-wide items-center gap-1"
            >
              <span>Сон до 04:00:</span>
              <span>{formatTime(sleepRemainingSeconds)}</span>
            </div>
          ) : protocolState === 'PLAYING_FABULA' && loopMode === 'normal_5m' && totalSessionTimer > 0 ? (
            <div
              id="tv_session_header_badge"
              className="hidden sm:flex px-2.5 py-1 bg-emerald-500/15 border border-emerald-500/40 rounded-full text-xs font-mono font-bold text-emerald-300 animate-pulse tracking-wide items-center gap-1"
            >
              <span>Детский («Д»):</span>
              <span>{formatTime(totalSessionTimer)}</span>
            </div>
          ) : protocolState === 'PLAYING_BRT' && (loopMode === 'all_20m' || totalSessionTimer > 0) ? (
            <div
              id="tv_session_header_badge"
              className="hidden sm:flex px-2.5 py-1 bg-emerald-500/15 border border-emerald-500/40 rounded-full text-xs font-mono font-bold text-emerald-300 animate-pulse tracking-wide items-center gap-1"
            >
              <span>Сессия:</span>
              <span>{totalSessionTimer > 0 ? formatTime(totalSessionTimer) : 'доигрывание'}</span>
            </div>
          ) : timerRemainingSeconds > 0 ? (
            <div
              id="tv_rest_header_badge"
              className="hidden sm:flex px-2.5 py-1 bg-amber-500/15 border border-amber-500/40 rounded-full text-xs font-mono font-bold text-amber-300 animate-pulse tracking-wide items-center gap-1"
            >
              <span>⏳ {timerLabel}:</span>
              <span>{formatTime(timerRemainingSeconds)}</span>
            </div>
          ) : null}

          <button
            id="btn_open_doctor_modal"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsDoctorModalOpen(true);
            }}
            className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition cursor-pointer"
            title="Меню врача (секретное)"
          >
            <Settings className="w-4 h-4 text-amber-400" />
          </button>
        </div>
      </div>

      {/* 2. ДВЕ КОЛОНКИ: ОСНОВНОЙ СВЕТОФОР (СЛЕВА) И ПЕШЕХОДНЫЙ СВЕТОФОР БРТ (СПРАВА) */}
      <div className="flex-1 flex flex-row gap-3 sm:gap-6 h-full min-h-0 py-1.5 sm:py-3 items-center justify-center">
        {/* ЛЕВАЯ КОЛОНКА: ОСНОВНОЙ СВЕТОФОР (ФАБУЛЫ .FLAC) */}
        <div className="relative flex flex-col items-center h-full max-w-[190px] sm:max-w-[220px] md:max-w-[240px] w-full justify-center">
          <div
            id="street_traffic_light_container"
            className={`w-full rounded-[38px] sm:rounded-[46px] p-3 sm:p-4 border-4 flex flex-col items-center justify-around h-full relative transition-colors duration-300 ${
            themeMode === 'light'
              ? 'bg-gradient-to-b from-[#5E626E] via-[#4A4D57] to-[#383A42] border-[#6D7280] shadow-[0_15px_35px_rgba(0,0,0,0.3),inset_0_2px_4px_rgba(255,255,255,0.22)]'
              : 'bg-gradient-to-b from-[#18181b] via-[#121214] to-[#0e0e10] border-[#27272a] shadow-[0_15px_40px_rgba(0,0,0,0.85),inset_0_2px_4px_rgba(255,255,255,0.08)]'
          }`}
        >
          {/* Верхний декоративный козырек корпуса */}
          <div
            className={`absolute -top-2.5 w-14 sm:w-16 h-2.5 rounded-t-full border-t transition-colors ${
              themeMode === 'light'
                ? 'bg-gradient-to-b from-[#6E7382] to-[#4A4D57] border-[#7F8596]'
                : 'bg-[#27272a] border-[#3f3f46]'
            }`}
          />

          {/* 1. КРАСНЫЙ СИГНАЛ (#FF0000) */}
          <div className="flex flex-col items-center w-full">
            <div
              className={`w-20 sm:w-24 md:w-28 h-2 sm:h-2.5 rounded-t-full border-t border-x shadow-md relative -mb-1 z-10 opacity-90 transition-colors ${
                themeMode === 'light'
                  ? 'bg-gradient-to-b from-[#6E7382] to-[#434650] border-[#7F8596]'
                  : 'bg-gradient-to-b from-[#27272a] to-[#18181b] border-[#3f3f46]'
              }`}
            />
            <button
              id="btn_fabula_red"
              onClick={() => handleFabulaClick('red')}
              aria-label="Красная фабула"
              disabled={!isRedEnabled}
              className={`relative w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full flex items-center justify-center transition-all duration-300 outline-none border-4 ${
                activeColor === 'red' && protocolState === 'PLAYING_FABULA'
                  ? 'bg-[#FF0000] border-red-200 shadow-[0_0_55px_#FF0000,inset_0_0_20px_rgba(255,255,255,0.7)] ring-4 ring-red-400/80 scale-105 cursor-pointer animate-pulse'
                  : testSignalIndex === 0
                  ? 'bg-[#FF0000] border-white shadow-[0_0_45px_#FF0000] scale-105'
                  : !isRedEnabled
                  ? 'bg-[#330000] border-[#220000] opacity-20 cursor-not-allowed'
                  : 'bg-[#FF0000] border-[#FFAAAA] shadow-[0_0_25px_rgba(255,0,0,0.65),inset_0_0_15px_rgba(255,255,255,0.4)] hover:scale-105 active:scale-95 cursor-pointer'
              }`}
            >
              <div className="absolute inset-1.5 rounded-full pointer-events-none opacity-25 bg-[radial-gradient(circle,#ffffff_1.5px,transparent_1.5px)] [background-size:6px_6px]" />
              <div className="absolute inset-x-2.5 top-1.5 h-6 sm:h-7 rounded-t-full bg-gradient-to-b from-white/50 via-white/15 to-transparent pointer-events-none" />
            </button>
          </div>

          {/* 2. ЖЕЛТЫЙ СИГНАЛ (#FFD700) */}
          <div className="flex flex-col items-center w-full">
            <div
              className={`w-20 sm:w-24 md:w-28 h-2 sm:h-2.5 rounded-t-full border-t border-x shadow-md relative -mb-1 z-10 opacity-90 transition-colors ${
                themeMode === 'light'
                  ? 'bg-gradient-to-b from-[#6E7382] to-[#434650] border-[#7F8596]'
                  : 'bg-gradient-to-b from-[#27272a] to-[#18181b] border-[#3f3f46]'
              }`}
            />
            <button
              id="btn_fabula_yellow"
              onClick={() => handleFabulaClick('yellow')}
              aria-label="Желтая фабула"
              disabled={!isYellowEnabled}
              className={`relative w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full flex items-center justify-center transition-all duration-300 outline-none border-4 ${
                activeColor === 'yellow' && protocolState === 'PLAYING_FABULA'
                  ? 'bg-[#FFD700] border-yellow-100 shadow-[0_0_55px_#FFD700,inset_0_0_20px_rgba(255,255,255,0.8)] ring-4 ring-yellow-300/80 scale-105 cursor-pointer animate-pulse'
                  : testSignalIndex === 1
                  ? 'bg-[#FFD700] border-white shadow-[0_0_45px_#FFD700] scale-105'
                  : !isYellowEnabled
                  ? 'bg-[#332800] border-[#221a00] opacity-20 cursor-not-allowed'
                  : 'bg-[#FFD700] border-[#FFF3AA] shadow-[0_0_25px_rgba(255,215,0,0.65),inset_0_0_15px_rgba(255,255,255,0.5)] hover:scale-105 active:scale-95 cursor-pointer'
              }`}
            >
              <div className="absolute inset-1.5 rounded-full pointer-events-none opacity-25 bg-[radial-gradient(circle,#ffffff_1.5px,transparent_1.5px)] [background-size:6px_6px]" />
              <div className="absolute inset-x-2.5 top-1.5 h-6 sm:h-7 rounded-t-full bg-gradient-to-b from-white/50 via-white/15 to-transparent pointer-events-none" />
            </button>
          </div>

          {/* 3. ЗЕЛЕНЫЙ СИГНАЛ (#00FF00) */}
          <div className="flex flex-col items-center w-full">
            <div
              className={`w-20 sm:w-24 md:w-28 h-2 sm:h-2.5 rounded-t-full border-t border-x shadow-md relative -mb-1 z-10 opacity-90 transition-colors ${
                themeMode === 'light'
                  ? 'bg-gradient-to-b from-[#6E7382] to-[#434650] border-[#7F8596]'
                  : 'bg-gradient-to-b from-[#27272a] to-[#18181b] border-[#3f3f46]'
              }`}
            />
            <button
              id="btn_fabula_green"
              onClick={() => handleFabulaClick('green')}
              aria-label="Зеленая фабула"
              disabled={!isGreenEnabled}
              className={`relative w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full flex items-center justify-center transition-all duration-300 outline-none border-4 ${
                activeColor === 'green' && protocolState === 'PLAYING_FABULA'
                  ? 'bg-[#00FF00] border-emerald-100 shadow-[0_0_55px_#00FF00,inset_0_0_20px_rgba(255,255,255,0.7)] ring-4 ring-green-400/80 scale-105 cursor-pointer animate-pulse'
                  : testSignalIndex === 2
                  ? 'bg-[#00FF00] border-white shadow-[0_0_45px_#00FF00] scale-105'
                  : !isGreenEnabled
                  ? 'bg-[#003300] border-[#002200] opacity-20 cursor-not-allowed'
                  : 'bg-[#00FF00] border-[#AAFFAA] shadow-[0_0_25px_rgba(0,255,0,0.65),inset_0_0_15px_rgba(255,255,255,0.4)] hover:scale-105 active:scale-95 cursor-pointer'
              }`}
            >
              <div className="absolute inset-1.5 rounded-full pointer-events-none opacity-25 bg-[radial-gradient(circle,#ffffff_1.5px,transparent_1.5px)] [background-size:6px_6px]" />
              <div className="absolute inset-x-2.5 top-1.5 h-6 sm:h-7 rounded-t-full bg-gradient-to-b from-white/50 via-white/15 to-transparent pointer-events-none" />
            </button>
          </div>
        </div>
      </div>

        {/* ПРАВАЯ КОЛОНКА: ПЕШЕХОДНЫЙ СВЕТОФОР БРТ - ОДИНАКОВАЯ ЯРКОСТЬ И СОЧНОСТЬ (#FF0000, #00FF00) */}
        <div
          id="pedestrian_traffic_light_container"
          className={`w-full max-w-[190px] sm:max-w-[220px] md:max-w-[240px] rounded-[38px] sm:rounded-[46px] p-3 sm:p-4 border-4 flex flex-col items-center justify-around h-full relative transition-colors duration-300 ${
            themeMode === 'light'
              ? 'bg-gradient-to-b from-[#5E626E] via-[#4A4D57] to-[#383A42] border-[#6D7280] shadow-[0_15px_35px_rgba(0,0,0,0.3),inset_0_2px_4px_rgba(255,255,255,0.22)]'
              : 'bg-gradient-to-b from-[#18181b] via-[#121214] to-[#0e0e10] border-[#27272a] shadow-[0_15px_40px_rgba(0,0,0,0.85),inset_0_2px_4px_rgba(255,255,255,0.08)]'
          }`}
        >
          {/* Красный пешеход (#FF0000) (БРТ Стоп) */}
          <div className="flex flex-col items-center w-full">
            <button
              id="btn_brt_red"
              onClick={() => {
                if (isBrtPedeRedActive) {
                  soundEngine.playClickSound();
                }
              }}
              aria-label="БРТ Стоп"
              className={`w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full flex flex-col items-center justify-center transition-all duration-300 border-4 ${
                isBrtPedeRedActive
                  ? 'bg-[#FF0000] border-white shadow-[0_0_55px_#FF0000] ring-4 ring-red-400/80 scale-105 opacity-100'
                  : 'bg-[#FF0000] border-[#FFAAAA] opacity-25 hover:opacity-40 cursor-pointer'
              }`}
            >
              <ShieldAlert
                className={`w-11 h-11 sm:w-13 sm:h-13 text-white transition-transform ${
                  isBrtPedeRedActive ? 'animate-pulse scale-110' : 'opacity-90'
                }`}
                strokeWidth={2.4}
              />
            </button>
          </div>

          {/* Зеленый пешеход (#00FF00) (БРТ Поехали / СТОП) */}
          <div className="flex flex-col items-center w-full">
            <button
              id="btn_brt_green"
              onClick={handleBrtGreenClick}
              disabled={isResting}
              aria-label="БРТ Поехали"
              className={`w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full flex flex-col items-center justify-center transition-all duration-300 border-4 ${
                protocolState === 'PLAYING_BRT'
                  ? 'bg-[#00FF00] border-white shadow-[0_0_55px_#00FF00] ring-4 ring-emerald-300 scale-105 animate-pulse opacity-100 cursor-pointer'
                  : isResting
                  ? 'bg-[#003300] border-[#002200] opacity-20 cursor-not-allowed'
                  : isBrtPedeGreenActive
                  ? 'bg-[#00FF00] border-white shadow-[0_0_50px_#00FF00] ring-4 ring-emerald-400/80 scale-105 opacity-100 cursor-pointer'
                  : 'bg-[#003300] border-[#002200] opacity-20 cursor-not-allowed'
              }`}
            >
              <Footprints
                className={`w-11 h-11 sm:w-13 sm:h-13 transition-transform ${
                  isResting
                    ? 'text-neutral-600 opacity-40'
                    : isBrtPedeGreenActive
                    ? 'scale-110 text-black animate-bounce'
                    : 'text-neutral-500 opacity-30'
                }`}
                strokeWidth={2.4}
              />
            </button>
          </div>
        </div>
      </div>

      {/* 3. НЕБРОСКАЯ АККУРАТНАЯ СТРОКА НАЗВАНИЯ ТРЕКА */}
      <div className="h-6 flex items-center justify-center text-center flex-shrink-0 mb-1">
        {currentPlayingTrack ? (
          <div
            id="tv_track_title"
            className={`${
              themeMode === 'light' ? 'text-neutral-700' : 'text-neutral-200'
            } text-xs sm:text-sm font-normal tracking-wide truncate max-w-md px-4 transition-opacity duration-300 opacity-100`}
          >
            ▶ {currentPlayingTrack.displayName}
          </div>
        ) : null}
      </div>

      {/* 4. НИЖНЯЯ СТРОКА УПРАВЛЕНИЯ И ИЗОЛИРОВАННЫЙ АДДОН ЗАЦИКЛИВАНИЯ ТРЕКОВ */}
      <div className="w-full relative flex-shrink-0">
        {/* Кнопка терапевтических режимов БРТ: расположена над левой нижней частью экрана, строго над полосой прогресса */}
        <div
          className={`absolute bottom-full mb-1 sm:mb-1.5 left-2 sm:left-3 z-30 transition-all duration-300 ease-out ${
            !isResting
              ? 'opacity-100 translate-y-0 pointer-events-auto scale-100'
              : 'opacity-40 translate-y-0 pointer-events-none scale-95'
          }`}
        >
          <LoopButton
            mode={loopMode}
            onToggle={handleCycleLoopMode}
            currentTrackNum={protocolState === 'PLAYING_BRT' ? currentBrtIndex + 1 : 1}
            totalTracksInQueue={
              protocolState === 'PLAYING_BRT' && brtQueue.length > 0
                ? brtQueue.length
                : (currentFolderBrtCount > 0 ? currentFolderBrtCount : 4)
            }
          />
        </div>

        <div
          id="layout_bottom_control_bar"
          className={`w-full rounded-xl px-4 py-2 flex items-center justify-between border shadow-lg relative overflow-hidden transition-colors ${
            themeMode === 'light'
              ? 'bg-[#F2F2F7] border-neutral-300/90 text-neutral-900'
              : 'bg-[#2C2C2E] border-neutral-700/60 text-neutral-100'
          }`}
        >
          {/* Горизонтальная полоса прогресса зелёного цвета по верхней границе нижней строки над кнопками */}
        <div
          id="pb_playback_progress_container"
          className={`absolute top-0 left-0 right-0 h-1 sm:h-1.5 overflow-hidden ${
            themeMode === 'light' ? 'bg-neutral-300/80' : 'bg-neutral-800/90'
          }`}
          title={`Прогресс: ${Math.round(playbackProgressPercent)}%`}
        >
          <div
            id="pb_playback_progress"
            className="h-full bg-[#00E676] shadow-[0_0_10px_#00E676] transition-all duration-300 ease-out"
            style={{ width: `${playbackProgressPercent}%` }}
          />
        </div>

        {/* 1) Левый угол строки: кнопка/счётчик таймера и кнопка СТОП ближе к ней */}
        <div className="flex items-center gap-2 z-10">
          {/* Счётчик/кнопка времени прослушивания в левом углу строки */}
          <div
            id="tv_playback_timer"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border font-mono text-xs sm:text-sm font-bold tracking-wide select-none transition-all ${
              (protocolState === 'PLAYING_FABULA' || protocolState === 'PLAYING_BRT') && currentPlayingTrack
                ? isPlaybackPaused
                  ? 'bg-[#1C1C1E] border-amber-500/80 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                  : 'bg-[#1C1C1E] border-sky-500/80 text-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.4)]'
                : 'bg-[#1C1C1E] border-neutral-700/70 text-neutral-400'
            }`}
            title="Время прослушивания"
          >
            <span
              className={
                (protocolState === 'PLAYING_FABULA' || protocolState === 'PLAYING_BRT') && currentPlayingTrack
                  ? isPlaybackPaused
                    ? 'text-amber-400'
                    : 'text-emerald-400 animate-pulse'
                  : 'text-neutral-500'
              }
            >
              ⏱
            </span>
            <span
              className={
                (protocolState === 'PLAYING_FABULA' || protocolState === 'PLAYING_BRT') && currentPlayingTrack
                  ? isPlaybackPaused
                    ? 'text-amber-300'
                    : 'text-sky-300'
                  : 'text-neutral-300'
              }
            >
              {formatPlaybackTime(playbackSeconds)}
            </span>
            {(protocolState === 'PLAYING_FABULA' || protocolState === 'PLAYING_BRT') && currentPlayingTrack?.durationSeconds ? (
              <span className="text-neutral-400 font-normal text-[11px] sm:text-xs">
                / {formatPlaybackTime(currentPlayingTrack.durationSeconds)}
              </span>
            ) : null}
            {isPlaybackPaused ? (
              <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-950/60 px-1 py-0.5 rounded border border-amber-500/40">
                Пауза
              </span>
            ) : null}
          </div>

          {/* Кнопка СТОП перенесена ближе к кнопке таймера */}
          <button
            id="btn_playback_stop"
            onClick={handleTogglePausePlayback}
            className={`w-8 h-8 sm:w-9 sm:h-8 rounded-lg flex items-center justify-center border transition-all active:scale-95 cursor-pointer select-none ${
              (protocolState === 'PLAYING_FABULA' || protocolState === 'PLAYING_BRT') && currentPlayingTrack
                ? isPlaybackPaused
                  ? 'bg-amber-400 hover:bg-amber-300 border-amber-200 text-neutral-950 shadow-[0_0_14px_rgba(251,191,36,0.95)] animate-pulse'
                  : 'bg-red-600 hover:bg-red-500 border-red-300 text-white shadow-[0_0_14px_rgba(239,68,68,0.9)]'
                : 'bg-[#3b1820] hover:bg-[#54212d] border-red-500 text-rose-300 shadow-[0_0_6px_rgba(239,68,68,0.4)]'
            }`}
            title={
              isPlaybackPaused
                ? 'Запустить трек и счётчик прослушивания'
                : (protocolState === 'PLAYING_FABULA' || protocolState === 'PLAYING_BRT') && currentPlayingTrack
                ? 'Остановить трек и счётчик прослушивания'
                : 'Запустить / Остановить воспроизведение'
            }
            aria-label="Стоп и запуск трека и счётчика"
          >
            {isPlaybackPaused ? (
              <Play className="w-3.5 h-3.5 fill-neutral-950 ml-0.5 text-neutral-950" />
            ) : (
              <Square
                className={`w-3.5 h-3.5 fill-current ${
                  (protocolState === 'PLAYING_FABULA' || protocolState === 'PLAYING_BRT') && currentPlayingTrack
                    ? 'text-white'
                    : 'text-rose-400'
                }`}
              />
            )}
          </button>
        </div>

        {/* Распорка для смещения кнопок БРТ и Отмена ближе к центру строки */}
        <div className="flex-1" />

        {/* 2) Ближе к центру строки: Кнопка Брт и рядом кнопка крестик */}
        <div className="flex items-center gap-1.5 z-10">
          {/* Кнопка "Брт" */}
          <button
            id="btn_brt_toggle"
            onClick={handleBrtToggle}
            className={`h-7 px-2.5 rounded-md font-bold text-xs transition-all cursor-pointer shadow-sm active:scale-95 flex items-center justify-center ${
              isBrtToggleActive
                ? 'bg-[#4B5563] hover:bg-[#374151] text-white'
                : 'bg-[#00E676] hover:bg-[#00C853] text-black shadow-[0_0_12px_rgba(0,230,118,0.4)]'
            }`}
            title="Брт"
            aria-label="Брт"
          >
            Брт
          </button>

          {/* Кнопка "Отмена" ("❌") рядом с кнопкой Брт */}
          <button
            id="btn_cancel_timer"
            onClick={handleCancelTimer}
            className="w-9 h-8 rounded-lg font-bold text-sm bg-[#3A3A3C] hover:bg-[#4A4A4D] text-red-400 flex items-center justify-center border border-neutral-600 transition-all cursor-pointer active:scale-95"
            title="Сброс блокировок (Отмена)"
            aria-label="Отмена"
          >
            ❌
          </button>
        </div>

        {/* Правая распорка для центрирования блока БРТ и Отмена */}
        <div className="flex-1" />
      </div>
    </div>

      {/* Модальное окно врача / родителя */}
      <DoctorSettingsModal
        isOpen={isDoctorModalOpen}
        onClose={() => setIsDoctorModalOpen(false)}
        courseConfig={courseConfig}
        onSaveCourseConfig={(newCfg) => {
          setCourseConfig(newCfg);
          saveCourseConfig(newCfg);
        }}
        files={files}
        onUpdateFiles={(newFiles) => {
          setFiles(newFiles);
          saveStoredFiles(newFiles);
        }}
        isTimerRunning={protocolState === 'REST_1_WAIT_BRT' || protocolState === 'REST_2_FINAL'}
        onFastForwardTimer={() => {
          stopRestCountdown();
          soundEngine.playNotificationAlert();
          advanceToNextTrafficColorAndCheckBrt();
        }}
        themeMode={themeMode}
        onToggleTheme={handleToggleTheme}
      />

      {/* Аккуратное детское всплывающее окошко "Пусто" */}
      {emptyAlertVisible && (
        <div
          id="toast-empty-folder"
          role="status"
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-[#1e1e24]/95 border border-amber-500/70 shadow-2xl rounded-2xl px-6 py-4 flex items-center gap-3 backdrop-blur-md"
        >
          <span className="text-2xl">📂</span>
          <div>
            <div className="text-xl font-bold text-amber-300 tracking-wide">Пусто</div>
            <div className="text-xs text-neutral-300 mt-0.5">Открываем проводник памяти...</div>
          </div>
        </div>
      )}

      {/* Скрытый проводник файлов для моментального выбора протокола */}
      <input
        ref={quickFilePickerRef}
        type="file"
        accept="audio/*,.flac,.mp3"
        className="hidden"
        onChange={handleQuickFilePicked}
      />
    </div>
  );
}
