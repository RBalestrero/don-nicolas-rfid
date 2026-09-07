package com.donnicolas.rfid.rfid

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LocateProximityTest {
    @Test
    fun `clamp limita 0 a 100`() {
        assertEquals(0, LocateProximity.clamp(-10))
        assertEquals(100, LocateProximity.clamp(150))
        assertEquals(42, LocateProximity.clamp(42))
    }

    @Test
    fun `label refleja proximidad`() {
        assertTrue(LocateProximity.label(5).contains("Buscando"))
        assertTrue(LocateProximity.label(90).contains("cerca", ignoreCase = true))
    }

    @Test
    fun `arrowScale crece con distancia`() {
        assertTrue(LocateProximity.arrowScale(10) < LocateProximity.arrowScale(90))
    }
}
