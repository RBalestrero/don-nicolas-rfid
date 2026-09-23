package com.donnicolas.rfid.data.api

import com.squareup.moshi.Json
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface AssetsApi {
    @GET("activos")
    suspend fun listActivos(
        @Query("search") search: String? = null,
        @Query("include_inactive") includeInactive: Boolean = false,
    ): List<ActivoDto>

    @POST("activos")
    suspend fun createActivo(@Body body: ActivoCreateDto): ActivoDto

    @GET("categorias")
    suspend fun listCategorias(
        @Query("include_inactive") includeInactive: Boolean = false,
    ): List<CategoriaDto>

    @GET("activos/by-epc/{epc}")
    suspend fun lookupByEpc(@Path("epc") epc: String): ActivoLookupDto

    @GET("activos/by-serie-fisica/{serie}")
    suspend fun lookupBySerieFisica(@Path("serie") serie: String): ActivoLookupSerieDto

    @POST("activos/lookup-epcs")
    suspend fun lookupByEpcs(@Body body: ActivoLookupEpcsRequest): ActivoLookupEpcsDto

    @GET("etiquetas")
    suspend fun listEtiquetas(
        @Query("activo_id") activoId: String? = null,
        @Query("search") search: String? = null,
    ): List<EtiquetaDto>

    @POST("activos/{activo_id}/etiquetas")
    suspend fun crearEtiquetas(
        @Path("activo_id") activoId: String,
        @Body body: EtiquetaLoteRequestDto,
    ): EtiquetaLoteDto

    @POST("activos/{activo_id}/imprimir-etiquetas")
    suspend fun imprimirEtiquetas(
        @Path("activo_id") activoId: String,
        @Body body: EtiquetaLoteRequestDto,
    ): EtiquetaLoteDto

    @GET("activos/{activo_id}/ubicaciones-stock")
    suspend fun listUbicacionesStock(
        @Path("activo_id") activoId: String,
    ): List<ActivoUbicacionStockDto>
}

data class ActivoLookupEpcsRequest(
    val epcs: List<String>,
)

data class ActivoLookupEpcsDto(
    val consultados: Int,
    val encontrados: List<ActivoLookupDto> = emptyList(),
    @Json(name = "no_registrados") val noRegistrados: List<String> = emptyList(),
)

data class ActivoLookupDto(
    val encontrado: Boolean,
    @Json(name = "epc_consultado") val epcConsultado: String,
    val activo: ActivoDto? = null,
    val ubicacion: ActivoUbicacionDto? = null,
    val mensaje: String? = null,
)

data class ActivoLookupSerieDto(
    val encontrado: Boolean,
    @Json(name = "serie_consultada") val serieConsultada: String,
    val activo: ActivoDto? = null,
    @Json(name = "etiqueta_id") val etiquetaId: String? = null,
    val epc: String? = null,
    val ubicacion: ActivoUbicacionDto? = null,
    val mensaje: String? = null,
)

data class EtiquetaDto(
    val id: String,
    @Json(name = "activo_id") val activoId: String,
    val epc: String,
    @Json(name = "serial_hex") val serialHex: String? = null,
    @Json(name = "serie_fisica") val serieFisica: String? = null,
    val estado: String = "activa",
    val impresa: Boolean = false,
    @Json(name = "numero_patrimonial") val numeroPatrimonial: String? = null,
    val descripcion: String? = null,
)

data class ActivoDto(
    val id: String,
    @Json(name = "numero_patrimonial") val numeroPatrimonial: String,
    val descripcion: String,
    val epc: String? = null,
    val activo: Boolean = true,
    val serializado: Boolean = false,
    val categoria: CategoriaDto? = null,
    @Json(name = "stock_etiquetas") val stockEtiquetas: Int = 0,
    /** Unidades RFID (etiquetas activas). */
    val epcs: List<String> = emptyList(),
)

data class ActivoCreateDto(
    @Json(name = "numero_patrimonial") val numeroPatrimonial: String,
    val descripcion: String,
    @Json(name = "categoria_id") val categoriaId: String,
    @Json(name = "ubicacion_id") val ubicacionId: String? = null,
    val serializado: Boolean = false,
)

data class CategoriaDto(
    val id: String,
    val nombre: String,
    val activa: Boolean = true,
)

data class EtiquetaLoteRequestDto(
    val cantidad: Int,
    val modo: String = "nueva",
    @Json(name = "series_fisicas") val seriesFisicas: List<String>? = null,
)

data class EtiquetaLoteItemDto(
    val id: String,
    val epc: String,
    @Json(name = "serial_hex") val serialHex: String? = null,
    @Json(name = "serie_fisica") val serieFisica: String? = null,
)

data class EtiquetaLoteDto(
    @Json(name = "activo_id") val activoId: String,
    @Json(name = "numero_patrimonial") val numeroPatrimonial: String,
    val descripcion: String,
    val cantidad: Int,
    @Json(name = "stock_etiquetas") val stockEtiquetas: Int = 0,
    val etiquetas: List<EtiquetaLoteItemDto> = emptyList(),
    val impreso: Boolean = false,
    @Json(name = "modo_simulacion") val modoSimulacion: Boolean = false,
    val zpl: String? = null,
)

data class ActivoUbicacionDto(
    @Json(name = "ubicacion_id") val ubicacionId: String,
    @Json(name = "ubicacion_codigo") val ubicacionCodigo: String,
    @Json(name = "sector_id") val sectorId: String,
    @Json(name = "sector_nombre") val sectorNombre: String,
    @Json(name = "deposito_id") val depositoId: String,
    @Json(name = "deposito_nombre") val depositoNombre: String,
)

data class ActivoUbicacionStockDto(
    @Json(name = "deposito_id") val depositoId: String,
    @Json(name = "deposito_nombre") val depositoNombre: String,
    @Json(name = "sector_id") val sectorId: String,
    @Json(name = "sector_nombre") val sectorNombre: String,
    @Json(name = "ubicacion_id") val ubicacionId: String,
    @Json(name = "ubicacion_codigo") val ubicacionCodigo: String,
    val cantidad: Int = 0,
)

/**
 * Modo de localización: artículo (cualquier unidad) o serial (EPC exacto).
 */
enum class LocateMode {
    ARTICULO,
    SERIAL,
}

/**
 * Target a localizar.
 * `epc` es la muestra D1…: en ARTICULO deriva el prefijo; en SERIAL es el EPC exacto.
 */
data class LocateTargetDto(
    val activoId: String,
    val numeroPatrimonial: String,
    val descripcion: String,
    val epc: String,
    val articuloCode: Long,
    val locatePrefix: String,
    val stockEtiquetas: Int = 1,
    val locateMode: LocateMode = LocateMode.ARTICULO,
    val serieFisica: String? = null,
) {
    val title: String
        get() = when (locateMode) {
            LocateMode.SERIAL -> {
                val sn = serieFisica?.takeIf { it.isNotBlank() }
                if (sn != null) "S/N $sn" else numeroPatrimonial
            }
            LocateMode.ARTICULO -> if (stockEtiquetas > 1) {
                "$numeroPatrimonial · $stockEtiquetas u."
            } else {
                numeroPatrimonial
            }
        }

    val subtitle: String
        get() = when (locateMode) {
            LocateMode.SERIAL -> {
                val sn = serieFisica?.takeIf { it.isNotBlank() }
                if (sn != null) "$numeroPatrimonial · $descripcion" else descripcion
            }
            LocateMode.ARTICULO -> descripcion
        }
}
