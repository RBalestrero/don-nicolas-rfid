package com.donnicolas.rfid.rfid

import android.media.AudioManager
import android.media.ToneGenerator
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Geiger sonoro: beep más frecuente e intenso cuanto mayor la proximidad (0–100).
 */
class LocateBeeper(
    private val scope: CoroutineScope,
) {
    private val mutex = Mutex()
    private var job: Job? = null
    private var proximity: Int = 0
    private var enabled: Boolean = false

    fun setProximity(value: Int) {
        proximity = LocateProximity.clamp(value)
    }

    fun start() {
        enabled = true
        if (job?.isActive == true) return
        job = scope.launch(Dispatchers.Default) {
            var tone: ToneGenerator? = null
            var lastVolume = -1
            try {
                while (isActive && enabled) {
                    val p = proximity
                    if (p < MIN_PROXIMITY) {
                        delay(IDLE_POLL_MS)
                        continue
                    }
                    val volume = beepVolume(p)
                    if (tone == null || volume != lastVolume) {
                        runCatching { tone?.release() }
                        tone = runCatching {
                            ToneGenerator(AudioManager.STREAM_NOTIFICATION, volume)
                        }.onFailure {
                            Log.w(TAG, "ToneGenerator: ${it.message}")
                        }.getOrNull()
                        lastVolume = volume
                    }
                    val duration = beepDurationMs(p)
                    val interval = beepIntervalMs(p)
                    mutex.withLock {
                        runCatching {
                            tone?.startTone(ToneGenerator.TONE_PROP_BEEP, duration)
                        }.onFailure {
                            Log.w(TAG, "beep falló: ${it.message}")
                        }
                    }
                    delay(interval.toLong())
                }
            } catch (e: Exception) {
                Log.w(TAG, "LocateBeeper: ${e.message}")
            } finally {
                runCatching { tone?.release() }
            }
        }
    }

    fun stop() {
        enabled = false
        proximity = 0
        job?.cancel()
        job = null
    }

    fun release() {
        stop()
    }

    companion object {
        private const val TAG = "LocateBeeper"
        private const val MIN_PROXIMITY = 8
        private const val IDLE_POLL_MS = 350L

        fun beepVolume(proximity: Int): Int {
            val p = LocateProximity.clamp(proximity)
            return when {
                p >= 90 -> 100
                p >= 75 -> 92
                p >= 60 -> 82
                p >= 40 -> 70
                p >= 25 -> 58
                else -> 48
            }
        }

        fun beepIntervalMs(proximity: Int): Int {
            val p = LocateProximity.clamp(proximity)
            return when {
                p >= 90 -> 70
                p >= 75 -> 110
                p >= 60 -> 180
                p >= 40 -> 300
                p >= 25 -> 480
                else -> 700
            }
        }

        fun beepDurationMs(proximity: Int): Int {
            val p = LocateProximity.clamp(proximity)
            return when {
                p >= 85 -> 70
                p >= 60 -> 55
                p >= 40 -> 45
                else -> 35
            }
        }
    }
}
