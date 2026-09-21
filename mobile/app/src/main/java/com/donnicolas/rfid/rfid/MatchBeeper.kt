package com.donnicolas.rfid.rfid

import android.media.AudioManager
import android.media.ToneGenerator
import android.os.SystemClock
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Beep corto por cada EPC nuevo válido (inventario / escanear zona).
 * Anti-flood: respeta un intervalo mínimo entre tonos.
 */
class MatchBeeper(
    private val scope: CoroutineScope,
) {
    private val mutex = Mutex()
    private var tone: ToneGenerator? = null
    private var lastBeepAtMs: Long = 0L
    private var released = false

    fun beepOnce() {
        if (released) return
        scope.launch(Dispatchers.Default) {
            mutex.withLock {
                if (released) return@withLock
                val now = SystemClock.elapsedRealtime()
                if (now - lastBeepAtMs < MIN_GAP_MS) return@withLock
                lastBeepAtMs = now
                val gen = tone ?: runCatching {
                    ToneGenerator(AudioManager.STREAM_NOTIFICATION, VOLUME)
                }.onFailure {
                    Log.w(TAG, "ToneGenerator: ${it.message}")
                }.getOrNull()?.also { tone = it }
                if (gen == null) return@withLock
                runCatching {
                    gen.startTone(ToneGenerator.TONE_PROP_BEEP, DURATION_MS)
                }.onFailure {
                    Log.w(TAG, "beep falló: ${it.message}")
                }
            }
        }
    }

    fun beepMany(count: Int) {
        if (count <= 0) return
        // Un tono por nuevo EPC; el gap evita saturación en batches grandes.
        repeat(count.coerceAtMost(MAX_BATCH_BEEPS)) { beepOnce() }
    }

    fun release() {
        scope.launch(Dispatchers.Default) {
            mutex.withLock {
                released = true
                runCatching { tone?.release() }
                tone = null
            }
        }
    }

    companion object {
        private const val TAG = "MatchBeeper"
        private const val VOLUME = 95
        private const val DURATION_MS = 40
        private const val MIN_GAP_MS = 55L
        private const val MAX_BATCH_BEEPS = 12
    }
}
