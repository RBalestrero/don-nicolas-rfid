package com.donnicolas.rfid.data.local

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * Señal de sesión expirada.
 *
 * El interceptor HTTP la emite cuando la API devuelve 401 fuera del login
 * (token vencido a mitad de turno) para que la UI vuelva a pedir credenciales
 * en lugar de fallar cada operación con "credenciales inválidas".
 */
class SessionEvents {
    private val _expired = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val expired: SharedFlow<Unit> = _expired.asSharedFlow()

    fun notifyExpired() {
        _expired.tryEmit(Unit)
    }
}
