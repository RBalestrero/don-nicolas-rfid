package com.donnicolas.rfid.data.repository

import com.donnicolas.rfid.BuildConfig
import com.donnicolas.rfid.data.api.ActivoDto
import com.donnicolas.rfid.data.api.ActivoLookupDto
import com.donnicolas.rfid.data.api.ApiErrorMapper
import com.donnicolas.rfid.data.api.AssetsApi
import com.donnicolas.rfid.data.api.CategoriaDto
import com.donnicolas.rfid.data.local.db.CachedActivoDao
import com.donnicolas.rfid.data.local.db.CachedActivoEntity
import com.donnicolas.rfid.data.model.AppError

sealed class AssetResult<out T> {
    data class Ok<T>(val value: T) : AssetResult<T>()
    data class Error(val error: AppError) : AssetResult<Nothing>()
}

class AssetsRepository(
    private val assetsApi: AssetsApi,
    private val cachedActivoDao: CachedActivoDao,
    private val baseUrl: String = BuildConfig.API_BASE_URL,
) {
    suspend fun searchActivosConEpc(query: String): AssetResult<List<ActivoDto>> {
        val q = query.trim()
        return try {
            val remote = assetsApi.listActivos(
                search = q.takeIf { it.isNotEmpty() },
                includeInactive = false,
            )
            val withEpc = remote.filter { !it.epc.isNullOrBlank() && it.activo }
            val now = System.currentTimeMillis()
            cachedActivoDao.upsertAll(
                withEpc.map {
                    CachedActivoEntity(
                        id = it.id,
                        numeroPatrimonial = it.numeroPatrimonial,
                        descripcion = it.descripcion,
                        epc = it.epc?.trim()?.uppercase(),
                        categoriaNombre = it.categoria?.nombre,
                        activo = it.activo,
                        cachedAtMs = now,
                    )
                },
            )
            AssetResult.Ok(withEpc)
        } catch (e: Exception) {
            val cached = cachedActivoDao.searchWithEpc(q).map { it.toDto() }
            if (cached.isNotEmpty()) {
                AssetResult.Ok(cached)
            } else {
                AssetResult.Error(
                    ApiErrorMapper.fromThrowable(
                        throwable = e,
                        operation = "listar activos",
                        baseUrl = baseUrl,
                        endpoint = "activos",
                    ),
                )
            }
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

    private fun CachedActivoEntity.toDto() = ActivoDto(
        id = id,
        numeroPatrimonial = numeroPatrimonial,
        descripcion = descripcion,
        epc = epc,
        activo = activo,
        categoria = categoriaNombre?.let { CategoriaDto(id = "cached", nombre = it) },
    )
}
