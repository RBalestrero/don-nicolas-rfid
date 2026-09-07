package com.donnicolas.rfid.data.repository

import com.donnicolas.rfid.BuildConfig
import com.donnicolas.rfid.data.api.ApiErrorMapper
import com.donnicolas.rfid.data.api.DepositoDto
import com.donnicolas.rfid.data.api.DetalleInventarioDto
import com.donnicolas.rfid.data.api.InventarioCreateDto
import com.donnicolas.rfid.data.api.InventarioDto
import com.donnicolas.rfid.data.api.InventarioLecturasDto
import com.donnicolas.rfid.data.api.InventarioReporteDto
import com.donnicolas.rfid.data.api.InventarioResumenDto
import com.donnicolas.rfid.data.api.InventoryApi
import com.donnicolas.rfid.data.api.WarehouseApi
import com.donnicolas.rfid.data.local.ConnectivityMonitor
import com.donnicolas.rfid.data.local.db.CachedDepositoDao
import com.donnicolas.rfid.data.local.db.CachedDepositoEntity
import com.donnicolas.rfid.data.local.db.CachedStockDao
import com.donnicolas.rfid.data.local.db.CachedStockEntity
import com.donnicolas.rfid.data.model.AppError
import com.donnicolas.rfid.data.sync.InventorySyncPayload
import com.donnicolas.rfid.data.sync.SyncJson
import com.donnicolas.rfid.data.sync.SyncManager
import com.donnicolas.rfid.inventory.InventoryComparer
import com.donnicolas.rfid.inventory.InventoryReport
import com.donnicolas.rfid.inventory.InventoryReportBuilder
import java.util.UUID

sealed class InventoryResult<out T> {
    data class Ok<T>(val value: T) : InventoryResult<T>()
    data class Error(val error: AppError) : InventoryResult<Nothing>()
}

data class InventarioStartResult(
    val inventario: InventarioDto,
    val offline: Boolean,
    val message: String? = null,
)

data class InventarioCloseResult(
    val inventario: InventarioDto,
    val report: InventoryReport,
    val queuedForSync: Boolean,
    val message: String? = null,
)

