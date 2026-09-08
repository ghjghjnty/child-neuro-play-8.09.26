package com.neuroplayer.artemka

import android.Manifest
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.graphics.Color
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.CountDownTimer
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.OpenableColumns
import android.util.Log
import android.view.View
import android.widget.Button
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import java.io.File
import java.util.Locale

/**
 * Приложение «Артёмка»
 * Нейроакустический плеер фабул (.flac) и БРТ (.mp3) по протоколу 5/2.
 */
class MainActivity : AppCompatActivity() {

    companion object {
        private const val PERMISSION_REQUEST_CODE = 101
        private const val REQUEST_CODE_PICK_AUDIO = 202
        private const val PREFS_NAME = "artemka_neuro_prefs"
        private const val KEY_TOTAL_DAYS = "total_course_days"
        private const val KEY_CURRENT_DAY = "current_course_day"
        private const val KEY_REST_TARGET_END_TIME = "rest_target_end_time"
        private const val KEY_REST_LABEL = "rest_label"
        private const val KEY_REST_STAGE = "rest_stage"

        // Таймер отдыха 120 минут (2 часа)
        private const val TWO_HOURS_MS: Long = 7200000L
    }

    // 1. Верхний календарь
    private lateinit var layoutCalendarHeader: LinearLayout
    private lateinit var tvCalendarDay: TextView
    private lateinit var tvCalendarStatus: TextView

    // 2. Светофоры
    private lateinit var btnFabulaRed: ImageButton
    private lateinit var btnFabulaYellow: ImageButton
    private lateinit var btnFabulaGreen: ImageButton

    private lateinit var btnBrtRed: ImageButton
    private lateinit var btnBrtGreen: ImageButton

    // 3. Строка трека
    private lateinit var tvTrackTitle: TextView

    // 4. Нижняя техническая строка управления
    private lateinit var tvPlaybackTimer: TextView
    private lateinit var pbPlaybackProgress: ProgressBar
    private lateinit var btnPlaybackStop: Button
    private lateinit var spacerBottomLeft: View
    private lateinit var btnBrtToggle: Button
    private var btnTestMode: Button? = null
    private lateinit var btnCancelTimer: Button
    private var playbackTimerRunnable: Runnable? = null
    private var isPlaybackPaused: Boolean = false

    // Плеер, таймеры и хэндлер
    private var mediaPlayer: MediaPlayer? = null
    private var countDownTimer: CountDownTimer? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    // Состояние протокола
    private var currentSelectedFolder: String = "1_Red"
    private var brtPlaylist: List<File> = emptyList()
    private var currentBrtIndex: Int = 0
    private var isPlayingFabula: Boolean = false
    private var isPlayingBrt: Boolean = false
    private var isWeekendOrRestDay: Boolean = false
    private var isMedicalRestActive: Boolean = false
    private var isBrtManuallyActive: Boolean = false
    private var isTestingSignals: Boolean = false

    private lateinit var prefs: SharedPreferences

    // Текущая разрешённая кнопка светофора по порядку (1_Red -> 2_Yellow -> 3_Green -> 1_Red)
    private var allowedFabulaFolder: String
        get() = prefs.getString("KEY_ALLOWED_FABULA_FOLDER", "1_Red") ?: "1_Red"
        set(value) {
            prefs.edit().putString("KEY_ALLOWED_FABULA_FOLDER", value).apply()
        }

    // Переключение на СЛЕДУЮЩУЮ по порядку кнопку светофора после 2-часового отдыха:
    // Красный -> Жёлтый -> Зелёный -> Красный
    // И разветвление логики:
    // 1. Проверяем наличие файла/компонента "БРТ" в папке следующего трека
    // 2. Если БРТ есть: вместе с кнопкой следующего трека одновременно активируется зелёная кнопка "БРТ"
    // 3. У клиента выбор: запустить следующий стандартный протокол либо прослушать БРТ
    // 4. Если БРТ нет: активируется только кнопка следующего трека
    private fun advanceToNextFabulaFolderAndCheckBrt() {
        val next = when (currentSelectedFolder) {
            "1_Red" -> "2_Yellow"
            "2_Yellow" -> "3_Green"
            "3_Green" -> "1_Red"
            else -> "2_Yellow"
        }
        allowedFabulaFolder = next
        currentSelectedFolder = next

        val nextFolderDir = getFolderDirectory(next)
        val nextBrtFiles = nextFolderDir.listFiles { file ->
            file.isFile && file.name.endsWith(".mp3", ignoreCase = true)
        }?.toList() ?: emptyList()

        val hasBrt = nextBrtFiles.isNotEmpty()
        brtPlaylist = if (hasBrt) nextBrtFiles.take(4) else emptyList()

        resetMainTrafficLight()
        if (hasBrt) {
            setPedestrianLightState(redActive = false, greenActive = true)
        } else {
            setPedestrianLightState(redActive = false, greenActive = false)
        }
    }

    private fun advanceToNextFabulaFolder() {
        advanceToNextFabulaFolderAndCheckBrt()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        initViews()
        setupListeners()
        checkAndRequestPermissions()
        refreshCalendarUI()
        resetMainTrafficLight()
    }

