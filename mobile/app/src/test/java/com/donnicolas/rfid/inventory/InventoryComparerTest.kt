package com.donnicolas.rfid.inventory

import org.junit.Assert.assertEquals
import org.junit.Test

class InventoryComparerTest {
    @Test
    fun `compara esperado leido faltante y sobrante`() {
        val result = InventoryComparer.compare(
            expectedEpcs = setOf("e200001", "E200002", "E200003"),
            readEpcs = setOf("E200001", "E299999"),
        )
        assertEquals(3, result.esperado)
        assertEquals(1, result.encontrado)
        assertEquals(2, result.faltante)
        assertEquals(1, result.sobrante)
        assertEquals(listOf("E200001"), result.epcsEncontrados)
        assertEquals(listOf("E200002", "E200003"), result.epcsFaltantes)
        assertEquals(listOf("E299999"), result.epcsSobrantes)
    }

    @Test
    fun `ignora epcs vacios y normaliza case`() {
        val result = InventoryComparer.compare(
            expectedEpcs = setOf(" aa ", "", "BB"),
            readEpcs = setOf("AA", "bb", "  "),
        )
        assertEquals(2, result.esperado)
        assertEquals(2, result.encontrado)
        assertEquals(0, result.faltante)
        assertEquals(0, result.sobrante)
    }
}
