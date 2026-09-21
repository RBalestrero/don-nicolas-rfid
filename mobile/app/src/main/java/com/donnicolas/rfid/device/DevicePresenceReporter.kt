package com.donnicolas.rfid.device

import android.util.Log
import com.donnicolas.rfid.data.api.DevicesApi
import com.donnicolas.rfid.data.api.DispositivoHeartbeatRequestDto
import com.donnicolas.rfid.data.api.DispositivoLogoutRequestDto
import com.donnicolas.rfid.data.api.DispositivoRegistroRequestDto
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

enum class PresenceEstado {
    /** Heartbeat/registro OK reciente. */
    EN_LINEA,
    /** Sesión local activa pero sin contacto con la API. */
    INACTIVO,
    /** Logout explícito / sin sesión. */
    SESION_CERRADA,
}

/**
 * Registra el MC33 tras login y mantiene heartbeat mientras haya sesión.
 */
class DevicePresenceReporter(
    private val devicesApi: DevicesApi,
    private val deviceInfoProvider: DeviceInfoProvider,
    private val scope: CoroutineScope,
    private val heartbeatIntervalMs: Long = 75_000L,
    /** Tras este tiempo sin heartbeat exitoso → Inactivo (alineado al timeout del server ~180s). */
    private val inactiveAfterMs: Long = 180_000L,
) {
    private val mutex = Mutex()
    private var loopJob: Job? = null
    private var watchdogJob: Job? = null
    @Volatile
    private var lastDeviceKey: String? = null
    @Volatile
    private var lastSuccessAtMs: Long = 0L

    private val _estado = MutableStateFlow(PresenceEstado.SESION_CERRADA)
    val estado: StateFlow<PresenceEstado> = _estado.asStateFlow()

    fun start() {
        scope.launch {
            mutex.withLock {
                loopJob?.cancel()
                watchdogJob?.cancel()
                _estado.value = PresenceEstado.INACTIVO
                loopJob = scope.launch { runLoop() }
                watchdogJob = scope.launch { runWatchdog() }
            }
        }
    }

    /**
     * Detiene el heartbeat y, si [notifyLogout], avisa a la API **antes** de que
     * el caller borre el token (el endpoint exige Bearer).
     */
    suspend fun stop(notifyLogout: Boolean = true) {
        val key: String?
        mutex.withLock {
            loopJob?.cancel()
            loopJob = null
            watchdogJob?.cancel()
            watchdogJob = null
            key = lastDeviceKey
            lastDeviceKey = null
        }
        if (notifyLogout && !key.isNullOrBlank()) {
            try {
                devicesApi.logout(DispositivoLogoutRequestDto(deviceKey = key))
                Log.i(TAG, "Logout de dispositivo OK ($key)")
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "Logout dispositivo falló (best-effort)", e)
            }
        }
        _estado.value = PresenceEstado.SESION_CERRADA
    }

    private suspend fun runWatchdog() {
        while (scope.isActive) {
            delay(15_000L)
            if (_estado.value == PresenceEstado.SESION_CERRADA) continue
            val last = lastSuccessAtMs
            if (last > 0L && System.currentTimeMillis() - last > inactiveAfterMs) {
                if (_estado.value != PresenceEstado.INACTIVO) {
                    _estado.value = PresenceEstado.INACTIVO
                    Log.i(TAG, "Sin actividad con la API → Inactivo")
                }
            }
        }
    }

    private suspend fun runLoop() {
        while (scope.isActive) {
            try {
                val identity = deviceInfoProvider.collect()
                lastDeviceKey = identity.deviceKey
                devicesApi.registro(
                    DispositivoRegistroRequestDto(
                        deviceKey = identity.deviceKey,
                        modelo = identity.modelo,
                        fabricante = identity.fabricante,
                        numeroSerie = identity.numeroSerie,
                        appVersion = identity.appVersion,
                        androidVersion = identity.androidVersion,
                    ),
                )
                markOnline()
                while (scope.isActive) {
                    delay(heartbeatIntervalMs)
                    val key = lastDeviceKey ?: break
                    try {
                        devicesApi.heartbeat(DispositivoHeartbeatRequestDto(deviceKey = key))
                        markOnline()
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        _estado.value = PresenceEstado.INACTIVO
                        Log.w(TAG, "Heartbeat falló; reintentando registro", e)
                        break
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _estado.value = PresenceEstado.INACTIVO
                Log.w(TAG, "Registro de dispositivo falló; reintento luego", e)
                delay(heartbeatIntervalMs)
            }
        }
    }

    private fun markOnline() {
        lastSuccessAtMs = System.currentTimeMillis()
        _estado.value = PresenceEstado.EN_LINEA
    }

    companion object {
        private const val TAG = "DevicePresence"
    }
}