    private fun initViews() {
        // Календарь
        layoutCalendarHeader = findViewById(R.id.layout_calendar_header)
        tvCalendarDay = findViewById(R.id.tv_calendar_day)
        tvCalendarStatus = findViewById(R.id.tv_calendar_status)

        // Основной светофор
        btnFabulaRed = findViewById(R.id.btn_fabula_red)
        btnFabulaYellow = findViewById(R.id.btn_fabula_yellow)
        btnFabulaGreen = findViewById(R.id.btn_fabula_green)

        // Правый (пешеходный) светофор БРТ - одинаковая яркость и сочность
        btnBrtRed = findViewById(R.id.btn_brt_red)
        btnBrtGreen = findViewById(R.id.btn_brt_green)

        // Название трека
        tvTrackTitle = findViewById(R.id.tv_track_title)
        tvTrackTitle.alpha = 0f

        // Нижняя строка управления (счётчик прослушивания и маленькая кнопка Стоп слева от БРТ Вкл)
        tvPlaybackTimer = findViewById(R.id.tv_playback_timer)
        tvPlaybackTimer.text = "⏱ 00:00"
        tvPlaybackTimer.setTextColor(Color.parseColor("#9CA3AF"))
        tvPlaybackTimer.visibility = View.VISIBLE
        pbPlaybackProgress = findViewById(R.id.pb_playback_progress)
        pbPlaybackProgress.progress = 0
        btnPlaybackStop = findViewById(R.id.btn_playback_stop)
        btnPlaybackStop.isEnabled = true
        btnPlaybackStop.alpha = 1.0f
        btnPlaybackStop.setBackgroundResource(R.drawable.bg_btn_stop)
        btnPlaybackStop.setTextColor(Color.parseColor("#F87171"))
        btnPlaybackStop.text = "⏹"
        spacerBottomLeft = findViewById(R.id.spacer_bottom_left)
        btnBrtToggle = findViewById(R.id.btn_brt_toggle)
        btnTestMode = findViewById(R.id.btn_test_mode)
        btnCancelTimer = findViewById(R.id.btn_cancel_timer)

        // Кнопка "БРТ Вкл": яркая ЗЕЛЁНАЯ
        updateBrtToggleButtonUI(isActive = false)

        // Начальное состояние правого светофора
        setPedestrianLightState(redActive = false, greenActive = false)
    }

    private fun setupListeners() {
        // Кнопки основного светофора (Фабулы)
        btnFabulaRed.setOnClickListener { onFabulaColorClicked("1_Red") }
        btnFabulaYellow.setOnClickListener { onFabulaColorClicked("2_Yellow") }
        btnFabulaGreen.setOnClickListener { onFabulaColorClicked("3_Green") }

        // Кнопки правого светофора БРТ
        btnBrtGreen.setOnClickListener { onBrtGreenClicked() }
        btnBrtRed.setOnClickListener {
            Toast.makeText(this, "БРТ заблокировано. Идёт период отдыха ⏳", Toast.LENGTH_SHORT).show()
        }

        // Маленькая кнопка СТОП рядом со счётчиком
        btnPlaybackStop.setOnClickListener { handleTogglePlaybackStop() }

        // Кнопки нижней панели управления (слева направо)
        // 1) БРТ Вкл/Выкл
        btnBrtToggle.setOnClickListener { onBrtToggleClicked() }

        // 2) Тест ("🔄", если присутствует)
        btnTestMode?.setOnClickListener { onTestSignalsClicked() }

        // 3) Отмена ("❌")
        btnCancelTimer.setOnClickListener { onCancelTimerClicked() }

        // Секретное долгое нажатие на индикатор календаря для врача/родителя
        layoutCalendarHeader.setOnLongClickListener {
            showDoctorSettingsDialog()
            true
        }
    }

    // =========================================================================
    // 1. ДИНАМИЧЕСКОЕ СКАНИРОВАНИЕ ПАПОК, СТАРТ / СТОП ВОСПРОИЗВЕДЕНИЯ ФАБУЛ
    // =========================================================================
    private fun onFabulaColorClicked(folderName: String) {
        if (isWeekendOrRestDay) {
            Toast.makeText(this, "Сегодня выходной день. Нейросистема отдыхает 💤", Toast.LENGTH_SHORT).show()
            return
        }

        // Во время автоматического 2-часового отдыха левый светофор заблокирован НАМЕРТВО
        if (isMedicalRestActive) {
            return
        }

        // Разрешена только следующая по порядку кнопка светофора
        if (!isPlayingFabula && folderName != allowedFabulaFolder) {
            return
        }

        // ПОВТОРНОЕ НАЖАТИЕ НА АКТИВНУЮ КНОПКУ -> ПРИНУДИТЕЛЬНЫЙ "СТОП"
        if (isPlayingFabula && currentSelectedFolder == folderName) {
            stopAudio()
            isPlayingFabula = false
            countDownTimer?.cancel()
            resetMainTrafficLight()
            hideTrackTitle()
            refreshCalendarStatusText()
            return
        }

        // Если играет другой трек или БРТ — останавливаем перед новым запуском
        if (isPlayingFabula || isPlayingBrt) {
            stopAudio()
            isPlayingFabula = false
            isPlayingBrt = false
            hideTrackTitle()
        }

        currentSelectedFolder = folderName
        val folderDir = getFolderDirectory(folderName)

        if (!folderDir.exists() || !folderDir.isDirectory) {
            folderDir.mkdirs()
        }

        // Автоматически сканируем папку и ищем ЛЮБОЙ файл .flac
        val flacFiles = folderDir.listFiles { file ->
            file.isFile && file.name.endsWith(".flac", ignoreCase = true)
        }

        if (flacFiles.isNullOrEmpty()) {
            val savedUriString = prefs.getString("saved_track_uri_$folderName", null)
            if (savedUriString != null) {
                try {
                    val savedUri = Uri.parse(savedUriString)
                    playFabulaFromUri(savedUri, folderName)
                    return
                } catch (e: Exception) {
                    Log.e("MainActivity", "Failed to play saved URI: $savedUriString", e)
                }
            }
            Toast.makeText(this, "Пусто", Toast.LENGTH_SHORT).show()
            openFilePicker()
            return
        }

        val targetFabula = flacFiles.first()
        playFabulaTrack(targetFabula, folderName)
    }

