package com.donnicolas.rfid

import android.app.Application
import com.donnicolas.rfid.data.api.ApiClient
import com.donnicolas.rfid.data.local.ApiHostStore
import com.donnicolas.rfid.data.local.ConnectivityMonitor
import com.donnicolas.rfid.data.local.DeviceKeyStore
import com.donnicolas.rfid.data.local.SessionEvents
import com.donnicolas.rfid.data.local.TokenStore
import com.donnicolas.rfid.data.local.db.AppDatabase
import com.donnicolas.rfid.data.repository.AssetsRepository
import com.donnicolas.rfid.data.repository.AuthRepository
import com.donnicolas.rfid.data.repository.InventoryRepository
import com.donnicolas.rfid.data.sync.SyncManager
import com.donnicolas.rfid.device.DeviceInfoProvider
import com.donnicolas.rfid.device.DevicePresenceReporter
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
    lateinit var sessionEvents: SessionEvents
        private set
    lateinit var apiHostStore: ApiHostStore
        private set
    lateinit var devicePresenceReporter: DevicePresenceReporter
        private set

    override fun onCreate() {
        super.onCreate()
        tokenStore = TokenStore(this)
        sessionEvents = SessionEvents()
        apiHostStore = ApiHostStore(this)
        val apiClient = ApiClient(
            baseUrl = BuildConfig.API_BASE_URL,
            tokenProvider = { tokenStore.getToken() },
            urlProvider = { apiHostStore.getBaseUrl() },
            onUnauthorized = { sessionEvents.notifyExpired() },
        )
        val db = AppDatabase.create(this)
        connectivityMonitor = ConnectivityMonitor(this) { apiHostStore.getHost() }
        syncManager = SyncManager(
            syncQueueDao = db.syncQueueDao(),
            inventoryApi = apiClient.inventoryApi,
            connectivity = connectivityMonitor,
        )
        authRepository = AuthRepository(
            authApi = apiClient.authApi,
            tokenStore = tokenStore,
            baseUrl = apiHostStore.getBaseUrl(),
        )
        inventoryRepository = InventoryRepository(
            warehouseApi = apiClient.warehouseApi,
            inventoryApi = apiClient.inventoryApi,
            cachedDepositoDao = db.cachedDepositoDao(),
            cachedStockDao = db.cachedStockDao(),
            syncManager = syncManager,
            connectivity = connectivityMonitor,
            baseUrl = apiHostStore.getBaseUrl(),
        )
        assetsRepository = AssetsRepository(
            assetsApi = apiClient.assetsApi,
            warehouseApi = apiClient.warehouseApi,
            cachedActivoDao = db.cachedActivoDao(),
            baseUrl = apiHostStore.getBaseUrl(),
        )
        rfidReader = RfidReaderFactory.create(this)
        devicePresenceReporter = DevicePresenceReporter(
            devicesApi = apiClient.devicesApi,
            deviceInfoProvider = DeviceInfoProvider(this, DeviceKeyStore(this)),
            scope = appScope,
        )

        connectivityMonitor.addListener { online ->
            if (online) {
                appScope.launch { runCatching { syncManager.flush() } }
            }
        }
        appScope.launch { runCatching { syncManager.flush() } }
    }
}
