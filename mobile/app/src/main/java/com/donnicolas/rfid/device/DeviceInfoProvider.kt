package com.donnicolas.rfid.device

import android.content.ContentResolver
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.donnicolas.rfid.BuildConfig
import com.donnicolas.rfid.data.local.DeviceKeyStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class DeviceIdentity(
    val deviceKey: String,
    val modelo: String,
    val fabricante: String?,
    val numeroSerie: String?,
    val appVersion: String?,
    val androidVersion: String?,
)

/**
 * Identidad del handheld para registro en la API.
 * Modelo/fabricante/Android vía Build; serial vía OEMInfo Zebra (si hay grant).
 */
class DeviceInfoProvider(
    context: Context,
    private val deviceKeyStore: DeviceKeyStore = DeviceKeyStore(context),
) {
    private val appContext = context.applicationContext

    suspend fun collect(): DeviceIdentity = withContext(Dispatchers.IO) {
        val androidId = Settings.Secure.getString(
            appContext.contentResolver,
            Settings.Secure.ANDROID_ID,
        )?.trim().orEmpty()
        val key = when {
            androidId.isNotEmpty() && androidId != "9774d56d682e549c" -> androidId
            else -> deviceKeyStore.getOrCreate()
        }
        DeviceIdentity(
            deviceKey = key.take(64),
            modelo = Build.MODEL.ifBlank { "Desconocido" },
            fabricante = Build.MANUFACTURER.takeIf { it.isNotBlank() },
            numeroSerie = queryOemSerial(appContext.contentResolver),
            appVersion = BuildConfig.VERSION_NAME,
            androidVersion = Build.VERSION.RELEASE,
        )
    }

    private fun queryOemSerial(resolver: ContentResolver): String? {
        return try {
            resolver.query(OEM_SERIAL_URI, null, null, null, null)?.use { cursor: Cursor ->
                if (!cursor.moveToFirst()) return null
                cursor.getString(0)?.trim()?.takeIf { it.isNotEmpty() && !it.equals("unknown", true) }
            }
        } catch (e: SecurityException) {
            Log.i(TAG, "OEMInfo serial sin permiso Access Manager: ${e.message}")
            null
        } catch (e: Exception) {
            Log.w(TAG, "No se pudo leer serial OEMInfo", e)
            null
        }
    }

    companion object {
        private const val TAG = "DeviceInfoProvider"
        private val OEM_SERIAL_URI: Uri =
            Uri.parse("content://oem_info/oem.zebra.secure/build_serial")
    }
}
