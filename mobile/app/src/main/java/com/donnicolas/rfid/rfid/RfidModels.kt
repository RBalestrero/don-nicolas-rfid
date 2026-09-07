package com.donnicolas.rfid.rfid

import com.donnicolas.rfid.data.model.AppError

data class RfidTag(
    val epc: String,
    val rssi: Int,
    val antenna: Int = 1,
    val seenCount: Int = 1,
    val lastSeenAtMs: Long = System.currentTimeMillis(),
)

enum class RfidReaderState {
    DISCONNECTED,
    CONNECTING,
    READY,
    INVENTORY_RUNNING,
    LOCATE_RUNNING,
    ERROR,
}

/** Qué hace el gatillo físico del handheld. */
enum class RfidTriggerMode {
    /** Inventario masivo (comportamiento por defecto). */
    INVENTORY,
    /** Localización de un EPC armado (TagLocationing). */
    LOCATE,
}

sealed class RfidEvent {
    data class StateChanged(val state: RfidReaderState) : RfidEvent()
    data class TagRead(val tag: RfidTag) : RfidEvent()
    data class BatchRead(val tags: List<RfidTag>) : RfidEvent()
    /** Proximidad 0–100 (geiger Zebra) + RSSI pico. */
    data class LocateUpdate(
        val epc: String,
        val relativeDistance: Int,
        val rssi: Int,
    ) : RfidEvent()
    data class Failure(val error: AppError) : RfidEvent()
}

interface RfidReader {
    val modeName: String

    suspend fun connect()
    suspend fun disconnect()
    suspend fun startInventory()
    suspend fun stopInventory()

    /** Cambia el comportamiento del gatillo. Al salir de LOCATE limpia el target. */
    suspend fun setTriggerMode(mode: RfidTriggerMode)

    /** Arma el EPC a localizar (modo LOCATE). El gatillo inicia/detiene TagLocationing. */
    suspend fun armLocateTarget(epc: String)

    suspend fun clearLocateTarget()

    /** Inicio/parada manual (además del gatillo), útil en UI. */
    suspend fun startLocate()
    suspend fun stopLocate()

    fun events(): kotlinx.coroutines.flow.Flow<RfidEvent>
}
