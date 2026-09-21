package com.donnicolas.rfid.data.model

data class User(
    val id: String,
    val email: String,
    val nombre: String,
    val rol: String,
    /** Códigos de permiso del rol (ej. `assets.write`). Vacío si el backend no los envió. */
    val permisos: List<String> = emptyList(),
) {
    fun canWriteAssets(): Boolean = permisos.contains("assets.write")
}

/**
 * Error de aplicación con código estable y descripción accionable.
 * El [code] nunca debe ser genérico: identifica la causa exacta.
 */
data class AppError(
    val code: String,
    val title: String,
    val detail: String,
    val httpStatus: Int? = null,
    val endpoint: String? = null,
    val cause: String? = null,
) {
    fun displayMessage(): String = buildString {
        append("[$code] $title")
        append('\n')
        append(detail)
        if (httpStatus != null) {
            append("\nHTTP: $httpStatus")
        }
        if (!endpoint.isNullOrBlank()) {
            append("\nEndpoint: $endpoint")
        }
        if (!cause.isNullOrBlank()) {
            append("\nCausa técnica: $cause")
        }
    }
}

sealed class AuthResult {
    data class Success(val user: User) : AuthResult()
    data class Error(val error: AppError) : AuthResult()
}
