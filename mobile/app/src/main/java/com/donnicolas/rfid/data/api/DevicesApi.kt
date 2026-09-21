package com.donnicolas.rfid.data.api

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.Body
import retrofit2.http.POST

@JsonClass(generateAdapter = true)
data class DispositivoRegistroRequestDto(
    @Json(name = "device_key") val deviceKey: String,
    val modelo: String,
    val fabricante: String? = null,
    @Json(name = "numero_serie") val numeroSerie: String? = null,
    @Json(name = "app_version") val appVersion: String? = null,
    @Json(name = "android_version") val androidVersion: String? = null,
)

@JsonClass(generateAdapter = true)
data class DispositivoHeartbeatRequestDto(
    @Json(name = "device_key") val deviceKey: String,
)

@JsonClass(generateAdapter = true)
data class DispositivoLogoutRequestDto(
    @Json(name = "device_key") val deviceKey: String,
)

@JsonClass(generateAdapter = true)
data class DispositivoMovilDto(
    val id: String,
    @Json(name = "device_key") val deviceKey: String,
    val modelo: String,
    val fabricante: String? = null,
    @Json(name = "numero_serie") val numeroSerie: String? = null,
    @Json(name = "en_linea") val enLinea: Boolean = false,
)

interface DevicesApi {
    @POST("dispositivos/registro")
    suspend fun registro(@Body body: DispositivoRegistroRequestDto): DispositivoMovilDto

    @POST("dispositivos/heartbeat")
    suspend fun heartbeat(@Body body: DispositivoHeartbeatRequestDto): DispositivoMovilDto

    @POST("dispositivos/logout")
    suspend fun logout(@Body body: DispositivoLogoutRequestDto): DispositivoMovilDto?
}
