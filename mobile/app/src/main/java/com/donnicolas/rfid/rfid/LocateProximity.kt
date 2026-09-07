package com.donnicolas.rfid.rfid

/**
 * Helpers de proximidad para UI de localización (geiger 0–100).
 */
object LocateProximity {
    fun clamp(distance: Int): Int = distance.coerceIn(0, 100)

    fun label(distance: Int): String {
        val d = clamp(distance)
        return when {
            d >= 85 -> "Encontrado — muy cerca"
            d >= 60 -> "Cerca — seguí en esa dirección"
            d >= 35 -> "Señal media — mové el lector"
            d >= 15 -> "Señal débil — barre el área"
            else -> "Buscando etiqueta…"
        }
    }

    /** Flecha más "llena"/agresiva cuanto más cerca. */
    fun arrowScale(distance: Int): Float {
        val d = clamp(distance)
        return 0.35f + (d / 100f) * 0.65f
    }

    /**
     * Fallback geiger desde peakRSSI típico UHF (−90 … −25 dBm).
     * Más cercano a 0 dBm → más cerca.
     */
    fun fromRssi(rssi: Int): Int {
        val clampedRssi = rssi.coerceIn(-90, -25)
        val proximity = ((clampedRssi + 90) * 100) / 65
        return clamp(proximity)
    }

    /** Match flexible: igualdad, sufijo o sin ceros a la izquierda. */
    fun epcMatches(target: String?, candidate: String?): Boolean {
        val a = normalizeEpc(target) ?: return false
        val b = normalizeEpc(candidate) ?: return false
        if (a == b) return true
        if (a.length >= 8 && (b.endsWith(a) || a.endsWith(b))) return true
        val aTrim = a.trimStart('0')
        val bTrim = b.trimStart('0')
        return aTrim.isNotEmpty() && aTrim == bTrim
    }

    fun normalizeEpc(epc: String?): String? {
        val n = epc?.trim()?.uppercase()?.replace(" ", "")?.replace("-", "")
        return n?.takeIf { it.isNotEmpty() }
    }
}
