package com.donnicolas.rfid.rfid

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EpcSchemeTest {
    private val sample = "D10003A93DA430CBDE1ED4A1"
    private val sibling = "D10003A93DA4AAAAAAAAAAA1"
    private val otherSku = "D100000003E90000000001A1"

    @Test
    fun `decodeArticuloCode de EPC de ejemplo`() {
        assertEquals(61423012L, EpcScheme.decodeArticuloCode(sample))
        assertEquals("D10003A93DA4", EpcScheme.articuloPrefixHex(sample))
        assertTrue(EpcScheme.belongsToSystem(sample))
    }

    @Test
    fun `mismo articulo distinto serial comparte prefijo`() {
        assertEquals(
            EpcScheme.decodeArticuloCode(sample),
            EpcScheme.decodeArticuloCode(sibling),
        )
        assertEquals(
            EpcScheme.articuloPrefixHex(sample),
            EpcScheme.articuloPrefixHex(sibling),
        )
        assertFalse(
            EpcScheme.decodeArticuloCode(sample) == EpcScheme.decodeArticuloCode(otherSku),
        )
    }

    @Test
    fun `articuloCodeFromPatrimonial usa digitos`() {
        assertEquals(61423012L, EpcScheme.articuloCodeFromPatrimonial("PAT-61423012"))
        assertEquals(1001L, EpcScheme.articuloCodeFromPatrimonial("SKU-1001"))
        assertEquals(
            EpcScheme.articuloPrefixFromCode(1001L),
            "D100000003E9",
        )
    }

    @Test
    fun `articuloPrefixFromCode redondea a 12 hex`() {
        val prefix = EpcScheme.articuloPrefixFromCode(61423012L)
        assertNotNull(prefix)
        assertEquals(12, prefix!!.length)
        assertEquals("D10003A93DA4", prefix)
    }
}
