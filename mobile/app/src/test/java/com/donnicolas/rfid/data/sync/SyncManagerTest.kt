package com.donnicolas.rfid.data.sync

import com.donnicolas.rfid.data.api.InventarioCreateDto
import com.donnicolas.rfid.data.api.InventarioDto
import com.donnicolas.rfid.data.api.InventarioLecturasDto
import com.donnicolas.rfid.data.api.InventarioListItemDto
import com.donnicolas.rfid.data.api.InventarioReporteDto
import com.donnicolas.rfid.data.api.InventoryApi
import com.donnicolas.rfid.data.local.ConnectivityMonitor
import com.donnicolas.rfid.data.local.db.SyncQueueDao
import com.donnicolas.rfid.data.local.db.SyncQueueEntity
import java.io.IOException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever

/** DAO en memoria: alcanza para verificar el ciclo de la cola sin Room. */
private class FakeSyncQueueDao : SyncQueueDao {
    val rows = linkedMapOf<Long, SyncQueueEntity>()
    private var nextId = 1L

    override suspend fun listPending(): List<SyncQueueEntity> =
        rows.values
            .filter { it.status == SyncQueueEntity.STATUS_PENDING || it.status == SyncQueueEntity.STATUS_FAILED }
            .sortedBy { it.createdAtMs }

    override suspend fun countPending(): Int = listPending().size

    override suspend fun countAbandoned(): Int =
        rows.values.count { it.status == SyncQueueEntity.STATUS_ABANDONED }

    override suspend fun get(id: Long): SyncQueueEntity? = rows[id]

    override suspend fun insert(item: SyncQueueEntity): Long {
        val id = nextId++
        rows[id] = item.copy(id = id)
        return id
    }

    override suspend fun update(item: SyncQueueEntity) {
        rows[item.id] = item
    }

    override suspend fun purgeDone() {
        rows.values.removeAll { it.status == SyncQueueEntity.STATUS_DONE }
    }
}

private class FakeInventoryApi(
    private val cerrarFails: () -> Boolean,
) : InventoryApi {
    var createCalls = 0
    val cerrarIds = mutableListOf<String>()

    override suspend fun create(body: InventarioCreateDto): InventarioDto {
        createCalls += 1
        return InventarioDto(id = "srv-$createCalls", depositoId = body.depositoId, estado = "en_curso")
    }

    override suspend fun cerrar(id: String, body: InventarioLecturasDto): InventarioDto {
        cerrarIds += id
        if (cerrarFails()) throw IOException("red caida al cerrar")
        return InventarioDto(id = id, depositoId = "dep-1", estado = "cerrado")
    }

    override suspend fun list(depositoId: String?, estado: String?, limit: Int): List<InventarioListItemDto> =
        emptyList()

    override suspend fun get(id: String): InventarioDto = error("no usado")

    override suspend fun reporte(id: String): InventarioReporteDto = error("no usado")

    override suspend fun registrarLecturas(id: String, body: InventarioLecturasDto): InventarioDto =
        error("no usado")

    override suspend fun cancelar(id: String): InventarioDto = error("no usado")
}

class SyncManagerTest {
    private val payload = InventorySyncPayload(
        depositoId = "dep-1",
        depositoNombre = "Central",
        expectedEpcs = listOf("D100000000010000000001A1"),
        readEpcs = listOf("D100000000010000000001A1"),
        localSessionId = "offline-abc",
    )

    private fun onlineConnectivity(): ConnectivityMonitor =
        mock<ConnectivityMonitor>().also { whenever(it.isOnline()).thenReturn(true) }

    @Test
    fun `un cerrar fallido no duplica el inventario en el reintento`() = runBlocking {
        val dao = FakeSyncQueueDao()
        var failCerrar = true
        val api = FakeInventoryApi(cerrarFails = { failCerrar })
        val manager = SyncManager(dao, api, onlineConnectivity())

        manager.enqueueInventorySync(payload)

        val first = manager.flush()
        assertEquals(1, first.failed)
        assertEquals(1, api.createCalls)

        failCerrar = false
        val second = manager.flush()

        assertEquals(1, second.succeeded)
        // El reintento reusa el inventario ya creado en vez de crear otro.
        assertEquals(1, api.createCalls)
        assertEquals(listOf("srv-1", "srv-1"), api.cerrarIds)
        assertEquals(0, second.remaining)
    }

    @Test
    fun `abandona el item tras el tope de intentos`() = runBlocking {
        val dao = FakeSyncQueueDao()
        val api = FakeInventoryApi(cerrarFails = { true })
        val manager = SyncManager(dao, api, onlineConnectivity())

        manager.enqueueInventorySync(payload)

        repeat(SyncManager.MAX_ATTEMPTS) { manager.flush() }
        val last = manager.flush()

        assertEquals(1, last.abandoned)
        assertEquals(0, last.remaining)
        // No siguió creando inventarios en cada reintento.
        assertEquals(1, api.createCalls)
        assertTrue(dao.rows.values.single().lastError!!.contains("máximo"))
    }
}
