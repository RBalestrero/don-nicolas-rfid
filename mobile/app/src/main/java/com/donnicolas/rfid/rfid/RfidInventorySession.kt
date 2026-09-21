package com.donnicolas.rfid.rfid

import com.donnicolas.rfid.data.model.AppError

/**
 * Acumula lecturas RFID masivas con deduplicación por EPC.
 */
class RfidInventorySession {
    private val lock = Any()
    private val tags = linkedMapOf<String, RfidTag>()
    private var startedAtMs: Long? = null
    private var totalReads: Long = 0

    fun start() {
        synchronized(lock) {
            tags.clear()
            totalReads = 0
            startedAtMs = System.currentTimeMillis()
        }
    }

    fun clear() {
        synchronized(lock) {
            tags.clear()
            totalReads = 0
            startedAtMs = null
        }
    }

    /** Precarga EPCs ya registrados (p. ej. al retomar un inventario en curso). */
    fun seedKnownEpcs(epcs: Collection<String>) {
        synchronized(lock) {
            if (startedAtMs == null) {
                startedAtMs = System.currentTimeMillis()
            }
            val now = System.currentTimeMillis()
            for (raw in epcs) {
                val epc = EpcScheme.normalize(raw)
                if (epc.isEmpty()) continue
                if (!EpcScheme.belongsToSystem(epc)) continue
                if (tags.containsKey(epc)) continue
                tags[epc] = RfidTag(
                    epc = epc,
                    rssi = 0,
                    antenna = 0,
                    seenCount = 1,
                    lastSeenAtMs = now,
                )
                totalReads += 1
            }
        }
    }

    fun ingest(tag: RfidTag): Boolean {
        if (!EpcScheme.belongsToSystem(tag.epc)) return false
        synchronized(lock) {
            totalReads += 1
            val normalized = tag.copy(epc = EpcScheme.normalize(tag.epc))
            val existing = tags[normalized.epc]
            if (existing == null) {
                tags[normalized.epc] = normalized
                return true
            }
            tags[normalized.epc] = existing.copy(
                rssi = normalized.rssi,
                antenna = normalized.antenna,
                seenCount = existing.seenCount + 1,
                lastSeenAtMs = normalized.lastSeenAtMs,
            )
            return false
        }
    }

    /** @return cantidad de EPCs nuevos aceptados en el batch. */
    fun ingestAll(batch: List<RfidTag>): Int {
        var added = 0
        for (tag in batch) {
            if (ingest(tag)) added += 1
        }
        return added
    }

    fun epcSet(): Set<String> = synchronized(lock) { tags.keys.toSet() }

    fun snapshot(): RfidInventorySnapshot {
        synchronized(lock) {
            val started = startedAtMs
            val elapsedMs = if (started == null) 0L else (System.currentTimeMillis() - started).coerceAtLeast(0)
            val unique = tags.size
            val tagsPerSecond = if (elapsedMs == 0L) 0.0 else unique * 1000.0 / elapsedMs
            return RfidInventorySnapshot(
                uniqueTags = unique,
                totalReads = totalReads,
                elapsedMs = elapsedMs,
                tagsPerSecond = tagsPerSecond,
                tags = tags.values.sortedBy { it.epc },
            )
        }
    }
}

data class RfidInventorySnapshot(
    val uniqueTags: Int,
    val totalReads: Long,
    val elapsedMs: Long,
    val tagsPerSecond: Double,
    val tags: List<RfidTag>,
) {
    fun requireMinimumUnique(minUnique: Int): AppError? {
        if (uniqueTags >= minUnique) return null
        return AppError(
            code = "RFID_INVENTORY_BELOW_TARGET",
            title = "Lectura masiva insuficiente",
            detail = "Se esperaban al menos $minUnique EPCs únicos y se obtuvieron $uniqueTags " +
                "en ${elapsedMs}ms (${"%.1f".format(tagsPerSecond)} tags/s).",
        )
    }
}
