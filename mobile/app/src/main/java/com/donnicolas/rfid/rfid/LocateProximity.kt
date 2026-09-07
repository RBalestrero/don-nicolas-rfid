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
}
