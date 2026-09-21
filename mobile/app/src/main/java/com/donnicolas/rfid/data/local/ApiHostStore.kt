package com.donnicolas.rfid.data.local

import android.content.Context
import com.donnicolas.rfid.BuildConfig

/**
 * Host de la API configurable en el handheld (Wi‑Fi LAN, sin USB / adb reverse).
 * El default sale de `api.host` en `local.properties` (BuildConfig).
 */
class ApiHostStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun getHost(): String {
        val saved = prefs.getString(KEY_HOST, null)?.trim().orEmpty()
        return saved.ifEmpty { BuildConfig.API_HOST }
    }

    fun setHost(raw: String) {
        val cleaned = sanitizeHost(raw)
        if (cleaned.isEmpty()) return
        prefs.edit().putString(KEY_HOST, cleaned).apply()
    }

    fun getScheme(): String {
        val saved = prefs.getString(KEY_SCHEME, null)?.trim().orEmpty()
        if (saved.equals("http", true) || saved.equals("https", true)) return saved.lowercase()
        return schemeFromBuildConfig()
    }

    fun getBaseUrl(): String = "${getScheme()}://${getHost()}:$API_PORT/api/v1/"

    fun displayEndpoint(): String = "${getHost()}:$API_PORT"

    companion object {
        private const val PREFS_NAME = "don_nicolas_api"
        private const val KEY_HOST = "api_host"
        private const val KEY_SCHEME = "api_scheme"
        const val API_PORT = 8000

        fun sanitizeHost(raw: String): String {
            var value = raw.trim()
            value = value.removePrefix("http://").removePrefix("https://")
            value = value.substringBefore("/")
            value = value.substringBefore(":")
            return value.trim()
        }

        private fun schemeFromBuildConfig(): String {
            val url = BuildConfig.API_BASE_URL
            return when {
                url.startsWith("https://") -> "https"
                else -> "http"
            }
        }
    }
}
