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
    fun `fromRssi 0 no es 100 por ciento`() {
        assertEquals(0, LocateProximity.fromRssi(0))
        assertTrue(LocateProximity.fromRssi(-40) > 0)
    }

    @Test
    fun `resolve usa relativeDistance si es positivo`() {
        assertEquals(70, LocateProximity.resolve(70, -80))
        assertEquals(70, LocateProximity.resolve(70, 0))
    }

    @Test
    fun `resolve con distance 0 usa RSSI valido`() {
        val fromRssi = LocateProximity.fromRssi(-40)
        assertTrue(fromRssi > 0)
        assertEquals(fromRssi, LocateProximity.resolve(0, -40))
        assertEquals(fromRssi, LocateProximity.resolve(null, -40))
    }

    @Test
    fun `resolve con RSSI 0 no infla a 100`() {
        assertEquals(0, LocateProximity.resolve(0, 0))
        assertEquals(0, LocateProximity.resolve(null, 0))
        assertEquals(0, LocateProximity.resolve(null, null))
    }

    @Test
    fun `fromRssi byte sin signo 206 equivale a -50`() {
        assertEquals(-50, LocateProximity.signedRssi(206))
        assertEquals(LocateProximity.fromRssi(-50), LocateProximity.fromRssi(206))
        assertTrue(LocateProximity.fromRssi(206) > 0)
    }

    @Test
    fun `epcMatches es exacto`() {
        assertTrue(
            LocateProximity.epcMatches(
                "E280117000000211D6A6B53D",
                "e280117000000211d6a6b53d",
            ),
        )
        assertTrue(
            !LocateProximity.epcMatches(
                "E280117000000211D6A6B53D",
                "XXE280117000000211D6A6B53D",
            ),
        )
    }

    @Test
    fun `locateMatches acepta mismo articulo distinto serial`() {
        val a = "D10003A93DA430CBDE1ED4A1"
        val b = "D10003A93DA4AAAAAAAAAAA1"
        val other = "D100000003E90000000001A1"
        assertTrue(LocateProximity.locateMatches(a, b))
        assertTrue(LocateProximity.articuloMatches(61423012L, b))
        assertTrue(LocateProximity.articuloMatchesPrefix("D10003A93DA4", b))
        assertTrue(!LocateProximity.locateMatches(a, other))
        assertTrue(!LocateProximity.epcMatches(a, b))
    }

    @Test
    fun `peakHold acepta solo intensidad mayor`() {
        val t0 = 1_000L
        val strong = LocateProximity.applyPeakHold(0, 0L, t0, sample = 80)
        assertTrue(strong.accepted)
        assertEquals(80, strong.displayed)

        val weaker = LocateProximity.applyPeakHold(
            strong.held,
            strong.lastPeakAtMs,
            t0 + 50L,
            sample = 35,
        )
        assertTrue(!weaker.accepted)
        assertEquals(80, weaker.displayed)
    }

    @Test
    fun `peakHold misma intensidad renueva hold`() {
        val t0 = 3_000L
        val first = LocateProximity.applyPeakHold(0, 0L, t0, 70)
        val same = LocateProximity.applyPeakHold(first.held, first.lastPeakAtMs, t0 + 150L, 70)
        assertTrue(same.accepted)
        assertEquals(70, same.displayed)
        assertEquals(t0 + 150L, same.lastPeakAtMs)
        // Sin renovar, a t0+400 ya habría decay; con renovación sigue en 70
        assertEquals(70, LocateProximity.decayedPeak(same.held, same.lastPeakAtMs, t0 + 340L))
    }

    @Test
    fun `peakHold no baja por etiqueta lejana durante hold`() {
        val t0 = 5_000L
        val near = LocateProximity.applyPeakHold(0, 0L, t0, 90)
        val far = LocateProximity.applyPeakHold(near.held, near.lastPeakAtMs, t0 + 100L, 20)
        assertTrue(!far.accepted)
        assertEquals(90, far.displayed)
    }

    @Test
    fun `peakHold decae tras hold y permite senal mas debil si supera el decay`() {
        val t0 = 10_000L
        val near = LocateProximity.applyPeakHold(0, 0L, t0, 100)
        // hold 200ms + 800ms decay a 10 pts/100ms = -80 → display 20
        val afterDecay = LocateProximity.decayedPeak(near.held, near.lastPeakAtMs, t0 + 1_000L)
        assertEquals(20, afterDecay)

        val farTakesOver = LocateProximity.applyPeakHold(
            near.held,
            near.lastPeakAtMs,
            t0 + 1_000L,
            sample = 30,
        )
        assertTrue(farTakesOver.accepted)
        assertEquals(30, farTakesOver.displayed)
    }

    @Test
    fun `peakHold decayedPeak se mantiene durante hold`() {
        val t0 = 2_000L
        assertEquals(70, LocateProximity.decayedPeak(70, t0, t0 + 199L))
        assertTrue(LocateProximity.decayedPeak(70, t0, t0 + 400L) < 70)
    }
}
