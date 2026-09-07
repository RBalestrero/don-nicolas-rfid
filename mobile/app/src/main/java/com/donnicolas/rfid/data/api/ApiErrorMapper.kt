package com.donnicolas.rfid.data.api

import com.donnicolas.rfid.data.model.AppError
import com.squareup.moshi.JsonDataException
import com.squareup.moshi.JsonEncodingException
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import retrofit2.HttpException
import java.io.EOFException
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.util.concurrent.TimeoutException
import javax.net.ssl.SSLException

object ApiErrorMapper {
    private val moshi: Moshi = Moshi.Builder()
        .add(KotlinJsonAdapterFactory())
        .build()

    fun fromThrowable(
        throwable: Throwable,
        operation: String,
        baseUrl: String,
        endpoint: String,
    ): AppError {
        return when (throwable) {
            is HttpException -> fromHttp(throwable, operation, baseUrl, endpoint)
            is UnknownHostException -> AppError(
                code = "NET_UNKNOWN_HOST",
                title = "Host de API inaccesible",
                detail = "No se pudo resolver el host de la API durante $operation. " +
                    "Verificá que la URL base sea correcta y que el dispositivo/emulador " +
                    "pueda alcanzar esa red. URL base configurada: $baseUrl",
                endpoint = fullUrl(baseUrl, endpoint),
                cause = throwable.message,
            )
            is ConnectException -> AppError(
                code = "NET_CONNECTION_REFUSED",
                title = "Conexión rechazada por la API",
                detail = "El servidor rechazó la conexión TCP durante $operation. " +
                    "La API no está escuchando o el puerto/firewall bloquea el acceso. " +
                    "En Wi‑Fi configurá api.host=<IP-LAN-PC> en mobile/local.properties " +
                    "(misma red que el MC33). Emulador: 10.0.2.2. URL base: $baseUrl. " +
                    "También confirmá que Postgres y la API estén levantados.",
                endpoint = fullUrl(baseUrl, endpoint),
                cause = throwable.message,
            )
            is SocketTimeoutException, is TimeoutException -> AppError(
                code = "NET_TIMEOUT",
                title = "Tiempo de espera agotado",
                detail = "La API no respondió a tiempo durante $operation. " +
                    "Puede estar caída, saturada o la red es inestable. URL: ${fullUrl(baseUrl, endpoint)}",
                endpoint = fullUrl(baseUrl, endpoint),
                cause = throwable.message,
            )
            is SSLException -> AppError(
                code = "NET_SSL",
                title = "Falla de seguridad TLS/SSL",
                detail = "Falló el handshake TLS durante $operation. " +
                    "Si usás HTTP en desarrollo, confirmá cleartextTraffic y networkSecurityConfig. " +
                    "URL: ${fullUrl(baseUrl, endpoint)}",
                endpoint = fullUrl(baseUrl, endpoint),
                cause = throwable.message,
            )
            is JsonDataException, is JsonEncodingException, is EOFException -> AppError(
                code = "API_RESPONSE_PARSE",
                title = "Respuesta de API inválida",
                detail = "La respuesta JSON de $operation no coincide con el contrato esperado. " +
                    "Puede ser un endpoint incorrecto, un proxy intermedio o una versión vieja de la API. " +
                    "URL: ${fullUrl(baseUrl, endpoint)}",
                endpoint = fullUrl(baseUrl, endpoint),
                cause = throwable.message,
            )
            is IOException -> AppError(
                code = "NET_IO",
                title = "Error de red (I/O)",
                detail = "Falló la comunicación de red durante $operation. " +
                    "Detalle del sistema: ${throwable.javaClass.simpleName}. " +
                    "URL: ${fullUrl(baseUrl, endpoint)}",
                endpoint = fullUrl(baseUrl, endpoint),
                cause = throwable.message,
            )
            else -> AppError(
                code = "APP_UNEXPECTED",
                title = "Error inesperado en la app",
                detail = "Ocurrió una excepción no clasificada durante $operation " +
                    "(${throwable.javaClass.name}). Revisá logs de Logcat con el tag DonNicolasAuth.",
                endpoint = fullUrl(baseUrl, endpoint),
                cause = throwable.message ?: throwable.toString(),
            )
        }
    }

