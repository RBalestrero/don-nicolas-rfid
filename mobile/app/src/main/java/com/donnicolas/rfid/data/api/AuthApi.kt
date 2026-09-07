package com.donnicolas.rfid.data.api

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

interface AuthApi {
    @POST("auth/login")
    suspend fun login(@Body body: LoginRequestDto): TokenResponseDto

    @GET("auth/me")
    suspend fun me(): UserResponseDto
}
