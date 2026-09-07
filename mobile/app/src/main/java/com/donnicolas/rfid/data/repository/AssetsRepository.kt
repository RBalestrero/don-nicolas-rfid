package com.donnicolas.rfid.data.repository

import com.donnicolas.rfid.BuildConfig
import com.donnicolas.rfid.data.api.ActivoLookupDto
import com.donnicolas.rfid.data.api.ApiErrorMapper
import com.donnicolas.rfid.data.api.AssetsApi
import com.donnicolas.rfid.data.model.AppError

sealed class AssetResult<out T> {
    data class Ok<T>(val value: T) : AssetResult<T>()
    data class Error(val error: AppError) : AssetResult<Nothing>()
}

class AssetsRepository(
    private val assetsApi: AssetsApi,
    private val baseUrl: String = BuildConfig.API_BASE_URL,
) {
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
}
