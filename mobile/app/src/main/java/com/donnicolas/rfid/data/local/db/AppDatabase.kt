package com.donnicolas.rfid.data.local.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        CachedDepositoEntity::class,
        CachedStockEntity::class,
        CachedActivoEntity::class,
        SyncQueueEntity::class,
    ],
    version = 2,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun cachedDepositoDao(): CachedDepositoDao
    abstract fun cachedStockDao(): CachedStockDao
    abstract fun cachedActivoDao(): CachedActivoDao
    abstract fun syncQueueDao(): SyncQueueDao

    companion object {
        fun create(context: Context): AppDatabase {
            return Room.databaseBuilder(
                context.applicationContext,
                AppDatabase::class.java,
                "don_nicolas_offline.db",
            ).fallbackToDestructiveMigration().build()
        }
    }
}
