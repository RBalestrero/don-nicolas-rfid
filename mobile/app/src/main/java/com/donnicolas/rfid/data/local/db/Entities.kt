package com.donnicolas.rfid.data.local.db

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "cached_depositos")
data class CachedDepositoEntity(
    @PrimaryKey val id: String,
    val nombre: String,
    val descripcion: String?,
    val direccion: String?,
    val activo: Boolean,
    val cachedAtMs: Long,
)

@Entity(tableName = "cached_stock")
data class CachedStockEntity(
    @PrimaryKey val depositoId: String,
    val expectedEpcsJson: String,
    val cachedAtMs: Long,
)

@Entity(tableName = "sync_queue")
data class SyncQueueEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val opType: String,
    val payloadJson: String,
    val status: String = STATUS_PENDING,
    val attempts: Int = 0,
    val lastError: String? = null,
    val createdAtMs: Long,
    val updatedAtMs: Long,
) {
    companion object {
        const val OP_INVENTORY_SYNC = "INVENTORY_SYNC"
        const val STATUS_PENDING = "pending"
        const val STATUS_SYNCING = "syncing"
        const val STATUS_DONE = "done"
        const val STATUS_FAILED = "failed"
    }
}
