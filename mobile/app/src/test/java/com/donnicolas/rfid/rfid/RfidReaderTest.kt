package com.donnicolas.rfid.rfid

import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class SimulatedRfidReaderTest {
    @Test
    fun `lectura masiva acumula mas de 1000 EPCs unicos`() = runBlocking {
        val reader = SimulatedRfidReader(
            uniqueTagTarget = 1200,
            tagsPerBurst = 100,
            burstIntervalMs = 20L,
        )
        val session = RfidInventorySession()

        val collector = launch {
            reader.events().collect { event ->
                when (event) {
                    is RfidEvent.BatchRead -> session.ingestAll(event.tags)
                    is RfidEvent.TagRead -> session.ingest(event.tag)
                    else -> Unit
                }
            }
        }

        reader.connect()
        session.start()
        reader.startInventory()

        withTimeout(8_000) {
            while (session.snapshot().uniqueTags < 1000) {
                delay(50)
            }
        }

        reader.stopInventory()
        collector.cancel()

        val snapshot = session.snapshot()
        assertTrue(
            "Se esperaban >= 1000 únicos, hubo ${snapshot.uniqueTags}",
            snapshot.uniqueTags >= 1000,
        )
        assertTrue(snapshot.totalReads >= snapshot.uniqueTags)
        assertTrue(snapshot.tagsPerSecond > 0.0)
        assertEquals(null, snapshot.requireMinimumUnique(1000))
    }

    @Test
    fun `startInventory sin connect falla con RFID_NOT_CONNECTED`() = runBlocking {
        val reader = SimulatedRfidReader()
        val failure = launch {
            val event = withTimeout(2_000) {
                reader.events().filterIsInstance<RfidEvent.Failure>().first()
            }
            assertEquals("RFID_NOT_CONNECTED", event.error.code)
        }
        reader.startInventory()
        failure.join()
    }
}

class RfidInventorySessionTest {
    @Test
    fun `deduplica EPC e incrementa seenCount`() {
        val session = RfidInventorySession()
        session.start()
        session.ingest(RfidTag(epc = "EPC1", rssi = -50))
        session.ingest(RfidTag(epc = "EPC1", rssi = -40))
        session.ingest(RfidTag(epc = "EPC2", rssi = -55))

        val snap = session.snapshot()
        assertEquals(2, snap.uniqueTags)
        assertEquals(3, snap.totalReads)
        val epc1 = snap.tags.first { it.epc == "EPC1" }
        assertEquals(2, epc1.seenCount)
        assertEquals(-40, epc1.rssi)
    }

    @Test
    fun `requireMinimumUnique reporta error tipado`() {
        val session = RfidInventorySession()
        session.start()
        session.ingest(RfidTag(epc = "A", rssi = -50))
        val error = session.snapshot().requireMinimumUnique(10)
        assertNotNull(error)
        assertEquals("RFID_INVENTORY_BELOW_TARGET", error!!.code)
    }
}

class ZebraRfidReaderTest {
    @Test
    fun `connect sin SDK lanza RFID_ZEBRA_SDK_NOT_LINKED`() = runBlocking {
        val reader = ZebraRfidReader(sdkLinked = false)
        try {
            reader.connect()
            fail("Debía fallar sin SDK")
        } catch (e: RfidException) {
            assertEquals("RFID_ZEBRA_SDK_NOT_LINKED", e.error.code)
            assertTrue(e.error.detail.contains("AAR"))
        }
    }
}
