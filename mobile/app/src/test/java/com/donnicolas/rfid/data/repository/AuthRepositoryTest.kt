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

class AuthRepositoryTest {
    private lateinit var authApi: AuthApi
    private lateinit var tokenStore: TokenStore
    private lateinit var repository: AuthRepository

    @Before
    fun setup() {
        authApi = mock()
        tokenStore = mock()
        repository = AuthRepository(authApi, tokenStore)
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
    fun `login con credenciales invalidas limpia token`() = runTest {
        val body = """{"detail":"Credenciales inválidas"}"""
            .toResponseBody("application/json".toMediaType())
        whenever(authApi.login(any())).thenThrow(
            HttpException(Response.error<Any>(401, body)),
        )

        val result = repository.login("admin@donnicolas.com", "wrong")

        assertTrue(result is AuthResult.Error)
        assertEquals("Credenciales inválidas", (result as AuthResult.Error).message)
        verify(tokenStore).clear()
        verify(tokenStore, never()).saveToken(any())
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
    fun `currentUser sin sesion retorna error`() = runTest {
        whenever(tokenStore.isLoggedIn()).thenReturn(false)

        val result = repository.currentUser()

        assertTrue(result is AuthResult.Error)
        assertEquals("Sesión no iniciada", (result as AuthResult.Error).message)
    }
}
