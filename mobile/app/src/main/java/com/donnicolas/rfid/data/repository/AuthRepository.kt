package com.donnicolas.rfid.data.repository

import com.donnicolas.rfid.data.api.AuthApi
import com.donnicolas.rfid.data.api.LoginRequestDto
import com.donnicolas.rfid.data.local.TokenStore
import com.donnicolas.rfid.data.model.AuthResult
import com.donnicolas.rfid.data.model.User
import retrofit2.HttpException
import java.io.IOException

class AuthRepository(
    private val authApi: AuthApi,
    private val tokenStore: TokenStore,
) {
    fun isLoggedIn(): Boolean = tokenStore.isLoggedIn()

    suspend fun login(email: String, password: String): AuthResult {
        return try {
            val token = authApi.login(LoginRequestDto(email = email.trim(), password = password))
            tokenStore.saveToken(token.accessToken)
            val me = authApi.me()
            AuthResult.Success(
                User(
                    id = me.id,
                    email = me.email,
                    nombre = me.nombre,
                    rol = me.rol,
                ),
            )
        } catch (e: HttpException) {
            tokenStore.clear()
            AuthResult.Error(messageFromHttp(e))
        } catch (e: IOException) {
            tokenStore.clear()
            AuthResult.Error("Sin conexión con la API")
        } catch (e: Exception) {
            tokenStore.clear()
            AuthResult.Error(e.message ?: "Error de autenticación")
        }
    }

    suspend fun currentUser(): AuthResult {
        if (!tokenStore.isLoggedIn()) {
            return AuthResult.Error("Sesión no iniciada")
        }
        return try {
            val me = authApi.me()
            AuthResult.Success(
                User(
                    id = me.id,
                    email = me.email,
                    nombre = me.nombre,
                    rol = me.rol,
                ),
            )
        } catch (e: HttpException) {
            if (e.code() == 401) {
                tokenStore.clear()
            }
            AuthResult.Error(messageFromHttp(e))
        } catch (e: IOException) {
            AuthResult.Error("Sin conexión con la API")
        } catch (e: Exception) {
            AuthResult.Error(e.message ?: "Error al obtener usuario")
        }
    }

    fun logout() {
        tokenStore.clear()
    }

    private fun messageFromHttp(e: HttpException): String {
        return when (e.code()) {
            401 -> "Credenciales inválidas"
            422 -> "Datos de login inválidos"
            else -> "Error HTTP ${e.code()}"
        }
    }
}
