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

    @Test
    fun `fromRssi sube al acercarse`() {
        assertTrue(LocateProximity.fromRssi(-80) < LocateProximity.fromRssi(-40))
        assertTrue(LocateProximity.fromRssi(-30) >= 80)
    }

    @Test
    fun `epcMatches flexible`() {
        assertTrue(
            LocateProximity.epcMatches(
                "E280117000000211D6A6B53D",
                "e280117000000211d6a6b53d",
            ),
        )
        assertTrue(
            LocateProximity.epcMatches(
                "E280117000000211D6A6B53D",
                "XXE280117000000211D6A6B53D",
            ),
        )
    }
}
