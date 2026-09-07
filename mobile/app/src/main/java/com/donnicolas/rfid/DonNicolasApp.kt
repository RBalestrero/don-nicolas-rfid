package com.donnicolas.rfid

import android.app.Application
import com.donnicolas.rfid.data.api.ApiClient
import com.donnicolas.rfid.data.local.TokenStore
import com.donnicolas.rfid.data.repository.AuthRepository

class DonNicolasApp : Application() {
    lateinit var tokenStore: TokenStore
        private set
    lateinit var authRepository: AuthRepository
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
    }
}
