package com.donnicolas.rfid.data.repository

import android.util.Log
import com.donnicolas.rfid.BuildConfig
import com.donnicolas.rfid.data.api.ApiErrorMapper
import com.donnicolas.rfid.data.api.AuthApi
import com.donnicolas.rfid.data.api.LoginRequestDto
import com.donnicolas.rfid.data.local.TokenStore
import com.donnicolas.rfid.data.model.AppError
import com.donnicolas.rfid.data.model.AuthResult
import com.donnicolas.rfid.data.model.User

class AuthRepository(
    private val authApi: AuthApi,
    private val tokenStore: TokenStore,
    private val baseUrl: String = BuildConfig.API_BASE_URL,
) {
    fun isLoggedIn(): Boolean = tokenStore.isLoggedIn()

    suspend fun login(email: String, password: String): AuthResult {
        val trimmedEmail = email.trim()
        if (trimmedEmail.isEmpty()) {
            return AuthResult.Error(
                AppError(
                    code = "AUTH_EMAIL_REQUIRED",
                    title = "Email requerido",
                    detail = "El campo email está vacío. Ingresá un email válido para autenticarte.",
                    endpoint = fullEndpoint("auth/login"),
                ),
            )
        }
        if (password.isEmpty()) {
            return AuthResult.Error(
                AppError(
                    code = "AUTH_PASSWORD_REQUIRED",
                    title = "Contraseña requerida",
                    detail = "El campo contraseña está vacío. Ingresá la contraseña del usuario.",
                    endpoint = fullEndpoint("auth/login"),
                ),
            )
        }
        if (!trimmedEmail.contains("@")) {
            return AuthResult.Error(
                AppError(
                    code = "AUTH_EMAIL_FORMAT",
                    title = "Formato de email inválido",
                    detail = "El valor '$trimmedEmail' no parece un email válido. " +
                        "Usá el formato usuario@dominio (ej: admin@donnicolas.com).",
                    endpoint = fullEndpoint("auth/login"),
                ),
            )
        }

        return try {
            Log.i(TAG, "Login iniciado contra ${fullEndpoint("auth/login")} (base=$baseUrl)")
            val token = authApi.login(LoginRequestDto(email = trimmedEmail, password = password))
            if (token.accessToken.isBlank()) {
                return AuthResult.Error(
                    AppError(
                        code = "AUTH_EMPTY_TOKEN",
                        title = "Token vacío en respuesta de login",
                        detail = "La API aceptó el login pero devolvió access_token vacío. " +
                            "Revisá el endpoint POST /auth/login y la configuración JWT del backend.",
                        endpoint = fullEndpoint("auth/login"),
                    ),
                )
            }
            tokenStore.saveToken(token.accessToken)

            val me = try {
                authApi.me()
            } catch (e: Exception) {
                tokenStore.clear()
                val mapped = ApiErrorMapper.fromThrowable(
                    throwable = e,
                    operation = "obtener perfil post-login (/auth/me)",
                    baseUrl = baseUrl,
                    endpoint = "auth/me",
                )
                return AuthResult.Error(
                    mapped.copy(
                        code = if (mapped.code.startsWith("AUTH_") || mapped.code.startsWith("API_") || mapped.code.startsWith("NET_")) {
                            "AUTH_PROFILE_AFTER_LOGIN_${mapped.code}"
                        } else {
                            "AUTH_PROFILE_AFTER_LOGIN"
                        },
                        title = "Login OK pero falló /auth/me",
                        detail = "El token se obtuvo, pero no se pudo leer el perfil del usuario. ${mapped.detail}",
                    ),
                )
            }

            AuthResult.Success(
                User(
                    id = me.id,
                    email = me.email,
                    nombre = me.nombre,
                    rol = me.rol,
                    permisos = me.permisos,
                ),
            )
        } catch (e: Exception) {
            tokenStore.clear()
            val error = ApiErrorMapper.fromThrowable(
                throwable = e,
                operation = "login",
                baseUrl = baseUrl,
                endpoint = "auth/login",
            )
            Log.e(TAG, error.displayMessage(), e)
            AuthResult.Error(error)
        }
    }

    suspend fun currentUser(): AuthResult {
        if (!tokenStore.isLoggedIn()) {
            return AuthResult.Error(
                AppError(
                    code = "AUTH_NO_SESSION",
                    title = "Sesión no iniciada",
                    detail = "No hay access_token guardado en el dispositivo. Debés iniciar sesión.",
                    endpoint = fullEndpoint("auth/me"),
                ),
            )
        }
        return try {
            val me = authApi.me()
            AuthResult.Success(
                User(
                    id = me.id,
                    email = me.email,
                    nombre = me.nombre,
                    rol = me.rol,
                    permisos = me.permisos,
                ),
            )
        } catch (e: Exception) {
            val error = ApiErrorMapper.fromThrowable(
                throwable = e,
                operation = "restaurar sesión (/auth/me)",
                baseUrl = baseUrl,
                endpoint = "auth/me",
            )
            if (error.httpStatus == 401) {
                tokenStore.clear()
            }
            Log.e(TAG, error.displayMessage(), e)
            AuthResult.Error(error)
        }
    }

    fun logout() {
        tokenStore.clear()
    }

    private fun fullEndpoint(path: String): String {
        val base = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"
        return base + path.removePrefix("/")
    }

    companion object {
        private const val TAG = "DonNicolasAuth"
    }
}
