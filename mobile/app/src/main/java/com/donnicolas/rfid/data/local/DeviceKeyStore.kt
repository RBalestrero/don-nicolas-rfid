package com.donnicolas.rfid.data.local

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.util.UUID

/**
 * Identificador estable del handheld en esta instalación de la APK.
 * No es el número de serie de fábrica (ese va aparte vía OEMInfo cuando está disponible).
 */
class DeviceKeyStore(context: Context) {
    private val prefs: SharedPreferences = createPrefs(context.applicationContext)

    fun getOrCreate(): String {
        val existing = prefs.getString(KEY_DEVICE, null)?.trim().orEmpty()
        if (existing.isNotEmpty()) return existing
        val generated = UUID.randomUUID().toString().replace("-", "")
        prefs.edit().putString(KEY_DEVICE, generated).apply()
        return generated
    }

    companion object {
        private const val PREFS_NAME = "don_nicolas_device"
        private const val KEY_DEVICE = "device_key"
        private const val TAG = "DeviceKeyStore"

        private fun createPrefs(context: Context): SharedPreferences {
            return try {
                val masterKey = MasterKey.Builder(context)
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                    .build()
                EncryptedSharedPreferences.create(
                    context,
                    PREFS_NAME,
                    masterKey,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
                )
            } catch (e: Exception) {
                Log.w(TAG, "EncryptedSharedPreferences no disponible; fallback", e)
                context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            }
        }
    }
}
