package com.donnicolas.rfid.data.api

import com.squareup.moshi.Json
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface WarehouseApi {
    @GET("depositos")
    suspend fun listDepositos(
        @Query("include_inactive") includeInactive: Boolean = false,
    ): List<DepositoDto>

    @GET("depositos/{id}/stock")
    suspend fun getStock(@Path("id") depositoId: String): StockDepositoDto
}

interface InventoryApi {
    @POST("inventarios")
    suspend fun create(@Body body: InventarioCreateDto): InventarioDto

    @GET("inventarios")
    suspend fun list(
        @Query("deposito_id") depositoId: String? = null,
        @Query("estado") estado: String? = null,
        @Query("limit") limit: Int = 50,
    ): List<InventarioListItemDto>

    @GET("inventarios/{id}")
    suspend fun get(@Path("id") id: String): InventarioDto

    @GET("inventarios/{id}/reporte")
    suspend fun reporte(@Path("id") id: String): InventarioReporteDto

    @POST("inventarios/{id}/lecturas")
    suspend fun registrarLecturas(
        @Path("id") id: String,
        @Body body: InventarioLecturasDto,
    ): InventarioDto

    @POST("inventarios/{id}/cerrar")
    suspend fun cerrar(
        @Path("id") id: String,
        @Body body: InventarioLecturasDto,
    ): InventarioDto

    @POST("inventarios/{id}/cancelar")
    suspend fun cancelar(@Path("id") id: String): InventarioDto
}

data class DepositoDto(
    val id: String,
    val nombre: String,
    val descripcion: String? = null,
    val direccion: String? = null,
    val activo: Boolean = true,
)

data class StockDepositoDto(
    @Json(name = "deposito_id") val depositoId: String,
    @Json(name = "deposito_nombre") val depositoNombre: String? = null,
    val total: Int = 0,
    val activos: List<StockActivoDto> = emptyList(),
)

data class StockActivoDto(
    @Json(name = "activo_id") val activoId: String? = null,
    @Json(name = "numero_patrimonial") val numeroPatrimonial: String? = null,
    val descripcion: String? = null,
    val epc: String? = null,
)

data class InventarioCreateDto(
    @Json(name = "deposito_id") val depositoId: String,
    @Json(name = "sector_id") val sectorId: String? = null,
    @Json(name = "ubicacion_id") val ubicacionId: String? = null,
)

data class InventarioLecturasDto(
    val epcs: List<String> = emptyList(),
)

data class InventarioListItemDto(
    val id: String,
    @Json(name = "deposito_id") val depositoId: String,
    @Json(name = "sector_id") val sectorId: String? = null,
    @Json(name = "ubicacion_id") val ubicacionId: String? = null,
    val estado: String,
    @Json(name = "total_esperado") val totalEsperado: Int = 0,
    @Json(name = "total_encontrado") val totalEncontrado: Int = 0,
    @Json(name = "total_faltante") val totalFaltante: Int = 0,
    @Json(name = "total_sobrante") val totalSobrante: Int = 0,
    /** Sobrantes de artículos que sí pertenecen al depósito (unidades de más). */
    @Json(name = "total_exceso") val totalExceso: Int = 0,
    @Json(name = "iniciado_en") val iniciadoEn: String? = null,
    @Json(name = "cerrado_en") val cerradoEn: String? = null,
    val auditado: Boolean = false,
    @Json(name = "auditado_en") val auditadoEn: String? = null,
) {
    /** Mismo criterio que backend y web: los ajenos no cuentan como discrepancia. */
    val tieneDiscrepancias: Boolean get() = totalFaltante > 0 || totalExceso > 0

    /** Sobrantes que no pertenecen al depósito (etiquetas de afuera). */
    val totalAjeno: Int get() = (totalSobrante - totalExceso).coerceAtLeast(0)
}

data class InventarioDto(
    val id: String,
    @Json(name = "deposito_id") val depositoId: String,
    @Json(name = "sector_id") val sectorId: String? = null,
    @Json(name = "ubicacion_id") val ubicacionId: String? = null,
    val estado: String,
    @Json(name = "total_esperado") val totalEsperado: Int = 0,
    @Json(name = "total_encontrado") val totalEncontrado: Int = 0,
    @Json(name = "total_faltante") val totalFaltante: Int = 0,
    @Json(name = "total_sobrante") val totalSobrante: Int = 0,
    @Json(name = "total_exceso") val totalExceso: Int = 0,
    val auditado: Boolean = false,
    val resumen: InventarioResumenDto? = null,
    val detalles: List<DetalleInventarioDto> = emptyList(),
)

data class InventarioResumenDto(
    @Json(name = "total_esperado") val totalEsperado: Int = 0,
    @Json(name = "total_encontrado") val totalEncontrado: Int = 0,
    @Json(name = "total_faltante") val totalFaltante: Int = 0,
    @Json(name = "total_sobrante") val totalSobrante: Int = 0,
    @Json(name = "total_exceso") val totalExceso: Int = 0,
    @Json(name = "sin_epc") val sinEpc: Int = 0,
)

data class DetalleInventarioDto(
    val id: String,
    @Json(name = "activo_id") val activoId: String? = null,
    val epc: String? = null,
    @Json(name = "numero_patrimonial") val numeroPatrimonial: String? = null,
    val descripcion: String? = null,
    val estado: String,
)

data class InventarioReporteDto(
    @Json(name = "inventario_id") val inventarioId: String,
    @Json(name = "deposito_id") val depositoId: String,
    val estado: String,
    val resumen: InventarioResumenDto,
    @Json(name = "coincidencia_pct") val coincidenciaPct: Double = 0.0,
    @Json(name = "tiene_discrepancias") val tieneDiscrepancias: Boolean = false,
    val auditado: Boolean = false,
    val encontrados: List<DetalleInventarioDto> = emptyList(),
    val faltantes: List<DetalleInventarioDto> = emptyList(),
    /** Sobrantes de artículos del depósito: unidades de más, sí son discrepancia. */
    val excesos: List<DetalleInventarioDto> = emptyList(),
    /** Sobrantes de artículos ajenos al depósito: se reportan, no son discrepancia. */
    val ajenos: List<DetalleInventarioDto> = emptyList(),
    val sobrantes: List<DetalleInventarioDto> = emptyList(),
    @Json(name = "sin_epc") val sinEpc: List<DetalleInventarioDto> = emptyList(),
)
