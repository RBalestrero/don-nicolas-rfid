package com.donnicolas.rfid.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.donnicolas.rfid.data.model.AppError
import com.donnicolas.rfid.data.model.AuthResult
import com.donnicolas.rfid.data.model.User
import com.donnicolas.rfid.data.repository.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
    val email: String = "admin@donnicolas.com",
    val password: String = "",
    val loading: Boolean = false,
    val error: AppError? = null,
    val user: User? = null,
)

class LoginViewModel(
    private val authRepository: AuthRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(LoginUiState())
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    init {
        if (authRepository.isLoggedIn()) {
            restoreSession()
        }
    }

    fun onEmailChange(value: String) {
        _state.update { it.copy(email = value, error = null) }
    }

    fun onPasswordChange(value: String) {
        _state.update { it.copy(password = value, error = null) }
    }

    fun login() {
        val current = _state.value
        if (current.email.isBlank() && current.password.isBlank()) {
            _state.update {
                it.copy(
                    error = AppError(
                        code = "AUTH_FIELDS_REQUIRED",
                        title = "Campos requeridos",
                        detail = "Email y contraseña están vacíos. Completá ambos campos para iniciar sesión.",
                    ),
                )
            }
            return
        }

        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            when (val result = authRepository.login(current.email, current.password)) {
                is AuthResult.Success -> {
                    _state.update { it.copy(loading = false, user = result.user, error = null) }
                }
                is AuthResult.Error -> {
                    _state.update { it.copy(loading = false, error = result.error) }
                }
            }
        }
    }

    fun logout() {
        authRepository.logout()
        _state.update { LoginUiState(email = it.email) }
    }

    private fun restoreSession() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            when (val result = authRepository.currentUser()) {
                is AuthResult.Success -> {
                    _state.update { it.copy(loading = false, user = result.user) }
                }
                is AuthResult.Error -> {
                    authRepository.logout()
                    _state.update {
                        it.copy(
                            loading = false,
                            user = null,
                            error = result.error.copy(
                                title = "No se pudo restaurar la sesión",
                                detail = "Había un token guardado pero falló la validación. ${result.error.detail}",
                            ),
                        )
                    }
                }
            }
        }
    }

    class Factory(
        private val authRepository: AuthRepository,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return LoginViewModel(authRepository) as T
        }
    }
}
