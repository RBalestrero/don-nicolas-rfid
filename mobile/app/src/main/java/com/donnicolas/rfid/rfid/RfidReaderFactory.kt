package com.donnicolas.rfid.rfid

import android.os.Build
import com.donnicolas.rfid.BuildConfig

object RfidReaderFactory {
    fun create(modeOverride: String = BuildConfig.RFID_MODE): RfidReader {
        return when (modeOverride.uppercase()) {
            "ZEBRA" -> ZebraRfidReader(sdkLinked = false)
            "SIMULATOR" -> SimulatedRfidReader()
            "AUTO" -> {
                val isZebraDevice = Build.MANUFACTURER.contains("zebra", ignoreCase = true) ||
                    Build.MODEL.contains("MC33", ignoreCase = true)
                if (isZebraDevice) {
                    ZebraRfidReader(sdkLinked = false)
                } else {
                    SimulatedRfidReader()
                }
            }
            else -> SimulatedRfidReader()
        }
    }
}
