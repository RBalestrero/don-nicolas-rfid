package com.donnicolas.rfid.data.repository

import com.donnicolas.rfid.BuildConfig
import com.donnicolas.rfid.data.api.ActivoCreateDto
import com.donnicolas.rfid.data.api.ActivoDto
import com.donnicolas.rfid.data.api.ActivoLookupDto
import com.donnicolas.rfid.data.api.ActivoLookupEpcsDto
import com.donnicolas.rfid.data.api.ActivoLookupEpcsRequest
import com.donnicolas.rfid.data.api.ActivoUbicacionStockDto
import com.donnicolas.rfid.data.api.ApiErrorMapper
import com.donnicolas.rfid.data.api.AssetsApi
import com.donnicolas.rfid.data.api.CategoriaDto
import com.donnicolas.rfid.data.api.DepositoDto
import com.donnicolas.rfid.data.api.DepositoTreeDto
import com.donnicolas.rfid.data.api.EtiquetaLoteDto
import com.donnicolas.rfid.data.api.EtiquetaLoteRequestDto
import com.donnicolas.rfid.data.api.LocateTargetDto
import com.donnicolas.rfid.data.api.WarehouseApi
import com.donnicolas.rfid.data.local.db.CachedActivoDao
import com.donnicolas.rfid.data.local.db.CachedActivoEntity
import com.donnicolas.rfid.data.model.AppError
import com.donnicolas.rfid.rfid.EpcScheme

sealed class AssetResult<out T> {
    data class Ok<T>(val value: T) : AssetResult<T>()
    data class Error(val error: AppError) : AssetResult<Nothing>()
}

