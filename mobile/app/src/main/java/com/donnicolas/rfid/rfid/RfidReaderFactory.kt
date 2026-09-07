package com.donnicolas.rfid.rfid

import android.content.Context
import android.os.Build
import com.donnicolas.rfid.BuildConfig

object RfidReaderFactory {
    fun create(
        context: Context,
        modeOverride: String = BuildConfig.RFID_MODE,
    ): RfidReader {
        return when (modeOverride.uppercase()) {
            "ZEBRA" -> ZebraRfidReader(context)
            "SIMULATOR" -> SimulatedRfidReader()
            "AUTO" -> {
                val isZebraHandheld =
                    Build.MANUFACTURER.contains("zebra", ignoreCase = true) ||
                        Build.MODEL.contains("MC33", ignoreCase = true) ||
                        Build.MODEL.contains("MC3300", ignoreCase = true)
                if (isZebraHandheld) {
                    ZebraRfidReader(context)
                } else {
                    SimulatedRfidReader()
                }
            }
            else -> SimulatedRfidReader()
        }
    }
}
