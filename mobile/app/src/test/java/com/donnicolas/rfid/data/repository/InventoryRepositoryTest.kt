package com.donnicolas.rfid.data.repository

import com.donnicolas.rfid.data.api.DepositoDto
import com.donnicolas.rfid.data.api.DepositoTreeDto
import com.donnicolas.rfid.data.api.InventarioCreateDto
import com.donnicolas.rfid.data.api.InventarioDto
import com.donnicolas.rfid.data.api.InventarioLecturasDto
import com.donnicolas.rfid.data.api.InventarioListItemDto
import com.donnicolas.rfid.data.api.InventarioReporteDto
import com.donnicolas.rfid.data.api.InventoryApi
import com.donnicolas.rfid.data.api.NetworkErrors
import com.donnicolas.rfid.data.api.StockDepositoDto
import com.donnicolas.rfid.data.api.WarehouseApi
import com.donnicolas.rfid.data.local.ConnectivityMonitor
import com.donnicolas.rfid.data.local.db.CachedDepositoDao
import com.donnicolas.rfid.data.local.db.CachedDepositoEntity
import com.donnicolas.rfid.data.local.db.CachedStockDao
import com.donnicolas.rfid.data.local.db.CachedStockEntity
import com.donnicolas.rfid.data.local.db.SyncQueueDao
import com.donnicolas.rfid.data.local.db.SyncQueueEntity
import com.donnicolas.rfid.data.sync.SyncJson
import com.donnicolas.rfid.data.sync.SyncManager
import java.io.IOException
import java.net.UnknownHostException
import kotlinx.coroutines.runBlocking
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import retrofit2.HttpException
import retrofit2.Response

class InventoryRepositoryOfflineTest {
    private val deposito = DepositoDto(id = "dep-1", nombre = "Central")

    @Test
    fun `http 403 con cache no cae a offline`() = runBlocking {
        val stockDao = FakeStockDao()
        stockDao.upsert(CachedStockEntity("dep-1", """["D100000000010000000001A1"]""", 1L))
        val api = FakeInventoryApi(createError = httpError(403))
        val repo = repository(api, stockDao)

        val result = repo.startInventario(deposito)

        assertTrue(result is InventoryResult.Error)
        assertEquals(403, (result as InventoryResult.Error).error.httpStatus)
    }

    @Test
    fun `error de red con cache si va offline`() = runBlocking {
        val stockDao = FakeStockDao()
        stockDao.upsert(CachedStockEntity("dep-1", """["D100000000010000000001A1"]""", 1L))
        val api = FakeInventoryApi(createError = UnknownHostException("lan"))
        val repo = repository(api, stockDao)

        val result = repo.startInventario(deposito)

        assertTrue(result is InventoryResult.Ok)
        assertTrue((result as InventoryResult.Ok).value.offline)
    }

    @Test
    fun `cerrar online con red caída encola el id remoto`() = runBlocking {
        val dao = FakeSyncQueueDao()
        val api = FakeInventoryApi(cerrarError = IOException("red caida"))
        val repo = repository(api, FakeStockDao(), dao)
        val inv = InventarioDto(id = "inv-real", depositoId = "dep-1", estado = "en_curso")

        val result = repo.cerrar(
            inventario = inv,
            deposito = deposito,
            expectedEpcs = setOf("D100000000010000000001A1"),
            readEpcs = listOf("D100000000010000000001A1"),
            offlineSession = false,
        )

        assertTrue(result is InventoryResult.Ok)
        assertTrue((result as InventoryResult.Ok).value.queuedForSync)
        val payload = SyncJson.inventoryFromJson(dao.rows.values.single().payloadJson)
        assertEquals("inv-real", payload.remoteInventarioId)
    }

    @Test
    fun `http 422 al cerrar no se encola`() = runBlocking {
        val dao = FakeSyncQueueDao()
        val api = FakeInventoryApi(cerrarError = httpError(422))
        val repo = repository(api, FakeStockDao(), dao)
        val inv = InventarioDto(id = "inv-real", depositoId = "dep-1", estado = "en_curso")

        val result = repo.cerrar(
            inventario = inv,
            deposito = deposito,
            expectedEpcs = emptySet(),
            readEpcs = emptyList(),
            offlineSession = false,
        )

        assertTrue(result is InventoryResult.Error)
        assertTrue(dao.rows.isEmpty())
    }

    @Test
    fun `403 no es error de red`() {
        assertFalse(NetworkErrors.isNetworkError(httpError(403)))
        assertTrue(NetworkErrors.isNetworkError(UnknownHostException("x")))
        assertTrue(NetworkErrors.isNetworkError(IOException("red caida")))
        assertTrue(NetworkErrors.isUnauthorized(httpError(401)))
    }

