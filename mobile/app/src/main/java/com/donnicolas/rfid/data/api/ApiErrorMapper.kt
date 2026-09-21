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
        val url = fullUrl(baseUrl, endpoint)
        return when (throwable) {
            is HttpException -> fromHttp(throwable, operation, baseUrl, endpoint)
            is UnknownHostException -> AppError(
                code = "NET_UNKNOWN_HOST",
                title = "No se encontró el servidor",
                detail = "Revisá la IP del servidor y que el MC33 esté en la misma Wi‑Fi.",
                endpoint = url,
                cause = "Host no resuelve · $operation · $url · ${throwable.message}",
            )
            is ConnectException -> AppError(
                code = "NET_CONNECTION_REFUSED",
                title = "No se pudo conectar al servidor",
                detail = "Revisá la IP del servidor y que esté en la misma Wi‑Fi.",
                endpoint = url,
                cause = "Conexión rechazada · $operation · $url · ${throwable.message}",
            )
            is SocketTimeoutException, is TimeoutException -> AppError(
                code = "NET_TIMEOUT",
                title = "El servidor no respondió",
                detail = "Reintentá en unos segundos. Si sigue fallando, revisá la Wi‑Fi.",
                endpoint = url,
                cause = "Timeout · $operation · $url · ${throwable.message}",
            )
            is SSLException -> AppError(
                code = "NET_SSL",
                title = "Error de conexión segura",
                detail = "No se pudo establecer una conexión segura con el servidor.",
                endpoint = url,
                cause = "TLS/SSL · $operation · $url · ${throwable.message}",
            )
            is JsonDataException, is JsonEncodingException, is EOFException -> AppError(
                code = "API_RESPONSE_PARSE",
                title = "Respuesta inesperada del servidor",
                detail = "La app no pudo interpretar la respuesta. Reintentá o avisá a sistemas.",
                endpoint = url,
                cause = "Parse · $operation · $url · ${throwable.message}",
            )
            is IOException -> AppError(
                code = "NET_IO",
                title = "Problema de red",
                detail = "Se cortó la comunicación. Revisá la Wi‑Fi e intentá de nuevo.",
                endpoint = url,
                cause = "${throwable.javaClass.simpleName} · $operation · $url · ${throwable.message}",
            )
            else -> AppError(
                code = "APP_UNEXPECTED",
                title = "Algo salió mal",
                detail = "Reintentá. Si el problema continúa, avisá a sistemas.",
                endpoint = url,
                cause = "${throwable.javaClass.name} · $operation · ${throwable.message ?: throwable}",
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
        val isLogin = endpoint.contains("auth/login")
        val serverHint = serverDetail?.takeIf { it.isNotBlank() && it.length <= 120 }

        val mapped = when (status) {
            400 -> AppError(
                code = "API_BAD_REQUEST",
                title = if (isLogin) "Datos de ingreso inválidos" else "Datos inválidos",
                detail = serverHint
                    ?: if (isLogin) {
                        "Revisá email, contraseña e IP del servidor."
                    } else {
                        "Revisá los datos e intentá de nuevo."
                    },
                httpStatus = status,
                endpoint = url,
                cause = techCause(status, operation, url, rawBody, serverDetail),
            )
            401 -> if (isLogin) {
                AppError(
                    code = "AUTH_INVALID_CREDENTIALS",
                    title = "Email o contraseña incorrectos",
                    detail = "Verificá tus datos e intentá de nuevo.",
                    httpStatus = status,
                    endpoint = url,
                    cause = techCause(status, operation, url, rawBody, serverDetail),
                )
            } else {
                AppError(
                    code = "AUTH_SESSION_EXPIRED",
                    title = "Sesión expirada",
                    detail = "Volvé a iniciar sesión para continuar.",
                    httpStatus = status,
                    endpoint = url,
                    cause = techCause(status, operation, url, rawBody, serverDetail),
                )
            }
            403 -> AppError(
                code = "AUTH_FORBIDDEN",
                title = "Sin permiso",
                detail = serverHint
                    ?: "Tu usuario no puede realizar esta acción. Pedí acceso a un administrador.",
                httpStatus = status,
                endpoint = url,
                cause = techCause(status, operation, url, rawBody, serverDetail),
            )
            404 -> AppError(
                code = "API_ENDPOINT_NOT_FOUND",
                title = "No se encontró el recurso",
                detail = "Puede que se haya borrado o la IP apunte a otro servidor. Revisá la IP.",
                httpStatus = status,
                endpoint = url,
                cause = techCause(status, operation, url, rawBody, serverDetail),
            )
            409 -> AppError(
                code = "API_CONFLICT",
                title = "El estado cambió en el servidor",
                detail = serverHint
                    ?: "El inventario pudo cerrarse o cancelarse en otro lado. Actualizá la lista.",
                httpStatus = status,
                endpoint = url,
                cause = techCause(status, operation, url, rawBody, serverDetail),
            )
            422 -> AppError(
                code = "API_VALIDATION",
                title = "Datos no válidos",
                detail = serverHint ?: "Revisá los datos enviados e intentá de nuevo.",
                httpStatus = status,
                endpoint = url,
                cause = techCause(status, operation, url, rawBody, serverDetail),
            )
            500 -> AppError(
                code = "API_INTERNAL_ERROR",
                title = "Error en el servidor",
                detail = "Reintentá en unos segundos. Si sigue fallando, avisá a sistemas.",
                httpStatus = status,
                endpoint = url,
                cause = techCause(status, operation, url, rawBody, serverDetail),
            )
            502, 503, 504 -> AppError(
                code = "API_UNAVAILABLE",
                title = "Servidor no disponible",
                detail = "El servidor está caído o reiniciando. Reintentá en unos minutos.",
                httpStatus = status,
                endpoint = url,
                cause = techCause(status, operation, url, rawBody, serverDetail),
            )
            else -> AppError(
                code = "API_HTTP_$status",
                title = "Respuesta inesperada del servidor",
                detail = serverHint ?: "Reintentá. Si el problema continúa, avisá a sistemas.",
                httpStatus = status,
                endpoint = url,
                cause = techCause(status, operation, url, rawBody, serverDetail),
            )
        }

        return if (!serverCode.isNullOrBlank()) {
            mapped.copy(code = serverCode)
        } else {
            mapped
        }
    }

    private fun techCause(
        status: Int,
        operation: String,
        url: String,
        rawBody: String,
        serverDetail: String?,
    ): String {
        val body = rawBody.ifBlank { serverDetail.orEmpty() }.take(300)
        return "HTTP $status · $operation · $url" +
            if (body.isNotBlank()) " · $body" else ""
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

    private fun fullUrl(baseUrl: String, endpoint: String): String {
        val base = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"
        val path = endpoint.removePrefix("/")
        return base + path
    }
}