class InventoryRepository(
    private val warehouseApi: WarehouseApi,
    private val inventoryApi: InventoryApi,
    private val cachedDepositoDao: CachedDepositoDao,
    private val cachedStockDao: CachedStockDao,
    private val syncManager: SyncManager,
    private val connectivity: ConnectivityMonitor,
    private val baseUrl: String = BuildConfig.API_BASE_URL,
) {
    suspend fun listDepositos(): InventoryResult<List<DepositoDto>> {
        return try {
            val remote = warehouseApi.listDepositos()
            val now = System.currentTimeMillis()
            cachedDepositoDao.upsertAll(
                remote.map {
                    CachedDepositoEntity(
                        id = it.id,
                        nombre = it.nombre,
                        descripcion = it.descripcion,
                        direccion = it.direccion,
                        activo = it.activo,
                        cachedAtMs = now,
                    )
                },
            )
            InventoryResult.Ok(remote.filter { it.activo })
        } catch (e: Exception) {
            val cached = cachedDepositoDao.listActive().map {
                DepositoDto(
                    id = it.id,
                    nombre = it.nombre,
                    descripcion = it.descripcion,
                    direccion = it.direccion,
                    activo = it.activo,
                )
            }
            if (cached.isNotEmpty()) {
                InventoryResult.Ok(cached)
            } else {
                InventoryResult.Error(
                    ApiErrorMapper.fromThrowable(
                        throwable = e,
                        operation = "listar depósitos",
                        baseUrl = baseUrl,
                        endpoint = "depositos",
                    ),
                )
            }
        }
    }

    suspend fun startInventario(deposito: DepositoDto): InventoryResult<InventarioStartResult> {
        return try {
            val inv = inventoryApi.create(InventarioCreateDto(depositoId = deposito.id))
            val expected = inv.detalles.mapNotNull { it.epc?.trim()?.uppercase() }.filter { it.isNotEmpty() }
            cacheExpected(deposito.id, expected)
            InventoryResult.Ok(InventarioStartResult(inventario = inv, offline = false))
        } catch (e: Exception) {
            val cached = cachedStockDao.get(deposito.id)
            val expected = cached?.let { SyncJson.epcsFromJson(it.expectedEpcsJson) }.orEmpty()
            if (expected.isEmpty() && !isNetworkError(e)) {
                return InventoryResult.Error(
                    ApiErrorMapper.fromThrowable(
                        throwable = e,
                        operation = "crear inventario",
                        baseUrl = baseUrl,
                        endpoint = "inventarios",
                    ),
                )
            }
            if (expected.isEmpty()) {
                // Intentar stock remoto una vez más no tiene sentido si falló create por red.
                // Pedimos cache previo: usuario debió abrir inventario online antes.
                return InventoryResult.Error(
                    AppError(
                        code = "OFFLINE_NO_CACHE",
                        title = "Sin datos offline para este depósito",
                        detail = "No hay stock cacheado. Conectate una vez, abrí el depósito online " +
                            "y luego podrás inventariar offline.",
                        cause = e.message,
                    ),
                )
            }
            val local = buildOfflineInventario(deposito, expected)
            InventoryResult.Ok(
                InventarioStartResult(
                    inventario = local,
                    offline = true,
                    message = "Modo offline: usando stock cacheado (${expected.size} EPCs esperados).",
                ),
            )
        }
    }

    suspend fun prefetchStock(depositoId: String) {
        if (!connectivity.isOnline()) return
        runCatching {
            val stock = warehouseApi.getStock(depositoId)
            val epcs = stock.activos.mapNotNull { it.epc?.trim()?.uppercase() }.filter { it.isNotEmpty() }
            cacheExpected(depositoId, epcs)
        }
    }

    suspend fun cerrar(
        inventario: InventarioDto,
        deposito: DepositoDto?,
        expectedEpcs: Set<String>,
        readEpcs: List<String>,
        offlineSession: Boolean,
    ): InventoryResult<InventarioCloseResult> {
        val normalizedReads = readEpcs.map { it.trim().uppercase() }.filter { it.isNotEmpty() }.distinct()
        if (!offlineSession && !inventario.id.startsWith("offline-")) {
            try {
                val closed = inventoryApi.cerrar(
                    id = inventario.id,
                    body = InventarioLecturasDto(epcs = normalizedReads),
                )
                val report = when (val r = reporte(inventario.id)) {
                    is InventoryResult.Ok -> InventoryReportBuilder.fromReporteDto(r.value)
                    is InventoryResult.Error -> InventoryReportBuilder.fromInventario(closed)
                }
                return InventoryResult.Ok(
                    InventarioCloseResult(inventario = closed, report = report, queuedForSync = false),
                )
            } catch (e: Exception) {
                if (!isNetworkError(e)) {
                    return InventoryResult.Error(
                        ApiErrorMapper.fromThrowable(
                            throwable = e,
                            operation = "cerrar inventario",
                            baseUrl = baseUrl,
                            endpoint = "inventarios/${inventario.id}/cerrar",
                        ),
                    )
                }
                // cae a cola offline
            }
        }

        val dep = deposito
            ?: return InventoryResult.Error(
                AppError(
                    code = "OFFLINE_NO_DEPOSITO",
                    title = "No se puede encolar el inventario",
                    detail = "Falta el depósito seleccionado para sincronizar offline.",
                ),
            )
        val localId = if (inventario.id.startsWith("offline-")) inventario.id else "offline-${UUID.randomUUID()}"
        syncManager.enqueueInventorySync(
            InventorySyncPayload(
                depositoId = dep.id,
                depositoNombre = dep.nombre,
                expectedEpcs = expectedEpcs.toList(),
                readEpcs = normalizedReads,
                localSessionId = localId,
            ),
        )
        val compare = InventoryComparer.compare(expectedEpcs, normalizedReads.toSet())
        val closedLocal = buildClosedOfflineInventario(localId, dep.id, compare)
        val report = InventoryReportBuilder.fromInventario(closedLocal)
        return InventoryResult.Ok(
            InventarioCloseResult(
                inventario = closedLocal,
                report = report,
                queuedForSync = true,
                message = "Inventario guardado offline. Se sincronizará al recuperar red.",
            ),
        )
    }

    suspend fun syncLecturas(inventarioId: String, epcs: List<String>): InventoryResult<InventarioDto> {
        if (inventarioId.startsWith("offline-")) {
            return InventoryResult.Error(
                AppError(
                    code = "OFFLINE_SYNC_LECTURAS",
                    title = "Sync de lecturas no aplica offline",
                    detail = "En modo offline las lecturas se envían al cerrar el inventario.",
                ),
            )
        }
        return try {
            InventoryResult.Ok(
                inventoryApi.registrarLecturas(
                    id = inventarioId,
                    body = InventarioLecturasDto(epcs = epcs),
                ),
            )
        } catch (e: Exception) {
            InventoryResult.Error(
                ApiErrorMapper.fromThrowable(
                    throwable = e,
                    operation = "sincronizar lecturas de inventario",
                    baseUrl = baseUrl,
                    endpoint = "inventarios/$inventarioId/lecturas",
                ),
            )
        }
    }

    suspend fun reporte(inventarioId: String): InventoryResult<InventarioReporteDto> {
        return try {
            InventoryResult.Ok(inventoryApi.reporte(inventarioId))
        } catch (e: Exception) {
            InventoryResult.Error(
                ApiErrorMapper.fromThrowable(
                    throwable = e,
                    operation = "obtener reporte de inventario",
                    baseUrl = baseUrl,
                    endpoint = "inventarios/$inventarioId/reporte",
                ),
            )
        }
    }

    suspend fun pendingSyncCount(): Int = syncManager.pendingCount()

    suspend fun flushSync() = syncManager.flush()

    private suspend fun cacheExpected(depositoId: String, epcs: Collection<String>) {
        cachedStockDao.upsert(
            CachedStockEntity(
                depositoId = depositoId,
                expectedEpcsJson = SyncJson.epcsToJson(epcs),
                cachedAtMs = System.currentTimeMillis(),
            ),
        )
    }

    private fun buildOfflineInventario(deposito: DepositoDto, expected: List<String>): InventarioDto {
        val detalles = expected.mapIndexed { index, epc ->
            DetalleInventarioDto(
                id = "local-$index-$epc",
                epc = epc,
                numeroPatrimonial = null,
                descripcion = "Esperado (cache offline)",
                estado = "esperado",
            )
        }
        return InventarioDto(
            id = "offline-${UUID.randomUUID()}",
            depositoId = deposito.id,
            estado = "en_curso",
            totalEsperado = expected.size,
            totalEncontrado = 0,
            totalFaltante = expected.size,
            totalSobrante = 0,
            resumen = InventarioResumenDto(
                totalEsperado = expected.size,
                totalEncontrado = 0,
                totalFaltante = expected.size,
                totalSobrante = 0,
            ),
            detalles = detalles,
        )
    }

    private fun buildClosedOfflineInventario(
        localId: String,
        depositoId: String,
        compare: com.donnicolas.rfid.inventory.InventoryCompareResult,
    ): InventarioDto {
        val detalles = buildList {
            compare.epcsEncontrados.forEachIndexed { i, epc ->
                add(
                    DetalleInventarioDto(
                        id = "ok-$i-$epc",
                        epc = epc,
                        estado = "encontrado",
                        descripcion = "Encontrado",
                    ),
                )
            }
            compare.epcsFaltantes.forEachIndexed { i, epc ->
                add(
                    DetalleInventarioDto(
                        id = "miss-$i-$epc",
                        epc = epc,
                        estado = "faltante",
                        descripcion = "Faltante",
                    ),
                )
            }
            compare.epcsSobrantes.forEachIndexed { i, epc ->
                add(
                    DetalleInventarioDto(
                        id = "extra-$i-$epc",
                        epc = epc,
                        estado = "sobrante",
                        descripcion = "Sobrante",
                    ),
                )
            }
        }
        return InventarioDto(
            id = localId,
            depositoId = depositoId,
            estado = "cerrado",
            totalEsperado = compare.esperado,
            totalEncontrado = compare.encontrado,
            totalFaltante = compare.faltante,
            totalSobrante = compare.sobrante,
            resumen = InventarioResumenDto(
                totalEsperado = compare.esperado,
                totalEncontrado = compare.encontrado,
                totalFaltante = compare.faltante,
                totalSobrante = compare.sobrante,
            ),
            detalles = detalles,
        )
    }

    private fun isNetworkError(e: Exception): Boolean {
        val name = e.javaClass.simpleName
        val msg = (e.message ?: "").lowercase()
        return name.contains("UnknownHost", ignoreCase = true) ||
            name.contains("Connect", ignoreCase = true) ||
            name.contains("SocketTimeout", ignoreCase = true) ||
            name.contains("IOException", ignoreCase = true) ||
            msg.contains("failed to connect") ||
            msg.contains("timeout") ||
            msg.contains("unable to resolve")
    }
}
