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
    ERROR,
}

sealed class RfidEvent {
    data class StateChanged(val state: RfidReaderState) : RfidEvent()
    data class TagRead(val tag: RfidTag) : RfidEvent()
    data class BatchRead(val tags: List<RfidTag>) : RfidEvent()
    data class Failure(val error: AppError) : RfidEvent()
}

interface RfidReader {
    val modeName: String

    suspend fun connect()
    suspend fun disconnect()
    suspend fun startInventory()
    suspend fun stopInventory()

    fun events(): kotlinx.coroutines.flow.Flow<RfidEvent>
}
