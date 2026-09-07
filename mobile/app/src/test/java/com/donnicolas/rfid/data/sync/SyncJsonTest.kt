package com.donnicolas.rfid.data.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncJsonTest {
    @Test
    fun `serializa y deserializa payload de inventario`() {
        val payload = InventorySyncPayload(
            depositoId = "dep-1",
            depositoNombre = "Central",
            expectedEpcs = listOf("E200001", "E200002"),
            readEpcs = listOf("E200001", "E299999"),
            localSessionId = "offline-abc",
        )
        val json = SyncJson.toJson(payload)
        val restored = SyncJson.inventoryFromJson(json)
        assertEquals(payload, restored)
        assertTrue(json.contains("E200001"))
        assertTrue(json.contains("offline-abc"))
    }

    @Test
    fun `serializa lista de epcs para cache de stock`() {
        val json = SyncJson.epcsToJson(listOf("aa", "BB", "aa"))
        val list = SyncJson.epcsFromJson(json)
        assertEquals(listOf("aa", "BB", "aa"), list)
    }

    @Test
    fun `epcsFromJson vacio ante json invalido o vacio`() {
        assertEquals(emptyList<String>(), SyncJson.epcsFromJson("[]"))
        assertEquals(emptyList<String>(), SyncJson.epcsFromJson("null"))
    }
}
