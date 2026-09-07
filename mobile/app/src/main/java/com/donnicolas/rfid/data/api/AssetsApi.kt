package com.donnicolas.rfid.data.api

import com.squareup.moshi.Json
import retrofit2.http.GET
import retrofit2.http.Path

interface AssetsApi {
    @GET("activos/by-epc/{epc}")
    suspend fun lookupByEpc(@Path("epc") epc: String): ActivoLookupDto
}

data class ActivoLookupDto(
    val encontrado: Boolean,
    @Json(name = "epc_consultado") val epcConsultado: String,
    val activo: ActivoDto? = null,
    val ubicacion: ActivoUbicacionDto? = null,
    val mensaje: String? = null,
)

data class ActivoDto(
    val id: String,
    @Json(name = "numero_patrimonial") val numeroPatrimonial: String,
    val descripcion: String,
    val epc: String? = null,
    val activo: Boolean = true,
    val categoria: CategoriaDto? = null,
)

data class CategoriaDto(
    val id: String,
    val nombre: String,
)

data class ActivoUbicacionDto(
    @Json(name = "ubicacion_id") val ubicacionId: String,
    @Json(name = "ubicacion_codigo") val ubicacionCodigo: String,
    @Json(name = "sector_id") val sectorId: String,
    @Json(name = "sector_nombre") val sectorNombre: String,
    @Json(name = "deposito_id") val depositoId: String,
    @Json(name = "deposito_nombre") val depositoNombre: String,
)
