package com.donnicolas.rfid

import android.app.Application
import com.donnicolas.rfid.data.api.ApiClient
import com.donnicolas.rfid.data.local.ConnectivityMonitor
import com.donnicolas.rfid.data.local.TokenStore
import com.donnicolas.rfid.data.local.db.AppDatabase
import com.donnicolas.rfid.data.repository.AssetsRepository
import com.donnicolas.rfid.data.repository.AuthRepository
import com.donnicolas.rfid.data.repository.InventoryRepository
import com.donnicolas.rfid.data.sync.SyncManager
import com.donnicolas.rfid.rfid.RfidReader
import com.donnicolas.rfid.rfid.RfidReaderFactory
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class DonNicolasApp : Application() {
    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    lateinit var tokenStore: TokenStore
        private set
    lateinit var authRepository: AuthRepository
        private set
    lateinit var inventoryRepository: InventoryRepository
        private set
    lateinit var assetsRepository: AssetsRepository
        private set
    lateinit var syncManager: SyncManager
        private set
    lateinit var connectivityMonitor: ConnectivityMonitor
        private set
    lateinit var rfidReader: RfidReader
        private set

    override fun onCreate() {
        super.onCreate()
        tokenStore = TokenStore(this)
        val apiClient = ApiClient(
            baseUrl = BuildConfig.API_BASE_URL,
            tokenProvider = { tokenStore.getToken() },
        )
        val db = AppDatabase.create(this)
        connectivityMonitor = ConnectivityMonitor(this)
        syncManager = SyncManager(
            syncQueueDao = db.syncQueueDao(),
            inventoryApi = apiClient.inventoryApi,
            connectivity = connectivityMonitor,
        )
        authRepository = AuthRepository(
            authApi = apiClient.authApi,
            tokenStore = tokenStore,
            baseUrl = BuildConfig.API_BASE_URL,
        )
        inventoryRepository = InventoryRepository(
            warehouseApi = apiClient.warehouseApi,
            inventoryApi = apiClient.inventoryApi,
            cachedDepositoDao = db.cachedDepositoDao(),
            cachedStockDao = db.cachedStockDao(),
            syncManager = syncManager,
            connectivity = connectivityMonitor,
            baseUrl = BuildConfig.API_BASE_URL,
        )
        assetsRepository = AssetsRepository(
            assetsApi = apiClient.assetsApi,
            baseUrl = BuildConfig.API_BASE_URL,
        )
        rfidReader = RfidReaderFactory.create(this)

        connectivityMonitor.addListener { online ->
            if (online) {
                appScope.launch { runCatching { syncManager.flush() } }
            }
        }
        appScope.launch { runCatching { syncManager.flush() } }
    }
}
