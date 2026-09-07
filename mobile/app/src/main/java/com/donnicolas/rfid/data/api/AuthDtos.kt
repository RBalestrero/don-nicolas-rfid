package com.donnicolas.rfid.data.api

import com.squareup.moshi.Json

data class LoginRequestDto(
    val email: String,
    val password: String,
)

data class TokenResponseDto(
    @Json(name = "access_token") val accessToken: String,
    @Json(name = "token_type") val tokenType: String = "bearer",
)

data class UserResponseDto(
    val id: String,
    val email: String,
    val nombre: String,
    val rol: String,
)
