package com.donnicolas.rfid.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.donnicolas.rfid.data.local.ApiHostStore
import com.donnicolas.rfid.data.local.SessionEvents
import com.donnicolas.rfid.data.model.AppError
import com.donnicolas.rfid.data.model.AuthResult
import com.donnicolas.rfid.data.model.User
import com.donnicolas.rfid.data.repository.AuthRepository
import com.donnicolas.rfid.device.DevicePresenceReporter
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
    val email: String = "admin@donnicolas.com",
    val password: String = "",
    val apiHost: String = "",
    val loading: Boolean = false,
    val error: AppError? = null,
    val user: User? = null,
)

class LoginViewModel(
    private val authRepository: AuthRepository,
    private val sessionEvents: SessionEvents,
    private val apiHostStore: ApiHostStore,
    private val devicePresenceReporter: DevicePresenceReporter,
) : ViewModel() {
    private val _state = MutableStateFlow(LoginUiState(apiHost = apiHostStore.getHost()))
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    init {
        if (authRepository.isLoggedIn()) {
            restoreSession()
        }
        observeSessionExpiry()
    }

    private fun observeSessionExpiry() {
        viewModelScope.launch {
            sessionEvents.expired.collect {
                if (_state.value.user == null) return@collect
                // Token ya inválido: no insistir en logout remoto; marcar offline por timeout.
                runCatching { devicePresenceReporter.stop(notifyLogout = false) }
                authRepository.logout()
                _state.update {
                    it.copy(
                        loading = false,
                        user = null,
                        password = "",
                        error = AppError(
                            code = "AUTH_SESSION_EXPIRED",
                            title = "Sesión expirada",
                            detail = "Volvé a iniciar sesión para continuar.",
                        ),
                    )
                }
            }
        }
    }

    fun onEmailChange(value: String) {
        _state.update { it.copy(email = value, error = null) }
    }

    fun onPasswordChange(value: String) {
        _state.update { it.copy(password = value, error = null) }
    }

    fun onApiHostChange(value: String) {
        _state.update { it.copy(apiHost = value, error = null) }
    }

    fun login() {
        val current = _state.value
        apiHostStore.setHost(current.apiHost)
        if (current.email.isBlank() && current.password.isBlank()) {
            _state.update {
                it.copy(
                    error = AppError(
                        code = "AUTH_FIELDS_REQUIRED",
                        title = "Faltan datos",
                        detail = "Completá email y contraseña para ingresar.",
                    ),
                )
            }
            return
        }

        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            when (val result = authRepository.login(current.email, current.password)) {
                is AuthResult.Success -> {
                    devicePresenceReporter.start()
                    _state.update { it.copy(loading = false, user = result.user, error = null) }
                }
                is AuthResult.Error -> {
                    _state.update { it.copy(loading = false, error = result.error) }
                }
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            // Primero avisar a la API (con token), después borrar sesión local.
            runCatching { devicePresenceReporter.stop(notifyLogout = true) }
            authRepository.logout()
            _state.update { LoginUiState(email = it.email, apiHost = apiHostStore.getHost()) }
        }
    }

    private fun restoreSession() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            when (val result = authRepository.currentUser()) {
                is AuthResult.Success -> {
                    devicePresenceReporter.start()
                    _state.update { it.copy(loading = false, user = result.user) }
                }
                is AuthResult.Error -> {
                    runCatching { devicePresenceReporter.stop(notifyLogout = false) }
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
        private val sessionEvents: SessionEvents,
        private val apiHostStore: ApiHostStore,
        private val devicePresenceReporter: DevicePresenceReporter,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return LoginViewModel(
                authRepository,
                sessionEvents,
                apiHostStore,
                devicePresenceReporter,
            ) as T
        }
    }
}
