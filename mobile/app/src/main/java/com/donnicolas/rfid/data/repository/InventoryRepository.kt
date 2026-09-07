package com.donnicolas.rfid.data.repository

import com.donnicolas.rfid.BuildConfig
import com.donnicolas.rfid.data.api.ApiErrorMapper
import com.donnicolas.rfid.data.api.DepositoDto
import com.donnicolas.rfid.data.api.InventarioCreateDto
import com.donnicolas.rfid.data.api.InventarioDto
import com.donnicolas.rfid.data.api.InventarioLecturasDto
import com.donnicolas.rfid.data.api.InventoryApi
import com.donnicolas.rfid.data.api.WarehouseApi
import com.donnicolas.rfid.data.model.AppError

sealed class InventoryResult<out T> {
    data class Ok<T>(val value: T) : InventoryResult<T>()
    data class Error(val error: AppError) : InventoryResult<Nothing>()
}

class InventoryRepository(
    private val warehouseApi: WarehouseApi,
    private val inventoryApi: InventoryApi,
    private val baseUrl: String = BuildConfig.API_BASE_URL,
) {
    suspend fun listDepositos(): InventoryResult<List<DepositoDto>> {
        return try {
            InventoryResult.Ok(warehouseApi.listDepositos())
        } catch (e: Exception) {
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

    suspend fun createInventario(depositoId: String): InventoryResult<InventarioDto> {
        return try {
            InventoryResult.Ok(
                inventoryApi.create(InventarioCreateDto(depositoId = depositoId)),
            )
        } catch (e: Exception) {
            InventoryResult.Error(
                ApiErrorMapper.fromThrowable(
                    throwable = e,
                    operation = "crear inventario",
                    baseUrl = baseUrl,
                    endpoint = "inventarios",
                ),
            )
        }
    }

    suspend fun syncLecturas(inventarioId: String, epcs: List<String>): InventoryResult<InventarioDto> {
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

    suspend fun cerrar(inventarioId: String, epcs: List<String>): InventoryResult<InventarioDto> {
        return try {
            InventoryResult.Ok(
                inventoryApi.cerrar(
                    id = inventarioId,
                    body = InventarioLecturasDto(epcs = epcs),
                ),
            )
        } catch (e: Exception) {
            InventoryResult.Error(
                ApiErrorMapper.fromThrowable(
                    throwable = e,
                    operation = "cerrar inventario",
                    baseUrl = baseUrl,
                    endpoint = "inventarios/$inventarioId/cerrar",
                ),
            )
        }
    }

    suspend fun reporte(inventarioId: String): InventoryResult<com.donnicolas.rfid.data.api.InventarioReporteDto> {
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
}
