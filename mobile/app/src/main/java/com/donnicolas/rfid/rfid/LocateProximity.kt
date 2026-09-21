package com.donnicolas.rfid.rfid

/**
 * Helpers de proximidad para UI de localización (geiger 0–100).
 *
 * Localización por tipo de artículo: matchea cualquier EPC con el mismo
 * código de artículo embebido (ignora el serial único de cada etiqueta).
 *
 * Entre unidades del mismo SKU (o relecturas más débiles), la UI usa
 * [applyPeakHold]: solo la mayor intensidad mueve la barra (detector de proximidad).
 */
object LocateProximity {
    /** Hold breve antes de decaer; cubre 1–2 huecos de inventory UHF. */
    const val PEAK_HOLD_MS: Long = 200L

    /** Caída ~10 pts cada 100 ms tras el hold (~1 s de 100→0). */
    const val PEAK_DECAY_PTS_PER_100_MS: Int = 10

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
     * Combina geiger nativo (1–100) con RSSI.
     * `relativeDistance == 0` no es “encima de la etiqueta”: el SDK reporta 0
     * cuando el pico aún no está calculado. En ese caso se usa RSSI.
     * RSSI ≥ 0 se trata como ausente (nunca 100%).
     */
    fun resolve(relativeDistance: Int?, rssi: Int?): Int {
        val dist = relativeDistance?.let { clamp(it) }
        if (dist != null && dist > 0) return dist
        val fromRssi = rssi?.let { fromRssi(it) } ?: 0
        return if (fromRssi > 0) fromRssi else (dist ?: 0)
    }

    /**
     * Fallback geiger desde peakRSSI típico UHF (−90 … −25 dBm).
     * RSSI ≥ 0 se trata como ausente (el SDK a menudo manda 0 si no hay pico).
     * Algunos firmwares entregan el byte RSSI sin signo (206 == −50 dBm).
     */
    fun fromRssi(rssi: Int): Int {
        val signed = signedRssi(rssi)
        if (signed >= 0) return 0
        val clampedRssi = signed.coerceIn(-90, -25)
        val proximity = ((clampedRssi + 90) * 100) / 65
        return clamp(proximity)
    }

    fun signedRssi(rssi: Int): Int =
        if (rssi in 128..255) rssi - 256 else rssi

    /**
     * Valor mostrado del peak-hold: instantáneo tras el pico, luego decay lineal.
     */
    fun decayedPeak(
        held: Int,
        lastPeakAtMs: Long,
        nowMs: Long,
        holdMs: Long = PEAK_HOLD_MS,
        decayPtsPer100Ms: Int = PEAK_DECAY_PTS_PER_100_MS,
    ): Int {
        val peak = clamp(held)
        if (peak <= 0) return 0
        val elapsed = (nowMs - lastPeakAtMs).coerceAtLeast(0L)
        if (elapsed <= holdMs) return peak
        val drop = (((elapsed - holdMs) * decayPtsPer100Ms) / 100L).toInt()
        return (peak - drop).coerceAtLeast(0)
    }

    /**
     * Detector de proximidad: solo acepta muestras ≥ al pico ya decayed.
     * Una etiqueta más lejana / lectura más débil no pisa la barra.
     * Igual intensidad renueva el hold (señal estable no “parpadea” al decay).
     */
    fun applyPeakHold(
        previousHeld: Int,
        lastPeakAtMs: Long,
        nowMs: Long,
        sample: Int,
        holdMs: Long = PEAK_HOLD_MS,
        decayPtsPer100Ms: Int = PEAK_DECAY_PTS_PER_100_MS,
    ): PeakHoldResult {
        val decayed = decayedPeak(previousHeld, lastPeakAtMs, nowMs, holdMs, decayPtsPer100Ms)
        val incoming = clamp(sample)
        return if (incoming > 0 && incoming >= decayed) {
            PeakHoldResult(
                held = incoming,
                lastPeakAtMs = nowMs,
                displayed = incoming,
                accepted = true,
            )
        } else {
            PeakHoldResult(
                held = previousHeld.coerceAtLeast(0),
                lastPeakAtMs = lastPeakAtMs,
                displayed = decayed,
                accepted = false,
            )
        }
    }

    /**
     * Match por tipo de artículo (SKU): mismo código embebido en el EPC D1,
     * sin importar el serial. Si no se puede decodificar el target, cae a exacto.
     */
    fun articuloMatches(articuloCode: Long?, candidate: String?): Boolean {
        if (articuloCode == null) return false
        val candidateCode = EpcScheme.decodeArticuloCode(candidate) ?: return false
        return candidateCode == articuloCode
    }

    fun articuloMatchesPrefix(locatePrefix: String?, candidate: String?): Boolean {
        val prefix = normalizeEpc(locatePrefix)?.takeIf { it.length == EpcScheme.ARTICULO_PREFIX_HEX_LEN }
            ?: return false
        val cand = normalizeEpc(candidate) ?: return false
        return EpcScheme.belongsToSystem(cand) && cand.startsWith(prefix)
    }

    /** Match exacto tras normalizar (modo unidad puntual / legado). */
    fun epcMatches(target: String?, candidate: String?): Boolean {
        val a = normalizeEpc(target) ?: return false
        val b = normalizeEpc(candidate) ?: return false
        return a == b
    }

    /**
     * Regla de localización por artículo: si el target es un EPC D1 del sistema,
     * acepta cualquier unidad con el mismo código de artículo.
     */
    fun locateMatches(targetSampleEpc: String?, candidate: String?): Boolean {
        val targetCode = EpcScheme.decodeArticuloCode(targetSampleEpc)
        if (targetCode != null) {
            return articuloMatches(targetCode, candidate)
        }
        return epcMatches(targetSampleEpc, candidate)
    }

    fun normalizeEpc(epc: String?): String? {
        val n = epc?.trim()?.uppercase()?.replace(" ", "")?.replace("-", "")
        return n?.takeIf { it.isNotEmpty() }
    }

    data class PeakHoldResult(
        /** Pico crudo (sin decay) para el próximo tick. */
        val held: Int,
        val lastPeakAtMs: Long,
        /** Valor a mostrar / beep (con decay aplicado). */
        val displayed: Int,
        /** true si la muestra nueva ganó por mayor intensidad. */
        val accepted: Boolean,
    )
}