class AssetsRepository(
    private val assetsApi: AssetsApi,
    private val warehouseApi: WarehouseApi,
    private val cachedActivoDao: CachedActivoDao,
    private val baseUrl: String = BuildConfig.API_BASE_URL,
) {
    /**
     * Lista tipos de artículo localizables (un row por activo / SKU).
     * El EPC de muestra deriva el prefijo D1+ART; en campo se matchea cualquier serial.
     */
    suspend fun searchLocateTargets(query: String): AssetResult<List<LocateTargetDto>> {
        val q = query.trim()
        return try {
            val remote = assetsApi.listActivos(
                search = q.takeIf { it.isNotEmpty() },
                includeInactive = false,
            )
            val targets = remote
                .filter { it.activo }
                .mapNotNull { it.toLocateTarget() }
            val now = System.currentTimeMillis()
            cachedActivoDao.upsertAll(
                targets.map {
                    CachedActivoEntity(
                        id = it.activoId,
                        numeroPatrimonial = it.numeroPatrimonial,
                        descripcion = it.descripcion,
                        epc = it.epc,
                        categoriaNombre = null,
                        activo = true,
                        cachedAtMs = now,
                    )
                },
            )
            AssetResult.Ok(targets)
        } catch (e: Exception) {
            val cached = cachedActivoDao.searchWithEpc(q).mapNotNull { row ->
                row.toLocateTargetOrNull()
            }
            if (cached.isNotEmpty()) {
                AssetResult.Ok(cached)
            } else {
                AssetResult.Error(
                    ApiErrorMapper.fromThrowable(
                        throwable = e,
                        operation = "listar artículos para localizar",
                        baseUrl = baseUrl,
                        endpoint = "activos",
                    ),
                )
            }
        }
    }

    suspend fun listActivos(search: String?): AssetResult<List<ActivoDto>> {
        return try {
            AssetResult.Ok(
                assetsApi.listActivos(
                    search = search?.trim()?.takeIf { it.isNotEmpty() },
                    includeInactive = false,
                ),
            )
        } catch (e: Exception) {
            AssetResult.Error(
                ApiErrorMapper.fromThrowable(
                    throwable = e,
                    operation = "listar artículos",
                    baseUrl = baseUrl,
                    endpoint = "activos",
                ),
            )
        }
    }

    suspend fun listUbicacionesStock(activoId: String): AssetResult<List<ActivoUbicacionStockDto>> {
        return try {
            AssetResult.Ok(assetsApi.listUbicacionesStock(activoId))
        } catch (e: Exception) {
            AssetResult.Error(
                ApiErrorMapper.fromThrowable(
                    throwable = e,
                    operation = "listar ubicaciones del artículo",
                    baseUrl = baseUrl,
                    endpoint = "activos/$activoId/ubicaciones-stock",
                ),
            )
        }
    }

    suspend fun listCategorias(): AssetResult<List<CategoriaDto>> {
        return try {
            AssetResult.Ok(assetsApi.listCategorias(includeInactive = false))
        } catch (e: Exception) {
            AssetResult.Error(
                ApiErrorMapper.fromThrowable(
                    throwable = e,
                    operation = "listar categorías",
                    baseUrl = baseUrl,
                    endpoint = "categorias",
                ),
            )
        }
    }

    suspend fun listDepositos(): AssetResult<List<DepositoDto>> {
        return try {
            AssetResult.Ok(warehouseApi.listDepositos(includeInactive = false))
        } catch (e: Exception) {
            AssetResult.Error(
                ApiErrorMapper.fromThrowable(
                    throwable = e,
                    operation = "listar depósitos",
                    baseUrl = baseUrl,
                    endpoint = "depositos",
                ),
            )
        }
    }

    suspend fun getDepositoTree(id: String): AssetResult<DepositoTreeDto> {
        return try {
            AssetResult.Ok(warehouseApi.getDeposito(id, includeTree = true))
        } catch (e: Exception) {
            AssetResult.Error(
                ApiErrorMapper.fromThrowable(
                    throwable = e,
                    operation = "obtener árbol del depósito",
                    baseUrl = baseUrl,
                    endpoint = "depositos/$id",
                ),
            )
        }
    }

    suspend fun createActivo(body: ActivoCreateDto): AssetResult<ActivoDto> {
        return try {
            AssetResult.Ok(assetsApi.createActivo(body))
        } catch (e: Exception) {
            AssetResult.Error(
                ApiErrorMapper.fromThrowable(
                    throwable = e,
                    operation = "crear artículo",
                    baseUrl = baseUrl,
                    endpoint = "activos",
                ),
            )
        }
    }

    suspend fun crearEtiquetas(
        activoId: String,
        cantidad: Int,
        seriesFisicas: List<String>? = null,
    ): AssetResult<EtiquetaLoteDto> {
        return try {
            AssetResult.Ok(
                assetsApi.crearEtiquetas(
                    activoId,
                    EtiquetaLoteRequestDto(
                        cantidad = cantidad,
                        modo = "nueva",
                        seriesFisicas = seriesFisicas,
                    ),
                ),
            )
        } catch (e: Exception) {
            AssetResult.Error(
                ApiErrorMapper.fromThrowable(
                    throwable = e,
                    operation = "codificar etiquetas",
                    baseUrl = baseUrl,
                    endpoint = "activos/$activoId/etiquetas",
                ),
            )
        }
    }

    suspend fun imprimirEtiquetas(
        activoId: String,
        cantidad: Int,
        modo: String,
        seriesFisicas: List<String>? = null,
    ): AssetResult<EtiquetaLoteDto> {
        return try {
            AssetResult.Ok(
                assetsApi.imprimirEtiquetas(
                    activoId,
                    EtiquetaLoteRequestDto(
                        cantidad = cantidad,
                        modo = modo,
                        seriesFisicas = seriesFisicas,
                    ),
                ),
            )
        } catch (e: Exception) {
            AssetResult.Error(
                ApiErrorMapper.fromThrowable(
                    throwable = e,
                    operation = "imprimir etiquetas",
                    baseUrl = baseUrl,
                    endpoint = "activos/$activoId/imprimir-etiquetas",
                ),
            )
        }
    }

    suspend fun lookupByEpc(epc: String): AssetResult<ActivoLookupDto> {
        val normalized = epc.trim().uppercase()
        if (normalized.isEmpty()) {
            return AssetResult.Error(
                AppError(
                    code = "ASSET_EPC_EMPTY",
                    title = "EPC vacío",
                    detail = "No se recibió un EPC válido para buscar el activo.",
                ),
            )
        }
        return try {
            AssetResult.Ok(assetsApi.lookupByEpc(normalized))
        } catch (e: Exception) {
            AssetResult.Error(
                ApiErrorMapper.fromThrowable(
                    throwable = e,
                    operation = "buscar activo por EPC",
                    baseUrl = baseUrl,
                    endpoint = "activos/by-epc/$normalized",
                ),
            )
        }
    }

    suspend fun lookupByEpcs(epcs: Collection<String>): AssetResult<ActivoLookupEpcsDto> {
        val normalized = epcs.map { EpcScheme.normalize(it) }.filter { it.isNotEmpty() }.distinct()
        if (normalized.isEmpty()) {
            return AssetResult.Ok(
                ActivoLookupEpcsDto(consultados = 0, encontrados = emptyList(), noRegistrados = emptyList()),
            )
        }
        return try {
            AssetResult.Ok(assetsApi.lookupByEpcs(ActivoLookupEpcsRequest(normalized)))
        } catch (e: Exception) {
            AssetResult.Error(
                ApiErrorMapper.fromThrowable(
                    throwable = e,
                    operation = "buscar activos por EPCs",
                    baseUrl = baseUrl,
                    endpoint = "activos/lookup-epcs",
                ),
            )
        }
    }

    fun toLocateTarget(lookup: ActivoLookupDto, readEpc: String): LocateTargetDto? {
        val activo = lookup.activo ?: return null
        return activo.toLocateTarget(preferredEpc = readEpc)
    }

    private fun ActivoDto.toLocateTarget(preferredEpc: String? = null): LocateTargetDto? {
        val fromList = epcs.map { EpcScheme.normalize(it) }.filter { it.isNotEmpty() }.distinct()
        val legacy = epc?.let { EpcScheme.normalize(it) }?.takeIf { it.isNotEmpty() }
        val preferred = preferredEpc?.let { EpcScheme.normalize(it) }?.takeIf { it.isNotEmpty() }
        val sample = when {
            preferred != null && (preferred in fromList || preferred == legacy) -> preferred
            preferred != null && EpcScheme.decodeArticuloCode(preferred) != null -> preferred
            else -> fromList.firstOrNull() ?: legacy
        } ?: return null
        val code = EpcScheme.decodeArticuloCode(sample)
            ?: EpcScheme.articuloCodeFromPatrimonial(numeroPatrimonial)
            ?: return null
        val prefix = EpcScheme.articuloPrefixHex(sample)
            ?: EpcScheme.articuloPrefixFromCode(code)
            ?: return null
        val stock = when {
            stockEtiquetas > 0 -> stockEtiquetas
            fromList.isNotEmpty() -> fromList.size
            else -> 1
        }
        return LocateTargetDto(
            activoId = id,
            numeroPatrimonial = numeroPatrimonial,
            descripcion = descripcion,
            epc = sample,
            articuloCode = code,
            locatePrefix = prefix,
            stockEtiquetas = stock,
        )
    }

    private fun ActivoDto.toLocateTarget(): LocateTargetDto? = toLocateTarget(preferredEpc = null)

    private fun CachedActivoEntity.toLocateTargetOrNull(): LocateTargetDto? {
        val sample = epc?.let { EpcScheme.normalize(it) }?.takeIf { it.isNotEmpty() } ?: return null
        val code = EpcScheme.decodeArticuloCode(sample)
            ?: EpcScheme.articuloCodeFromPatrimonial(numeroPatrimonial)
            ?: return null
        val prefix = EpcScheme.articuloPrefixHex(sample)
            ?: EpcScheme.articuloPrefixFromCode(code)
            ?: return null
        return LocateTargetDto(
            activoId = id.substringBefore(':'),
            numeroPatrimonial = numeroPatrimonial,
            descripcion = descripcion,
            epc = sample,
            articuloCode = code,
            locatePrefix = prefix,
            stockEtiquetas = 1,
        )
    }
}
