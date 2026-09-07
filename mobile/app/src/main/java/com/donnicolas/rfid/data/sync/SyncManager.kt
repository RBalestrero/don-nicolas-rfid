package com.donnicolas.rfid.data.sync

import android.util.Log
import com.donnicolas.rfid.data.api.InventarioCreateDto
import com.donnicolas.rfid.data.api.InventarioLecturasDto
import com.donnicolas.rfid.data.api.InventoryApi
import com.donnicolas.rfid.data.local.ConnectivityMonitor
import com.donnicolas.rfid.data.local.db.SyncQueueDao
import com.donnicolas.rfid.data.local.db.SyncQueueEntity
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class SyncFlushResult(
    val processed: Int,
    val succeeded: Int,
    val failed: Int,
    val remaining: Int,
)

class SyncManager(
    private val syncQueueDao: SyncQueueDao,
    private val inventoryApi: InventoryApi,
    private val connectivity: ConnectivityMonitor,
) {
    private val mutex = Mutex()

    suspend fun pendingCount(): Int = syncQueueDao.countPending()

    suspend fun enqueueInventorySync(payload: InventorySyncPayload): Long {
        val now = System.currentTimeMillis()
        return syncQueueDao.insert(
            SyncQueueEntity(
                opType = SyncQueueEntity.OP_INVENTORY_SYNC,
                payloadJson = SyncJson.toJson(payload),
                status = SyncQueueEntity.STATUS_PENDING,
                createdAtMs = now,
                updatedAtMs = now,
            ),
        )
    }

    suspend fun flush(): SyncFlushResult = mutex.withLock {
        if (!connectivity.isOnline()) {
            return SyncFlushResult(0, 0, 0, syncQueueDao.countPending())
        }
        val pending = syncQueueDao.listPending()
        var ok = 0
        var fail = 0
        for (item in pending) {
            val working = item.copy(
                status = SyncQueueEntity.STATUS_SYNCING,
                attempts = item.attempts + 1,
                updatedAtMs = System.currentTimeMillis(),
            )
            syncQueueDao.update(working)
            try {
                when (item.opType) {
                    SyncQueueEntity.OP_INVENTORY_SYNC -> flushInventory(item.payloadJson)
                    else -> error("Operación desconocida: ${item.opType}")
                }
                syncQueueDao.update(
                    working.copy(
                        status = SyncQueueEntity.STATUS_DONE,
                        lastError = null,
                        updatedAtMs = System.currentTimeMillis(),
                    ),
                )
                ok += 1
            } catch (e: Exception) {
                Log.e(TAG, "Sync falló id=${item.id}: ${e.message}", e)
                syncQueueDao.update(
                    working.copy(
                        status = SyncQueueEntity.STATUS_FAILED,
                        lastError = e.message ?: e.toString(),
                        updatedAtMs = System.currentTimeMillis(),
                    ),
                )
                fail += 1
            }
        }
        syncQueueDao.purgeDone()
        return SyncFlushResult(
            processed = pending.size,
            succeeded = ok,
            failed = fail,
            remaining = syncQueueDao.countPending(),
        )
    }

    private suspend fun flushInventory(payloadJson: String) {
        val payload = SyncJson.inventoryFromJson(payloadJson)
        val created = inventoryApi.create(InventarioCreateDto(depositoId = payload.depositoId))
        inventoryApi.cerrar(
            id = created.id,
            body = InventarioLecturasDto(epcs = payload.readEpcs),
        )
    }

    companion object {
        private const val TAG = "SyncManager"
    }
}