    private fun playFabulaTrack(file: File, folderName: String) {
        stopAudio()
        isPlayingFabula = true
        currentSelectedFolder = folderName

        // Неброский вывод названия трека
        showTrackTitle(file.nameWithoutExtension)

        // Активная кнопка остается яркой и кликабельной для СТОПА. Остальные гаснут.
        btnFabulaRed.alpha = if (folderName == "1_Red") 1.0f else 0.2f
        btnFabulaRed.isEnabled = (folderName == "1_Red")

        btnFabulaYellow.alpha = if (folderName == "2_Yellow") 1.0f else 0.2f
        btnFabulaYellow.isEnabled = (folderName == "2_Yellow")

        btnFabulaGreen.alpha = if (folderName == "3_Green") 1.0f else 0.2f
        btnFabulaGreen.isEnabled = (folderName == "3_Green")

        if (!isBrtManuallyActive) {
            setPedestrianLightState(redActive = false, greenActive = false)
        }

        try {
            mediaPlayer = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .build()
                )
                setDataSource(file.absolutePath)
                prepare()
                start()
                startPlaybackTimer()
                setOnCompletionListener {
                    stopPlaybackTimer()
                    isPlayingFabula = false
                    hideTrackTitle()
                    onFabulaPlaybackFinished()
                }
                setOnErrorListener { _, _, _ ->
                    stopPlaybackTimer()
                    isPlayingFabula = false
                    resetMainTrafficLight()
                    hideTrackTitle()
                    refreshCalendarStatusText()
                    true
                }
            }
        } catch (e: Exception) {
            stopPlaybackTimer()
            isPlayingFabula = false
            resetMainTrafficLight()
            hideTrackTitle()
            refreshCalendarStatusText()
        }
    }

    // =========================================================================
    // 2. МЕДИЦИНСКИЙ ПРОТОКОЛ: ТАЙМЕРЫ НА 120 МИНУТ
    // =========================================================================
    private fun onFabulaPlaybackFinished() {
        // Пешеходный светофор загорается Красным (БРТ заблокировано на период отдыха)
        setPedestrianLightState(redActive = true, greenActive = false)
        setMainTrafficLightAlpha(0.2f, isEnabled = false)

        startMedicalCountdown(TWO_HOURS_MS, label = "Отдых", stage = "REST_1") {
            playNotificationAlert()
            advanceToNextFabulaFolderAndCheckBrt()
            refreshCalendarStatusText()
        }
    }

    private fun onBrtGreenClicked() {
        // ПОВТОРНОЕ НАЖАТИЕ НА АКТИВНЫЙ ЗЕЛЁНЫЙ ПЕШЕХОД -> ПРИНУДИТЕЛЬНЫЙ "СТОП"
        if (isPlayingBrt) {
            stopAudio()
            isPlayingBrt = false
            brtPlaylist = emptyList()
            currentBrtIndex = 0
            if (!isMedicalRestActive) {
                resetMainTrafficLight()
            } else {
                setMainTrafficLightAlpha(0.2f, isEnabled = false)
            }
            hideTrackTitle()
            refreshCalendarStatusText()
            return
        }

        // Если плейлист пуст, попытаемся загрузить из текущей выбранной папки
        if (brtPlaylist.isEmpty()) {
            val folderDir = getFolderDirectory(currentSelectedFolder)
            val mp3Files = folderDir.listFiles { file ->
                file.isFile && file.name.endsWith(".mp3", ignoreCase = true)
            }?.toList() ?: emptyList()
            brtPlaylist = mp3Files.take(4)
        }

        if (brtPlaylist.isEmpty()) {
            Toast.makeText(this, "Пусто", Toast.LENGTH_SHORT).show()
            openFilePicker()
            return
        }

        currentBrtIndex = 0
        playNextBrtTrack()
    }

    private fun playNextBrtTrack() {
        if (currentBrtIndex >= brtPlaylist.size) {
            isPlayingBrt = false
            hideTrackTitle()
            onBrtSessionFinished()
            return
        }

        val track = brtPlaylist[currentBrtIndex]
        isPlayingBrt = true

        showTrackTitle(track.nameWithoutExtension)

        // Сочный зеленый пешеход активен и готов к нажатию СТОП
        btnBrtGreen.alpha = 1.0f
        btnBrtGreen.isEnabled = true
        btnBrtRed.alpha = 0.2f
        btnBrtRed.isEnabled = false

        try {
            stopAudio()
            mediaPlayer = MediaPlayer().apply {
                setDataSource(track.absolutePath)
                prepare()
                start()
                startPlaybackTimer()
                setOnCompletionListener {
                    stopPlaybackTimer()
                    currentBrtIndex++
                    playNextBrtTrack()
                }
                setOnErrorListener { _, _, _ ->
                    stopPlaybackTimer()
                    currentBrtIndex++
                    playNextBrtTrack()
                    true
                }
            }
        } catch (e: Exception) {
            stopPlaybackTimer()
            currentBrtIndex++
            playNextBrtTrack()
        }
    }

    private fun onBrtSessionFinished() {
        setPedestrianLightState(redActive = false, greenActive = false)

        startMedicalCountdown(TWO_HOURS_MS, label = "Отдых", stage = "REST_2") {
            playNotificationAlert()
            advanceToNextFabulaFolderAndCheckBrt()
            refreshCalendarStatusText()
        }
    }

    // =========================================================================
    // 3. НИЖНЯЯ ТЕХНИЧЕСКАЯ ПОЛОСА УПРАВЛЕНИЯ
    // =========================================================================

    /**
     * 1) Кнопка "БРТ Вкл/Выкл":
     * Изначально яркая ЗЕЛЕНАЯ. При нажатии активируется правый светофор БРТ,
     * а кнопка становится серой ("БРТ Выкл"). Повторное нажатие возвращает её в зелёный статус.
     */
    private fun onBrtToggleClicked() {
        if (!isBrtManuallyActive) {
            // Включаем БРТ
            isBrtManuallyActive = true
            updateBrtToggleButtonUI(isActive = true)

            // Загружаем файлы БРТ для воспроизведения
            val folderDir = getFolderDirectory(currentSelectedFolder)
            val mp3Files = folderDir.listFiles { file ->
                file.isFile && file.name.endsWith(".mp3", ignoreCase = true)
            }?.toList() ?: emptyList()
            brtPlaylist = mp3Files.take(4)

            // Правый светофор становится полностью сочным и активным (зелёный)
            setPedestrianLightState(redActive = false, greenActive = true)

            // БЛОКИРОВКА ЛЕВОГО СВЕТОФОРА: Во время 2-часового отдыха левый светофор
            // должен оставаться намертво заблокированным (alpha = 0.2f, disabled)
            if (isMedicalRestActive) {
                setMainTrafficLightAlpha(0.2f, isEnabled = false)
            }

            Toast.makeText(this, "Правый светофор БРТ активирован", Toast.LENGTH_SHORT).show()
        } else {
            // Выключаем БРТ
            isBrtManuallyActive = false
            updateBrtToggleButtonUI(isActive = false)

            if (isPlayingBrt) {
                stopAudio()
                isPlayingBrt = false
                hideTrackTitle()
            }

            // Если ещё длится медицинский таймер отдыха до БРТ — пешеходный светофор возвращается в запрещающий красный
            if (isMedicalRestActive) {
                setPedestrianLightState(redActive = true, greenActive = false)
                setMainTrafficLightAlpha(0.2f, isEnabled = false)
            } else {
                setPedestrianLightState(redActive = false, greenActive = false)
            }

            Toast.makeText(this, "БРТ выключено", Toast.LENGTH_SHORT).show()
        }
    }

    private fun updateBrtToggleButtonUI(isActive: Boolean) {
        if (isActive) {
            // Активное состояние (серая кнопка)
            btnBrtToggle.setBackgroundResource(R.drawable.bg_btn_gray)
            btnBrtToggle.text = "Брт"
            btnBrtToggle.setTextColor(Color.WHITE)
        } else {
            // Исходное состояние (яркая ЗЕЛЕНАЯ)
            btnBrtToggle.setBackgroundResource(R.drawable.bg_btn_green)
            btnBrtToggle.text = "Брт"
            btnBrtToggle.setTextColor(Color.BLACK)
        }
    }

    /**
     * 2) Кнопка "Тест" ("🔄"):
     * Проверяет сигналы светофоров поочередным включением.
     */
    private fun onTestSignalsClicked() {
        if (isTestingSignals) return
        isTestingSignals = true
        Toast.makeText(this, "🔄 Тест сигналов светофоров...", Toast.LENGTH_SHORT).show()

        // Поочередно подсвечиваем сигналы
        val steps = listOf(
            Runnable {
                setMainLightDirect(red = 1.0f, yellow = 0.2f, green = 0.2f)
                setPedestrianLightState(redActive = false, greenActive = false)
            },
            Runnable {
                setMainLightDirect(red = 0.2f, yellow = 1.0f, green = 0.2f)
            },
            Runnable {
                setMainLightDirect(red = 0.2f, yellow = 0.2f, green = 1.0f)
            },
            Runnable {
                setMainLightDirect(red = 0.2f, yellow = 0.2f, green = 0.2f)
                setPedestrianLightState(redActive = true, greenActive = false)
            },
            Runnable {
                setPedestrianLightState(redActive = false, greenActive = true)
            },
            Runnable {
                isTestingSignals = false
                resetMainTrafficLight()
                Toast.makeText(this, "✅ Тест сигналов успешно завершён", Toast.LENGTH_SHORT).show()
            }
        )

        steps.forEachIndexed { index, runnable ->
            mainHandler.postDelayed(runnable, (index * 600).toLong())
        }
    }

    private fun setMainLightDirect(red: Float, yellow: Float, green: Float) {
        btnFabulaRed.alpha = red
        btnFabulaYellow.alpha = yellow
        btnFabulaGreen.alpha = green
    }

    /**
     * 3) Кнопка "Отмена" ("❌"):
     * Моментально сбрасывает любые текущие блокировки и таймеры отдыха
     * и возвращает все светофоры в исходное рабочее состояние.
     */
    private fun onCancelTimerClicked() {
        isMedicalRestActive = false
        prefs.edit()
            .remove(KEY_REST_TARGET_END_TIME)
            .remove(KEY_REST_LABEL)
            .remove(KEY_REST_STAGE)
            .apply()
        countDownTimer?.cancel()
        countDownTimer = null

        if (isPlayingFabula || isPlayingBrt) {
            stopAudio()
            isPlayingFabula = false
            isPlayingBrt = false
            hideTrackTitle()
        }

        // Возвращаем все светофоры в рабочее состояние
        resetMainTrafficLight()
        refreshCalendarStatusText()

        // БРТ переключатель в исходное состояние
        isBrtManuallyActive = false
        updateBrtToggleButtonUI(isActive = false)

        Toast.makeText(this, "Блокировки сброшены. Светофоры готовы к работе", Toast.LENGTH_SHORT).show()
    }

    private fun startMedicalCountdown(millis: Long, label: String, stage: String = "REST_1", onFinished: () -> Unit) {
        isMedicalRestActive = true
        val targetEndTime = System.currentTimeMillis() + millis
        prefs.edit()
            .putLong(KEY_REST_TARGET_END_TIME, targetEndTime)
            .putString(KEY_REST_LABEL, label)
            .putString(KEY_REST_STAGE, stage)
            .apply()

        // Блокируем левый светофор фабул намертво (alpha = 0.2f, disabled)
        setMainTrafficLightAlpha(0.2f, isEnabled = false)
        countDownTimer?.cancel()
        countDownTimer = object : CountDownTimer(millis, 1000) {
            override fun onTick(remaining: Long) {
                val hours = remaining / 3600000
                val minutes = (remaining % 3600000) / 60000
                val seconds = (remaining % 60000) / 1000
                val formatted = String.format(Locale.getDefault(), "%02d:%02d:%02d", hours, minutes, seconds)

                // Обновление верхнего календаря
                tvCalendarStatus.text = "⏳ $label: $formatted"

                // Гарантируем, что кнопки левого светофора остаются заблокированными намертво
                if (btnFabulaRed.isEnabled || btnFabulaRed.alpha != 0.2f) {
                    setMainTrafficLightAlpha(0.2f, isEnabled = false)
                }
            }

            override fun onFinish() {
                isMedicalRestActive = false
                prefs.edit()
                    .remove(KEY_REST_TARGET_END_TIME)
                    .remove(KEY_REST_LABEL)
                    .remove(KEY_REST_STAGE)
                    .apply()
                refreshCalendarStatusText()
                onFinished()
            }
        }.start()
    }

    override fun onResume() {
        super.onResume()
        checkAndSyncMedicalRestCountdown()
    }

    private fun checkAndSyncMedicalRestCountdown() {
        val targetEndTime = prefs.getLong(KEY_REST_TARGET_END_TIME, 0L)
        if (targetEndTime <= 0L) return

        val now = System.currentTimeMillis()
        val remaining = targetEndTime - now
        val label = prefs.getString(KEY_REST_LABEL, "Отдых") ?: "Отдых"
        val stage = prefs.getString(KEY_REST_STAGE, "REST_1") ?: "REST_1"

        if (remaining > 0L) {
            // Возобновляем отсчёт с точным оставшимся временем
            startMedicalCountdown(remaining, label, stage) {
                playNotificationAlert()
                advanceToNextFabulaFolderAndCheckBrt()
                refreshCalendarStatusText()
            }
        } else {
            // Таймер закончился пока телефон был заблокирован или приложение свёрнуто
            isMedicalRestActive = false
            prefs.edit()
                .remove(KEY_REST_TARGET_END_TIME)
                .remove(KEY_REST_LABEL)
                .remove(KEY_REST_STAGE)
                .apply()
            countDownTimer?.cancel()
            countDownTimer = null
            playNotificationAlert()
            advanceToNextFabulaFolderAndCheckBrt()
            refreshCalendarStatusText()
        }
    }

    // =========================================================================
    // 4. ОБУЧАЮЩИЙ КАЛЕНДАРЬ 5/2 С ЧИСЛАМИ (БЕЛЫЙ / ОРАНЖЕВЫЙ / ЗЕЛЁНЫЙ)
    // =========================================================================
    private fun refreshCalendarUI() {
        val totalDays = prefs.getInt(KEY_TOTAL_DAYS, 21)
        val currentDay = prefs.getInt(KEY_CURRENT_DAY, 1)

        tvCalendarDay.text = "ДЕНЬ $currentDay"

        if (currentDay <= totalDays) {
            val cycleDay = ((currentDay - 1) % 7) + 1

            if (cycleDay <= 5) {
                // 5 дней терапии: числа горят БЕЛЫМ цветом, светофор работает
                isWeekendOrRestDay = false
                tvCalendarDay.setTextColor(Color.WHITE)
                tvCalendarStatus.text = "Терапия (День $cycleDay из 5 недели)"
                tvCalendarStatus.setTextColor(Color.parseColor("#A1A1AA"))
                if (isMedicalRestActive) {
                    setMainTrafficLightAlpha(0.2f, isEnabled = false)
                } else {
                    setMainTrafficLightAlpha(1.0f, isEnabled = true)
                }
            } else {
                // 2 дня отдыха: числа горят ОРАНЖЕВЫМ цветом, светофор заблокирован, значок сна 💤
                isWeekendOrRestDay = true
                val restDay = cycleDay - 5
                tvCalendarDay.setTextColor(Color.parseColor("#FB923C")) // Оранжевый
                tvCalendarStatus.text = "💤 Выходной день ($restDay из 2) — нейроотдых"
                tvCalendarStatus.setTextColor(Color.parseColor("#FDBA74"))
                setMainTrafficLightAlpha(0.2f, isEnabled = false)
            }
        } else {
            // После окончания курса — 5 дней межкурсового отдыха (числа горят ЗЕЛЕНЫМ цветом)
            isWeekendOrRestDay = true
            val postCourseDay = currentDay - totalDays
            tvCalendarDay.setTextColor(Color.parseColor("#4ADE80")) // Зеленый
            if (postCourseDay <= 5) {
                tvCalendarStatus.text = "🌱 Межкурсовой отдых ($postCourseDay из 5)"
            } else {
                tvCalendarStatus.text = "Курс полностью завершён"
            }
            tvCalendarStatus.setTextColor(Color.parseColor("#86EFAC"))
            setMainTrafficLightAlpha(0.2f, isEnabled = false)
        }
    }

    private fun refreshCalendarStatusText() {
        val totalDays = prefs.getInt(KEY_TOTAL_DAYS, 21)
        val currentDay = prefs.getInt(KEY_CURRENT_DAY, 1)

        if (currentDay <= totalDays) {
            val cycleDay = ((currentDay - 1) % 7) + 1
            if (cycleDay <= 5) {
                tvCalendarStatus.text = "Терапия (День $cycleDay из 5 недели)"
                tvCalendarStatus.setTextColor(Color.parseColor("#A1A1AA"))
            } else {
                val restDay = cycleDay - 5
                tvCalendarStatus.text = "💤 Выходной день ($restDay из 2) — нейроотдых"
                tvCalendarStatus.setTextColor(Color.parseColor("#FDBA74"))
            }
        } else {
            val postCourseDay = currentDay - totalDays
            if (postCourseDay <= 5) {
                tvCalendarStatus.text = "🌱 Межкурсовой отдых ($postCourseDay из 5)"
            } else {
                tvCalendarStatus.text = "Курс полностью завершён"
            }
            tvCalendarStatus.setTextColor(Color.parseColor("#86EFAC"))
        }
    }

    private fun resetMainTrafficLight() {
        mainHandler.post {
            if (isMedicalRestActive) {
                // Если активен 2-часовой отдых, левый светофор остается заблокированным намертво
                setMainTrafficLightAlpha(0.2f, isEnabled = false)
            } else if (isWeekendOrRestDay) {
                setMainTrafficLightAlpha(0.2f, isEnabled = false)
            } else {
                // Включается ТОЛЬКО СЛЕДУЮЩАЯ по порядку кнопка светофора (Красный -> Жёлтый -> Зелёный)
                val allowed = allowedFabulaFolder
                btnFabulaRed.alpha = if (allowed == "1_Red") 1.0f else 0.2f
                btnFabulaRed.isEnabled = (allowed == "1_Red")

                btnFabulaYellow.alpha = if (allowed == "2_Yellow") 1.0f else 0.2f
                btnFabulaYellow.isEnabled = (allowed == "2_Yellow")

                btnFabulaGreen.alpha = if (allowed == "3_Green") 1.0f else 0.2f
                btnFabulaGreen.isEnabled = (allowed == "3_Green")
            }
            if (!isBrtManuallyActive) {
                setPedestrianLightState(redActive = false, greenActive = false)
            } else {
                setPedestrianLightState(redActive = false, greenActive = true)
            }
        }
    }

    private fun setMainTrafficLightAlpha(alpha: Float, isEnabled: Boolean) {
        btnFabulaRed.alpha = alpha
        btnFabulaRed.isEnabled = isEnabled

        btnFabulaYellow.alpha = alpha
        btnFabulaYellow.isEnabled = isEnabled

        btnFabulaGreen.alpha = alpha
        btnFabulaGreen.isEnabled = isEnabled
    }

    /**
     * Яркий и сочный правый пешеходный светофор БРТ
     * Одинаковая яркость и насыщенность с основным светофором (#FF0000 и #00FF00)
     */
    private fun setPedestrianLightState(redActive: Boolean, greenActive: Boolean) {
        // Сочный красный сигнал (#FF0000)
        btnBrtRed.alpha = if (redActive) 1.0f else 0.2f
        btnBrtRed.isEnabled = redActive

        // Сочный зеленый сигнал (#00FF00)
        btnBrtGreen.alpha = if (greenActive) 1.0f else 0.2f
        btnBrtGreen.isEnabled = greenActive
    }

    private fun showTrackTitle(text: String) {
        tvTrackTitle.text = text
        tvTrackTitle.animate().alpha(1.0f).setDuration(300).start()
    }

    private fun hideTrackTitle() {
        tvTrackTitle.animate().alpha(0.0f).setDuration(250).withEndAction {
            tvTrackTitle.text = ""
        }.start()
    }

    private fun showDoctorSettingsDialog() {
        val totalDays = prefs.getInt(KEY_TOTAL_DAYS, 21)
        val currentDay = prefs.getInt(KEY_CURRENT_DAY, 1)

        val options = arrayOf(
            "Установить курс: 14 дней",
            "Установить курс: 21 день",
            "Следующий день (ДЕНЬ ${currentDay + 1})",
            "Сбросить на ДЕНЬ 1",
            "Тест: завершить 120 минут отдыха сейчас"
        )

        AlertDialog.Builder(this)
            .setTitle("Настройки курса «Артёмка» (5/2)")
            .setItems(options) { _, which ->
                when (which) {
                    0 -> prefs.edit().putInt(KEY_TOTAL_DAYS, 14).apply()
                    1 -> prefs.edit().putInt(KEY_TOTAL_DAYS, 21).apply()
                    2 -> prefs.edit().putInt(KEY_CURRENT_DAY, currentDay + 1).apply()
                    3 -> prefs.edit().putInt(KEY_CURRENT_DAY, 1).apply()
                    4 -> {
                        countDownTimer?.cancel()
                        countDownTimer?.onFinish()
                    }
                }
                refreshCalendarUI()
            }
            .setPositiveButton("Закрыть", null)
            .show()
    }

    private fun getFolderDirectory(folderName: String): File {
        val baseDir = File(Environment.getExternalStorageDirectory(), "NeuroPlayer")
        return File(baseDir, folderName)
    }

    private fun playNotificationAlert() {
        try {
            val notificationUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            val ringtone = RingtoneManager.getRingtone(applicationContext, notificationUri)
            ringtone?.play()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun stopAudio() {
        stopPlaybackTimer()
        try {
            if (mediaPlayer?.isPlaying == true) {
                val currentPos = mediaPlayer?.currentPosition ?: 0
                if (currentPos > 0) {
                    prefs.edit().putInt("saved_progress_$currentSelectedFolder", currentPos).apply()
                }
            }
            mediaPlayer?.stop()
            mediaPlayer?.release()
            mediaPlayer = null
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    /**
     * Кнопка СТОП внизу экрана:
     * - Одно нажатие останавливает трек и счётчик прослушивания
     * - Повторное нажатие запускает трек и счётчик прослушивания
     */
    private fun handleTogglePlaybackStop() {
        val mp = mediaPlayer

        // Если трек ещё не запущен — запускаем выбранный протокол фабулы
        if (mp == null || (!isPlayingFabula && !isPlayingBrt)) {
            if (isWeekendOrRestDay) {
                Toast.makeText(this, "Сегодня выходной день 💤", Toast.LENGTH_SHORT).show()
                return
            }
            if (isMedicalRestActive) {
                Toast.makeText(this, "Идёт 2-часовой отдых нейросистемы ⏳", Toast.LENGTH_SHORT).show()
                return
            }
            onFabulaColorClicked(currentSelectedFolder)
            return
        }

        if (!isPlaybackPaused) {
            // ОДНО НАЖАТИЕ: кратковременная остановка (трек паузится, счётчик замирает)
            try {
                if (mp.isPlaying) {
                    mp.pause()
                }
                isPlaybackPaused = true
                btnPlaybackStop.text = "▶"
                btnPlaybackStop.setTextColor(Color.parseColor("#000000"))
                btnPlaybackStop.setBackgroundResource(R.drawable.bg_btn_stop_pause)

                val currentPos = mp.currentPosition / 1000
                val duration = mp.duration / 1000
                val curStr = String.format(Locale.getDefault(), "%02d:%02d", currentPos / 60, currentPos % 60)
                if (duration > 0) {
                    val durStr = String.format(Locale.getDefault(), "%02d:%02d", duration / 60, duration % 60)
                    tvPlaybackTimer.text = "⏱ $curStr / $durStr [СТОП]"
                } else {
                    tvPlaybackTimer.text = "⏱ $curStr [СТОП]"
                }
                tvPlaybackTimer.setTextColor(Color.parseColor("#FBBF24"))
                Toast.makeText(this, "Остановлено", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        } else {
            // ПОВТОРНОЕ НАЖАТИЕ: продолжение прослушивания, счётчик стартует с той же позиции
            try {
                mp.start()
                isPlaybackPaused = false
                btnPlaybackStop.text = "⏹"
                btnPlaybackStop.setTextColor(Color.parseColor("#FFFFFF"))
                btnPlaybackStop.setBackgroundResource(R.drawable.bg_btn_stop_active)

                val currentPos = mp.currentPosition / 1000
                val duration = mp.duration / 1000
                val curStr = String.format(Locale.getDefault(), "%02d:%02d", currentPos / 60, currentPos % 60)
                if (duration > 0) {
                    val durStr = String.format(Locale.getDefault(), "%02d:%02d", duration / 60, duration % 60)
                    tvPlaybackTimer.text = "⏱ $curStr / $durStr"
                    pbPlaybackProgress.max = duration
                    pbPlaybackProgress.progress = currentPos
                } else {
                    tvPlaybackTimer.text = "⏱ $curStr"
                    pbPlaybackProgress.progress = currentPos
                }
                tvPlaybackTimer.setTextColor(Color.parseColor("#38BDF8"))
                Toast.makeText(this, "Запущено", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    /**
     * Счётчик времени прослушивания фабул и БРТ
     * Установлен в нижней строке рядом с кнопкой "БРТ Вкл" (слева от неё)
     * В исходном состоянии находится в нулевом отсчёте (⏱ 00:00) и начинает отсчёт при воспроизведении
     */
    private fun startPlaybackTimer() {
        stopPlaybackTimer()
        isPlaybackPaused = false
        btnPlaybackStop.isEnabled = true
        btnPlaybackStop.alpha = 1.0f
        btnPlaybackStop.text = "⏹"
        btnPlaybackStop.setTextColor(Color.parseColor("#FFFFFF"))
        btnPlaybackStop.setBackgroundResource(R.drawable.bg_btn_stop_active)
        tvPlaybackTimer.visibility = View.VISIBLE
        tvPlaybackTimer.setTextColor(Color.parseColor("#38BDF8"))

        // При старте любого трека максимальное значение полосы прогресса (max)
        // автоматически становится равным полной длительности этого трека (в секундах),
        // а текущее значение (progress) выставляется в соответствии с текущей секундой
        val initialMp = mediaPlayer
        if (initialMp != null) {
            try {
                val durationSec = initialMp.duration / 1000
                if (durationSec > 0) {
                    pbPlaybackProgress.max = durationSec
                }
                pbPlaybackProgress.progress = initialMp.currentPosition / 1000
            } catch (e: Exception) {
                // Игнорируем при инициализации
            }
        }

        playbackTimerRunnable = object : Runnable {
            override fun run() {
                val mp = mediaPlayer
                if (mp != null && (isPlayingFabula || isPlayingBrt)) {
                    if (!isPlaybackPaused) {
                        try {
                            val currentPos = mp.currentPosition / 1000
                            val duration = mp.duration / 1000
                            val curStr = String.format(Locale.getDefault(), "%02d:%02d", currentPos / 60, currentPos % 60)
                            if (duration > 0) {
                                val durStr = String.format(Locale.getDefault(), "%02d:%02d", duration / 60, duration % 60)
                                tvPlaybackTimer.text = "⏱ $curStr / $durStr"
                                pbPlaybackProgress.max = duration
                                pbPlaybackProgress.progress = currentPos
                            } else {
                                tvPlaybackTimer.text = "⏱ $curStr"
                                pbPlaybackProgress.progress = currentPos
                            }
                            if (mp.currentPosition > 0) {
                                prefs.edit().putInt("saved_progress_$currentSelectedFolder", mp.currentPosition).apply()
                            }
                        } catch (e: Exception) {
                            // Игнорируем при выключении/переключении плеера
                        }
                    }
                    mainHandler.postDelayed(this, 1000)
                } else {
                    stopPlaybackTimer()
                }
            }
        }
        mainHandler.post(playbackTimerRunnable!!)
    }

    private fun stopPlaybackTimer() {
        playbackTimerRunnable?.let { mainHandler.removeCallbacks(it) }
        playbackTimerRunnable = null
        isPlaybackPaused = false
        pbPlaybackProgress.progress = 0
        btnPlaybackStop.isEnabled = true
        btnPlaybackStop.alpha = 1.0f
        btnPlaybackStop.text = "⏹"
        btnPlaybackStop.setTextColor(Color.parseColor("#F87171"))
        btnPlaybackStop.setBackgroundResource(R.drawable.bg_btn_stop)
        tvPlaybackTimer.text = "⏱ 00:00"
        tvPlaybackTimer.setTextColor(Color.parseColor("#9CA3AF"))
        tvPlaybackTimer.visibility = View.VISIBLE
    }

    /**
     * Автоматический переход во внутреннюю память телефона (ОБЗОР / File Picker),
     * если папка светофора пуста или не содержит нужных файлов (.flac / .mp3).
     * Использует ACTION_OPEN_DOCUMENT с флагами постоянного доступа (Persistable URI).
     */
    private fun openFilePicker() {
        try {
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "*/*"
                putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("audio/*", "application/octet-stream"))
                addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivityForResult(
                Intent.createChooser(intent, "Обзор памяти (выберите файл протокола)"),
                REQUEST_CODE_PICK_AUDIO
            )
        } catch (e: Exception) {
            try {
                val fallbackIntent = Intent(Intent.ACTION_GET_CONTENT).apply {
                    type = "*/*"
                    putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("audio/*", "application/octet-stream"))
                    addCategory(Intent.CATEGORY_OPENABLE)
                }
                startActivityForResult(fallbackIntent, REQUEST_CODE_PICK_AUDIO)
            } catch (ex: Exception) {
                Toast.makeText(this, "Не удалось открыть проводник файлов", Toast.LENGTH_SHORT).show()
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQUEST_CODE_PICK_AUDIO && resultCode == RESULT_OK) {
            val uri: Uri = data?.data ?: return

            // 1. Фиксируем постоянные права доступа к URI (Persistable URI Permission),
            // чтобы система не отзывала доступ при выгрузке приложения из памяти
            try {
                val takeFlags: Int = Intent.FLAG_GRANT_READ_URI_PERMISSION
                contentResolver.takePersistableUriPermission(uri, takeFlags)
            } catch (e: Exception) {
                Log.e("MainActivity", "Failed to take persistable URI permission", e)
            }

            // 2. Сохраняем постоянный URI трека в SharedPreferences
            prefs.edit()
                .putString("saved_track_uri_$currentSelectedFolder", uri.toString())
                .apply()

            playFabulaFromUri(uri, currentSelectedFolder)
        }
    }

    private fun playFabulaFromUri(uri: Uri, folderName: String) {
        stopAudio()
        isPlayingFabula = true
        currentSelectedFolder = folderName

        val fileName = getFileNameFromUri(uri) ?: "Лечебный протокол"
        showTrackTitle(fileName)

        btnFabulaRed.alpha = if (folderName == "1_Red") 1.0f else 0.2f
        btnFabulaRed.isEnabled = (folderName == "1_Red")

        btnFabulaYellow.alpha = if (folderName == "2_Yellow") 1.0f else 0.2f
        btnFabulaYellow.isEnabled = (folderName == "2_Yellow")

        btnFabulaGreen.alpha = if (folderName == "3_Green") 1.0f else 0.2f
        btnFabulaGreen.isEnabled = (folderName == "3_Green")

        if (!isBrtManuallyActive) {
            setPedestrianLightState(redActive = false, greenActive = false)
        }

        try {
            val savedProgress = prefs.getInt("saved_progress_$folderName", 0)
            mediaPlayer = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .build()
                )
                setDataSource(applicationContext, uri)
                prepare()
                if (savedProgress > 0 && savedProgress < duration) {
                    seekTo(savedProgress)
                }
                start()
                startPlaybackTimer()
                setOnCompletionListener {
                    // Сбрасываем сохраненный прогресс после успешного завершения трека
                    prefs.edit().putInt("saved_progress_$folderName", 0).apply()
                    stopPlaybackTimer()
                    isPlayingFabula = false
                    hideTrackTitle()
                    onFabulaPlaybackFinished()
                }
                setOnErrorListener { _, _, _ ->
                    stopPlaybackTimer()
                    isPlayingFabula = false
                    resetMainTrafficLight()
                    hideTrackTitle()
                    refreshCalendarStatusText()
                    true
                }
            }
        } catch (e: Exception) {
            stopPlaybackTimer()
            isPlayingFabula = false
            resetMainTrafficLight()
            hideTrackTitle()
            refreshCalendarStatusText()
            Toast.makeText(this, "Ошибка воспроизведения выбранного файла", Toast.LENGTH_SHORT).show()
        }
    }

    private fun getFileNameFromUri(uri: Uri): String? {
        var name: String? = null
        if (uri.scheme == "content") {
            val cursor = contentResolver.query(uri, null, null, null, null)
            cursor?.use {
                if (it.moveToFirst()) {
                    val nameIndex = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (nameIndex >= 0) {
                        name = it.getString(nameIndex)
                    }
                }
            }
        }
        if (name == null) {
            name = uri.path?.let { path ->
                val cut = path.lastIndexOf('/')
                if (cut != -1) path.substring(cut + 1) else path
            }
        }
        return name?.substringBeforeLast('.') ?: name
    }

    private fun checkAndRequestPermissions() {
        val permissions = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
                permissions.add(Manifest.permission.READ_MEDIA_AUDIO)
            }
        } else {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED) {
                permissions.add(Manifest.permission.READ_EXTERNAL_STORAGE)
            }
        }

        if (permissions.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, permissions.toTypedArray(), PERMISSION_REQUEST_CODE)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        countDownTimer?.cancel()
        stopAudio()
    }
}