    @Test
    fun `reset online llama a la API`() = runBlocking {
        val api = FakeInventoryApi()
        val repo = repository(api, FakeStockDao())

        val result = repo.resetLecturas("inv-real")

        assertTrue(result is InventoryResult.Ok)
        assertEquals(1, api.resetCalls)
        assertEquals("en_curso", (result as InventoryResult.Ok).value.estado)
        assertEquals(0, result.value.totalEncontrado)
    }

    @Test
    fun `reset offline no llama a la API`() = runBlocking {
        val api = FakeInventoryApi()
        val repo = repository(api, FakeStockDao())

        val result = repo.resetLecturas("offline-abc")

        assertTrue(result is InventoryResult.Ok)
        assertEquals(0, api.resetCalls)
        assertEquals("en_curso", (result as InventoryResult.Ok).value.estado)
    }

    @Test
    fun `reset con red caída no borra en silencio`() = runBlocking {
        val api = FakeInventoryApi(resetError = IOException("red caida"))
        val repo = repository(api, FakeStockDao())

        val result = repo.resetLecturas("inv-real")

        assertTrue(result is InventoryResult.Error)
        assertEquals(1, api.resetCalls)
    }

    private fun repository(
        api: InventoryApi,
        stockDao: CachedStockDao,
        syncDao: FakeSyncQueueDao = FakeSyncQueueDao(),
    ): InventoryRepository {
        val connectivity = mock<ConnectivityMonitor>().also {
            whenever(it.isOnline()).thenReturn(true)
        }
        return InventoryRepository(
            warehouseApi = FakeWarehouseApi(),
            inventoryApi = api,
            cachedDepositoDao = FakeDepositoDao(),
            cachedStockDao = stockDao,
            syncManager = SyncManager(syncDao, api, connectivity),
            connectivity = connectivity,
            baseUrl = "http://192.168.100.158:8000/api/v1/",
        )
    }

    private fun httpError(code: Int): HttpException {
        val body = """{"detail":"no"}""".toResponseBody("application/json".toMediaType())
        return HttpException(Response.error<Any>(code, body))
    }
}

private class FakeStockDao : CachedStockDao {
    val rows = mutableMapOf<String, CachedStockEntity>()
    override suspend fun get(depositoId: String) = rows[depositoId]
    override suspend fun upsert(item: CachedStockEntity) {
        rows[item.depositoId] = item
    }
}

private class FakeDepositoDao : CachedDepositoDao {
    override suspend fun listActive() = emptyList<CachedDepositoEntity>()
    override suspend fun upsertAll(items: List<CachedDepositoEntity>) = Unit
}

private class FakeSyncQueueDao : SyncQueueDao {
    val rows = linkedMapOf<Long, SyncQueueEntity>()
    private var nextId = 1L
    override suspend fun listPending() = rows.values.filter {
        it.status == SyncQueueEntity.STATUS_PENDING || it.status == SyncQueueEntity.STATUS_FAILED
    }
    override suspend fun countPending() = listPending().size
    override suspend fun countAbandoned() = rows.values.count { it.status == SyncQueueEntity.STATUS_ABANDONED }
    override suspend fun get(id: Long) = rows[id]
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

private class FakeWarehouseApi : WarehouseApi {
    override suspend fun listDepositos(includeInactive: Boolean) = emptyList<DepositoDto>()
    override suspend fun getDeposito(depositoId: String, includeTree: Boolean) =
        DepositoTreeDto(id = depositoId, nombre = "Fake")
    override suspend fun getStock(depositoId: String) = StockDepositoDto(depositoId, total = 0)
}

private class FakeInventoryApi(
    private val createError: Exception? = null,
    private val cerrarError: Exception? = null,
    private val resetError: Exception? = null,
) : InventoryApi {
    var resetCalls = 0
    override suspend fun create(body: InventarioCreateDto): InventarioDto {
        createError?.let { throw it }
        return InventarioDto(id = "new", depositoId = body.depositoId, estado = "en_curso")
    }

    override suspend fun cerrar(id: String, body: InventarioLecturasDto): InventarioDto {
        cerrarError?.let { throw it }
        return InventarioDto(id = id, depositoId = "dep-1", estado = "cerrado")
    }

    override suspend fun list(depositoId: String?, estado: String?, limit: Int) =
        emptyList<InventarioListItemDto>()

    override suspend fun get(id: String) = error("no")
    override suspend fun reporte(id: String) = error("no")
    override suspend fun registrarLecturas(id: String, body: InventarioLecturasDto) = error("no")
    override suspend fun resetearLecturas(id: String): InventarioDto {
        resetCalls += 1
        resetError?.let { throw it }
        return InventarioDto(
            id = id,
            depositoId = "dep-1",
            estado = "en_curso",
            totalEncontrado = 0,
        )
    }
    override suspend fun cancelar(id: String) = error("no")
}