    private fun fromHttp(
        exception: HttpException,
        operation: String,
        baseUrl: String,
        endpoint: String,
    ): AppError {
        val status = exception.code()
        val rawBody = exception.response()?.errorBody()?.string().orEmpty()
        val (serverCode, serverDetail) = extractServerDetail(rawBody)
        val url = fullUrl(baseUrl, endpoint)

        val mapped = when (status) {
            400 -> AppError(
                code = "AUTH_BAD_REQUEST",
                title = "Solicitud de login inválida",
                detail = "La API rechazó el cuerpo del login (HTTP 400). " +
                    serverDetailOrFallback(serverDetail, "Revisá formato de email/password."),
                httpStatus = status,
                endpoint = url,
                cause = rawBody.ifBlank { null },
            )
            401 -> AppError(
                code = "AUTH_INVALID_CREDENTIALS",
                title = "Credenciales inválidas",
                detail = "Email o contraseña incorrectos (HTTP 401) en $operation. " +
                    serverDetailOrFallback(
                        serverDetail,
                        "Usuario seed de desarrollo: admin@donnicolas.com / admin123",
                    ),
                httpStatus = status,
                endpoint = url,
                cause = rawBody.ifBlank { null },
            )
            403 -> AppError(
                code = "AUTH_FORBIDDEN",
                title = "Acceso denegado",
                detail = "La API denegó el acceso (HTTP 403) durante $operation. " +
                    serverDetailOrFallback(serverDetail, "El usuario no tiene permisos suficientes."),
                httpStatus = status,
                endpoint = url,
                cause = rawBody.ifBlank { null },
            )
            404 -> AppError(
                code = "API_ENDPOINT_NOT_FOUND",
                title = "Endpoint no encontrado",
                detail = "La ruta de $operation no existe (HTTP 404). " +
                    "Verificá API_BASE_URL y que el backend esté en la versión correcta. " +
                    "URL llamada: $url",
                httpStatus = status,
                endpoint = url,
                cause = rawBody.ifBlank { null },
            )
            422 -> AppError(
                code = "AUTH_VALIDATION",
                title = "Validación de login fallida",
                detail = "La API reportó errores de validación (HTTP 422) en $operation. " +
                    serverDetailOrFallback(
                        serverDetail,
                        "El email debe ser válido y la contraseña no puede estar vacía.",
                    ),
                httpStatus = status,
                endpoint = url,
                cause = rawBody.ifBlank { null },
            )
            500 -> AppError(
                code = "API_INTERNAL_ERROR",
                title = "Error interno del servidor",
                detail = "La API respondió HTTP 500 durante $operation. " +
                    "Causa frecuente: PostgreSQL caído o migraciones pendientes. " +
                    "Revisá health en /api/v1/health (database debe ser 'connected'). " +
                    serverDetailOrFallback(serverDetail, "Sin detalle adicional del servidor."),
                httpStatus = status,
                endpoint = url,
                cause = rawBody.ifBlank { null },
            )
            502, 503, 504 -> AppError(
                code = "API_UNAVAILABLE",
                title = "API no disponible",
                detail = "La API no está operativa (HTTP $status) durante $operation. " +
                    serverDetailOrFallback(
                        serverDetail,
                        "Levantá Postgres (`docker compose up -d postgres`) y la API (`bash scripts/dev-api.sh`).",
                    ),
                httpStatus = status,
                endpoint = url,
                cause = rawBody.ifBlank { null },
            )
            else -> AppError(
                code = "API_HTTP_$status",
                title = "Respuesta HTTP inesperada",
                detail = "La API respondió HTTP $status durante $operation. " +
                    serverDetailOrFallback(serverDetail, "Sin detalle adicional del servidor."),
                httpStatus = status,
                endpoint = url,
                cause = rawBody.ifBlank { null },
            )
        }

        return if (!serverCode.isNullOrBlank()) {
            mapped.copy(code = serverCode)
        } else {
            mapped
        }
    }

    private fun extractServerDetail(rawBody: String): Pair<String?, String?> {
        if (rawBody.isBlank()) return null to null
        return try {
            val mapType = Types.newParameterizedType(
                Map::class.java,
                String::class.java,
                Any::class.java,
            )
            val adapter = moshi.adapter<Map<String, Any>>(mapType)
            val parsed = adapter.fromJson(rawBody) ?: return null to rawBody
            when (val detail = parsed["detail"]) {
                is String -> parsed["code"]?.toString() to detail
                is Map<*, *> -> {
                    val code = detail["code"]?.toString() ?: parsed["code"]?.toString()
                    val message = detail["message"]?.toString()
                        ?: detail["detail"]?.toString()
                        ?: detail.toString()
                    code to message
                }
                is List<*> -> {
                    null to detail.joinToString("; ") { item ->
                        when (item) {
                            is Map<*, *> -> {
                                val loc = (item["loc"] as? List<*>)?.joinToString(".") ?: "?"
                                val msg = item["msg"]?.toString() ?: item.toString()
                                "$loc: $msg"
                            }
                            else -> item.toString()
                        }
                    }
                }
                null -> {
                    val code = parsed["code"]?.toString()
                    val message = parsed["message"]?.toString() ?: parsed.toString()
                    code to message
                }
                else -> null to detail.toString()
            }
        } catch (_: Exception) {
            null to rawBody.take(500)
        }
    }

    private fun serverDetailOrFallback(serverDetail: String?, fallback: String): String {
        return if (serverDetail.isNullOrBlank()) fallback else "Detalle del servidor: $serverDetail"
    }

    private fun fullUrl(baseUrl: String, endpoint: String): String {
        val base = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"
        val path = endpoint.removePrefix("/")
        return base + path
    }
}
