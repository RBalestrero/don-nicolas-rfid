package com.donnicolas.rfid.data.repository

import com.donnicolas.rfid.data.api.AuthApi
import com.donnicolas.rfid.data.api.LoginRequestDto
import com.donnicolas.rfid.data.api.TokenResponseDto
import com.donnicolas.rfid.data.api.UserResponseDto
import com.donnicolas.rfid.data.local.TokenStore
import com.donnicolas.rfid.data.model.AuthResult
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import retrofit2.HttpException
import retrofit2.Response
import java.net.ConnectException

class AuthRepositoryTest {
    private lateinit var authApi: AuthApi
    private lateinit var tokenStore: TokenStore
    private lateinit var repository: AuthRepository

    @Before
    fun setup() {
        authApi = mock()
        tokenStore = mock()
        repository = AuthRepository(
            authApi = authApi,
            tokenStore = tokenStore,
            baseUrl = "http://10.0.2.2:8000/api/v1/",
        )
    }

    @Test
    fun `login exitoso guarda token y retorna usuario`() = runTest {
        whenever(authApi.login(any())).thenReturn(
            TokenResponseDto(accessToken = "jwt-token"),
        )
        whenever(authApi.me()).thenReturn(
            UserResponseDto(
                id = "1",
                email = "admin@donnicolas.com",
                nombre = "Admin",
                rol = "admin",
            ),
        )

        val result = repository.login("admin@donnicolas.com", "admin123")

        assertTrue(result is AuthResult.Success)
        val user = (result as AuthResult.Success).user
        assertEquals("Admin", user.nombre)
        assertEquals("admin", user.rol)
        verify(tokenStore).saveToken("jwt-token")
        verify(authApi).login(LoginRequestDto("admin@donnicolas.com", "admin123"))
    }

    @Test
    fun `login con credenciales invalidas expone codigo AUTH_INVALID_CREDENTIALS`() = runTest {
        val body = """{"detail":{"code":"AUTH_INVALID_CREDENTIALS","message":"Credenciales inválidas: email o contraseña incorrectos"}}"""
            .toResponseBody("application/json".toMediaType())
        whenever(authApi.login(any())).thenThrow(
            HttpException(Response.error<Any>(401, body)),
        )

        val result = repository.login("admin@donnicolas.com", "wrong")

        assertTrue(result is AuthResult.Error)
        val error = (result as AuthResult.Error).error
        assertEquals("AUTH_INVALID_CREDENTIALS", error.code)
        assertEquals("Email o contraseña incorrectos", error.title)
        assertTrue(error.detail.contains("Verificá", ignoreCase = true))
        assertEquals(401, error.httpStatus)
        verify(tokenStore).clear()
        verify(tokenStore, never()).saveToken(any())
    }

    @Test
    fun `login con conexion rechazada expone NET_CONNECTION_REFUSED`() = runTest {
        whenever(authApi.login(any())).thenAnswer {
            throw ConnectException("Failed to connect to /10.0.2.2:8000")
        }

        val result = repository.login("admin@donnicolas.com", "admin123")

        assertTrue(result is AuthResult.Error)
        val error = (result as AuthResult.Error).error
        assertEquals("NET_CONNECTION_REFUSED", error.code)
        assertEquals("No se pudo conectar al servidor", error.title)
        assertTrue(error.detail.contains("Wi‑Fi") || error.detail.contains("IP"))
        assertTrue(error.cause.orEmpty().contains("10.0.2.2:8000") || error.endpoint!!.contains("auth/login"))
        assertTrue(error.endpoint!!.contains("auth/login"))
    }

    @Test
    fun `login con API 503 por DB caida usa codigo del servidor`() = runTest {
        val body = """{"code":"DB_CONNECTION_FAILED","detail":"No se pudo conectar a PostgreSQL."}"""
            .toResponseBody("application/json".toMediaType())
        whenever(authApi.login(any())).thenThrow(
            HttpException(Response.error<Any>(503, body)),
        )

        val result = repository.login("admin@donnicolas.com", "admin123")

        assertTrue(result is AuthResult.Error)
        val error = (result as AuthResult.Error).error
        assertEquals("DB_CONNECTION_FAILED", error.code)
        assertEquals(503, error.httpStatus)
        assertEquals("Servidor no disponible", error.title)
        assertTrue(
            error.detail.contains("caído", ignoreCase = true) ||
                error.cause.orEmpty().contains("PostgreSQL"),
        )
    }

    @Test
    fun `login sin password retorna AUTH_PASSWORD_REQUIRED`() = runTest {
        val result = repository.login("admin@donnicolas.com", "")
        assertTrue(result is AuthResult.Error)
        assertEquals("AUTH_PASSWORD_REQUIRED", (result as AuthResult.Error).error.code)
        verify(authApi, never()).login(any())
    }

    @Test
    fun `isLoggedIn delega en TokenStore`() {
        whenever(tokenStore.isLoggedIn()).thenReturn(true)
        assertTrue(repository.isLoggedIn())

        whenever(tokenStore.isLoggedIn()).thenReturn(false)
        assertFalse(repository.isLoggedIn())
    }

    @Test
    fun `logout limpia el token`() {
        repository.logout()
        verify(tokenStore).clear()
    }

    @Test
    fun `401 fuera del login se reporta como sesion expirada y no como credenciales`() = runTest {
        whenever(tokenStore.isLoggedIn()).thenReturn(true)
        whenever(authApi.me()).thenThrow(
            HttpException(Response.error<Any>(401, "".toResponseBody("application/json".toMediaType()))),
        )

        val result = repository.currentUser()

        assertTrue(result is AuthResult.Error)
        val error = (result as AuthResult.Error).error
        assertEquals("AUTH_SESSION_EXPIRED", error.code)
        assertEquals("Sesión expirada", error.title)
        // No debe sugerir credenciales de desarrollo en un dispositivo de planta.
        assertFalse(error.detail.contains("admin123"))
        verify(tokenStore).clear()
    }

    @Test
    fun `currentUser sin sesion retorna AUTH_NO_SESSION`() = runTest {
        whenever(tokenStore.isLoggedIn()).thenReturn(false)

        val result = repository.currentUser()

        assertTrue(result is AuthResult.Error)
        assertEquals("AUTH_NO_SESSION", (result as AuthResult.Error).error.code)
    }
}
