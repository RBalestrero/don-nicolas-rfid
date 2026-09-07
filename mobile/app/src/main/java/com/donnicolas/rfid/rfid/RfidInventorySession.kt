package com.donnicolas.rfid.rfid

import com.donnicolas.rfid.data.model.AppError

/**
 * Acumula lecturas RFID masivas con deduplicación por EPC.
 */
class RfidInventorySession {
    private val tags = linkedMapOf<String, RfidTag>()
    private var startedAtMs: Long? = null
    private var totalReads: Long = 0

    fun start() {
        tags.clear()
        totalReads = 0
        startedAtMs = System.currentTimeMillis()
    }

    fun clear() {
        tags.clear()
        totalReads = 0
        startedAtMs = null
    }

    fun ingest(tag: RfidTag) {
        totalReads += 1
        val existing = tags[tag.epc]
        if (existing == null) {
            tags[tag.epc] = tag
        } else {
            tags[tag.epc] = existing.copy(
                rssi = tag.rssi,
                antenna = tag.antenna,
                seenCount = existing.seenCount + 1,
                lastSeenAtMs = tag.lastSeenAtMs,
            )
        }
    }

    fun ingestAll(batch: List<RfidTag>) {
        batch.forEach(::ingest)
    }

    fun snapshot(): RfidInventorySnapshot {
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
