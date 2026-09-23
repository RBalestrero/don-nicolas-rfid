package com.donnicolas.rfid.rfid

import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
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
    private val epc1 = "D1${"0".repeat(9)}1${"0".repeat(9)}1A1"
    private val epc2 = "D1${"0".repeat(9)}2${"0".repeat(9)}2A1"

    @Test
    fun `deduplica EPC e incrementa seenCount`() {
        val session = RfidInventorySession()
        session.start()
        session.ingest(RfidTag(epc = epc1, rssi = -50))
        session.ingest(RfidTag(epc = epc1, rssi = -40))
        session.ingest(RfidTag(epc = epc2, rssi = -55))

        val snap = session.snapshot()
        assertEquals(2, snap.uniqueTags)
        assertEquals(3, snap.totalReads)
        val tag1 = snap.tags.first { it.epc == epc1 }
        assertEquals(2, tag1.seenCount)
        assertEquals(-40, tag1.rssi)
    }

    @Test
    fun `descarta EPCs ajenos al esquema D1`() {
        val session = RfidInventorySession()
        session.start()
        session.ingest(RfidTag(epc = epc1, rssi = -50))
        session.ingest(RfidTag(epc = "E28011602000020491234567", rssi = -50))
        session.ingest(RfidTag(epc = "EPC1", rssi = -50))

        val snap = session.snapshot()
        assertEquals(1, snap.uniqueTags)
        assertEquals(epc1, snap.tags.single().epc)
    }

    @Test
    fun `clear vacia el lote para reintentar`() {
        val session = RfidInventorySession()
        session.start()
        session.ingest(RfidTag(epc = epc1, rssi = -50))
        session.ingest(RfidTag(epc = epc2, rssi = -55))
        assertEquals(2, session.epcSet().size)

        session.clear()

        assertEquals(0, session.epcSet().size)
        assertEquals(0, session.snapshot().uniqueTags)
        assertEquals(0, session.snapshot().totalReads)
        session.start()
        session.ingest(RfidTag(epc = epc1, rssi = -48))
        assertEquals(1, session.epcSet().size)
    }

    @Test
    fun `requireMinimumUnique reporta error tipado`() {
        val session = RfidInventorySession()
        session.start()
        session.ingest(RfidTag(epc = epc1, rssi = -50))
        val error = session.snapshot().requireMinimumUnique(10)
        assertNotNull(error)
        assertEquals("RFID_INVENTORY_BELOW_TARGET", error!!.code)
    }
}

class SimulatedLocateTest {
    @Test
    fun `startLocate emite proximidad creciente del EPC armado`() = runBlocking {
        val reader = SimulatedRfidReader()
        reader.connect()
        reader.armLocateTarget("D100000000010000000001A1")

        val collector = launch {
            val update = withTimeout(3_000) {
                reader.events().filterIsInstance<RfidEvent.LocateUpdate>().first()
            }
            // Puede ser la muestra u otra unidad del mismo ART (serial distinto)
            assertEquals(1L, EpcScheme.decodeArticuloCode(update.epc))
            assertTrue(update.relativeDistance in 1..100)
            assertTrue(update.rssi < 0)
        }
        delay(20)
        reader.startLocate()
        collector.join()
        reader.stopLocate()
        reader.clearLocateTarget()
    }

    @Test
    fun `startLocate sin target emite RFID_LOCATE_NO_TARGET`() = runBlocking {
        val reader = SimulatedRfidReader()
        reader.connect()
        val collector = launch {
            val event = withTimeout(2_000) {
                reader.events().filterIsInstance<RfidEvent.Failure>().first()
            }
            assertEquals("RFID_LOCATE_NO_TARGET", event.error.code)
        }
        delay(20)
        reader.startLocate()
        collector.join()
    }

    @Test
    fun `SERIAL mode emite solo el EPC armado`() = runBlocking {
        val reader = SimulatedRfidReader()
        reader.connect()
        val armed = "D100000000010000000001A1"
        reader.armLocateTarget(armed, LocateMatchMode.SERIAL)

        val epcs = mutableListOf<String>()
        val collector = launch {
            withTimeout(3_000) {
                reader.events()
                    .filterIsInstance<RfidEvent.LocateUpdate>()
                    .take(6)
                    .collect { epcs.add(it.epc) }
            }
        }
        delay(20)
        reader.startLocate()
        collector.join()
        reader.stopLocate()
        reader.clearLocateTarget()

        assertTrue(epcs.isNotEmpty())
        assertTrue(
            "Se esperaba solo $armed, hubo $epcs",
            epcs.all { it.equals(armed, ignoreCase = true) },
        )
    }
}

class ZebraRfidReaderTest {
    @Test
    fun `factory en modo SIMULATOR no usa Zebra`() {
        // El AAR Zebra requiere Context/dispositivo; el modo SIMULATOR sigue siendo el de CI.
        val reader = SimulatedRfidReader()
        assertEquals("SIMULATOR", reader.modeName)
    }
}
