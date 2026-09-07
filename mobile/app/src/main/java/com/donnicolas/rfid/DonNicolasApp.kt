package com.donnicolas.rfid

import android.app.Application
import com.donnicolas.rfid.data.api.ApiClient
import com.donnicolas.rfid.data.local.TokenStore
import com.donnicolas.rfid.data.repository.AuthRepository
import com.donnicolas.rfid.data.repository.InventoryRepository
import com.donnicolas.rfid.rfid.RfidReader
import com.donnicolas.rfid.rfid.RfidReaderFactory

class DonNicolasApp : Application() {
    lateinit var tokenStore: TokenStore
        private set
    lateinit var authRepository: AuthRepository
        private set
    lateinit var inventoryRepository: InventoryRepository
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
        authRepository = AuthRepository(
            authApi = apiClient.authApi,
            tokenStore = tokenStore,
            baseUrl = BuildConfig.API_BASE_URL,
        )
        inventoryRepository = InventoryRepository(
            warehouseApi = apiClient.warehouseApi,
            inventoryApi = apiClient.inventoryApi,
            baseUrl = BuildConfig.API_BASE_URL,
        )
        rfidReader = RfidReaderFactory.create(this)
    }
}
