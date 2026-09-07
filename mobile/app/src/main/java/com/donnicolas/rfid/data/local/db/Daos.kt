package com.donnicolas.rfid.data.local.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update

@Dao
interface CachedDepositoDao {
    @Query("SELECT * FROM cached_depositos WHERE activo = 1 ORDER BY nombre")
    suspend fun listActive(): List<CachedDepositoEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(items: List<CachedDepositoEntity>)
}

@Dao
interface CachedStockDao {
    @Query("SELECT * FROM cached_stock WHERE depositoId = :depositoId LIMIT 1")
    suspend fun get(depositoId: String): CachedStockEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(item: CachedStockEntity)
}

@Dao
interface SyncQueueDao {
    @Query("SELECT * FROM sync_queue WHERE status IN ('pending', 'failed') ORDER BY createdAtMs ASC")
    suspend fun listPending(): List<SyncQueueEntity>

    @Query("SELECT COUNT(*) FROM sync_queue WHERE status IN ('pending', 'failed')")
    suspend fun countPending(): Int

    @Insert
    suspend fun insert(item: SyncQueueEntity): Long

    @Update
    suspend fun update(item: SyncQueueEntity)

    @Query("DELETE FROM sync_queue WHERE status = 'done'")
    suspend fun purgeDone()
}
