package com.donnicolas.rfid.data.model

data class User(
    val id: String,
    val email: String,
    val nombre: String,
    val rol: String,
)

sealed class AuthResult {
    data class Success(val user: User) : AuthResult()
    data class Error(val message: String) : AuthResult()
}
